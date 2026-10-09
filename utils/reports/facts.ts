/**
 * Chart facts for the reports (utils/reports/*). Pure: chart math only, no
 * React Native, no i18n, so Node tests can load it.
 *
 * Houses are whole-sign from the sidereal ascendant, as in the model context
 * (utils/astrology.ts lifeAreaLines) and KundliChart. Without a birth time or
 * place there is no ascendant, so houses are counted from the Moon sign
 * (Chandra lagna) and the report says so.
 *
 * Timing comes from the same helpers as the Life chapters, Year ahead and
 * Sade sati screens: getLifeChapters / subPeriodsOf (Vimshottari), signChanges
 * (Jupiter, Saturn, Rahu sign changes, retrograde-aware) and getSadeSati.
 */
import {
  getAscendantDegree,
  getChartPositions,
  getLifeChapters,
  getMoonLongitudeExact,
  siderealLongitudeAt,
  signChanges,
  type DashaPeriod,
} from '../astrology';
import { subPeriodsOf } from '../forecast';
import { getSadeSati, type SadeSatiPhase } from '../sade-sati';
import { jdFromDate } from '../sun';
import { ageOn } from '../guru-context';

export const PLANET_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const;
export type PlanetName = (typeof PLANET_ORDER)[number];

export const SLOW_PLANETS = ['Jupiter', 'Saturn', 'Rahu'] as const;
export type SlowPlanet = (typeof SLOW_PLANETS)[number];

export type Element = 'fire' | 'earth' | 'air' | 'water';
export const ELEMENTS: readonly Element[] = ['fire', 'earth', 'air', 'water'];
export const elementOf = (sign: number): Element => ELEMENTS[((sign % 12) + 12) % 4];

/** Vedic sign rulers, by sign 0 (Aries) … 11 (Pisces). */
export const SIGN_RULER: readonly PlanetName[] = [
  'Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter',
];

/** Timing window for the reports: about three years from today. */
export const HORIZON_DAYS = 3 * 365 + 1;
/** The next life chapter is listed when it starts within this many years. */
export const NEXT_CHAPTER_YEARS = 6;

const DAY_MS = 86400000;
const YEAR_MS = 365.25 * DAY_MS;

export type Dignity = 'exalted' | 'debilitated' | 'own' | 'neutral';

export type PlanetFact = {
  name: PlanetName;
  sign: number;
  /** Whole-sign house from the first house (ascendant, else the Moon). */
  house: number;
  dignity: Dignity;
  retrograde: boolean;
};

export type Ingress = {
  planet: SlowPlanet;
  date: Date;
  from: number;
  to: number;
  /** Houses (from the first house) left and entered. */
  fromHouse: number;
  toHouse: number;
  /** Houses counted from the natal Moon (sade sati logic). */
  fromMoonHouse: number;
  toMoonHouse: number;
};

export type TransitNow = {
  planet: SlowPlanet;
  sign: number;
  house: number;
  moonHouse: number;
  /** First sign change after today (any direction), within the horizon. */
  until: Date | null;
};

export type SadeFacts = {
  active: boolean;
  phase: SadeSatiPhase | null;
  /** Main end of the running period (or the end of a brief return). */
  end: Date | null;
  /** Start of the next period, if one begins after today. */
  nextStart: Date | null;
};

export type BirthProfile = {
  id?: string;
  name?: string;
  birthDate: string;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
  birthTz?: string | null;
  gender?: string | null;
  isYou?: boolean;
};

export type ChartFacts = {
  now: Date;
  age: number | null;
  minor: boolean;
  hasTime: boolean;
  hasPlace: boolean;
  /** 'rising' when houses come from the ascendant, else 'moon'. */
  basis: 'rising' | 'moon';
  ascSign: number | null;
  moonSign: number;
  moonLon: number;
  /** Sign of the first house (ascendant or Moon). */
  first: number;
  planets: Record<PlanetName, PlanetFact>;
  dasha: {
    maha: DashaPeriod;
    antar: DashaPeriod;
    /** Sub-periods that overlap [now, now + horizon], in order (the running one first). */
    ahead: DashaPeriod[];
    /** Next life chapter, if it starts within NEXT_CHAPTER_YEARS. */
    nextMaha: DashaPeriod | null;
  };
  transits: Record<SlowPlanet, TransitNow>;
  /** First entry of each slow planet into each new sign within the horizon. */
  ingresses: Ingress[];
  sade: SadeFacts;
  /** Sade sati starts / ends within the horizon. */
  sadeEvents: { kind: 'start' | 'end'; date: Date }[];
};

export const houseOf = (first: number, sign: number) => ((sign - first + 12) % 12) + 1;

/** Ruler of house `h` (1–12) counted from `first`. */
export function lordOf(f: Pick<ChartFacts, 'first'>, h: number): PlanetName {
  return SIGN_RULER[(f.first + h - 1) % 12];
}

/** Planets in house `h`, in PLANET_ORDER. */
export function occupants(f: Pick<ChartFacts, 'planets'>, h: number): PlanetName[] {
  return PLANET_ORDER.filter((p) => f.planets[p].house === h);
}

export function isStrong(p: PlanetFact): boolean {
  return p.dignity === 'own' || p.dignity === 'exalted';
}

const VALID_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * Stable hash of everything a report depends on: the birth details (the
 * chart), gender (partner matching order) and the name (it appears in the
 * text). The reports cache is keyed by it, so editing a profile invalidates.
 */
