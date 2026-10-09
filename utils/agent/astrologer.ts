/**
 * The astrologer's reasoning for non-timing questions (answer types other
 * than "when"): which career field, what kind of partner, where money comes
 * from, which subject, business or job, abroad or home, strengths, health
 * habits, and why life feels the way it does now. Model-free and
 * deterministic, like the timing engine: AnswerContent → template, model
 * prompt and relevance check (plan.ts, adapters, verify.ts).
 *
 * Method (classical significations; BPHS bhava chapters, Phaladeepika on
 * karakas and bhava results, Jaimini Sutras for the chara karakas):
 *  - each ask has its houses: career 10th; partner 7th (+ Venus); money 2nd
 *    and 11th (+ Jupiter); study 4th, 5th, 9th (+ Mercury, Jupiter); health
 *    habits 1st and 6th (+ Moon); abroad 12th, 9th vs home 4th; strengths
 *    the 1st, its lord, the Moon and the Atmakaraka;
 *  - a planet earns points for ruling the main house (3), sitting in it (2.5),
 *    sitting with its lord (1), aspecting it by graha drishti (1), being the
 *    dispositor of its lord (1), being the Amatyakaraka for career (2: the
 *    planet with the second-highest degree in its sign, Sun to Saturn, after
 *    the Atmakaraka), and the ask's natural karaka (0.5-1.5);
 *  - points are scaled by dignity (own / exalted 1.3, debilitated 0.7) and
 *    placement (angles and trines 1.15, the 11th 1.1, the 6th / 8th / 12th
 *    0.85), and the top two or three planets are mapped to concrete items
 *    (ask-strings.ts), each with the strongest link as its plain reason.
 * Divisional charts (D9, D10) are not computed: the app has no reliable
 * birth-minute accuracy for most profiles, so the rasi chart alone is read.
 *
 * Pure: no React Native, no i18n.
 */
import { getChartPositions, getDashaTimeline, siderealLongitudeAt } from '../astrology';
import {
  aspects, lordOfHouse, natalChart, timingWindows, topicLinks,
  type NatalChart, type Planet, type TimingProfile, type TimingTopic, type TimingWindow,
} from '../timing-engine';
import type { AnswerKind, Ask } from './intent';
import {
  AREA_OF_HOUSE, BUSINESS, CAREER, MEET, MONEY, PARTNER, PLACE, RELOCATE, STRENGTH, STUDY, WELLBEING, WHY, WHY_NOW,
  TOPIC_NOUN, PLANET_NAME, type ItemText, type L3,
} from './ask-strings';
import type { Lang } from './strings';

const PLANETS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const SEVEN: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const BENEFICS: Planet[] = ['Jupiter', 'Venus', 'Mercury', 'Moon'];

export type LinkWhy = keyof typeof WHY;

/** One concrete thing the answer names, with why (plain) and how to spot it in a reply. */
export type PlanItem = {
  key: string;
  planet: Planet | null;
  text: ItemText;
  /** The strongest chart link behind it (plain clause per language), or null. */
  why: L3 | null;
  /** Astrologer's note (logs, instruct prompt): "Saturn occupies the 10th". */
  source: string;
};

export type AnswerContent = {
  ask: Ask;
  kind: AnswerKind;
  /** Ranked; the answer must name at least the first (verify relevance: any of them). */
  items: PlanItem[];
  /** Ask-specific extras rendered as their own sentence. */
  extra: { kind: 'meet' | 'weak' | 'place' | 'field' | 'topicLink'; text: L3; terms?: string }[];
  /** The engine window an optional "good time to move" line may name (choice asks with a topic). */
  window: { topic: TimingTopic; best: TimingWindow } | null;
  /** Dates the answer may name besides the window (whyNow: when the current cycle ends). */
  allowedDates: Date[];
};

// ─── Chart helpers ───────────────────────────────────────────────────────────

const houseSign = (c: NatalChart, h: number) => (c.first + h - 1) % 12;
const houseOf = (c: NatalChart, p: Planet) => ((c.planets[p].sign - c.first + 12) % 12) + 1;
const occupants = (c: NatalChart, h: number) => PLANETS.filter(p => c.planets[p].sign === houseSign(c, h));
const SIGN_RULER: Planet[] = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];

/** Dignity and placement multiplier. */
function strength(c: NatalChart, p: Planet): number {
  const d = c.planets[p].dignity;
  const h = houseOf(c, p);
  const dig = d === 'own' || d === 'exalted' ? 1.3 : d === 'debilitated' ? 0.7 : 1;
  const place = [1, 4, 7, 10, 5, 9].includes(h) ? 1.15 : h === 11 ? 1.1 : [6, 8, 12].includes(h) ? 0.85 : 1;
  return dig * place;
}

