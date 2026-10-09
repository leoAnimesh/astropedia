/**
 * Per-guru rules that run in the app (no model involvement). Pure functions
 * with no React Native or i18n imports, unit-tested in Node.
 *
 *  - focusContext: drop the Life-areas and transit lines a guru doesn't need
 *    (only used when GURU_CONTEXT_FOCUS is on).
 *  - nudgeTarget: the guru a question clearly belongs to, for the
 *    "Ask <guru> →" chip under an answer.
 *  - ageOn / isMinor: the under-18 gate for adults-only gurus (Love).
 */
import { GURUS, TOPIC_GURU, type AgentId, type LifeArea, type TransitPlanet } from '../constants/gurus';
import { detectTopic } from './follow-ups';

/**
 * The v2 chart context (utils/astrology.ts getAstrologyContext) with only the
 * "Life areas" lines and "Now (sky today)" transit lines listed for `by` (a
 * guru, or an AnswerPlan's focus: utils/agent/plan.ts planFocus).
 * Header lines (Reading for, Born, Age, signs, Planets) and everything else
 * (Timing, "Birth time unknown.") are kept as they are. Gurus without a
 * focus (Saga, Krishna) get the context unchanged.
 */
export type ContextFocus = { areas: readonly LifeArea[]; transits: readonly TransitPlanet[] };

export function focusContext(context: string, by: AgentId | ContextFocus): string {
  const focus = typeof by === 'string' ? GURUS[by]?.context : by;
  if (!focus) return context;
  const areas = new Set<string>(focus.areas);
  const transits = new Set<string>(focus.transits);
  let section: 'areas' | 'now' | null = null;
  const out: string[] = [];
  for (const line of context.split('\n')) {
    if (/^Life areas\b/.test(line)) { section = 'areas'; out.push(line); continue; }
    if (/^Now \(sky today\):/.test(line)) { section = 'now'; out.push(line); continue; }
    if (!line.startsWith('- ')) { section = null; out.push(line); continue; }
    if (section === 'areas') {
      const label = line.slice(2, line.indexOf(':') > 0 ? line.indexOf(':') : undefined);
      if (areas.has(label)) out.push(line);
      continue;
    }
    if (section === 'now') {
      const planet = line.slice(2).split(/[\s;,.]/)[0];
      if (transits.has(planet)) out.push(line);
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * The guru a question clearly belongs to when it isn't `agent` (the chip
 * "Ask Career & money guru →"), else null. Only the question's own words
 * count (follow-ups topic detection), and gurus that answer anything (Saga,
 * Krishna) never nudge.
 */
export function nudgeTarget(agent: AgentId, question: string): AgentId | null {
  const spec = GURUS[agent];
  if (!spec || spec.topics.length === 0) return null;
  const topic = detectTopic(question, '');
  if (!topic || spec.topics.includes(topic)) return null;
  const target = TOPIC_GURU[topic];
  return target && target !== agent ? target : null;
}

/** Whole years between a YYYY-MM-DD birth date and `now` (null if unknown). */
export function ageOn(birthDate: string | null | undefined, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  return age;
}

export function isMinor(birthDate: string | null | undefined, now: Date = new Date()): boolean {
  const age = ageOn(birthDate, now);
  return age !== null && age < 18;
}

/** An adults-only guru (Love) for an under-18 profile. */
export function guruLocked(agent: AgentId, birthDate: string | null | undefined, now: Date = new Date()): boolean {
  return !!GURUS[agent]?.adultsOnly && isMinor(birthDate, now);
}
