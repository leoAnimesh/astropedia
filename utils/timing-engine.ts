/**
 * Timing engine: "when will X happen?" answered the way a Vedic astrologer
 * works it out, deterministically and without any model.
 *
 * Pure TypeScript (chart math only: no React Native, no i18n), so Node tests
 * load it directly. Chat (utils/agent), the reports' timing chapter, the
 * follow-up chips and the template answers all read the same windows, so
 * they can never disagree with each other.
 *
 * ─── Method ──────────────────────────────────────────────────────────────────
 *
 * 1. Promise: which planets are tied to the topic in the birth chart.
 *    Every topic has houses (bhavas, whole-sign from the sidereal ascendant, or
 *    from the Moon sign without a birth time/place: Chandra lagna) and natural
 *    significators (karakas). A planet is linked to a topic house when it
 *      - rules the house (the house lord),                         weight 1.0
 *      - occupies it,                                              weight 0.8
 *      - aspects it by graha drishti (all planets the 7th; Mars also the 4th
 *        and 8th, Jupiter the 5th and 9th, Saturn the 3rd and 10th),  weight 0.4
 *      - is conjunct the house lord (same sign),                   weight 0.4
 *    plus the karaka weight. Rahu and Ketu own no sign; they give the results
 *    of their dispositor (the lord of the sign they occupy), at 0.7.
 *    Own sign / exaltation strengthens a planet's results (x1.15) and
 *    debilitation weakens them (x0.85).
 *    Sources: Brihat Parashara Hora Shastra (BPHS: bhava significations,
 *    graha drishti incl. the special aspects of Mars, Jupiter and Saturn,
 *    dasha phala depending on the lord's lordship, placement and strength);
 *    Phaladeepika (Mantreswara: bhava karakas, nodes acting for their
 *    dispositor); Saravali (Kalyana Varma) on house results.
 *
 * 2. Timing by Vimshottari dasha. An event comes in the major period
 *    (mahadasha) and sub-period (antardasha) of planets linked to it: the
 *    major-period lord carries the promise, the sub-period lord triggers it
 *    (BPHS dasha chapters; K. N. Rao, "Timing Events through Vimshottari
 *    Dasha"). Per month:
 *      dasha = A(antar) + 0.5·A(maha) + 0.25·A(pratyantar) + 1 if both maha and
 *              antar are linked; −0.5 when the antar lord sits 6th/8th from the
 *              maha lord (shadashtaka, BPHS antardasha effects).
 *    The pratyantar (third level) only moves the peak month inside a window.
 *
 * 3. Transits (gochara), from true sidereal positions sampled three times a
 *    month, so retrograde loops are real:
 *      - Double transit (K. N. Rao's rule): Jupiter AND Saturn both occupying or
 *        aspecting the topic's main house: +2.0 (+1.2 for the sign holding its
 *        lord, +1.0 for the main house counted from the Moon). Jupiter alone
 *        gives a third of that, Saturn alone a little (it delays rather than
 *        gives).
 *      - Jupiter from the natal Moon in the 2nd, 5th, 7th, 9th or 11th sign is
 *        good for every topic (+0.5); Saturn in the 3rd, 6th or 11th from the
 *        Moon helps (+0.3) (Phaladeepika, gochara phala).
 *      - Saturn in the 12th/1st/2nd (sade sati) or 8th (ashtama) from the Moon
 *        counts against health, money, legal matters and general luck only
 *        (−0.6): those are the results the gochara texts list for it. It is not
 *        applied to marriage, children, education or job: the classical texts
 *        give no rule that sade sati stops those events.
 *
 * 4. Windows. Month scores over the next 60 months; months within 75% of the
 *    best form windows (gaps of one month bridged), at most 12 months long
 *    around the peak. Windows rank by peak and average. Strength is absolute
 *    (STRONG / MODERATE), so "nothing strong within five years" is honest; then
 *    the best weaker window is returned and the next strong one up to ten years
 *    out is named when there is one.
 *
 * Stage 2 refinements (rules.md §3, §4, §9; each behind a weight in
 * TIMING_WEIGHTS, measured so windows still vary and stay plausible):
 *    - link scores scale with composite planet strength (utils/chart-analysis.ts:
 *      dignity incl. moolatrikona and compound friendship, house, directional
 *      strength, combustion, vargottama, aspects received) instead of the
 *      dignity-only ×1.15 / ×0.85;
 *    - divisional confirmation, only with a birth time: a planet ruling the
 *      topic's varga house (D9 7th for marriage, D10 10th for work, D7 5th for
 *      children, D4 4th for property, D24 4th/5th for studies) gets a small
 *      link when that varga's lagna is stable at ±5 minutes, and the main
 *      house lord's dignity in that varga nudges its score;
 *    - gochara vedha: a good Jupiter / Saturn transit from the Moon is
 *      cancelled while another planet (not the Moon: too brief for a month)
 *      sits in its vedha house (Sun-Saturn exempt);
 *    - ashtakavarga: Jupiter / Saturn transiting a sign with SAV ≥ 28 add,
 *      ≤ 25 subtract, refined by their own BAV bindus (utils/ashtakavarga.ts).
 *
 * 5. Confidence. Strong → high, moderate → medium, weak → low; one step lower
 *    without a birth time (houses from the Moon, dasha balance uncertain) or
 *    place, and "low" when the Moon could be in another nakshatra on the
 *    birth day (the whole dasha sequence would shift).
 *
 * Months are local calendar months; dates are first-of-month / last-of-month.
 */
