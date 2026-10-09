/**
 * Layer 2 of the answer pipeline: the astrologer. Intent + chart → AnswerPlan,
 * a model-free description of what the answer must say: whose chart, the
 * route (fixed reply, decline, or a written answer), the timing windows from
 * the engine, plain chart facts with their source, and the notes and advice
 * the answer has to carry. Shared by every renderer (template or model) and
 * by the verifier, so a model can be swapped without touching astrology.
 *
 * Pure: no React Native, no i18n.
 */
import { GURUS, type AgentId, type LifeArea } from '../../constants/gurus';
import type { ContextProfile } from '../astrology';
import { isPureGreeting } from '../reply-guards';
import { ageOn, type ContextFocus } from '../guru-context';
import {
  lordOfHouse, natalChart, timingWindows, topicLinks, TOPIC_RULES, yearsAway,
  type TimingResult, type TimingTopic, type TimingWindow, type Planet,
} from '../timing-engine';
import { classifyIntent, relationMatches, type Ask, type Intent, type Relation } from './intent';
import { planAsk, type AnswerContent } from './astrologer';
import { ASK_QUESTION } from './ask-strings';
import type { Lang } from './strings';

export type PlanProfile = ContextProfile & { id?: string };

export type Route =
  /** Self-harm message: the fixed helpline reply. */
  | 'crisis'
  /** A bare hello: the guru's greeting. */
  | 'greeting'
  /** Baby's sex / partner's name: the fixed decline (chat:safety.*). */
  | 'canned'
  /** Declined or redirected by the plan (see `decline`), rendered from templates. */
  | 'decline'
  /** Everything else: written by the model adapter (or the template renderer). */
  | 'answer';

export type Decline = 'death' | 'minorRomance' | 'elderChildren' | 'otherMissing';

/**
 * - narrow: a "when exactly?" follow-up or an exact-date request: name the
 *   peak month inside the window rather than repeating the window.
 */
export type Note = 'noTime' | 'noPlace' | 'exactDate' | 'narrow' | 'far' | 'noStrong' | 'moderate' | 'past' | 'nakshatraUncertain';

export type KeyFact = { code: 'promiseGood' | 'promiseSlow'; source: string };

export type PlanTiming = {
  topic: TimingTopic;
  result: TimingResult;
  best: TimingWindow;
  second: TimingWindow | null;
  /** The question asks when: the reply must carry the window (verify layer). */
  asked: boolean;
};

export type AnswerPlan = {
  question: string;
  lang: Lang;
  agent: AgentId;
  mode: 'saga' | 'krishna';
  now: Date;
  intent: Intent;
  /** Whose chart the answer reads. */
  subject: PlanProfile;
  /** "My sister" matched another saved profile, which is read instead of the open one. */
  subjectSwitched: boolean;
  /** The relation asked about when no profile matched it (otherMissing). */
  missingRelation: Relation | null;
  age: number | null;
  route: Route;
  decline: Decline | null;
  canned: 'childSex' | 'partnerName' | null;
  timing: PlanTiming | null;
  notes: Note[];
  facts: KeyFact[];
  advice: ('doctor' | 'lawyer')[];
  /**
   * The chart lines this answer needs (planFocus): the guru's areas and
   * transits plus the question's own topic area; null = the whole chart
   * (Saga, Krishna). Model adapters use it only when GURU_CONTEXT_FOCUS is on.
   */
  focus: ContextFocus | null;
  /**
   * What a non-timing answer must say (career fields, partner traits, money
   * sources …), from astrologer.ts; null for timing questions and chat
   * without an ask. Timing lines are optional in such answers.
   */
  content: AnswerContent | null;
  /**
   * The question as the model should read it when the user clarified the
   * previous one ("Like I'm asking which domain?" → "Which field or domain of
   * work suits me best…?"), in the user's language; null = the question as typed.
   */
  rewrite: string | null;
};

export type PlanInput = {
  question: string;
  /** Earlier turns, oldest first. */
  history?: { role: 'user' | 'assistant'; content: string }[];
  profile: PlanProfile;
  /** Other saved profiles, for "when will my sister marry". */
  people?: PlanProfile[];
  lang: Lang;
  agent?: AgentId;
  mode?: 'saga' | 'krishna';
  now?: Date;
};

/** Topics a minor gets no timing for (ageLine in utils/astrology.ts says the same to the model). */
const ADULT_TOPICS = new Set<string>(['marriage', 'love', 'children']);
/** From this age, childbirth timing is not given. */
export const ELDER_AGE = 50;

