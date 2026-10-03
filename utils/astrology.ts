import { ZODIAC, PLANETS, NAKSHATRAS, DASHA_YEARS, ELEMENT_COLORS, type ZodiacSign, type Nakshatra } from '@/constants/astrology';
import { localDateIso } from './format';

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
 * Convert a local birth date + time to a continuous Julian Day.
 *
 * `time` is the LOCAL clock time at the birth location (e.g. "14:30" IST).
 * `lng` is the birth longitude in degrees — used to convert local time to UT
 * at ~15° per hour. When `lng` is unknown the time is treated as UT (the
 * old, slightly-off behaviour).
 *
 * Julian Days are continuous, so a negative `ut` (e.g. early-morning local
 * birth that maps to the previous UT day) correctly produces a JD on the
 * earlier calendar day without any explicit rollback.
 */
function toJulianDay(date: string, time?: string, lng?: number | null): number {
  const [yr, mo, dy] = date.split('-').map(Number);
  const [h = 12, min = 0] = (time ?? '12:00').split(':').map(Number);
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

function julianCenturies(jd: number): number {
  return (jd - 2451545.0) / 36525;
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

// ─── Sun sign (tropical date-range) ──────────────────────────────────────────

export function getSunSign(birthDate: string): ZodiacSign | null {
  if (!birthDate) return null;
  const [, mo, dy] = birthDate.split('-').map(Number);
  if (!mo || !dy) return null;
  for (const z of ZODIAC) {
    if (z.startMonth > z.endMonth) {
      if ((mo === z.startMonth && dy >= z.startDay) || (mo === z.endMonth && dy <= z.endDay)) return z;
    } else {
      if ((mo === z.startMonth && dy >= z.startDay) || (mo === z.endMonth && dy <= z.endDay)) return z;
    }
  }
  return null;
}

// ─── Moon longitude (Jean Meeus 10-term, accurate ~0.3°) ─────────────────────

/**
 * Returns the moon's SIDEREAL ecliptic longitude (Lahiri ayanamsa applied),
 * which is what Vedic moon sign + nakshatra + dasha math expects.
 */
export function getMoonLongitudeExact(birthDate: string, birthTime?: string, birthLng?: number | null): number {
  const jd = toJulianDay(birthDate, birthTime, birthLng);
  const T  = julianCenturies(jd);

  const L  = norm(218.3164477 + 481267.88123421 * T);
  const Mm = norm(134.9633964 + 477198.8675055  * T);
  const Ms = norm(357.5291092 + 35999.0502909   * T);
  const D  = norm(297.8501921 + 445267.1114034  * T);
  const F  = norm(93.2720950  + 483202.0175233  * T);

  const delta =
    6.289 * Math.sin(Mm * RAD)
  + 1.274 * Math.sin((2 * D - Mm) * RAD)
  + 0.658 * Math.sin(2 * D * RAD)
  - 0.186 * Math.sin(Ms * RAD)
  - 0.114 * Math.sin(2 * F * RAD)
  + 0.059 * Math.sin((2 * D - 2 * Mm) * RAD)
  + 0.057 * Math.sin((2 * D - Ms - Mm) * RAD)
  + 0.053 * Math.sin((2 * D + Mm) * RAD)
  + 0.046 * Math.sin((2 * D - Ms) * RAD)
  + 0.041 * Math.sin((Mm - Ms) * RAD);

  const tropical = norm(L + delta);
  return toSidereal(tropical, jd);
}

export function getMoonSign(birthDate: string, birthTime?: string, birthLng?: number | null): ZodiacSign | null {
  if (!birthDate) return null;
  const moonLon = getMoonLongitudeExact(birthDate, birthTime, birthLng);
  return ZODIAC[Math.floor(moonLon / 30)];
}

// ─── Rahu (mean lunar node) ───────────────────────────────────────────────────

export function getRahuDegree(birthDate: string, birthTime?: string, birthLng?: number | null): number {
  const jd = toJulianDay(birthDate, birthTime, birthLng);
  const T  = julianCenturies(jd);
  const tropical = norm(125.0445479 - 1934.1362608 * T);
  return toSidereal(tropical, jd);
}

// ─── Ascendant (Placidus via LST) ─────────────────────────────────────────────

export function getAscendantDegree(
  birthDate: string,
  birthTime?: string,
  birthLat?: number | null,
  birthLng?: number | null,
): number | null {
  if (!birthDate || !birthTime || birthLat == null || birthLng == null) return null;

  // For the ascendant we still need a JD anchored to UT to compute GMST/LST
  // correctly. The existing GMST/LST formulas below already use `birthLng` to
  // do the local-sidereal conversion, so we must pass UT (not local-converted)
  // to toJulianDay here.
  const jd = toJulianDay(birthDate, birthTime);
  const T  = julianCenturies(jd);

  const obliq = 23.4393 - 0.0130042 * T;
  const jd0   = Math.floor(jd - 0.5) + 0.5;
  const T0    = julianCenturies(jd0);
  const GMST0 = norm(100.4606184 + 36000.77004 * T0 + 0.000387933 * T0 * T0);

  const [h = 12, min = 0] = birthTime.split(':').map(Number);
  const UT = h + min / 60;

  const LST = norm(GMST0 + 360.98564724 * (UT / 24) + birthLng);

  const R = LST * RAD;
  const E = obliq * RAD;
  const P = birthLat * RAD;

  const y = -Math.cos(R);
  const x = Math.sin(E) * Math.tan(P) + Math.cos(E) * Math.sin(R);

  if (!isFinite(x) || !isFinite(y)) return null;
  const tropical = norm(Math.atan2(y, x) * DEG);
  return toSidereal(tropical, jd);
}

export function getRisingSign(
  birthDate: string,
  birthTime?: string,
  birthLat?: number | null,
  birthLng?: number | null,
): ZodiacSign | null {
  const asc = getAscendantDegree(birthDate, birthTime, birthLat, birthLng);
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
  profile: { birthDate: string; birthTime?: string | null; birthLng?: number | null },
  now: Date = new Date(),
): string {
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined, profile.birthLng);
  const t = getDashaTimeline(moonLon, profile.birthDate, now);
  return [
    `Timing (use these; never invent other dates):`,
    `- Current sub-period: ${t.antar.lord}, ends ${monthYear(t.antar.end)} (${relativeFrom(now, t.antar.end)})`,
    `- Next sub-period: ${t.nextAntar.lord}, ${monthYear(t.nextAntar.start)} to ${monthYear(t.nextAntar.end)}`,
    `- Current life phase: ${t.maha.lord}, ends ${monthYear(t.maha.end)} (${relativeFrom(now, t.maha.end)})`,
    `- Next life phase: ${t.nextMaha.lord}, from ${monthYear(t.nextMaha.start)}`,
  ].join('\n');
}

// ─── Planet positions (VSOP87 L0+L1 mean longitudes) ─────────────────────────

const MEAN_LONGITUDE: Record<string, [number, number]> = {
  Sun:     [280.46646,  36000.76983],
  Mercury: [252.25084, 149472.67411],
  Venus:   [181.97973,  58517.81539],
  Mars:    [355.43329,  19140.29934],
  Jupiter: [ 34.35151,   3034.90567],
  Saturn:  [ 50.07744,   1222.11379],
};

export function getChartPositions(profile: {
  birthDate: string;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
}): PlanetPosition[] {
  if (!profile.birthDate) return [];

  const lng     = profile.birthLng ?? null;
  const jd      = toJulianDay(profile.birthDate, profile.birthTime ?? undefined, lng);
  const T       = julianCenturies(jd);
  // Note: getMoonLongitudeExact / getRahuDegree both already return sidereal.
  // Planet mean longitudes from MEAN_LONGITUDE are tropical and must be
  // converted before slotting into rashi.
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined, lng);
  const rahuLon = toSidereal(norm(125.0445479 - 1934.1362608 * T), jd);
  const ketuLon = norm(rahuLon + 180);

  return PLANETS.map((p) => {
    let degree: number;
    if      (p.name === 'Moon') degree = moonLon;
    else if (p.name === 'Rahu') degree = rahuLon;
    else if (p.name === 'Ketu') degree = ketuLon;
    else {
      const [L0, L1] = MEAN_LONGITUDE[p.name] ?? [0, 0];
      degree = toSidereal(norm(L0 + L1 * T), jd);
    }

    const signIndex = Math.floor(degree / 30) % 12;
    const degInSign = Math.floor(degree % 30);
    const dignity   = getPlanetDignity(p.name, signIndex);

    return { name: p.name, glyph: p.glyph, degree, signIndex, degInSign, dignity };
  });
}

