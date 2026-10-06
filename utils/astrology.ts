import { ZODIAC, PLANETS, NAKSHATRAS, DASHA_YEARS, ELEMENT_COLORS, type ZodiacSign, type Nakshatra } from '@/constants/astrology';
import { localDateIso } from './format';
import { civilToUtcMs } from './timezone';
import { dailyMotion, nutationInLongitude, tropicalLongitude, type Body } from './ephemeris';

export type { ZodiacSign, Nakshatra };

export type BigThree = {
  sun: ZodiacSign | null;
  moon: ZodiacSign | null;
  rising: ZodiacSign | null;
};

export type PlanetPosition = {
  name: string;
  glyph: string;
  degree: number;    // 0–360 ecliptic longitude
  signIndex: number; // 0–11
  degInSign: number; // 0–29 degrees within sign
  dignity: 'exalted' | 'debilitated' | 'own' | 'neutral';
  /** Daily motion in degrees (negative while retrograde). */
  speed: number;
  /** Apparent backward motion. Always true for the (mean) nodes Rahu/Ketu. */
  retrograde: boolean;
};

export type DashaInfo = {
  lord: string;
  startDate: string;
  endDate: string;
  yearsTotal: number;
};

export type FullKundli = {
  bigThree: BigThree;
  moonLon: number;
  ascDeg: number | null;
  rahuDeg: number;
  nakshatra: Nakshatra;
  dasha: DashaInfo;
  planets: PlanetPosition[];
};

/**
 * Birth data as the chart functions take it. `birthTime` is the civil clock
 * time at the birth place; `birthTz` is that place's IANA zone (e.g.
 * "Asia/Kolkata"), which fixes the UT instant including historical offsets
 * and daylight saving. Without a zone, the time is read as local mean time
 * from `birthLng` (longitude / 15°), and without either as UT.
 */
export type BirthData = {
  birthDate: string;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
  birthTz?: string | null;
};

// ─── Math helpers ─────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const NAK_SIZE = 360 / 27;

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Lahiri ayanamsa — the offset between tropical (Western) and sidereal
 * (Vedic) zodiacs. Indian astrology reads sign positions in SIDEREAL: moon
 * sign (rashi), nakshatra, planetary placements all need this correction
 * applied to the raw tropical ecliptic longitude.
 *
 * Mean Lahiri (Chitrapaksha) as Swiss Ephemeris SIDM_LAHIRI defines it,
 * fitted for 1880–2100 to < 0.001″: 23.857092° at J2000 + 1.396888°/century
 * + 0.000307°/century². (The earlier linear 23.85° + 50.27″/yr was 0.42′ low.)
 */
function lahiriAyanamsa(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  return 23.857092 + 1.396888 * T + 0.000307 * T * T;
}

/**
 * Convert a tropical ecliptic longitude to sidereal at the given JD.
 * `apparent` longitudes (Sun–Saturn from the ephemeris) carry nutation, which
 * comes out with the ayanamsa (true Lahiri = mean + Δψ); the mean node and
 * the mean-equinox ascendant do not.
 */
function toSidereal(tropicalLon: number, jd: number, apparent = false): number {
  return norm(tropicalLon - lahiriAyanamsa(jd) - (apparent ? nutationInLongitude(jd) : 0));
}

/**
 * Convert a local birth date + time to a continuous Julian Day (UT).
 *
 * `time` is the civil clock time at the birth place (e.g. "14:30" IST).
 * With `tz` (IANA zone) the zone's UTC offset at that moment is used —
 * historical offsets and DST included. Otherwise `lng` gives local mean time
 * (~15° per hour), and with neither the time is treated as UT.
 *
 * Julian Days are continuous, so a negative `ut` (e.g. early-morning local
 * birth that maps to the previous UT day) correctly produces a JD on the
 * earlier calendar day without any explicit rollback.
 */
function toJulianDay(date: string, time?: string | null, lng?: number | null, tz?: string | null): number {
  const [yr, mo, dy] = date.split('-').map(Number);
  const [h = 12, min = 0] = (time || '12:00').split(':').map(Number);
  if (tz) {
    const ms = civilToUtcMs(tz, yr, mo, dy, h, min);
    if (ms != null) return ms / 86400000 + 2440587.5;
  }
  let ut = h + min / 60;
  if (lng != null && Number.isFinite(lng)) {
    ut -= lng / 15;
  }
  const Y = mo <= 2 ? yr - 1 : yr;
  const M = mo <= 2 ? mo + 12 : mo;
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716))
       + Math.floor(30.6001 * (M + 1))
       + dy + B - 1524.5 + ut / 24;
}

/** Julian Day (UT) of a birth, using the same conversion as every chart function. */
export function birthJulianDay(p: BirthData): number {
  return toJulianDay(p.birthDate, p.birthTime, p.birthLng, p.birthTz);
}

/** UT instant of a birth as a Date (same conversion as birthJulianDay). */
export function birthInstant(p: BirthData): Date {
  return new Date(Math.round((birthJulianDay(p) - 2440587.5) * 86400000));
}

function julianCenturies(jd: number): number {
  return (jd - 2451545.0) / 36525;
}

/** SIDEREAL (Lahiri) geocentric longitude of a body at a Julian Day (UT). */
export function siderealLongitudeAt(body: Body, jd: number): number {
  return toSidereal(tropicalLongitude(body, jd), jd, body !== 'Rahu');
}

/** SIDEREAL (Lahiri) true Sun longitude at a local date/time — see toJulianDay for the time conventions. */
export function getSunLongitudeExact(date: string, time?: string | null, lng?: number | null, tz?: string | null): number {
  return siderealLongitudeAt('Sun', toJulianDay(date, time, lng, tz));
}

// ─── Dignity lookup tables (Vedic) ────────────────────────────────────────────

const EXALTATION: Record<string, number> = {
  Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6,
};
const DEBILITATION: Record<string, number> = {
  Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0,
};
const OWN_SIGNS: Record<string, number[]> = {
  Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5],
  Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10],
};

export function getPlanetDignity(planetName: string, signIndex: number): 'exalted' | 'debilitated' | 'own' | 'neutral' {
  if (EXALTATION[planetName] === signIndex) return 'exalted';
  if (DEBILITATION[planetName] === signIndex) return 'debilitated';
  if (OWN_SIGNS[planetName]?.includes(signIndex)) return 'own';
  return 'neutral';
}

