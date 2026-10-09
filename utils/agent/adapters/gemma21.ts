/**
 * Gemma21Adapter: astro-gemma v2 / v2.1 on device (ExecuTorch). Maps an
 * AnswerPlan onto the exact prompts the model was trained on
 * (./gemma21-prompt.ts) and streams the reply through the model-specific
 * guards (utils/reply-guards.ts runGuarded: script, repetition, undated
 * "when" answers) and the countdown strip. Timing is verified by the
 * pipeline (verify.ts), like every adapter's output.
 *
 * Also the small tasks the model was trained on: the chart card reading
 * ([reading], with the hi/bn script check and seeded retry), thread titles
 * ([title]) and follow-up chips ([followups], MODEL_FOLLOWUPS). Everything
 * the model reads is in Western digits (the training format): history and
 * replies shown in hi/bn digits are converted back before prompting.
 */
import { Platform } from 'react-native';
import {
  runLocalLLM, ensureLocalLLM, isLLMReady, MODEL_LANGUAGES, CONTEXT_VERSION, REPLY_MAX_TOKENS, CONTEXT_WINDOW,
  MODEL_FOLLOWUPS, type ChatMessage, type RunOptions,
} from '../../local-llm';
import {
  createSentenceFilter, isTimingQuestion, readingScriptRatio, readingSeed, runGuarded, stripCountdowns, westernDigits,
  NATIVE_SCRIPT_MIN, RETRY_TEMPERATURE, type ReplyGuard,
} from '../../reply-guards';
import { generateFollowUps, FOLLOWUPS_MAX_TOKENS } from '../../follow-ups';
import { pickGitaVerse, formatGitaQuote } from '../../gita';
import { GURU_CONTEXT_FOCUS } from '../../../constants/gurus';
import type { AnswerPlan } from '../plan';
import type { Lang } from '../strings';
import {
  krishnaSystem, readingSystem, sagaChatParts, titlePrompt, isoDay, READING_USER, type ContentPromptMode, type TimingPromptMode,
} from './gemma21-prompt';
import { planGuard } from '../verify';
import type {
  AdapterTask, ChatTurn, FollowUpsRequest, ModelAdapter, ReadingRequest, ReadingResult, RenderRequest, TitleRequest,
} from './types';

/**
 * How a timing question's prompt is shaped. Chosen by the date eval
 * (ml/scripts/timing_eval: 69 timing questions x en/hi/bn, 10 charts, 4
 * "today"s, v2.1 .pte, greedy): first future date inside the engine's best
 * window 21.7% (baseline) → 36.2% (filter) → 62.3% (line-top) → 68.1%
 * (line-bottom); shared transit copies 60.9% → 5.8%. With the verify layer
 * 100% land in an engine window. See ml/data/RUN_V3.md "Saga v2.2: timing windows".
 */
export const TIMING_PROMPT_MODE: TimingPromptMode = 'line-bottom';

/**
 * How a non-timing answer's plan is shaped into the prompt (gemma21-prompt.ts
 * ContentPromptMode), and whether a clarification ("Like I'm asking which
 * domain?") is sent as the plan's standalone question without the earlier
 * turns. Chosen by the answer-type eval (scratchpad agent/at, v2.1 .pte); see
 * the numbers in ml/data/RUN_V3.md "Saga v2.3: answer types".
 */
export const CONTENT_PROMPT_MODE: ContentPromptMode = 'line';
export const CLARIFY_DROPS_HISTORY = false;

// Saga chats carry the last couple of turns; the model was trained on up to two.
const SAGA_HISTORY_MESSAGES = 4;
// Tokens kept free besides the reply: chat-template markers and estimate error.
export const PROMPT_MARGIN_TOKENS = 96;

/**
 * Rough Gemma-tokenizer count, erring high: 3.5 characters per token for
 * Latin text, 3 for Devanagari/Bengali, plus 4 for the turn markers. Checked
 * against the shipped tokenizer: chart contexts ~1.0x, en/hi/bn chat turns
 * 1.1-1.4x the real count (rare short Bengali turns ~0.9x; the margin covers it).
 */