/**
 * The guru's ask for a "which / what kind" question that names no topic
 * ("Which roles should I apply for?" in Career, "What will they be like?" in
 * Love). Saga reads "what are my strengths"-type questions.
 */
export const GURU_DEFAULT_ASK: Partial<Record<AgentId, Ask>> = {
  career: 'careerField', love: 'partner', study: 'studyField', health: 'wellbeing', saga: 'strengths',
};

/** The guru's topic for a "when?" that names none (Love guru: marriage, …). */
export const GURU_DEFAULT_TOPIC: Partial<Record<AgentId, TimingTopic>> = {
  love: 'marriage', career: 'job', health: 'health', study: 'education', family: 'property', saga: 'general',
};

const STRONG_SIGNS: Record<string, string> = {
  own: 'own sign', exalted: 'exalted', debilitated: 'debilitated', neutral: '',
};
const SLOW_PLANETS: Planet[] = ['Saturn', 'Rahu', 'Ketu', 'Mars'];
const BENEFICS: Planet[] = ['Jupiter', 'Venus'];

/** Plain chart facts behind a topic: the main house's lord and occupants (with the source in chart terms). */
export function keyFacts(profile: PlanProfile, topic: TimingTopic): KeyFact[] {
  const chart = natalChart(profile);
  const main = TOPIC_RULES[topic].houses[0][0];
  const sign = (chart.first + main - 1) % 12;
  const lord = lordOfHouse(chart.first, main);
  const lordDig = chart.planets[lord].dignity;
  const occ = (Object.keys(chart.planets) as Planet[]).filter(p => chart.planets[p].sign === sign);
  const links = topicLinks(chart, topic);
  const src = [`house ${main}${chart.basis === 'moon' ? ' from the Moon' : ''} lord ${lord}${STRONG_SIGNS[lordDig] ? ` (${STRONG_SIGNS[lordDig]})` : ''}`,
    occ.length ? `occupied by ${occ.join(', ')}` : 'empty'].join(', ');
  const good = lordDig === 'own' || lordDig === 'exalted' || occ.some(p => BENEFICS.includes(p))
    || links.Jupiter.links.some(l => l.kind === 'aspect' && l.house === main);
  const slow = lordDig === 'debilitated' || occ.some(p => SLOW_PLANETS.includes(p));
  if (good && !slow) return [{ code: 'promiseGood', source: src }];
  if (slow && !good) return [{ code: 'promiseSlow', source: src }];
  return [];
}

/** The "Life areas" line(s) of the v2 context behind each topic (utils/astrology.ts lifeAreaLines). */
export const TOPIC_AREAS: Record<TimingTopic, LifeArea[]> = {
  marriage: ['Love/marriage'], love: ['Love/marriage', 'Romance/children/study'],
  job: ['Career'], promotion: ['Career'], business: ['Career', 'Money'], money: ['Money'],
  property: ['Home/family'], children: ['Romance/children/study'], education: ['Romance/children/study'],
  foreign: ['Abroad/spending/spiritual'], health: ['Self/health'], legal: [], general: [],
};

/**
 * Topic-relevant chart lines for a guru's answer: the guru's own focus
 * (constants/gurus.ts `context`) plus the area of the question's topic, so a
 * Career-guru question about marriage still sees the marriage line. Null for
 * gurus without a focus (Saga, Krishna): they read the whole chart.
 */
export function planFocus(agent: AgentId, topic: TimingTopic | null): ContextFocus | null {
  const base = GURUS[agent]?.context;
  if (!base) return null;
  const areas = [...base.areas];
  for (const a of topic ? TOPIC_AREAS[topic] : []) if (!areas.includes(a)) areas.push(a);
  return { areas, transits: base.transits };
}

function findSubject(input: PlanInput, intent: Intent): { subject: PlanProfile; switched: boolean; missing: Relation | null } {
  if (intent.subject.kind === 'self') return { subject: input.profile, switched: false, missing: null };
  const rel = intent.subject.relation;
  // The open chart may already be that person ("Ma", relationship "mother").
  if (input.profile.isYou === false && relationMatches(input.profile.relationship, rel)) {
    return { subject: input.profile, switched: false, missing: null };
  }
  const match = (input.people ?? []).filter(p => p.isYou === false && relationMatches(p.relationship, rel));
  // Two sisters: ambiguous, so ask rather than guess.
  if (match.length === 1) return { subject: match[0], switched: true, missing: null };
  return { subject: input.profile, switched: false, missing: rel };
}