import { DASHA_YEARS } from '@/constants/astrology';
import {
  getAscendantDegree,
  getChartPositions,
  getLifeChapters,
  getMoonLongitudeExact,
  getNakshatra,
  siderealLongitudeAt,
  type BirthData,
  type DashaPeriod,
  type PlanetPosition,
} from './astrology';
import { analyzeChart, aspects, strengthFactor, type ChartAnalysis, type Planet } from './chart-analysis';
import { vargaUsable, vargaPlanetUsable, type Varga } from './vargas';
import { ashtakavarga, transitBindus, vedhaBlocked, type Ashtakavarga, type AvPlanet } from './ashtakavarga';

export { aspects, type Planet };

// ─── Topics ───────────────────────────────────────────────────────────────────

export const TIMING_TOPICS = [
  'marriage', 'love', 'job', 'promotion', 'business', 'money', 'property', 'children', 'education',
  'foreign', 'health', 'legal', 'general',
] as const;
export type TimingTopic = (typeof TIMING_TOPICS)[number];

export type TopicRule = {
  /** [house, weight]; the first is the main house (double transit target). */
  houses: [number, number][];
  karakas: [Planet, number][];
  /** Houses whose lords/occupants work against the topic (dusthanas), unless also a topic house. */
  against: number[];
  /** Saturn's hard gochara (sade sati / ashtama) counts against this topic. */
  saturnHard: boolean;
};

/**
 * Houses and karakas per topic. Classical significations (BPHS bhava
 * chapters, Phaladeepika ch. on bhava karakas); the 2-7-11 / 2-6-10-11
 * groupings are the event-house sets K. N. Rao and Krishnamurti Paddhati use
 * for marriage and service.
 */
export const TOPIC_RULES: Record<TimingTopic, TopicRule> = {
  // 7th: spouse (kalatra bhava); 2nd: addition to the family; 11th: fulfilment.
  // Venus is kalatra karaka; Jupiter is traditionally the husband's karaka in a
  // woman's chart. To avoid a gendered rule both count for everyone.
  marriage:  { houses: [[7, 3], [2, 1.5], [11, 1.5]], karakas: [['Venus', 2], ['Jupiter', 1.5]], against: [8, 12], saturnHard: false },
  // 5th: romance (purva punya / affections); 7th: partner; 11th: wishes. Venus, Moon (feelings).
  love:      { houses: [[5, 3], [7, 2], [11, 1]], karakas: [['Venus', 2], ['Moon', 1]], against: [8, 12], saturnHard: false },
  // 10th: profession (karma); 6th: service, employment; 2nd: earnings; 11th: gains.
  // Saturn: service and work; Sun: authority; Mercury: trade and skills.
  job:       { houses: [[10, 3], [6, 2.5], [11, 1.5], [2, 1]], karakas: [['Saturn', 1.5], ['Sun', 1], ['Mercury', 1]], against: [8, 12], saturnHard: false },
  // Promotion: 10th (status) and 11th (gains), 9th (fortune), 6th (beating competition). Sun: authority.
  promotion: { houses: [[10, 3], [11, 2.5], [9, 1], [6, 1]], karakas: [['Sun', 2], ['Jupiter', 1], ['Saturn', 1]], against: [8, 12], saturnHard: false },
  // Business: 7th (trade, partners), 10th (enterprise), 11th (profit), 3rd (initiative). Mercury: commerce.
  business:  { houses: [[7, 2.5], [10, 2.5], [11, 2], [3, 1]], karakas: [['Mercury', 2], ['Jupiter', 1]], against: [8, 12], saturnHard: false },
  // Wealth: 2nd (dhana) and 11th (labha) with the trines 9th and 5th (dhana yoga houses). Jupiter: wealth.
  money:     { houses: [[11, 3], [2, 3], [9, 1.5], [5, 1]], karakas: [['Jupiter', 2], ['Venus', 1]], against: [8, 12], saturnHard: true },
  // Property, home, vehicles: 4th (sukha bhava), 11th (acquisition), 2nd (assets).
  // Mars: land (bhumi karaka); Venus: vehicles and comforts; Moon: the home.
  property:  { houses: [[4, 3], [11, 1.5], [2, 1]], karakas: [['Mars', 2], ['Venus', 1.5], ['Moon', 1]], against: [8, 12], saturnHard: false },
  // Children: 5th (putra bhava), 9th (5th from the 5th), 2nd (family grows), 11th. Jupiter: putra karaka.
  children:  { houses: [[5, 3], [9, 1.5], [2, 1], [11, 1]], karakas: [['Jupiter', 2.5]], against: [8, 12], saturnHard: false },
  // Education: 4th (schooling), 5th (intellect), 9th (higher learning), 2nd (early learning, speech).
  education: { houses: [[5, 2.5], [4, 2.5], [9, 2], [2, 1]], karakas: [['Mercury', 2], ['Jupiter', 2]], against: [8, 12], saturnHard: false },
  // Foreign travel / settling abroad: 12th (far lands), 9th (long journeys), 3rd (travel). Rahu: foreign.
  foreign:   { houses: [[12, 3], [9, 2], [3, 1]], karakas: [['Rahu', 2], ['Ketu', 0.5]], against: [8], saturnHard: false },
  // Health, as recovery and wellbeing only: 1st (body, vitality), 11th (6th from the 6th: end of
  // illness), the trines. Sun: vitality; Jupiter: protection; Moon: mind. 6th, 8th, 12th lords work against.
  health:    { houses: [[1, 3], [11, 1.5], [5, 1], [9, 1]], karakas: [['Sun', 2], ['Jupiter', 1], ['Moon', 1]], against: [6, 8, 12], saturnHard: true },
  // Legal matters: 6th (disputes; strength over opponents), 11th (success), 1st, 9th (justice).
  legal:     { houses: [[6, 3], [11, 2], [1, 1], [9, 1]], karakas: [['Jupiter', 1.5], ['Sun', 1], ['Mars', 1]], against: [8, 12], saturnHard: true },
  // General luck: 9th (bhagya), 1st, 11th, 5th. Jupiter.
  general:   { houses: [[9, 3], [1, 2], [11, 2], [5, 1.5]], karakas: [['Jupiter', 2]], against: [8, 12], saturnHard: true },
};

