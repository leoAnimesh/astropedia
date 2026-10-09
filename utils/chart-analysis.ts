/**
 * How strong each planet is, and the conservative set of combinations a
 * practising astrologer would name (ml/astro-kb/rules.md §3.2-3.9, §9.2-9.7).
 * Pure: chart math only (no React Native, no i18n), Node-testable. The
 * timing engine, the chat planners (utils/agent/astrologer.ts) and the
 * reports read the same numbers, so they can never disagree.
 *
 * Per planet:
 *  - dignity in five-plus steps: exalted, moolatrikona, own, then the
 *    compound (panchadha) relation to the sign's ruler: natural friendship
 *    (BPHS table) + temporary friendship (the ruler 2, 3, 4, 10, 11 or 12
 *    signs away) → great friend / friend / neutral / enemy / great enemy;
 *    debilitated (softened by neecha bhanga);
 *  - combustion within the Surya Siddhanta orbs of the Sun (Moon 12°, Mars
 *    17°, Mercury 14° / 12° retrograde, Jupiter 11°, Venus 10° / 8°
 *    retrograde, Saturn 15°); Mercury's is only "shown" within 3°;
 *  - directional strength (Jupiter, Mercury in the 1st; Sun, Mars in the
 *    10th; Saturn in the 7th; Moon, Venus in the 4th);
 *  - vargottama and the navamsa (D9) dignity;
 *  - whole-sign aspects and conjunctions received;
 *  - functional nature for the ascendant (lords of 1/5/9 benefic, 3/6/11
 *    malefic, 8th malefic unless it also rules the 1st, kendra + trikona =
 *    yogakaraka; nodes take their dispositor's nature).
 *
 * Composite strength (rules.md §9.5, a shadbala proxy):
 *   dignity score (exalted 5, moolatrikona 4, own 4, great friend 3, friend
 *   2, neutral 1, enemy 0, great enemy −1, debilitated −2 / 1 with neecha
 *   bhanga) + house (angle +2, 5th/9th +1.5, 11th +1, 6/8/12 −1.5; Mars,
 *   Saturn and the nodes +1 in 3/6/11) + 1 directional strength + 1
 *   vargottama + ½ × D9 dignity − 2 combust (Mercury −½) ± ½ per benefic /
 *   malefic influence + ½ retrograde (Mars–Saturn).
 *
 * Yogas (only these; never Kaal Sarp or any "fear" label): Gajakesari,
 * Pancha Mahapurusha, Parashari raja yoga (kendra-trikona lords linked, or a
 * yogakaraka placed well), dhana yoga (2/11 lords with 1/5/9 lords),
 * viparita raja yoga, parivartana (exchange), neecha bhanga; Budha-Aditya
 * and Kemadruma are computed for completeness but marked internal (never
 * said to a user). Each carries the weaker planet's strength, so weak
 * combinations are not mentioned (`mention`).
 */
import { getAscendantDegree, getChartPositions, getMoonLongitudeExact, getPlanetDignity, type BirthData } from './astrology';
import { vargaCharts, type VargaSet } from './vargas';

export type Planet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu';
export const PLANETS: readonly Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
export const SEVEN: readonly Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
export const SIGN_RULER: readonly Planet[] = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];

/** Graha drishti in whole signs: the houses counted from the planet that it aspects (BPHS). */
const ASPECTS: Record<Planet, number[]> = {
  Sun: [7], Moon: [7], Mercury: [7], Venus: [7], Mars: [4, 7, 8], Jupiter: [5, 7, 9], Saturn: [3, 7, 10],
  // The nodes' 5th/9th aspects are disputed between texts; only the 7th is used.
  Rahu: [7], Ketu: [7],
};

/** Does a planet in sign `from` aspect sign `to`? */
export function aspects(planet: Planet, from: number, to: number): boolean {
  const n = ((to - from + 12) % 12) + 1;
  return ASPECTS[planet].includes(n);
}

const houseFrom = (base: number, sign: number) => ((sign - base + 12) % 12) + 1;
const norm = (x: number) => ((x % 360) + 360) % 360;
const sep = (a: number, b: number) => { const d = Math.abs(norm(a) - norm(b)); return d > 180 ? 360 - d : d; };

