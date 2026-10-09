/**
 * InstructAdapter: drives any general instruction-following chat model (a
 * bigger on-device model, llama.cpp, a server model) through a pluggable
 * LLMRuntime. Unlike gemma21, nothing here depends on a training format: the
 * AnswerPlan is written out as a plain system prompt, so a new model needs a
 * runtime, not new astrology.
 *
 * Plugging in a runtime (react-native-executorch ships as ./executorch-runtime.ts):
 *  1. implement LLMRuntime (below) over the engine's API: `ready` loads the
 *     weights, `generate` streams tokens through `onToken` (return true from
 *     it to stop) and resolves with the full text;
 *  2. call registerRuntime(runtime) from ./index.ts at startup (it builds
 *     createInstructAdapter(runtime) and puts it under the 'instruct' id);
 *  3. add 'instruct' to RUNNABLE_ADAPTERS (utils/model-download-logic.ts) and
 *     publish the model in the manifest with `"adapter": "instruct"`; the
 *     installed model's adapter is activated by utils/model-download.ts.
 * Output goes through the same pipeline verify layer as every adapter (dates
 * against the plan's windows, doctor / lawyer lines), so no safety or timing
 * rule needs re-implementing. Model-bound text is always in Western digits;
 * the pipeline localizes the reply for display.
 *
 * hi / bn: every prompt carries scriptRule(), and chat replies run through
 * the shared script / repetition guard (runGuarded) like Saga's; readings
 * keep their script check with retry. General models still write plainer
 * Hindi / Bengali than the fine-tune (the catalog says so); dates and the
 * doctor / lawyer lines are guaranteed by the pipeline either way.
 *
 * Pure: no React Native imports (the runtime brings its own).
 */
import type { AnswerPlan } from '../plan';
import { AREA, HELPS, monthLabel, type Lang } from '../strings';
import { getAstrologyContext, getFullKundli } from '../../astrology';
import { pickGitaVerse, formatGitaQuote } from '../../gita';
import { parseModelFollowUps, followUpTurns, FOLLOWUPS_MAX_TOKENS } from '../../follow-ups';
import {
  NATIVE_SCRIPT_MIN, RETRY_TEMPERATURE, readingScriptRatio, runGuarded, westernDigits, type ReplyGuard,
} from '../../reply-guards';
import type {
  AdapterCaps, ChatTurn, FollowUpsRequest, ModelAdapter, ReadingRequest, ReadingResult, RenderRequest, TitleRequest,
} from './types';

// ─── Runtime contract ─────────────────────────────────────────────────────────

export type RuntimeMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type GenerateOptions = {
  maxNewTokens: number;
  temperature?: number;
  /** Each new piece of text; return true to stop generating. */
  onToken?: (token: string) => boolean | void;
  /** Polled by the runtime between tokens; true stops it. */
  isCancelled?: () => boolean;
};

/**
 * What an inference engine must provide. The engine applies its own chat
 * template to `messages` (system first, then alternating user / assistant).
 */
export interface LLMRuntime {
  /** Short name for logs ("llama.cpp", "cloud"). */
  readonly id: string;
  /** Prompt + reply budget in tokens. */
  readonly contextWindow: number;
  /** Languages it answers in well (default en / hi / bn). */
  readonly languages?: readonly Lang[];
  /** Load if needed (waiting at most `waitMs`); false when it can't run now. */
  ready(waitMs: number): Promise<boolean>;
  /** Loaded already (never starts a load). */
  loaded(): boolean;
  /** Generates one assistant turn; resolves with the whole text. */
  generate(messages: RuntimeMessage[], opts: GenerateOptions): Promise<string>;
  /** Token count for budgeting; default ~3.5 characters per token. */
  countTokens?(text: string): number;
}

export type InstructOptions = {
  /** New tokens per chat reply. */
  maxTokens?: number;
  /** Chat reply temperature. */
  temperature?: number;
};

/**
 * Drops "<think> … </think>" reasoning a model may still emit (Qwen3 is
 * prompted with an empty think block, but a small model can open one anyway),
 * streaming everything else through as it arrives.
 */
export function createThinkFilter(emit: (text: string) => void) {
  let buf = '';
  let inThink = false;
  const OPEN = '<think>';
  const CLOSE = '</think>';
  const flushSafe = (final: boolean) => {
    for (;;) {
      if (inThink) {
        const end = buf.indexOf(CLOSE);
        if (end < 0) { if (final) buf = ''; else buf = buf.slice(Math.max(0, buf.length - CLOSE.length)); return; }
        buf = buf.slice(end + CLOSE.length).replace(/^\s+/, '');
        inThink = false;
        continue;
      }
      const start = buf.indexOf(OPEN);
      if (start >= 0) {
        if (start > 0) emit(buf.slice(0, start));
        buf = buf.slice(start + OPEN.length);
        inThink = true;
        continue;
      }
      // Hold back a possible partial "<think" at the end.
      const keep = final ? 0 : partialTail(buf, OPEN);
      const out = buf.slice(0, buf.length - keep);
      if (out) emit(out);
      buf = buf.slice(buf.length - keep);
      return;
    }
  };
  return {
    push(token: string) { buf += token; flushSafe(false); },
    flush() { flushSafe(true); },
  };
}