// ─── Chart helpers ────────────────────────────────────────────────────────────

const SIGN_RULER: Planet[] = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const DASHA_ORDER: Planet[] = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const DAY_MS = 86400000;
const YEAR_MS = 365.25 * DAY_MS;

const houseSign = (first: number, h: number) => (first + h - 1) % 12;
const houseOfSign = (first: number, sign: number) => ((sign - first + 12) % 12) + 1;

const VALID_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type TimingProfile = BirthData & { gender?: string | null };

export type NatalChart = {
  planets: Record<Planet, { sign: number; dignity: PlanetPosition['dignity'] }>;
  /** Sign of the first house (ascendant, or the Moon without time/place). */
  first: number;
  moonSign: number;
  moonLon: number;
  basis: 'rising' | 'moon';
  hasTime: boolean;
  hasPlace: boolean;
  /** The Moon's nakshatra could differ on the birth day (no time / no zone). */
  nakshatraUncertain: boolean;
  /** Composite strength, vargas and yogas (utils/chart-analysis.ts); absent for unusable birth data. */
  analysis?: ChartAnalysis;
};

export function natalChart(raw: TimingProfile): NatalChart {
  const birthTime = raw.birthTime && VALID_TIME.test(raw.birthTime) ? raw.birthTime : null;
  const p = { ...raw, birthTime };
  const hasPlace = p.birthLat != null && p.birthLng != null && Number.isFinite(p.birthLat) && Number.isFinite(p.birthLng);
  const moonLon = getMoonLongitudeExact(p.birthDate, birthTime, p.birthLng, p.birthTz);
  const moonSign = Math.floor(moonLon / 30) % 12;
  const asc = getAscendantDegree(p.birthDate, birthTime, p.birthLat, p.birthLng, p.birthTz);
  const planets = {} as NatalChart['planets'];
  for (const x of getChartPositions(p)) planets[x.name as Planet] = { sign: x.signIndex, dignity: x.dignity };
  let nakshatraUncertain = false;
  if (!birthTime || (!p.birthTz && !hasPlace)) {
    const nak = getNakshatra(moonLon).name;
    const times = birthTime ? [] : ['00:00', '23:59'];
    const alts = times.map(t => getNakshatra(getMoonLongitudeExact(p.birthDate, t, p.birthLng, p.birthTz)).name);
    if (birthTime && !p.birthTz && !hasPlace) {
      // Time without a zone or place: any civil offset UTC−12…+14.
      const jd0 = getMoonLongitudeExact(p.birthDate, birthTime, -14 * 15, null);
      const jd1 = getMoonLongitudeExact(p.birthDate, birthTime, 12 * 15, null);
      alts.push(getNakshatra(jd0).name, getNakshatra(jd1).name);
    }
    nakshatraUncertain = alts.some(a => a !== nak);
  }
  let analysis: ChartAnalysis | undefined;
  try { analysis = Number.isFinite(moonLon) ? analyzeChart(p) : undefined; } catch { analysis = undefined; }
  return {
    planets, moonSign, moonLon, analysis,
    first: asc == null ? moonSign : Math.floor(asc / 30) % 12,
    basis: asc == null ? 'moon' : 'rising',
    hasTime: !!birthTime,
    hasPlace,
    nakshatraUncertain,
  };
}

/** Lord of house `h` from `first`. */
export function lordOfHouse(first: number, h: number): Planet {
  return SIGN_RULER[houseSign(first, h)];
}

// ─── 1. Promise: how strongly each planet is tied to a topic ─────────────────

export type LinkKind = 'lord' | 'occupant' | 'aspect' | 'withLord' | 'karaka' | 'node' | 'against' | 'varga';
export type Link = { kind: LinkKind; house?: number; via?: Planet; varga?: Varga };
export type PlanetLink = { planet: Planet; score: number; links: Link[] };

