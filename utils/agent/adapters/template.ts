/**
 * TemplateRenderer: a complete answer written from the AnswerPlan alone, in
 * en / hi / bn, with no model. Used for the plan's declines and redirects,
 * whenever no model is available (not downloaded, failed to load, web), and
 * as the last fallback of the verify layer. Pure.
 *
 * Output is user-visible, so hi/bn text carries Devanagari / Bengali digits
 * ("এপ্রিল ২০৩১"), like the rest of the app; the verifier reads both forms.
 */
import type { AnswerPlan } from '../plan';
import { AREA, AREA_GEN_BN, HELPS, S, fill, localText, monthLabel, relationWord, type Lang } from '../strings';
import { dateInWindows, nearerStretch, yearsAway, TOPIC_RULES, type Link, type LinkKind, type TimingTopic, type TimingWindow } from '../../timing-engine';
import { PLANET_PLAIN } from '../category-strings';
import { formatGitaQuote, pickGitaVerse } from '../../gita';
import { findDates, replyOverlap, westernDigits } from '../../reply-guards';
import type { AnswerContent } from '../astrologer';
import type { PlanLine } from '../checks';
import type { L3 } from '../ask-strings';
import {
  FOLLOW_LEAD_ASK, NEXT_ITEM_ASK, AREA_OF_HOUSE, LEAD_BEYOND, REMEDY,
  AND, BECAUSE, COMMA, DOCTOR_LINE, EXAMPLES, EXAMPLES_MORE, FIELD_LINE, FOLLOW_LEAD, FOLLOW_LEAD_NEXT, LEAD, MEET_LINE, NEXT_ITEM, PLACE_LINE, TIP, TIP2,
  WEAK_LINE, WINDOW_LINE,
} from '../ask-strings';

const firstName = (name: string) => name.split(' ')[0];

/** Topic words a category reads better with than the engine topic's ("clearing your loans", not "money"). */
const AREA_OVERRIDE: Record<string, { l: Record<Lang, string>; gen: string }> = {
  debt: { l: { en: 'clearing your loans', hi: 'कर्ज़ से छुटकारे', bn: 'ঋণ শোধ' }, gen: 'ঋণ শোধের' },
  owed: { l: { en: 'getting your money back', hi: 'पैसा वापस मिलने', bn: 'টাকা ফেরত পাওয়া' }, gen: 'টাকা ফেরত পাওয়ার' },
  approval: { l: { en: 'getting the loan approved', hi: 'लोन मंज़ूर होने', bn: 'ঋণ মঞ্জুর হওয়া' }, gen: 'ঋণ মঞ্জুর হওয়ার' },
  vehicle: { l: { en: 'buying a vehicle', hi: 'गाड़ी लेने', bn: 'গাড়ি কেনা' }, gen: 'গাড়ি কেনার' },
  relationship: { l: { en: 'your relationship', hi: 'रिश्ते में सुधार', bn: 'সম্পর্ক ভালো হওয়া' }, gen: 'সম্পর্ক ভালো হওয়ার' },
};
const VEHICLE = /\b(?:car|bike|scooter|vehicle|gaa?di|gari|motorcycle)\b|गाड़ी|गाडी|वाहन|स्कूटर|গাড়ি|গাড়ি|বাইক/i;

const HELP_APPROVAL: Record<Lang, string> = {
  en: 'Until then, keep every repayment on time and your expenses within budget; lenders look at that record first.',
  hi: 'तब तक हर किस्त समय पर चुकाएँ और खर्च बजट में रखें; लोन देने वाले सबसे पहले यही रिकॉर्ड देखते हैं।',
  bn: 'ততদিন প্রতিটা কিস্তি সময়ে শোধ করুন আর খরচ বাজেটের মধ্যে রাখুন; ঋণদাতারা প্রথমে এই রেকর্ডটাই দেখেন।',
};

/** From this age, CV / application / exam-drill tips give way to steadier, experience-led steps. */
export const ELDER_TIPS_AGE = 60;
export const isElder = (plan: AnswerPlan) => (plan.age ?? 0) >= ELDER_TIPS_AGE;

const ELDER_HELPS: Partial<Record<TimingTopic, L3>> = {
  job: {
    en: 'Before then, reach out to people who know your work; advisory, mentoring or part-time roles suit this stage well.',
    hi: 'उससे पहले उन लोगों से संपर्क करें जो आपका काम जानते हैं; सलाह, मार्गदर्शन या पार्ट-टाइम काम इस दौर में अच्छे रहते हैं।',
    bn: 'তার আগে যাঁরা আপনার কাজ জানেন তাঁদের সঙ্গে যোগাযোগ করুন; পরামর্শ, পথ দেখানো বা পার্ট-টাইম কাজ এই সময়ে ভালো মানায়।',
  },
  promotion: {
    en: 'Before then, let your experience show: offer guidance to others and take on the work you know best.',
    hi: 'उससे पहले अपने अनुभव को सामने आने दें: दूसरों को राह दिखाएँ और वह काम लें जिसे आप सबसे अच्छा जानते हैं।',
    bn: 'তার আগে নিজের অভিজ্ঞতাকে সামনে আনুন: অন্যদের পথ দেখান আর যে কাজটা সবচেয়ে ভালো জানেন সেটা নিন।',
  },
  education: {
    en: 'A calm, regular routine of reading or practice before then helps most in that window.',
    hi: 'उससे पहले पढ़ने या अभ्यास का एक शांत, नियमित क्रम उस समय सबसे ज़्यादा काम आएगा।',
    bn: 'তার আগে পড়া বা অনুশীলনের একটা শান্ত, নিয়মিত অভ্যাস ওই সময়ে সবচেয়ে কাজে দেবে।',
  },
};

/** The topic's practical step, in a form that fits the asker's age. */
export function helpFor(plan: AnswerPlan, topic: TimingTopic): string {
  if (isElder(plan) && ELDER_HELPS[topic]) return ELDER_HELPS[topic]![plan.lang];
  return HELPS[plan.lang][topic];
}