export function estimateTokens(text: string): number {
  const indic = (text.match(/[ऀ-৿]/g) ?? []).length;
  return Math.ceil(indic / 3 + (text.length - indic) / 3.5) + 4;
}

/**
 * The prior turns to send with a Saga question. v1 keeps the last
 * SAGA_HISTORY_MESSAGES as before. v2 keeps at most as many, newest first,
 * while system prompt + history + question + REPLY_MAX_TOKENS fit in
 * CONTEXT_WINDOW (less a margin), and always starts on a user turn (Gemma's
 * turns must alternate from the user).
 */
export function sagaHistory(system: string, history: ChatTurn[], userMessage: string): ChatTurn[] {
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

/** Turns as the model was trained on them: Western digits (hi/bn replies are shown with native ones). */
export const modelTurns = (turns: ChatTurn[]): ChatTurn[] =>
  turns.map(m => ({ role: m.role, content: westernDigits(m.content) }));

async function collect(messages: ChatMessage[], maxNewTokens: number, options: RunOptions = {}): Promise<string> {
  let text = '';
  await runLocalLLM(messages, (token) => { text += token; }, { maxNewTokens, ...options });
  return text.trim();
}

/** Reading length cap (new tokens). */
const READING_MAX_TOKENS = 300;
/** Title length cap (new tokens). */
const TITLE_MAX_TOKENS = 16;

/**
 * Personality reading for the chart card. With CONTEXT_VERSION 2, hi/bn
 * readings are checked for script: the first attempt is unseeded (v2.1
 * writes hi/bn readings in the right script), a reading mostly in Latin
 * script is retried once with a native seed (readingSeed), and if that fails
 * too the reading is generated in English (lang 'en' in the result), or text
 * null with `skipEnglishFallback` (the caller has one cached).
 */
async function gemmaReading({ profile, lang, skipEnglishFallback = false }: ReadingRequest): Promise<ReadingResult> {
  const read = async (l: Lang, replyPrefix = '', temperature?: number) => {
    const messages: ChatMessage[] = [
      { role: 'system', content: readingSystem(profile, l) },
      { role: 'user',   content: READING_USER },
    ];
    const opts: RunOptions = temperature == null ? { replyPrefix } : { replyPrefix, temperature };
    return replyPrefix + (await collect(messages, READING_MAX_TOKENS, opts));
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

async function gemmaTitle({ question, reply, lang }: TitleRequest): Promise<string | null> {
  const { system, user } = titlePrompt(westernDigits(question), westernDigits(reply), lang);
  return collect([{ role: 'system', content: system }, { role: 'user', content: user }], TITLE_MAX_TOKENS);
}

/**
 * The v2.1 "[followups]" task (utils/follow-ups.ts generateFollowUps). Runs in
 * the model queue after anything already queued; `isCancelled` (polled on
 * every token) stops it when the user sends a message. The prompt has the
 * conversation only, no chart facts (build_sft.py).
 */
async function gemmaFollowUps({ history, lastAnswer, lang, isCancelled }: FollowUpsRequest): Promise<string[]> {
  return generateFollowUps(
    async ({ system, user, maxNewTokens, temperature }, onText) => {
      let text = '';
      return runLocalLLM(
        [{ role: 'system', content: system }, { role: 'user', content: user }],
        (token) => { text += token; return onText(text); },
        { maxNewTokens, temperature, isCancelled },
      );
    },
    {
      enabled: true,
      history: modelTurns(history),
      lastAnswer: westernDigits(lastAnswer),
      lang,
      isCancelled,
      fits: ({ system, user }) =>
        estimateTokens(system) + estimateTokens(user) + FOLLOWUPS_MAX_TOKENS[lang] + PROMPT_MARGIN_TOKENS <= CONTEXT_WINDOW,
    },
  );
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
export async function* streamLocal(
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

/**
 * The checks for a chat reply (CONTEXT_VERSION 2 only; utils/reply-guards.ts
 * runGuarded): script for hi/bn, repetition for follow-ups, and a month/year
 * for "when" questions the plan has no window for (planet / transit / dasha
 * questions, whose dates come from the context). Plan timing is verified by
 * the pipeline instead, so those replies are never re-run for their dates.
 */
export function replyGuard(
  lang: Lang, names: (string | undefined)[], history: ChatTurn[] = [], question?: string, planTiming = false,
): ReplyGuard | null {
  if (CONTEXT_VERSION !== 2) return null;
  const previous = [...history].reverse().find(m => m.role === 'assistant')?.content;
  const needsDate = question != null && !planTiming && isTimingQuestion(question);
  if (lang === 'en' && !previous && !needsDate) return null;
  return {
    lang, previous, needsDate, today: needsDate ? isoDay(new Date()) : undefined,
    ignore: names.flatMap(n => (n ? [n.split(' ')[0]] : [])),
  };
}

const GEMMA_TASKS: readonly AdapterTask[] = ['saga', 'krishna', 'reading', 'title', ...(MODEL_FOLLOWUPS ? ['followups' as const] : [])];

export const gemma21Adapter: ModelAdapter = {
  caps: {
    id: 'gemma21',
    tasks: GEMMA_TASKS,
    contextFormat: CONTEXT_VERSION === 2 ? 'gemma-v2' : 'gemma-v1',
    followups: MODEL_FOLLOWUPS,
    maxTokens: REPLY_MAX_TOKENS,
    contextWindow: CONTEXT_WINDOW,
    languages: MODEL_LANGUAGES,
    timingInPrompt: CONTEXT_VERSION === 2,
    model: true,
  },
  async ready(waitMs: number) {
    return Platform.OS !== 'web' && ensureLocalLLM(waitMs);
  },
  loaded() {
    return Platform.OS !== 'web' && isLLMReady();
  },
  reading: gemmaReading,
  title: gemmaTitle,
  followups: gemmaFollowUps,
  render(plan: AnswerPlan, req: RenderRequest): AsyncGenerator<string> {
    if (plan.mode === 'krishna') {
      // The app chooses the verse; the model writes only Krishna's words and
      // the verse is printed underneath, so scripture is never misquoted.
      const verse = pickGitaVerse(plan.question);
      const messages: ChatMessage[] = [
        { role: 'system', content: krishnaSystem(req.userName, verse.prompt, plan.lang) },
        { role: 'user',   content: westernDigits(plan.question) },
      ];
      const guard = replyGuard(plan.lang, [req.userName]);
      return streamLocal(messages, REPLY_MAX_TOKENS, { suffix: `\n\n${formatGitaQuote(verse, plan.lang)}`, guard });
    }
    const t = plan.timing;
    const { system, question, dropHistory } = sagaChatParts(plan, {
      timingMode: CONTEXT_VERSION === 2 ? TIMING_PROMPT_MODE : 'baseline',
      contentMode: CONTEXT_VERSION === 2 ? CONTENT_PROMPT_MODE : 'baseline',
      focus: GURU_CONTEXT_FOCUS ? plan.focus : null,
      clarifyDropsHistory: CLARIFY_DROPS_HISTORY,
    });
    const history = modelTurns(req.history);
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...(dropHistory ? [] : sagaHistory(system, history, question)),
      { role: 'user', content: question },
    ];
    const names = [plan.subject.name, req.userName];
    const base = replyGuard(plan.lang, names, history, westernDigits(plan.question), !!t?.asked);
    const extra = CONTEXT_VERSION === 2 ? planGuard(plan, req.history) : {};
    const guard = base || Object.keys(extra).length
      ? { lang: plan.lang, ignore: names.flatMap(n => (n ? [n.split(' ')[0]] : [])), ...base, ...extra }
      : null;
    if (CONTEXT_VERSION !== 2) return streamLocal(messages, REPLY_MAX_TOKENS, { guard });
    // v2.1's "about N months from now" countdowns are wrong almost every
    // time: they are cut sentence by sentence before display.
    return streamLocal(messages, REPLY_MAX_TOKENS, { guard, sentenceTransform: stripCountdowns });
  },
};