/** Chara karakas (Jaimini, seven-karaka scheme): planets Sun–Saturn by degree in sign, highest first. */
export function charaKarakas(profile: TimingProfile): Planet[] {
  const pos = getChartPositions(profile).filter(x => SEVEN.includes(x.name as Planet));
  return pos.sort((a, b) => (b.degree % 30) - (a.degree % 30)).map(x => x.name as Planet);
}

type Score = { planet: Planet; score: number; links: { why: LinkWhy; house?: number; w: number }[] };

/**
 * Points per planet for a set of houses ([house, weight], the first is the
 * main one) plus karakas; `amk` adds the Amatyakaraka (career).
 */
function scorePlanets(
  c: NatalChart, houses: [number, number][], karakas: [Planet, number][] = [], amk?: Planet,
): Score[] {
  const out = new Map<Planet, Score>(PLANETS.map(p => [p, { planet: p, score: 0, links: [] }]));
  const add = (p: Planet, w: number, why: LinkWhy, house?: number) => {
    const s = out.get(p)!;
    s.score += w;
    s.links.push({ why, house, w });
  };
  for (const [h, hw] of houses) {
    const sign = houseSign(c, h);
    const lord = lordOfHouse(c.first, h);
    add(lord, 3 * hw, 'lord', h);
    for (const p of occupants(c, h)) add(p, 2.5 * hw, 'occupant', h);
    for (const p of PLANETS) {
      if (c.planets[p].sign !== sign && aspects(p, c.planets[p].sign, sign)) add(p, 1 * hw, 'aspect', h);
      if (p !== lord && c.planets[p].sign === c.planets[lord].sign) add(p, 1 * hw, 'withLord', h);
    }
    // The lord's dispositor colours its results.
    const disp = SIGN_RULER[c.planets[lord].sign];
    if (disp !== lord) add(disp, 1 * hw, 'withLord', h);
  }
  for (const [k, w] of karakas) add(k, w, 'karaka');
  if (amk) add(amk, 2, 'amk');
  return [...out.values()]
    .map(s => ({ ...s, score: s.score * strength(c, s.planet) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || PLANETS.indexOf(a.planet) - PLANETS.indexOf(b.planet));
}

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

/** The plain "why" clause of a planet's strongest link. */
function whyOf(c: NatalChart, s: Score): { why: L3; source: string } {
  const order: LinkWhy[] = ['occupant', 'lord', 'amk', 'withLord', 'aspect', 'karaka'];
  const best = [...s.links].sort((a, b) => order.indexOf(a.why) - order.indexOf(b.why) || b.w - a.w)[0];
  const kind = best?.why ?? 'strong';
  const h = best?.house;
  const why = {} as L3;
  for (const lang of ['en', 'hi', 'bn'] as Lang[]) {
    const p = PLANET_NAME[s.planet][lang];
    why[lang] = fill(WHY[kind][lang], { p, pg: lang === 'bn' ? `${p}ের` : p, area: h ? AREA_OF_HOUSE[lang][h] : '' });
  }
  const dig = c.planets[s.planet].dignity;
  const source = `${s.planet} ${kind}${h ? ` ${h}` : ''} (in house ${houseOf(c, s.planet)}${dig !== 'neutral' ? `, ${dig}` : ''}; score ${s.score.toFixed(1)})`;
  return { why, source };
}

function items(c: NatalChart, scores: Score[], table: Record<Planet, ItemText>, n: number, key: string): PlanItem[] {
  return scores.slice(0, n).map(s => {
    const { why, source } = whyOf(c, s);
    return { key: `${key}:${s.planet}`, planet: s.planet, text: table[s.planet], why, source };
  });
}

const verdictItem = (key: string, text: ItemText, source: string): PlanItem => ({ key, planet: null, text, why: null, source });

// ─── Asks ────────────────────────────────────────────────────────────────────

/** Career field / domain: 10th house, its lord and dispositor, occupants, aspects, the Amatyakaraka. */
export function careerField(profile: TimingProfile, c = natalChart(profile)): PlanItem[] {
  const amk = charaKarakas(profile)[1];
  const scores = scorePlanets(c, [[10, 1]], [['Saturn', 0.5], ['Sun', 0.5], ['Mercury', 0.5]], amk);
  return items(c, scores, CAREER, 3, 'career');
}

function partner(c: NatalChart): { list: PlanItem[]; meet: L3 } {
  const scores = scorePlanets(c, [[7, 1]], [['Venus', 1.5]]);
  const lordHouse = houseOf(c, lordOfHouse(c.first, 7));
  return { list: items(c, scores, PARTNER, 3, 'partner'), meet: MEET[lordHouse] };
}

function moneySources(c: NatalChart): PlanItem[] {
  return items(c, scorePlanets(c, [[2, 1], [11, 1]], [['Jupiter', 1]]), MONEY, 3, 'money');
}

function studyField(c: NatalChart): PlanItem[] {
  return items(c, scorePlanets(c, [[5, 1], [4, 0.8], [9, 0.8]], [['Mercury', 1.5], ['Jupiter', 1.5]]), STUDY, 3, 'study');
}

function wellbeing(c: NatalChart): PlanItem[] {
  // Planets acting on the body (1st) and on illness (6th); malefics weigh more as things to look after.
  const scores = scorePlanets(c, [[1, 1], [6, 0.8]], [['Moon', 1]])
    .map(s => ({ ...s, score: s.score * (['Mars', 'Saturn', 'Rahu', 'Ketu', 'Sun'].includes(s.planet) ? 1.2 : 1) }))
    .sort((a, b) => b.score - a.score);
  return items(c, scores, WELLBEING, 3, 'wellbeing');
}

function strengths(profile: TimingProfile, c: NatalChart): { list: PlanItem[]; weak: L3 } {
  const ak = charaKarakas(profile)[0];
  const scores = scorePlanets(c, [[1, 1]], [['Moon', 1], [ak, 1.5]]);
  const list = items(c, scores, STRENGTH, 3, 'strength');
  // The weak side: a debilitated or 6/8/12-placed planet among the self, its lord and the Moon; else the top planet's shadow.
  const self = [lordOfHouse(c.first, 1), 'Moon' as Planet, ...occupants(c, 1)];
  const weakP = self.find(p => c.planets[p].dignity === 'debilitated')
    ?? self.find(p => [6, 8, 12].includes(houseOf(c, p)))
    ?? list[0]?.planet ?? 'Moon';
  return { list, weak: STRENGTH[weakP].weak };
}

function relocation(c: NatalChart): { list: PlanItem[]; place: L3; verdict: 'abroad' | 'home' | 'mixed' } {
  const l12 = lordOfHouse(c.first, 12);
  const l4 = lordOfHouse(c.first, 4);
  const l9 = lordOfHouse(c.first, 9);
  let abroad = 0;
  let home = 0;
  if ([1, 7, 9, 12].includes(houseOf(c, l12))) abroad += 2;
  if (houseOf(c, l4) === 12) abroad += 2;
  if (houseOf(c, l9) === 12) abroad += 1;
  if ([1, 4, 7, 9, 10, 12].includes(houseOf(c, 'Rahu'))) abroad += 1;
  if ([9, 12].includes(houseOf(c, 'Moon'))) abroad += 1;
  abroad += 0.5 * occupants(c, 12).length;
  const d4 = c.planets[l4].dignity;
  if (d4 === 'own' || d4 === 'exalted') home += 1.5;
  if ([1, 4, 7, 10].includes(houseOf(c, l4))) home += 1.5;
  home += occupants(c, 4).filter(p => BENEFICS.includes(p)).length;
  const verdict = abroad >= home + 1.5 ? 'abroad' : home >= abroad + 1.5 ? 'home' : 'mixed';
  const source = `abroad ${abroad} (12th lord ${l12} in ${houseOf(c, l12)}, 4th lord ${l4} in ${houseOf(c, l4)}, Rahu in ${houseOf(c, 'Rahu')}) vs home ${home}`;
  const placeP = verdict === 'home' ? l4 : l12;
  return { list: [verdictItem(`relocate:${verdict}`, RELOCATE[verdict], source)], place: PLACE[placeP].label, verdict };
}

function businessVsJob(c: NatalChart): { list: PlanItem[]; verdict: 'business' | 'job' | 'both' } {
  const lord = (h: number) => lordOfHouse(c.first, h);
  const s = (p: Planet) => strength(c, p);
  let business = s(lord(7)) + s(lord(3)) + s('Mercury');
  let job = s(lord(6)) + s(lord(10)) + s('Saturn');
  business += 0.8 * occupants(c, 7).filter(p => BENEFICS.includes(p)).length;
  business += 0.5 * [...occupants(c, 3), ...occupants(c, 11)].filter(p => p === 'Mercury' || p === 'Mars' || p === 'Rahu').length;
  if ([1, 3, 7, 11].includes(houseOf(c, lord(10)))) business += 1;
  if ([6, 10, 2].includes(houseOf(c, lord(10)))) job += 1;
  job += 0.8 * occupants(c, 6).length;
  if (['Saturn', 'Sun'].some(p => houseOf(c, p as Planet) === 10)) job += 0.5;
  const verdict = business >= job + 0.8 ? 'business' : job >= business + 0.8 ? 'job' : 'both';
  const source = `business ${business.toFixed(1)} (7th lord ${lord(7)}, 3rd lord ${lord(3)}, Mercury) vs job ${job.toFixed(1)} (6th lord ${lord(6)}, 10th lord ${lord(10)}, Saturn)`;
  return { list: [verdictItem(`business:${verdict}`, BUSINESS[verdict], source)], verdict };
}

// Saturn from the natal Moon: 12/1/2 sade sati, 8 ashtama, 4 kantaka.
const SAT_HARD: Record<number, 'sadeSati' | 'ashtama' | 'kantaka'> = { 12: 'sadeSati', 1: 'sadeSati', 2: 'sadeSati', 8: 'ashtama', 4: 'kantaka' };

function saturnFromMoon(c: NatalChart, d: Date): number {
  const sat = Math.floor(siderealLongitudeAt('Saturn', d.getTime() / 86400000 + 2440587.5) / 30) % 12;
  return ((sat - c.moonSign + 12) % 12) + 1;
}

/** The current hard Saturn transit (if any) and the month it ends. */
export function saturnPressure(c: NatalChart, now: Date): { kind: 'sadeSati' | 'ashtama' | 'kantaka'; end: Date } | null {
  const kind = SAT_HARD[saturnFromMoon(c, now)];
  if (!kind) return null;
  const same = (h: number) => (kind === 'sadeSati' ? [12, 1, 2].includes(h) : SAT_HARD[h] === kind);
  for (let m = 1; m <= 96; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 15);
    if (!same(saturnFromMoon(c, d))) {
      // A retrograde dip back is part of the same transit: require three clear months.
      const later = [3, 6].map(k => new Date(d.getFullYear(), d.getMonth() + k, 15));
      if (later.every(x => !same(saturnFromMoon(c, x)))) return { kind, end: new Date(d.getFullYear(), d.getMonth(), 1) };
    }
  }
  return null;
}

function whyNow(profile: TimingProfile, c: NatalChart, now: Date, topic: TimingTopic | null):
  { list: PlanItem[]; allowed: Date[]; link: L3 | null } {
  const t = getDashaTimeline(c.moonLon, profile.birthDate, now);
  const maha = t.maha.lord as Planet;
  const antar = t.antar.lord as Planet;
  const list: PlanItem[] = [];
  const allowed: Date[] = [t.antar.end];
  const month = (d: Date, l: Lang) => monthName(d, l);
  const area = (p: Planet, l: Lang) => AREA_OF_HOUSE[l][houseOf(c, p)];
  const mk = (key: string, table: L3, vars: (l: Lang) => Record<string, string>, source: string, planet: Planet | null): PlanItem => ({
    key, planet, why: null, source,
    text: {
      label: { en: fill(table.en, vars('en')), hi: fill(table.hi, vars('hi')), bn: fill(table.bn, vars('bn')) },
      model: fill(table.en, vars('en')),
      terms: [AREA_OF_HOUSE.en[houseOf(c, planet ?? 'Saturn')], AREA_OF_HOUSE.hi[houseOf(c, planet ?? 'Saturn')], AREA_OF_HOUSE.bn[houseOf(c, planet ?? 'Saturn')]]
        .map(s => s.split(/ and | और | আর /)[0].replace(/ের$|র$/, '')).filter(Boolean).join('|'),
    },
  });
  list.push(mk('why:maha', WHY_NOW.maha, l => ({ area: area(maha, l) }), `mahadasha ${maha} (in house ${houseOf(c, maha)})`, maha));
  if (antar !== maha) {
    list.push(mk('why:antar', WHY_NOW.antar, l => ({ area: area(antar, l), end: month(t.antar.end, l) }),
      `antardasha ${antar} (in house ${houseOf(c, antar)}) until ${t.antar.end.toISOString().slice(0, 7)}`, antar));
  }
  const sat = saturnPressure(c, now);
  if (sat) {
    allowed.push(sat.end);
    const it = mk(`why:${sat.kind}`, WHY_NOW[sat.kind], l => ({ end: month(sat.end, l) }), `Saturn ${sat.kind} until ${sat.end.toISOString().slice(0, 7)}`, 'Saturn');
    it.text.terms = 'slow|testing|heavy|strain|pressure|धीमा|परख|भारी|दबाव|ধীর|পরীক্ষা|ভারী|চাপ';
    list.push(it);
  }
  let link: L3 | null = null;
  if (topic && topic !== 'general') {
    const links = topicLinks(c, topic);
    const on = (links[antar]?.score ?? 0) > 1.5 || (links[maha]?.score ?? 0) > 2.5;
    const noun = TOPIC_NOUN[topic] ?? TOPIC_NOUN.general;
    const table = on ? WHY_NOW.linked : WHY_NOW.notLinked;
    link = { en: fill(table.en, { topic: noun.en }), hi: fill(table.hi, { topic: noun.hi }), bn: fill(table.bn, { topic: noun.bn }) };
  }
  return { list, allowed, link };
}

const MONTHS: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
};
/** Western digits; the template localizes the finished sentence. */
const monthName = (d: Date, l: Lang) => `${MONTHS[l][d.getMonth()]} ${d.getFullYear()}`;

