/**
 * Category routing (ml/astro-kb/rules.md §5): what each of the 46 categories
 * adds to an AnswerPlan beyond its timing window and planner content. Every
 * route states its lines as PlanLines (code + en / hi / bn sentence), so the
 * template renders them, model adapters get them as instructions, and the
 * verify layer appends the required ones a model reply leaves out.
 *
 * Feature routes read the app's own engines: lucky values (utils/lucky.ts),
 * upcoming muhurat days (utils/muhurat.ts), the 36-point match with a saved
 * partner profile (utils/ashtakoota.ts), manglik / sade sati / dasha facts.
 * Pure (no React Native): muhurat's day reasons go through utils/i18n, which
 * Node tests shim.
 */
import { getDashaTimeline, getLifeChapters } from '../astrology';
import { getSadeSati } from '../sade-sati';
import { matchCharts, personChart, type KootaKey } from '../ashtakoota';
import { getLuckyForDay, LUCKY_COLOR, LUCKY_NUMBER } from '../lucky';
import { findMuhurats, type Activity } from '../muhurat';
import { natalChart, timingWindows, splitPeriod, type Planet, type TimingTopic, type TimingWindow } from '../timing-engine';
import { SIGN_RULER } from '../chart-analysis';
import type { AnswerContent } from './astrologer';
import { askYogas, govtIndicator, optionLeaning, partnershipGood, OPTION_LABEL, saturnPressure } from './astrologer';
import { AREA_OF_HOUSE, TIP2, type L3 } from './ask-strings';
import { ACTIVITY, C, COLOUR, GEM_OF, KOOTA_PLAIN, MONTH_SHORT, PLANET_PLAIN, VERDICT, WEEKDAY, YOGA_PLAIN, type CKey } from './category-strings';
import { isYesNo, relationIn, relationMatches } from './intent';
import { AREA, AREA_GEN_BN, HELPS, S, fill, monthLabel, type Lang } from './strings';
import type { PlanCode, PlanLine } from './checks';
import type { AnswerPlan, PlanProfile } from './plan';

const LANGS: Lang[] = ['en', 'hi', 'bn'];
type Vars = Record<string, string | L3 | ((l: Lang) => string)>;
const val = (v: Vars[string], l: Lang) => (typeof v === 'function' ? v(l) : typeof v === 'string' ? v : v[l]);

/** A PlanLine from a C key (or a ready L3) with {vars} filled per language. */
export function line(code: PlanCode, text: CKey | L3, pos: PlanLine['pos'] = 'body', vars: Vars = {}, extra: Partial<PlanLine> = {}): PlanLine {
  const t: L3 = typeof text === 'string' ? C[text] : text;
  const out = {} as L3;
  for (const l of LANGS) out[l] = fill(t[l], Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, val(v, l)])));
  return { code, text: out, pos, ...extra };
}

const firstName = (n: string) => n.split(' ')[0];
const ml = (d: Date) => (l: Lang) => monthLabel(d, l, { western: true });

/** "This year / now / this cycle" in a question (en / hi / bn, Hinglish / Banglish). */
export const NEAR_RE = /\bthis (?:year|month|time|appraisal|cycle)\b|\bnow\b|\bsoon\b|\bis this a good time\b|\bis saal\b|\bis baar\b|\bei bochh?or\b|\bebar\b|इस साल|इस बार|अभी|এই বছর|এবার|এখন/i;

/** The likelihood ladder (rules.md §1.9) from the plan's best window. */
export function likelihoodLine(plan: AnswerPlan, pos: PlanLine['pos'] = 'lead'): PlanLine | null {
  const t = plan.timing;
  const w = t?.best;
  if (!t || !w) return null;
  const YEAR = 365.25 * 86400000;
  // "This year?", "now?", "soon?": is a window open in the coming twelve months?
  if (t.result.past || plan.category === 'past_event_verification' || plan.say.some(l => l.code === 'explain_policy')) return null;
  const near = NEAR_RE.test(plan.question);
  let key: CKey;
  if (near) {
    // "This year? Now? This cycle?" gets a direct yes / not-yet before the window (rubric 3.1).
    const horizon = plan.now.getTime() + YEAR;
    const open = t.result.windows.filter(x => x.start.getTime() <= horizon);
    if (open.some(x => x.strength === 'strong')) return line('likelihood', S.nearYes, pos);
    if (!open.length) return line('likelihood', S.nearNo, pos);
    key = 'likelyModerate';
  } else {
    const years = (w.start.getTime() - plan.now.getTime()) / YEAR;
    const promise = plan.facts[0]?.code;
    key = (w.strength === 'strong' && years < 3) || (promise === 'promiseGood' && w.strength !== 'weak') ? 'likelyStrong'
      : w.strength === 'weak' || plan.notes.includes('noStrong') || promise === 'promiseSlow' ? (years < 2 ? 'likelyModerate' : 'likelyWeak') : 'likelyModerate';
  }
  return line('likelihood', key, pos);
}

/** A yes/no answer's window in one sentence, for routes whose full timing paragraph is off (rubric: yes/no → likelihood + window). */
function windowShortLine(plan: AnswerPlan): PlanLine | null {
  const w = plan.timing?.best;
  if (!w || plan.timing?.result.past) return null;
  return line('window', 'windowShort', 'body', { start: ml(w.start), end: ml(w.end) });
}

/** "Permanent or just for work / settle there?" (a foreign follow-up). */
export const PERMANENT_RE = /\bpermanent|\bsettle|\bjust for work\b|\bfor good\b|sthayi|sthayee|স্থায়ী|স্থায়ী|थायी|स्थायी|हमेशा के लिए|চিরকাল/i;

export type RouteCtx = {
  question: string;
  people: PlanProfile[];
  prev: AnswerPlan | null;
  /** Adds the engine window for a topic to the plan (plan.ts withTiming). */
  timing: (p: AnswerPlan, topic: TimingTopic, asked: boolean) => AnswerPlan;
  /** Runs a planner (astrologer.ts planAsk) for the plan's subject. */
  content: (p: AnswerPlan, ask: AnswerContent['ask'], kind?: AnswerPlan['intent']['kind']) => AnswerContent | null;
};

const add = (p: AnswerPlan, ...ls: (PlanLine | null | undefined | false)[]) => {
  for (const l of ls) if (l) p.say.push(l);
};
const must = (p: AnswerPlan, ...codes: PlanCode[]) => {
  for (const c of codes) if (!p.must.includes(c)) p.must.push(c);
};

/** The topic a category's window comes from (null: no engine window). */
export const CATEGORY_TOPIC: Partial<Record<string, TimingTopic>> = {
  career_field: 'job', job_change_timing: 'job', promotion: 'promotion', business_vs_job: 'business', government_job: 'job',
  foreign_settlement: 'foreign', money_wealth: 'money', debt_loans: 'money', property_vehicle: 'property', marriage_timing: 'marriage',
  love_vs_arranged: 'marriage', partner_traits_meeting: 'marriage', relationship_problems: 'love', divorce_separation: 'love',
  children_timing: 'children', family_parents_siblings: 'general', education_field: 'education', exams_competitive: 'education',
  health_wellbeing: 'health', mental_health_distress: 'general', legal_court: 'legal', why_now_current_phase: 'general', general_luck: 'general',
};

const PLANET_PHRASE: Record<Planet, L3> = {
  Sun: { en: 'the planet of authority', hi: 'अधिकार का ग्रह', bn: 'কর্তৃত্বের গ্রহ' }, Moon: { en: 'the planet of the mind', hi: 'मन का ग्रह', bn: 'মনের গ্রহ' },
  Mars: { en: 'the planet of energy', hi: 'ऊर्जा का ग्रह', bn: 'শক্তির গ্রহ' }, Mercury: { en: 'the planet of intellect', hi: 'बुद्धि का ग्रह', bn: 'বুদ্ধির গ্রহ' },
  Jupiter: { en: 'the planet of growth', hi: 'विकास का ग्रह', bn: 'বৃদ্ধির গ্রহ' }, Venus: { en: 'the planet of love and comfort', hi: 'प्रेम और सुख का ग्रह', bn: 'প্রেম আর স্বাচ্ছন্দ্যের গ্রহ' },
  Saturn: { en: 'the planet of discipline', hi: 'अनुशासन का ग्रह', bn: 'শৃঙ্খলার গ্রহ' }, Rahu: { en: 'the point of ambition', hi: 'महत्वाकांक्षा का बिंदु', bn: 'উচ্চাকাঙ্ক্ষার বিন্দু' },
  Ketu: { en: 'the point of focus and depth', hi: 'एकाग्रता और गहराई का बिंदु', bn: 'মনোযোগ আর গভীরতার বিন্দু' },
};

/** Hindi oblique ("अनुशासन के ग्रह") and Bengali genitive ("শৃঙ্খলার গ্রহের") forms of a planet phrase, for "…की अंतर्दशा" / "…অন্তর্দশা". */
const planetObl = (p: Planet) => PLANET_PHRASE[p].hi.replace(/का (ग्रह|बिंदु)$/, 'के $1');
const planetGen = (p: Planet) => PLANET_PHRASE[p].bn.replace(/গ্রহ$/, 'গ্রহের').replace(/বিন্দু$/, 'বিন্দুর');
const planetVars = (p: Planet) => ({ planet: PLANET_PHRASE[p], planetObl: planetObl(p), planetGen: planetGen(p) });

/** "it rules your career side" / "it sits in your partnership side": a dasha lord's tie to a topic, in plain words. */
function linkPhrase(plan: AnswerPlan, lord: Planet): L3 {
  const a = natalChart(plan.subject).analysis;
  const houses = a?.planets[lord].rules ?? [];
  const sits = a?.planets[lord].house ?? 1;
  const topicHouse = plan.timing ? [7, 10, 5, 4, 11, 2, 9, 12, 6, 1].find(h => houses.includes(h)) : undefined;
  const out = {} as L3;
  for (const l of LANGS) {
    out[l] = topicHouse
      ? fill({ en: 'it guides your {area} side', hi: 'यह आपके {area} वाले पहलू को चलाता है', bn: 'এটা আপনার {area} দিকটা চালায়' }[l], { area: AREA_OF_HOUSE[l][topicHouse] })
      : fill({ en: 'it sits in your {area} side', hi: 'यह आपके {area} वाले पहलू में है', bn: 'এটা আছে আপনার {area} দিকে' }[l], { area: AREA_OF_HOUSE[l][sits] });
  }
  return out;
}