function areaOverride(plan: AnswerPlan | undefined, topic: TimingTopic): (typeof AREA_OVERRIDE)[string] | null {
  if (!plan) return null;
  if (topic === 'money' && plan.resolved === 'debt_loans') {
    return plan.intent.flags.owed ? AREA_OVERRIDE.owed : /approv|\bpass\b|sanction|मंज़ूर|मंजूर|पास|মঞ্জুর|পাস/i.test(plan.question) ? AREA_OVERRIDE.approval : AREA_OVERRIDE.debt;
  }
  if (topic === 'property' && VEHICLE.test(plan.question)) return AREA_OVERRIDE.vehicle;
  if (topic === 'love' && plan.resolved === 'relationship_problems') return AREA_OVERRIDE.relationship;
  return null;
}

function vars(lang: Lang, topic: TimingTopic, w?: TimingWindow, plan?: AnswerPlan): Record<string, string> {
  const o = areaOverride(plan, topic);
  return {
    area: o ? o.l[lang] : AREA[lang][topic],
    areaGen: o ? o.gen : AREA_GEN_BN[topic],
    ...(w ? { start: monthLabel(w.start, lang), end: monthLabel(w.end, lang), peak: monthLabel(w.peak, lang) } : {}),
  };
}

/** "The strongest window for this is …" (the verify layer's repair sentence). */
export function repairSentence(plan: AnswerPlan): string {
  const t = plan.timing!;
  const table = t.result.past ? S.repairPast : plan.notes.includes('narrow') ? S.repairPeak : S.repair;
  return localText(fill(table[plan.lang], vars(plan.lang, t.topic, t.best, plan)), plan.lang);
}

/** How a sub-period planet is tied to the topic, as a clause with the planet as subject. */
const LINK_TEXT: Partial<Record<LinkKind, Record<Lang, string>>> = {
  occupant: { en: '{p} sits in your {area} side', hi: '{p} आपके {area} वाले पहलू में बैठा है', bn: '{p} আছে আপনার {area} দিকে' },
  lord: { en: '{p} guides your {area} side', hi: '{p} आपके {area} वाले पहलू को चलाता है', bn: '{p} আপনার {area} দিকটা চালায়' },
  aspect: { en: '{p} looks at your {area} side', hi: '{p} की नज़र आपके {area} वाले पहलू पर है', bn: '{p}-এর নজর আছে আপনার {area} দিকে' },
  withLord: { en: '{p} sits with the planet that guides your {area} side', hi: '{p} आपके {area} वाले पहलू के स्वामी ग्रह के साथ है', bn: '{p} আছে আপনার {area} দিকের অধিপতির সঙ্গে' },
  karaka: { en: '{p} naturally stands for {topic}', hi: '{p} स्वाभाविक रूप से {topic} से जुड़ा है', bn: '{p} স্বভাবতই {topicGen} সঙ্গে জড়িত' },
};
const LINK_ORDER: LinkKind[] = ['occupant', 'lord', 'aspect', 'withLord', 'karaka'];
/** House words for a topic's reason ("the Sun guides your schooling side" for exams, not "your home side"). */
const TOPIC_HOUSE_WORD: Partial<Record<TimingTopic, Record<number, Record<Lang, string>>>> = {
  education: { 4: { en: 'schooling', hi: 'शिक्षा', bn: 'শিক্ষার' }, 5: { en: 'learning', hi: 'पढ़ाई', bn: 'পড়াশোনার' } },
  love: { 5: { en: 'romance', hi: 'प्रेम', bn: 'প্রেমের' } },
  marriage: { 5: { en: 'romance', hi: 'प्रेम', bn: 'প্রেমের' } },
  children: { 5: { en: 'children', hi: 'संतान', bn: 'সন্তানের' } },
};
/** "Saturn" / "the Moon" as a sentence subject; `bare` drops the article ("your Moon phase"). */
const planetName = (p: string, l: Lang, bare = false) => (bare ? (PLANET_PLAIN[p]?.[l] ?? p).replace(/^the /, '') : PLANET_PLAIN[p]?.[l] ?? p);

/**
 * The window's chart reason in one sentence: the sub-period (antardasha) planet running
 * then and its strongest tie to the topic's houses ("That's when your Saturn phase runs,
 * and Saturn sits in your career side."), plus the slow-planet transit support. Falls
 * back to the major-period planet when the sub-period planet has no tie. Rubric 3.2:
 * one concrete chart reason instead of "the part of the life timeline linked to …".
 */
export function reasonSentence(plan: AnswerPlan): string | null {
  const r = reasonParts(plan);
  if (!r) return null;
  return r.reason ? r.reason + (r.transit ? ' ' + r.transit : '') : r.transit;
}

/**
 * How `planet` (a sub-period lord of the best window) is tied to the window's topic, as a clause with the
 * planet as subject ("Saturn sits in your career side"), from the engine's links for that window; null if none.
 * The "why this time?" follow-up uses it, so its house always belongs to the topic (Stage 3: a job window
 * explained by "it guides your partnership side").
 */
export function linkClause(plan: AnswerPlan, planet: string, lang: Lang): string | null {
  const t = plan.timing;
  if (!t) return null;
  const d = t.best.reasons.find(r => r.kind === 'dasha') as { kind: 'dasha'; maha: string; antar: string; mahaLinks: Link[]; antarLinks: Link[] } | undefined;
  if (!d) return null;
  const links = d.antar === planet ? d.antarLinks : d.maha === planet ? d.mahaLinks : [];
  const houses = TOPIC_RULES[t.topic].houses.map(([h]) => h);
  const link = links.filter(l => LINK_TEXT[l.kind] && (l.kind === 'karaka' || (l.house != null && houses.includes(l.house))))
    .sort((a, b) => LINK_ORDER.indexOf(a.kind) - LINK_ORDER.indexOf(b.kind) || houses.indexOf(a.house ?? 99) - houses.indexOf(b.house ?? 99))[0];
  if (!link) return null;
  return fill(LINK_TEXT[link.kind]![lang], {
    p: planetName(planet, lang), area: link.house ? (TOPIC_HOUSE_WORD[t.topic]?.[link.house]?.[lang] ?? AREA_OF_HOUSE[lang][link.house]) : '', topic: AREA[lang][t.topic], topicGen: AREA_GEN_BN[t.topic],
  });
}

