/**
 * Vedic Panchang — five-limb almanac for a given date and location.
 *
 * Deterministic. No LLM. Returns:
 *   - tithi    (lunar day, 1–30, with paksha)
 *   - vara     (weekday, with ruling planet)
 *   - nakshatra
 *   - yoga
 *   - karana
 *   - sunrise / sunset (NOAA approximation)
 *   - rahu kaal     (inauspicious window)
 *   - abhijit muhurat (auspicious window around solar noon)
 *
 * Location defaults to Delhi if not provided.
 */

import { NAKSHATRAS } from '@/constants/astrology';
import { getMoonLongitudeExact } from './astrology';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function toJulianDay(dateIso: string, hourUT: number): number {
  const [yr, mo, dy] = dateIso.split('-').map(Number);
  const Y = mo <= 2 ? yr - 1 : yr;
  const M = mo <= 2 ? mo + 12 : mo;
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716))
       + Math.floor(30.6001 * (M + 1))
       + dy + B - 1524.5 + hourUT / 24;
}

function julianCenturies(jd: number): number {
  return (jd - 2451545.0) / 36525;
}

function sunLongitude(dateIso: string, hourUT: number): number {
  const T = julianCenturies(toJulianDay(dateIso, hourUT));
  return norm(280.46646 + 36000.76983 * T);
}

// ─── Tithi (1–30, with paksha) ────────────────────────────────────────────────

export type Tithi = {
  index:    number;            // 1..30
  name:     string;            // e.g. "Shukla Pratipada"
  paksha:   'Shukla' | 'Krishna';
  short:    string;            // "Pratipada"
};

const TITHI_NAMES = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
  'Purnima', // 15 — Full Moon
];

export function getTithi(dateIso: string): Tithi {
  const moon = getMoonLongitudeExact(dateIso, '12:00');
  const sun  = sunLongitude(dateIso, 12);
  const elong = norm(moon - sun);
  const idx   = Math.min(29, Math.floor(elong / 12)); // 0..29

  const paksha: 'Shukla' | 'Krishna' = idx < 15 ? 'Shukla' : 'Krishna';
  const within   = idx < 15 ? idx : idx - 15;        // 0..14 inside paksha
  const isAmavasya = idx === 29;
  const shortName  = isAmavasya ? 'Amavasya'
                                 : TITHI_NAMES[within];
  const name = paksha === 'Shukla'
    ? `Shukla ${shortName}`
    : (isAmavasya ? 'Amavasya' : `Krishna ${shortName}`);

  return { index: idx + 1, name, paksha, short: shortName };
}

// ─── Vara (weekday + ruling planet) ──────────────────────────────────────────

const VARA = [
  { name: 'Ravivara',    english: 'Sunday',    lord: 'Sun' },
  { name: 'Somavara',    english: 'Monday',    lord: 'Moon' },
  { name: 'Mangalavara', english: 'Tuesday',   lord: 'Mars' },
  { name: 'Budhavara',   english: 'Wednesday', lord: 'Mercury' },
  { name: 'Guruvara',    english: 'Thursday',  lord: 'Jupiter' },
  { name: 'Shukravara',  english: 'Friday',    lord: 'Venus' },
  { name: 'Shanivara',   english: 'Saturday',  lord: 'Saturn' },
];

export type Vara = { name: string; english: string; lord: string; index: number };

export function getVara(dateIso: string): Vara {
  const idx = new Date(dateIso + 'T12:00:00').getDay();
  return { ...VARA[idx], index: idx };
}

// ─── Yoga (27 yogas, sun+moon longitudinal) ──────────────────────────────────

const YOGAS = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana',
  'Atiganda',  'Sukarma','Dhriti',   'Shula',     'Ganda',
  'Vriddhi',   'Dhruva', 'Vyaghata', 'Harshana',  'Vajra',
  'Siddhi',    'Vyatipata','Variyan', 'Parigha',  'Shiva',
  'Siddha',    'Sadhya', 'Shubha',   'Shukla',    'Brahma',
  'Indra',     'Vaidhriti',
];

export type Yoga = { index: number; name: string };

export function getYoga(dateIso: string): Yoga {
  const moon = getMoonLongitudeExact(dateIso, '12:00');
  const sun  = sunLongitude(dateIso, 12);
  const sum  = norm(moon + sun);
  const idx  = Math.min(26, Math.floor(sum / (360 / 27)));
  return { index: idx + 1, name: YOGAS[idx] };
}

// ─── Karana (half-tithi, 11 distinct names cycling) ──────────────────────────

// First half of Shukla Pratipada is Kimstughna; then 7 movable karanas cycle
// across the rest of the month; the last four halves are the 4 fixed karanas.
const MOVABLE_KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'];
const FIXED_KARANAS   = ['Shakuni', 'Chatushpada', 'Naga', 'Kimstughna'];

export type Karana = { index: number; name: string };

export function getKarana(dateIso: string): Karana {
  const moon = getMoonLongitudeExact(dateIso, '12:00');
  const sun  = sunLongitude(dateIso, 12);
  const elong = norm(moon - sun);
  const half  = Math.min(59, Math.floor(elong / 6)); // 0..59 half-tithis in month

  // Half 0 → Kimstughna. Halves 57,58,59 → Shakuni, Chatushpada, Naga.
  // Movable cycle: halves 1..56 → MOVABLE_KARANAS[(half - 1) % 7].
  if (half === 0)              return { index: 0,  name: 'Kimstughna' };
  if (half === 57)             return { index: 57, name: 'Shakuni' };
  if (half === 58)             return { index: 58, name: 'Chatushpada' };
  if (half === 59)             return { index: 59, name: 'Naga' };
  const m = MOVABLE_KARANAS[(half - 1) % 7];
  return { index: half, name: m };
}

