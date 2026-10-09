/**
 * The answer pipeline (the app's agent harness): every chat question goes
 *   1. understand  intent.ts   question → topic, timing, subject, safety
 *   2. reason      plan.ts     + chart + timing engine → AnswerPlan (model-free)
 *   3. render      adapters/   plan → text (gemma21 model, or templates)
 *   4. verify      verify.ts   dates against the plan's windows (unasked dates dropped), repeats of
 *                              any earlier reply, the plan's key items present, advice lines
 *   5. finalize    hi/bn digits, chips (utils/follow-ups.ts + planChipWindows), saving (use-chat)
 * so astrology never depends on which model is installed. utils/ai.ts
 * streamAI is the entry point the chat calls.
 *
 * The other model tasks run here too, each through the active adapter's
 * capability with a model-free fallback: the chart card reading (runReading
 * → template-reading.ts), thread titles (runTitle → the first question) and
 * follow-up chips (runFollowUps → [] so the chat keeps its rule-based chips).
 *
 * Digits: everything shown to the user in hi/bn uses Devanagari / Bengali
 * digits (like utils/i18n.ts localizeDigits); everything sent to a model
 * stays in Western digits (adapters convert history back).
 */
import i18n from '../i18n';
import { findDates, mentionsDoctor, missingAdvice, nativeDigits, nativeDigitsByScript } from '../reply-guards';
import { classifyDeterministic, deterministicAnswer } from '../deterministic';
import { dateInWindows } from '../timing-engine';
import type { Profile } from '../database';
import type { AgentId } from '../../constants/gurus';
import { buildPlan, type AnswerPlan } from './plan';
import { localizeDigitsStream, previousReplies, verifyStream } from './verify';
import { krishnaTemplate, renderTemplate } from './adapters/template';
import { templateReading } from './adapters/template-reading';
import { activeAdapter, adapterSupports } from './adapters';
import type { AdapterTask, ChatTurn, ReadingResult } from './adapters/types';
import { questionTitle, type Lang } from './strings';

export type PipelineTier = 'executorch' | 'deterministic' | 'pending';

export type PipelineRequest = {
  profile: Profile;
  /** All of the user's profiles ("when will my sister marry" reads hers). */
  people?: Profile[];
  history: ChatTurn[];
  question: string;
  lang: Lang;
  mode: 'saga' | 'krishna';
  agent: AgentId;
  userName?: string;
  /** Model wait before giving up (ms). */
  waitMs: number;
  /** Shown when nothing can answer without the model. */
  offlineReply: string;
};

export type PipelineResult = { stream: AsyncGenerator<string>; tier: PipelineTier; plan: AnswerPlan };

async function* once(text: string): AsyncGenerator<string> {
  yield text;
}

/** If the model fails before writing anything, answer from the plan instead. */
async function* withFallback(source: AsyncGenerator<string>, fallback: string | null): AsyncGenerator<string> {
  let wrote = false;
  try {
    for await (const t of source) {
      if (t) wrote = true;
      yield t;
    }
  } catch (err) {
    if (wrote || !fallback) throw err;
    yield fallback;
  }
}

export async function runPipeline(req: PipelineRequest): Promise<PipelineResult> {
  const r = await route(req);
  return req.lang === 'en' ? r : { ...r, stream: localizeDigitsStream(r.stream, req.lang) };
}

async function route(req: PipelineRequest): Promise<PipelineResult> {
  const { lang } = req;
  const plan = buildPlan({
    question: req.question, history: req.history, profile: req.profile, people: req.people,
    lang, agent: req.agent, mode: req.mode,
  });

  switch (plan.route) {
    case 'crisis':
      return { stream: once(i18n.t('chat:safety.crisis', { lng: lang })), tier: 'deterministic', plan };
    case 'greeting': {
      // Models answer a bare hello with a chart dump; each chart guru introduces itself.
      const base = req.agent === 'saga' || req.agent === 'krishna' ? 'chat:greeting' : `chat:gurus.${req.agent}.greeting`;
      const text = req.profile.isYou
        ? i18n.t(`${base}.self`, { lng: lang })
        : i18n.t(`${base}.other`, { lng: lang, name: req.profile.name.split(' ')[0] });
      return { stream: once(text), tier: 'deterministic', plan };
    }
    case 'canned':
      return { stream: once(i18n.t(`chat:safety.${plan.canned}`, { lng: lang })), tier: 'deterministic', plan };
    case 'decline': {
      const text = renderTemplate(plan);
      if (text) return { stream: once(text), tier: 'deterministic', plan };
      break;
    }
  }

  // L0: single-answer lookups (sun sign, nakshatra, current dasha …), English templates.
  // A life-topic "when" question ("which dasha am I in and when will I marry?")
  // belongs to the timing engine, not the lookup.
  if (plan.mode === 'saga' && lang === 'en' && !plan.timing?.asked && !plan.content) {
    const topic = classifyDeterministic(req.question);
    const answer = topic ? deterministicAnswer(topic, plan.subject as Profile) : null;
    if (answer) return { stream: once(answer), tier: 'deterministic', plan };
  }

  const advice = (reply: string) => {
    if (plan.mode !== 'saga') return '';
    const kinds = missingAdvice(req.question, reply);
    // "Why am I always tired?" / "how do I reduce stress?" are health questions too.
    if (plan.intent.topic === 'health' && !kinds.includes('doctor') && !mentionsDoctor(reply)) kinds.push('doctor');
    return kinds.map(kind => `\n\n${i18n.t(`chat:safety.${kind}`, { lng: lang })}`).join('');
  };
  const template = plan.mode === 'saga' ? renderTemplate(plan, previousReplies(req.history)) : null;
  const adapter = activeAdapter();
  if (!adapter.caps.model || !(await adapter.ready(req.waitMs))) {
    // No model: a timing / topic question still gets a full answer from the plan.
    if (template) return { stream: verifyStream(once(template), plan, advice, req.history), tier: 'deterministic', plan };
    // No model this build can run (template adapter): Krishna still offers the verse.
    if (plan.mode === 'krishna' && !adapter.caps.model) return { stream: once(krishnaTemplate(req.question, lang)), tier: 'deterministic', plan };
    // Otherwise wait for the model (use-chat waits out a download on 'pending').
    return { stream: once(req.offlineReply), tier: 'pending', plan };
  }
  const rendered = adapter.render(plan, { history: req.history, userName: req.userName });
  return { stream: verifyStream(withFallback(rendered, template), plan, advice, req.history), tier: 'executorch', plan };
}

