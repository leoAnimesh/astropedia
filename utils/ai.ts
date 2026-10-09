import { Platform } from 'react-native';
import type { Profile } from './database';
import { getFullKundli } from './astrology';
import {
  runLocalLLM, ensureLocalLLM, isLLMReady, MODEL_LANGUAGES, CONTEXT_VERSION, CONTEXT_WINDOW,
  MODEL_FOLLOWUPS, type ChatMessage, type RunOptions,
} from './local-llm';
import { generateFollowUps, FOLLOWUPS_MAX_TOKENS, type FollowUpMessage } from './follow-ups';
import { getAppLanguage } from './i18n';
import { findDates, readingScriptRatio, readingSeed, NATIVE_SCRIPT_MIN, RETRY_TEMPERATURE } from './reply-guards';
import type { AgentId } from '../constants/gurus';
import { runPipeline, planChipWindows } from './agent/pipeline';
import { langLine } from './agent/adapters/gemma21-prompt';
import { estimateTokens, sagaHistory, PROMPT_MARGIN_TOKENS } from './agent/adapters/gemma21';
import { dateInWindows } from './timing-engine';

// The prompt-budget helpers moved to the Gemma adapter; kept exported here for callers.
export { estimateTokens, sagaHistory };

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

export type AIRequest = {
  profile:     Profile;
  history:     AIMessage[];
  userMessage: string;
  mode?:       AIMode;
  userName?:   string;
  /**
   * Guru of the chat (constants/gurus.ts). Chart gurus all run the [saga]
   * task; the agent picks the app-side rules (crisis guard, focused context
   * when GURU_CONTEXT_FOCUS is on). Defaults to the mode's own agent.
   */
  agent?:      AgentId;
  /** All of the user's profiles, so "when will my sister marry" can read hers. */
  people?:     Profile[];
};

export type AIStreamResult = {
  stream: AsyncGenerator<string>;
  tier:   ModelTier;
};

// ─── Reply language ───────────────────────────────────────────────────────────

export type ReplyLang = 'en' | 'hi' | 'bn';

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * A chat reply as a token stream. All the work happens in the answer
 * pipeline (utils/agent/pipeline.ts): intent → plan (timing engine) →
 * adapter (model or templates) → verify. `tier` says what answered.
 */
export async function streamAI(req: AIRequest): Promise<AIStreamResult> {
  const mode = req.mode ?? 'saga';
  const { stream, tier } = await runPipeline({
    profile: req.profile,
    people: req.people,
    history: req.history,
    question: req.userMessage,
    lang: replyLanguage(req.userMessage),
    mode,
    agent: req.agent ?? mode,
    userName: req.userName,
    waitMs: LOCAL_LLM_WAIT_MS,
    offlineReply: OFFLINE_REPLY,
  });
  return { stream, tier };
}

export async function askAI(req: AIRequest): Promise<{ text: string; tier: ModelTier }> {
  const { stream, tier } = await streamAI(req);
  let text = '';
  for await (const token of stream) {
    text += token;
  }
  return { text: text.trim(), tier };
}

async function collect(messages: ChatMessage[], maxNewTokens: number, options: RunOptions = {}): Promise<string> {
  let text = '';
  await runLocalLLM(messages, (token) => { text += token; }, { maxNewTokens, ...options });
  return text.trim();
}

export type ChartReadingResult = {
  /** null: hi/bn failed and `skipEnglishFallback` was set (use a cached English reading). */
  text: string | null;
  /** Language the text is in: the requested one, or 'en' if hi/bn failed twice. */
  lang: ReplyLang;
};

/**
 * Personality reading for the chart card, in the "SUN: …\nMOON: …" line
 * format that use-chart-reading parses. Returns null if the model isn't
 * available.
 *
 * With CONTEXT_VERSION 2, hi/bn readings are checked for script: the first
 * attempt is unseeded (v2.1 writes hi/bn readings in the right script), a
 * reading mostly in Latin script is retried once with a native seed
 * (readingSeed), and if that fails too the reading is generated in English
 * (lang 'en' in the result).
 * `skipEnglishFallback` returns text null instead of generating that English
 * reading (the caller has one cached).
 */