// ─── Sunrise / sunset (NOAA approximation, returns local-time hour decimals) ─

export type DaylightTimes = {
  sunriseHour: number; // 0..24 local time
  sunsetHour:  number; // 0..24 local time
  hasDaylight: boolean; // false at polar latitudes during dark/light seasons
};

const DEFAULT_LAT = 28.6139; // Delhi
const DEFAULT_LNG = 77.2090;

function dayOfYear(dateIso: string): number {
  const d = new Date(dateIso + 'T00:00:00');
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDaylightTimes(
  dateIso: string,
  lat?: number | null,
  lng?: number | null,
): DaylightTimes {
  const L  = lat ?? DEFAULT_LAT;
  const G  = lng ?? DEFAULT_LNG;
  const N  = dayOfYear(dateIso);

  // Solar declination (Spencer's approximation, deg)
  const decl = 23.45 * Math.sin(((360 / 365) * (N - 81)) * RAD);

  const arg = -Math.tan(L * RAD) * Math.tan(decl * RAD);
  if (arg < -1 || arg > 1) {
    return { sunriseHour: 6, sunsetHour: 18, hasDaylight: false };
  }
  const H = Math.acos(arg) * DEG; // hour angle in degrees

  // Local solar mean times in hours.
  const solarNoon = 12;
  const sunriseLST = solarNoon - H / 15;
  const sunsetLST  = solarNoon + H / 15;

  // Convert from local solar time to local clock time using the timezone the
  // device is in. The simple correction: device offset minutes - longitude/15.
  const tzOffsetMin = -new Date(dateIso + 'T00:00:00').getTimezoneOffset();
  const tzHours     = tzOffsetMin / 60;
  const correction  = tzHours - G / 15;

  const sunriseHour = (sunriseLST + correction + 24) % 24;
  const sunsetHour  = (sunsetLST  + correction + 24) % 24;

  return { sunriseHour, sunsetHour, hasDaylight: true };
}

// ─── Rahu Kaal (inauspicious window) ─────────────────────────────────────────

// Weekday → which 8th of the daylight period is Rahu Kaal.
// (0-indexed parts from sunrise; Sunday=0)
const RAHU_KAAL_PART_BY_WEEKDAY = [7, 1, 6, 4, 5, 3, 2];

export type Window = { startHour: number; endHour: number };

export function getRahuKaal(dateIso: string, lat?: number | null, lng?: number | null): Window {
  const { sunriseHour, sunsetHour } = getDaylightTimes(dateIso, lat, lng);
  const daylight = sunsetHour > sunriseHour ? sunsetHour - sunriseHour : 12;
  const part     = daylight / 8;
  const idx      = RAHU_KAAL_PART_BY_WEEKDAY[new Date(dateIso + 'T12:00:00').getDay()];
  const startHour = sunriseHour + idx * part;
  return { startHour, endHour: startHour + part };
}

// ─── Abhijit Muhurat (48 min around solar noon) ──────────────────────────────

export function getAbhijitMuhurat(dateIso: string, lat?: number | null, lng?: number | null): Window {
  const { sunriseHour, sunsetHour } = getDaylightTimes(dateIso, lat, lng);
  const daylight = sunsetHour > sunriseHour ? sunsetHour - sunriseHour : 12;
  const noon     = sunriseHour + daylight / 2;
  const halfWin  = (daylight / 15) / 2; // 1/15th of the day, centered on noon
  return { startHour: noon - halfWin, endHour: noon + halfWin };
}

// ─── Full Panchang aggregator ────────────────────────────────────────────────

export type Panchang = {
  date:        string;
  tithi:       Tithi;
  vara:        Vara;
  nakshatra:   { index: number; name: string; lord: string };
  yoga:        Yoga;
  karana:      Karana;
  sunrise:     number;
  sunset:      number;
  rahuKaal:    Window;
  abhijit:     Window;
};

export function getPanchang(
  dateIso: string,
  lat?: number | null,
  lng?: number | null,
): Panchang {
  const moon = getMoonLongitudeExact(dateIso, '12:00');
  const NAK_SIZE = 360 / 27;
  const nakIdx = Math.min(26, Math.floor(moon / NAK_SIZE));
  const nak    = NAKSHATRAS[nakIdx];

  const daylight = getDaylightTimes(dateIso, lat, lng);

  return {
    date:      dateIso,
    tithi:     getTithi(dateIso),
    vara:      getVara(dateIso),
    nakshatra: { index: nakIdx + 1, name: nak.name, lord: nak.lord },
    yoga:      getYoga(dateIso),
    karana:    getKarana(dateIso),
    sunrise:   daylight.sunriseHour,
    sunset:    daylight.sunsetHour,
    rahuKaal:  getRahuKaal(dateIso, lat, lng),
    abhijit:   getAbhijitMuhurat(dateIso, lat, lng),
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function formatHour(h: number): string {
  const total = Math.round(h * 60);
  const hr12  = Math.floor(total / 60);
  const min   = total % 60;
  const period = hr12 >= 12 ? 'PM' : 'AM';
  const hr     = hr12 % 12 || 12;
  return `${hr}:${String(min).padStart(2, '0')} ${period}`;
}

export function formatWindow(w: Window): string {
  return `${formatHour(w.startHour)} – ${formatHour(w.endHour)}`;
}
