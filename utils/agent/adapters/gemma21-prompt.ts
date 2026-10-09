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
};

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
export function sagaSystem({ profile, lang, now, focus, timing }: SagaPromptInput): string {
  let context = getAstrologyContext(profile, { version: 2, date: now });
  if (focus) context = focusContext(context, focus);
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
