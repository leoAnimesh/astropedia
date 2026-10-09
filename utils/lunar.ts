/**
 * Lunar calendar maths for festivals and the horoscope period views:
 * tithi at any instant, tithi start/end, new moons, lunar months (amanta and
 * purnimanta names, adhika masa) and solar ingresses (sankranti).
 *
 * Pure (no React Native / i18n), so Node tests can load it. Sidereal (Lahiri)
 * positions come from utils/astrology.ts, true longitudes from
 * utils/ephemeris.ts. Instants are Dates (UTC); callers decide the place.
 */

import { angleDiff, norm360, tropicalLongitude } from './ephemeris';
import { siderealLongitudeAt } from './astrology';
import { dateFromJd, jdFromDate } from './sun';

/** Amanta month names, Chaitra = 0 … Phalguna = 11 (English keys for i18n). */
export const LUNAR_MONTHS = [
  'Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada',
  'Ashwin', 'Kartika', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna',
] as const;

/** Moon − Sun elongation in degrees [0, 360) at a Julian Day (UT). */
export function elongationJd(jd: number): number {
  return norm360(tropicalLongitude('Moon', jd) - tropicalLongitude('Sun', jd));
}

/** Tithi 1..30 at an instant (1 = Shukla Pratipada, 15 = Purnima, 30 = Amavasya). */
export function tithiAt(d: Date): number {
  return Math.min(30, Math.floor(elongationJd(jdFromDate(d)) / 12) + 1);
}

/** Instant near `jdGuess` when the elongation equals `target` (deg). */
function solveElongation(target: number, jdGuess: number): number {
  let jd = jdGuess;
  for (let i = 0; i < 12; i++) {
    const diff = angleDiff(elongationJd(jd), target);
    // Mean relative motion ~12.19°/day; the Moon's speed varies 11–15°/day,
    // so a few Newton steps with the local rate converge to seconds.
    const rate = angleDiff(elongationJd(jd + 0.05), elongationJd(jd - 0.05)) / 0.1;
    const step = diff / (rate || 12.19);
    jd -= step;
    if (Math.abs(step) < 1e-6) break;
  }
  return jd;
}

/** New moons (elongation 0°) between two instants, ascending. */
export function newMoonsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let jd = jdFromDate(from);
  const end = jdFromDate(to);
  // Back up to the new moon before `from` so the first lunar month is whole.
  jd = solveElongation(0, jd - elongationJd(jd) / 12.19);
  while (jd <= end + 30) {
    if (jd >= jdFromDate(from) - 30 && jd <= end) out.push(dateFromJd(jd));
    jd = solveElongation(0, jd + 29.53);
  }
  return out;
}

/** Sidereal sign 0..11 of the Sun at an instant. */
export function sunSignAt(d: Date): number {
  return Math.floor(siderealLongitudeAt('Sun', jdFromDate(d)) / 30) % 12;
}

/** Sidereal sign 0..11 of the Moon at an instant. */
export function moonSignAt(d: Date): number {
  return Math.floor(siderealLongitudeAt('Moon', jdFromDate(d)) / 30) % 12;
}

/** Nakshatra index 0..26 of the Moon at an instant. */
export function moonNakshatraAt(d: Date): number {
  return Math.min(26, Math.floor(siderealLongitudeAt('Moon', jdFromDate(d)) / (360 / 27)));
}

export type LunarMonth = {
  /** New moon that starts the (amanta) month. */
  start: Date;
  /** Next new moon. */
  end: Date;
  /** Amanta name index (Chaitra = 0). An adhika month carries the name of the month after it. */
  index: number;
  /** No sankranti inside: an extra (adhika / purushottam) month. */
  adhika: boolean;
};

/**
 * Amanta lunar months whose span overlaps [from, to]. A month is named after
 * the sign the Sun is in at its starting new moon (Sun in Pisces → Chaitra);
 * a month with no solar ingress in it is adhika (same name as the next one).
 */
export function lunarMonthsBetween(from: Date, to: Date): LunarMonth[] {
  const nms = newMoonsBetween(new Date(from.getTime() - 32 * 86400000), new Date(to.getTime() + 32 * 86400000));
  const out: LunarMonth[] = [];
  for (let i = 0; i + 1 < nms.length; i++) {
    const s1 = sunSignAt(nms[i]);
    const s2 = sunSignAt(nms[i + 1]);
    out.push({ start: nms[i], end: nms[i + 1], index: (s1 + 1) % 12, adhika: s1 === s2 });
  }
  return out.filter((m) => m.end > from && m.start < to);
}

