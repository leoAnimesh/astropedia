/**
 * Stub adapter for a future general instruction-following model (any chat
 * model that follows a system prompt: a bigger on-device model or a server
 * model). Not wired to a runtime yet: `ready()` is false, so the pipeline
 * falls back to the template renderer if it is ever selected.
 *
 * To add one:
 *  1. implement `render` with the runtime's streaming API, sending
 *     instructSystemPrompt(plan) as the system message plus the history;
 *  2. pass the stream through the same verify layer as gemma21
 *     (createTimingRepair + createSentenceFilter, missingAdvice suffix);
 *  3. register it in ./index.ts and publish it in the model manifest with
 *     `"adapter": "instruct"`.
 * The plan already holds every astrology decision, so no chart math or
 * safety rule needs to be re-implemented for a new model.
 */
import type { AnswerPlan } from '../plan';
import { AREA, HELPS, monthLabel } from '../strings';
import type { ModelAdapter } from './types';

const LANG_NAME = { en: 'English', hi: 'Hindi (Devanagari script)', bn: 'Bengali (Bengali script)' } as const;

/** A system prompt that carries the whole plan in plain words. */
export function instructSystemPrompt(plan: AnswerPlan): string {
  const lines = [
    'You are Saga, a warm Vedic astrologer. Answer in plain language: no house numbers, sign names or dasha terms.',
    `Reply in ${LANG_NAME[plan.lang]}, 3 to 5 short sentences, no markdown.`,
    `The question is about ${plan.subject.isYou === false ? `${plan.subject.name} (the user's ${plan.subject.relationship ?? 'family member'})` : 'the user'}.`,
  ];
  const t = plan.timing;
  if (t) {
    const w = t.best;
    lines.push(`Topic: ${AREA.en[t.topic]}.`);
    lines.push(`${t.result.past ? 'Strongest past window' : 'Strongest window'}: ${monthLabel(w.start, 'en')} to ${monthLabel(w.end, 'en')}, peak ${monthLabel(w.peak, 'en')}. Use only these dates.`);
    if (t.second) lines.push(`Second window: ${monthLabel(t.second.start, 'en')} to ${monthLabel(t.second.end, 'en')}.`);
    lines.push(`Why (do not quote): ${w.reasons.map(r => r.kind).join(', ') || 'steady support'}; confidence ${w.confidence}.`);
    lines.push(`Practical advice to include: ${HELPS.en[t.topic]}`);
  }
  for (const f of plan.facts) lines.push(`Chart fact (${f.code}): ${f.source}.`);
  if (plan.notes.length) lines.push(`Must mention: ${plan.notes.join(', ')}.`);
  if (plan.advice.includes('doctor')) lines.push('Tell them to see a doctor.');
  if (plan.advice.includes('lawyer')) lines.push('Tell them to talk to a lawyer.');
  return lines.join('\n');
}

export const instructAdapter: ModelAdapter = {
  caps: {
    id: 'instruct', tasks: ['saga'], contextFormat: 'instruct', followups: false,
    maxTokens: 400, contextWindow: 8192, languages: ['en', 'hi', 'bn'], timingInPrompt: true,
  },
  async ready() { return false; },
  async *render() { throw new Error('instruct adapter: no runtime yet'); },
};