// ─── Feature routes ──────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
function hourLabel(h: number, l: Lang): string {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (l === 'en') return `${hh % 12 || 12}:${pad(mm)} ${hh < 12 ? 'AM' : 'PM'}`;
  return `${pad(hh)}:${pad(mm)}`;
}
function dayLabel(iso: string, l: Lang): string {
  const d = new Date(iso + 'T12:00:00');
  return l === 'en' ? `${WEEKDAY.en[d.getDay()]} ${d.getDate()} ${MONTH_SHORT.en[d.getMonth()]}` : `${WEEKDAY[l][d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[l][d.getMonth()]}`;
}

function muhuratRoute(plan: AnswerPlan, activity: string | null | undefined): void {
  plan.deterministic = true;
  const act: Activity = activity === 'sign' || activity === 'buy' || activity === 'travel' ? activity : 'work';
  if (activity === 'ceremony') {
    // Griha pravesh / wedding: the family priest fixes the day; offering "starting work" days would answer a different question.
    add(plan, line('explain_policy', 'ceremony', 'lead'), line('muhurat_days', 'muhuratMore', 'end'));
    must(plan, 'muhurat_days');
    return;
  }
  if (/\b(?:surgery|operation)\b|ऑपरेशन|অপারেশন/i.test(plan.question)) add(plan, line('doctor', 'muhuratDoctor', 'lead', {}, { required: true }));
  let days: { date: string; start: number; end: number; favoured: boolean }[] = [];
  try {
    const found = (n: number) => findMuhurats(act, plan.subject.birthLat, plan.subject.birthLng, n, plan.now)
      .filter(d => d.window && !d.passed).map(d => ({ date: d.date, start: d.window!.startHour, end: d.window!.endHour, favoured: d.favoured }));
    days = found(7);
    if (days.length < 2) days = found(14);
  } catch { days = []; }
  days.sort((a, b) => Number(b.favoured) - Number(a.favoured) || a.date.localeCompare(b.date));
  const pick = days.slice(0, 2).sort((a, b) => a.date.localeCompare(b.date));
  if (pick.length) {
    const list = (l: Lang) => pick.map(d => `${dayLabel(d.date, l)} (${hourLabel(d.start, l)}–${hourLabel(d.end, l)})`).join(l === 'en' ? ' and ' : l === 'hi' ? ' और ' : ' আর ');
    const terms = pick.map(d => { const x = new Date(d.date + 'T12:00:00'); return `${WEEKDAY.en[x.getDay()]}|${WEEKDAY.hi[x.getDay()]}|${WEEKDAY.bn[x.getDay()]}`; }).join('|');
    add(plan, line('muhurat_days', 'muhuratDays', activity === 'ceremony' ? 'body' : 'lead', { activity: ACTIVITY[act], days: list }, { terms: `${terms}|muhurat|मुहूर्त|মুহূর্ত` }));
  } else {
    add(plan, line('muhurat_days', 'muhuratNone', 'lead', { activity: ACTIVITY[act] }));
  }
  add(plan, line('muhurat_days', 'muhuratMore', 'end'));
  must(plan, 'muhurat_days');
}

function luckyRoute(plan: AnswerPlan, kind: string | null | undefined): void {
  plan.deterministic = true;
  const lucky = getLuckyForDay(plan.subject, plan.now);
  const c = natalChart(plan.subject);
  const moonRuler = SIGN_RULER[c.moonSign];
  const colour = COLOUR[lucky.color] ?? COLOUR.white;
  const terms = `${colour.en}|${colour.hi}|${colour.bn}|\\b${lucky.number}\\b`;
  if (kind === 'number') {
    add(plan, line('lucky_values', 'luckyNumber', 'lead', { number: String(LUCKY_NUMBER[moonRuler] ?? lucky.number), planet: PLANET_PLAIN[moonRuler], today: String(lucky.number) },
      { terms: `\\b(?:${LUCKY_NUMBER[moonRuler] ?? lucky.number}|${lucky.number})\\b` }));
  } else if (kind === 'day') {
    const WEEKDAY_OF: Record<string, number> = { Sun: 0, Moon: 1, Mars: 2, Mercury: 3, Jupiter: 4, Venus: 5, Saturn: 6 };
    const wd = WEEKDAY_OF[moonRuler] ?? 0;
    add(plan, line('lucky_values', 'luckyDay', 'lead', { weekday: { en: WEEKDAY.en[wd], hi: WEEKDAY.hi[wd], bn: WEEKDAY.bn[wd] }, planet: PLANET_PLAIN[moonRuler] },
      { terms: `${WEEKDAY.en[wd]}|${WEEKDAY.hi[wd]}|${WEEKDAY.bn[wd]}` }));
  } else {
    add(plan, line('lucky_values', 'luckyToday', 'lead', { colour, number: String(lucky.number), planet: PLANET_PLAIN[lucky.ruler] ?? PLANET_PLAIN.Sun }, { terms }));
  }
  if (lucky.timeStart && lucky.timeEnd) {
    const t = (l: Lang) => `${hourLabel(lucky.timeStart!.getHours() + lucky.timeStart!.getMinutes() / 60, l)}–${hourLabel(lucky.timeEnd!.getHours() + lucky.timeEnd!.getMinutes() / 60, l)}`;
    add(plan, line('lucky_values', 'luckyTime', 'body', { time: t }));
  }
  add(plan, line('lucky_values', 'luckyNudge', 'end'));
  must(plan, 'lucky_values');
}

const PARTNER_REL = ['partner', 'wife', 'husband'] as const;

/** The saved profile a compatibility question is about: named, or the one saved as partner / spouse. */
function compatProfile(plan: AnswerPlan, people: PlanProfile[]): PlanProfile | null {
  const others = people.filter(p => p.id !== plan.subject.id && p.isYou === false);
  const q = plan.question.toLowerCase();
  const named = others.filter(p => p.name && q.includes(firstName(p.name).toLowerCase()));
  if (named.length === 1) return named[0];
  const partners = others.filter(p => PARTNER_REL.some(r => relationMatches(p.relationship, r)));
  return partners.length === 1 ? partners[0] : null;
}

function compatRoute(plan: AnswerPlan, people: PlanProfile[], followUp: string | null): void {
  plan.deterministic = true;
  const other = compatProfile(plan, people);
  if (!other) {
    add(plan, line('ask_profile', 'compatAsk', 'lead', {}, { required: true }));
    must(plan, 'ask_profile');
    return;
  }
  const me = plan.subject;
  // Bride first, groom second (the matching tradition), guessed from gender; neutral words either way.
  const [bride, groom] = me.gender === 'man' || other.gender === 'woman' ? [other, me] : [me, other];
  const m = matchCharts(bride, groom, plan.now);
  if (!m) { add(plan, line('ask_profile', 'compatAsk', 'lead')); must(plan, 'ask_profile'); return; }
  const ratio = (k: { score: number; max: number }) => k.score / k.max;
  const sorted = [...m.kootas].sort((a, b) => ratio(b) - ratio(a) || b.max - a.max);
  const good = sorted.filter(k => ratio(k) >= 0.75).slice(0, 2).map(k => k.key as KootaKey);
  const work = [...m.kootas].sort((a, b) => ratio(a) - ratio(b) || b.max - a.max)[0].key as KootaKey;
  const joinL = (keys: KootaKey[], l: Lang) => keys.map(k => KOOTA_PLAIN[k].good[l]).join(l === 'en' ? ' and ' : l === 'hi' ? ' और ' : ' আর ');
  if (followUp === 'whatNow') {
    add(plan, line('communication_step', 'compatWorkOn', 'lead'));
    add(plan, line('communication_step', 'compatWork', 'body', { work: KOOTA_PLAIN[work].work }));
    must(plan, 'communication_step', 'new_info');
    return;
  }
  add(plan, line('compat_score', 'compatScore', 'lead', { score: String(m.total), verdict: VERDICT[m.verdict] }, { terms: `\\b${m.total}\\b.{0,40}36|36.{0,40}\\b${m.total}\\b` }));
  if (good.length) add(plan, line('compat_score', 'compatGood', 'body', { good: (l: Lang) => joinL(good, l) }));
  add(plan, line('compat_score', 'compatWork', 'body', { work: KOOTA_PLAIN[work].work }));
  if (/nadi|नाड़ी|নাড়ি|নাড়ি/i.test(plan.question)) {
    const nadi: L3 = m.nadiDosha === 'cancelled'
      ? { en: 'in your two charts it is cancelled by the classical exceptions', hi: 'आप दोनों की कुंडली में यह पारंपरिक नियमों से रद्द हो जाता है', bn: 'আপনাদের দুজনের কুষ্ঠিতে প্রথাগত নিয়মে তা কেটে যায়' }
      : m.nadiDosha === 'present'
        ? { en: 'it is present on paper, but it is one point among eight and says nothing certain about health or children', hi: 'यह कागज़ पर है, पर यह आठ में से एक बात है और सेहत या संतान के बारे में कुछ पक्का नहीं कहती', bn: 'কাগজে এটা আছে, তবে এটা আটটার মধ্যে একটা দিক, আর স্বাস্থ্য বা সন্তান নিয়ে নিশ্চিত কিছু বলে না' }
        : { en: 'there is no nadi dosha between your charts', hi: 'आप दोनों की कुंडली में नाड़ी दोष नहीं है', bn: 'আপনাদের কুষ্ঠিতে নাড়ি দোষ নেই' };
    add(plan, line('communication_step', 'compatNadi', 'body', { nadi }));
    must(plan, 'communication_step');
  }
  if (m.total < 18) add(plan, line('compat_score', 'compatLow', 'body'));
  if (/\bshould (?:we|i)\b|not marry|करें या नहीं|করব কি|ki korbo|kya karu|क्या करूँ|কী করব/i.test(plan.question) || m.total < 18) {
    add(plan, line('respect_choice', 'compatDecide', 'end'));
    must(plan, 'respect_choice');
  }
  add(plan, line('compat_score', 'compatScreen', 'end'));
  plan.checks.otherName = firstName(other.name);
  must(plan, 'compat_score');
}

