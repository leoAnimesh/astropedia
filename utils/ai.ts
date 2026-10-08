import { Platform } from 'react-native';
import type { Profile } from './database';
import { getAstrologyContext, getFullKundli, getTimingContext } from './astrology';
import {
  runLocalLLM, ensureLocalLLM, isLLMReady, MODEL_LANGUAGES, CONTEXT_VERSION, REPLY_MAX_TOKENS, CONTEXT_WINDOW,
  MODEL_FOLLOWUPS, type ChatMessage, type RunOptions,
} from './local-llm';
import { generateFollowUps, FOLLOWUPS_MAX_TOKENS, type FollowUpMessage } from './follow-ups';
import i18n, { getAppLanguage } from './i18n';
import {
  cannedQuestion, createSentenceFilter, isPureGreeting, isTimingQuestion, missingAdvice, readingScriptRatio,
  readingSeed, runGuarded, stripCountdowns, NATIVE_SCRIPT_MIN, RETRY_TEMPERATURE, type ReplyGuard,
} from './reply-guards';
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

type StreamOptions = {
  /** Text appended after the reply: fixed, or computed from the finished reply ('' for none). */
  suffix?: string | ((reply: string) => string);
  guard?: ReplyGuard | null;
  /**
   * Rewrites the reply one sentence at a time before it is shown
   * (createSentenceFilter), so removed text never flashes on screen.
   */
  sentenceTransform?: (text: string) => string;
};

/** Bridge the model's token callback to an async iterator for the UI. */
async function* streamLocal(
  messages: ChatMessage[],
  maxNewTokens: number,
  { suffix, guard, sentenceTransform }: StreamOptions = {},
): AsyncGenerator<string> {
  const queue: string[] = [];
  let wakeup:   (() => void) | null = null;
  let finished = false;
  let failure: unknown = null;
  let reply = '';

  const push = (token: string) => {
    if (!token) return;
    reply += token;
    queue.push(token);
    wakeup?.();
    wakeup = null;
  };
  const filter = sentenceTransform ? createSentenceFilter(sentenceTransform, push) : null;
  const emit = filter ? (token: string) => filter.push(token) : push;
  const run = guard
    ? runGuarded((onToken, temperature) => runLocalLLM(messages, onToken,
        temperature == null ? { maxNewTokens } : { maxNewTokens, temperature }), guard, emit)
    : runLocalLLM(messages, emit, { maxNewTokens });
  const done = run.catch((err) => { failure = err; }).finally(() => {
    filter?.flush();
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
  const tail = typeof suffix === 'function' ? (reply.trim() ? suffix(reply) : '') : suffix;
  if (tail) yield tail;
}

/** The checks for a chat reply (CONTEXT_VERSION 2 only; see utils/reply-guards.ts runGuarded). */
function replyGuard(
  lang: ReplyLang, names: (string | undefined)[], history: AIMessage[] = [], question?: string,
): ReplyGuard | null {
  if (CONTEXT_VERSION !== 2) return null;
  const previous = [...history].reverse().find(m => m.role === 'assistant')?.content;
  // Saga's "when" questions should get a month or year (Krishna's never do).
  const needsDate = question != null && isTimingQuestion(question);
  if (lang === 'en' && !previous && !needsDate) return null;
  return {
    lang, previous, needsDate, today: needsDate ? todayIso() : undefined,
    ignore: names.flatMap(n => (n ? [n.split(' ')[0]] : [])),
  };
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

  // A bare "hi" / "नमस्ते" / "নমস্কার" gets a short hello that invites a
  // question; v2 answers it with a chart dump (or introduces itself as the user).
  if (CONTEXT_VERSION === 2 && mode === 'saga' && isPureGreeting(req.userMessage)) {
    const greeting = req.profile.isYou
      ? i18n.t('chat:greeting.self', { lng: lang })
      : i18n.t('chat:greeting.other', { lng: lang, name: req.profile.name.split(' ')[0] });
    return { stream: yieldOnce(greeting), tier: 'deterministic' };
  }

  // Baby's-sex and partner-name questions get a fixed, gentle decline: v2.1
  // answered "likely to be a boy", and no chart shows a name.
  const canned = CONTEXT_VERSION === 2 && mode === 'saga' ? cannedQuestion(req.userMessage) : null;
  if (canned) {
    return { stream: yieldOnce(i18n.t(`chat:safety.${canned}`, { lng: lang })), tier: 'deterministic' };
  }

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
    const guard = replyGuard(lang, [req.userName]);
    return {
      stream: streamLocal(messages, REPLY_MAX_TOKENS, { suffix: `\n\n${formatGitaQuote(verse, lang)}`, guard }),
      tier: 'executorch',
    };
  }

  const system = sagaSystem(req.profile, lang);
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...sagaHistory(system, req.history, req.userMessage),
    { role: 'user', content: req.userMessage },
  ];
  const guard = replyGuard(lang, [req.profile.name, req.userName], req.history, req.userMessage);
  if (CONTEXT_VERSION !== 2) {
    return { stream: streamLocal(messages, REPLY_MAX_TOKENS, { guard }), tier: 'executorch' };
  }
  // v2.1's "about N months from now" countdowns are wrong almost every time:
  // they are cut sentence by sentence before display. Health and legal
  // answers without a doctor / lawyer mention get a one-line pointer.
  const question = req.userMessage;
  return {
    stream: streamLocal(messages, REPLY_MAX_TOKENS, {
      guard,
      sentenceTransform: stripCountdowns,
      suffix: (reply) => missingAdvice(question, reply)
        .map(kind => `\n\n${i18n.t(`chat:safety.${kind}`, { lng: lang })}`).join(''),
    }),
    tier: 'executorch',
  };
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
  _profile: Profile | null,
  history: AIMessage[],
  lastAnswer: string,
  lang: ReplyLang,
  { isCancelled }: { isCancelled?: () => boolean } = {},
): Promise<string[]> {
  const enabled = MODEL_FOLLOWUPS && Platform.OS !== 'web' && isLLMReady();
  try {
    return await generateFollowUps(
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
  } catch {
    return [];
  }
}
