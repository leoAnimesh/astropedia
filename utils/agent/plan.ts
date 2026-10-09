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
  lordOfHouse, natalChart, nearerStretch, timingWindows, topicLinks, TOPIC_RULES, yearsAway,
  type TimingResult, type TimingTopic, type TimingWindow, type Planet,
} from '../timing-engine';
import { classifyIntent, relationIn, relationMatches, type Ask, type Intent, type Relation } from './intent';
import { planAsk, type AnswerContent } from './astrologer';
import { ASK_QUESTION } from './ask-strings';
import type { Lang } from './strings';
import type { Category, FollowUp } from './categories';
import { threadFacts, type ThreadFacts } from './thread-facts';
import { applyCategory, line, CATEGORY_TOPIC, PERMANENT_RE } from './routes';
import type { CheckPlan, PlanCode, PlanLine } from './checks';

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

export type Decline =
  | 'death' | 'minorRomance' | 'elderChildren' | 'otherMissing'
  // Stage 2 safety routes (rules.md §2): emergency symptoms, abuse, identity attributes, the baby's-sex "why not?", two matching profiles.
  | 'emergency' | 'abuse' | 'identity' | 'childSexWhy' | 'askWhich';

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
  /** rules.md category of the message (its form) and the content category the answer follows. */
  category: Category;
  resolved: Category;
  followUp: FollowUp | null;
  /** What the user told us earlier in the thread (stored with the thread; thread-facts.ts). */
  thread: ThreadFacts;
  /** Sentences the answer must carry (routes.ts), each with its rules.md code. */
  say: PlanLine[];
  /** rules.md plan codes this answer intends to cover (verify layer, tests). */
  must: PlanCode[];
  /** Answered from the plan alone, also when a model is installed (feature routes, sensitive categories). */
  deterministic: boolean;
  /** The template leaves out the plan's own timing / content paragraph (the lines say what's needed). */
  coreOff: boolean;
  /** What the checks read: windows, chart-fact dates, content terms (checks.ts CheckPlan). */
  checks: Pick<CheckPlan, 'windows' | 'alt' | 'factDates' | 'itemTerms' | 'exampleTerms' | 'extraTerms' | 'otherName'>;
  /** The plan of the previous user question in the thread (one level). */
  prev: AnswerPlan | null;
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
  /** Facts stored with the thread (threads.facts), folded with what the visible history says. */
  facts?: ThreadFacts | null;
  /** Internal: don't rebuild the previous turn's plan (it is one level deep). */
  noPrev?: boolean;
};

/** Family pushing a minor about marriage ("ghar wale pareshan hain", "barir lok chap dicche"). */
const FAMILY_RE = /\b(?:family|parents|ghar ?wale|gharwale|ghar ke log|mummy|papa|maa|barir lok|bari(?:r)? theke|baba|ma)\b|परिवार|घर ?वाले|घरवाले|माता-पिता|मम्मी|पापा|বাড়ির লোক|পরিবার|বাবা|মা\b/i;
const PRESSURE_RE = /pressur|\bforc|\bpush|pareshan|dabav|dabaav|zabardasti|\bchap\b|\bchaap\b|jor kor|दबाव|परेशान|ज़बरदस्ती|जबरदस्ती|চাপ|জোর কর/i;

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

function findSubject(input: PlanInput, intent: Intent): { subject: PlanProfile; switched: boolean; missing: Relation | null; several: PlanProfile[] } {
  if (intent.subject.kind === 'self') return { subject: input.profile, switched: false, missing: null, several: [] };
  const rel = intent.subject.relation;
  // The open chart may already be that person ("Ma", relationship "mother").
  if (input.profile.isYou === false && relationMatches(input.profile.relationship, rel)) {
    return { subject: input.profile, switched: false, missing: null, several: [] };
  }
  const match = (input.people ?? []).filter(p => p.isYou === false && relationMatches(p.relationship, rel));
  // Two sisters: ambiguous, so ask rather than guess.
  if (match.length === 1) return { subject: match[0], switched: true, missing: null, several: [] };
  return { subject: input.profile, switched: false, missing: rel, several: match.length > 1 ? match : [] };
}