/**
 * The window's chart reason split in two: the sub-period clause and the
 * slow-planet transit support (a separate sentence the word-limit trim may drop).
 */
export function reasonParts(plan: AnswerPlan): { reason: string | null; transit: string | null } | null {
  const t = plan.timing;
  if (!t) return null;
  const lang = plan.lang;
  const past = t.result.past;
  const d = t.best.reasons.find(r => r.kind === 'dasha') as { kind: 'dasha'; maha: string; antar: string; mahaLinks: Link[]; antarLinks: Link[] } | undefined;
  const houses = TOPIC_RULES[t.topic].houses.map(([h]) => h);
  const pick = (links: Link[]) => {
    const ok = links.filter(l => LINK_TEXT[l.kind] && (l.kind === 'karaka' || (l.house != null && houses.includes(l.house))));
    return ok.sort((a, b) => LINK_ORDER.indexOf(a.kind) - LINK_ORDER.indexOf(b.kind)
      || houses.indexOf(a.house ?? 99) - houses.indexOf(b.house ?? 99))[0] ?? null;
  };
  const transit = past ? '' : t.best.reasons.some(r => r.kind === 'doubleTransit') ? S.plusDouble[lang]
    : t.best.reasons.some(r => r.kind === 'jupiterTransit') ? S.plusJupiter[lang] : '';
  const v = vars(lang, t.topic, t.best, plan);
  if (!d) return transit ? { reason: null, transit: transit.trim() } : null;
  let planet = d.antar, link = pick(d.antarLinks);
  if (!link && pick(d.mahaLinks)) { planet = d.maha; link = pick(d.mahaLinks); }
  const P = planetName(planet, lang, true);
  let text: string;
  if (link) {
    const clause = fill(LINK_TEXT[link.kind]![lang], {
      p: planetName(planet, lang), area: link.house ? (TOPIC_HOUSE_WORD[t.topic]?.[link.house]?.[lang] ?? AREA_OF_HOUSE[lang][link.house]) : '', topic: AREA[lang][t.topic], topicGen: AREA_GEN_BN[t.topic],
    });
    text = fill((past ? S.reasonPlanetPast : S.reasonPlanet)[lang], { P, link: clause });
  } else {
    text = fill((past ? S.reasonPlanetOnlyPast : S.reasonPlanetOnly)[lang], { P, area: v.area, areaGen: v.areaGen });
  }
  let tr = transit.trim();
  // Another person's chart: their phase and their houses, not "your".
  if (plan.subject.isYou === false) {
    const name = firstName(plan.subject.name);
    const other = (x: string) => (lang === 'en' ? x.replace(/\byour\b/g, `${name}'s`)
      : lang === 'hi' ? x.replace(/आपके /g, `${name} के `).replace(/आपकी /g, `${name} की `)
        : x.replace(/আপনার /g, `${name}-এর `));
    text = other(text);
    tr = other(tr);
  }
  return { reason: text, transit: tr || null };
}

/**
 * At most one sentence about other windows (rubric: best window first, never two
 * competing ones): a stronger stretch when the best is only steady, the nearer
 * opening when a strong best is two or more years away, else the next good one.
 */
function altSentence(plan: AnswerPlan): string | null {
  const t = plan.timing!;
  if (plan.notes.includes('narrow') || t.result.past) return null;
  const lang = plan.lang;
  const best = t.best;
  const ws = t.result.windows;
  const lab = (w: { start: Date; end: Date }) => ({ start: monthLabel(w.start, lang), end: monthLabel(w.end, lang) });
  if (best.strength !== 'strong') {
    const strong = ws.filter(w => w !== best && w.strength === 'strong').sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    if (strong) return fill(S.altStronger[lang], lab(strong));
    if (t.result.nextStrong && yearsAway(t.result.nextStrong, plan.now) < 6) return fill(S.altNextStrong[lang], lab(t.result.nextStrong));
    return plan.say.some(l => l.code === 'likelihood') ? null : S.altSteady[lang];
  }
  if (yearsAway(best, plan.now) >= 2) {
    const nearer = ws.filter(w => w !== best && w.start < best.start).sort((a, b) => a.start.getTime() - b.start.getTime())[0]
      ?? nearerStretch(t.result, best);
    if (nearer) return fill(S.altEarlier[lang], lab(nearer));
  }
  const later = ws.filter(w => w !== best && w.start > best.end).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return later ? fill(S.altSecond[lang], lab(later)) : null;
}

/** Categories whose timing paragraph is compact (window and reason only). */
const COMPACT = new Set(['relationship_problems', 'mental_health_distress', 'why_now_current_phase', 'family_parents_siblings', 'divorce_separation', 'health_wellbeing', 'business_vs_job']);

/** Codes of plan lines that already give the answer's practical step (the topic tip is then left out). */
const PRACTICAL = new Set(['practical_step', 'communication_step', 'money_habit', 'study_strategy', 'self_care', 'doctor', 'lawyer']);

/** A sentence of a template answer with its trim priority (KEEP: never trimmed; lower is trimmed first). */
export type Part = { text: string; prio: number; short?: string; line?: PlanLine; core?: boolean; covers?: string[] };
export const KEEP = 100;

/**
 * The timing paragraph (Stage 3: 50-90 words, answer first): the window (with
 * the most likely month when narrowing, or the other person's name), one chart
 * reason, at most one other window, one practical step, and the caveats.
 */
export function timingSentences(plan: AnswerPlan, opts: { withHelps?: boolean } = {}): string[] {
  return timingParts(plan, opts).map(x => x.text);
}