// ─── Sun sign (Western, tropical) ────────────────────────────────────────────

/**
 * Western (tropical) Sun sign from the Sun's true longitude at birth — exact
 * on cusp days, unlike a fixed date table. Without a time, local noon is used.
 */
export function getSunSign(
  birthDate: string,
  birthTime?: string | null,
  birthLng?: number | null,
  birthTz?: string | null,
): ZodiacSign | null {
  if (!birthDate) return null;
  const [yr, mo, dy] = birthDate.split('-').map(Number);
  if (!yr || !mo || !dy) return null;
  const jd = toJulianDay(birthDate, birthTime, birthLng, birthTz);
  return ZODIAC[Math.floor(tropicalLongitude('Sun', jd) / 30) % 12];
}

// ─── Moon longitude (Meeus ch. 47, ~0.01°) ───────────────────────────────────

/**
 * Returns the moon's SIDEREAL ecliptic longitude (Lahiri ayanamsa applied),
 * which is what Vedic moon sign + nakshatra + dasha math expects.
 * Pass `birthTz` (IANA zone) whenever the profile has one — see BirthData.
 */
export function getMoonLongitudeExact(
  birthDate: string,
  birthTime?: string | null,
  birthLng?: number | null,
  birthTz?: string | null,
): number {
  return siderealLongitudeAt('Moon', toJulianDay(birthDate, birthTime, birthLng, birthTz));
}

export function getMoonSign(
  birthDate: string,
  birthTime?: string | null,
  birthLng?: number | null,
  birthTz?: string | null,
): ZodiacSign | null {
  if (!birthDate) return null;
  const moonLon = getMoonLongitudeExact(birthDate, birthTime, birthLng, birthTz);
  return ZODIAC[Math.floor(moonLon / 30)];
}

// ─── Rahu (mean lunar node) ───────────────────────────────────────────────────

export function getRahuDegree(
  birthDate: string,
  birthTime?: string | null,
  birthLng?: number | null,
  birthTz?: string | null,
): number {
  return siderealLongitudeAt('Rahu', toJulianDay(birthDate, birthTime, birthLng, birthTz));
}

// ─── Ascendant (via local sidereal time) ──────────────────────────────────────

export function getAscendantDegree(
  birthDate: string,
  birthTime?: string | null,
  birthLat?: number | null,
  birthLng?: number | null,
  birthTz?: string | null,
): number | null {
  if (!birthDate || !birthTime || birthLat == null || birthLng == null) return null;

  // birthTime is civil clock time at the birth place: convert to UT (zone
  // offset, or local mean time from the longitude), then take sidereal time
  // from the full UT JD.
  return ascendantAt(toJulianDay(birthDate, birthTime, birthLng, birthTz), birthLat, birthLng);
}

/** SIDEREAL (Lahiri) ascendant at a Julian Day (UT) and place. */
function ascendantAt(jd: number, birthLat: number, birthLng: number): number | null {
  const T  = julianCenturies(jd);

  const obliq = 23.4393 - 0.0130042 * T;
  const GMST  = norm(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T);
  const LST   = norm(GMST + birthLng);

  const R = LST * RAD;
  const E = obliq * RAD;
  const P = birthLat * RAD;

  // Meeus (Astronomical Algorithms, ch. 14): tan λ = −cos θ / (sin ε tan φ + cos ε sin θ).
  // The two solutions λ, λ+180° are where the ecliptic meets the horizon; the
  // ascendant is the one on the EASTERN side (hour angle 180°–360°). At
  // ordinary latitudes atan2 + 180° already lands there; inside the polar
  // circles it can land on the western point, so check explicitly.
  const y = -Math.cos(R);
  const x = Math.sin(E) * Math.tan(P) + Math.cos(E) * Math.sin(R);

  if (!isFinite(x) || !isFinite(y)) return null;
  let tropical = norm(Math.atan2(y, x) * DEG + 180);
  const L = tropical * RAD;
  const ra = Math.atan2(Math.sin(L) * Math.cos(E), Math.cos(L));
  if (Math.sin(R - ra) > 0) tropical = norm(tropical + 180);
  return toSidereal(tropical, jd);
}

export function getRisingSign(
  birthDate: string,
  birthTime?: string | null,
  birthLat?: number | null,
  birthLng?: number | null,
  birthTz?: string | null,
): ZodiacSign | null {
  const asc = getAscendantDegree(birthDate, birthTime, birthLat, birthLng, birthTz);
  if (asc === null) return null;
  return ZODIAC[Math.floor(asc / 30)];
}

// ─── Nakshatra (27 lunar mansions) ────────────────────────────────────────────

export function getNakshatra(moonLon: number): Nakshatra {
  const idx = Math.min(Math.floor(moonLon / NAK_SIZE), 26);
  return NAKSHATRAS[idx];
}

// ─── Vimshottari Mahadasha ────────────────────────────────────────────────────

const DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];

export function getCurrentMahadasha(moonLon: number, birthDate: string, now: Date = new Date()): DashaInfo {
  const nakIdx = Math.min(Math.floor(moonLon / NAK_SIZE), 26);
  const nakshatra = NAKSHATRAS[nakIdx];
  const lord = nakshatra.lord;

  const moonInNak = moonLon - nakshatra.startDeg;
  const fractionElapsed = Math.max(0, Math.min(1, moonInNak / NAK_SIZE));
  const yearsRemaining = DASHA_YEARS[lord] * (1 - fractionElapsed);

  const seqStart = DASHA_ORDER.indexOf(lord);
  const sequence = [...DASHA_ORDER.slice(seqStart), ...DASHA_ORDER.slice(0, seqStart)];

  const birth = new Date(birthDate + 'T00:00:00');
  const today = now;
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

  let cursor = new Date(birth);

  for (let i = 0; i < sequence.length; i++) {
    const dashaLord = sequence[i];
    const years = i === 0 ? yearsRemaining : DASHA_YEARS[dashaLord];

    const dashaStart = new Date(cursor);
    const dashaEnd   = new Date(cursor.getTime() + years * MS_PER_YEAR);

    if (today <= dashaEnd) {
      return {
        lord:       dashaLord,
        startDate:  localDateIso(dashaStart),
        endDate:    localDateIso(dashaEnd),
        yearsTotal: DASHA_YEARS[dashaLord],
      };
    }

    cursor = new Date(dashaEnd);
  }

  // Fallback (never reached for any living person)
  return {
    lord:       sequence[sequence.length - 1],
    startDate:  localDateIso(cursor),
    endDate:    localDateIso(cursor),
    yearsTotal: DASHA_YEARS[sequence[sequence.length - 1]],
  };
}