const MANGLIK_WHY: Record<string, L3> = {
  ownSign: { en: 'Mars is in its own sign', hi: 'मंगल अपनी राशि में है', bn: 'মঙ্গল নিজের রাশিতে আছে' },
  exalted: { en: 'Mars is exalted', hi: 'मंगल उच्च का है', bn: 'মঙ্গল উচ্চস্থ' },
  houseSign: { en: 'a classical exception for that sign applies', hi: 'उस राशि का पारंपरिक अपवाद लागू होता है', bn: 'সেই রাশির প্রথাগত ব্যতিক্রম খাটে' },
  jupiter: { en: 'Jupiter protects that position', hi: 'बृहस्पति उस स्थिति की रक्षा करता है', bn: 'বৃহস্পতি সেই অবস্থানকে রক্ষা করে' },
};
const SADE_PHASE: Record<string, L3> = {
  rising: { en: 'first', hi: 'पहले', bn: 'প্রথম' }, peak: { en: 'middle (peak)', hi: 'बीच के (सबसे भारी)', bn: 'মাঝের (সবচেয়ে ভারী)' }, setting: { en: 'last', hi: 'आख़िरी', bn: 'শেষ' },
};

function sadeSatiLines(plan: AnswerPlan, pos: PlanLine['pos'] = 'lead'): void {
  const ss = getSadeSati(plan.subject, plan.now);
  if (ss.currentIndex >= 0 && ss.phase) {
    const p = ss.periods[ss.currentIndex];
    const end = ss.inReturn ? p.finalEnd : p.end;
    add(plan, line('computed_fact', 'sadeIn', pos, { phase: SADE_PHASE[ss.phase], end: ml(end) }, { terms: `${end.getFullYear()}|${String(end.getFullYear()).replace(/\d/g, d => '०१२३४५६७८९'[+d])}` }));
    plan.checks.factDates.push(end);
  } else if (ss.nextIndex >= 0) {
    const start = ss.periods[ss.nextIndex].start;
    add(plan, line('computed_fact', 'sadeOut', pos, { start: ml(start) }, { terms: `${start.getFullYear()}` }));
    plan.checks.factDates.push(start);
  }
  add(plan, line('chart_reason', 'sadeMeaning', 'body'));
}

function technicalRoute(plan: AnswerPlan, tech: string | null | undefined, placement: { planet: string; house: number } | null | undefined): void {
  plan.deterministic = true;
  must(plan, 'computed_fact', 'chart_reason');
  if (tech === 'kaalSarp') {
    add(plan, line('explain_policy', 'kaalSarp', 'lead'), line('respect_choice', 'kaalSarpRespect', 'body'));
    plan.must = ['explain_policy', 'respect_choice'];
    return;
  }
  if (tech === 'manglik') {
    const m = personChart(plan.subject, plan.now).manglik;
    if (m.level === 'present') add(plan, line('computed_fact', 'manglikYes', 'lead', {}, { terms: 'yes|हाँ|হ্যাঁ' }));
    else if (m.level === 'mild') add(plan, line('computed_fact', 'manglikMild', 'lead', {}, { terms: 'mild|हल्का|হালকা' }));
    else if (m.level === 'cancelled') add(plan, line('computed_fact', 'manglikCancelled', 'lead', { why: MANGLIK_WHY[m.exemptions[0]] ?? MANGLIK_WHY.houseSign }, { terms: 'cancel|रद्द|কেটে' }));
    else add(plan, line('computed_fact', 'manglikNo', 'lead', {}, { terms: '\\bno\\b|नहीं|না|নেই' }));
    add(plan, line('chart_reason', 'manglikMeaning', 'body'));
    return;
  }
  if (tech === 'sadeSati') { sadeSatiLines(plan); return; }
  if (tech === 'dasha' || !placement) {
    const t = getDashaTimeline(natalChart(plan.subject).moonLon, plan.subject.birthDate, plan.now);
    add(plan, line('computed_fact', 'dashaNow', 'lead', {
      maha: PLANET_PLAIN[t.maha.lord], end: ml(t.maha.end), antar: PLANET_PLAIN[t.antar.lord], aEnd: ml(t.antar.end),
    }, { terms: `${PLANET_PLAIN[t.maha.lord].en.replace('the ', '')}|${PLANET_PLAIN[t.maha.lord].hi}|${PLANET_PLAIN[t.maha.lord].bn}` }));
    const a = natalChart(plan.subject).analysis;
    const h = a?.planets[t.maha.lord as Planet].rules.find(x => [10, 7, 4, 1, 5, 9, 2, 11].includes(x)) ?? a?.planets[t.maha.lord as Planet].house ?? 1;
    add(plan, line('chart_reason', 'dashaMeaning', 'body', { area: (l: Lang) => AREA_OF_HOUSE[l][h] }));
    plan.checks.factDates.push(t.antar.end, t.maha.end);
    return;
  }
  // "What does Rahu in my 7th house mean?": the planet's nature on that area, and whether the chart really has it.
  const pl = placement.planet as Planet;
  const a = natalChart(plan.subject).analysis;
  const NATURE: Record<string, L3> = {
    Sun: { en: 'authority and pride', hi: 'अधिकार और अहं', bn: 'কর্তৃত্ব আর অহং' }, Moon: { en: 'feeling and care', hi: 'भावना और परवाह', bn: 'আবেগ আর যত্ন' },
    Mars: { en: 'energy and drive', hi: 'ऊर्जा और जोश', bn: 'শক্তি আর উদ্যম' }, Mercury: { en: 'thinking and talk', hi: 'सोच और बातचीत', bn: 'ভাবনা আর কথা' },
    Jupiter: { en: 'growth and wisdom', hi: 'विकास और समझ', bn: 'বৃদ্ধি আর বোধ' }, Venus: { en: 'comfort and charm', hi: 'सुख और आकर्षण', bn: 'স্বাচ্ছন্দ্য আর আকর্ষণ' },
    Saturn: { en: 'duty and patience', hi: 'ज़िम्मेदारी और धैर्य', bn: 'দায়িত্ব আর ধৈর্য' }, Rahu: { en: 'strong desires and unusual paths', hi: 'तेज़ इच्छाएँ और अलग रास्ते', bn: 'প্রবল আকাঙ্ক্ষা আর অন্যরকম পথ' },
    Ketu: { en: 'detachment and depth', hi: 'वैराग्य और गहराई', bn: 'নির্লিপ্ততা আর গভীরতা' },
  };
  const effect: L3 = { en: 'it is something to work with consciously, never a bad omen.', hi: 'इसे समझदारी से साधना होता है, यह कोई अशुभ संकेत नहीं।', bn: 'একে সচেতনভাবে সামলাতে হয়, এটা কোনো অশুভ লক্ষণ নয়।' };
  add(plan, line('chart_reason', 'placement', 'lead', { planet: PLANET_PLAIN[pl] ?? PLANET_PLAIN.Rahu, nature: NATURE[pl] ?? NATURE.Rahu, area: (l: Lang) => AREA_OF_HOUSE[l][Math.min(12, Math.max(1, placement.house))], effect }));
  const has = a?.planets[pl]?.house === placement.house;
  add(plan, line('computed_fact', has
    ? { en: 'And yes, your chart does have it there.', hi: 'और हाँ, आपके चार्ट में यह सच में वहीं है।', bn: 'আর হ্যাঁ, আপনার চার্টে সত্যিই এটা ওখানে আছে।' }
    : { en: 'In your own chart, though, it sits elsewhere, so this describes the placement in general.', hi: 'हालाँकि आपके अपने चार्ट में यह कहीं और है, इसलिए यह सामान्य बात है।', bn: 'তবে আপনার নিজের চার্টে এটা অন্য জায়গায়, তাই এটা সাধারণ কথা।' }, 'body', {}, { terms: has ? 'yes|हाँ|হ্যাঁ' : 'elsewhere|कहीं और|অন্য জায়গায়' }));
}

/** "How will 2027 be for me?": the topics whose best windows fall in that year, a hard Saturn transit, a new sub-period. */
function yearRoute(plan: AnswerPlan, year: number): void {
  plan.content = null;
  const from = new Date(year, 0, 1), to = new Date(year, 11, 31);
  const adult = (plan.age ?? 30) >= 18;
  const topics: TimingTopic[] = ['job', 'money', 'promotion', 'education', 'health', 'property', 'foreign', ...(adult && !plan.thread.married ? ['marriage' as TimingTopic] : [])];
  const now = new Date(Math.min(plan.now.getTime(), from.getTime() - 86400000 * 31));
  const hits: { topic: TimingTopic; w: TimingWindow }[] = [];
  for (const t of topics) {
    try {
      const r = timingWindows(plan.subject, t, plan.now.getTime() < from.getTime() ? plan.now : now, { months: 60 });
      const w = r.windows.find(x => x.peak >= from && x.peak <= to) ?? r.windows.find(x => x.start <= to && x.end >= from);
      if (w) hits.push({ topic: t, w });
    } catch { /* skip */ }
  }
  hits.sort((a, b) => b.w.score - a.w.score);
  const [h1, h2] = hits;
  const yr = String(year);
  if (h1) {
    add(plan, line('year_summary', 'year', 'lead', {
      year: yr, a1: AREA[plan.lang][h1.topic] ? { en: AREA.en[h1.topic], hi: AREA.hi[h1.topic], bn: AREA_GEN_BN[h1.topic].replace(/র$|ের$/, '') } : '',
      a2: h2 ? { en: ` and ${AREA.en[h2.topic]}`, hi: ` और ${AREA.hi[h2.topic]}`, bn: ` আর ${AREA_GEN_BN[h2.topic].replace(/র$|ের$/, '')}` } : '',
    }, { terms: `${yr}|${yr.replace(/\d/g, d => '०१२३४५६७८९'[+d])}|${yr.replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[+d])}` }));
    for (const h of [h1, h2]) if (h) plan.checks.windows.push(h.w);
    add(plan, line('practical_step', 'yearFocus', 'end', { a1: { en: AREA.en[h1.topic], hi: AREA.hi[h1.topic], bn: AREA.bn[h1.topic] } }));
  }
  try {
    const c = natalChart(plan.subject);
    if (saturnPressure(c, new Date(year, 6, 15))) add(plan, line('chart_reason', 'yearCareful', 'body', {}, { also: ['transit_reason'] }));
    const life = getLifeChapters(plan.subject, plan.now, 120);
    const subs = life.chapters.flatMap(ch => splitPeriod(ch));
    const starting = subs.find(s => s.start >= from && s.start <= to);
    if (starting) {
      const a = c.analysis;
      const h = a?.planets[starting.lord as Planet].rules.find(x => [10, 7, 4, 1, 5, 9, 2, 11].includes(x)) ?? a?.planets[starting.lord as Planet].house ?? 1;
      add(plan, line('chart_reason', 'yearCycle', 'body', { month: ml(starting.start), area: (l: Lang) => AREA_OF_HOUSE[l][h] }, { also: ['dasha_reason'] }));
      plan.checks.factDates.push(starting.start);
    }
  } catch { /* skip */ }
  must(plan, 'year_summary', 'chart_reason');
}