// ─── Full Kundli ──────────────────────────────────────────────────────────────

export function getBigThree(profile: {
  birthDate: string;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
}): BigThree {
  return {
    sun:    getSunSign(profile.birthDate),
    moon:   getMoonSign(profile.birthDate, profile.birthTime ?? undefined, profile.birthLng),
    rising: getRisingSign(
      profile.birthDate,
      profile.birthTime ?? undefined,
      profile.birthLat,
      profile.birthLng,
    ),
  };
}

export function getFullKundli(profile: {
  birthDate: string;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
}): FullKundli {
  const lng       = profile.birthLng ?? null;
  const moonLon   = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined, lng);
  const ascDeg    = getAscendantDegree(profile.birthDate, profile.birthTime ?? undefined, profile.birthLat, profile.birthLng);
  const rahuDeg   = getRahuDegree(profile.birthDate, profile.birthTime ?? undefined, lng);
  const nakshatra = getNakshatra(moonLon);
  const dasha     = getCurrentMahadasha(moonLon, profile.birthDate);
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

export function getAstrologyContext(profile: {
  name: string;
  gender?: string | null;
  birthDate: string;
  birthTime?: string | null;
  birthCity?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
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
  const SYNODIC = 29.53058867;
  const NEW_MOON_REF = 2451549.5; // Jan 6 2000 new moon (JD)
  const phase = ((jd - NEW_MOON_REF) % SYNODIC + SYNODIC) % SYNODIC;
  const f = phase / SYNODIC;
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
  profile: { birthDate: string; birthTime?: string | null; birthLng?: number | null },
  now: Date = new Date(),
  untilAge = 90,
): LifeChapters {
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined, profile.birthLng);
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