/**
 * Weights of the Stage 2 refinements (see the header). `strength`: link
 * multiplier per composite-strength point (0 = the old dignity ×1.15/×0.85);
 * `varga`: link for ruling / occupying the topic's varga house (× the main
 * house weight); `vargaDignity`: ± share for the main lord's dignity in that
 * varga; `vedha`: share of a good gochara bonus an obstruction removes;
 * `sav`: points per ashtakavarga transit step of Jupiter and Saturn.
 */
export type TimingWeights = { strength: number; varga: number; vargaDignity: number; vedha: number; sav: number };
export const TIMING_WEIGHTS: TimingWeights = { strength: 0.03, varga: 0.15, vargaDignity: 0.06, vedha: 1, sav: 0.2 };
/** The engine before Stage 2 (for measurement). */
export const LEGACY_WEIGHTS: TimingWeights = { strength: 0, varga: 0, vargaDignity: 0, vedha: 0, sav: 0 };

/** The varga that confirms a topic, and the varga houses whose lords / occupants link to it (rules.md §3.7). */
export const TOPIC_VARGA: Partial<Record<TimingTopic, { varga: Varga; houses: number[] }>> = {
  marriage: { varga: 'D9', houses: [7, 1] }, love: { varga: 'D9', houses: [7] },
  job: { varga: 'D10', houses: [10] }, promotion: { varga: 'D10', houses: [10] }, business: { varga: 'D10', houses: [10, 7] },
  children: { varga: 'D7', houses: [5] }, property: { varga: 'D4', houses: [4] }, education: { varga: 'D24', houses: [4, 5] },
};

const VSIGN_RULER = SIGN_RULER;
const EXALT: Partial<Record<Planet, number>> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBIL: Partial<Record<Planet, number>> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };

function rawLink(chart: NatalChart, rule: TopicRule, topic: TimingTopic, planet: Planet, W: TimingWeights): PlanetLink {
  const at = chart.planets[planet].sign;
  const links: Link[] = [];
  let score = 0;
  const topicHouses = new Set(rule.houses.map(([h]) => h));
  for (const [h, w] of rule.houses) {
    const sign = houseSign(chart.first, h);
    const lord = SIGN_RULER[sign];
    if (lord === planet) { score += w; links.push({ kind: 'lord', house: h }); }
    if (at === sign) { score += 0.8 * w; links.push({ kind: 'occupant', house: h }); }
    else if (aspects(planet, at, sign)) { score += 0.4 * w; links.push({ kind: 'aspect', house: h }); }
    if (lord !== planet && chart.planets[lord].sign === at) { score += 0.4 * w; links.push({ kind: 'withLord', house: h }); }
  }
  for (const [k, w] of rule.karakas) if (k === planet) { score += w; links.push({ kind: 'karaka' }); }
  // Divisional confirmation (birth time only; the varga lagna stable at ±5 minutes).
  const a = chart.analysis;
  const tv = TOPIC_VARGA[topic];
  if (a && tv && W.varga > 0 && vargaUsable(a.vargas, tv.varga)) {
    const vc = a.vargas.charts[tv.varga];
    const mainW = rule.houses[0][1];
    for (const vh of tv.houses) {
      const vs = (vc.asc! + vh - 1) % 12;
      if (VSIGN_RULER[vs] === planet) { score += W.varga * mainW; links.push({ kind: 'varga', house: vh, varga: tv.varga }); }
      else if (vc.planets[planet] === vs && vc.planetStable[planet]) { score += 0.5 * W.varga * mainW; links.push({ kind: 'varga', house: vh, varga: tv.varga }); }
    }
  }
  for (const h of rule.against) {
    if (topicHouses.has(h)) continue;
    const sign = houseSign(chart.first, h);
    if (SIGN_RULER[sign] === planet) { score -= 1; links.push({ kind: 'against', house: h }); }
    else if (at === sign && planet !== 'Rahu' && planet !== 'Ketu') { score -= 0.5; links.push({ kind: 'against', house: h }); }
  }
  if (score > 0) {
    if (a && W.strength > 0) score *= strengthFactor(a, planet, W.strength, 0.82, 1.2);
    else {
      const dig = chart.planets[planet].dignity;
      score *= dig === 'own' || dig === 'exalted' ? 1.15 : dig === 'debilitated' ? 0.85 : 1;
    }
    // The main house lord's dignity in the topic's varga.
    if (a && tv && W.vargaDignity > 0 && SIGN_RULER[houseSign(chart.first, rule.houses[0][0])] === planet
      && a.hasTime && vargaPlanetUsable(a.vargas, tv.varga, planet)) {
      const vs = a.vargas.charts[tv.varga].planets[planet];
      if (EXALT[planet] === vs || VSIGN_RULER[vs] === planet) score *= 1 + W.vargaDignity;
      else if (DEBIL[planet] === vs) score *= 1 - W.vargaDignity;
    }
  }
  return { planet, score, links };
}