// ─── The router ──────────────────────────────────────────────────────────────

/**
 * Adds the category's lines (and, where the category needs it, its content
 * or window) to a plan whose base route is 'answer'. `plan.say` / `plan.must`
 * start empty.
 */
export function applyCategory(plan: AnswerPlan, ctx: RouteCtx): AnswerPlan {
  const i = plan.intent;
  const f = i.flags;
  const cat = plan.category;
  const res = plan.resolved;
  const fu = i.followUp;
  const prev = ctx.prev;
  const topicOf = (c: string) => CATEGORY_TOPIC[c] ?? null;
  // "X or Y?" is a choice, not a yes/no ("Will it be permanent or just for work?"); "… or not?" stays yes/no.
  const either = /\bor\b(?! not\b)|\bya\b(?! nahi)|(?<![\u0900-\u097F])या(?![\u0900-\u097F])(?! नहीं)|নাকি/i.test(plan.question);
  const yesno = i.kind === 'yesno' || cat === 'yes_no' || (isYesNo(plan.question) && !either && i.kind !== 'why' && !/\b(?:when|which|what|how|kab|kobe)\b|कब|কবে|कौन|কোন/i.test(plan.question));
  let p = plan;

  // ── Small talk, scope, frustration (deterministic) ──
  if (cat === 'greeting') {
    p.deterministic = true;
    p.content = null;
    p.timing = null;
    add(p, line(f.thanks ? 'ack_short' : 'greet_short', f.thanks ? 'thanks' : 'smalltalk', 'lead'));
    must(p, f.thanks ? 'ack_short' : 'greet_short');
    p.coreOff = true;
    return p;
  }
  if (cat === 'off_topic') {
    p.deterministic = true;
    if (f.gambling) { add(p, line('decline_gambling', 'gambling', 'lead', {}, { required: true })); must(p, 'decline_gambling'); }
    add(p, line('scope_redirect', 'scope', f.gambling ? 'body' : 'lead'));
    must(p, 'scope_redirect');
    p.coreOff = true;
    return p;
  }
  if (cat === 'abusive_or_very_short') {
    p.deterministic = true;
    if (!prev) {
      // "??" / "ok" as a first message: nothing was said yet, so no "sorry that didn't help".
      add(p, line('calm_boundary', /^[\s?.!…]*$|^\S{1,3}$/.test(p.question.trim()) ? 'calmAsk' : 'calm', 'lead'));
      must(p, 'calm_boundary');
      p.coreOff = true;
      return p;
    }
    add(p, line('calm_boundary', 'calmShort', 'lead'));
    must(p, 'calm_boundary', 'new_info');
    // The previous answer, shorter and with something new: the peak month, or the nearer window when "too far".
    const t = prev.timing?.topic ?? topicOf(res);
    if (t) {
      p = ctx.timing(p, t, true);
      if (fu === 'tooFar') return followUpRoute(p, ctx, 'tooFar');
      p.notes = [...p.notes.filter(n => n !== 'narrow'), 'narrow'];
      add(p, line('practical_step', { en: HELPS.en[t], hi: HELPS.hi[t], bn: HELPS.bn[t] }, 'end'));
      p.coreOff = true;
      if (p.timing) add(p, line('peak', S.repairPeak, 'body', { start: ml(p.timing.best.start), end: ml(p.timing.best.end), peak: ml(p.timing.best.peak) }, { also: ['window'] }));
      return p;
    }
    p.coreOff = true;
    return p;
  }

  // ── Corrections and follow-ups ──
  if (cat === 'contradictory_follow_up') {
    add(p, line('ack_correction', 'ackCorrection', 'lead'));
    must(p, 'ack_correction', 'new_info');
  }
  if (res === 'compatibility_other_person') { compatRoute(p, ctx.people, fu); p.coreOff = true; return p; }
  // "Why is it so bad now?" after a why-now answer is a why-now question again (the current phase), not "why that window".
  const phaseWhy = fu === 'why' && res === 'why_now_current_phase';
  if (phaseWhy) must(p, 'new_info');
  if (fu && !phaseWhy && (cat === 'follow_up_clarification' || cat === 'exact_date_or_name' || cat === 'no_birth_time') && !['which', 'specific'].includes(fu)) {
    const t = prev?.timing?.topic ?? topicOf(res);
    if (t && fu !== 'meaning') p = ctx.timing(p, t, fu === 'exactly' || fu === 'insist');
    return followUpRoute(p, ctx, fu);
  }

  // ── A partner's name / initial: decline, then what the chart can say (traits, the peak month if marriage was discussed) ──
  if (i.safety === 'partnerName') {
    p.deterministic = true;
    add(p, line('decline_name', 'name', 'lead', {}, { required: true, also: ['explain_policy'] }));
    p.content = ctx.content(p, 'partner', 'nature');
    must(p, 'decline_name', 'traits');
    const pt = prev?.timing ?? null;
    if (pt && (pt.topic === 'marriage' || pt.topic === 'love')) {
      p = ctx.timing(p, pt.topic, true);
      add(p, line('peak', S.repairPeak, 'end', { start: ml(p.timing!.best.start), end: ml(p.timing!.best.end), peak: ml(p.timing!.best.peak) }, { also: ['window'] }));
      add(p, line('no_exact_day', S.exactDate, 'end'));
      must(p, 'peak', 'no_exact_day');
    }
    p.intent = { ...p.intent, timing: false };
    p.coreOff = false;
    return p;
  }

  // ── Feature routes ──
  if (res === 'muhurat') { muhuratRoute(p, f.activity); p.coreOff = true; p.content = null; return p; }
  if (res === 'lucky_factors') { luckyRoute(p, f.lucky); p.coreOff = true; p.content = null; return p; }
  if (res === 'chart_technical') { technicalRoute(p, f.technical, f.placement); p.coreOff = true; return p; }
  if (cat === 'no_birth_time' && res === 'no_birth_time') {
    p.deterministic = true;
    add(p, line('answers_anyway', 'answersAnyway', 'lead'), line('no_time_caveat', 'noTimeHow', 'body'), line('add_time_tip', 'addTime', 'end'));
    must(p, 'answers_anyway', 'no_time_caveat', 'add_time_tip');
    p.coreOff = true;
    return p;
  }

  // ── Remedies (free only; gemstones informational) ──
  if (res === 'remedies') {
    p.deterministic = true;
    const secular = !!p.thread.secular || /not religious|isn'?t a ritual|without (?:a )?ritual|atheist|नास्तिक|নাস্তিক/i.test(p.question);
    const topic = prev?.timing?.topic ?? (i.topic && i.topic !== 'chart' ? i.topic : null);
    p.content = ctx.content(p, 'remedies', i.kind);
    if (p.content) {
      const pl = p.content.items[0].planet!;
      add(p, line('free_remedies', secular ? 'remedySecular' : 'remedyLead', 'lead', { planet: PLANET_PLAIN[pl], items: p.content.items[0].text.label }));
      void topic;
      if (f.gem) {
        add(p, line('gem_info_only', 'gem', 'body', { gem: GEM_OF[pl], planet: PLANET_PLAIN[pl] }, { also: ['explain_policy'] }));
        if (/faster|tez|tadatadi|তাড়াতাড়ি|जल्दी/i.test(p.question)) add(p, line('practical_step', 'gemFast', 'body'));
        must(p, 'gem_info_only');
      }
      add(p, line('free_remedies', 'remedyOptional', 'end', {}, { also: ['respect_choice'] }));
      if (secular) add(p, line('respect_choice', 'respectFaith', 'end'));
    }
    must(p, 'free_remedies');
    p.coreOff = true;
    return p;
  }

  // ── Wellbeing safety ──
  if (res === 'health_wellbeing') {
    if (f.diagnosis) {
      p.deterministic = true;
      add(p, line('explain_policy', 'diagnosis', 'lead', {}, { required: true }), line('doctor', 'doctor', 'body', {}, { required: true }));
      must(p, 'explain_policy', 'doctor');
      p.coreOff = true;
      return p;
    }
    if (f.stopTreatment) {
      p.deterministic = true;
      add(p, line('explain_policy', 'stopTreatment', 'lead', {}, { required: true, also: ['doctor'] }), line('self_care', 'selfCare', 'body'));
      must(p, 'explain_policy', 'doctor', 'self_care');
      p.coreOff = true;
      return p;
    }
  }

  // ── Topic windows a category needs although the question has no "when" ──
  const wantsWindow = i.timing || yesno || fu === 'exactly';
  const ct = topicOf(res);
  const married = !!p.thread.married && (res === 'marriage_timing') && !f.remarriage && cat !== 'other_profile';
  if (married) {
    // "But I'm already married": how the marriage goes from here (the partnership window), not marriage timing.
    p = ctx.timing(p, 'love', false);
    p.coreOff = true;
    if (p.timing) {
      add(p, line('window', 'marriedHarmony', 'lead', { start: ml(p.timing.best.start), end: ml(p.timing.best.end) }, { also: ['chart_reason'] }));
      if (!p.thread.hasChildren) add(p, line('new_info', 'marriedChild', 'body'));
    }
    must(p, 'new_info');
    return p;
  }
  if (!p.timing && ct && wantsWindow && !['career_field', 'partner_traits_meeting', 'love_vs_arranged', 'family_parents_siblings', 'compatibility_other_person'].includes(res)) {
    p = ctx.timing(p, ct, true);
  }

  // ── Per category ──
  switch (res) {
    case 'career_field': {
      if (p.content?.ask !== 'careerField') p.content = ctx.content(p, 'careerField', 'choice');
      must(p, 'fields_2_3', 'roles', 'chart_reason', 'direct_first');
      if (f.options) leaningLine(p, f.options, 'career');
      yogaLine(p, 'careerField');
      break;
    }
    case 'job_change_timing': case 'promotion': {
      must(p, 'window', 'chart_reason', 'practical_step');
      if (f.feelings) add(p, line('validation', 'validationWait', 'lead'));
      if (/\bswitch|change|resign|badal|bodlano|बदल|বদল/i.test(p.question) && (yesno || /\bshould\b|उचित|ठीक रहेगा|উচিত/i.test(p.question)) && p.timing) {
        const soon = (p.timing.best.start.getTime() - p.now.getTime()) / (365.25 * 86400000) < 1;
        add(p, line('leaning', soon ? 'switchNow' : 'switchWait', 'body', {}, { terms: soon ? 'start applying|आवेदन शुरू|আবেদন শুরু' : 'grow where you are|आगे बढ़ना बेहतर|এগোনো ভালো' }));
        must(p, 'leaning');
      }
      if (yesno) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      if (/\binterview|इंटरव्यू|ইন্টারভিউ/i.test(p.question)) add(p, line('documents_decide', 'interview', 'body'));
      break;
    }
    case 'business_vs_job': {
      if (!p.content) p.content = ctx.content(p, 'businessVsJob', 'choice');
      if (p.content && i.timing) {
        // A "when" question still gets the leaning (rules.md §5.4).
        const it = p.content.items[0];
        add(p, line('leaning', { en: 'As for the path itself, your chart favours {label}, because {why}.', hi: 'रास्ते की बात करें तो आपका चार्ट इस ओर झुकता है: {label}, क्योंकि {why}।', bn: 'পথের কথা বললে, আপনার চার্ট বেশি টানে এই দিকে: {label}, কারণ {why}।' }, 'body',
          { label: it.text.label, why: it.why ?? '' }, { terms: it.text.terms, also: ['chart_reason'] }));
        p.content = null;
      }
      must(p, 'leaning', 'chart_reason', 'practical_step');
      if (f.partnership) {
        const good = partnershipGood(natalChart(p.subject));
        add(p, line('likelihood', good ? 'partnershipGood' : 'partnershipCareful', 'lead', {}, { also: ['leaning', 'practical_step'] }));
        must(p, 'likelihood');
      }
      break;
    }
    case 'government_job': {
      if (!p.timing) p = ctx.timing(p, 'job', !!i.timing);
      const g = govtIndicator(natalChart(p.subject));
      // The government indicator is the likelihood (a generic "strong chance" line before it contradicted "a fair chance").
      add(p, line('govt_indicators', g.level === 'strong' ? 'govtStrong' : g.level === 'fair' ? 'govtFair' : 'govtWeak', i.timing ? 'body' : 'lead', {}, { also: ['chart_reason', 'likelihood'] }));
      add(p, line('study_strategy', 'studyStrategyGovt', 'end', {}, { also: ['practical_step'] }));
      must(p, 'likelihood', 'govt_indicators', 'study_strategy');
      if (!i.timing) { p.coreOff = true; add(p, windowShortLine(p)); }
      if (f.options) leaningLine(p, f.options, 'career');
      break;
    }
    case 'foreign_settlement': {
      if (f.country) {
        add(p, line('explain_policy', 'country', 'lead'));
        must(p, 'explain_policy', 'chart_reason');
      }
      const rel = p.content?.ask === 'relocation' ? p.content : ctx.content(p, 'relocation', 'choice');
      const verdict = rel?.items[0].key.split(':')[1] ?? 'mixed';
      // "Will it be permanent or just for work?" after a when-answer: the leaning with its reason is the answer
      // (the bare settlement line was already said, so the repeat filter dropped it and a job window was left).
      if (PERMANENT_RE.test(p.question) && rel && !p.content) { p.content = rel; p.timing = null; p.facts = []; must(p, 'settlement_vs_travel'); break; }
      if (p.content?.ask === 'relocation' && rel) p.checks.extraTerms.settlement_vs_travel = rel.items[0].text.terms;
      else add(p, line('settlement_vs_travel', verdict === 'abroad' ? 'settleAbroad' : verdict === 'home' ? 'settleHome' : 'settleMixed', f.country ? 'body' : 'lead', {}, { also: ['chart_reason'] }));
      if (!p.timing) p = ctx.timing(p, 'foreign', false);
      if (f.documents || /visa|वीज़ा|वीजा|ভিসা/i.test(p.question)) { add(p, line('documents_decide', 'documents', 'end', {}, { required: true })); must(p, 'documents_decide'); }
      if (yesno) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      // A yes/no answered from the relocation reading still names its window (rubric 3.1).
      if (yesno && !i.timing && p.content?.ask === 'relocation') add(p, windowShortLine(p));
      must(p, 'settlement_vs_travel', 'chart_reason');
      if (p.timing && (i.timing || yesno)) must(p, 'window');
      // Not a when-question: the leaning is the answer (the planner's own optional window line stays).
      if (!i.timing && !yesno && p.timing) { p.timing = null; p.facts = []; if (!p.content) p.coreOff = true; }
      break;
    }
    case 'money_wealth': {
      if (f.gambling) {
        p.timing = null;
        p.deterministic = true;
        add(p, line('decline_gambling', 'gambling', 'lead', {}, { required: true }), line('money_habit', 'moneyHabit', 'body'), line('fin_adviser', 'finAdviser', 'end'));
        must(p, 'decline_gambling', 'money_habit');
        p.coreOff = true;
        break;
      }
      const mc = ctx.content(p, 'moneySources', 'nature');
      if (mc) {
        const items = mc.items.slice(0, 2);
        // Labels carry their own commas and "and": joined with "and also" so the list doesn't run on.
        const joinItems = (l: Lang) => items.map(x => x.text.label[l]).join(l === 'en' ? ', and also ' : l === 'hi' ? ', और साथ ही ' : ', সঙ্গে ');
        const lead: L3 = { en: 'Your money comes most naturally from {items}.', hi: 'आपके लिए पैसा सबसे सहज रूप से {items} से आता है।', bn: 'আপনার টাকা সবচেয়ে সহজে আসে {items} থেকে।' };
        if (p.content?.ask === 'moneySources') { /* rendered as the core */ }
        else if (p.timing?.asked || yesno) add(p, line('income_sources', lead, 'body', { items: joinItems }, { terms: items.map(x => x.text.terms).join('|') }));
        else { p.content = mc; p.timing = null; }
        p.checks.itemTerms.push(...items.map(x => x.text.terms));
      }
      // The timing core's tip and the planner's tip already carry a saving habit.
      if (!p.timing?.asked && p.content?.ask !== 'moneySources') add(p, line('money_habit', 'moneyHabit', 'end', {}, { also: ['practical_step'] }));
      if (/stock|share|invest|शेयर|निवेश|শেয়ার|বিনিয়োগ/i.test(p.question)) add(p, line('fin_adviser', 'finAdviser', 'end', {}, { required: true }));
      if (yesno) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      must(p, 'income_sources', 'money_habit');
      if (i.timing) must(p, 'window', 'chart_reason');
      break;
    }
    case 'debt_loans': {
      if (!p.timing) p = ctx.timing(p, 'money', true);
      const approval = /approv|\bpass\b|sanction|मंज़ूर|मंजूर|पास|মঞ্জুর|পাস/i.test(p.question);
      if (f.owed) add(p, line('practical_step', 'owed', 'body', {}, { also: ['money_habit'] }));
      // A loan approval question gets the paperwork as its step, not a repayment plan.
      else if (!approval) add(p, line('money_habit', 'debtPlan', 'body', {}, { also: ['practical_step'] }));
      if (!f.owed) { add(p, line('fin_adviser', 'finAdviser', 'body')); must(p, 'fin_adviser'); }
      if (f.documents || /approv|pass|sanction|पास|মঞ্জুর|পাস/i.test(p.question)) { add(p, line('documents_decide', 'documents', 'end', {}, { required: true })); must(p, 'documents_decide'); }
      if (yesno) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      must(p, 'window', 'money_habit');
      break;
    }
    case 'property_vehicle': {
      add(p, line('practical_step', 'propertyChecks', 'end', {}, { also: ['muhurat_days'] }));
      if (yesno) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      must(p, 'window', 'chart_reason', 'practical_step');
      break;
    }
    case 'marriage_timing': {
      if (f.feelings) add(p, line('validation', 'validation', 'lead'));
      if (/\b(?:in my chart|even|ever)\b|kabhi|hogi bhi|होगी भी|कुंडली में शादी|আদৌ|কোনোদিন/i.test(p.question) && p.timing) {
        add(p, line('likelihood', 'marriageYes', 'lead'));
        must(p, 'likelihood');
      }
      if (yesno && !p.say.some(l => l.code === 'likelihood')) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      must(p, 'window', 'chart_reason', 'direct_first');
      break;
    }
    case 'love_vs_arranged': {
      p.content = ctx.content(p, 'loveArranged', 'choice');
      if (f.parentsAccept) {
        const v = p.content?.items[0].key.split(':')[1];
        add(p, line('likelihood', v === 'arranged' ? 'likelyWeak' : 'likelyModerate', 'body'));
        add(p, line('communication_step', 'parentsTalk', 'end', {}, { also: ['practical_step'] }));
        must(p, 'likelihood', 'communication_step');
      }
      must(p, 'leaning', 'chart_reason');
      if (p.content) p.checks.extraTerms.leaning = p.content.items[0].text.terms;
      break;
    }
    case 'partner_traits_meeting': {
      if (!p.content) p.content = ctx.content(p, 'partner', 'nature');
      must(p, 'traits', 'meeting_context');
      break;
    }
    case 'relationship_problems': {
      if (f.abuse) break; // handled as a decline in plan.ts
      if (f.mindReading) {
        p.deterministic = true;
        add(p, line('explain_policy', 'mindReading', 'lead'), line('communication_step', 'mindReadingStep', 'body'));
        must(p, 'explain_policy', 'communication_step');
        p.coreOff = true;
        break;
      }
      const rc = ctx.content(p, 'relationship', 'nature');
      if (p.timing && p.timing.topic !== 'love') p = ctx.timing({ ...p, timing: null }, 'love', !!p.timing.asked);
      if (!p.timing?.asked && !yesno) { p.timing = null; p.facts = []; }
      if (p.timing) {
        p.content = null;
        if (rc) {
          const it = rc.items[0];
          add(p, line('dynamics', { en: 'What the chart shows now is {items}: a phase, not an ending.', hi: 'चार्ट में अभी यह दिखता है: {items}। यह एक दौर है, अंत नहीं।', bn: 'চার্টে এখন যা দেখা যায়: {items}। এটা একটা পর্ব, শেষ নয়।' }, 'lead', { items: it.text.label }, { terms: it.text.terms, also: ['chart_reason'] }));
          p.checks.itemTerms.push(it.text.terms);
        }
      } else p.content = rc;
      const exBack = /\bex\b|come back|wapas|ফিরে|वापस|patch up/i.test(p.question);
      if (exBack) add(p, line('practical_step', 'exBack', 'lead', {}, { also: ['explain_policy'] }));
      add(p, line('communication_step', 'communication', 'end', {}, { also: ['practical_step'] }));
      if (f.feelings) add(p, line('validation', 'validation', 'lead'));
      // "Will my ex come back?" is their choice (rules.md §5.13): no odds for another person's decision.
      if (yesno && !exBack) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      must(p, 'dynamics', 'communication_step', 'no_blame');
      break;
    }
    case 'divorce_separation': {
      p.deterministic = true;
      const rc = ctx.content(p, 'relationship', 'nature');
      const caseQ = /\bcase\b|proceeding|court|केस|मामला|মামলা|কেস/i.test(p.question);
      if (f.decision || /should i|करूँ|করব|jabo|यাব|যাব/i.test(p.question)) add(p, line('respect_choice', 'respectChoice', 'lead'));
      if (caseQ) {
        p = ctx.timing(p, 'legal', true);
        add(p, line('lawyer', 'lawyer', 'end', {}, { required: true }));
        must(p, 'lawyer', 'window');
      } else {
        p = ctx.timing(p, 'love', false);
        p.coreOff = true;
        if (p.timing) add(p, line('dynamics', 'divorceStrain', 'body', { start: ml(p.timing.best.start) }, { terms: rc?.items[0]?.text.terms ?? 'strain|तनाव|টানাপোড়েন' }));
        if (rc) add(p, line('dynamics', { en: 'What runs through it is {items}.', hi: 'इसमें दिखता है: {items}।', bn: 'এর মধ্যে দেখা যায়: {items}।' }, 'body', { items: rc.items[0].text.label }, { terms: rc.items[0].text.terms }));
      }
      add(p, line('no_blame', 'noBlame', 'body'));
      add(p, line('counsellor', 'counsellor', 'end', {}, { required: true }));
      must(p, 'no_blame', 'counsellor');
      if (!caseQ) must(p, 'dynamics');
      break;
    }
    case 'children_timing': {
      if (!p.timing) p = ctx.timing(p, 'children', true);
      if (p.timing) p.timing = { ...p.timing, asked: true };
      p.content = null;
      p.intent = { ...p.intent, timing: true };
      if (f.trying) {
        add(p, line('validation', 'validation', 'lead'));
        add(p, line('doctor', 'doctorFertility', 'end', {}, { required: true }));
        must(p, 'doctor', 'validation');
      }
      if (yesno) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      must(p, 'window', 'chart_reason');
      break;
    }
    case 'family_parents_siblings': {
      if (!i.timing) { p.timing = null; p.facts = []; }
      else if (p.timing && (p.timing.topic === 'love' || p.timing.topic === 'marriage')) p = ctx.timing({ ...p, timing: null }, 'general', true);
      const fc = ctx.content(p, 'family', 'nature');
      if (p.timing) {
        if (fc) {
          add(p, line('dynamics', { en: 'With {who}, your chart shows {items}.', hi: '{who} के साथ आपके चार्ट में दिखता है: {items}।', bn: '{who} সঙ্গে আপনার চার্টে দেখা যায়: {items}।' }, 'body',
            { who: fc.vars!.who, items: fc.items[0].text.label }, { terms: fc.items[0].text.terms, also: ['chart_reason'] }));
          p.checks.itemTerms.push(fc.items[0].text.terms);
        }
      } else p.content = fc;
      if (i.kind === 'why' || /tension|तनाव|অশান্তি|jhagda|झगड़/i.test(p.question)) {
        const why = ctx.content(p, 'whyNow', 'why');
        if (why) {
          const it = why.items[why.items.length - 1];
          add(p, line('phase_cause', { en: 'Part of it is the current phase: {why}.', hi: 'इसका कुछ हिस्सा मौजूदा दौर से है: {why}।', bn: 'এর কিছুটা এখনকার পর্বের জন্য: {why}।' }, 'body', { why: it.text.label }, { terms: it.text.terms, also: ['chart_reason'] }));
          plan.checks.factDates.push(...why.allowedDates);
          must(p, 'phase_cause');
        }
      }
      add(p, line('no_blame', 'noBlame', 'body'));
      // A "when will it get better with my brother?" answer gets the family step, not the general "start what matters".
      if (p.timing) add(p, line('practical_step', TIP2.family, 'end'));
      must(p, 'dynamics', 'practical_step', 'no_blame');
      break;
    }
    case 'education_field': {
      if (p.content?.ask !== 'studyField' && !i.timing) p.content = ctx.content(p, 'studyField', 'choice');
      if (yesno && !i.timing && p.content) {
        // "Is medicine right for me?": how well the named field sits among the chart's best study fields.
        const named = Object.keys(OPTION_LABEL).find(o => new RegExp(`\\b${o}\\b`, 'i').test(p.question) || OPTION_LABEL[o].hi && p.question.includes(OPTION_LABEL[o].hi) || p.question.includes(OPTION_LABEL[o].bn));
        const rank = named ? p.content.items.findIndex(it => new RegExp(it.text.terms, 'iu').test(OPTION_LABEL[named].en + ' ' + named)) : -1;
        const option = named ? OPTION_LABEL[named] : { en: 'this field', hi: 'यह क्षेत्र', bn: 'এই বিষয়' };
        add(p, line('likelihood', rank === 0 ? 'fitStrong' : rank > 0 ? 'fitModerate' : 'fitWeak', 'lead', { option }));
        must(p, 'likelihood');
      }
      if (f.options) leaningLine(p, f.options, 'study');
      must(p, 'chart_reason');
      if (i.timing) must(p, 'window'); else must(p, 'study_fields');
      break;
    }
    case 'exams_competitive': {
      if (!p.timing || p.timing.topic !== 'education') p = ctx.timing({ ...p, timing: null }, 'education', !!i.timing);
      add(p, likelihoodLine(p, 'lead'));
      add(p, line('study_strategy', 'studyStrategy', 'end', {}, { also: ['practical_step'] }));
      if (f.govt) { add(p, line('govt_indicators', ['strong', 'fair'].includes(govtIndicator(natalChart(p.subject)).level) ? 'govtFair' : 'govtWeak', 'body')); must(p, 'govt_indicators'); }
      if (f.feelings) add(p, line('validation', 'validation', 'lead'));
      if (!i.timing) { p.coreOff = true; add(p, windowShortLine(p)); }
      must(p, 'likelihood', 'study_strategy');
      break;
    }
    case 'health_wellbeing': {
      if (cat === 'other_profile' || (i.subject.kind === 'other' && p.missingRelation)) break;
      if (f.surgery) {
        add(p, line('explain_policy', 'surgery', 'lead', {}, { also: ['doctor'] }), line('self_care', 'surgeryCare', 'body'));
        // Wellbeing framing only (rules.md §5.20): the recovery-and-energy window, never the operation's outcome.
        if (!p.timing) p = ctx.timing(p, 'health', false);
        if (p.timing && (p.timing.best.start.getTime() - p.now.getTime()) / (365.25 * 86400000) < 1) {
          const strong = p.timing.best.strength === 'strong';
          const kind: L3 = strong ? { en: 'strong, supportive', hi: 'मज़बूत, सहायक', bn: 'জোরালো, সহায়ক' } : { en: 'reasonably supportive', hi: 'अच्छी संभावना वाला सहायक', bn: 'ভালো সম্ভাবনার সহায়ক' };
          add(p, line('likelihood', 'recovery', 'body', { kind, start: ml(p.timing.best.start), end: ml(p.timing.best.end) }));
        }
        must(p, 'doctor', 'self_care');
        p.coreOff = !i.timing;
        break;
      }
      const wc = p.content?.ask === 'wellbeing' ? null : ctx.content(p, 'wellbeing', 'advice');
      if (wc) {
        add(p, line('self_care', { en: 'For your wellbeing, the habits that help most are {items}.', hi: 'आपकी सेहत के लिए सबसे ज़्यादा मदद करने वाली आदतें हैं: {items}।', bn: 'আপনার সুস্থতার জন্য সবচেয়ে কাজের অভ্যাস হলো {items}।' }, 'body',
          { items: wc.items[0].text.label }, { terms: wc.items[0].text.terms }));
      }
      if (i.kind === 'why' || /tired|थक|ক্লান্ত|बीमार|অসুখ/i.test(p.question)) {
        const why = ctx.content(p, 'whyNow', 'why');
        const sat = why?.items.find(x => x.planet === 'Saturn' && x.key !== 'why:maha' && x.key !== 'why:antar') ?? why?.items[why.items.length - 1];
        if (sat) {
          add(p, line('phase_cause', 'healthPhase', 'lead', { why: sat.text.label }, { terms: sat.text.terms, also: ['chart_reason'] }));
          must(p, 'phase_cause');
        }
      }
      add(p, line('doctor', 'doctor', 'end', {}, { required: true }));
      must(p, 'doctor', 'self_care');
      if (!i.timing && p.content?.ask !== 'wellbeing') p.coreOff = true;
      break;
    }
    case 'mental_health_distress': {
      // "Stress, when will it end?" reads when things ease (the general window), not "for health improvement".
      if (p.timing?.topic === 'health') p = ctx.timing({ ...p, timing: null }, 'general', true);
      if (!p.timing && /\bever end\b|\bwill (?:this|it) end\b|kab khatam|kab theek|kobe kombe|kobe katbe|कब खत्म|कब ठीक|কবে কাটবে|কবে কমবে/i.test(p.question)) {
        p = ctx.timing(p, 'general', true);
        must(p, 'window');
      }
      add(p, line('validation', 'validation', 'lead'));
      const why = ctx.content(p, 'whyNow', 'why');
      if (why) {
        const it = why.items.find(x => x.key.startsWith('why:') && !['why:maha'].includes(x.key) && x.planet === 'Saturn') ?? why.items[why.items.length - 1];
        add(p, line('phase_cause', 'distressPhase', 'lead', { why: it.text.label }, { terms: it.text.terms, also: ['chart_reason'] }));
        p.checks.factDates.push(...why.allowedDates);
      }
      add(p, line('self_care', 'selfCare', 'body'), line('counsellor', 'counsellor', 'end', {}, { required: true }), line('helpline', 'teleManas', 'end', {}, { required: true }));
      must(p, 'validation', 'phase_cause', 'counsellor', 'self_care');
      if (!p.timing?.asked) p.coreOff = true;
      break;
    }
    case 'legal_court': {
      if (!p.timing) p = ctx.timing(p, 'legal', !!i.timing);
      const lw = p.timing?.best;
      add(p, line('likelihood', !lw ? 'legalModerate' : lw.strength === 'strong' ? 'legalStrong' : lw.strength === 'moderate' ? 'legalModerate' : 'legalWeak', 'lead'));
      add(p, line('lawyer', 'lawyer', 'end', {}, { required: true }));
      must(p, 'lawyer', 'likelihood');
      if (!i.timing) { p.coreOff = true; add(p, windowShortLine(p)); }
      break;
    }
    case 'spirituality_purpose': {
      p.timing = null;
      p.intent = { ...p.intent, timing: false };
      p.content = ctx.content(p, 'purpose', 'nature');
      if (f.options) leaningLine(p, f.options, 'purpose');
      if (yesno) add(p, line('likelihood', 'peaceLikely', 'lead'));
      add(p, line('respect_choice', 'respectFaith', 'end'));
      must(p, 'purpose_theme', 'respect_choice');
      p.deterministic = true;
      break;
    }
    case 'personality': {
      if (p.content?.ask !== 'strengths') p.content = ctx.content(p, 'strengths', 'nature');
      p.timing = null;
      p.intent = { ...p.intent, timing: false };
      if (/angry|anger|गुस्सा|রাগ/i.test(p.question)) { add(p, line('explain_reasoning', 'angry', 'lead', {}, { also: ['practical_step'] })); must(p, 'practical_step'); }
      yogaLine(p, 'strengths');
      must(p, 'strengths', 'chart_reason');
      if (p.content) p.checks.extraTerms.strengths = p.content.extra.find(e => e.kind === 'weak') ? 'watch|ध्यान रखना|নজর' : undefined;
      break;
    }
    case 'why_now_current_phase': {
      if (!p.content) p.content = ctx.content(p, 'whyNow', 'why');
      add(p, line('validation', 'validation', 'lead'));
      if (p.content) p.checks.factDates.push(...p.content.allowedDates);
      must(p, 'validation', 'phase_cause', 'sub_period_end', 'practical_step');
      const whenAsked = /\bwhen\b|\bkab\b|\bkobe\b|কবে|कब/i.test(p.question);
      if (whenAsked) {
        if (!p.timing) p = ctx.timing(p, 'general', true);
        // The window is the answer; the current cycles (and when they end) are its reason.
        const wc = p.content;
        if (wc) {
          const items = wc.items.filter(x => x.key !== 'why:maha');
          const joinL = (l: Lang) => items.map(x => x.text.label[l]).join(l === 'en' ? '; ' : '; ');
          add(p, line('phase_cause', { en: 'Right now you are in {items}.', hi: 'अभी आप इस दौर में हैं: {items}।', bn: 'এখন আপনি এই পর্বে আছেন: {items}।' }, 'body', { items: joinL }, { terms: items.map(x => x.text.terms).join('|'), also: ['chart_reason', 'sub_period_end'] }));
          add(p, line('practical_step', TIP2.whyNow, 'end'));
        }
        must(p, 'window');
      } else {
        // "Why … this year?": not a when-question; the cycles are the answer.
        p.timing = null;
        p.intent = { ...p.intent, timing: false };
      }
      break;
    }
    case 'general_luck': {
      if (f.year) {
        const y = f.year === 'next' ? p.now.getFullYear() + 1 : f.year;
        yearRoute(p, y);
        p.coreOff = true;
        break;
      }
      if (yesno) { add(p, likelihoodLine(p)); must(p, 'likelihood'); }
      if (p.timing) must(p, 'window', 'chart_reason');
      break;
    }
    case 'elderly': break;
  }
  // Feelings in the message get one line of acknowledgement (rules.md §1.8), once.
  if (f.feelings && !p.say.some(l => l.code === 'validation') && !['greeting', 'off_topic'].includes(cat)) add(p, line('validation', 'validation', 'lead'));
  // Elders (rules.md §5.34): respectful, unhurried; no lifespan, no childbirth timing (plan.ts).
  if (p.category === 'elderly') {
    p.content = null;
    if (f.grandchildren) {
      add(p, line('ask_profile', 'grandchildren', 'lead', {}, { also: ['respect_choice'] }));
      p.coreOff = true;
      p.timing = null;
      must(p, 'ask_profile', 'respect_choice');
    } else {
      if (!p.timing) p = ctx.timing(p, 'general', false);
      add(p, line('respect_choice', 'retirement', 'lead'));
      must(p, 'respect_choice');
    }
  }

  // ── Situational forms around the answer ──
  if (cat === 'no_birth_time' || (p.notes.includes('noTime') && /birth ?time|जन्म (?:का )?समय|জন্ম ?সময়/i.test(p.question))) {
    // One caveat sentence carries both "still answers" and "approximate" (Stage 3: three overlapping
    // no-birth-time sentences made these the longest answers in the sample).
    add(p, line('no_time_caveat', 'noTimeHow', 'body'), line('add_time_tip', 'addTime', 'end'));
    p.notes = p.notes.filter(n => n !== 'noTime');
    must(p, 'answers_anyway', 'no_time_caveat', 'add_time_tip');
  }
  // "Will I get bail for my brother?": the user's chart answers, but their own chart would say more.
  const relMentioned = /\bfor my \w+|\bmy \w+'s\b|मेरे \S+ के लिए|আমার \S+র জন্য/i.test(p.question) ? relationIn(p.question) : null;
  if (relMentioned && i.subject.kind === 'self' && !['wife', 'husband', 'partner'].includes(relMentioned) && ['legal_court', 'health_wellbeing', 'job_change_timing', 'foreign_settlement'].includes(res)) {
    add(p, line('ask_profile', { en: "If this is about your {relation}'s own case, adding their birth details lets me read their chart directly.", hi: 'अगर यह उनके अपने मामले की बात है, तो उनका जन्म ब्योरा जोड़ें, फिर मैं उनकी कुंडली सीधे देख सकूँगा।', bn: 'এটা যদি ওঁর নিজের বিষয় হয়, ওঁর জন্মের তথ্য প্রোফাইলে যোগ করলে ওঁর কুষ্ঠি সরাসরি দেখতে পারব।' }, 'end', { relation: relMentioned }));
    must(p, 'ask_profile');
  }
  if (cat === 'past_event_verification') {
    add(p, line('invite_confirm', 'inviteConfirm', 'end'));
    if (pastYearLine(p)) p.coreOff = true;
    must(p, 'invite_confirm');
  }
  if (cat === 'exact_date_or_name' && i.exactDate && p.timing) {
    add(p, line('muhurat_days', 'muhuratPointer', 'end'));
    must(p, 'no_exact_day', 'peak');
  }
  if (cat === 'other_profile' && p.subjectSwitched) {
    must(p, 'uses_other_chart');
    p.checks.otherName = firstName(p.subject.name);
  }
  if (cat === 'yes_no' && p.timing) {
    if (!p.say.some(l => l.code === 'likelihood')) add(p, likelihoodLine(p));
    must(p, 'likelihood', 'window', 'practical_step');
  }
  return p;
}