/** Start and end instants of tithi `n` (1..30) inside the lunar month that begins at `monthStart`. */
export function tithiSpan(monthStart: Date, n: number): { start: Date; end: Date } {
  const jd0 = jdFromDate(monthStart);
  const startJd = n === 1 ? jd0 : solveElongation((n - 1) * 12, jd0 + (n - 1) * 0.984);
  const endJd = n === 30 ? solveElongation(0, jd0 + 29.53) : solveElongation(n * 12, jd0 + n * 0.984);
  return { start: dateFromJd(startJd), end: dateFromJd(endJd) };
}

/**
 * The instant the Sun enters sidereal sign `sign` (0 = Aries) nearest after
 * `from` (within ~13 months).
 */
export function sankrantiAfter(sign: number, from: Date): Date {
  const target = sign * 30;
  let jd = jdFromDate(from);
  const cur = siderealLongitudeAt('Sun', jd);
  jd += norm360(target - cur) / 0.9856;
  for (let i = 0; i < 10; i++) {
    const diff = angleDiff(siderealLongitudeAt('Sun', jd), target);
    const rate = angleDiff(siderealLongitudeAt('Sun', jd + 0.5), siderealLongitudeAt('Sun', jd - 0.5));
    const step = diff / (rate || 0.9856);
    jd -= step;
    if (Math.abs(step) < 1e-6) break;
  }
  return dateFromJd(jd);
}

/** Purnimanta month index for a tithi in an amanta month (Krishna paksha moves to the next name). */
export function purnimantaIndex(amantaIndex: number, tithi: number): number {
  return tithi > 15 ? (amantaIndex + 1) % 12 : amantaIndex;
}

// ─── Five limbs at an instant, with end times ────────────────────────────────

const TITHI_NAMES = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami',
  'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima',
];

export const YOGA_NAMES = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula',
  'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyan',
  'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];

const MOVABLE_KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'];

/** "Shukla Saptami" / "Krishna Ekadashi" / "Purnima" / "Amavasya" (same names as utils/panchang.ts). */
export function tithiName(t: number): string {
  if (t === 30) return 'Amavasya';
  if (t === 15) return 'Purnima';
  return `${t < 15 ? 'Shukla' : 'Krishna'} ${TITHI_NAMES[(t - 1) % 15]}`;
}

/** Karana name for half-tithi 0..59. */
export function karanaName(half: number): string {
  if (half === 0) return 'Kimstughna';
  if (half >= 57) return ['Shakuni', 'Chatushpada', 'Naga'][half - 57];
  return MOVABLE_KARANAS[(half - 1) % 7];
}

const NAK = 360 / 27;

/** Moon + Sun sidereal longitude (yoga), degrees [0, 360). */
function yogaSum(jd: number): number {
  return norm360(siderealLongitudeAt('Moon', jd) + siderealLongitudeAt('Sun', jd));
}

/** First instant after jd0 when f reaches `target` (f increasing, ~`rate` °/day). */
function nextCrossing(f: (jd: number) => number, target: number, jd0: number, rate: number): number {
  let jd = jd0 + norm360(target - f(jd0)) / rate;
  for (let i = 0; i < 12; i++) {
    const diff = angleDiff(f(jd), target);
    const r = angleDiff(f(jd + 0.05), f(jd - 0.05)) / 0.1 || rate;
    const step = diff / r;
    jd -= step;
    if (Math.abs(step) < 1e-6) break;
  }
  return jd;
}

export type LimbsAt = {
  tithi: number; tithiEnd: Date;
  nakshatra: number; nakshatraEnd: Date;
  yoga: number; yogaEnd: Date;
  karana: string; karanaEnd: Date; nextKarana: string;
  moonSign: number;
};

/** Tithi, nakshatra, yoga and karana running at `d`, each with the instant it ends. */
export function limbsAt(d: Date): LimbsAt {
  const jd = jdFromDate(d);
  const el = elongationJd(jd);
  const tithi = Math.min(30, Math.floor(el / 12) + 1);
  const half = Math.min(59, Math.floor(el / 6));
  const moon = siderealLongitudeAt('Moon', jd);
  const nak = Math.min(26, Math.floor(moon / NAK));
  const ys = yogaSum(jd);
  const yoga = Math.min(26, Math.floor(ys / NAK));
  const moonSid = (x: number) => siderealLongitudeAt('Moon', x);
  return {
    tithi,
    tithiEnd: dateFromJd(nextCrossing(elongationJd, (tithi * 12) % 360, jd, 12.19)),
    nakshatra: nak,
    nakshatraEnd: dateFromJd(nextCrossing(moonSid, ((nak + 1) * NAK) % 360, jd, 13.18)),
    yoga,
    yogaEnd: dateFromJd(nextCrossing(yogaSum, ((yoga + 1) * NAK) % 360, jd, 14.17)),
    karana: karanaName(half),
    karanaEnd: dateFromJd(nextCrossing(elongationJd, ((half + 1) * 6) % 360, jd, 12.19)),
    nextKarana: karanaName((half + 1) % 60),
    moonSign: Math.floor(moon / 30) % 12,
  };
}