/**
 * The engine windows behind a reply, for the chips under it ("What changes
 * after March 2028?" must name an engine date): the plan of the question the
 * reply answered. Empty when it wasn't a topic / timing question.
 */
export function planChipWindows(
  profile: Profile, question: string, history: ChatTurn[], lang: Lang, agent: AgentId = 'saga', people?: Profile[],
): { start: Date; end: Date }[] {
  try {
    const plan = buildPlan({ question, history, profile, people, lang, agent });
    return plan.timing?.result.windows ?? [];
  } catch {
    return [];
  }
}

// ─── Other model tasks ────────────────────────────────────────────────────────

/** The active adapter is a model that can run `task` (vs. the template fallback). */
export function canRun(task: AdapterTask): boolean {
  const a = activeAdapter();
  return a.caps.model && adapterSupports(task, a);
}

/** Model chips can be asked for now: the adapter writes them and its model is already loaded. */
export function followUpsAvailable(): boolean {
  const a = activeAdapter();
  return a.caps.model && adapterSupports('followups', a) && a.loaded();
}

export type ReadingOutcome = ReadingResult & {
  /** 'template': written from chart facts (no model); callers shouldn't cache it as the model's reading. */
  source: 'model' | 'template';
};

/**
 * The chart card reading: the model's when the active adapter has the
 * 'reading' task and is ready within `waitMs`, else the deterministic reading
 * (template-reading.ts) in `lang`. Shown text uses the language's digits.
 */
export async function runReading(
  profile: Profile, lang: Lang, { skipEnglishFallback = false, waitMs = 15_000, now = new Date() } = {},
): Promise<ReadingOutcome> {
  const a = activeAdapter();
  if (a.caps.model && a.reading && adapterSupports('reading', a) && (await a.ready(waitMs))) {
    const r = await a.reading({ profile, lang, skipEnglishFallback });
    return { text: r.text == null ? null : nativeDigits(r.text, r.lang), lang: r.lang, source: 'model' };
  }
  return { text: templateReading(profile, lang, now), lang, source: 'template' };
}

/**
 * A thread title from the first exchange: the model's (raw; use-chat cleans
 * it) or, without one, the first question cut to fit (the same text the
 * thread got as its placeholder).
 */
export async function runTitle(
  question: string, reply: string, lang: Lang, waitMs = 15_000,
): Promise<{ text: string; source: 'model' | 'template' } | null> {
  const a = activeAdapter();
  if (a.caps.model && a.title && adapterSupports('title', a) && (await a.ready(waitMs))) {
    const t = await a.title({ question, reply, lang });
    return t ? { text: nativeDigitsByScript(t), source: 'model' } : null;
  }
  const text = questionTitle(question);
  return text ? { text, source: 'template' } : null;
}

/**
 * Up to 3 model-written chips for the reply `lastAnswer`, or [] (the chat
 * then shows its rule-based chips): when the adapter has no 'followups'
 * task, or its model isn't already loaded (chips never load the model by
 * themselves). `history` is the thread before the reply, ending with its
 * question; chip dates must fall inside the engine windows of that question's
 * plan, like the reply's. Chips are model-bound questions: Western digits
 * (the chat localizes the label only).
 */
export async function runFollowUps(
  profile: Profile | null, history: ChatTurn[], lastAnswer: string, lang: Lang,
  { isCancelled, agent = 'saga' as AgentId }: { isCancelled?: () => boolean; agent?: AgentId } = {},
): Promise<string[]> {
  const a = activeAdapter();
  if (!followUpsAvailable() || !a.followups) return [];
  const question = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
  const windows = profile && question ? planChipWindows(profile, question, history.slice(0, -1), lang, agent) : [];
  const datesOk = (chip: string) => !windows.length || findDates(chip).every(d =>
    d.year == null ? true : dateInWindows({ year: d.year, month: d.month }, windows));
  try {
    const chips = await a.followups({ history, lastAnswer, lang, isCancelled });
    return chips.filter(datesOk);
  } catch {
    return [];
  }
}