/** Link scores of all nine planets for a topic (nodes include their dispositor's share). */
export function topicLinks(chart: NatalChart, topic: TimingTopic, weights: TimingWeights = TIMING_WEIGHTS): Record<Planet, PlanetLink> {
  const rule = TOPIC_RULES[topic];
  const out = {} as Record<Planet, PlanetLink>;
  for (const p of DASHA_ORDER) out[p] = rawLink(chart, rule, topic, p, weights);
  for (const node of ['Rahu', 'Ketu'] as const) {
    const disp = SIGN_RULER[chart.planets[node].sign];
    const share = 0.7 * Math.max(0, out[disp].score);
    if (share > 0) {
      out[node] = { ...out[node], score: out[node].score + share, links: [...out[node].links, { kind: 'node', via: disp }] };
    }
  }
  return out;
}

// ─── 2. Dasha levels ─────────────────────────────────────────────────────────

/** Split a period into its nine sub-periods (Vimshottari proportions), from its own lord. */
export function splitPeriod(p: DashaPeriod): DashaPeriod[] {
  const out: DashaPeriod[] = [];
  const total = p.end.getTime() - p.start.getTime();
  let cursor = p.start.getTime();
  const first = DASHA_ORDER.indexOf(p.lord as Planet);
  for (let i = 0; i < 9; i++) {
    const lord = DASHA_ORDER[(first + i) % 9];
    const end = cursor + total * DASHA_YEARS[lord] / 120;
    out.push({ lord, start: new Date(cursor), end: new Date(end) });
    cursor = end;
  }
  return out;
}

type DashaAt = { maha: DashaPeriod; antar: DashaPeriod; praty: DashaPeriod };

function dashaLookup(profile: TimingProfile, from: Date, to: Date) {
  const life = getLifeChapters(profile, from, 130);
  const mahas = life.chapters.filter(c => c.end > from && c.start < to);
  const cache = new Map<DashaPeriod, DashaPeriod[]>();
  const kids = (p: DashaPeriod) => {
    let k = cache.get(p);
    if (!k) { k = splitPeriod(p); cache.set(p, k); }
    return k;
  };
  return (d: Date): DashaAt | null => {
    const maha = mahas.find(m => d >= m.start && d < m.end);
    if (!maha) return null;
    const antar = kids(maha).find(a => d >= a.start && d < a.end) ?? kids(maha)[8];
    const praty = kids(antar).find(a => d >= a.start && d < a.end) ?? kids(antar)[8];
    return { maha, antar, praty };
  };
}

// ─── 3. Transits ─────────────────────────────────────────────────────────────

type TransitMark = { kind: 'double' | 'jupiter'; target: 'house' | 'lord' | 'moon' };

/** Other transiting planets' houses from the natal Moon (vedha) and the natal ashtakavarga. */
type TransitCtx = { others: Partial<Record<AvPlanet, number>> | null; av: Ashtakavarga | null; avWeight: number; W: TimingWeights };

function transitScore(
  chart: NatalChart, topic: TimingTopic, jup: number, sat: number, ctx?: TransitCtx,
): { score: number; marks: TransitMark[] } {
  const rule = TOPIC_RULES[topic];
  const main = rule.houses[0][0];
  const hs = houseSign(chart.first, main);
  const ls = chart.planets[SIGN_RULER[hs]].sign;
  const ms = houseSign(chart.moonSign, main);
  const touchJ = (s: number) => jup === s || aspects('Jupiter', jup, s);
  const touchS = (s: number) => sat === s || aspects('Saturn', sat, s);
  const marks: TransitMark[] = [];
  let score = 0;
  const targets: [TransitMark['target'], number, number][] = [['house', hs, 2.0], ['lord', ls, 1.2]];
  if (ms !== hs) targets.push(['moon', ms, 1.0]);
  for (const [target, s, w] of targets) {
    if (target === 'lord' && s === hs) continue;
    const j = touchJ(s), t = touchS(s);
    if (j && t) { score += w; marks.push({ kind: 'double', target }); }
    else if (j) { score += w / 3; marks.push({ kind: 'jupiter', target }); }
    else if (t) score += w / 8;
  }
  const fromMoon = (s: number) => houseOfSign(chart.moonSign, s);
  const jh = fromMoon(jup);
  const sh = fromMoon(sat);
  // Good gochara from the Moon, cancelled (by the vedha weight) while another planet sits in its vedha house.
  const others = ctx?.others ? { ...ctx.others, Jupiter: jh, Saturn: sh } : null;
  const vedha = (pl: AvPlanet, h: number) => (others && ctx!.W.vedha > 0 && vedhaBlocked(pl, h, others) ? ctx!.W.vedha : 0);
  if ([2, 5, 7, 9, 11].includes(jh)) score += 0.5 * (1 - vedha('Jupiter', jh));
  if ([3, 6, 11].includes(sh)) score += 0.3 * (1 - vedha('Saturn', sh));
  if (rule.saturnHard && [12, 1, 2, 8].includes(sh)) score -= 0.6;
  // Ashtakavarga: the transited signs' bindus.
  if (ctx?.av && ctx.avWeight > 0) {
    score += ctx.avWeight * (transitBindus(ctx.av, 'Jupiter', jup).score + transitBindus(ctx.av, 'Saturn', sat).score);
  }
  return { score, marks };
}

// ─── 4. Month scores and windows ─────────────────────────────────────────────

export type MonthScore = {
  /** First day of the month (local). */
  month: Date;
  score: number;
  dasha: number;
  transit: number;
  maha: string;
  antar: string;
  praty: string;
  marks: TransitMark[];
};