/** What each named option looks like among a planner's item labels (English), for ranking options by the answer's own items. */
const OPTION_WORDS: Record<string, RegExp> = {
  IT: /technolog|\bdata\b|software|comput|coding/i, finance: /financ|bank|advis|account/i, teaching: /teach|educat|train/i,
  corporate: /operations|management|systems|corporate/i, engineering: /engineer|technical/i, design: /design|arts|creative|media/i,
  medicine: /medic|nurs|\bcare\b|health/i, government: /government|civil|leadership/i, sales: /sales|trade|commerce/i,
  private: /technolog|operations|financ|creative|engineer/i, MBA: /manage|business|financ|law/i, MS: /engineer|comput|research|science/i,
  science: /science|engineer|medic|research/i, commerce: /commerce|financ|law|account/i, meditation: /practice|focus|depth|service/i,
  bhakti: /devotion|beauty|music|care|wisdom/i,
};

function leaningLine(p: AnswerPlan, options: [string, string], domain: 'career' | 'study' | 'purpose'): void {
  let r: { pick: string | null; why: L3 | null } = optionLeaning(p.subject, options, domain);
  // The answer's own ranked items decide when they name one of the options (Stage 3: "leans to finance"
  // followed by "technology and data" as the strongest field read as a contradiction).
  const items = p.content?.items ?? [];
  if (items.length) {
    const [o1, o2] = options;
    const words = OPTION_WORDS[o1] && OPTION_WORDS[o2] ? OPTION_WORDS : null;
    const rank = (o: string) => items.findIndex(it => (words ? words[o].test(it.text.label.en) : new RegExp(it.text.terms, 'iu').test(`${OPTION_LABEL[o]?.en ?? o} ${o}`)));
    const ra = rank(o1), rb = rank(o2);
    const ia = ra < 0 ? 99 : ra, ib = rb < 0 ? 99 : rb;
    if (ia !== ib) {
      const pick = ia < ib ? o1 : o2;
      const it = items[Math.min(ia, ib)];
      r = { pick, why: it.why ?? r.why };
    }
  }
  const [a, b] = options;
  if (r.pick) {
    add(p, line('leaning', 'optionLean', 'lead', { a: OPTION_LABEL[a] ?? a, b: OPTION_LABEL[b] ?? b, pick: OPTION_LABEL[r.pick] ?? r.pick, why: r.why ?? '' },
      { terms: Object.values(OPTION_LABEL[r.pick] ?? { en: r.pick }).join('|'), also: ['chart_reason'] }));
  } else {
    add(p, line('leaning', 'optionBoth', 'lead', { a: OPTION_LABEL[a] ?? a, b: OPTION_LABEL[b] ?? b }, { terms: 'both|दोनों|দুটোকেই' }));
  }
  must(p, 'leaning');
}

