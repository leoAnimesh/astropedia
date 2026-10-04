import { Platform } from 'react-native';
import type { Profile } from './database';
import { getAstrologyContext, getFullKundli, getTimingContext } from './astrology';
import {
  runLocalLLM, ensureLocalLLM, MODEL_LANGUAGES, CONTEXT_VERSION, REPLY_MAX_TOKENS, CONTEXT_WINDOW, type ChatMessage,
} from './local-llm';
import { getAppLanguage } from './i18n';
import { classifyDeterministic, deterministicAnswer } from './deterministic';
import { pickGitaVerse, formatGitaQuote } from './gita';
import { todayIso } from './format';

/*
 * The on-device model (SmolLM2-135M fine-tuned in ml/) was trained on short
 * task-tagged prompts: "[saga]", "[krishna]", "[reading]", "[title]" plus the
 * facts for the request. The voice and rules that used to live in long system
 * prompts are in its weights. These formats must stay identical to the
 * student_* functions in ml/data/build_sft.py.
 */

export type AIMessage = { role: 'user' | 'assistant'; content: string };
export type ModelTier = 'executorch' | 'groq' | 'claude' | 'deterministic' | 'cached' | 'pending';
export type AIMode    = 'saga' | 'krishna';

// If the model hasn't loaded yet, the chat path waits at most this long.
const LOCAL_LLM_WAIT_MS = 15_000;

// Shown only if the bundled model fails to load. Quick factual questions
// (sun sign, moon sign, life phase, moon phase) still work without it.
const OFFLINE_REPLY =
  "Saga couldn't start the on-device reader just now. You can still ask quick questions like your sun sign, moon sign, current life phase, or today's moon phase, and I'll answer instantly. Try again in a moment for a deeper reading.";

// Saga chats carry the last couple of turns; the model was trained on up to two.
const SAGA_HISTORY_MESSAGES = 4;
// Tokens kept free besides the reply: chat-template markers and estimate error.
const PROMPT_MARGIN_TOKENS = 96;

/**
 * Rough Gemma-tokenizer count, erring high: 3.5 characters per token for
 * Latin text, 3 for Devanagari/Bengali, plus 4 for the turn markers. Checked
 * against the shipped tokenizer: chart contexts ~1.0x, en/hi/bn chat turns
 * 1.1-1.4x the real count (rare short Bengali turns ~0.9x; the margin covers it).
 */
export function estimateTokens(text: string): number {
  const indic = (text.match(/[\u0900-\u09FF]/g) ?? []).length;
  return Math.ceil(indic / 3 + (text.length - indic) / 3.5) + 4;
}

/**
 * The prior turns to send with a Saga question. v1 keeps the last
 * SAGA_HISTORY_MESSAGES as before. v2 keeps at most as many, newest first,
 * while system prompt + history + question + REPLY_MAX_TOKENS fit in
 * CONTEXT_WINDOW (less a margin), and always starts on a user turn (Gemma's
 * turns must alternate from the user).
 */
export function sagaHistory(system: string, history: AIMessage[], userMessage: string): AIMessage[] {
  const recent = history.slice(-SAGA_HISTORY_MESSAGES);
  if (CONTEXT_VERSION === 1) return recent;
  let budget = CONTEXT_WINDOW - PROMPT_MARGIN_TOKENS - REPLY_MAX_TOKENS
    - estimateTokens(system) - estimateTokens(userMessage);
  let start = recent.length;
  while (start > 0) {
    const cost = estimateTokens(recent[start - 1].content);
    if (cost > budget) break;
    budget -= cost;
    start--;
  }
  while (start < recent.length && recent[start].role !== 'user') start++;
  return recent.slice(start);
}

export type AIRequest = {
  profile:     Profile;
  history:     AIMessage[];
  userMessage: string;
  mode?:       AIMode;
  userName?:   string;
};

export type AIStreamResult = {
  stream: AsyncGenerator<string>;
  tier:   ModelTier;
};

// ─── Reply language ───────────────────────────────────────────────────────────

type ReplyLang = 'en' | 'hi' | 'bn';

/**
 * The language the model should answer in: the app language, unless the user
 * wrote in Devanagari or Bengali script. Falls back to English when the
 * bundled model doesn't speak that language.
 */