export function buildPlan(input: PlanInput): AnswerPlan {
  const now = input.now ?? new Date();
  const agent: AgentId = input.agent ?? input.mode ?? 'saga';
  const mode = input.mode ?? GURUS[agent]?.mode ?? 'saga';
  const previous = (input.history ?? []).filter(m => m.role === 'user').map(m => m.content);
  const intent = classifyIntent(input.question, previous);
  const { subject, switched, missing } = findSubject(input, intent);
  const age = ageOn(subject.birthDate, now);
  const plan: AnswerPlan = {
    question: input.question, lang: input.lang, agent, mode, now, intent, subject,
    subjectSwitched: switched, missingRelation: missing, age,
    route: 'answer', decline: null, canned: null, timing: null, notes: [], facts: [], advice: intent.advice,
    focus: planFocus(agent, intent.topic && intent.topic !== 'chart' ? intent.topic : null),
    content: null, rewrite: null,
  };

  if (intent.safety === 'crisis' && GURUS[agent]?.crisisGuard !== false) return { ...plan, route: 'crisis' };
  if (mode === 'saga' && isPureGreeting(input.question)) return { ...plan, route: 'greeting' };
  if (mode === 'krishna') return plan;
  if (intent.safety === 'childSex' || intent.safety === 'partnerName') return { ...plan, route: 'canned', canned: intent.safety };
  if (intent.safety === 'death') return { ...plan, route: 'decline', decline: 'death' };
  if (missing) return { ...plan, route: 'decline', decline: 'otherMissing' };

  let topic: TimingTopic | null = intent.topic && intent.topic !== 'chart' ? intent.topic : null;
  if (!topic && intent.timing && intent.topic !== 'chart') topic = GURU_DEFAULT_TOPIC[agent] ?? 'general';

  if (topic && age != null && age < 18 && ADULT_TOPICS.has(topic)) {
    // Redirect to studies, with the study window.
    return withTiming({ ...plan, route: 'decline', decline: 'minorRomance' }, 'education', true);
  }
  if (topic === 'children' && age != null && age >= ELDER_AGE) {
    return { ...plan, route: 'decline', decline: 'elderChildren' };
  }
  const withContent = (p: AnswerPlan): AnswerPlan => {
    const ask = askFor(intent, agent);
    if (!ask || intent.topic === 'chart') return p;
    const content = planAsk(ask, intent.kind, p.subject, now, topic);
    if (!content) return p;
    return { ...p, content, rewrite: intent.clarifies ? ASK_QUESTION[ask][input.lang] : null };
  };
  if (!topic) return withContent(plan);
  return withContent(withTiming(plan, topic, intent.timing));
}

/**
 * The ask a question gets: its own (intent.ask), else the guru's default for
 * a "which / what kind / how can I" question without a topic of its own, or
 * whose topic is the guru's own ("which job" in Career).
 */
export function askFor(intent: Intent, agent: AgentId): Ask | null {
  if (intent.kind === 'timing') return null;
  if (intent.ask) return intent.ask;
  const def = GURU_DEFAULT_ASK[agent];
  if (!def) return null;
  const own = !intent.topic || intent.topic === GURU_DEFAULT_TOPIC[agent] || (agent === 'saga' && intent.topic === 'general');
  if (!own) return null;
  if (agent === 'saga') return intent.kind === 'nature' && !intent.topic ? def : null;
  return intent.kind === 'choice' || intent.kind === 'nature' || (intent.kind === 'advice' && def !== 'partner') ? def : null;
}

function withTiming(plan: AnswerPlan, topic: TimingTopic, asked: boolean): AnswerPlan {
  const past = plan.intent.past;
  const result = timingWindows(plan.subject, topic, plan.now, { past });
  const best = result.windows[0];
  if (!best) return plan;
  const notes: Note[] = [];
  if (!result.hasTime) notes.push('noTime');
  else if (!result.hasPlace) notes.push('noPlace');
  if (result.nakshatraUncertain && result.hasTime) notes.push('nakshatraUncertain');
  if (plan.intent.exactDate) notes.push('exactDate');
  if (asked && !past && (plan.intent.exactDate || plan.intent.inherited)) notes.push('narrow');
  if (past) notes.push('past');
  else {
    if (!result.strongWithin) notes.push('noStrong');
    else if (best.strength === 'moderate') notes.push('moderate');
    if (yearsAway(best, plan.now) >= 3) notes.push('far');
  }
  return {
    ...plan,
    timing: { topic, result, best, second: result.windows[1] ?? null, asked },
    notes,
    facts: keyFacts(plan.subject, topic),
  };
}

/** The windows the reply's dates may come from (best first). */
export function planWindows(plan: AnswerPlan): TimingWindow[] {
  return plan.timing ? plan.timing.result.windows : [];
}