// ─── Dignity (rules.md §3.2, §9.3) ───────────────────────────────────────────

type Rel = 'friend' | 'neutral' | 'enemy';
const NATURAL: Record<string, { friend: Planet[]; enemy: Planet[] }> = {
  Sun: { friend: ['Moon', 'Mars', 'Jupiter'], enemy: ['Venus', 'Saturn'] },
  Moon: { friend: ['Sun', 'Mercury'], enemy: [] },
  Mars: { friend: ['Sun', 'Moon', 'Jupiter'], enemy: ['Mercury'] },
  Mercury: { friend: ['Sun', 'Venus'], enemy: ['Moon'] },
  Jupiter: { friend: ['Sun', 'Moon', 'Mars'], enemy: ['Mercury', 'Venus'] },
  Venus: { friend: ['Mercury', 'Saturn'], enemy: ['Sun', 'Moon'] },
  Saturn: { friend: ['Mercury', 'Venus'], enemy: ['Sun', 'Moon', 'Mars'] },
};

/** Natural (naisargika) relation of `of` toward `to` (BPHS table; the nodes are neutral). */
export function naturalRelation(of: Planet, to: Planet): Rel {
  const t = NATURAL[of];
  if (!t || of === to) return 'neutral';
  if (t.friend.includes(to)) return 'friend';
  if (t.enemy.includes(to)) return 'enemy';
  return 'neutral';
}

/** Moolatrikona sign and degree range (rules.md §3.2). */
const MOOLATRIKONA: Partial<Record<Planet, [number, number, number]>> = {
  Sun: [4, 0, 20], Moon: [1, 3, 30], Mars: [0, 0, 12], Mercury: [5, 15, 20], Jupiter: [8, 0, 10], Venus: [6, 0, 15], Saturn: [10, 0, 20],
};
const EXALT_SIGN: Partial<Record<Planet, number>> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBIL_SIGN: Partial<Record<Planet, number>> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };

export type Dignity5 = 'exalted' | 'moolatrikona' | 'own' | 'greatFriend' | 'friend' | 'neutral' | 'enemy' | 'greatEnemy' | 'debilitated';
export const DIGNITY_SCORE: Record<Dignity5, number> = {
  exalted: 5, moolatrikona: 4, own: 4, greatFriend: 3, friend: 2, neutral: 1, enemy: 0, greatEnemy: -1, debilitated: -2,
};

/** Compound relation from natural + temporary friendship (BPHS panchadha maitri). */
function compound(natural: Rel, temporaryFriend: boolean): Dignity5 {
  if (natural === 'friend') return temporaryFriend ? 'greatFriend' : 'neutral';
  if (natural === 'enemy') return temporaryFriend ? 'neutral' : 'greatEnemy';
  return temporaryFriend ? 'friend' : 'enemy';
}

/**
 * Dignity of `planet` at sidereal longitude `lon`, with `signs` the sign of
 * every planet (for the temporary relation to the sign's ruler). Mercury in
 * Virgo: exalted to 15°, moolatrikona 15-20°, own after; the Moon in Taurus:
 * exalted to 3°, moolatrikona after (the deep-exaltation ranges).
 */
export function dignity5(planet: Planet, lon: number, signs: Record<Planet, number>): Dignity5 {
  const s = Math.floor(norm(lon) / 30) % 12;
  const d = norm(lon) - s * 30;
  if (planet === 'Rahu' || planet === 'Ketu') return 'neutral';
  const mt = MOOLATRIKONA[planet];
  if (EXALT_SIGN[planet] === s) {
    // Mercury in Virgo, the Moon in Taurus: exalted up to the moolatrikona range, then moolatrikona, then own.
    if (mt && mt[0] === s && d >= mt[1]) return d < mt[2] ? 'moolatrikona' : SIGN_RULER[s] === planet ? 'own' : 'exalted';
    return 'exalted';
  }
  if (DEBIL_SIGN[planet] === s) return 'debilitated';
  if (mt && mt[0] === s && d >= mt[1] && d < mt[2]) return 'moolatrikona';
  const ruler = SIGN_RULER[s];
  if (ruler === planet) return 'own';
  const away = houseFrom(signs[planet], signs[ruler]);
  return compound(naturalRelation(planet, ruler), [2, 3, 4, 10, 11, 12].includes(away));
}

