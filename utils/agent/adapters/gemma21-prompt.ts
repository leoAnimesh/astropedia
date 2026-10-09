/**
 * Prompt formats of astro-gemma v2 / v2.1 (CONTEXT_VERSION 2). Everything
 * model-specific about the chat prompt lives here and in ./gemma21.ts; the
 * rest of the pipeline speaks in AnswerPlans.
 *
 * The strings must stay identical to the student_* functions in
 * ml/data/build_sft.py, which the model was trained on:
 *   [saga]\nLang: hi\nToday: YYYY-MM-DD\n<v2 context>\nBirth time unknown.\n<Timing block>
 *
 * Timing questions (an AnswerPlan with timing windows) get the one change
 * the date eval chose (ml/data/RUN_V3.md "Saga v2.2: timing windows"):
 * the "From around Mon YYYY it moves into …" ingress sentences whose months
 * fall outside the engine's windows are cut from the "Now (sky today)" lines
 * (where the planet is now stays), and, with `timingLine`, the engine's best
 * window is added as the first Timing line in the block's own grammar:
 *   "- Best window for marriage: Mar 2028 to Nov 2028 (peak Jul 2028)".
 * Pure: no React Native.
 */
import {
  getAstrologyContext, getFullKundli, getTimingContext, monthYear, type ContextProfile,
} from '../../astrology';
import { dateInWindows, type TimingTopic, type TimingWindow } from '../../timing-engine';
import { focusContext, type ContextFocus } from '../../guru-context';
import type { AnswerContent } from '../astrologer';
import { ASK_QUESTION } from '../ask-strings';
import type { AnswerPlan } from '../plan';
import { allowedDateWindows } from '../verify';
import { westernDigits } from '../../reply-guards';
import type { LifeArea } from '../../../constants/gurus';

export type GemmaLang = 'en' | 'hi' | 'bn';

/** "" for English, "\nLang: hi" / "\nLang: bn" otherwise (ml/data/build_sft.py lang_line). */
export const langLine = (lang: GemmaLang) => (lang === 'en' ? '' : `\nLang: ${lang}`);

/** Local YYYY-MM-DD of `d` (the prompt's "Today:"). */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** How a timing answer's prompt is shaped (the date eval's variants). */
export type TimingPromptMode = 'baseline' | 'filter' | 'line-top' | 'line-bottom';

/** English topic words for the Timing line (the context is always English). */
export const TOPIC_PHRASE: Record<TimingTopic, string> = {
  marriage: 'marriage', love: 'love', job: 'a new job', promotion: 'promotion', business: 'business',
  money: 'money', property: 'buying property', children: 'children', education: 'studies', foreign: 'going abroad',
  health: 'better health', legal: 'legal matters', general: 'good luck',
};

export type SagaPromptInput = {
  profile: ContextProfile;
  lang: GemmaLang;
  now: Date;
  /** Chart lines to keep (AnswerPlan.focus, GURU_CONTEXT_FOCUS); null = full context. */
  focus?: ContextFocus | null;
  timing?: { topic: TimingTopic; windows: TimingWindow[]; mode: TimingPromptMode } | null;
  /**
   * A non-timing answer's plan (AnswerPlan.content): its key items are put on
   * the matching Life areas line, and dated transit sentences outside
   * `allowed` are cut so the model can't copy a date nobody asked for.
   */
  content?: { content: AnswerContent | null; allowed: TimingWindow[]; mode: ContentPromptMode } | null;
};

/**
 * How a non-timing answer's plan reaches the v2.1 prompt (chosen by the
 * answer-type eval, scratchpad agent/at):
 *  - baseline: nothing (the shipped behaviour before answer types);
 *  - nodate:   dated "From around …" transit sentences outside the allowed
 *              windows are cut;
 *  - line:     nodate + the plan's items appended to the matching Life areas
 *              line ("…; best fits: technology and data, …"), which is moved
 *              to the top of the block;
 *  - line-q:   line + every planned "which / what kind" question sent as the
 *              plan's standalone question (ASK_QUESTION), not only clarifications.
 */
export type ContentPromptMode = 'baseline' | 'nodate' | 'line' | 'line-q';