/** Categories answered from the plan alone even when a model is installed (feature data, sensitive wording). */
const DETERMINISTIC: Category[] = [
  'muhurat', 'lucky_factors', 'compatibility_other_person', 'chart_technical', 'off_topic', 'greeting', 'abusive_or_very_short',
  'sensitive_identity', 'remedies', 'divorce_separation', 'spirituality_purpose',
];

export function buildPlan(input: PlanInput): AnswerPlan {
  const now = input.now ?? new Date();
  const agent: AgentId = input.agent ?? input.mode ?? 'saga';
  const mode = input.mode ?? GURUS[agent]?.mode ?? 'saga';
  const history = input.history ?? [];
  const previous = history.filter(m => m.role === 'user').map(m => m.content);
  const thread = threadFacts(previous, input.facts, relationIn);
  let intent = classifyIntent(input.question, previous, thread);
  // The thread's facts include what this message states ("I'm already married").
  const facts: ThreadFacts = { ...thread, ...intent.stated };
  const { subject, switched, missing, several } = findSubject(input, intent);
  const age = ageOn(subject.birthDate, now);
  // The previous question's plan (one level): what was already said, for follow-ups.
  let prevPlan: AnswerPlan | null = null;
  if (!input.noPrev && previous.length) {
    const lastUser = history.map(m => m.role).lastIndexOf('user');
    try {
      prevPlan = buildPlan({ ...input, question: previous[previous.length - 1], history: history.slice(0, lastUser), noPrev: true });
    } catch { prevPlan = null; }
  }
  // "Will it be permanent or just for work?" right after an abroad answer is about settling abroad, not a job.
  if (prevPlan && (prevPlan.resolved === 'foreign_settlement' || prevPlan.timing?.topic === 'foreign') && PERMANENT_RE.test(input.question) && intent.topic !== 'foreign') {
    intent = { ...intent, topic: 'foreign', resolved: 'foreign_settlement', kind: 'choice', timing: false, ask: 'relocation' };
  }
  const plan: AnswerPlan = {
    question: input.question, lang: input.lang, agent, mode, now, intent, subject,
    subjectSwitched: switched, missingRelation: missing, age,
    route: 'answer', decline: null, canned: null, timing: null, notes: [], facts: [], advice: intent.advice,
    focus: planFocus(agent, intent.topic && intent.topic !== 'chart' ? intent.topic : null),
    content: null, rewrite: null,
    category: intent.category, resolved: intent.resolved, followUp: intent.followUp, thread: facts,
    say: [], must: [], deterministic: false, coreOff: false,
    checks: { windows: [], alt: [], factDates: [], itemTerms: [], exampleTerms: [], extraTerms: {}, otherName: null },
    prev: prevPlan,
  };
  const decline = (d: Decline, lines: PlanLine[] = [], codes: PlanCode[] = []): AnswerPlan =>
    ({ ...plan, route: 'decline', decline: d, say: lines, must: codes, deterministic: true });

  if ((intent.safety === 'crisis' || intent.category === 'crisis_self_harm') && GURUS[agent]?.crisisGuard !== false) return { ...plan, route: 'crisis', must: ['helpline'] };
  if (mode === 'saga' && (isPureGreeting(input.question) || intent.flags.smalltalk)) return { ...plan, route: 'greeting', must: ['greet_short'] };
  if (mode === 'krishna') return plan;
  if (intent.flags.emergency) return decline('emergency', [line('emergency', 'emergency', 'lead', {}, { required: true, also: ['doctor'] })], ['emergency', 'doctor']);
  if (intent.flags.abuse) return decline('abuse', [line('safety_resources', 'abuseSafety', 'lead', {}, { required: true, also: ['no_blame'] }), line('counsellor', 'abuseCounsellor', 'end')], ['safety_resources', 'no_blame']);
  if (intent.category === 'baby_sex' && intent.followUp === 'why') {
    return decline('childSexWhy', [line('decline_sex', 'childSexWhy', 'lead', {}, { also: ['explain_policy'] }), line('practical_step', 'childSexAlt', 'end')], ['decline_sex', 'explain_policy']);
  }
  if (intent.safety === 'childSex') return { ...plan, route: 'canned', canned: 'childSex', must: ['decline_sex'], deterministic: true };
  if (intent.safety === 'death') {
    const ill = intent.subject.kind === 'other' || intent.flags.feelings || /\b(?:father|mother|papa|baba|maa|mom|dad)\b|पिता|पापा|माँ|মা\b|বাবা/i.test(input.question);
    // An ill parent: sympathy first, then their doctors and the asker's own rest (never "ask me about the coming years").
    return decline('death', ill ? [line('validation', 'deathSorry', 'lead'), line('doctor', 'deathCare', 'end')] : [], ['decline_death', ...(ill ? ['validation' as PlanCode] : [])]);
  }
  if (intent.category === 'sensitive_identity') {
    const self = /\b(?:gay|lesbian|bisexual|sexuality|orientation)\b|समलैंगिक|সমকামী/i.test(input.question);
    return decline('identity', self
      ? [line('decline_attribute', 'identitySelf', 'lead', {}, { also: ['respect_choice'] })]
      : [line('decline_attribute', 'identity', 'lead'), line('decline_attribute', 'identityAlt', 'body')], ['decline_attribute', ...(self ? ['respect_choice' as PlanCode] : [])]);
  }
  if (several.length > 1) {
    return decline('askWhich', [line('ask_which', 'askWhich', 'lead', { relation: intent.subject.kind === 'other' ? intent.subject.relation : '', names: several.map(p => p.name.split(' ')[0]).join(', ') })], ['ask_which']);
  }
  // Another person's health without their profile: compassion, their doctors, care for the carer (never a prognosis).
  if (missing && (intent.topic === 'health' || intent.resolved === 'health_wellbeing')) {
    const who = { en: `your ${missing}`, hi: 'उनकी', bn: 'ওঁর' };
    return {
      ...plan, deterministic: true, coreOff: true,
      say: [line('validation', 'otherUnwell', 'lead', { name: who }, { also: ['doctor', 'explain_policy'] }), line('self_care', 'caregiver', 'body'), line('doctor', 'doctor', 'end', {}, { required: true })],
      must: ['doctor', 'self_care'],
    };
  }
  if (missing) return decline('otherMissing', [], ['ask_profile']);

  let topic: TimingTopic | null = intent.topic && intent.topic !== 'chart' ? intent.topic : null;
  // A "when" without a topic word reads the category's own topic first ("WBCS kobe clear hobe?" → job, not luck).
  if (!topic && intent.timing && intent.topic !== 'chart') {
    topic = (agent !== 'saga' ? GURU_DEFAULT_TOPIC[agent] : undefined) ?? (intent.flags.grandchildren ? undefined : CATEGORY_TOPIC[intent.resolved])
      ?? GURU_DEFAULT_TOPIC[agent] ?? 'general';
  }
  // The thread's facts re-route a topic: "I already have a job" + job → career growth.
  if (topic === 'job' && facts.employed && !/\b(?:switch|change|new job|resign|quit)\b|बदल|বদল/i.test(input.question)) topic = 'promotion';

  if (topic && age != null && age < 18 && ADULT_TOPICS.has(topic)) {
    // Redirect to studies, with the study window.
    const pressure = FAMILY_RE.test(input.question) && PRESSURE_RE.test(input.question);
    const say = pressure ? [line('safety_resources', 'minorPressure', 'body', {}, { also: ['counsellor'] })] : [];
    const p = withTiming({ ...plan, route: 'decline', decline: 'minorRomance', category: 'minor', deterministic: true, say, must: ['minor_redirect'] }, 'education', true);
    return p;
  }
  if (topic === 'children' && age != null && age >= ELDER_AGE) {
    return decline('elderChildren', [line('doctor', 'elderChildDoctor', 'end')], ['elder_gentle', 'doctor']);
  }
  if (age != null && age >= ELDER_AGE && (intent.flags.retirement || intent.flags.grandchildren)) plan.category = 'elderly';

  const withContent = (p: AnswerPlan): AnswerPlan => {
    const ask = askFor(intent, agent);
    if (!ask || intent.topic === 'chart' || p.content) return p;
    const content = planAsk(ask, intent.kind, p.subject, now, topic, { question: input.question, secular: facts.secular });
    if (!content) return p;
    return { ...p, content, rewrite: intent.clarifies ? ASK_QUESTION[ask][input.lang] : null };
  };
  let p = topic && !['muhurat', 'lucky_factors', 'chart_technical', 'remedies', 'compatibility_other_person'].includes(intent.resolved)
    ? withContent(withTiming(plan, topic, intent.timing)) : withContent(plan);
  p = applyCategory(p, {
    question: input.question,
    people: input.people ?? [],
    prev: prevPlan,
    timing: (q, t, asked) => (q.timing && q.timing.topic === t ? { ...q, timing: { ...q.timing, asked: q.timing.asked || asked } } : withTiming({ ...q, timing: null }, t, asked)),
    content: (q, ask, kind) => planAsk(ask, kind ?? q.intent.kind, q.subject, now, q.timing?.topic ?? topic, { question: input.question, secular: facts.secular }),
  });
  if (DETERMINISTIC.includes(p.resolved) || DETERMINISTIC.includes(p.category)) p.deterministic = true;
  finishChecks(p);
  return p;
}