function yogaLine(p: AnswerPlan, ask: 'careerField' | 'strengths' | 'moneySources'): void {
  const ys = askYogas(natalChart(p.subject), ask);
  const y = ys[0];
  if (!y) return;
  const how = YOGA_PLAIN[y.key];
  if (!how) return;
  const pl = PLANET_PHRASE[y.planets[0]];
  const key: CKey = ask === 'careerField' ? 'yogaCareer' : ask === 'moneySources' ? 'yogaMoney' : 'yogaSelf';
  add(p, line('chart_reason', key, 'body', { how: (l: Lang) => fill(how[l], { p: pl[l] }) }));
}

/** "Did I go through a bad phase in 2019?": the sub-period then, and Saturn on the Moon that year. */
function pastYearLine(p: AnswerPlan): boolean {
  const m = /\b(19\d\d|20\d\d)\b/.exec(p.question.replace(/[०-९]/g, d => String('०१२३४५६७८९'.indexOf(d))).replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d))));
  if (!m) return false;
  const year = Number(m[1]);
  const mid = new Date(year, 6, 1);
  try {
    const c = natalChart(p.subject);
    const t = getDashaTimeline(c.moonLon, p.subject.birthDate, mid);
    const sat = saturnPressure(c, mid);
    const fn = c.analysis?.planets[t.antar.lord as Planet].functional;
    const heavy = !!sat || fn === 'malefic';
    const why: L3 = {
      en: `the sub-period of ${PLANET_PLAIN[t.antar.lord].en} ran from ${monthLabel(t.antar.start, 'en', { western: true })} to ${monthLabel(t.antar.end, 'en', { western: true })}${sat ? ', and Saturn was pressing on your Moon sign' : ''}`,
      hi: `${PLANET_PLAIN[t.antar.lord].hi} की अंतर्दशा ${monthLabel(t.antar.start, 'hi', { western: true })} से ${monthLabel(t.antar.end, 'hi', { western: true })} तक चली${sat ? ', और शनि आपकी चंद्र राशि पर दबाव डाल रहा था' : ''}`,
      bn: `${PLANET_PLAIN[t.antar.lord].bn}-এর অন্তর্দশা চলেছিল ${monthLabel(t.antar.start, 'bn', { western: true })} থেকে ${monthLabel(t.antar.end, 'bn', { western: true })}${sat ? ', আর শনি আপনার চন্দ্ররাশির ওপর চাপ দিচ্ছিল' : ''}`,
    };
    add(p, line('past_window', heavy ? 'pastHeavy' : 'pastLight', 'lead', { year: String(year), why }, { also: ['chart_reason', 'dasha_reason'] }));
    p.checks.windows.push({ start: t.antar.start, end: t.antar.end, peak: t.antar.start } as TimingWindow);
    return true;
  } catch { return false; }
}

