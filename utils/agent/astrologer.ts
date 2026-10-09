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
 * Stage 2 (rules.md §3, §9.5-9.9): points are scaled by composite planet
 * strength (utils/chart-analysis.ts: dignity incl. moolatrikona and compound
 * friendship, house, directional strength, combustion, vargottama, aspects
 * received) instead of dignity alone; career follows Brihat Jataka 10.1 (the
 * 10th from the lagna, the Moon and the Sun, and the lord of the navamsa sign
 * of the 10th lord) plus the D10 when its lagna is stable at ±5 minutes;
 * partner adds the Darakaraka and the D9 7th lord; studies the D24; money
 * the planets of a dhana yoga; strengths the Pancha Mahapurusha planet. New
 * planners: family dynamics (D12 for parents), relationship patterns,
 * purpose (Atmakaraka), free remedies, love-or-arranged signals, government
 * indicators, partnership, named-option leanings and the year ahead.
 *
 * Pure: no React Native, no i18n.
 */
import { getChartPositions, getDashaTimeline, siderealLongitudeAt } from '../astrology';
import {
  aspects, lordOfHouse, natalChart, timingWindows, topicLinks,
  type NatalChart, type Planet, type TimingProfile, type TimingTopic, type TimingWindow,
} from '../timing-engine';
import { linked, naturalRelation, strengthFactor, yogasFor, type ChartAnalysis, type Yoga } from '../chart-analysis';
import { vargaUsable, vargaLord, vargaOccupants, type Varga } from '../vargas';
import { splitPeriod } from '../timing-engine';
import { ageOn } from '../guru-context';
import type { AnswerKind, Ask } from './intent';
import { PLANET_PLAIN } from './category-strings';
import {
  AREA_OF_HOUSE, BUSINESS, BUSINESS_WHY, CAREER, DYNAMICS, LOVE_KIND, LOVE_WHY, MEET, MONEY, PARTNER, PLACE, PURPOSE, RELOCATE, REMEDY, REMEDY_TERMS,
  STRENGTH, STUDY, WELLBEING, WHY, WHY_NOW, TOPIC_NOUN, PLANET_NAME, type ItemText, type L3,
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
  /** Ask-specific extras rendered as their own sentence ('line': a finished sentence). */
  extra: { kind: 'meet' | 'weak' | 'place' | 'field' | 'topicLink' | 'line'; text: L3; terms?: string }[];
  /** Planner context for the lead sentence ({who} in a family answer). */
  vars?: Record<string, L3>;
  /** The engine window an optional "good time to move" line may name (choice asks with a topic). */
  window: { topic: TimingTopic; best: TimingWindow } | null;
  /** Dates the answer may name besides the window (whyNow: when the current cycle ends). */
  allowedDates: Date[];
  /** The user named two options and neither is among the items: the lead frames them as "beyond these two". */
  beyond?: boolean;
};

// ─── Chart helpers ───────────────────────────────────────────────────────────

const houseSign = (c: NatalChart, h: number) => (c.first + h - 1) % 12;
const houseOf = (c: NatalChart, p: Planet) => ((c.planets[p].sign - c.first + 12) % 12) + 1;
const occupants = (c: NatalChart, h: number) => PLANETS.filter(p => c.planets[p].sign === houseSign(c, h));
const SIGN_RULER: Planet[] = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];

/**
 * Strength multiplier: composite planet strength (chart-analysis.ts) around
 * 1 (×0.7 … ×1.35); without an analysis the old dignity × placement factor.
 */