/** The check view of a plan (checks.ts): its windows, item terms, examples and extra terms. */
function finishChecks(p: AnswerPlan): void {
  const c = p.checks;
  if (p.timing) c.windows.unshift(...p.timing.result.windows);
  if (p.timing?.result.nextStrong) c.alt.push(p.timing.result.nextStrong);
  // The nearer, softer stretch the template may offer before a far window (template.ts altSentence).
  if (p.timing && !p.timing.result.past) {
    const n = nearerStretch(p.timing.result, p.timing.best);
    if (n) c.alt.push({ ...n, peak: n.start } as TimingWindow);
  }
  if (p.timing?.second) c.alt.push(p.timing.second);
  if (p.content) {
    c.itemTerms.push(...p.content.items.map(i => i.text.terms));
    for (const it of p.content.items.slice(0, 2)) if (it.text.examples) c.exampleTerms.push(...it.text.examples.en.split(/,\s*/).slice(0, 3).map(x => x.split(' ')[0].toLowerCase()).filter(x => x.length > 2), ...it.text.examples.hi.split(/,\s*/).slice(0, 3).map(x => x.split(' ')[0]), ...it.text.examples.bn.split(/,\s*/).slice(0, 3).map(x => x.split(' ')[0]));
    const meet = p.content.extra.find(e => e.kind === 'meet');
    if (meet) c.extraTerms.meeting_context = [meet.text.en, meet.text.hi, meet.text.bn].map(t => t.split(/,| or | या | বা /)[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (p.content.ask === 'relocation' || p.content.ask === 'businessVsJob' || p.content.ask === 'loveArranged') c.extraTerms.leaning = p.content.items[0].text.terms;
    if (p.content.ask === 'whyNow') c.factDates.push(...p.content.allowedDates);
  }
  if (p.subjectSwitched) c.otherName = p.subject.name.split(' ')[0];
  if (p.timing?.result.past) c.windows.push(...p.timing.result.windows);
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

export function withTiming(plan: AnswerPlan, topic: TimingTopic, asked: boolean): AnswerPlan {
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

/** The plan as the checks read it (checks.ts). */
export function checkView(plan: AnswerPlan): CheckPlan {
  return {
    lang: plan.lang, now: plan.now, say: plan.say, past: !!plan.timing?.result.past, kind: plan.intent.kind,
    ...plan.checks,
    windows: plan.checks.windows.map(w => ({ start: w.start, end: w.end, peak: w.peak })),
  };
}

/** The windows the reply's dates may come from (best first). */
export function planWindows(plan: AnswerPlan): TimingWindow[] {
  return plan.timing ? plan.timing.result.windows : [];
}