/** Navamsa dignity score (natural relation only: the D9 has no reliable houses without a stable lagna). */
function d9Score(planet: Planet, d9Sign: number): number {
  if (planet === 'Rahu' || planet === 'Ketu') return 1;
  if (EXALT_SIGN[planet] === d9Sign) return 5;
  if (DEBIL_SIGN[planet] === d9Sign) return -2;
  const ruler = SIGN_RULER[d9Sign];
  if (ruler === planet) return 4;
  const r = naturalRelation(planet, ruler);
  return r === 'friend' ? 2 : r === 'neutral' ? 1 : 0;
}

// ─── Combustion (rules.md §3.5, §9.2) ────────────────────────────────────────

const COMBUST_ORB: Partial<Record<Planet, [number, number]>> = {
  Moon: [12, 12], Mars: [17, 17], Mercury: [14, 12], Jupiter: [11, 11], Venus: [10, 8], Saturn: [15, 15],
};

export function combustion(planet: Planet, lon: number, sunLon: number, retrograde: boolean): { combust: boolean; sep: number; shown: boolean } {
  const orb = COMBUST_ORB[planet];
  const s = sep(lon, sunLon);
  if (!orb) return { combust: false, sep: s, shown: false };
  const combust = s < (retrograde ? orb[1] : orb[0]);
  return { combust, sep: s, shown: combust && (planet !== 'Mercury' || s < 3) };
}

// ─── Directional strength (rules.md §3.8) ────────────────────────────────────

const DIG_BALA: Partial<Record<Planet, number>> = { Jupiter: 1, Mercury: 1, Sun: 10, Mars: 10, Saturn: 7, Moon: 4, Venus: 4 };

// ─── Functional nature (rules.md §3.3, §9.4) ─────────────────────────────────

export type Functional = 'yogakaraka' | 'benefic' | 'mixed' | 'neutral' | 'malefic';

/** Houses (1-12) a planet rules from the sign `first`. */
export function housesRuled(first: number, planet: Planet): number[] {
  const out: number[] = [];
  for (let h = 1; h <= 12; h++) if (SIGN_RULER[(first + h - 1) % 12] === planet) out.push(h);
  return out;
}

const NATURAL_MALEFIC: Planet[] = ['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu'];

/**
 * Functional nature of a planet for the ascendant sign `first`. Lords of the
 * trines are benefic, of 3/6/11 malefic; the 8th lord is malefic unless it
 * also rules the 1st; a planet ruling an angle and the 5th or 9th is a
 * yogakaraka; a natural malefic ruling the 4th or 10th with the 3rd / 11th is
 * mixed; angles alone, the 2nd or the 12th alone are neutral. The nodes take
 * their dispositor's nature (`dispositor`).
 */