export function timingParts(plan: AnswerPlan, { withHelps = true } = {}): Part[] {
  const t = plan.timing;
  if (!t) return [];
  const lang = plan.lang;
  const v = vars(lang, t.topic, t.best, plan);
  const out: Part[] = [];
  const push = (text: string, prio: number) => out.push({ text, prio, core: true });
  const other = plan.subject.isYou === false && plan.decline !== 'minorRomance';
  const name = firstName(plan.subject.name);
  const named = { ...v, name, nameGen: `${name}-এর` };
  const narrow = plan.notes.includes('narrow');
  if (t.result.past) push(fill(S.pastWindow[lang], { ...v, who: other ? fill(S.whoOther[lang], { name }) : '' }), KEEP);
  else if (other) push(fill(S.windowOther[lang], named), KEEP);
  else push(fill((narrow ? S.windowNarrow : t.topic === 'general' ? S.windowGeneral : S.window)[lang], { ...v, who: '' }), KEEP);
  // Where feelings, dynamics or care lead the answer, the window is one part of it: no alternatives.
  // A yes/no answer (likelihood line) is likelihood + window + reason: no alternatives either.
  const compact = COMPACT.has(plan.resolved) || plan.say.some(l => l.code === 'likelihood');
  if (plan.decline !== 'minorRomance') {
    // One concrete chart reason, also for a past window (rubric 3.2: "why that time" in one clause).
    const r = reasonParts(plan);
    if (r?.reason) push(r.reason, 80);
    if (r?.transit) push(r.transit, 20);
    const alt = compact || t.result.past ? null : altSentence(plan);
    // A nearer opening before a far window matters more than "the next one after".
    if (alt) push(alt, plan.notes.includes('far') ? 45 : 30);
  }
  if (!t.result.past && withHelps && !plan.say.some(l => PRACTICAL.has(l.code))) {
    // Loan approval: a saving/returns tip is beside the point; repayment record and paperwork are what lenders weigh.
    const approval = areaOverride(plan, t.topic) === AREA_OVERRIDE.approval;
    push(other ? fill(S.helpOther[lang], named) : approval ? HELP_APPROVAL[lang] : helpFor(plan, t.topic), 50);
    out[out.length - 1].covers = ['practical_step', ...(t.topic === 'money' ? ['money_habit'] : [])];
  }
  if (plan.notes.includes('exactDate')) push(S.exactDate[lang], 70);
  // The no-birth-time caveat is never trimmed (the verify layer would add back its longer form).
  if (plan.notes.includes('noTime')) push(S.noTimeShort[lang], 95);
  else if (plan.notes.includes('noPlace')) push(S.noPlace[lang], 40);
  return out.map(x => ({ ...x, text: localText(x.text, lang) }));
}

/**
 * The full deterministic answer for a plan. Routes 'crisis', 'greeting' and
 * 'canned' use the app's i18n strings and are rendered by the pipeline; for
 * those, and for an answer with no topic, this returns null.
 */
export function renderTemplate(plan: AnswerPlan, previous: string[] = []): string | null {
  const lang = plan.lang;
  if (plan.route === 'decline') {
    switch (plan.decline) {
      case 'death': {
        // An accident question gets its own decline; an ill parent gets sympathy first and care lines (plan.say), not "ask me about the coming years".
        if (/\baccident|durghatna|dughotona|दुर्घटना|এক্সিডেন্ট|দুর্ঘটনা/i.test(plan.question)) return withLines(plan, S.accident[lang], previous);
        return withLines(plan, plan.say.some(l => l.code === 'validation') ? S.deathShort[lang] : S.death[lang], previous);
      }
      case 'elderChildren': return withLines(plan, S.elderChildren[lang], previous);
      case 'otherMissing': {
        const owner = plan.subject.isYou === false
          ? fill(S.ownerOther[lang], { name: firstName(plan.subject.name) }) : S.ownerSelf[lang];
        return fill(S.otherMissing[lang], { relation: relationWord(plan.missingRelation ?? 'relative'), owner });
      }
      case 'minorRomance': {
        // The redirect, the study window and one study tip: nothing about romance timing, no extra windows.
        const parts = [fill(S.minorRomance[lang], { age: plan.age ?? '' })];
        // Family pressing a minor about marriage: what they can say and who can help (plan.ts).
        parts.push(...plan.say.map(l => l.text[lang]));
        if (plan.timing) parts.push(...timingSentences(plan));
        return localText(parts.join(' '), lang);
      }
      case 'emergency': case 'abuse': case 'identity': case 'childSexWhy': case 'askWhich':
        return withLines(plan, '', previous);
      default: return null;
    }
  }
  if (plan.route !== 'answer') return null;
  const t = plan.timing;
  let core: Part[] = [];
  if (!plan.coreOff) {
    if (plan.content && !plan.intent.timing) core = contentParts(plan, previous);
    // The window answers the question, so it comes first; the sub-period behind it is its reason.
    else if (t) core = timingParts(plan);
  }
  if (!core.length && !plan.say.length) return null;
  return withLines(plan, core, previous);
}

/** Soft word budget for a whole template answer (Stage 3 target 50-90 words; Hindi and Bengali run ~10% longer / shorter). */
const BUDGET: Record<Lang, number> = { en: 90, hi: 100, bn: 85 };
/** Hard word limit (judge_rubric.md 3.5 "long" from): over it, the least important sentences go first. */
export const WORD_LIMIT: Record<Lang, number> = { en: 90, hi: 105, bn: 85 };

/**
 * Sentences that say the same kind of thing ("talk to your family" twice, two doctor lines):
 * one per answer. Matched per sentence, in any of the three languages.
 */
const SAME_POINT: [string, RegExp][] = [
  ['familyTalk', /\btalk\b[^.;]*\b(?:family|parents)\b|(?:परिवार|माता-पिता|घरवालों)[^।;]*बात (?:करें|कीजिए)|(?:পরিবার|বাবা-মা)[^।;]*কথা বলুন/i],
  ['doctor', /\b(?:see|talk to|consult) (?:a |your )?doctor\b|डॉक्टर (?:को दिखाएँ|से (?:बात|सलाह|मिलें))|ডাক্তার(?:ের সঙ্গে কথা| দেখান)/i],
  ['counsellor', /\bcounsell?or\b|काउंसलर|কাউন্সেলর/i],
  ['cv', /\bCV\b|बायोडाटा|বায়োডেটা/i],
];
const pointOf = (x: string) => SAME_POINT.find(([, re]) => re.test(x))?.[0] ?? null;

const count = (x: string) => x.split(/\s+/).filter(Boolean).length;