/** The topic whose engine window a choice answer may mention as one optional line. */
const ASK_WINDOW_TOPIC: Partial<Record<Ask, TimingTopic>> = {
  careerField: 'job', businessVsJob: 'business', relocation: 'foreign', studyField: 'education', moneySources: 'money',
};

/**
 * The answer content for an ask, or null when the chart can't be read (bad
 * birth data). `topic` is the question's topic (whyNow: does the current
 * cycle support it?).
 */
export function planAsk(
  ask: Ask, kind: AnswerKind, profile: TimingProfile, now: Date, topic: TimingTopic | null,
): AnswerContent | null {
  let c: NatalChart;
  try {
    c = natalChart(profile);
  } catch {
    return null;
  }
  const content: AnswerContent = { ask, kind, items: [], extra: [], window: null, allowedDates: [] };
  switch (ask) {
    case 'careerField':
      content.items = careerField(profile, c);
      break;
    case 'partner': {
      const r = partner(c);
      content.items = r.list;
      if (r.meet.en) content.extra.push({ kind: 'meet', text: r.meet });
      break;
    }
    case 'moneySources':
      content.items = moneySources(c);
      break;
    case 'studyField':
      content.items = studyField(c);
      break;
    case 'wellbeing':
      content.items = wellbeing(c);
      break;
    case 'strengths': {
      const r = strengths(profile, c);
      content.items = r.list;
      content.extra.push({ kind: 'weak', text: r.weak });
      break;
    }
    case 'relocation': {
      const r = relocation(c);
      content.items = r.list;
      content.extra.push({ kind: 'place', text: r.place });
      break;
    }
    case 'businessVsJob': {
      const r = businessVsJob(c);
      const field = careerField(profile, c)[0];
      content.items = r.list;
      if (field) content.extra.push({ kind: 'field', text: field.text.label, terms: field.text.terms });
      break;
    }
    case 'whyNow': {
      const r = whyNow(profile, c, now, topic);
      content.items = r.list;
      content.allowedDates = r.allowed;
      if (r.link) content.extra.push({ kind: 'topicLink', text: r.link });
      break;
    }
  }
  if (!content.items.length) return null;
  const wt = ASK_WINDOW_TOPIC[ask];
  if (wt && (kind === 'choice' || kind === 'advice' || kind === 'yesno')) {
    try {
      const best = timingWindows(profile, wt, now).windows[0];
      if (best) content.window = { topic: wt, best };
    } catch { /* no window */ }
  }
  return content;
}

/** Relevance: the reply names at least one of the content's items (or its extra field). */
export function relevanceTerms(content: AnswerContent): RegExp {
  const parts = content.items.map(i => i.text.terms).concat(content.extra.flatMap(e => (e.terms ? [e.terms] : [])));
  return new RegExp(parts.map(p => `(?:${p})`).join('|'), 'iu');
}

/** Distinct item words a reply uses (a reply naming two of them clearly answers with the plan). */
export function relevanceHits(content: AnswerContent, text: string): number {
  const re = new RegExp(relevanceTerms(content).source, 'giu');
  return new Set([...text.matchAll(re)].map(m => m[0].toLowerCase())).size;
}