// ─── Vimshottari sub-periods (antardasha) ─────────────────────────────────────

export type DashaPeriod = { lord: string; start: Date; end: Date };

export type DashaTimeline = {
  maha:      DashaPeriod;   // current life phase
  antar:     DashaPeriod;   // current sub-period inside it
  nextAntar: DashaPeriod;   // the sub-period after this one
  nextMaha:  DashaPeriod;   // the life phase after this one
};

/**
 * Current and next Vimshottari periods. Each mahadasha divides into nine
 * antardashas in dasha order starting from its own lord, each lasting
 * mahaYears × antarYears / 120 years. The birth mahadasha is already partly
 * elapsed at birth, so its nominal start lies before the birth date.
 */
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function dashaPeriod(lord: string, start: Date, years: number): DashaPeriod {
  return { lord, start, end: new Date(start.getTime() + years * MS_PER_YEAR) };
}

/** The nine sub-periods of a life phase, in dasha order from its own lord. */
function dashaSubPeriods(maha: DashaPeriod): DashaPeriod[] {
  const out: DashaPeriod[] = [];
  let cursor = maha.start;
  const first = DASHA_ORDER.indexOf(maha.lord);
  for (let i = 0; i < DASHA_ORDER.length; i++) {
    const lord = DASHA_ORDER[(first + i) % DASHA_ORDER.length];
    const p = dashaPeriod(lord, cursor, DASHA_YEARS[maha.lord] * DASHA_YEARS[lord] / 120);
    out.push(p);
    cursor = p.end;
  }
  return out;
}

/** The life phase running at birth, with its nominal (pre-birth) start. */
function birthDasha(moonLon: number, birthDate: string): { idx: number; start: Date } {
  const nakIdx = Math.min(Math.floor(moonLon / NAK_SIZE), 26);
  const firstLord = NAKSHATRAS[nakIdx].lord;
  const fractionElapsed = Math.max(0, Math.min(1, (moonLon - NAKSHATRAS[nakIdx].startDeg) / NAK_SIZE));
  const birth = new Date(birthDate + 'T00:00:00');
  return {
    idx:   DASHA_ORDER.indexOf(firstLord),
    start: new Date(birth.getTime() - fractionElapsed * DASHA_YEARS[firstLord] * MS_PER_YEAR),
  };
}

