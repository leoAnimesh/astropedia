/**
 * The answer pipeline (the app's agent harness): every chat question goes
 *   1. understand  intent.ts   question → topic, timing, subject, safety
 *   2. reason      plan.ts     + chart + timing engine → AnswerPlan (model-free)
 *   3. render      adapters/   plan → text (gemma21 model, or templates)
 *   4. verify      verify.ts   dates against the plan's windows, advice lines
 *   5. finalize    chips (utils/follow-ups.ts + planChipWindows), saving (use-chat)
 * so astrology never depends on which model is installed. utils/ai.ts
 * streamAI is the entry point the chat calls.
 */
import i18n from '../i18n';
import { missingAdvice } from '../reply-guards';
import { classifyDeterministic, deterministicAnswer } from '../deterministic';
import type { Profile } from '../database';
import type { AgentId } from '../../constants/gurus';
import { buildPlan, type AnswerPlan } from './plan';
import { verifyStream } from './verify';
import { renderTemplate } from './adapters/template';
import { activeAdapter } from './adapters';
import type { ChatTurn } from './adapters/types';
import type { Lang } from './strings';

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
  if (plan.mode === 'saga' && lang === 'en' && !plan.timing?.asked) {
    const topic = classifyDeterministic(req.question);
    const answer = topic ? deterministicAnswer(topic, plan.subject as Profile) : null;
    if (answer) return { stream: once(answer), tier: 'deterministic', plan };
  }

  const advice = (reply: string) => plan.mode === 'saga'
    ? missingAdvice(req.question, reply).map(kind => `\n\n${i18n.t(`chat:safety.${kind}`, { lng: lang })}`).join('')
    : '';
  const template = plan.mode === 'saga' ? renderTemplate(plan) : null;
  const adapter = activeAdapter();
  if (!(await adapter.ready(req.waitMs))) {
    // No model: a timing / topic question still gets a full answer from the plan.
    if (template) return { stream: verifyStream(once(template), plan, advice), tier: 'deterministic', plan };
    return { stream: once(req.offlineReply), tier: 'pending', plan };
  }
  const rendered = adapter.render(plan, { history: req.history, userName: req.userName });
  return { stream: verifyStream(withFallback(rendered, template), plan, advice), tier: 'executorch', plan };
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