export type Reason =
  | { kind: 'dasha'; maha: string; antar: string; mahaLinks: Link[]; antarLinks: Link[] }
  | { kind: 'doubleTransit'; target: 'house' | 'lord' | 'moon'; house: number }
  | { kind: 'jupiterTransit'; target: 'house' | 'lord' | 'moon'; house: number }
  | { kind: 'saturnHard' };

export type Confidence = 'high' | 'medium' | 'low';
export type Strength = 'strong' | 'moderate' | 'weak';

export type TimingWindow = {
  start: Date;
  /** Last day of the window's last month. */
  end: Date;
  /** First day of the best month. */
  peak: Date;
  score: number;
  strength: Strength;
  confidence: Confidence;
  reasons: Reason[];
};

export type TimingResult = {
  topic: TimingTopic;
  now: Date;
  /** Ranked, best first; non-overlapping. Empty only for unusable birth data. */
  windows: TimingWindow[];
  /** windows[0] is at least `strong`. */
  strongWithin: boolean;
  /** No strong window within the horizon: the next strong one up to ten years out, if any. */
  nextStrong: TimingWindow | null;
  /** Searching backwards ("did I…", "when was…"): windows lie before `now`. */
  past: boolean;
  basis: 'rising' | 'moon';
  hasTime: boolean;
  hasPlace: boolean;
  nakshatraUncertain: boolean;
  /** Every month's score (for tests, the reports and debugging). */
  months: MonthScore[];
};

/**
 * Peak month score that counts as strong / moderate. Calibrated on 150
 * training profiles x 13 topics (today 2026-10): month scores have median
 * ~4.8 (dasha part) + ~0.9 (transit part), window peaks median ~9.5. A strong
 * window also needs a double transit somewhere in it (K. N. Rao: the dasha
 * promises, the double transit of Jupiter and Saturn delivers).
 */
export const STRONG = 8.5;
export const MODERATE = 6.5;
const WINDOW_SHARE = 0.8;
const MAX_WINDOW_MONTHS = 10;
const MIN_WINDOW_MONTHS = 3;
export const HORIZON_MONTHS = 60;

const monthStart = (y: number, m: number) => new Date(y, m, 1);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
const addMonths = (d: Date, n: number) => monthStart(d.getFullYear(), d.getMonth() + n);

function scoreMonths(
  profile: TimingProfile, chart: NatalChart, topic: TimingTopic, from: Date, count: number, W: TimingWeights = TIMING_WEIGHTS,
): MonthScore[] {
  const links = topicLinks(chart, topic, W);
  const A = (p: string) => links[p as Planet]?.score ?? 0;
  const first = monthStart(from.getFullYear(), from.getMonth());
  const dashaAt = dashaLookup(profile, first, addMonths(first, count + 1));
  const a = chart.analysis;
  let av: Ashtakavarga | null = null;
  if (a && W.sav > 0) {
    const signs = {} as Record<AvPlanet, number>;
    for (const pl of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as AvPlanet[]) signs[pl] = a.planets[pl].sign;
    av = ashtakavarga(signs, chart.first);
  }
  // Without a birth time the Moon's sign stands in for the ascendant: half weight.
  const avWeight = W.sav * (chart.basis === 'rising' ? 1 : 0.5);
  const out: MonthScore[] = [];
  for (let i = 0; i < count; i++) {
    const m = addMonths(first, i);
    const mid = new Date(m.getFullYear(), m.getMonth(), 15, 12);
    const d = dashaAt(mid);
    if (!d) continue;
    let dasha = A(d.antar.lord) + 0.5 * A(d.maha.lord) + 0.25 * A(d.praty.lord);
    if (A(d.antar.lord) >= 1 && A(d.maha.lord) >= 1) dasha += 1;
    const rel = houseOfSign(chart.planets[d.maha.lord as Planet].sign, chart.planets[d.antar.lord as Planet].sign);
    if (d.antar.lord !== d.maha.lord && (rel === 6 || rel === 8)) dasha -= 0.5;
    // Transit: average of three samples in the month (retrograde loops included).
    let transit = 0;
    const marks: TransitMark[] = [];
    for (const day of [5, 15, 25]) {
      const jd = new Date(m.getFullYear(), m.getMonth(), day, 12).getTime() / DAY_MS + 2440587.5;
      const signAt = (b: 'Sun' | 'Mars' | 'Mercury' | 'Venus' | 'Jupiter' | 'Saturn') => Math.floor(siderealLongitudeAt(b, jd) / 30) % 12;
      const jup = signAt('Jupiter');
      const sat = signAt('Saturn');
      let others: Partial<Record<AvPlanet, number>> | null = null;
      if (W.vedha > 0) {
        others = {};
        for (const b of ['Sun', 'Mars', 'Mercury', 'Venus'] as const) others[b] = houseOfSign(chart.moonSign, signAt(b));
      }
      const t = transitScore(chart, topic, jup, sat, { others, av, avWeight, W });
      transit += t.score / 3;
      for (const k of t.marks) if (!marks.some(x => x.kind === k.kind && x.target === k.target)) marks.push(k);
    }
    out.push({
      month: m, score: dasha + transit, dasha, transit,
      maha: d.maha.lord, antar: d.antar.lord, praty: d.praty.lord, marks,
    });
  }
  return out;
}

