import { ZODIAC, PLANETS, NAKSHATRAS, DASHA_YEARS, ELEMENT_COLORS, type ZodiacSign, type Nakshatra } from '@/constants/astrology';
import { localDateIso } from './format';
import { civilToUtcMs } from './timezone';
import { dailyMotion, tropicalLongitude, type Body } from './ephemeris';

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
 * Approximation: Lahiri value at JD 2451545.0 (Jan 1 2000) is 23.85°, with
 * precession adding ~50.27"/year ≈ 0.01396°/year. Accurate to a few
 * arc-minutes for the next century — well inside Vedic chart tolerance.
 */
function lahiriAyanamsa(jd: number): number {
  const yearsFromJ2000 = (jd - 2451545.0) / 365.25;
  return 23.85 + yearsFromJ2000 * (50.27 / 3600);
}

/** Convert a tropical ecliptic longitude to sidereal at the given JD. */
function toSidereal(tropicalLon: number, jd: number): number {
  return norm(tropicalLon - lahiriAyanamsa(jd));
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
  return toSidereal(tropicalLongitude(body, jd), jd);
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
  const jd = toJulianDay(birthDate, birthTime, birthLng, birthTz);
  const T  = julianCenturies(jd);

  const obliq = 23.4393 - 0.0130042 * T;
  const GMST  = norm(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T);
  const LST   = norm(GMST + birthLng);

  const R = LST * RAD;
  const E = obliq * RAD;
  const P = birthLat * RAD;

  // Meeus (Astronomical Algorithms, ch. 14): tan λ = −cos θ / (sin ε tan φ + cos ε sin θ).
  // atan2 of the raw pair lands on the descendant; +180° gives the rising point.
  const y = -Math.cos(R);
  const x = Math.sin(E) * Math.tan(P) + Math.cos(E) * Math.sin(R);

  if (!isFinite(x) || !isFinite(y)) return null;
  const tropical = norm(Math.atan2(y, x) * DEG + 180);
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

export function getCurrentMahadasha(moonLon: number, birthDate: string): DashaInfo {
  const nakIdx = Math.min(Math.floor(moonLon / NAK_SIZE), 26);
  const nakshatra = NAKSHATRAS[nakIdx];
  const lord = nakshatra.lord;

  const moonInNak = moonLon - nakshatra.startDeg;
  const fractionElapsed = Math.max(0, Math.min(1, moonInNak / NAK_SIZE));
  const yearsRemaining = DASHA_YEARS[lord] * (1 - fractionElapsed);

  const seqStart = DASHA_ORDER.indexOf(lord);
  const sequence = [...DASHA_ORDER.slice(seqStart), ...DASHA_ORDER.slice(0, seqStart)];

  const birth = new Date(birthDate + 'T00:00:00');
  const today = new Date();
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

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthYear(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "in 5 months", "in 2 years", "in 1 year 4 months", "now". */
function relativeFrom(now: Date, d: Date): string {
  const months = Math.round((d.getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months <= 0) return 'now';
  if (months < 12) return `in ${months} month${months === 1 ? '' : 's'}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const yPart = `${y} year${y === 1 ? '' : 's'}`;
  return m === 0 ? `in ${yPart}` : `in ${yPart} ${m} month${m === 1 ? '' : 's'}`;
}

/**
 * Ready-made timing for the on-device model, so it never has to do date
 * arithmetic: when the current sub-period and life phase change, as month +
 * year and relative to today.
 */
export function getTimingContext(
  profile: BirthData,
  now: Date = new Date(),
): string {
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz);
  const t = getDashaTimeline(moonLon, profile.birthDate, now);
  return [
    `Timing (use these; never invent other dates):`,
    `- Current sub-period: ${t.antar.lord}, ends ${monthYear(t.antar.end)} (${relativeFrom(now, t.antar.end)})`,
    `- Next sub-period: ${t.nextAntar.lord}, ${monthYear(t.nextAntar.start)} to ${monthYear(t.nextAntar.end)}`,
    `- Current life phase: ${t.maha.lord}, ends ${monthYear(t.maha.end)} (${relativeFrom(now, t.maha.end)})`,
    `- Next life phase: ${t.nextMaha.lord}, from ${monthYear(t.nextMaha.start)}`,
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

  const jd = birthJulianDay(profile);

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

function genderLine(gender: string | null | undefined): string | null {
  switch (gender) {
    case 'woman':       return 'Gender: woman (she/her). Traditional Vedic spouse karaka: Jupiter (signifies husband). Use she/her pronouns.';
    case 'man':         return 'Gender: man (he/him). Traditional Vedic spouse karaka: Venus (signifies wife). Use he/him pronouns.';
    case 'non_binary':  return 'Gender: non-binary. Use they/them pronouns. Skip gendered spouse-karaka conventions; read relationships in a partner-neutral way.';
    case 'unspecified': return null;  // user opted out — don't pass anything
    default:            return null;
  }
}

export function getAstrologyContext(profile: BirthData & {
  name: string;
  gender?: string | null;
  birthCity?: string | null;
}): string {
  const kundli = getFullKundli(profile);
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
  lines.push(`Current Mahadasha: ${kundli.dasha.lord} (until ${kundli.dasha.endDate})`);
  const planetSummary = kundli.planets
    .map(p => `${p.name} in ${ZODIAC[p.signIndex].name} ${p.degInSign}°${p.dignity !== 'neutral' ? ' [' + p.dignity + ']' : ''}`)
    .join(', ');
  if (planetSummary) lines.push(`Planets (Vedic): ${planetSummary}`);
  return lines.join('\n');
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