/** The Life areas line an ask's items belong on. */
const ASK_AREA: Record<string, LifeArea | null> = {
  careerField: 'Career', businessVsJob: 'Career', partner: 'Love/marriage', moneySources: 'Money',
  studyField: 'Romance/children/study', strengths: 'Self/health', wellbeing: 'Self/health',
  relocation: 'Abroad/spending/spiritual', whyNow: 'Mind',
  // Stage 2 planners, on the Life areas line the v2.1 model already reads for that area.
  family: 'Home/family', relationship: 'Love/marriage', purpose: 'Growth/luck', remedies: 'Self/health', loveArranged: 'Love/marriage',
};
const ASK_CUE: Record<string, string> = {
  careerField: 'best fits', businessVsJob: 'better path', partner: 'partner likely', moneySources: 'money from',
  studyField: 'best subjects', strengths: 'strengths', wellbeing: 'habits to keep', relocation: 'leans to', whyNow: 'right now',
  family: 'dynamics', relationship: 'pattern', purpose: 'path', remedies: 'free remedies', loveArranged: 'leans to',
};

/**
 * Categories (AnswerPlan.resolved) astro-gemma v2.1 still writes; every other
 * category is answered from the plan's template when this adapter is active.
 * Chosen by the Stage 2 measurement (scratchpad agent/model-eval.ts: the
 * question bank on the shipped prompt mapping, greedy, planGuard + verify):
 * must-include pass with the model ≥ 70% and no unsafe wording (career 93%,
 * business 90%, partner 90%, family 90%, studies 90%, love/arranged 100%,
 * personality 100%); timing categories scored 0-60% (the model opens with
 * sympathy instead of the window, gives vague reasons, and once told a user
 * "marriage is not shown in your chart"); children (70%) and health (71%)
 * are left out for their wording ("the chart shows no clear date for a baby",
 * "don't think about children until then"). Re-measure when a new model ships.
 */
export const GEMMA21_MODEL_CATEGORIES: ReadonlySet<string> = new Set([
  'career_field', 'business_vs_job', 'partner_traits_meeting', 'family_parents_siblings', 'education_field',
  'love_vs_arranged', 'personality',
]);

/**
 * The training-seed phrasing (ml/data/questions.py) a Stage 2 category is
 * sent as when the user's own question is far from what v2.1 saw: the model
 * answers in-distribution and the plan's lines are verified / appended after.
 * Only categories whose seed keeps the question's meaning.
 */
export const CATEGORY_SEED: Partial<Record<string, string>> = {
  why_now_current_phase: 'Why is everything so hard right now?',
  personality: 'What kind of person am I really?',
  mental_health_distress: 'What does this phase of my life mean?',
};

/** Puts the content's items on its Life areas line (moved first) in the context's own grammar. */
export function contentLine(context: string, content: AnswerContent): string {
  const area = ASK_AREA[content.ask];
  const cue = ASK_CUE[content.ask];
  const items = content.items.map(i => (i.text.short ?? i.text.label).en);
  const extra = content.extra.filter(e => e.kind === 'meet' || e.kind === 'place' || e.kind === 'field').map(e => e.text.en);
  const add = `; ${cue}: ${[...items, ...extra].join(', ')}`;
  const lines = context.split('\n');
  const start = lines.findIndex(l => /^Life areas\b/.test(l));
  if (start < 0) return context;
  let end = start + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  const block = lines.slice(start + 1, end);
  const at = area ? block.findIndex(l => l.startsWith(`- ${area}:`)) : -1;
  if (at < 0) {
    block.unshift(`- ${area ?? 'Now'}: ${add.slice(2)}`);
  } else {
    const [line] = block.splice(at, 1);
    block.unshift(line + add);
  }
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join('\n');
}