const strengthOf = (peak: number, double: boolean): Strength =>
  (peak >= STRONG && double ? 'strong' : peak >= MODERATE ? 'moderate' : 'weak');

function confidenceOf(s: Strength, chart: NatalChart): Confidence {
  const levels: Confidence[] = ['low', 'medium', 'high'];
  let i = s === 'strong' ? 2 : s === 'moderate' ? 1 : 0;
  if (!chart.hasTime || !chart.hasPlace) i--;
  if (chart.nakshatraUncertain) i = 0;
  return levels[Math.max(0, i)];
}

function reasonsFor(chart: NatalChart, topic: TimingTopic, months: MonthScore[], peak: MonthScore): Reason[] {
  const links = topicLinks(chart, topic);
  const rule = TOPIC_RULES[topic];
  const out: Reason[] = [];
  const pos = (l: Link[]) => l.filter(x => x.kind !== 'against');
  if (links[peak.antar as Planet].score > 0 || links[peak.maha as Planet].score > 0) {
    out.push({
      kind: 'dasha', maha: peak.maha, antar: peak.antar,
      mahaLinks: pos(links[peak.maha as Planet].links), antarLinks: pos(links[peak.antar as Planet].links),
    });
  }
  const main = rule.houses[0][0];
  const seen = new Set<string>();
  for (const m of months) {
    for (const k of m.marks) {
      const key = `${k.kind}:${k.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(k.kind === 'double'
        ? { kind: 'doubleTransit', target: k.target, house: main }
        : { kind: 'jupiterTransit', target: k.target, house: main });
    }
  }
  // Doubles first, then Jupiter alone.
  return out.sort((a, b) => order(a) - order(b));
}
const order = (r: Reason) => (r.kind === 'dasha' ? 0 : r.kind === 'doubleTransit' ? 1 : 2);

function findWindows(chart: NatalChart, topic: TimingTopic, months: MonthScore[], n = 3, share = WINDOW_SHARE): TimingWindow[] {
  if (months.length === 0) return [];
  const best = Math.max(...months.map(m => m.score));
  const cut = best > 0 ? best * share : best - 0.5;
  // Runs of good months, a single weaker month inside a run bridged.
  const good = months.map(m => m.score >= cut);
  const runs: [number, number][] = [];
  for (let i = 0; i < months.length; i++) {
    if (!good[i]) continue;
    let j = i;
    while (j + 1 < months.length && (good[j + 1] || (j + 2 < months.length && good[j + 2]))) j += good[j + 1] ? 1 : 2;
    runs.push([i, j]);
    i = j;
  }
  const windows: TimingWindow[] = [];
  for (let [a, b] of runs) {
    if (b - a + 1 > MAX_WINDOW_MONTHS) {
      // The 12 consecutive months with the highest total.
      let bestA = a, bestSum = -Infinity;
      for (let s = a; s + MAX_WINDOW_MONTHS - 1 <= b; s++) {
        let sum = 0;
        for (let k = s; k < s + MAX_WINDOW_MONTHS; k++) sum += months[k].score;
        if (sum > bestSum) { bestSum = sum; bestA = s; }
      }
      a = bestA; b = bestA + MAX_WINDOW_MONTHS - 1;
    }
    // Too short to plan around: widen to the better neighbour until MIN_WINDOW_MONTHS.
    while (b - a + 1 < MIN_WINDOW_MONTHS && (a > 0 || b < months.length - 1)) {
      const left = a > 0 ? months[a - 1].score : -Infinity;
      const right = b < months.length - 1 ? months[b + 1].score : -Infinity;
      if (right >= left) b++; else a--;
    }
    const span = months.slice(a, b + 1);
    let peak = span[0];
    for (const m of span) if (m.score > peak.score + 1e-9) peak = m;
    const mean = span.reduce((s, m) => s + m.score, 0) / span.length;
    const strength = strengthOf(peak.score, span.some(m => m.marks.some(k => k.kind === 'double')));
    windows.push({
      start: span[0].month,
      end: monthEnd(span[span.length - 1].month),
      peak: peak.month,
      score: 0.7 * peak.score + 0.3 * mean,
      strength,
      confidence: confidenceOf(strength, chart),
      reasons: reasonsFor(chart, topic, span, peak),
    });
  }
  windows.sort((x, y) => y.score - x.score || x.start.getTime() - y.start.getTime());
  const out: TimingWindow[] = [];
  for (const w of windows) {
    if (out.some(o => w.start <= o.end && o.start <= w.end)) continue;
    out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

/** Alternatives are looked for down to this share of the best month. */
const ALT_SHARE = 0.65;
/** A window this close to the best one's score counts as just as good: the earliest such wins. */
const NEAR_BEST = 0.9;

/**
 * Final order: the earliest window scoring within NEAR_BEST of the top one
 * comes first (an astrologer names the first strong period, not one five
 * years out that scores a little higher; for past questions the latest),
 * then the rest by score, adding lower-share alternatives so there is a
 * nearer option to mention when the best window is far away.
 */
function rankWindows(main: TimingWindow[], alts: TimingWindow[], n: number, past: boolean): TimingWindow[] {
  const all = [...main];
  for (const w of alts) if (!all.some(o => w.start <= o.end && o.start <= w.end)) all.push(w);
  if (all.length === 0) return all;
  const top = Math.max(...all.map(w => w.score));
  const near = all.filter(w => w.score >= NEAR_BEST * top)
    .sort((a, b) => (past ? b.start.getTime() - a.start.getTime() : a.start.getTime() - b.start.getTime()));
  const best = near[0];
  const rest = all.filter(w => w !== best).sort((a, b) => b.score - a.score || a.start.getTime() - b.start.getTime());
  return [best, ...rest].slice(0, n);
}

export type TimingOptions = {
  /** Months to search (default 60, about five years). */
  months?: number;
  /** Look back instead of ahead (questions about the past). */
  past?: boolean;
  /** How many windows to return (default 3). */
  count?: number;
  /** Stage 2 refinement weights (default TIMING_WEIGHTS; LEGACY_WEIGHTS = the engine before them). */
  weights?: TimingWeights;
};

const resultCache = new Map<string, TimingResult>();
const CACHE_MAX = 64;

/**
 * Ranked windows for `topic` in the next ~five years (or the past five with
 * `past`). Deterministic for the same profile, topic and calendar month of
 * `now`; memoized per those.
 */
export function timingWindows(
  profile: TimingProfile, topic: TimingTopic, now: Date = new Date(), opts: TimingOptions = {},
): TimingResult {
  const count = opts.months ?? HORIZON_MONTHS;
  const past = !!opts.past;
  const n = opts.count ?? 3;
  const W = opts.weights ?? TIMING_WEIGHTS;
  const key = [profile.birthDate, profile.birthTime ?? '', profile.birthLat ?? '', profile.birthLng ?? '',
    profile.birthTz ?? '', topic, now.getFullYear(), now.getMonth(), count, past, n, JSON.stringify(W)].join('|');
  const hit = resultCache.get(key);
  if (hit) return hit;

  const empty = (chart: NatalChart | null): TimingResult => ({
    topic, now, windows: [], strongWithin: false, nextStrong: null, past, months: [],
    basis: chart?.basis ?? 'moon', hasTime: chart?.hasTime ?? false, hasPlace: chart?.hasPlace ?? false,
    nakshatraUncertain: chart?.nakshatraUncertain ?? true,
  });
  if (!VALID_DATE.test(profile.birthDate)) return empty(null);
  const chart = natalChart(profile);
  if (!Number.isFinite(chart.moonLon)) return empty(chart);

  // Forward windows start next month: an event needs lead time, and "this
  // month" is the date every chart shares (the v2.1 "Oct 2026" failure).
  const start = past ? addMonths(now, -count) : addMonths(now, 1);
  const birth = new Date(profile.birthDate + 'T00:00:00');
  const from = start < birth ? monthStart(birth.getFullYear(), birth.getMonth() + 1) : start;
  const span = past ? Math.max(0, (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth()) : count;
  const months = scoreMonths(profile, chart, topic, from, span, W);
  const windows = rankWindows(findWindows(chart, topic, months, n), findWindows(chart, topic, months, 6, ALT_SHARE), n, past);
  const strongWithin = windows[0]?.strength === 'strong';
  let nextStrong: TimingWindow | null = null;
  if (!strongWithin && !past) {
    const later = scoreMonths(profile, chart, topic, addMonths(from, span), 60, W);
    const strong = findWindows(chart, topic, later, 6).filter(w => w.strength === 'strong');
    nextStrong = strong.sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null;
  }
  const result: TimingResult = {
    topic, now, windows, strongWithin, nextStrong, past, months,
    basis: chart.basis, hasTime: chart.hasTime, hasPlace: chart.hasPlace, nakshatraUncertain: chart.nakshatraUncertain,
  };
  resultCache.set(key, result);
  if (resultCache.size > CACHE_MAX) resultCache.delete(resultCache.keys().next().value!);
  return result;
}

// ─── Helpers for callers ─────────────────────────────────────────────────────

export type YM = { year: number; month: number };
export const ymOf = (d: Date): YM => ({ year: d.getFullYear(), month: d.getMonth() + 1 });
const ymKey = (x: YM) => x.year * 12 + x.month - 1;

/**
 * Is a month-year (or bare year) inside one of the windows, with `slack`
 * months either side? A bare year counts when a window overlaps that year.
 */
export function dateInWindows(d: { year: number; month: number | null }, windows: { start: Date; end: Date }[], slack = 1): boolean {
  return windows.some((w) => {
    const a = ymKey(ymOf(w.start)) - slack, b = ymKey(ymOf(w.end)) + slack;
    if (d.month == null) return w.start.getFullYear() <= d.year && w.end.getFullYear() >= d.year;
    const k = ymKey({ year: d.year, month: d.month });
    return k >= a && k <= b;
  });
}

/** Years from `now` to the window's start (0 for a window running now). */
export function yearsAway(w: TimingWindow, now: Date): number {
  return Math.max(0, (w.start.getTime() - now.getTime()) / YEAR_MS);
}

/** The house numbers of a topic, main first. */
export function topicHouses(topic: TimingTopic): number[] {
  return TOPIC_RULES[topic].houses.map(([h]) => h);
}