export function getDashaTimeline(moonLon: number, birthDate: string, now: Date = new Date()): DashaTimeline {
  const atBirth = birthDasha(moonLon, birthDate);
  let mahaStart = atBirth.start;
  let mahaIdx = atBirth.idx;

  // Walk forward until the life phase containing `now` (two full cycles is
  // 240 years, far beyond any lifetime).
  for (let i = 0; i < 18; i++) {
    const lord = DASHA_ORDER[mahaIdx % DASHA_ORDER.length];
    const maha = dashaPeriod(lord, mahaStart, DASHA_YEARS[lord]);
    const nextLord = DASHA_ORDER[(mahaIdx + 1) % DASHA_ORDER.length];
    const nextMaha = dashaPeriod(nextLord, maha.end, DASHA_YEARS[nextLord]);
    if (now < maha.end) {
      const subs = dashaSubPeriods(maha);
      const k = Math.max(0, subs.findIndex(s => now < s.end));
      const nextAntar = k + 1 < subs.length ? subs[k + 1] : dashaSubPeriods(nextMaha)[0];
      return { maha, antar: subs[k], nextAntar, nextMaha };
    }
    mahaStart = maha.end;
    mahaIdx++;
  }
  // Unreachable for any living person; keep the type total.
  const lord = DASHA_ORDER[mahaIdx % DASHA_ORDER.length];
  const maha = dashaPeriod(lord, mahaStart, DASHA_YEARS[lord]);
  const subs = dashaSubPeriods(maha);
  return { maha, antar: subs[0], nextAntar: subs[1], nextMaha: maha };
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthYear(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "in 5 months", "in 2 years", "in 1 year 4 months", "now" (v2: "in under a month"). */
function relativeFrom(now: Date, d: Date, version: ContextVersion = 1): string {
  const months = Math.round((d.getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months <= 0) return version === 1 ? 'now' : 'in under a month';
  if (months < 12) return `in ${months} month${months === 1 ? '' : 's'}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const yPart = `${y} year${y === 1 ? '' : 's'}`;
  return m === 0 ? `in ${yPart}` : `in ${yPart} ${m} month${m === 1 ? '' : 's'}`;
}

/**
 * Ready-made timing for the on-device model, so it never has to do date
 * arithmetic: when the current sub-period and life phase change, as month +
 * year and relative to today. `version` follows getAstrologyContext.
 */
export function getTimingContext(
  profile: BirthData,
  now: Date = new Date(),
  version: ContextVersion = LATEST_CONTEXT_VERSION,
): string {
  // Malformed input (never from the app's own pickers) must not crash the chat.
  if (!VALID_DATE.test(profile.birthDate)) return 'Timing: unavailable (birth date unclear).';
  if (profile.birthTime && !VALID_TIME.test(profile.birthTime)) profile = { ...profile, birthTime: null };
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz);
  const t = getDashaTimeline(moonLon, profile.birthDate, now);
  // v2 uses the plain words the answers should use ("stretch" = antardasha,
  // "chapter" = mahadasha), so the model never echoes "sub-period" / "life phase".
  const [sub, nextSub, phase, nextPhase] = version === 1
    ? ['Current sub-period', 'Next sub-period', 'Current life phase', 'Next life phase']
    : ['Current stretch', 'Next stretch', 'Current chapter', 'Next chapter'];
  return [
    version === 1 ? `Timing (use these; never invent other dates):` : `Timing (never invent other dates):`,
    `- ${sub}: ${t.antar.lord}, ends ${monthYear(t.antar.end)} (${relativeFrom(now, t.antar.end, version)})`,
    `- ${nextSub}: ${t.nextAntar.lord}, ${monthYear(t.nextAntar.start)} to ${monthYear(t.nextAntar.end)}`,
    `- ${phase}: ${t.maha.lord}, ends ${monthYear(t.maha.end)} (${relativeFrom(now, t.maha.end, version)})`,
    `- ${nextPhase}: ${t.nextMaha.lord}, from ${monthYear(t.nextMaha.start)}`,
  ].join('\n');
}

// ─── Planet positions (true geocentric, utils/ephemeris.ts) ──────────────────

const BODY_OF: Record<string, Body> = {
  Sun: 'Sun', Moon: 'Moon', Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars',
  Jupiter: 'Jupiter', Saturn: 'Saturn', Rahu: 'Rahu', Ketu: 'Rahu',
};

/**
 * Sidereal (Lahiri) positions of the nine grahas at birth (or at any
 * date/time — transits call this with birthTime '12:00' and no place, i.e.
 * 12:00 UT). Sun–Saturn are true geocentric longitudes, so sign changes land
 * on the right day and retrograde loops are real; Rahu/Ketu are the mean node.
 */
export function getChartPositions(profile: BirthData): PlanetPosition[] {
  if (!profile.birthDate) return [];
  return positionsAt(birthJulianDay(profile));
}

/** Sidereal positions of the nine grahas at a Julian Day (UT). */
function positionsAt(jd: number): PlanetPosition[] {
  return PLANETS.map((p) => {
    const body = BODY_OF[p.name] ?? 'Sun';
    let degree = siderealLongitudeAt(body, jd);
    if (p.name === 'Ketu') degree = norm(degree + 180);
    // Ayanamsa changes ~0.00004°/day — irrelevant to the sign of the motion.
    const speed = dailyMotion(body, jd);

    const signIndex = Math.floor(degree / 30) % 12;
    const degInSign = Math.floor(degree % 30);
    const dignity   = getPlanetDignity(p.name, signIndex);

    return { name: p.name, glyph: p.glyph, degree, signIndex, degInSign, dignity, speed, retrograde: speed < 0 };
  });
}

/**
 * Mars' SIDEREAL geocentric ecliptic longitude (Lahiri). Same true position
 * getChartPositions() now uses; kept as its own export for the Manglik check.
 */
export function getMarsLongitudeTrue(
  birthDate: string,
  birthTime?: string | null,
  birthLng?: number | null,
  birthTz?: string | null,
): number {
  return siderealLongitudeAt('Mars', toJulianDay(birthDate, birthTime, birthLng, birthTz));
}

// ─── Full Kundli ──────────────────────────────────────────────────────────────

export function getBigThree(profile: BirthData): BigThree {
  return {
    sun:    getSunSign(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz),
    moon:   getMoonSign(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz),
    rising: getRisingSign(
      profile.birthDate,
      profile.birthTime,
      profile.birthLat,
      profile.birthLng,
      profile.birthTz,
    ),
  };
}

export function getFullKundli(profile: BirthData): FullKundli {
  const { birthDate, birthTime, birthLat, birthLng, birthTz } = profile;
  const moonLon   = getMoonLongitudeExact(birthDate, birthTime, birthLng, birthTz);
  const ascDeg    = getAscendantDegree(birthDate, birthTime, birthLat, birthLng, birthTz);
  const rahuDeg   = getRahuDegree(birthDate, birthTime, birthLng, birthTz);
  const nakshatra = getNakshatra(moonLon);
  const dasha     = getCurrentMahadasha(moonLon, birthDate);
  const bigThree  = getBigThree(profile);
  const planets   = getChartPositions(profile);

  return { bigThree, moonLon, ascDeg, rahuDeg, nakshatra, dasha, planets };
}

// ─── AI context string ────────────────────────────────────────────────────────

/**
 * Chart-context formats for the on-device model. A model only understands
 * the format it was trained on, so the app sends the version its bundled
 * model expects (CONTEXT_VERSION in utils/local-llm.ts) and
 * ml/data/gen_profiles.ts generates training data in the newest one.
 * - 1: astro-gemma-v1 — signs, nakshatra, mahadasha end, planet degrees.
 * - 2: adds whole-sign houses, life areas, today's transits, uncertainty notes.
 */
export type ContextVersion = 1 | 2;
export const LATEST_CONTEXT_VERSION: ContextVersion = 2;

export type ContextProfile = BirthData & {
  name: string;
  gender?: string | null;
  birthCity?: string | null;
  /** Free-text relationship to the user ("mother") for profiles that aren't the user (v2). */
  relationship?: string | null;
  /** False for someone the user added; undefined/true reads as the user themselves. */
  isYou?: boolean;
};

export type ContextOptions = {
  version?: ContextVersion;
  /** "Today" for transits and the v1 mahadasha line (default: now). */
  date?: Date;
};

function genderLine(gender: string | null | undefined): string | null {
  switch (gender) {
    case 'woman':       return 'Gender: woman (she/her). Traditional Vedic spouse karaka: Jupiter (signifies husband). Use she/her pronouns.';
    case 'man':         return 'Gender: man (he/him). Traditional Vedic spouse karaka: Venus (signifies wife). Use he/him pronouns.';
    case 'non_binary':  return 'Gender: non-binary. Use they/them pronouns. Skip gendered spouse-karaka conventions; read relationships in a partner-neutral way.';
    case 'unspecified': return null;  // user opted out — don't pass anything
    default:            return null;
  }
}

// ─── Plain-English chart facts for the model (v2) ─────────────────────────────
//
// The on-device model can't do chart math, so the context hands it houses,
// house rulers and transits already turned into everyday words. Houses are
// whole-sign from the sidereal ascendant (same as KundliChart): house n is the
// sign (ascSign + n − 1) mod 12. Without a birth time or place they're counted
// from the Moon sign (Chandra lagna). Meanings are deliberately classical and short.

/**
 * Everyday names for the twelve houses; the model says "your career house".
 * Short on purpose (each costs prompt tokens); the Life-area labels carry the
 * other meanings. Classical significations: 1 self/body, 2 money/family/speech, 3 effort/siblings/communication,
 * 4 home/mother/peace, 5 romance/children/creativity/study, 6 work/health/rivals,
 * 7 partner/marriage, 8 sudden change/hidden matters, 9 luck/father/beliefs,
 * 10 career/status, 11 gains/friends, 12 loss/rest/abroad/spirituality.
 */
const HOUSE_NAMES = [
  'self house', 'money house', 'effort house', 'home house', 'romance house', 'work and health house',
  'partnership house', 'change house', 'luck house', 'career house', 'gains house', 'abroad house',
];

/** Sign rulers (Vedic), indexed by sign 0–11. Rahu and Ketu rule no sign. */
const SIGN_RULER = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];

/** What a planet brings to the area it touches, in two or three plain words. */
const PLANET_FLAVOR: Record<string, string> = {
  Sun: 'pride, authority', Moon: 'feelings, care', Mars: 'drive, heat', Mercury: 'talk, skills',
  Jupiter: 'growth, blessings', Venus: 'love, comfort', Saturn: 'duty, slow but lasting',
  Rahu: 'big hunger, unusual paths', Ketu: 'detachment',
};

/** The Moon sign's emotional style. */
const MOON_STYLE = [
  'quick, fiery feelings', 'calm, steady feelings', 'restless, curious mind', 'deep, caring feelings',
  'proud, warm heart', 'careful, worrying mind', 'needs harmony', 'intense, private feelings',
  'hopeful, free spirit', 'serious, controlled feelings', 'independent, detached mind', 'soft, dreamy, sensitive',
];

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function dignityWord(p: PlanetPosition): string {
  return p.dignity === 'own' || p.dignity === 'exalted' ? 'strong' : p.dignity === 'debilitated' ? 'weak' : '';
}

/** Facts for each life area, built from whole-sign houses counted from `firstSign`. */
function lifeAreaLines(planets: PlanetPosition[], firstSign: number): string[] {
  const houseOf = (signIndex: number) => ((signIndex - firstSign + 12) % 12) + 1;
  const name = (h: number) => HOUSE_NAMES[h - 1];
  const byName = Object.fromEntries(planets.map(p => [p.name, p]));
  const seen = new Set<string>();
  // A planet's flavor is spelled out the first time it appears, then just named.
  const pl = (n: string) => {
    const strength = dignityWord(byName[n]);
    const notes = [seen.has(n) ? '' : PLANET_FLAVOR[n], strength].filter(Boolean).join('; ');
    seen.add(n);
    return notes ? `${n} (${notes})` : n;
  };
  const list = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

  // Planets whose house the current line already states, so a line never says it twice.
  let placed = new Set<string>();

  /**
   * "partnership house has Moon (feelings, care), its ruler Saturn (...) in career house".
   * `ruler: 'ifEmpty'` names the ruler only when nothing sits there; an
   * empty house with `ruler: false` contributes nothing.
   */
  const house = (h: number, ruler: boolean | 'ifEmpty' = true): string => {
    const lord = SIGN_RULER[(firstSign + h - 1) % 12];
    const all = planets.filter(p => houseOf(p.signIndex) === h).map(p => p.name);
    const occupants = all.filter(n => !placed.has(n));
    const parts: string[] = [];
    // The ruler sitting in its own house is said once: "has its ruler Mars (...)".
    if (occupants.length) parts.push(`${name(h)} has ${list(occupants.map(n => (n === lord ? 'its ruler ' : '') + pl(n)))}`);
    if (!all.includes(lord) && !placed.has(lord) && (ruler === true || (ruler === 'ifEmpty' && !all.length))) {
      parts.push(`${occupants.length ? 'its ruler' : name(h) + ' ruler'} ${pl(lord)} in ${name(houseOf(byName[lord].signIndex))}`);
      placed.add(lord);
    }
    occupants.forEach(n => placed.add(n));
    return parts.join(', ');
  };
  /** "Venus (love, comfort) in gains house", unless this line already placed it. */
  const planetIn = (n: string) => {
    if (placed.has(n)) return '';
    placed.add(n);
    return `${pl(n)} in ${name(houseOf(byName[n].signIndex))}`;
  };
  const line = (label: string, build: () => string[]) => {
    placed = new Set();
    return `- ${label}: ${build().filter(Boolean).join('; ')}`;
  };
  const moon = byName.Moon;

  return [
    line('Self/health', () => [house(1), house(6, false)]),
    line('Love/marriage', () => [house(7), planetIn('Venus')]),
    line('Career', () => [house(10), planetIn('Saturn'), planetIn('Sun')]),
    line('Money', () => [house(2), house(11, 'ifEmpty')]),
    line('Home/family', () => [house(4)]),
    line('Romance/children/study', () => [house(5)]),
    line('Abroad/spending/spiritual', () => [house(12)]),
    line('Mind', () => [`Moon in ${ZODIAC[moon.signIndex].name} (${MOON_STYLE[moon.signIndex]}${dignityWord(moon) ? ', ' + dignityWord(moon) : ''}) in ${name(houseOf(moon.signIndex))}`]),
    line('Growth/luck', () => [house(9), planetIn('Jupiter')]),
  ];
}

type SignChange = { from: number; to: number; date: Date };

/**
 * Sidereal sign changes of a slow body from `from` over `days`, each dated to
 * within an hour (2-day scan, then bisection). Includes retrograde re-entries.
 */
function signChanges(body: Body, from: Date, days: number): SignChange[] {
  const jd0 = from.getTime() / 86400000 + 2440587.5;
  const signAt = (jd: number) => Math.floor(siderealLongitudeAt(body, jd) / 30) % 12;
  const out: SignChange[] = [];
  let prev = signAt(jd0);
  for (let d = 2; d <= days; d += 2) {
    const sign = signAt(jd0 + d);
    if (sign === prev) continue;
    let lo = jd0 + d - 2, hi = jd0 + d;
    while (hi - lo > 1 / 24) {
      const mid = (lo + hi) / 2;
      if (signAt(mid) === prev) lo = mid; else hi = mid;
    }
    out.push({ from: prev, to: sign, date: new Date(Math.round((hi - 2440587.5) * 86400000)) });
    prev = sign;
  }
  return out;
}

/**
 * Where Saturn, Jupiter and Rahu are on `now`: house names as in Life areas,
 * good/hard notes from the natal Moon (classical gochara, sade sati).
 */
function transitLines(moonSign: number, firstSign: number, now: Date, your = 'your'): string[] {
  // The sky at the same instant the sign-change search starts from, so "now in"
  // and "moves into" agree on an ingress day.
  const sky = positionsAt(now.getTime() / 86400000 + 2440587.5);
  const at = (n: string) => sky.find(p => p.name === n)!;
  const fromMoon = (s: number) => ((s - moonSign + 12) % 12) + 1;
  // House names follow the Life areas (from the ascendant, else the Moon); the
  // Moon-relative count only drives the notes, so the model never sees two
  // different house numberings.
  const houseName = (sign: number) => HOUSE_NAMES[(sign - firstSign + 12) % 12];
  const where = (p: PlanetPosition) =>
    `in ${ZODIAC[p.signIndex].name}, ${your} ${houseName(p.signIndex)}${p.retrograde && p.name !== 'Rahu' ? ' (retro)' : ''}`;

  // Sade sati: Saturn in the 12th, 1st or 2nd sign from the natal Moon.
  // Also classical: 8th (ashtama shani) and 4th (kantaka/ardhashtama) are hard,
  // 3rd/6th/11th good.
  const sadeSati = (h: number) => h === 12 || h === 1 || h === 2;
  const sat = at('Saturn');
  const sh = fromMoon(sat.signIndex);
  const satNote =
    sh === 12 ? 'Sade sati: yes, first part; pressure builds, effort pays later' :
    sh === 1  ? 'Sade sati: yes, peak; heavy, slow, character-building' :
    sh === 2  ? 'Sade sati: yes, last part; weight lifting, watch spending' :
    sh === 8  ? 'Sade sati: no, but a heavy patch for health and sudden changes' :
    sh === 4  ? 'Sade sati: no, but home and peace of mind feel strained' :
    sh === 3 || sh === 6 || sh === 11 ? 'Sade sati: no; Saturn helps, effort brings results' :
    'Sade sati: no';
  /** What Saturn moving from sign `a` into sign `b` means for this Moon. */
  const satChange = (a: number, b: number) => {
    const ha = fromMoon(a), hb = fromMoon(b);
    return sadeSati(hb) ? (sadeSati(ha) ? 'sade sati continues' : 'sade sati begins')
      : sadeSati(ha) ? 'sade sati ends'
      : hb === 8 ? 'a heavy patch begins'
      : hb === 4 ? 'home feels strained'
      : [3, 6, 11].includes(hb) ? 'Saturn helps'
      : [4, 8].includes(ha) ? 'the heavy patch lifts' : 'steadier';
  };
  const jup = at('Jupiter');
  // Jupiter is supportive in the 2nd, 5th, 7th, 9th and 11th sign from the Moon.
  const jupGood = (s: number) => [2, 5, 7, 9, 11].includes(fromMoon(s));
  const jupNote = (_a: number, b: number) => jupGood(b) ? 'supportive, help and openings' : 'less supportive, growth takes effort';

  /**
   * The next sign change within `days`, with any retrograde back-and-forth:
   * " From around Jun 2027 it moves into Aries, your luck house (back in
   * Pisces Oct 2027 to Feb 2028); sade sati ends." (ml/data/teacher_prompts.py
   * quotes this "From around ... it moves into" wording.) Rahu always moves
   * backward through the signs, so its normal step is to the previous sign.
   */
  const next = (body: Body, days: number, note?: (a: number, b: number) => string) => {
    const changes = signChanges(body, now, days + 400);
    const c1 = changes[0];
    if (!c1 || c1.date.getTime() - now.getTime() > days * 86400000) return '';
    const step = body === 'Rahu' ? 11 : 1;
    const forward = c1.to === (c1.from + step) % 12;
    const c2 = changes[1], c3 = changes[2];
    const within = (c: SignChange | undefined, ref: SignChange) =>
      !!c && c.date.getTime() - ref.date.getTime() < 400 * 86400000;
    const sign = (s: number) => `${ZODIAC[s].name}, ${your} ${houseName(s)}`;
    const tail = (a: number, b: number) => (note ? '; ' + note(a, b) : '') + '.';
    if (forward) {
      // Into the next sign, possibly dipping back once before settling.
      const dip = within(c2, c1) && c2!.to === c1.from;
      const settle = dip && within(c3, c2!) && c3!.to === c1.to ? c3 : undefined;
      const dipText = !dip ? ''
        : settle ? ` (back in ${ZODIAC[c1.from].name} ${monthYear(c2!.date)} to ${monthYear(settle.date)})`
        : ` (back in ${ZODIAC[c1.from].name} from ${monthYear(c2!.date)})`;
      return ` From around ${monthYear(c1.date)} it moves into ${sign(c1.to)}${dipText}${tail(c1.from, c1.to)}`;
    }
    // Retrograde slip back into the previous sign, usually returning months later.
    const back = within(c2, c1) && c2!.to === c1.from ? c2 : undefined;
    return ` From around ${monthYear(c1.date)} it slips back into ${sign(c1.to)}${back ? ` until ${monthYear(back.date)}` : ''}${tail(c1.from, c1.to)}`;
  };
  return [
    `- Saturn ${where(sat)}. ${satNote}.${next('Saturn', 1100, satChange)}`,
    `- Jupiter ${where(jup)}; ${jupNote(jup.signIndex, jup.signIndex)}.${next('Jupiter', 400, jupNote)}`,
    `- Rahu ${where(at('Rahu'))}; restless push there.${next('Rahu', 600)}`,
  ];
}

/** HEAD-of-astro-gemma-v1 format. Kept byte-identical for the shipped model. */
function contextV1(profile: ContextProfile, now: Date): string {
  const kundli = getFullKundli(profile);
  const dasha = getCurrentMahadasha(kundli.moonLon, profile.birthDate, now);
  const lines: string[] = [
    `Reading for: ${profile.name}`,
    `Born: ${profile.birthDate}${profile.birthTime ? ' at ' + profile.birthTime : ''}${profile.birthCity ? ' in ' + profile.birthCity : ''}`,
  ];
  const gLine = genderLine(profile.gender);
  if (gLine) lines.push(gLine);
  // Sun sign is the Western (tropical) one users know; everything below is Vedic (sidereal).
  if (kundli.bigThree.sun)    lines.push(`Sun sign (Western): ${kundli.bigThree.sun.name} (${kundli.bigThree.sun.element})`);
  if (kundli.bigThree.moon)   lines.push(`Moon sign: ${kundli.bigThree.moon.name}`);
  if (kundli.bigThree.rising) lines.push(`Rising sign: ${kundli.bigThree.rising.name}`);
  lines.push(`Moon nakshatra: ${kundli.nakshatra.name} (lord: ${kundli.nakshatra.lord})`);
  lines.push(`Current Mahadasha: ${dasha.lord} (until ${dasha.endDate})`);
  const planetSummary = kundli.planets
    .map(p => `${p.name} in ${ZODIAC[p.signIndex].name} ${p.degInSign}°${p.dignity !== 'neutral' ? ' [' + p.dignity + ']' : ''}`)
    .join(', ');
  if (planetSummary) lines.push(`Planets (Vedic): ${planetSummary}`);
  return lines.join('\n');
}

/** v2: pronouns only; the spouse-karaka note cost ~20 tokens for little use. */
function genderLineV2(gender: string | null | undefined): string | null {
  switch (gender) {
    case 'woman':      return 'Gender: woman (she/her).';
    case 'man':        return 'Gender: man (he/him).';
    case 'non_binary': return 'Gender: non-binary (they/them).';
    default:           return null;  // unspecified / unknown: no gendered assumptions
  }
}

/**
 * v2: "Age: 34", in whole years on `now` (local calendar). A 270M model can't
 * subtract dates, and minors need different answers (no marriage timing).
 */
function ageLine(birthDate: string, now: Date): string | null {
  const [y, m, d] = birthDate.split('-').map(Number);
  const age = now.getFullYear() - y - ((now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) ? 1 : 0);
  if (!(age >= 0)) return null;  // born after "today"
  return age < 18
    ? `Age: ${age} (minor: talk about studies, family, growth; no marriage/romance timing)`
    : `Age: ${age}`;
}

function contextV2(raw: ContextProfile, now: Date): string {
  // A malformed time reads as "unknown" rather than poisoning every position with NaN.
  const profile: ContextProfile = { ...raw, birthTime: raw.birthTime && VALID_TIME.test(raw.birthTime) ? raw.birthTime : null };
  const hasPlace = profile.birthLat != null && profile.birthLng != null
    && Number.isFinite(profile.birthLat) && Number.isFinite(profile.birthLng);
  const rel = profile.relationship?.trim();
  const who = profile.isYou === false ? ` (the user's ${rel || 'family member or friend'}, not the user)` : '';
  const lines: string[] = [
    `Reading for: ${profile.name}${who}`,
    `Born: ${profile.birthDate}${profile.birthTime ? ' at ' + profile.birthTime : ''}${profile.birthCity ? ' in ' + profile.birthCity : ''}`,
  ];
  if (!VALID_DATE.test(profile.birthDate) || !Number.isFinite(birthJulianDay(profile))) {
    const gLine = genderLineV2(profile.gender);
    if (gLine) lines.push(gLine);
    return lines.join('\n');
  }
  const aLine = ageLine(profile.birthDate, now);
  if (aLine) lines.push(aLine);
  const gLine = genderLineV2(profile.gender);
  if (gLine) lines.push(gLine);

  const kundli = getFullKundli(profile);
  const { sun, moon, rising } = kundli.bigThree;
  const moonSign = Math.floor(kundli.moonLon / 30) % 12;

  // Without a birth time the chart is cast for local noon; without a place the
  // time is read as UT. Say which Moon sign / nakshatra the real moment could
  // give instead (the Moon moves ~13° a day, about one nakshatra).
  let window: [number, number] | null = null;
  if (!profile.birthTime) {
    window = [birthJulianDay({ ...profile, birthTime: '00:00' }), birthJulianDay({ ...profile, birthTime: '23:59' })];
  } else if (!profile.birthTz && !hasPlace) {
    const jd = birthJulianDay(profile);
    window = [jd - 14 / 24, jd + 12 / 24];  // any civil offset UTC−12…+14
  }
  const moonAt = (jd: number) => siderealLongitudeAt('Moon', jd);
  const alt = <T,>(f: (lon: number) => T, cur: T): T[] => {
    if (!window) return [];
    const xs = [window[0], (window[0] + window[1]) / 2, window[1]].map(jd => f(moonAt(jd)));
    return [...new Set(xs)].filter(x => x !== cur);
  };
  const altSigns = alt(lon => Math.floor(lon / 30) % 12, moonSign);
  const altNaks = alt(lon => getNakshatra(lon).name, kundli.nakshatra.name);
  const unsure = profile.birthTime ? 'birth place unknown' : 'birth time unknown';

  // Sun sign is the Western (tropical) one users know; everything below is Vedic (sidereal).
  if (sun) lines.push(`Sun sign (Western): ${sun.name} (${sun.element})`);
  if (moon) lines.push(`Moon sign: ${moon.name}${altSigns.length ? ` (${unsure}: could be ${altSigns.map(s => ZODIAC[s].name).join(' or ')})` : ''}`);
  let ascSign: number | null = null;
  if (rising && kundli.ascDeg != null) {
    ascSign = Math.floor(kundli.ascDeg / 30) % 12;
    // Lagna moves ~1° every 4 minutes: flag charts where ±5 minutes changes it.
    const jd = birthJulianDay(profile);
    const near = [-5, 5]
      .map(m => ascendantAt(jd + m / 1440, profile.birthLat!, profile.birthLng!))
      .map(d => (d == null ? ascSign! : Math.floor(d / 30) % 12))
      .filter(s => s !== ascSign);
    lines.push(`Rising sign: ${rising.name}${near.length ? ` (near the ${ZODIAC[near[0]].name} border: a few minutes' error in birth time would change it and the houses)` : ''}`);
  }
  lines.push(`Moon nakshatra: ${kundli.nakshatra.name} (lord: ${kundli.nakshatra.lord})${altNaks.length ? ` (${unsure}: could be ${altNaks.join(' or ')}, so timing is approximate)` : ''}`);

  // Whole-sign houses from the ascendant, or from the Moon without one.
  const firstSign = ascSign ?? moonSign;
  const planetSummary = kundli.planets
    .map(p => {
      const notes = [ordinal(((p.signIndex - firstSign + 12) % 12) + 1), p.dignity !== 'neutral' ? p.dignity : '',
        p.retrograde && p.name !== 'Rahu' && p.name !== 'Ketu' ? 'retro' : ''].filter(Boolean).join(' ');
      return `${p.name} ${ZODIAC[p.signIndex].name} ${notes}`;
    })
    .join(', ');
  lines.push(`Planets (sign, house${ascSign != null ? '' : ' from Moon'}): ${planetSummary}`);
  const noAsc = !profile.birthTime ? 'birth time unknown' : !hasPlace ? 'birth place unknown' : 'no rising sign';
  lines.push(ascSign != null ? 'Life areas:' : `Life areas (${noAsc}, so houses are counted from the Moon):`);
  lines.push(...lifeAreaLines(kundli.planets, firstSign));
  lines.push(`Now (sky today):`);
  // Another person's chart: "their career house", so the model doesn't read it as the user's.
  lines.push(...transitLines(moonSign, firstSign, now, profile.isYou === false ? 'their' : 'your'));
  return lines.join('\n');
}

/**
 * Chart text for the on-device model's system prompt (utils/ai.ts) and its
 * training data (ml/data/gen_profiles.ts). Pass the `version` the model was
 * trained on; `date` is "today" for transits and timing.
 */
export function getAstrologyContext(profile: ContextProfile, opts: ContextOptions = {}): string {
  const { version = LATEST_CONTEXT_VERSION, date = new Date() } = opts;
  return version === 1 ? contextV1(profile, date) : contextV2(profile, date);
}

// ─── Lunar phase (approximate, Synodic period) ────────────────────────────────

export function getLunarPhase(dateIso: string): string {
  const jd = toJulianDay(dateIso, '12:00');
  // Fraction of the lunation from the true Sun–Moon elongation (0 = new, 0.5 = full).
  const f = norm(tropicalLongitude('Moon', jd) - tropicalLongitude('Sun', jd)) / 360;
  if (f < 0.03 || f > 0.97) return 'New Moon';
  if (f < 0.22) return 'Waxing Crescent';
  if (f < 0.28) return 'First Quarter';
  if (f < 0.47) return 'Waxing Gibbous';
  if (f < 0.53) return 'Full Moon';
  if (f < 0.72) return 'Waning Gibbous';
  if (f < 0.78) return 'Last Quarter';
  return 'Waning Crescent';
}

// ─── Today's planetary transits ───────────────────────────────────────────────

export function getTodayTransits(): { name: string; signName: string; degInSign: number }[] {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  const positions = getChartPositions({ birthDate: today, birthTime: '12:00' });
  return positions
    .filter(p => !p.name.match(/^(Rahu|Ketu)$/))
    .map(p => ({ name: p.name, signName: ZODIAC[p.signIndex].name, degInSign: p.degInSign }));
}

// ─── Life chapters (for the life-phase screen) ───────────────────────────────

/** Plain-English meaning of each planet as a life chapter and as a sub-period. */
export const PHASE_MEANINGS: Record<string, { chapter: string; sub: string }> = {
  Sun:     { chapter: 'Visibility and authority. A time to step forward, lead and be seen.',
             sub:     'Recognition, and some friction with people in charge.' },
  Moon:    { chapter: 'Feelings, home and family come first. Life moves with the people closest to you.',
             sub:     'Emotional and family-focused. Home matters more.' },
  Mars:    { chapter: 'Energy, courage and drive. You push hard and things move fast.',
             sub:     'Energy to act. Move, but watch your temper.' },
  Rahu:    { chapter: 'Big appetite, unusual paths. Ambition pulls you toward the new, and fast rises are possible if you stay grounded.',
             sub:     'Restless and hungry for change. New directions open, not all of them lasting.' },
  Jupiter: { chapter: 'Growth, learning and good fortune. Teachers, mentors and opportunities show up.',
             sub:     'Support and growth. Good advice and open doors.' },
  Saturn:  { chapter: 'Slow, steady building. Effort counts for more than luck, and what you build now lasts.',
             sub:     'Hard work that pays later. Progress feels slow, but what you build now holds.' },
  Mercury: { chapter: 'Skills, talk and trade. A good time to learn, write, sell and connect.',
             sub:     'Lighter and quicker. Good for study, deals and new connections.' },
  Ketu:    { chapter: 'Letting go and turning inward. Less about getting, more about understanding.',
             sub:     'A quieter time to finish things and let go.' },
  Venus:   { chapter: 'Love, comfort and beauty. Relationships, money and enjoyment come forward.',
             sub:     'Love, comfort and money come forward.' },
};

export type LifeChapters = {
  /** Life phases from the one running at birth through age `untilAge`. */
  chapters:     DashaPeriod[];
  currentIndex: number;
  /** 0..1 through the current life phase. */
  progress:     number;
  /** Sub-periods of the current life phase, and which one is running. */
  subs:         DashaPeriod[];
  currentSub:   number;
  /** The next few changes: sub-periods, then the next life phase. */
  upcoming:     { kind: 'sub' | 'chapter'; period: DashaPeriod }[];
  /** Age in years now, and the span the chapters cover. */
  ageNow:       number;
  untilAge:     number;
};

export function getLifeChapters(
  profile: BirthData,
  now: Date = new Date(),
  untilAge = 90,
): LifeChapters {
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz);
  const birth = new Date(profile.birthDate + 'T00:00:00');
  const lastDay = new Date(birth.getTime() + untilAge * MS_PER_YEAR);

  const chapters: DashaPeriod[] = [];
  let { idx, start } = birthDasha(moonLon, profile.birthDate);
  while (start < lastDay) {
    const lord = DASHA_ORDER[idx % DASHA_ORDER.length];
    const p = dashaPeriod(lord, start, DASHA_YEARS[lord]);
    chapters.push(p);
    start = p.end;
    idx++;
  }

  const currentIndex = Math.max(0, chapters.findIndex((c) => now < c.end));
  const current = chapters[currentIndex];
  const progress = Math.min(1, Math.max(0,
    (now.getTime() - current.start.getTime()) / (current.end.getTime() - current.start.getTime())));
  const subs = dashaSubPeriods(current);
  const currentSub = Math.max(0, subs.findIndex((s) => now < s.end));

  const upcoming: LifeChapters['upcoming'] = subs
    .slice(currentSub + 1, currentSub + 3)
    .map((period) => ({ kind: 'sub' as const, period }));
  const next = chapters[currentIndex + 1];
  if (next) upcoming.push({ kind: 'chapter', period: next });

  return {
    chapters, currentIndex, progress, subs, currentSub, upcoming,
    ageNow: (now.getTime() - birth.getTime()) / MS_PER_YEAR,
    untilAge,
  };
}