/** Follow-ups on the previous answer (rules.md §5.44): only what is new. */
function followUpRoute(p: AnswerPlan, ctx: RouteCtx, fu: string): AnswerPlan {
  const t = p.timing;
  must(p, 'new_info');
  p.coreOff = true;
  // The lines are the answer: no planner content (and no relevance tail for it).
  p.content = null;
  const ref = t ? { start: ml(t.best.start), end: ml(t.best.end), peak: ml(t.best.peak) } : null;
  switch (fu) {
    case 'meaning': {
      p.deterministic = true;
      add(p, line('explain_reasoning', 'sadeWhat', 'lead'));
      sadeSatiLines(p, 'body');
      must(p, 'explain_reasoning', 'computed_fact');
      return p;
    }
    case 'why': {
      if (p.category === 'no_birth_time') {
        add(p, line('explain_reasoning', 'whyApprox', 'lead', {}, { also: ['no_time_caveat'] }), line('answers_anyway', 'answersAnyway', 'body'), line('add_time_tip', 'addTime', 'end'));
        must(p, 'explain_reasoning', 'answers_anyway', 'no_time_caveat', 'add_time_tip');
        return p;
      }
      if (!t) break;
      const d = t.best.reasons.find(r => r.kind === 'dasha') as { kind: 'dasha'; antar: string } | undefined;
      if (d) {
        add(p, line('explain_reasoning', 'fuWhyDasha', 'lead', { ...planetVars(d.antar as Planet), topic: { en: AREA.en[t.topic], hi: AREA.hi[t.topic], bn: AREA_GEN_BN[t.topic] }, link: linkPhrase(p, d.antar as Planet) },
          { also: ['dasha_reason', 'chart_reason'] }));
      }
      const dbl = t.best.reasons.some(r => r.kind === 'doubleTransit');
      const jup = t.best.reasons.some(r => r.kind === 'jupiterTransit');
      add(p, line('transit_reason', dbl ? 'fuWhyDouble' : jup ? 'fuWhyJupiter' : 'fuWhyNoTransit', 'body'));
      must(p, 'explain_reasoning', 'dasha_reason', 'transit_reason');
      if (/late|deri|देर|দেরি/i.test(p.question)) altWindow(p);
      return p;
    }
    case 'tooFar': {
      if (!t) break;
      if ((t.best.start.getTime() - p.now.getTime()) / (30.44 * 86400000) <= 6) {
        // "Too far / why so late?" about a window that opens within months: say so, then the step.
        add(p, line('explain_reasoning', 'fuNotFar', 'lead', { start: ml(t.best.start) }));
        altWindow(p);
        add(p, line('practical_step', { en: HELPS.en[t.topic], hi: HELPS.hi[t.topic], bn: HELPS.bn[t.topic] }, 'end'));
        must(p, 'explain_reasoning', 'practical_step');
        return p;
      }
      const now = getDashaTimeline(natalChart(p.subject).moonLon, p.subject.birthDate, p.now);
      add(p, line('explain_reasoning', 'fuLate', 'lead', { now: (l: Lang) => fill({ en: 'the sub-period of {p} runs until {e}', hi: '{p} की अंतर्दशा {e} तक चलती है', bn: '{p} অন্তর্দশা চলে {e} পর্যন্ত' }[l], { p: l === 'hi' ? planetObl(now.antar.lord as Planet) : l === 'bn' ? planetGen(now.antar.lord as Planet) : PLANET_PHRASE[now.antar.lord as Planet].en, e: monthLabel(now.antar.end, l, { western: true }) }) },
        { also: ['dasha_reason'] }));
      altWindow(p);
      add(p, line('practical_step', { en: HELPS.en[t.topic], hi: HELPS.hi[t.topic], bn: HELPS.bn[t.topic] }, 'end'));
      must(p, 'explain_reasoning', 'alt_window', 'practical_step');
      return p;
    }
    case 'whatNow': case 'shouldI': {
      if (!t) break;
      const now = getDashaTimeline(natalChart(p.subject).moonLon, p.subject.birthDate, p.now);
      add(p, line('practical_step', 'fuNowCycle', 'lead', { ...planetVars(now.antar.lord as Planet), end: ml(now.antar.end) }, { also: ['dasha_reason'] }));
      if (fu === 'shouldI' && (t.topic === 'job' || t.topic === 'promotion')) {
        add(p, line('leaning', 'dontQuit', 'body', {}, { terms: "don'?t quit|न छोड़ें|ছাড়বেন না", also: ['practical_step'] }));
        must(p, 'leaning');
      }
      const tip = TIP2[t.topic === 'job' || t.topic === 'promotion' ? 'careerField' : t.topic === 'money' ? 'moneySources' : 'whyNow'];
      add(p, line('practical_step', tip, 'body'));
      add(p, line('practical_step', { en: HELPS.en[t.topic], hi: HELPS.hi[t.topic], bn: HELPS.bn[t.topic] }, 'end'));
      p.checks.factDates.push(now.antar.end);
      must(p, 'practical_step');
      return p;
    }
    case 'exactly': case 'insist': {
      if (!t) break;
      if (fu === 'insist') add(p, line('no_exact_day', 'insist', 'lead', {}, { also: ['explain_policy'] }));
      add(p, line('peak', S.repairPeak, fu === 'insist' ? 'body' : 'lead', ref!, { also: ['window'] }));
      if (fu === 'exactly') add(p, line('no_exact_day', S.exactDate, 'body'));
      add(p, line('muhurat_days', 'muhuratPointer', 'end'));
      must(p, 'peak', 'no_exact_day');
      if (fu === 'insist') must(p, 'explain_policy', 'muhurat_days');
      return p;
    }
    case 'more': {
      altWindow(p);
      return p;
    }
  }
  return p;
}