export function functionalNature(first: number, planet: Planet, dispositor?: Planet): Functional {
  if (planet === 'Rahu' || planet === 'Ketu') return dispositor ? functionalNature(first, dispositor) : 'neutral';
  const H = housesRuled(first, planet);
  const kendra = H.filter(h => [1, 4, 7, 10].includes(h));
  const trine = H.filter(h => h === 5 || h === 9);
  const lagnaLord = H.includes(1);
  const bad = H.filter(h => [3, 6, 11].includes(h) || (h === 8 && !lagnaLord));
  if (kendra.length && trine.length) return 'yogakaraka';
  if (trine.length) return bad.length ? 'mixed' : 'benefic';
  if (lagnaLord) return bad.length || H.includes(6) ? 'mixed' : 'benefic';
  if (H.includes(8)) return 'malefic';
  if (bad.length) {
    const softened = kendra.some(h => h === 4 || h === 10) && bad.every(h => h === 3 || h === 11);
    return softened ? 'mixed' : 'malefic';
  }
  if (kendra.length && NATURAL_MALEFIC.includes(planet)) return 'neutral';
  return 'neutral';
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export type PlanetInfo = {
  planet: Planet;
  lon: number;
  sign: number;
  /** Degree in sign. */
  deg: number;
  /** Whole-sign house from the first house (ascendant, or the Moon without time/place). */
  house: number;
  retrograde: boolean;
  /** The app's four-level dignity (getPlanetDignity). */
  dignity: 'exalted' | 'debilitated' | 'own' | 'neutral';
  dignity5: Dignity5;
  combust: boolean;
  /** Combust and worth saying (Mercury only within 3°). */
  combustShown: boolean;
  combustSep: number;
  digBala: boolean;
  vargottama: boolean;
  /** Navamsa sign (the Moon's only with a birth time). */
  d9: number | null;
  conjunct: Planet[];
  aspectedBy: Planet[];
  /** Planets this one aspects (whole signs, not counting conjunctions). */
  aspecting: Planet[];
  beneficInfluence: Planet[];
  maleficInfluence: Planet[];
  neechaBhanga: boolean;
  /** Houses it rules from the first house (none for the nodes). */
  rules: number[];
  functional: Functional;
  /** Composite strength (rules.md §9.5). */
  strength: number;
};

export type YogaKey =
  | 'gajakesari' | 'mahapurusha' | 'raja' | 'dhana' | 'viparita' | 'parivartana' | 'neechaBhanga' | 'budhaditya' | 'kemadruma';

export type Yoga = {
  key: YogaKey;
  planets: Planet[];
  /** Houses whose topics the yoga touches (from the first house). */
  houses: number[];
  /** The weaker planet's composite strength. */
  strength: number;
  /** Never said to a user (Kemadruma; Budha-Aditya is too common to mean much alone). */
  internal: boolean;
  /** Worth naming in plain words: not internal and both planets reasonably strong. */
  mention: boolean;
  /** Pancha Mahapurusha: which one (Ruchaka, Bhadra, Hamsa, Malavya, Sasa); raja/dhana: how the lords link. */
  detail?: string;
};

export type ChartAnalysis = {
  first: number;
  basis: 'rising' | 'moon';
  hasTime: boolean;
  moonSign: number;
  sunLon: number;
  /** The Moon is ahead of the Sun by less than 180° (waxing, a natural benefic). */
  moonWaxing: boolean;
  planets: Record<Planet, PlanetInfo>;
  /** Planets by composite strength, strongest first. */
  ranked: Planet[];
  vargas: VargaSet;
  yogas: Yoga[];
};

const VALID_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
/** A yoga is named only when its weaker planet has at least this composite strength. */
export const YOGA_MENTION = 2.5;
const PM_NAME: Partial<Record<Planet, string>> = { Mars: 'Ruchaka', Mercury: 'Bhadra', Jupiter: 'Hamsa', Venus: 'Malavya', Saturn: 'Sasa' };

const cache = new Map<string, ChartAnalysis>();

/** Strength, functional nature, aspects and yogas of a birth chart. Memoized per birth data. */
export function analyzeChart(raw: BirthData): ChartAnalysis {
  const birthTime = raw.birthTime && VALID_TIME.test(raw.birthTime) ? raw.birthTime : null;
  const key = [raw.birthDate, birthTime ?? '', raw.birthLat ?? '', raw.birthLng ?? '', raw.birthTz ?? ''].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const p = { ...raw, birthTime };
  const pos = getChartPositions(p);
  const moonLon = getMoonLongitudeExact(p.birthDate, birthTime, p.birthLng, p.birthTz);
  const moonSign = Math.floor(moonLon / 30) % 12;
  const asc = getAscendantDegree(p.birthDate, birthTime, p.birthLat, p.birthLng, p.birthTz);
  const first = asc == null ? moonSign : Math.floor(asc / 30) % 12;
  const hasTime = !!birthTime && asc != null;
  const vargas = vargaCharts(p);
  const lon = {} as Record<Planet, number>;
  const retro = {} as Record<Planet, boolean>;
  for (const x of pos) { lon[x.name as Planet] = x.degree; retro[x.name as Planet] = x.retrograde; }
  const signs = {} as Record<Planet, number>;
  for (const pl of PLANETS) signs[pl] = Math.floor(norm(lon[pl]) / 30) % 12;
  const sunLon = lon.Sun;
  const moonWaxing = norm(lon.Moon - sunLon) < 180;
  const house = (pl: Planet) => houseFrom(first, signs[pl]);

  // Aspects and conjunctions received.
  const conj = (pl: Planet) => PLANETS.filter(o => o !== pl && signs[o] === signs[pl]);
  const aspBy = (pl: Planet) => PLANETS.filter(o => o !== pl && signs[o] !== signs[pl] && aspects(o, signs[o], signs[pl]));
  const asp = (pl: Planet) => PLANETS.filter(o => o !== pl && signs[o] !== signs[pl] && aspects(pl, signs[pl], signs[o]));

  const combust = {} as Record<Planet, ReturnType<typeof combustion>>;
  for (const pl of PLANETS) combust[pl] = combustion(pl, lon[pl], sunLon, pl !== 'Rahu' && pl !== 'Ketu' && retro[pl]);
  const isBenefic = (o: Planet) =>
    o === 'Jupiter' || o === 'Venus' || (o === 'Moon' && moonWaxing)
    || (o === 'Mercury' && !combust.Mercury.combust && ![6, 8, 12].includes(house('Mercury')));
  const isMalefic = (o: Planet) => ['Saturn', 'Mars', 'Rahu', 'Ketu', 'Sun'].includes(o);

  const d9 = (pl: Planet) => (vargas.charts.D9.planetStable[pl] ? vargas.charts.D9.planets[pl] : null);

  // Neecha bhanga (rules.md §9.7): any one of the classical conditions.
  const kendraFrom = (base: number, s: number) => [1, 4, 7, 10].includes(houseFrom(base, s));
  const inKendra = (o: Planet) => kendraFrom(first, signs[o]) || kendraFrom(moonSign, signs[o]);
  const neecha = (pl: Planet): boolean => {
    if (DEBIL_SIGN[pl] !== signs[pl]) return false;
    const ruler = SIGN_RULER[signs[pl]];
    if (inKendra(ruler)) return true;
    const exaltedHere = (Object.keys(EXALT_SIGN) as Planet[]).find(o => EXALT_SIGN[o] === signs[pl]);
    if (exaltedHere && inKendra(exaltedHere)) return true;
    const exaltRuler = EXALT_SIGN[pl] != null ? SIGN_RULER[EXALT_SIGN[pl]!] : null;
    if (exaltRuler && inKendra(exaltRuler)) return true;
    if (signs[ruler] === signs[pl] || aspects(ruler, signs[ruler], signs[pl])) return true;
    const n = d9(pl);
    return n != null && EXALT_SIGN[pl] === n;
  };

  const planets = {} as Record<Planet, PlanetInfo>;
  for (const pl of PLANETS) {
    const h = house(pl);
    const dig5 = dignity5(pl, lon[pl], signs);
    const nb = dig5 === 'debilitated' && neecha(pl);
    let s = nb ? 1 : DIGNITY_SCORE[dig5];
    const maleficPlanet = pl === 'Mars' || pl === 'Saturn' || pl === 'Rahu' || pl === 'Ketu';
    if (maleficPlanet && [3, 6, 11].includes(h)) s += 1;
    else if ([1, 4, 7, 10].includes(h)) s += 2;
    else if (h === 5 || h === 9) s += 1.5;
    else if (h === 11) s += 1;
    else if ([6, 8, 12].includes(h)) s -= 1.5;
    // Directional strength needs real houses (a birth time and place).
    const digBala = hasTime && DIG_BALA[pl] === h;
    if (digBala) s += 1;
    const n9 = d9(pl);
    const vargottama = n9 != null && n9 === signs[pl];
    if (vargottama) s += 1;
    if (n9 != null) s += 0.5 * d9Score(pl, n9);
    if (combust[pl].combust) s -= pl === 'Mercury' ? 0.5 : 2;
    const infl = [...conj(pl), ...aspBy(pl)];
    const ben = infl.filter(isBenefic);
    const mal = infl.filter(o => !ben.includes(o) && isMalefic(o));
    s += 0.5 * ben.length - 0.5 * mal.length;
    const r = pl !== 'Sun' && pl !== 'Moon' && pl !== 'Rahu' && pl !== 'Ketu' && retro[pl];
    if (r) s += 0.5;
    planets[pl] = {
      planet: pl, lon: lon[pl], sign: signs[pl], deg: norm(lon[pl]) - signs[pl] * 30, house: h,
      retrograde: pl === 'Rahu' || pl === 'Ketu' ? true : retro[pl],
      dignity: getPlanetDignity(pl, signs[pl]), dignity5: dig5,
      combust: combust[pl].combust, combustShown: combust[pl].shown, combustSep: combust[pl].sep,
      digBala, vargottama, d9: n9,
      conjunct: conj(pl), aspectedBy: aspBy(pl), aspecting: asp(pl),
      beneficInfluence: ben, maleficInfluence: mal, neechaBhanga: nb,
      rules: pl === 'Rahu' || pl === 'Ketu' ? [] : housesRuled(first, pl),
      functional: functionalNature(first, pl, SIGN_RULER[signs[pl]]),
      strength: Math.round(s * 100) / 100,
    };
  }
  const ranked = [...PLANETS].sort((a, b) => planets[b].strength - planets[a].strength || PLANETS.indexOf(a) - PLANETS.indexOf(b));
  const out: ChartAnalysis = {
    first, basis: asc == null ? 'moon' : 'rising', hasTime, moonSign, sunLon, moonWaxing, planets, ranked, vargas,
    yogas: [],
  };
  out.yogas = detectYogas(out);
  cache.set(key, out);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return out;
}

/** Lord of house `h` from the analysis' first house. */
export const lordOf = (a: Pick<ChartAnalysis, 'first'>, h: number): Planet => SIGN_RULER[(a.first + h - 1) % 12];

/** Two planets are linked: together, in mutual aspect, or in each other's sign. */
export function linked(a: ChartAnalysis, x: Planet, y: Planet): 'conjunct' | 'mutual' | 'exchange' | null {
  if (x === y) return null;
  const px = a.planets[x], py = a.planets[y];
  if (px.sign === py.sign) return 'conjunct';
  if (SIGN_RULER[px.sign] === y && SIGN_RULER[py.sign] === x) return 'exchange';
  if (aspects(x, px.sign, py.sign) && aspects(y, py.sign, px.sign)) return 'mutual';
  return null;
}

function yoga(a: ChartAnalysis, key: YogaKey, planets: Planet[], houses: number[], detail?: string, internal = false): Yoga {
  const strength = Math.min(...planets.map(p => a.planets[p].strength));
  return { key, planets, houses, strength, internal, mention: !internal && strength >= YOGA_MENTION, detail };
}

/** The conservative yoga set of rules.md §3.9 / §9.7. */
export function detectYogas(a: ChartAnalysis): Yoga[] {
  const out: Yoga[] = [];
  const P = a.planets;
  const H = (p: Planet) => P[p].house;
  const fromMoon = (p: Planet) => houseFrom(a.moonSign, P[p].sign);
  // Gajakesari: Jupiter in an angle from the Moon, not debilitated or combust.
  if ([1, 4, 7, 10].includes(fromMoon('Jupiter')) && P.Jupiter.dignity5 !== 'debilitated' && !P.Jupiter.combust) {
    out.push(yoga(a, 'gajakesari', ['Jupiter', 'Moon'], [1, H('Jupiter')]));
  }
  // Pancha Mahapurusha: own / moolatrikona / exalted in an angle from the lagna (the Moon without a birth time).
  for (const pl of ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as Planet[]) {
    const d = P[pl].dignity5;
    if ((d === 'own' || d === 'exalted' || d === 'moolatrikona') && [1, 4, 7, 10].includes(H(pl))) {
      out.push(yoga(a, 'mahapurusha', [pl], [1, H(pl)], PM_NAME[pl]));
    }
  }
  // Raja yoga: an angle lord and a trine lord (different planets) linked; or a yogakaraka in an angle or trine.
  const kendraLords = [...new Set([1, 4, 7, 10].map(h => lordOf(a, h)))];
  const trineLords = [...new Set([1, 5, 9].map(h => lordOf(a, h)))];
  const seen = new Set<string>();
  for (const k of kendraLords) {
    for (const t of trineLords) {
      if (k === t) continue;
      const how = linked(a, k, t);
      const id = [k, t].sort().join('+');
      if (!how || seen.has(id)) continue;
      seen.add(id);
      const hs = [...new Set([...P[k].rules.filter(h => [1, 4, 7, 10].includes(h)), ...P[t].rules.filter(h => [1, 5, 9].includes(h)), H(k), H(t)])];
      out.push(yoga(a, 'raja', [k, t], hs, how));
    }
  }
  for (const pl of SEVEN) {
    if (P[pl].functional === 'yogakaraka' && [1, 4, 5, 7, 9, 10].includes(H(pl))) {
      out.push(yoga(a, 'raja', [pl], [...P[pl].rules, H(pl)], 'yogakaraka'));
    }
  }
  // Dhana yoga: lords of 2 / 11 linked with lords of 1 / 5 / 9.
  const wealth = [...new Set([2, 11].map(h => lordOf(a, h)))];
  const luck = [...new Set([1, 5, 9].map(h => lordOf(a, h)))];
  const seenD = new Set<string>();
  for (const w of wealth) {
    for (const l of luck) {
      if (w === l) continue;
      const how = linked(a, w, l);
      const id = [w, l].sort().join('+');
      if (!how || seenD.has(id)) continue;
      seenD.add(id);
      out.push(yoga(a, 'dhana', [w, l], [2, 11, H(w), H(l)], how));
    }
  }
  // Viparita raja yoga: a lord of 6, 8 or 12 placed in 6, 8 or 12 (needs a real lagna).
  if (a.basis === 'rising') {
    for (const h of [6, 8, 12]) {
      const l = lordOf(a, h);
      if ([6, 8, 12].includes(H(l)) && !out.some(y => y.key === 'viparita' && y.planets[0] === l)) {
        out.push(yoga(a, 'viparita', [l], [h, H(l)]));
      }
    }
  }
  // Parivartana: two planets in each other's signs.
  for (let i = 0; i < SEVEN.length; i++) {
    for (let j = i + 1; j < SEVEN.length; j++) {
      const x = SEVEN[i], y = SEVEN[j];
      if (SIGN_RULER[P[x].sign] === y && SIGN_RULER[P[y].sign] === x) out.push(yoga(a, 'parivartana', [x, y], [H(x), H(y)]));
    }
  }
  // Neecha bhanga (softens a weakness; never promised as a raja yoga).
  for (const pl of SEVEN) if (P[pl].neechaBhanga) out.push(yoga(a, 'neechaBhanga', [pl], [H(pl), ...P[pl].rules]));
  // Internal only.
  if (P.Sun.sign === P.Mercury.sign) out.push(yoga(a, 'budhaditya', ['Sun', 'Mercury'], [H('Sun')], undefined, true));
  const around = (base: number, hs: number[]) => SEVEN.some(p => p !== 'Sun' && p !== 'Moon' && hs.includes(houseFrom(base, P[p].sign)));
  if (!around(a.moonSign, [2, 12]) && !around(a.moonSign, [1, 4, 7, 10]) && !around(a.first, [1, 4, 7, 10])) {
    out.push(yoga(a, 'kemadruma', ['Moon'], [H('Moon')], undefined, true));
  }
  return out;
}

/**
 * A multiplier around 1 from composite strength, for scoring links and
 * planner points: neutral strength (3) → 1, each point ± `perPoint`, clamped.
 */
export function strengthFactor(a: ChartAnalysis, p: Planet, perPoint = 0.04, lo = 0.8, hi = 1.25): number {
  return Math.min(hi, Math.max(lo, 1 + perPoint * (a.planets[p].strength - 3)));
}

/** Yogas worth naming whose houses touch any of `houses`. */
export function yogasFor(a: ChartAnalysis, houses: number[], keys?: YogaKey[]): Yoga[] {
  return a.yogas.filter(y => y.mention && (!keys || keys.includes(y.key)) && y.houses.some(h => houses.includes(h)));
}