export async function askChartReading(
  profile: Profile,
  lang: ReplyLang = replyLanguage(),
  { skipEnglishFallback = false } = {},
): Promise<ChartReadingResult | null> {
  if (!(await ensureLocalLLM(LOCAL_LLM_WAIT_MS))) return null;
  const read = async (l: ReplyLang, replyPrefix = '', temperature?: number) => {
    const messages: ChatMessage[] = [
      { role: 'system', content: readingSystem(profile, l) },
      { role: 'user',   content: 'Read my chart.' },
    ];
    const opts: RunOptions = temperature == null ? { replyPrefix } : { replyPrefix, temperature };
    return replyPrefix + (await collect(messages, 300, opts));
  };
  if (CONTEXT_VERSION !== 2 || lang === 'en') return { text: (await read(lang)).trim(), lang };

  const firstName = profile.name.split(' ')[0];
  // In the right script, and more than a seed the model stopped right after.
  const ok = (t: string) => t.replace(/\s/g, '').length >= 60 && readingScriptRatio(t, lang, firstName) >= NATIVE_SCRIPT_MIN;
  for (const attempt of [0, 1] as const) {
    const text = (await read(lang, readingSeed(lang, attempt), attempt ? RETRY_TEMPERATURE : undefined)).trim();
    if (ok(text)) return { text, lang };
  }
  if (skipEnglishFallback) return { text: null, lang: 'en' };
  return { text: (await read('en')).trim(), lang: 'en' };
}

/** A 2–4 word title for a chat thread, from its first exchange. */
export async function askThreadTitle(userMessage: string, aiReply: string): Promise<string | null> {
  if (!(await ensureLocalLLM(LOCAL_LLM_WAIT_MS))) return null;
  return collect([
    { role: 'system', content: `[title]${langLine(replyLanguage(userMessage + aiReply))}` },
    { role: 'user',   content: `User: ${userMessage}\nAssistant: ${aiReply}` },
  ], 16);
}

/**
 * Up to 3 model-written follow-up chips for Saga's reply `lastAnswer` (the
 * v2.1 "[followups]" task; utils/follow-ups.ts generateFollowUps). `history`
 * is the thread before that reply, error bubbles left out, ending with the
 * question it answers; `lang` is the reply's language (replyLanguage(question)),
 * so the chips are in the language of the conversation and are sent as written.
 * The prompt has no chart facts, only the conversation (build_sft.py), so
 * `profile` is not part of it.
 *
 * Returns [] when MODEL_FOLLOWUPS is off, on web, or when the model isn't
 * already loaded (chips never load the model by themselves). Runs in the model
 * queue after anything already queued; `isCancelled` (polled on every token)
 * lets the chat stop it when the user sends a message.
 */
export async function suggestFollowUps(
  profile: Profile | null,
  history: AIMessage[],
  lastAnswer: string,
  lang: ReplyLang,
  { isCancelled }: { isCancelled?: () => boolean } = {},
): Promise<string[]> {
  const enabled = MODEL_FOLLOWUPS && Platform.OS !== 'web' && isLLMReady();
  // Dates in chips must come from the timing engine, like the reply's.
  const question = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
  const windows = profile && question ? planChipWindows(profile, question, history.slice(0, -1), lang) : [];
  const datesOk = (chip: string) => !windows.length || findDates(chip).every(d =>
    d.year == null ? true : dateInWindows({ year: d.year, month: d.month }, windows));
  try {
    const chips = await generateFollowUps(
      async ({ system, user, maxNewTokens, temperature }, onText) => {
        let text = '';
        return runLocalLLM(
          [{ role: 'system', content: system }, { role: 'user', content: user }],
          (token) => { text += token; return onText(text); },
          { maxNewTokens, temperature, isCancelled },
        );
      },
      {
        enabled,
        history: history as FollowUpMessage[],
        lastAnswer,
        lang,
        isCancelled,
        fits: ({ system, user }) =>
          estimateTokens(system) + estimateTokens(user) + FOLLOWUPS_MAX_TOKENS[lang] + PROMPT_MARGIN_TOKENS <= CONTEXT_WINDOW,
      },
    );
    return chips.filter(datesOk);
  } catch {
    return [];
  }
}