/**
 * The plan's lines around the core paragraph: lead lines first, then the
 * core, body and end lines. Lines already said in an earlier reply are left
 * out (unless required), and optional body lines stop at the word budget.
 * Then: one sentence per point (SAME_POINT), and over the language's word
 * limit the least important sentences are shortened or left out (never a
 * required line, the window or the direct answer).
 */
function withLines(plan: AnswerPlan, coreIn: Part[] | string, previous: string[]): string {
  const lang = plan.lang;
  const core: Part[] = typeof coreIn === 'string' ? (coreIn ? [{ text: coreIn, prio: KEEP, core: true }] : []) : coreIn;
  const said = (x: string) => previous.some(p => replyOverlap(westernDigits(x), p) >= SAID_MAX);
  const pick = (pos: 'lead' | 'body' | 'end') => plan.say.filter(l => l.pos === pos).map(l => ({ l, text: l.text[lang] }))
    // The direct answer to a choice ("IT or finance?") stays even when its reason echoes an earlier reply.
    .filter(({ l, text }) => l.required || l.code === 'leaning' || !said(text));
  const lead = pick('lead'), body = pick('body'), end = pick('end');
  const coreWords = core.reduce((a, x) => a + count(x.text), 0);
  let n = coreWords + [...lead, ...end].reduce((a, x) => a + count(x.text), 0);
  const keptBody: Part[] = [];
  // Codes the plan intends to cover (plan.must) that no kept line carries yet: such a line is kept past the budget.
  const covered = new Set([...lead, ...end].flatMap(x => [x.l.code, ...(x.l.also ?? [])]));
  // The core paragraph (window + sub-period, or the items + their reason) already gives the chart reason.
  if (core.length) covered.add('chart_reason');
  // A line that carries one of the plan's must codes is shortened at most, never dropped.
  const carriesMust = (l: PlanLine) => [l.code, ...(l.also ?? [])].some(c => plan.must.includes(c));
  const part = (l: PlanLine, text: string, prio: number): Part => ({
    text, prio: l.trim ?? (l.required ? KEEP : carriesMust(l) ? Math.max(prio, 90) : prio), short: l.short?.[lang], line: l,
  });
  for (const b of body) {
    const needed = [b.l.code, ...(b.l.also ?? [])].some(c => plan.must.includes(c) && !covered.has(c));
    // Optional body lines stop at the budget (Stage 3: answers ran to 130-180 words keeping "at least one").
    if (!b.l.required && !needed && n + count(b.text) > BUDGET[lang]) continue;
    for (const c of [b.l.code, ...(b.l.also ?? [])]) covered.add(c);
    keptBody.push(part(b.l, b.text, needed ? 90 : 40));
    n += count(b.text);
  }
  // Answer first (rules.md §1.1): a timing core's window sentence (after a yes/no likelihood line) comes before
  // feelings and context lines; feelings-first categories (distress, why-now) keep their order.
  const DIRECT = new Set(['likelihood', 'compat_score', 'lucky_values', 'muhurat_days', 'computed_fact', 'leaning', 'decline_name', 'decline_sex', 'no_exact_day', 'peak', 'window', 'emergency', 'safety_resources', 'explain_reasoning']);
  const OPENER = new Set(['ack_correction', 'calm_boundary', 'validation']);
  const leadPart = (x: { l: PlanLine; text: string }) => part(x.l, x.text, DIRECT.has(x.l.code) ? KEEP : OPENER.has(x.l.code) ? 85 : 60);
  // The core (a window, or a "which / what" answer's items) leads unless the category starts with feelings.
  const timingFirst = !plan.coreOff && core.length > 0 && !['mental_health_distress', 'why_now_current_phase', 'family_parents_siblings', 'relationship_problems'].includes(plan.resolved)
    && plan.category !== 'elderly';
  let head: Part[] = lead.map(leadPart);
  let coreRest = core;
  if (timingFirst) {
    // A one-phrase acknowledgement ("Thanks for telling me.", "Sorry…") still opens the answer.
    // Feelings get one short sentence before the answer (rules.md §1.8), never after the window.
    const open = lead.filter(x => OPENER.has(x.l.code)).map(leadPart);
    const direct = lead.filter(x => DIRECT.has(x.l.code)).map(leadPart);
    const rest = lead.filter(x => !DIRECT.has(x.l.code) && !OPENER.has(x.l.code)).map(leadPart);
    head = [...open, ...direct, core[0], ...rest];
    coreRest = core.slice(1);
  }
  const all = [...head, ...coreRest, ...keptBody, ...end.map(x => part(x.l, x.text, 45))].filter(x => x.text && x.text.trim());
  // Never the same sentence twice (a line and the core can share one), and one sentence per point:
  // the plan's own line (more specific) wins over the core's generic tip; else the more important one.
  const out: Part[] = [];
  const seen = new Set<string>();
  for (const x of all) {
    const k = westernDigits(x.text).trim();
    if (seen.has(k)) continue;
    seen.add(k);
    const pt = pointOf(x.text);
    const dup = pt ? out.findIndex(y => pointOf(y.text) === pt) : -1;
    if (dup >= 0) {
      const y = out[dup];
      const xWins = x.prio > y.prio || (x.prio === y.prio && !!y.core && !x.core);
      const loser = xWins ? y : x;
      // A required line is never dropped (two required lines of the same kind both stay).
      if (!loser.line?.required) {
        if (!xWins) continue;
        out.splice(dup, 1);
      }
    }
    out.push(x);
  }
  // A core sentence that is the only carrier of a must code (the timing paragraph's practical step) stays too.
  for (const x of out) {
    if (!x.covers) continue;
    const others = out.filter(y => y !== x && y.line).flatMap(y => [y.line!.code, ...(y.line!.also ?? [])]);
    if (x.covers.some(c => plan.must.includes(c as PlanLine['code']) && !others.includes(c as PlanLine['code']))) x.prio = Math.max(x.prio, 90);
  }
  // Over the word limit: shorten, then drop, the least important sentences (KEEP lines stay).
  const total = () => out.reduce((a, x) => a + count(x.text), 0);
  const order = out.filter(x => x.prio < KEEP).sort((a, b) => a.prio - b.prio);
  const over = () => total() > WORD_LIMIT[lang];
  // 1. Minor sentences (transit add-on, other windows, generic tips): shortened or left out.
  for (const x of order.filter(y => y.prio < 80)) {
    if (!over()) break;
    if (x.short) { x.text = x.short; x.short = undefined; } else out.splice(out.indexOf(x), 1);
  }
  // 2. Anything with a shorter wording (lines that carry a must code included).
  for (const x of order) {
    if (!over()) break;
    if (x.short && out.includes(x)) { x.text = x.short; x.short = undefined; }
  }
  // 3. Then the chart reason and acknowledgements; lines that carry a must code (prio 90+) are never dropped.
  for (const x of order.filter(y => y.prio >= 80 && y.prio < 90)) {
    if (!over()) break;
    if (out.includes(x)) out.splice(out.indexOf(x), 1);
  }
  return localText(out.map(x => capFirst(x.text)).join(' '), lang);
}

