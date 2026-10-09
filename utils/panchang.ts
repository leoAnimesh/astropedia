/**
 * Vedic Panchang — five-limb almanac for a given date and location.
 *
 * Deterministic. No LLM. Returns:
 *   - tithi    (lunar day, 1–30, with paksha)
 *   - vara     (weekday, with ruling planet)
 *   - nakshatra
 *   - yoga
 *   - karana
 *   - sunrise / sunset (NOAA, utils/sun.ts)
 *   - rahu kaal     (inauspicious window)
 *   - abhijit muhurat (auspicious window around solar noon)
 *
 * Location defaults to Delhi if not provided.
 */

import { NAKSHATRAS } from '@/constants/astrology';
import { getMoonLongitudeExact, getSunLongitudeExact } from './astrology';
import i18n, { intlLocale, localizeTime } from './i18n';
import { getSunTimesIso } from './sun';


function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * SIDEREAL (Lahiri) true Sun at 12:00 UT on the date — same frame as
 * getMoonLongitudeExact, so tithi/karana (Moon − Sun) and yoga (Moon + Sun)
 * come out right. (Previously a tropical *mean* Sun was mixed with the
 * sidereal Moon, which put tithi and yoga ~24° — about two tithis — off.)
 */
function sunLongitude(dateIso: string): number {
  return getSunLongitudeExact(dateIso, '12:00');
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
  const sun  = sunLongitude(dateIso);
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
  const sun  = sunLongitude(dateIso);
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
  const sun  = sunLongitude(dateIso);
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

export function getDaylightTimes(
  dateIso: string,
  lat?: number | null,
  lng?: number | null,
): DaylightTimes {
  // NOAA sunrise/sunset (utils/sun.ts): equation of time and refraction
  // included, so these agree with the Choghadiya / Rahu Kaal on the Panchang
  // screen (and Drik Panchang) to about a minute. Returned as decimal hours
  // in the device's local time, as before.
  const s = getSunTimesIso(dateIso, lat ?? DEFAULT_LAT, lng ?? DEFAULT_LNG);
  const [y, m, d] = dateIso.split('-').map(Number);
  const midnight = new Date(y, m - 1, d).getTime();
  const hours = (t: Date) => (t.getTime() - midnight) / 3600000;
  return { sunriseHour: hours(s.sunrise), sunsetHour: hours(s.sunset), hasDaylight: s.hasDaylight };
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

// ─── Display helpers (app language) ──────────────────────────────────────────
// formatHour/formatWindow above stay English (other callers and model context
// rely on them). Screens use these for user-facing text.

/** Decimal local hour → "6:12 am" / "সকাল ৬:১২" in the app language. */
export function formatHourLocal(h: number): string {
  const total = Math.round(h * 60);
  const d = new Date();
  d.setHours(Math.floor(total / 60) % 24, total % 60, 0, 0);
  try {
    return localizeTime(d.toLocaleTimeString(intlLocale(), { hour: 'numeric', minute: '2-digit' }));
  } catch {
    return formatHour(h);
  }
}

export function formatWindowLocal(w: Window): string {
  return `${formatHourLocal(w.startHour)} – ${formatHourLocal(w.endHour)}`;
}

/** Yoga / karana / vara names in the app language (English data unchanged). */
export const tYoga   = (name: string) => i18n.t(`panchang:yoga.${name}`,   { defaultValue: name });
export const tKarana = (name: string) => i18n.t(`panchang:karana.${name}`, { defaultValue: name });
export const tVara   = (name: string) => i18n.t(`panchang:vara.${name}`,   { defaultValue: name });