function strength(c: NatalChart, p: Planet): number {
  if (c.analysis) return strengthFactor(c.analysis, p, 0.05, 0.7, 1.35);
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
type Add = (p: Planet, w: number, why: LinkWhy, house?: number) => void;

/**
 * Points per planet for a set of houses ([house, weight], the first is the
 * main one) plus karakas; `amk` adds the Amatyakaraka (career); `extra` adds
 * an ask's own points (varga lords, references from the Moon, yogas) before
 * the strength scaling.
 */
function scorePlanets(
  c: NatalChart, houses: [number, number][], karakas: [Planet, number][] = [], amk?: Planet, extra?: (add: Add) => void,
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
  extra?.(add);
  return [...out.values()]
    .map(s => ({ ...s, score: s.score * strength(c, s.planet) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || PLANETS.indexOf(a.planet) - PLANETS.indexOf(b.planet));
}

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

/** The plain "why" clause of a planet's strongest link. */
/**
 * House words that read better for an ask than the general AREA_OF_HOUSE ones (Stage 3: "your home side
 * is guided by …" as a reason for subjects, "your creativity and study side" for a relationship).
 */
const AREA_FOR: Record<string, Partial<Record<number, L3>>> = {
  study: { 4: { en: 'schooling', hi: 'शिक्षा', bn: 'শিক্ষার' }, 5: { en: 'learning', hi: 'पढ़ाई', bn: 'পড়াশোনার' } },
  relationship: { 5: { en: 'romance', hi: 'प्रेम', bn: 'প্রেমের' } },
  partner: { 5: { en: 'romance', hi: 'प्रेम', bn: 'প্রেমের' } },
};

function whyOf(c: NatalChart, s: Score, key = ''): { why: L3; source: string } {
  const order: LinkWhy[] = ['occupant', 'lord', 'amk', 'navamsa', 'd10', 'dk', 'd9', 'withLord', 'fromMoon', 'fromSun', 'aspect', 'varga', 'yoga', 'karaka'];
  const best = [...s.links].sort((a, b) => order.indexOf(a.why) - order.indexOf(b.why) || b.w - a.w)[0];
  const kind = best?.why ?? 'strong';
  const h = best?.house;
  const why = {} as L3;
  for (const lang of ['en', 'hi', 'bn'] as Lang[]) {
    const p = PLANET_NAME[s.planet][lang];
    const area = h ? (AREA_FOR[key.split(':')[0]]?.[h]?.[lang] ?? AREA_OF_HOUSE[lang][h]) : '';
    why[lang] = fill(WHY[kind][lang], { p, pg: lang === 'bn' ? `${p}ের` : p, area });
  }
  const dig = c.planets[s.planet].dignity;
  const source = `${s.planet} ${kind}${h ? ` ${h}` : ''} (in house ${houseOf(c, s.planet)}${dig !== 'neutral' ? `, ${dig}` : ''}; score ${s.score.toFixed(1)})`;
  return { why, source };
}

function items(c: NatalChart, scores: Score[], table: Record<Planet, ItemText>, n: number, key: string): PlanItem[] {
  return scores.slice(0, n).map(s => {
    const { why, source } = whyOf(c, s, key);
    return { key: `${key}:${s.planet}`, planet: s.planet, text: table[s.planet], why, source };
  });
}

const verdictItem = (key: string, text: ItemText, source: string): PlanItem => ({ key, planet: null, text, why: null, source });

// ─── Asks ────────────────────────────────────────────────────────────────────

/** Varga helpers: a varga's house lord / occupants when its lagna is stable, and a planet's varga sign lord when that sign is reliable. */
function vargaPoints(c: NatalChart, add: Add, v: Varga, houses: number[], w: number, why: LinkWhy, areaHouse: number): void {
  const a = c.analysis;
  if (!a || !vargaUsable(a.vargas, v)) return;
  for (const h of houses) {
    const l = vargaLord(a.vargas, v, h);
    if (l) add(l, w, why, areaHouse);
    for (const p of vargaOccupants(a.vargas, v, h)) add(p as Planet, 0.6 * w, why, areaHouse);
  }
}
function navamsaLordOf(c: NatalChart, p: Planet): Planet | null {
  const a = c.analysis;
  if (!a || !a.vargas.charts.D9.planetStable[p]) return null;
  return SIGN_RULER[a.vargas.charts.D9.planets[p]];
}

/**
 * Career field / domain (rules.md §9.8, Brihat Jataka 10.1): the 10th house,
 * its lord and dispositor, occupants, aspects, the Amatyakaraka; the 10th
 * from the Moon and from the Sun; the lord of the navamsa sign of the 10th
 * lord; the D10 10th when the birth time is reliable; a raja yoga or Pancha
 * Mahapurusha planet touching the 10th.
 */
export function careerField(profile: TimingProfile, c = natalChart(profile)): PlanItem[] {
  return items(c, careerScores(profile, c), CAREER, 3, 'career');
}

function careerScores(profile: TimingProfile, c: NatalChart): Score[] {
  const amk = charaKarakas(profile)[1];
  return scorePlanets(c, [[10, 1]], [['Saturn', 0.5], ['Sun', 0.5], ['Mercury', 0.5]], amk, (add) => {
    for (const [ref, why] of [[c.moonSign, 'fromMoon'], [c.planets.Sun.sign, 'fromSun']] as [number, LinkWhy][]) {
      if (ref === c.first) continue;
      const t = (ref + 9) % 12;
      add(SIGN_RULER[t], 1, why, 10);
      for (const p of PLANETS) if (c.planets[p].sign === t) add(p, 0.8, why, 10);
    }
    const nav = navamsaLordOf(c, lordOfHouse(c.first, 10));
    if (nav) add(nav, 2, 'navamsa', 10);
    vargaPoints(c, add, 'D10', [10], 1.5, 'd10', 10);
    if (c.analysis) for (const y of yogasFor(c.analysis, [10], ['raja', 'mahapurusha'])) for (const p of y.planets) add(p, 1, 'yoga', 10);
  });
}

function partnerScores(profile: TimingProfile, c: NatalChart): Score[] {
  const dk = charaKarakas(profile)[6];
  return scorePlanets(c, [[7, 1]], [['Venus', 1.5]], undefined, (add) => {
    if (dk) add(dk, 1.5, 'dk', 7);
    vargaPoints(c, add, 'D9', [7], 1.5, 'd9', 7);
    const nav = navamsaLordOf(c, lordOfHouse(c.first, 7));
    if (nav) add(nav, 1, 'd9', 7);
  });
}

function partner(profile: TimingProfile, c: NatalChart): { list: PlanItem[]; meet: L3 } {
  const lordHouse = houseOf(c, lordOfHouse(c.first, 7));
  return { list: items(c, partnerScores(profile, c), PARTNER, 3, 'partner'), meet: MEET[lordHouse] };
}

function moneySources(c: NatalChart): PlanItem[] {
  return items(c, scorePlanets(c, [[2, 1], [11, 1]], [['Jupiter', 1]], undefined, (add) => {
    if (c.analysis) for (const y of yogasFor(c.analysis, [2, 11], ['dhana'])) for (const p of y.planets) add(p, 1, 'yoga', 11);
  }), MONEY, 3, 'money');
}

function studyScores(c: NatalChart): Score[] {
  return scorePlanets(c, [[5, 1], [4, 0.8], [9, 0.8]], [['Mercury', 1.5], ['Jupiter', 1.5]], undefined, (add) => {
    vargaPoints(c, add, 'D24', [4, 5], 1, 'varga', 5);
  });
}

function studyField(c: NatalChart): PlanItem[] {
  return items(c, studyScores(c), STUDY, 3, 'study');
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
  const scores = scorePlanets(c, [[1, 1]], [['Moon', 1], [ak, 1.5]], undefined, (add) => {
    if (!c.analysis) return;
    // The two strongest planets of the whole chart, and a Pancha Mahapurusha planet.
    for (const p of c.analysis.ranked.slice(0, 2)) add(p, 1, 'strong');
    for (const y of c.analysis.yogas.filter(y => y.mention && y.key === 'mahapurusha')) add(y.planets[0], 1.5, 'yoga', 1);
  });
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
  return { list: [{ ...verdictItem(`business:${verdict}`, BUSINESS[verdict], source), why: BUSINESS_WHY[verdict] }], verdict };
}

// ─── Stage 2 planners ────────────────────────────────────────────────────────

export type FamilyWho = 'father' | 'mother' | 'parents' | 'siblings' | 'inlaws' | 'home';

const FAMILY_HOUSES: Record<FamilyWho, { houses: [number, number][]; karakas: [Planet, number][]; d12?: number[] }> = {
  father: { houses: [[9, 1]], karakas: [['Sun', 1.5]], d12: [9] },
  mother: { houses: [[4, 1]], karakas: [['Moon', 1.5]], d12: [4] },
  parents: { houses: [[4, 0.8], [9, 0.8]], karakas: [['Sun', 1], ['Moon', 1]], d12: [4, 9] },
  siblings: { houses: [[3, 1], [11, 0.8]], karakas: [['Mars', 1.5]] },
  // In-laws: the 4th and 10th from the 7th (the 10th and 4th), rules.md §5.17.
  inlaws: { houses: [[10, 0.8], [4, 0.8]], karakas: [['Jupiter', 0.5]] },
  home: { houses: [[4, 1], [2, 0.6]], karakas: [['Moon', 1]] },
};

/** Whom a family question is about. */
export function familyWho(question: string): FamilyWho {
  const q = question.normalize('NFC').toLowerCase();
  if (/in-?laws?|saas|sasur|sasural|shoshur|shashuri|सास|ससुर|ससुराल|শ্বশুর|শাশুড়ি/.test(q)) return 'inlaws';
  if (/parents|mummy papa|mom and dad|maa baap|माता-पिता|मम्मी पापा|मम्मी-पापा|বাবা-মা|বাবা মা/.test(q)) return 'parents';
  if (/father|dad|papa|baba|पिता|पापा|বাবা/.test(q)) return 'father';
  if (/mother|\bmom\b|\bmum\b|mummy|\bmaa\b|माँ|मां|मम्मी|মা\b|মায়ের|মায়ের/.test(q)) return 'mother';
  if (/brother|sister|sibling|bhai|didi|behen|dada|भाई|बहन|ভাই|বোন|দাদা|দিদি/.test(q)) return 'siblings';
  return 'home';
}

/** Family dynamics (rules.md §5.17): the relation's house, lord and karaka; D12 for parents with a reliable birth time. */
function family(c: NatalChart, who: FamilyWho): PlanItem[] {
  const f = FAMILY_HOUSES[who];
  const scores = scorePlanets(c, f.houses, f.karakas, undefined, (add) => {
    if (f.d12) vargaPoints(c, add, 'D12', f.d12, 1, 'varga', f.d12[0]);
  });
  return items(c, scores, DYNAMICS, 2, `family:${who}`);
}

/** Relationship patterns (rules.md §5.13): what acts on the partnership and romance sides; hard influences weigh more. */
function relationship(c: NatalChart): PlanItem[] {
  const scores = scorePlanets(c, [[7, 1], [5, 0.8]], [['Venus', 1], ['Moon', 0.5]])
    .map(s => ({ ...s, score: s.score * (['Mars', 'Saturn', 'Rahu', 'Ketu', 'Sun'].includes(s.planet) ? 1.3 : 1) }))
    .sort((a, b) => b.score - a.score);
  return items(c, scores, DYNAMICS, 2, 'relationship');
}

/** Purpose / spiritual path (rules.md §5.24): 9th, 5th, 12th, Jupiter, Ketu and the Atmakaraka. */
function purpose(profile: TimingProfile, c: NatalChart): { list: PlanItem[]; practice: L3 } {
  const ak = charaKarakas(profile)[0];
  const scores = scorePlanets(c, [[9, 1], [5, 0.6], [12, 0.6]], [['Jupiter', 1], ['Ketu', 1], [ak, 1.5]]);
  const list = items(c, scores, PURPOSE, 2, 'purpose');
  const top = list[0]?.planet ?? 'Jupiter';
  return { list, practice: PURPOSE[top].practice };
}

const PLANET_WORDS: [Planet, RegExp][] = [
  ['Saturn', /saturn|shani|shoni|शनि|শনি/i], ['Jupiter', /jupiter|guru\b|brihaspati|बृहस्पति|গুরু|বৃহস্পতি/i], ['Rahu', /rahu|राहु|রাহু/i],
  ['Ketu', /ketu|केतु|কেতু/i], ['Mars', /\bmars\b|mangal|मंगल|মঙ্গল/i], ['Venus', /venus|shukra|शुक्र|শুক্র/i], ['Mercury', /mercury|budh|बुध|বুধ/i],
  ['Moon', /\bmoon\b|chandra|चंद्र|চন্দ্র|চাঁদ/i], ['Sun', /\bsun\b|surya|सूर्य|সূর্য/i],
];
const GEM_PLANET: [Planet, RegExp][] = [
  ['Saturn', /blue sapphire|neelam|नीलम|নীলা/i], ['Jupiter', /yellow sapphire|pukhraj|पुखराज|পোখরাজ/i], ['Sun', /ruby|manik|माणिक|চুনি/i],
  ['Moon', /pearl|moti|मोती|মুক্তো/i], ['Mars', /coral|moonga|मूंगा|প্রবাল/i], ['Mercury', /emerald|panna|पन्ना|পান্না/i], ['Venus', /diamond|heera|हीरा|হীরে/i],
  ['Rahu', /hessonite|gomed|गोमेद|গোমেদ/i], ['Ketu', /cat'?s eye|lehsunia|लहसुनिया/i],
];

/** The planet a remedy question is about: named, the gem's planet, the topic's weaker significator, or the running sub-period lord. */
export function remedyTarget(question: string, c: NatalChart, profile: TimingProfile, now: Date, topic: TimingTopic | null): { planet: Planet; gem: Planet | null } {
  const q = question.normalize('NFC');
  const gem = GEM_PLANET.find(([, re]) => re.test(q))?.[0] ?? null;
  const named = PLANET_WORDS.find(([, re]) => re.test(q))?.[0];
  if (named) return { planet: named, gem };
  if (gem) return { planet: gem, gem };
  const TOPIC_PLANETS: Partial<Record<TimingTopic, [number, Planet]>> = {
    marriage: [7, 'Venus'], love: [7, 'Venus'], job: [10, 'Saturn'], promotion: [10, 'Sun'], business: [7, 'Mercury'], money: [11, 'Jupiter'],
    children: [5, 'Jupiter'], education: [5, 'Mercury'], health: [1, 'Sun'], property: [4, 'Mars'], foreign: [12, 'Rahu'], legal: [6, 'Jupiter'],
  };
  const tp = topic ? TOPIC_PLANETS[topic] : undefined;
  if (tp && c.analysis) {
    const lord = lordOfHouse(c.first, tp[0]);
    const weaker = c.analysis.planets[lord].strength <= c.analysis.planets[tp[1]].strength ? lord : tp[1];
    return { planet: weaker, gem };
  }
  try {
    return { planet: getDashaTimeline(c.moonLon, profile.birthDate, now).antar.lord as Planet, gem };
  } catch {
    return { planet: 'Saturn', gem };
  }
}

/** Topics whose remedies keep relationship lines ("respect your partner"); others use a planet's work variant. */
const PARTNER_TOPICS = new Set<TimingTopic>(['marriage', 'love', 'children']);

function remedies(target: Planet, secular: boolean, topic: TimingTopic | null = null): PlanItem[] {
  const base = REMEDY[target];
  const r = topic && !PARTNER_TOPICS.has(topic) && base.work ? base.work : base;
  const text: ItemText = { label: secular ? r.secular : r.practice, model: (secular ? r.secular : r.practice).en, terms: REMEDY_TERMS };
  return [{ key: `remedy:${target}`, planet: target, text, why: null, source: `free remedy for ${target}${secular ? ' (secular)' : ''}` }];
}

/** Love or arranged (rules.md §9.9, a modern heuristic shown as a tendency). */
export function loveArranged(c: NatalChart): { verdict: 'love' | 'arranged' | 'both'; why: L3; source: string } {
  const a = c.analysis;
  const l5 = lordOfHouse(c.first, 5), l7 = lordOfHouse(c.first, 7), l9 = lordOfHouse(c.first, 9), l2 = lordOfHouse(c.first, 2);
  const link57 = (a && linked(a, l5, l7) != null) || houseOf(c, l7) === 5 || houseOf(c, l5) === 7;
  const venus5 = c.planets.Venus.sign === c.planets[l5].sign && l5 !== 'Venus';
  const rahu = [5, 7].includes(houseOf(c, 'Rahu'));
  const link79 = !!a && (linked(a, l7, l9) != null || linked(a, l7, l2) != null);
  const sign7 = (c.first + 6) % 12;
  const jupiter7 = c.planets.Jupiter.sign === sign7 || aspects('Jupiter', c.planets.Jupiter.sign, sign7);
  const love = (link57 ? 2 : 0) + (venus5 ? 1 : 0) + (rahu ? 1 : 0);
  const arranged = (link79 ? 2 : 0) + (jupiter7 ? 1 : 0);
  const verdict = love >= arranged + 1 ? 'love' : arranged >= love + 1 ? 'arranged' : 'both';
  const key = verdict === 'arranged' ? (link79 ? 'link79' : jupiter7 ? 'jupiter7' : 'none')
    : link57 ? 'link57' : venus5 ? 'venus5' : rahu ? 'rahu' : link79 ? 'link79' : jupiter7 ? 'jupiter7' : 'none';
  return { verdict, why: LOVE_WHY[key], source: `love ${love} (5-7 ${link57}, Venus+5th lord ${venus5}, Rahu 5/7 ${rahu}) vs arranged ${arranged} (7-9/2 ${link79}, Jupiter on 7th ${jupiter7})` };
}

/** Government-job indicators (rules.md §5.5): the Sun's strength and its tie to the work side, with the 6th. */
export function govtIndicator(c: NatalChart): { level: 'strong' | 'fair' | 'weak'; source: string } {
  const a = c.analysis;
  const sun = a?.planets.Sun.strength ?? 2;
  const sign10 = (c.first + 9) % 12;
  const l10 = lordOfHouse(c.first, 10);
  let tie = 0;
  if ([10, 11, 1].includes(houseOf(c, 'Sun'))) tie += 1.5;
  if (l10 === 'Sun') tie += 1.5;
  if (aspects('Sun', c.planets.Sun.sign, sign10)) tie += 1;
  if (c.planets.Sun.sign === c.planets[l10].sign) tie += 1;
  const l6 = lordOfHouse(c.first, 6);
  const six = a ? (a.planets[l6].strength >= 3 ? 1 : 0) : 0;
  const score = sun / 2 + tie + six;
  const level = score >= 4 ? 'strong' : score >= 2.2 ? 'fair' : 'weak';
  return { level, source: `Sun strength ${sun}, tie to the 10th ${tie}, 6th lord ${l6} ${six ? 'strong' : 'average'} → ${score.toFixed(1)}` };
}

/** Partnership (rules.md §5.4): the 7th lord friendly to the lagna lord and not in 6/8/12. */
export function partnershipGood(c: NatalChart): boolean {
  const l1 = lordOfHouse(c.first, 1), l7 = lordOfHouse(c.first, 7);
  const friendly = naturalRelation(l7, l1) !== 'enemy' && naturalRelation(l1, l7) !== 'enemy';
  return friendly && ![6, 8, 12].includes(houseOf(c, l7));
}

/** Option words (categories.ts namedOptions) → the planets that stand for them. */
const OPTION_PLANETS: Record<string, Planet[]> = {
  IT: ['Mercury', 'Rahu', 'Ketu'], finance: ['Jupiter', 'Mercury'], teaching: ['Jupiter', 'Mercury'], corporate: ['Sun', 'Saturn', 'Mercury'],
  engineering: ['Mars', 'Saturn'], design: ['Venus'], medicine: ['Mars', 'Sun', 'Moon'], government: ['Sun'], sales: ['Mercury', 'Venus'],
  private: ['Mercury', 'Saturn', 'Rahu'], MBA: ['Sun', 'Jupiter', 'Mercury'], MS: ['Mercury', 'Rahu', 'Ketu', 'Saturn'], science: ['Mars', 'Ketu', 'Mercury'],
  commerce: ['Mercury', 'Jupiter'], meditation: ['Ketu', 'Saturn'], bhakti: ['Moon', 'Venus', 'Jupiter'],
};
export const OPTION_LABEL: Record<string, L3> = {
  IT: { en: 'IT', hi: 'आईटी', bn: 'আইটি' }, finance: { en: 'finance', hi: 'फ़ाइनेंस', bn: 'ফিনান্স' }, teaching: { en: 'teaching', hi: 'पढ़ाना', bn: 'শিক্ষকতা' },
  corporate: { en: 'corporate work', hi: 'कॉर्पोरेट नौकरी', bn: 'কর্পোরেট কাজ' }, engineering: { en: 'engineering', hi: 'इंजीनियरिंग', bn: 'ইঞ্জিনিয়ারিং' },
  design: { en: 'design', hi: 'डिज़ाइन', bn: 'ডিজাইন' }, medicine: { en: 'medicine', hi: 'मेडिकल', bn: 'ডাক্তারি' }, government: { en: 'government work', hi: 'सरकारी नौकरी', bn: 'সরকারি চাকরি' },
  sales: { en: 'sales', hi: 'सेल्स', bn: 'সেলস' }, private: { en: 'the private sector', hi: 'प्राइवेट नौकरी', bn: 'বেসরকারি চাকরি' },
  MBA: { en: 'an MBA', hi: 'एमबीए', bn: 'এমবিএ' }, MS: { en: 'an MS', hi: 'एमएस', bn: 'এমএস' }, science: { en: 'science', hi: 'साइंस', bn: 'বিজ্ঞান' },
  commerce: { en: 'commerce', hi: 'कॉमर्स', bn: 'কমার্স' }, meditation: { en: 'meditation', hi: 'ध्यान', bn: 'ধ্যান' }, bhakti: { en: 'bhakti', hi: 'भक्ति', bn: 'ভক্তি' },
};

/**
 * A leaning between two named options, from the ask's own planet scores:
 * the option whose planets score higher wins by 15%; otherwise both.
 */
export function optionLeaning(profile: TimingProfile, options: [string, string], domain: 'career' | 'study' | 'purpose', c = natalChart(profile)):
  { pick: string | null; why: L3 | null; source: string } {
  const scores = domain === 'career' ? careerScores(profile, c) : domain === 'study' ? studyScores(c)
    : scorePlanets(c, [[9, 1], [5, 0.6], [12, 0.6]], [['Jupiter', 1], ['Ketu', 1]]);
  const [a, b] = options;
  // Planets both options share say nothing about the choice: compare the ones that differ.
  const own = (o: string, x: string) => { const ps = (OPTION_PLANETS[o] ?? []).filter(p => !(OPTION_PLANETS[x] ?? []).includes(p)); return ps.length ? ps : OPTION_PLANETS[o] ?? []; };
  const of = (o: string) => Math.max(0, ...own(o, o === a ? b : a).map(p => scores.find(s => s.planet === p)?.score ?? 0));
  const sa = of(a), sb = of(b);
  const pick = sa >= sb * 1.15 ? a : sb >= sa * 1.15 ? b : null;
  let why: L3 | null = null;
  if (pick) {
    const best = own(pick, pick === a ? b : a).map(p => scores.find(s => s.planet === p)).filter((x): x is Score => !!x).sort((x, y) => y.score - x.score)[0];
    if (best) why = whyOf(c, best, domain === 'study' ? 'study' : '').why;
  }
  return { pick, why, source: `${a} ${sa.toFixed(1)} vs ${b} ${sb.toFixed(1)}` };
}

/** Yogas worth naming for an ask, in plain words (never their names). */
export function askYogas(c: NatalChart, ask: Ask): Yoga[] {
  if (!c.analysis) return [];
  if (ask === 'careerField' || ask === 'businessVsJob') return yogasFor(c.analysis, [10], ['raja', 'mahapurusha', 'viparita']).slice(0, 1);
  if (ask === 'moneySources') return yogasFor(c.analysis, [2, 11], ['dhana', 'parivartana']).slice(0, 1);
  if (ask === 'strengths') return c.analysis.yogas.filter(y => y.mention && ['mahapurusha', 'gajakesari', 'neechaBhanga'].includes(y.key)).slice(0, 1);
  return [];
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

/**
 * Why life feels the way it does now (rules.md §9.11): the running major and
 * sub-period lords, each with the areas it rules and sits in and whether it
 * is a supportive or effortful planet for this ascendant (functional
 * nature); their 6/8 (friction) or 2/12 (cost) relation; when the sub-period
 * ends and whether the next one is tied to the asked topic; and a hard
 * Saturn transit from the Moon (sade sati, 8th, 4th) with its end.
 */
function whyNow(profile: TimingProfile, c: NatalChart, now: Date, topic: TimingTopic | null):
  { list: PlanItem[]; allowed: Date[]; link: L3 | null; extra: L3[] } {
  const t = getDashaTimeline(c.moonLon, profile.birthDate, now);
  const maha = t.maha.lord as Planet;
  const antar = t.antar.lord as Planet;
  const list: PlanItem[] = [];
  const allowed: Date[] = [t.antar.end];
  const extra: L3[] = [];
  const month = (d: Date, l: Lang) => monthName(d, l);
  // The area a period lord brings into focus: the house it rules that matters most, else where it sits.
  const focusHouse = (p: Planet): number => {
    const ruled = c.analysis?.planets[p].rules ?? [];
    const pick = ruled.find(h => [10, 7, 4, 1, 5, 9, 2, 11].includes(h)) ?? ruled[0];
    return pick ?? houseOf(c, p);
  };
  const area = (p: Planet, l: Lang) => AREA_OF_HOUSE[l][focusHouse(p)];
  const nature = (p: Planet, l: Lang): string => {
    const f = c.analysis?.planets[p].functional;
    if (f === 'yogakaraka' || f === 'benefic') return `, ${WHY_NOW.supportive[l]}`;
    if (f === 'malefic') return `, ${WHY_NOW.effortful[l]}`;
    return '';
  };
  const mk = (key: string, table: L3, vars: (l: Lang) => Record<string, string>, source: string, planet: Planet | null, suffix?: (l: Lang) => string): PlanItem => ({
    key, planet, why: null, source,
    text: {
      label: { en: fill(table.en, vars('en')) + (suffix?.('en') ?? ''), hi: fill(table.hi, vars('hi')) + (suffix?.('hi') ?? ''), bn: fill(table.bn, vars('bn')) + (suffix?.('bn') ?? '') },
      model: fill(table.en, vars('en')) + (suffix?.('en') ?? ''),
      terms: [AREA_OF_HOUSE.en[focusHouse(planet ?? 'Saturn')], AREA_OF_HOUSE.hi[focusHouse(planet ?? 'Saturn')], AREA_OF_HOUSE.bn[focusHouse(planet ?? 'Saturn')]]
        .map(x => x.split(/ and | और | আর /)[0].replace(/ের$|র$/, '')).filter(Boolean).join('|') + '|cycle|चक्र|চক্র',
    },
  });
  const P = (p: Planet, l: Lang) => PLANET_PLAIN[p][l].replace(/^the /, '');
  list.push(mk('why:maha', WHY_NOW.maha, l => ({ area: area(maha, l), P: P(maha, l) }),
    `mahadasha ${maha} (rules ${c.analysis?.planets[maha].rules.join('/') || '-'}, in house ${houseOf(c, maha)}, ${c.analysis?.planets[maha].functional ?? '?'})`, maha, l => nature(maha, l)));
  if (antar !== maha) {
    list.push(mk('why:antar', WHY_NOW.antar, l => ({ area: area(antar, l), end: month(t.antar.end, l), P: P(antar, l) }),
      `antardasha ${antar} (rules ${c.analysis?.planets[antar].rules.join('/') || '-'}, in house ${houseOf(c, antar)}, ${c.analysis?.planets[antar].functional ?? '?'}) until ${t.antar.end.toISOString().slice(0, 7)}`, antar));
    const rel = ((c.planets[antar].sign - c.planets[maha].sign + 12) % 12) + 1;
    if (rel === 6 || rel === 8) extra.push(WHY_NOW.friction);
    else if (rel === 2 || rel === 12) extra.push(WHY_NOW.cost);
  }
  const sat = saturnPressure(c, now);
  if (sat) {
    // A minor hears the phase and what helps, not how many years it lasts.
    const minor = (ageOn(profile.birthDate, now) ?? 30) < 18;
    if (!minor) allowed.push(sat.end);
    const table = minor ? WHY_NOW[`${sat.kind}Teen` as const] : WHY_NOW[sat.kind];
    const it = mk(`why:${sat.kind}`, table, l => ({ end: month(sat.end, l) }), `Saturn ${sat.kind} until ${sat.end.toISOString().slice(0, 7)}${minor ? ' (end not shown to a minor)' : ''}`, 'Saturn');
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
    // The next sub-period: does it open the topic?
    const subs = splitPeriod(t.maha);
    const k = subs.findIndex(x => x.lord === antar && x.start.getTime() <= now.getTime() && x.end.getTime() > now.getTime());
    const next = k >= 0 && k + 1 < subs.length ? subs[k + 1] : null;
    if (next && !on) {
      const nOn = (links[next.lord as Planet]?.score ?? 0) > 1.5;
      const tb = nOn ? WHY_NOW.nextLinked : WHY_NOW.nextOther;
      extra.push({ en: fill(tb.en, { start: month(next.start, 'en'), topic: noun.en }), hi: fill(tb.hi, { start: month(next.start, 'hi'), topic: noun.hi }), bn: fill(tb.bn, { start: month(next.start, 'bn'), topic: noun.bn }) });
      // (next.start is the current sub-period's end, already allowed)
    }
  }
  return { list, allowed, link, extra };
}

/** Dates a why-now answer may name: the sub-period end, a hard Saturn transit's end, the next sub-period's start. */
export function whyNowDates(profile: TimingProfile, now: Date, topic: TimingTopic | null): Date[] {
  try { return whyNow(profile, natalChart(profile), now, topic).allowed; } catch { return []; }
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
  opts: { question?: string; secular?: boolean } = {},
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
      const r = partner(profile, c);
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
      for (const e of r.extra) content.extra.push({ kind: 'line', text: e });
      break;
    }
    case 'family': {
      const who = familyWho(opts.question ?? '');
      content.items = family(c, who);
      // "My brother" / "my sister": named as asked, not "your brother or sister".
      const q = (opts.question ?? '').toLowerCase();
      const one: L3 | null = who !== 'siblings' ? null
        : /brother|\bbhai|\bbhaiya|\bdada\b|भाई|ভাই|দাদা/.test(q) && !/sister|behen|bahan|didi|बहन|দিদি|বোন/.test(q) ? { en: 'your brother', hi: 'भाई', bn: 'ভাইয়ের' }
          : /sister|behen|bahan|didi|बहन|দিদি|বোন/.test(q) && !/brother|\bbhai|भाई|ভাই/.test(q) ? { en: 'your sister', hi: 'बहन', bn: 'বোনের' } : null;
      content.vars = { who: one ?? FAMILY_WHO_L3[who] };
      break;
    }
    case 'relationship':
      content.items = relationship(c);
      break;
    case 'purpose': {
      const r = purpose(profile, c);
      content.items = r.list;
      content.extra.push({ kind: 'line', text: fillL3(PRACTICE_LINE, { practice: r.practice }) });
      break;
    }
    case 'remedies': {
      const target = remedyTarget(opts.question ?? '', c, profile, now, topic);
      content.items = remedies(target.planet, !!opts.secular, topic);
      break;
    }
    case 'loveArranged': {
      const r = loveArranged(c);
      content.items = [{ key: `love:${r.verdict}`, planet: null, text: LOVE_KIND[r.verdict], why: r.why, source: r.source }];
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

const FAMILY_WHO_L3: Record<FamilyWho, L3> = {
  father: { en: 'your father', hi: 'पिता', bn: 'বাবার' }, mother: { en: 'your mother', hi: 'माँ', bn: 'মায়ের' },
  parents: { en: 'your parents', hi: 'माता-पिता', bn: 'বাবা-মায়ের' }, siblings: { en: 'your brother or sister', hi: 'भाई-बहन', bn: 'ভাইবোনের' },
  inlaws: { en: 'your in-laws', hi: 'ससुराल वालों', bn: 'শ্বশুরবাড়ির' }, home: { en: 'your family at home', hi: 'घर वालों', bn: 'বাড়ির লোকের' },
};
const PRACTICE_LINE: L3 = { en: 'A simple practice suits you: {practice}.', hi: 'आपके लिए एक सादा अभ्यास ठीक रहेगा: {practice}।', bn: 'আপনার জন্য একটা সহজ অনুশীলন ভালো: {practice}।' };
const fillL3 = (t: L3, v: Record<string, L3>): L3 => ({
  en: fill(t.en, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.en]))),
  hi: fill(t.hi, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.hi]))),
  bn: fill(t.bn, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.bn]))),
});

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