function partialTail(text: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
    if (text.endsWith(tag.slice(0, n))) return n;
  }
  return 0;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const LANG_NAME: Record<Lang, string> = { en: 'English', hi: 'Hindi (Devanagari script)', bn: 'Bengali (Bengali script)' };
const ml = (d: Date) => monthLabel(d, 'en', { western: true });

/**
 * General models drift into English (or Hinglish) far more than the
 * fine-tuned Saga, so hi / bn prompts say it twice: the language, and that
 * every word must be in its script. Digits stay Western in the model's text;
 * the pipeline shows them in the reader's script.
 */
export function scriptRule(lang: Lang): string | null {
  if (lang === 'hi') return 'Write every word in Hindi in Devanagari script. Do not switch to English or Latin letters, except for names. Write numbers with digits 0-9.';
  if (lang === 'bn') return 'Write every word in Bengali in Bengali script. Do not switch to English or Latin letters, except for names. Write numbers with digits 0-9.';
  return null;
}

/** A system prompt that carries the whole plan in plain words (model-bound: Western digits). */
export function instructSystemPrompt(plan: AnswerPlan): string {
  const lines = [
    'You are Saga, a warm Vedic astrologer. Answer in plain language: no house numbers, sign names or dasha terms.',
    `Reply in ${LANG_NAME[plan.lang]}, 3 to 5 short sentences, no markdown.`,
    ...(scriptRule(plan.lang) ? [scriptRule(plan.lang)!] : []),
    `The question is about ${plan.subject.isYou === false ? `${plan.subject.name} (the user's ${plan.subject.relationship ?? 'family member'})` : 'the user'}.`,
  ];
  const t = plan.timing;
  if (t) {
    const w = t.best;
    lines.push(`Topic: ${AREA.en[t.topic]}.`);
    lines.push(`${t.result.past ? 'Strongest past window' : 'Strongest window'}: ${ml(w.start)} to ${ml(w.end)}, peak ${ml(w.peak)}. Use only these dates.`);
    if (t.second) lines.push(`Second window: ${ml(t.second.start)} to ${ml(t.second.end)}.`);
    lines.push(`Why (do not quote): ${w.reasons.map(r => r.kind).join(', ') || 'steady support'}; confidence ${w.confidence}.`);
    lines.push(`Practical advice to include: ${HELPS.en[t.topic]}`);
  } else {
    lines.push('Do not give dates unless the question asks when.');
  }
  for (const f of plan.facts) lines.push(`Chart fact (${f.code}): ${f.source}.`);
  if (plan.notes.length) lines.push(`Must mention: ${plan.notes.join(', ')}.`);
  if (plan.advice.includes('doctor')) lines.push('Tell them to see a doctor.');
  if (plan.advice.includes('lawyer')) lines.push('Tell them to talk to a lawyer.');
  return lines.join('\n');
}

/** The chat system prompt: the plan, then the chart as background notes. */
export function instructChatSystem(plan: AnswerPlan): string {
  const chart = getAstrologyContext(plan.subject, { version: 2, date: plan.now });
  return `${instructSystemPrompt(plan)}\n\nChart notes (background only; never quote their terms):\n${chart}`;
}

/** Krishna: the app picks the verse and prints it under the reply, so the model never quotes scripture. */
export function instructKrishnaSystem(lang: Lang, versePrompt: string, userName?: string): string {
  return [
    'You are Krishna from the Bhagavad Gita, speaking to a friend who came to you with something on their mind.',
    `Reply in ${LANG_NAME[lang]}, 2 to 4 warm, simple sentences, no markdown.`,
    scriptRule(lang) ?? '',
    userName ? `Their name is ${userName.split(' ')[0]}.` : '',
    `Do not quote any verse; the app shows this one under your reply, so speak in its spirit: ${versePrompt}`,
  ].filter(Boolean).join('\n');
}

export function instructReadingSystem(profile: ReadingRequest['profile'], lang: Lang): string {
  const k = getFullKundli({
    birthDate: profile.birthDate, birthTime: profile.birthTime ?? undefined,
    birthLat: profile.birthLat, birthLng: profile.birthLng, birthTz: profile.birthTz,
  });
  const { sun, moon, rising } = k.bigThree;
  return [
    `Write a short personality reading for ${profile.name.split(' ')[0]} in ${LANG_NAME[lang]}, warm and plain.`,
    `Chart: Sun in ${sun?.name ?? 'unknown'}, Moon in ${moon?.name ?? 'unknown'}${rising ? `, rising ${rising.name}` : ''}, birth star ${k.nakshatra.name}, current life phase ${k.dasha.lord} until ${k.dasha.endDate}.`,
    ...(scriptRule(lang) ? [`${scriptRule(lang)} Only the line keys stay in English.`] : []),
    `Reply with exactly these lines, keys in English capitals, one or two sentences each:`,
    ['SUN:', 'MOON:', ...(rising ? ['RISING:'] : []), 'NAKSHATRA:', 'DASHA:', 'OVERVIEW:'].join('\n'),
  ].join('\n');
}

export function instructTitlePrompt(question: string, reply: string, lang: Lang): RuntimeMessage[] {
  return [
    { role: 'system', content: [`Write a 2 to 4 word title for this conversation in ${LANG_NAME[lang]}. Reply with the title only.`, scriptRule(lang)].filter(Boolean).join('\n') },
    { role: 'user', content: `User: ${westernDigits(question)}\nAssistant: ${westernDigits(reply)}` },
  ];
}

export function instructFollowUpsPrompt(history: ChatTurn[], lastAnswer: string, lang: Lang): RuntimeMessage[] {
  const turns = followUpTurns(history, lastAnswer);
  return [
    {
      role: 'system',
      content: [
        `Suggest 3 short questions the user might ask next, in ${LANG_NAME[lang]}, written as the user ("I", "my").`,
        'One per line, each ending with "?", at most 8 words, no astrology terms, no names, no numbering.',
        scriptRule(lang) ?? '',
      ].filter(Boolean).join('\n'),
    },
    { role: 'user', content: turns.map(t => `User: ${westernDigits(t.user)}\nAssistant: ${westernDigits(t.assistant)}`).join('\n') },
  ];
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

const estimate = (rt: LLMRuntime, text: string) => rt.countTokens?.(text) ?? Math.ceil(text.length / 3.5) + 4;

/** Newest turns that fit next to the prompt and reply, starting on a user turn. */
export function fitHistory(rt: LLMRuntime, system: string, history: ChatTurn[], question: string, reply: number): ChatTurn[] {
  let budget = rt.contextWindow - reply - estimate(rt, system) - estimate(rt, question) - 64;
  let start = history.length;
  while (start > 0) {
    const cost = estimate(rt, history[start - 1].content);
    if (cost > budget) break;
    budget -= cost;
    start--;
  }
  while (start < history.length && history[start].role !== 'user') start++;
  return history.slice(start).map(m => ({ role: m.role, content: westernDigits(m.content) }));
}

/** Bridge the runtime's token callback to an async iterator. */
async function* streamRuntime(rt: LLMRuntime, messages: RuntimeMessage[], opts: GenerateOptions, suffix = ''): AsyncGenerator<string> {
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let failure: unknown = null;
  let wrote = false;
  const done = rt.generate(messages, {
    ...opts,
    onToken: (tok) => {
      if (tok) { queue.push(tok); wrote = true; wake?.(); wake = null; }
      return opts.onToken?.(tok);
    },
  }).catch((e) => { failure = e; }).finally(() => { finished = true; wake?.(); });
  let i = 0;
  while (!finished || i < queue.length) {
    if (i < queue.length) yield queue[i++];
    else await new Promise<void>(r => { wake = r; });
  }
  await done;
  if (failure) throw failure;
  if (suffix && wrote) yield suffix;
}

/**
 * A chat reply through utils/reply-guards.ts runGuarded: hi / bn replies that
 * come out in the wrong script, or that repeat the previous answer, are
 * regenerated once (as for Saga). Plan dates are verified by the pipeline.
 */
async function* streamGuarded(
  rt: LLMRuntime, messages: RuntimeMessage[], opts: GenerateOptions, guard: ReplyGuard, suffix = '',
): AsyncGenerator<string> {
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let failure: unknown = null;
  let wrote = false;
  const push = (text: string) => {
    if (!text) return;
    queue.push(text);
    wrote = true;
    wake?.();
    wake = null;
  };
  const done = runGuarded(
    (onToken, temperature) => rt.generate(messages, { ...opts, temperature: temperature ?? opts.temperature, onToken }),
    guard, push,
  ).catch((e) => { failure = e; }).finally(() => { finished = true; wake?.(); });
  let i = 0;
  while (!finished || i < queue.length) {
    if (i < queue.length) yield queue[i++];
    else await new Promise<void>(r => { wake = r; });
  }
  await done;
  if (failure) throw failure;
  if (suffix && wrote) yield suffix;
}

/** The guard for a reply, or null when nothing needs checking (English, first answer). */
export function instructGuard(lang: Lang, names: (string | undefined)[], history: ChatTurn[]): ReplyGuard | null {
  const previous = [...history].reverse().find(m => m.role === 'assistant')?.content;
  if (lang === 'en' && !previous) return null;
  return {
    lang,
    previous: previous ? westernDigits(previous) : undefined,
    ignore: names.flatMap(n => (n ? [n.split(' ')[0]] : [])),
  };
}

export function createInstructAdapter(runtime: LLMRuntime | null, options: InstructOptions = {}): ModelAdapter {
  const maxTokens = options.maxTokens ?? 400;
  const temperature = options.temperature ?? 0.4;
  const caps: AdapterCaps = {
    id: 'instruct',
    tasks: ['saga', 'krishna', 'reading', 'title', 'followups'],
    contextFormat: 'instruct',
    followups: true,
    maxTokens,
    contextWindow: runtime?.contextWindow ?? 0,
    languages: runtime?.languages ?? ['en', 'hi', 'bn'],
    timingInPrompt: true,
    model: true,
  };
  const rt = () => {
    if (!runtime) throw new Error('instruct adapter: no LLMRuntime registered');
    return runtime;
  };
  const collect = async (messages: RuntimeMessage[], maxNewTokens: number, temp?: number) =>
    (await rt().generate(messages, { maxNewTokens, temperature: temp })).trim();

  return {
    caps,
    async ready(waitMs) { return !!runtime && runtime.ready(waitMs); },
    loaded() { return !!runtime && runtime.loaded(); },

    render(plan: AnswerPlan, req: RenderRequest): AsyncGenerator<string> {
      const r = rt();
      const question = westernDigits(plan.question);
      if (plan.mode === 'krishna') {
        const verse = pickGitaVerse(plan.question);
        const system = instructKrishnaSystem(plan.lang, verse.prompt, req.userName);
        const messages: RuntimeMessage[] = [{ role: 'system', content: system }, { role: 'user', content: question }];
        const suffix = `\n\n${formatGitaQuote(verse, plan.lang)}`;
        const guard = instructGuard(plan.lang, [req.userName], []);
        return guard
          ? streamGuarded(r, messages, { maxNewTokens: maxTokens, temperature }, guard, suffix)
          : streamRuntime(r, messages, { maxNewTokens: maxTokens, temperature }, suffix);
      }
      const system = instructChatSystem(plan);
      const messages: RuntimeMessage[] = [
        { role: 'system', content: system },
        ...fitHistory(r, system, req.history, question, maxTokens),
        { role: 'user', content: question },
      ];
      const guard = instructGuard(plan.lang, [plan.subject.name, req.userName], req.history);
      return guard
        ? streamGuarded(r, messages, { maxNewTokens: maxTokens, temperature }, guard)
        : streamRuntime(r, messages, { maxNewTokens: maxTokens, temperature });
    },

    async reading({ profile, lang, skipEnglishFallback = false }: ReadingRequest): Promise<ReadingResult> {
      const read = (l: Lang, temp?: number) => collect(
        [{ role: 'system', content: instructReadingSystem(profile, l) }, { role: 'user', content: 'Read my chart.' }], 300, temp);
      if (lang === 'en') return { text: await read('en'), lang };
      const first = profile.name.split(' ')[0];
      for (const temp of [undefined, RETRY_TEMPERATURE]) {
        const text = await read(lang, temp);
        if (readingScriptRatio(text, lang, first) >= NATIVE_SCRIPT_MIN) return { text, lang };
      }
      if (skipEnglishFallback) return { text: null, lang: 'en' };
      return { text: await read('en'), lang: 'en' };
    },

    async title({ question, reply, lang }: TitleRequest) {
      return collect(instructTitlePrompt(question, reply, lang), 16);
    },

    async followups({ history, lastAnswer, lang, isCancelled }: FollowUpsRequest) {
      if (!lastAnswer.trim() || isCancelled?.()) return [];
      const text = await rt().generate(instructFollowUpsPrompt(history, lastAnswer, lang), {
        maxNewTokens: FOLLOWUPS_MAX_TOKENS[lang] + 16, temperature: 0.2, isCancelled,
      });
      if (isCancelled?.()) return [];
      const asked = history.filter(m => m.role === 'user').map(m => m.content);
      const convo = history.map(m => m.content).concat(lastAnswer).join('\n');
      return parseModelFollowUps(westernDigits(text), lang, asked, westernDigits(convo));
    },
  };
}

/** The registry's default: no runtime in this build, so `ready()` is false and the pipeline uses templates. */
export const instructAdapter: ModelAdapter = createInstructAdapter(null);