/** "a, b and c" in `lang`. */
const AND_ALSO: Record<Lang, string> = { en: ', and also ', hi: ', और साथ ही ', bn: ', সঙ্গে ' };
function joinList(parts: string[], lang: Lang): string {
  if (parts.length <= 1) return parts[0] ?? '';
  // Labels with their own commas ("caring, emotional and family-minded") are joined with "and also".
  if (parts.some(p => p.includes(',') || /\s(?:and|or|और|या|আর|ও|বা)\s/.test(p))) return parts.join(AND_ALSO[lang]);
  return parts.slice(0, -1).join(COMMA[lang]) + AND[lang] + parts[parts.length - 1];
}

const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * The key-items sentence of a content plan ("Your chart points most clearly
 * to A, B and C."): the verify layer appends it when a model reply names none
 * of the items. `variant` picks the wording.
 */
export function contentLead(content: AnswerContent, lang: Lang, variant = 0): string {
  const leads = LEAD[content.ask];
  const lead = (content.beyond && LEAD_BEYOND[content.ask]) || leads[variant % leads.length];
  // Two items lead every answer (rubric: 2-3 options, never a shotgun list); the third is kept for follow-ups.
  const n = 2;
  const extra = Object.fromEntries(Object.entries(content.vars ?? {}).map(([k, v]) => [k, v[lang]]));
  return localText(fill(lead[lang], { ...extra, items: joinList(content.items.slice(0, n).map(i => (i.text.short ?? i.text.label)[lang]), lang) }), lang);
}

/** Sentences of an earlier reply count as said when they overlap a candidate this much. */
const SAID_MAX = 0.35;
/** Soft length cap of a template answer (the v5 answers stay under 90 words). */
const MAX_WORDS: Record<Lang, number> = { en: 62, hi: 66, bn: 56 };

/**
 * A complete answer for a non-timing question from its AnswerContent: the
 * items, why (plain), concrete examples, the ask's extra line, a practical
 * tip and, for choice questions, one optional "good time to move" line from
 * the engine. With earlier replies in the thread (`previous`), anything
 * already said is left out: a follow-up on the same ask points back in one
 * line and adds what is new (the second item's examples, another tip), so
 * the template never repeats the thread either.
 */
export function renderContent(plan: AnswerPlan, previous: string[] = []): string {
  return localText(contentParts(plan, previous).map(x => capFirst(x.text)).join(' '), plan.lang);
}

export function contentParts(plan: AnswerPlan, previous: string[] = []): Part[] {
  const c = plan.content!;
  if (c.ask === 'whyNow') return whyNowParts(plan, previous);
  const lang = plan.lang;
  const said = (t: string) => previous.some(p => replyOverlap(t, p) >= SAID_MAX);
  const label = (i: number) => (c.items[i] ? (c.items[i].text.short ?? c.items[i].text.label)[lang] : '');
  // A follow-up on the same items: an earlier reply already NAMED the first item (its label, not just a shared word).
  const namedBefore = (i: number) => !!c.items[i] && previous.some(p => {
    const w = westernDigits(p).toLowerCase();
    return [c.items[i].text.label[lang], c.items[i].text.short?.[lang]].some(x => x && w.includes(x.toLowerCase()));
  });
  // A clarification ("I mean which domain?") gets the full answer again, in other words.
  const followUp = !plan.intent.clarifies && c.items.length > 0 && namedBefore(0) && !!(FOLLOW_LEAD_ASK[c.ask] ?? DIRECTION_ASKS.has(c.ask));

  const leads = [0, 1, 2, 3].map(v => {
    const items = v % 2 === 1 && c.items.length > 1 ? [...c.items.slice(1), c.items[0]] : c.items;
    return contentLead({ ...c, items }, lang, v);
  });
  // A third turn on a "directions" ask names the next item to try (partner traits never get "the next one to try").
  const followLeads = [fill((FOLLOW_LEAD_ASK[c.ask] ?? FOLLOW_LEAD)[lang], { item: label(0) }),
    ...(label(1) && c.ask !== 'partner' ? [fill(FOLLOW_LEAD_NEXT[lang], { item: label(1) })] : [])];
  // "Where will we meet?": the meeting line is the answer, so it leads.
  const meetQ = c.ask === 'partner' && /\b(?:where|meet|kahan|kaha|kothay|kothai)\b|कहाँ|कहां|मिलूँ|मिलूं|কোথায়|দেখা হবে/i.test(plan.question);
  const meet = c.extra.find(e => e.kind === 'meet');
  let lead = followUp
    ? followLeads.find(l => !said(l)) ?? followLeads[0]
    : leads.find(l => !said(l)) ?? (plan.intent.clarifies ? leads[1] : leads[0]);
  // Love or arranged with no pull either way: say so, then the middle path (not "leans to … because no pull dominates").
  const evenLove = c.ask === 'loveArranged' && /:both$/.test(c.items[0]?.key ?? '');
  if (evenLove && !followUp) lead = fill(LOVE_EVEN[lang], { item: label(0) });
  const parts: string[] = [];
  if (meetQ && meet) parts.push(fill(MEET_LINE[lang], { meet: meet.text[lang] }));
  parts.push(lead);
  const optional: string[] = [];
  const optPrio = new Map<string, number>();
  const opt = (x: string, prio: number, front = false) => { optPrio.set(x, prio); if (front) optional.unshift(x); else optional.push(x); };
  const whys = c.items.flatMap(i => (i.why ? [i.why[lang]] : []));
  // (Not when a leaning line already gave the same reason.)
  const leanWhy = plan.say.some(l => l.code === 'leaning' && whys[0] && l.text[lang].includes(whys[0]));
  if (whys.length && !followUp && !leanWhy && !evenLove) opt(fill(BECAUSE[lang], { reasons: whys[0] }), 80);
  if (followUp) {
    // Items the thread hasn't named yet come first in a follow-up.
    for (const [k, it] of c.items.slice(1).entries()) {
      if (!namedBefore(k + 1) && it.why) opt(fill((NEXT_ITEM_ASK[c.ask] ?? NEXT_ITEM)[lang], { item: (it.text.short ?? it.text.label)[lang], why: it.why[lang] }), 80, true);
    }
    lead = parts[parts.length - 1];
  }
  const exampleList = (i: number, n: number) => c.items[i]?.text.examples?.[lang].split(/,\s*/).slice(0, n).join(COMMA[lang]);
  if (c.ask === 'careerField') {
    // One set of concrete roles (rubric: no more than ~4 options); the second field's roles are a follow-up's new information.
    const ex0 = exampleList(0, 3);
    const ex1 = exampleList(1, 3);
    if (!followUp && ex0) opt(fill(EXAMPLES[lang], { examples: ex0 }), 55);
    if (followUp && ex1) opt(fill(EXAMPLES_MORE[lang], { examples: ex1 }), 55);
  }
  for (const e of c.extra) {
    const t = e.text[lang];
    if (e.kind === 'meet') { if (!meetQ) opt(fill(MEET_LINE[lang], { meet: t }), 45); }
    else if (e.kind === 'weak') opt(fill(WEAK_LINE[lang], { weak: t }), 45);
    else if (e.kind === 'place') opt(fill(PLACE_LINE[lang], { place: t }), 35);
    else if (e.kind === 'field') opt(fill(FIELD_LINE[lang], { field: t }), 35);
    else opt(t, 35);
  }
  const leanJob = c.ask === 'businessVsJob' && /:job$/.test(c.items[0]?.key ?? '');
  const tip1 = leanJob ? TIP_JOB[lang] : c.ask === 'careerField' && isElder(plan) ? TIP_ELDER_CAREER[lang] : TIP[c.ask][lang];
  const tips = plan.intent.kind === 'advice' || followUp ? [TIP2[c.ask][lang], tip1] : [tip1, TIP2[c.ask][lang]];
  for (const x of tips) opt(x, 50);
  // A dated "good time to move" only where the chart favours the move and it is near (rubric 3.3: no far, unasked dates).
  const w = c.window?.best;
  const moveAsk = (c.ask === 'businessVsJob' && /:(?:business|both)$/.test(c.items[0]?.key ?? '')) || (c.ask === 'relocation' && /:abroad$/.test(c.items[0]?.key ?? ''));
  const near = w && (w.start.getTime() - plan.now.getTime()) / (365.25 * 86400000) < 2;
  const gaveWindow = w && previous.some(p => findDates(p).some(d => d.year != null && dateInWindows({ year: d.year, month: d.month }, [w], 0)));
  if (w && moveAsk && near && !gaveWindow) opt(fill(WINDOW_LINE[lang], { start: monthLabel(w.start, lang), end: monthLabel(w.end, lang) }), 30);

  let n = parts.reduce((a, x) => a + count(x), 0);
  let tipped = false;
  const kept: Part[] = parts.map(x => ({ text: x, prio: KEEP, core: true }));
  for (const o of optional) {
    if (said(o)) continue;
    const isTip = tips.includes(o);
    if (isTip && tipped) continue;
    // One practical tip always fits (rules.md §1.4); other extras stop at the word budget.
    if (n + count(o) > MAX_WORDS[lang] && parts.length >= 2 && !isTip) continue;
    parts.push(o);
    kept.push({ text: o, prio: optPrio.get(o) ?? 35, core: true, ...(isTip ? { covers: ['practical_step', ...(c.ask === 'moneySources' ? ['money_habit'] : [])] } : {}) });
    n += count(o);
    if (isTip) tipped = true;
  }
  if (c.ask === 'wellbeing' || plan.resolved === 'health_wellbeing') kept.push({ text: DOCTOR_LINE[lang], prio: KEEP, core: true });
  return kept.map(x => ({ ...x, text: localText(x.text, lang) }));
}

const LOVE_EVEN: Record<Lang, string> = {
  en: "Your chart doesn't lean strongly either way, so the natural middle path is {item}.",
  hi: 'आपका चार्ट किसी एक तरफ़ ज़्यादा नहीं झुकता, इसलिए सबसे सहज रास्ता है: {item}।',
  bn: 'আপনার চার্ট কোনো এক দিকে বেশি ঝোঁকে না, তাই সবচেয়ে স্বাভাবিক পথ: {item}।',
};

/** Asks whose items are "directions" (FOLLOW_LEAD reads "your strongest direction is …"). */
const DIRECTION_ASKS = new Set(['careerField', 'studyField']);

/** 60+: no CV advice; experience-led roles (Stage 3: "put these skills first on your CV" at 80). */
const TIP_ELDER_CAREER: Record<Lang, string> = {
  en: 'At this stage these strengths fit advisory, mentoring or part-time roles; choose one that keeps you engaged without strain.',
  hi: 'इस दौर में ये गुण सलाह, मार्गदर्शन या पार्ट-टाइम काम में सबसे अच्छे लगते हैं; ऐसा काम चुनें जो बिना थकाए आपको जोड़े रखे।',
  bn: 'এই সময়ে এই গুণগুলো পরামর্শ, পথ দেখানো বা পার্ট-টাইম কাজে সবচেয়ে মানায়; এমন কাজ বেছে নিন যা ক্লান্ত না করে আপনাকে ব্যস্ত রাখে।',
};

/** Job-leaning business-vs-job tip (the business tip "test the idea before big money" contradicts a job leaning). */
const TIP_JOB: Record<Lang, string> = {
  en: 'Grow inside a role first; if you want a side venture, keep it small and part-time.',
  hi: 'पहले किसी नौकरी में आगे बढ़ें; कोई साइड काम करना हो तो उसे छोटा और पार्ट-टाइम रखें।',
  bn: 'আগে চাকরিতে এগোন; পাশে কিছু করতে চাইলে সেটা ছোট আর পার্ট-টাইম রাখুন।',
};

const WHY_LEAD: Record<'main' | 'satYes' | 'satNo' | 'also', Record<Lang, string>> = {
  main: { en: 'The main reason is {x}.', hi: 'इसकी मुख्य वजह है: {x}।', bn: 'এর মূল কারণ: {x}।' },
  satYes: { en: 'Yes, Saturn is part of it: {x}.', hi: 'हाँ, इसमें शनि की भूमिका है: {x}।', bn: 'হ্যাঁ, এতে শনির ভূমিকা আছে: {x}।' },
  satNo: { en: "Saturn isn't the main pressure right now; the bigger factor is {x}.", hi: 'अभी शनि मुख्य दबाव नहीं है; बड़ी वजह है: {x}।', bn: 'এখন শনি মূল চাপ নয়; বড় কারণ হলো: {x}।' },
  also: { en: 'Alongside it: {x}.', hi: 'इसके साथ: {x}।', bn: 'এর সঙ্গে: {x}।' },
};

const WHY_PRACTICE: Record<Lang, string> = {
  en: 'A free, traditional way to work with this phase: {practice}.',
  hi: 'इस दौर के साथ चलने का एक मुफ़्त, पारंपरिक तरीका: {practice}।',
  bn: 'এই পর্বের সঙ্গে চলার একটা বিনামূল্যের প্রথাগত উপায়: {practice}।',
};

const WHY_MEANS: Record<'saturn' | 'phase', Record<Lang, string>> = {
  saturn: {
    en: 'Saturn slows things down and tests patience; it does not block results, and steady routine is what it rewards.',
    hi: 'शनि चीज़ों को धीमा करता है और धैर्य परखता है; यह नतीजे रोकता नहीं, नियमित मेहनत का फल देता है।',
    bn: 'শনি সবকিছু ধীর করে আর ধৈর্যের পরীক্ষা নেয়; এটা ফল আটকায় না, নিয়মিত পরিশ্রমেরই ফল দেয়।',
  },
  phase: {
    en: 'This is a phase with an end date, not a verdict on you.',
    hi: 'यह एक दौर है जिसका अंत तय है, आपके बारे में कोई फ़ैसला नहीं।',
    bn: 'এটা একটা পর্ব, যার শেষ আছে; আপনার সম্পর্কে কোনো রায় নয়।',
  },
};

/**
 * "Why is everything going wrong?": the main cause first (a hard Saturn transit over
 * the Moon when there is one, else the current sub-period, else the major period),
 * the other running cycle, one hopeful dated line when the plan has one, and a step.
 * Answers "is it Saturn?" directly. Stage 3 judging: the older template listed the
 * major and sub-period abstractly and left the Saturn pressure out.
 */
function whyNowParts(plan: AnswerPlan, previous: string[]): Part[] {
  const c = plan.content!;
  const lang = plan.lang;
  const said = (t: string) => previous.some(p => replyOverlap(t, p) >= SAID_MAX);
  const get = (k: string) => c.items.find(i => i.key === k);
  const sat = c.items.find(i => i.planet === 'Saturn' && !['why:maha', 'why:antar'].includes(i.key));
  const antar = get('why:antar');
  const maha = get('why:maha');
  const main = sat ?? antar ?? maha;
  if (!main) return [];
  const second = [antar, maha].find(x => x && x !== main);
  const lab = (i: typeof main) => i.text.label[lang];
  const askedSaturn = /\b(?:saturn|shan[iy]|shoni)(?:r|er|ka|ki|ke)?\b|\bsade ?sati\b|शनि|साढ़े ?साती|শনি|সাড়ে ?সাতি/i.test(plan.question);
  const first = askedSaturn ? fill((sat ? WHY_LEAD.satYes : WHY_LEAD.satNo)[lang], { x: lab(main) }) : fill(WHY_LEAD.main[lang], { x: lab(main) });
  const parts: Part[] = [{ text: first, prio: KEEP, core: true }];
  const add = (t: string | undefined, prio: number) => { if (t && !said(t)) parts.push({ text: t, prio, core: true }); };
  const repeat = said(first);
  // A follow-up that already heard the main cause still gets the other running cycle when it is new.
  if (second) add(fill(WHY_LEAD.also[lang], { x: lab(second) }), 70);
  // A follow-up that already heard the cause gets what it means instead (never just a tip).
  if (repeat || !second) add(sat ? WHY_MEANS.saturn[lang] : WHY_MEANS.phase[lang], 60);
  const hope = c.extra.find(e => e.kind === 'line' || e.kind === 'topicLink');
  if (hope) add(hope.text[lang], 65);
  // Asked again ("why is it still so bad?"): something new from the chart, the main planet's free traditional practices.
  if (repeat && main.planet && REMEDY[main.planet as keyof typeof REMEDY]) add(fill(WHY_PRACTICE[lang], { practice: REMEDY[main.planet as keyof typeof REMEDY][plan.thread.secular ? 'secular' : 'practice'][lang] }), 55);
  const tip = said(TIP.whyNow[lang]) ? TIP2.whyNow[lang] : TIP.whyNow[lang];
  parts.push({ text: tip, prio: 50, core: true, covers: ['practical_step'] });
  return parts.map(x => ({ ...x, text: localText(x.text, lang) }));
}

/** A short pointer used when no model is available and the plan has nothing to say. */
export function renderNoTopic(lang: Lang): string {
  return S.askWhen[lang];
}

/** Krishna without a model: a short line, then the verse the app picks for the question (hi/bn digits). */
export function krishnaTemplate(question: string, lang: Lang): string {
  return localText(`${S.krishnaOffline[lang]}\n\n${formatGitaQuote(pickGitaVerse(question), lang)}`, lang);
}