export function replyLanguage(userText = ''): ReplyLang {
  const typed: ReplyLang | null =
    /[\u0980-\u09FF]/.test(userText) ? 'bn' :
    /[\u0900-\u0963\u0966-\u097F]/.test(userText) ? 'hi' : null;
  const lang = typed ?? getAppLanguage();
  return MODEL_LANGUAGES.includes(lang) ? lang : 'en';
}

/** "" for English, "\nLang: hi" / "\nLang: bn" otherwise (ml/data/build_sft.py lang_line). */
const langLine = (lang: ReplyLang) => (lang === 'en' ? '' : `\nLang: ${lang}`);

function sagaSystem(profile: Profile, lang: ReplyLang): string {
  const context = getAstrologyContext({
    name:      profile.name,
    gender:    profile.gender,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? undefined,
    birthCity: profile.birthCity ?? undefined,
    birthLat:  profile.birthLat,
    birthLng:  profile.birthLng,
    birthTz:   profile.birthTz,
    relationship: profile.relationship,
    isYou:     profile.isYou,
  }, { version: CONTEXT_VERSION });
  const timeNote = profile.birthTime ? '' : '\nBirth time unknown.';
  const timing = getTimingContext(profile, new Date(), CONTEXT_VERSION);
  return `[saga]${langLine(lang)}\nToday: ${todayIso()}\n${context}${timeNote}\n${timing}`;
}

function krishnaSystem(userName: string | undefined, versePrompt: string, lang: ReplyLang): string {
  const name = userName ? `\nName: ${userName.split(' ')[0]}` : '';
  return `[krishna]${langLine(lang)}${name}\nVerse: ${versePrompt}`;
}

function readingSystem(profile: Profile, lang: ReplyLang): string {
  const k = getFullKundli({
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? undefined,
    birthLat:  profile.birthLat,
    birthLng:  profile.birthLng,
    birthTz:   profile.birthTz,
  });
  const { sun, moon, rising } = k.bigThree;
  const lines = [
    `Name: ${profile.name.split(' ')[0]}`,
    `Sun: ${sun?.name ?? 'None'}`,
    `Moon: ${moon?.name ?? 'None'}`,
    ...(rising ? [`Rising: ${rising.name}`] : []),
    `Nakshatra: ${k.nakshatra.name} (lord ${k.nakshatra.lord})`,
    `Phase: ${k.dasha.lord} until ${k.dasha.endDate}`,
  ];
  return `[reading]${langLine(lang)}\n${lines.join('\n')}`;
}

/** Bridge the model's token callback to an async iterator for the UI. */
async function* streamLocal(
  messages: ChatMessage[],
  maxNewTokens: number,
  suffix?: string,
): AsyncGenerator<string> {
  const queue: string[] = [];
  let wakeup:   (() => void) | null = null;
  let finished = false;
  let failure: unknown = null;

  const done = runLocalLLM(messages, (token) => {
    queue.push(token);
    wakeup?.();
    wakeup = null;
  }, { maxNewTokens }).catch((err) => { failure = err; }).finally(() => {
    finished = true;
    wakeup?.();
  });

  let idx = 0;
  while (!finished || idx < queue.length) {
    if (idx < queue.length) {
      yield queue[idx++];
    } else {
      await new Promise<void>(r => { wakeup = r; });
    }
  }
  await done;
  if (failure) throw failure;
  if (suffix) yield suffix;
}

/**
 * Remove <think>...</think> reasoning blocks that thinking-mode models
 * (Qwen 3) emit before the actual reply. Also handles orphan opening or
 * closing tags — small models sometimes emit a lone "</think>" without ever
 * opening one, or vice versa.
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')   // paired
    .replace(/<think>[\s\S]*$/g, '')             // unclosed open (drop everything after)
    .replace(/^[\s\S]*?<\/think>/, '')           // orphan close at start
    .replace(/<\/?think>/g, '')                  // any leftover tags
    .trim();
}

/**
 * Defensive post-processing for chat replies — strips astrology jargon and
 * raw dates that small on-device models leak even when explicitly banned in
 * the system prompt. Replaces Sanskrit period names with plain English and
 * collapses ISO-format dates to just the year.
 *
 * Examples:
 *   "during the Mahadasha of Jupiter" → "during the Jupiter phase"
 *   "your current Mahadasha (Saturn)" → "your current Saturn phase"
 *   "by 2031-08-12"                   → "by 2031"
 */
