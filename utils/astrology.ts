import { ZODIAC, PLANETS, NAKSHATRAS, DASHA_YEARS, ELEMENT_COLORS, type ZodiacSign, type Nakshatra } from '@/constants/astrology';

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

function toJulianDay(date: string, time?: string): number {
  const [yr, mo, dy] = date.split('-').map(Number);
  const [h = 12, min = 0] = (time ?? '12:00').split(':').map(Number);
  const ut = h + min / 60;
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

export function getMoonLongitudeExact(birthDate: string, birthTime?: string): number {
  const jd = toJulianDay(birthDate, birthTime);
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

  return norm(L + delta);
}

export function getMoonSign(birthDate: string, birthTime?: string): ZodiacSign | null {
  if (!birthDate) return null;
  const moonLon = getMoonLongitudeExact(birthDate, birthTime);
  return ZODIAC[Math.floor(moonLon / 30)];
}

// ─── Rahu (mean lunar node) ───────────────────────────────────────────────────

export function getRahuDegree(birthDate: string, birthTime?: string): number {
  const jd = toJulianDay(birthDate, birthTime);
  const T  = julianCenturies(jd);
  return norm(125.0445479 - 1934.1362608 * T);
}

// ─── Ascendant (Placidus via LST) ─────────────────────────────────────────────

export function getAscendantDegree(
  birthDate: string,
  birthTime?: string,
  birthLat?: number | null,
  birthLng?: number | null,
): number | null {
  if (!birthDate || !birthTime || birthLat == null || birthLng == null) return null;

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
  return norm(Math.atan2(y, x) * DEG);
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
        startDate:  dashaStart.toISOString().slice(0, 10),
        endDate:    dashaEnd.toISOString().slice(0, 10),
        yearsTotal: DASHA_YEARS[dashaLord],
      };
    }

    cursor = new Date(dashaEnd);
  }

  // Fallback (never reached for any living person)
  return {
    lord:       sequence[sequence.length - 1],
    startDate:  cursor.toISOString().slice(0, 10),
    endDate:    cursor.toISOString().slice(0, 10),
    yearsTotal: DASHA_YEARS[sequence[sequence.length - 1]],
  };
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

  const jd      = toJulianDay(profile.birthDate, profile.birthTime ?? undefined);
  const T       = julianCenturies(jd);
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined);
  const rahuLon = norm(125.0445479 - 1934.1362608 * T);
  const ketuLon = norm(rahuLon + 180);

  return PLANETS.map((p) => {
    let degree: number;
    if      (p.name === 'Moon') degree = moonLon;
    else if (p.name === 'Rahu') degree = rahuLon;
    else if (p.name === 'Ketu') degree = ketuLon;
    else {
      const [L0, L1] = MEAN_LONGITUDE[p.name] ?? [0, 0];
      degree = norm(L0 + L1 * T);
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
    moon:   getMoonSign(profile.birthDate, profile.birthTime ?? undefined),
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
  const moonLon  = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined);
  const ascDeg   = getAscendantDegree(profile.birthDate, profile.birthTime ?? undefined, profile.birthLat, profile.birthLng);
  const rahuDeg  = getRahuDegree(profile.birthDate, profile.birthTime ?? undefined);
  const nakshatra = getNakshatra(moonLon);
  const dasha    = getCurrentMahadasha(moonLon, profile.birthDate);
  const bigThree = getBigThree(profile);
  const planets  = getChartPositions(profile);

  return { bigThree, moonLon, ascDeg, rahuDeg, nakshatra, dasha, planets };
}

// ─── AI context string ────────────────────────────────────────────────────────

export function getAstrologyContext(profile: {
  name: string;
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
  if (kundli.bigThree.sun)    lines.push(`Sun sign: ${kundli.bigThree.sun.name} (${kundli.bigThree.sun.element})`);
  if (kundli.bigThree.moon)   lines.push(`Moon sign: ${kundli.bigThree.moon.name}`);
  if (kundli.bigThree.rising) lines.push(`Rising sign: ${kundli.bigThree.rising.name}`);
  lines.push(`Moon nakshatra: ${kundli.nakshatra.name} (lord: ${kundli.nakshatra.lord})`);
  lines.push(`Current Mahadasha: ${kundli.dasha.lord} (until ${kundli.dasha.endDate})`);
  const planetSummary = kundli.planets
    .map(p => `${p.name} in ${ZODIAC[p.signIndex].name} ${p.degInSign}°${p.dignity !== 'neutral' ? ' [' + p.dignity + ']' : ''}`)
    .join(', ');
  if (planetSummary) lines.push(`Planets: ${planetSummary}`);
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
  const today = new Date().toISOString().slice(0, 10);
  const positions = getChartPositions({ birthDate: today, birthTime: '12:00' });
  return positions
    .filter(p => !p.name.match(/^(Rahu|Ketu)$/))
    .map(p => ({ name: p.name, signName: ZODIAC[p.signIndex].name, degInSign: p.degInSign }));
}