export function chartHash(p: BirthProfile): string {
  const s = [p.birthDate, p.birthTime ?? '', p.birthLat ?? '', p.birthLng ?? '', p.birthTz ?? '', p.gender ?? '', p.name ?? ''].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const cache = new Map<string, ChartFacts>();
const CACHE_MAX = 12;

/** Local calendar day key: facts are recomputed once a day. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Everything the reports read from a chart, as of `now`. Memoized per chart
 * and local day (the slow-planet scans cost a few tens of milliseconds).
 */
export function getChartFacts(profile: BirthProfile, now: Date = new Date()): ChartFacts {
  const key = `${chartHash(profile)}@${dayKey(now)}@${now.getHours() < 12 ? 'am' : 'pm'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const value = computeFacts(profile, now);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return value;
}

function computeFacts(raw: BirthProfile, now: Date): ChartFacts {
  const birthTime = raw.birthTime && VALID_TIME.test(raw.birthTime) ? raw.birthTime : null;
  const profile = { ...raw, birthTime };
  const hasTime = !!birthTime;
  const hasPlace = profile.birthLat != null && profile.birthLng != null
    && Number.isFinite(profile.birthLat) && Number.isFinite(profile.birthLng);
  const moonLon = getMoonLongitudeExact(profile.birthDate, birthTime, profile.birthLng, profile.birthTz);
  const moonSign = Math.floor(moonLon / 30) % 12;
  const asc = getAscendantDegree(profile.birthDate, birthTime, profile.birthLat, profile.birthLng, profile.birthTz);
  const ascSign = asc == null ? null : Math.floor(asc / 30) % 12;
  const first = ascSign ?? moonSign;

  const planets = {} as Record<PlanetName, PlanetFact>;
  for (const p of getChartPositions(profile)) {
    const name = p.name as PlanetName;
    planets[name] = {
      name,
      sign: p.signIndex,
      house: houseOf(first, p.signIndex),
      dignity: p.dignity,
      retrograde: p.retrograde && name !== 'Rahu' && name !== 'Ketu',
    };
  }

  // ─── Dasha ────────────────────────────────────────────────────────────────
  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * DAY_MS);
  const life = getLifeChapters(profile, now, 120);
  const maha = life.chapters[life.currentIndex];
  const antar = life.subs[life.currentSub];
  const ahead: DashaPeriod[] = [];
  for (let i = life.currentIndex; i < life.chapters.length; i++) {
    const c = life.chapters[i];
    if (c.start >= horizonEnd) break;
    for (const s of subPeriodsOf(c)) if (s.end > now && s.start < horizonEnd) ahead.push(s);
  }
  const nm = life.chapters[life.currentIndex + 1];
  const nextMaha = nm && nm.start.getTime() - now.getTime() < NEXT_CHAPTER_YEARS * YEAR_MS ? nm : null;

  // ─── Slow planets ─────────────────────────────────────────────────────────
  const jd = jdFromDate(now);
  const ingresses: Ingress[] = [];
  const transits = {} as Record<SlowPlanet, TransitNow>;
  for (const planet of SLOW_PLANETS) {
    const sign = Math.floor(siderealLongitudeAt(planet, jd) / 30) % 12;
    const changes = signChanges(planet, now, HORIZON_DAYS);
    transits[planet] = {
      planet, sign,
      house: houseOf(first, sign),
      moonHouse: houseOf(moonSign, sign),
      until: changes[0]?.date ?? null,
    };
    // First entry into each new sign only (a retrograde slip back into a sign
    // already visited, or a re-entry after one, isn't news): same rule as
    // findSlowSignChanges in utils/forecast.ts.
    const entered = new Set<number>([sign]);
    for (const c of changes) {
      if (entered.has(c.to)) continue;
      entered.add(c.to);
      ingresses.push({
        planet, date: c.date, from: c.from, to: c.to,
        fromHouse: houseOf(first, c.from), toHouse: houseOf(first, c.to),
        fromMoonHouse: houseOf(moonSign, c.from), toMoonHouse: houseOf(moonSign, c.to),
      });
    }
  }
  ingresses.sort((a, b) => a.date.getTime() - b.date.getTime());

  // ─── Sade sati ────────────────────────────────────────────────────────────
  const age = ageOn(profile.birthDate, now);
  const ss = getSadeSati(profile, now, Math.max(1, (age ?? 0) + 6));
  const cur = ss.currentIndex >= 0 ? ss.periods[ss.currentIndex] : null;
  const next = ss.nextIndex >= 0 ? ss.periods[ss.nextIndex] : null;
  const sade: SadeFacts = {
    active: !!cur && (ss.phase != null),
    phase: ss.phase,
    end: cur ? (ss.inReturn ? cur.finalEnd : cur.end) : null,
    nextStart: next?.start ?? null,
  };
  const sadeEvents: ChartFacts['sadeEvents'] = [];
  for (const p of ss.periods) {
    if (p.start > now && p.start < horizonEnd) sadeEvents.push({ kind: 'start', date: p.start });
    if (p.end > now && p.end < horizonEnd) sadeEvents.push({ kind: 'end', date: p.end });
  }

  return {
    now, age, minor: age != null && age < 18,
    hasTime, hasPlace: !!hasPlace,
    basis: ascSign == null ? 'moon' : 'rising',
    ascSign, moonSign, moonLon, first, planets,
    dasha: { maha, antar, ahead, nextMaha },
    transits, ingresses, sade, sadeEvents,
  };
}