/**
 * Trim runaway sentence-level repetition that small LLMs fall into when their
 * generation lacks a repetition penalty. We split the reply into sentences
 * and stop the moment we see one we've already shown (case-insensitive).
 *
 * Conservative — only kicks in when there's a near-verbatim duplicate; the
 * model is free to re-use short connectors ("but", "still") without penalty.
 */
export function dedupeRepetition(text: string): string {
  // Split into sentences and newline-bearing separators, so line breaks and
  // paragraphs (and "SUN: ..." style lines) survive the rejoin.
  // । and ॥ end sentences in Hindi and Bengali.
  const parts = text.split(/((?<=[.!?।॥])[ \t]+|\n+)/);
  if (parts.filter((p, i) => i % 2 === 0 && p.trim()).length < 4) return text;

  const seen = new Set<string>();
  let result = '';
  let pendingSep = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      // Keep the strongest separator seen since the last sentence.
      const sep = parts[i];
      if (sep.includes('\n')) pendingSep = sep.length > pendingSep.length || !pendingSep.includes('\n') ? sep : pendingSep;
      else if (!pendingSep) pendingSep = ' ';
      continue;
    }
    const trimmed = parts[i].trim();
    if (trimmed.length === 0) continue;
    // Keep Devanagari and Bengali letters too, or Hindi/Bengali sentences
    // normalise to almost nothing and loops slip through.
    const norm = trimmed.toLowerCase().replace(/[^a-z0-9\u0900-\u0963\u0966-\u097F\u0980-\u09FF ]/g, '').replace(/\s+/g, ' ').trim();
    // Don't dedupe very short sentences ("Right.", "Yes.") — too false-positive prone.
    if (norm.length >= 15) {
      // Loop detected — stop accumulating, drop everything from here.
      if (seen.has(norm)) break;
      seen.add(norm);
    }
    result += (result ? pendingSep || ' ' : '') + trimmed;
    pendingSep = '';
  }
  return result.trim();
}

/**
 * Strip structural artifacts small models leak from prompt scaffolding —
 * "Part 1 — your voice", duplicated "— From the Gita:" prefixes, etc.
 * Applied to every chat reply; harmless for replies that don't contain them.
 */
export function stripChatArtifacts(text: string): string {
  return text
    // Drop word-count notes the model picked up from its teacher ("(24 words)")
    .replace(/[ \t]*\(\d+\s*words?\)/gi, '')
    // Drop "Part 1 — heading text" style labels (with em-dash, en-dash, hyphen, or colon)
    .replace(/^[ \t]*Part\s+\d+\s*[—\-–:][^\n]*\n?/gim, '')
    .replace(/Part\s+\d+\s*[—\-–:]\s*(your voice|from the gita)[:.]?\s*/gi, '')
    // Collapse repeated "— From the Gita:" prefixes into a single, normalized one
    .replace(/(?:[—\-–]\s*From\s+the\s+Gita\s*[:\s]+){2,}/gi, '— From the Gita:\n')
    // Normalize a single occurrence so it always sits on its own line
    .replace(/[—\-–]\s*From\s+the\s+Gita\s*:\s*/gi, '\n— From the Gita:\n')
    // Clean the artifacts of all of the above
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\n+/, '')
    .trim();
}