const CTX_MONTH_YEAR = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})\b/g;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Cuts the dated ingress sentence(s) of "Now (sky today)" lines when the
 * ingress month (the line's first month-year, the one the model copies) is
 * not inside `windows` (±1 month). The planet's current
 * place and its note stay; Life areas and the Timing block are untouched.
 */
export function filterTransitDates(context: string, windows: TimingWindow[]): string {
  let inNow = false;
  return context.split('\n').map((line) => {
    if (/^Now \(sky today\):/.test(line)) { inNow = true; return line; }
    if (!line.startsWith('- ')) { inNow = false; return line; }
    if (!inNow) return line;
    const at = line.search(/ From around \w+ \d{4} it (?:moves|slips back) into/);
    if (at < 0) return line;
    const dated = line.slice(at);
    const m = [...dated.matchAll(CTX_MONTH_YEAR)][0];
    const ok = !!m && dateInWindows({ year: Number(m[2]), month: MONTHS.indexOf(m[1]) + 1 }, windows);
    return ok ? line : line.slice(0, at);
  }).join('\n');
}

/** "- Best window for marriage: Mar 2028 to Nov 2028 (peak Jul 2028)". */
export function windowLine(topic: TimingTopic, w: TimingWindow): string {
  const peak = monthYear(w.peak);
  const range = `${monthYear(w.start)} to ${monthYear(w.end)}`;
  return `- Best window for ${TOPIC_PHRASE[topic]}: ${range}${peak !== monthYear(w.start) || peak !== monthYear(w.end) ? ` (peak ${peak})` : ''}`;
}

/** The [saga] system prompt for one question. */
export function sagaSystem({ profile, lang, now, focus, timing, content }: SagaPromptInput): string {
  let context = getAstrologyContext(profile, { version: 2, date: now });
  if (focus) context = focusContext(context, focus);
  if (content && content.mode !== 'baseline') {
    context = filterTransitDates(context, content.allowed);
    if ((content.mode === 'line' || content.mode === 'line-q') && content.content) context = contentLine(context, content.content);
  }
  const timeNote = profile.birthTime ? '' : '\nBirth time unknown.';
  let block = getTimingContext(profile, now, 2);
  if (timing && timing.mode !== 'baseline' && timing.windows.length) {
    context = filterTransitDates(context, timing.windows);
    const line = windowLine(timing.topic, timing.windows[0]);
    const lines = block.split('\n');
    if (lines.length > 1 && timing.mode === 'line-top') block = [lines[0], line, ...lines.slice(1)].join('\n');
    if (lines.length > 1 && timing.mode === 'line-bottom') block = [...lines, line].join('\n');
  }
  return `[saga]${langLine(lang)}\nToday: ${isoDay(now)}\n${context}${timeNote}\n${block}`;
}

/** [krishna] system prompt (build_sft.student_krishna_system). */
export function krishnaSystem(userName: string | undefined, versePrompt: string, lang: GemmaLang): string {
  const name = userName ? `\nName: ${userName.split(' ')[0]}` : '';
  return `[krishna]${langLine(lang)}${name}\nVerse: ${versePrompt}`;
}

/** [reading] system prompt (build_sft.student_reading_system): the big three, nakshatra and current phase. */
export function readingSystem(profile: ContextProfile, lang: GemmaLang): string {
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

/** The [reading] user turn. */
export const READING_USER = 'Read my chart.';

/** [title] system prompt and user turn (build_sft.student_title). */
export function titlePrompt(question: string, reply: string, lang: GemmaLang): { system: string; user: string } {
  return { system: `[title]${langLine(lang)}`, user: `User: ${question}\nAssistant: ${reply}` };
}

/**
 * The [saga] chat prompt parts for a plan: the system prompt (timing line or
 * content line, see sagaSystem), the user turn the model reads (the plan's
 * re-read question for a clarification, Western digits) and whether earlier
 * turns are left out (a clarification is sent as the standalone question, so
 * the model can't continue its earlier answer). `focus` is AnswerPlan.focus
 * when GURU_CONTEXT_FOCUS is on.
 */
export function sagaChatParts(
  plan: AnswerPlan,
  { timingMode, contentMode, focus = null, clarifyDropsHistory }: {
    timingMode: TimingPromptMode; contentMode: ContentPromptMode; focus?: ContextFocus | null; clarifyDropsHistory: boolean;
  },
): { system: string; question: string; dropHistory: boolean } {
  const t = plan.timing;
  const allowed = allowedDateWindows(plan);
  const system = sagaSystem({
    profile: plan.subject,
    lang: plan.lang,
    now: plan.now,
    focus,
    timing: t && t.asked && plan.route === 'answer' ? { topic: t.topic, windows: t.result.windows, mode: timingMode } : null,
    content: allowed ? { content: plan.content, allowed, mode: contentMode } : null,
  });
  const c = plan.content;
  const seed = plan.lang === 'en' && !plan.intent.timing ? CATEGORY_SEED[plan.resolved] ?? null : null;
  const rewrite = contentMode === 'baseline' ? null
    : contentMode === 'line-q' && c && !plan.intent.timing && (plan.intent.kind === 'choice' || plan.intent.kind === 'nature')
      ? ASK_QUESTION[c.ask][plan.lang] : plan.rewrite ?? seed;
  return {
    system,
    question: westernDigits(rewrite ?? plan.question),
    dropHistory: !!rewrite && plan.intent.clarifies && clarifyDropsHistory,
  };
}
