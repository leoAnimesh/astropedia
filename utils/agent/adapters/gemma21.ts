/**
 * Gemma21Adapter: astro-gemma v2 / v2.1 on device (ExecuTorch). Maps an
 * AnswerPlan onto the exact prompts the model was trained on
 * (./gemma21-prompt.ts) and streams the reply through the model-specific
 * guards (utils/reply-guards.ts runGuarded: script, repetition, undated
 * "when" answers) and the countdown strip. Timing is verified by the
 * pipeline (verify.ts), like every adapter's output.
 */
import { Platform } from 'react-native';
import {
  runLocalLLM, ensureLocalLLM, MODEL_LANGUAGES, CONTEXT_VERSION, REPLY_MAX_TOKENS, CONTEXT_WINDOW, MODEL_FOLLOWUPS,
  type ChatMessage,
} from '../../local-llm';
import {
  createSentenceFilter, isTimingQuestion, runGuarded, stripCountdowns, type ReplyGuard,
} from '../../reply-guards';
import { pickGitaVerse, formatGitaQuote } from '../../gita';
import { GURU_CONTEXT_FOCUS } from '../../../constants/gurus';
import type { AnswerPlan } from '../plan';
import type { Lang } from '../strings';
import { krishnaSystem, sagaSystem, isoDay, type TimingPromptMode } from './gemma21-prompt';
import type { ChatTurn, ModelAdapter, RenderRequest } from './types';

/**
 * How a timing question's prompt is shaped. Chosen by the date eval
 * (ml/scripts/timing_eval: 69 timing questions x en/hi/bn, 10 charts, 4
 * "today"s, v2.1 .pte, greedy): first future date inside the engine's best
 * window 21.7% (baseline) → 36.2% (filter) → 62.3% (line-top) → 68.1%
 * (line-bottom); shared transit copies 60.9% → 5.8%. With the verify layer
 * 100% land in an engine window. See ml/data/RUN_V3.md "Saga v2.2: timing windows".
 */
export const TIMING_PROMPT_MODE: TimingPromptMode = 'line-bottom';

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

export const gemma21Adapter: ModelAdapter = {
  caps: {
    id: 'gemma21',
    tasks: ['saga', 'krishna', 'reading', 'title', 'followups'],
    contextFormat: 'gemma-v2',
    followups: MODEL_FOLLOWUPS,
    maxTokens: REPLY_MAX_TOKENS,
    contextWindow: CONTEXT_WINDOW,
    languages: MODEL_LANGUAGES,
    timingInPrompt: CONTEXT_VERSION === 2,
  },
  async ready(waitMs: number) {
    return Platform.OS !== 'web' && ensureLocalLLM(waitMs);
  },
  render(plan: AnswerPlan, req: RenderRequest): AsyncGenerator<string> {
    if (plan.mode === 'krishna') {
      // The app chooses the verse; the model writes only Krishna's words and
      // the verse is printed underneath, so scripture is never misquoted.
      const verse = pickGitaVerse(plan.question);
      const messages: ChatMessage[] = [
        { role: 'system', content: krishnaSystem(req.userName, verse.prompt, plan.lang) },
        { role: 'user',   content: plan.question },
      ];
      const guard = replyGuard(plan.lang, [req.userName]);
      return streamLocal(messages, REPLY_MAX_TOKENS, { suffix: `\n\n${formatGitaQuote(verse, plan.lang)}`, guard });
    }
    const t = plan.timing;
    const system = sagaSystem({
      profile: plan.subject,
      lang: plan.lang,
      now: plan.now,
      focus: GURU_CONTEXT_FOCUS ? plan.agent : null,
      timing: t && t.asked && plan.route === 'answer' && CONTEXT_VERSION === 2
        ? { topic: t.topic, windows: t.result.windows, mode: TIMING_PROMPT_MODE } : null,
    });
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...sagaHistory(system, req.history, plan.question),
      { role: 'user', content: plan.question },
    ];
    const guard = replyGuard(plan.lang, [plan.subject.name, req.userName], req.history, plan.question, !!t?.asked);
    if (CONTEXT_VERSION !== 2) return streamLocal(messages, REPLY_MAX_TOKENS, { guard });
    // v2.1's "about N months from now" countdowns are wrong almost every
    // time: they are cut sentence by sentence before display.
    return streamLocal(messages, REPLY_MAX_TOKENS, { guard, sentenceTransform: stripCountdowns });
  },
};