export function stripJargon(text: string): string {
  return text
    // "(<planet>) Mahadasha" / "Mahadasha of <planet>" → "<planet> phase"
    .replace(/\bMahadasha\s+of\s+([A-Z][a-z]+)\b/g, '$1 phase')
    .replace(/\b([A-Z][a-z]+)['']?s?\s+Mahadasha\b/g, '$1 phase')
    .replace(/\(\s*Mahadasha\s+([A-Z][a-z]+)\s*\)/g, '($1 phase)')
    .replace(/\(\s*([A-Z][a-z]+)\s+Mahadasha\s*\)/g, '($1 phase)')
    .replace(/\bMahadasha\b/g, 'life phase')
    .replace(/\bantardasha\b/gi, 'sub-period')
    .replace(/\b(maha\s*)?dasha\b/gi, 'phase')
    // Lone Sanskrit terms that don't have a clean replacement → drop them
    .replace(/\b(nakshatra|rashi|lagna|kundli|janma\s+star)\b/gi, '')
    // Collapse raw ISO dates (YYYY-MM-DD) to the year alone
    .replace(/\b(\d{4})-\d{2}-\d{2}\b/g, '$1')
    // Clean up artifacts. IMPORTANT: only collapse horizontal whitespace
    // (spaces, tabs) — never newlines. Markdown paragraphs depend on \n\n.
    .replace(/[ \t]+([,.;:])/g, '$1')
    .replace(/\([ \t]+/g, '(')
    .replace(/[ \t]+\)/g, ')')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strip markdown formatting that small/medium LLMs leak even when prompted
 * with "no markdown" rules. Defensive post-processing — never trust the model.
 * Exported so `useChat` can clean the final assembled chat reply (the live
 * token stream is left untouched so the UI still feels typed-out).
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')         // **bold**
    .replace(/__([^_\n]+)__/g, '$1')              // __bold__
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1') // *italic*
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')     // _italic_
    .replace(/^#{1,6}\s+/gm, '')                  // ## headers
    .replace(/^[-*+]\s+/gm, '')                   // - bullets
    .replace(/^\d+\.\s+/gm, '')                   // 1. ordered list
    .replace(/`([^`\n]+)`/g, '$1')                // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')      // [text](url)
    .replace(/\n{3,}/g, '\n\n')                   // collapse extra blank lines
    .trim();
}

// ─── Stream helpers ───────────────────────────────────────────────────────────

async function* yieldOnce(text: string): AsyncGenerator<string> {
  yield text;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function streamAI(req: AIRequest): Promise<AIStreamResult> {
  const mode = req.mode ?? 'saga';
  const lang = replyLanguage(req.userMessage);

  // L0 — deterministic answers (rashi, nakshatra, dasha, lunar phase, etc.).
  // Krishna mode is always conversational, so it skips the classifier. The
  // templates are English, so other languages go to the model.
  if (mode === 'saga' && lang === 'en') {
    const topic = classifyDeterministic(req.userMessage);
    if (topic) {
      const answer = deterministicAnswer(topic, req.profile);
      if (answer) {
        return { stream: yieldOnce(answer), tier: 'deterministic' };
      }
    }
  }

  if (Platform.OS === 'web' || !(await ensureLocalLLM(LOCAL_LLM_WAIT_MS))) {
    return { stream: yieldOnce(OFFLINE_REPLY), tier: 'pending' };
  }

  if (mode === 'krishna') {
    // The app chooses the verse; the model writes only Krishna's words and
    // the verse is printed underneath, so scripture is never misquoted.
    const verse = pickGitaVerse(req.userMessage);
    const messages: ChatMessage[] = [
      { role: 'system', content: krishnaSystem(req.userName, verse.prompt, lang) },
      { role: 'user',   content: req.userMessage },
    ];
    return { stream: streamLocal(messages, REPLY_MAX_TOKENS, `\n\n${formatGitaQuote(verse, lang)}`), tier: 'executorch' };
  }

  const system = sagaSystem(req.profile, lang);
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...sagaHistory(system, req.history, req.userMessage),
    { role: 'user', content: req.userMessage },
  ];
  return { stream: streamLocal(messages, REPLY_MAX_TOKENS), tier: 'executorch' };
}

export async function askAI(req: AIRequest): Promise<{ text: string; tier: ModelTier }> {
  const { stream, tier } = await streamAI(req);
  let text = '';
  for await (const token of stream) {
    text += token;
  }
  return { text: text.trim(), tier };
}

async function collect(messages: ChatMessage[], maxNewTokens: number): Promise<string> {
  let text = '';
  for await (const token of streamLocal(messages, maxNewTokens)) text += token;
  return text.trim();
}

/**
 * Personality reading for the chart card, in the "SUN: …\nMOON: …" line
 * format that use-chart-reading parses. Returns null if the model isn't
 * available.
 */
export async function askChartReading(profile: Profile): Promise<string | null> {
  if (!(await ensureLocalLLM(LOCAL_LLM_WAIT_MS))) return null;
  return collect([
    { role: 'system', content: readingSystem(profile, replyLanguage()) },
    { role: 'user',   content: 'Read my chart.' },
  ], 300);
}

/** A 2–4 word title for a chat thread, from its first exchange. */
export async function askThreadTitle(userMessage: string, aiReply: string): Promise<string | null> {
  if (!(await ensureLocalLLM(LOCAL_LLM_WAIT_MS))) return null;
  return collect([
    { role: 'system', content: `[title]${langLine(replyLanguage(userMessage + aiReply))}` },
    { role: 'user',   content: `User: ${userMessage}\nAssistant: ${aiReply}` },
  ], 16);
}