/** The nearer window (before the best) or the next good one, as a new option. */
function altWindow(p: AnswerPlan): void {
  const t = p.timing;
  if (!t) return;
  const ws = t.result.windows;
  let nearer: { start: Date; end: Date } | undefined = ws.find(w => w !== t.best && w.start < t.best.start);
  if (!nearer && !t.result.past) {
    // No ranked window before the best one: the strongest three-month stretch before it (softer, but nearer).
    const before = t.result.months.filter(m => m.month < t.best.start);
    let bestAt = -1, bestAvg = -Infinity;
    for (let k = 0; k + 3 <= before.length; k++) {
      const avg = (before[k].score + before[k + 1].score + before[k + 2].score) / 3;
      if (avg > bestAvg) { bestAvg = avg; bestAt = k; }
    }
    if (bestAt >= 0 && bestAvg > 0) {
      const last = before[bestAt + 2].month;
      nearer = { start: before[bestAt].month, end: new Date(last.getFullYear(), last.getMonth() + 1, 0) };
    }
  }
  const later = t.second && t.second.start > t.best.start ? t.second : ws.find(w => w !== t.best && w.start > t.best.start) ?? t.result.nextStrong;
  if (nearer) {
    add(p, line('alt_window', 'fuNearer', 'body', { start: ml(nearer.start), end: ml(nearer.end) }));
    p.checks.alt.push(nearer);
  } else if (later) {
    add(p, line('alt_window', 'fuNext', 'body', { start: ml(later.start), end: ml(later.end) }));
    p.checks.alt.push(later);
  }
}
