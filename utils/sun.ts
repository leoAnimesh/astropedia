/**
 * Sunrise, sunset and moonrise for a place, as real instants (Date).
 *
 * Pure math (no React Native / i18n imports) so Node scripts and tests can
 * load it.
 *
 * - Sun: NOAA solar calculator (equation of time + declination), upper limb
 *   on the horizon with standard refraction (zenith 90.833°), refined once at
 *   the event time. Good to about a minute between ±60° latitude, which is
 *   what panchang tables (Drik Panchang etc.) use for Hindu sunrise.
 * - Moon: true geocentric longitude from utils/ephemeris.ts, plus the main
 *   latitude terms (Meeus 47.B), mean parallax; rise = upper limb at the
 *   horizon (h0 = +0.125°). Good to a few minutes.
 *
 * Days are civil calendar dates. Times are absolute instants, so they show
 * correctly in whatever timezone the device is in. The date's sunrise is the
 * one nearest that calendar date at the given longitude (the place's own
 * local day), so a place far from the device's timezone still gets its own
 * sunrise for that date.
 */

import { norm360, tropicalLongitude } from './ephemeris';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY_MS = 86400000;

/** Delhi: the app's default place when a profile has no birth coordinates. */
export const DEFAULT_LAT = 28.6139;
export const DEFAULT_LNG = 77.209;

export function jdFromDate(d: Date): number {
  return d.getTime() / DAY_MS + 2440587.5;
}

export function dateFromJd(jd: number): Date {
  return new Date(Math.round((jd - 2440587.5) * DAY_MS));
}

/** Coordinates with the Delhi fallback the panchang screens use. */
export function placeOrDefault(lat?: number | null, lng?: number | null): { lat: number; lng: number } {
  const ok = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  return ok ? { lat: lat as number, lng: lng as number } : { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
}

// ─── Sun (NOAA) ──────────────────────────────────────────────────────────────

function solar(jd: number): { decl: number; eqTimeMin: number } {
  const T = (jd - 2451545) / 36525;
  const L0 = norm360(280.46646 + T * (36000.76983 + 0.0003032 * T));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * Mr) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * RAD;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const y = Math.tan(eps / 2) ** 2;
  const L0r = L0 * RAD;
  const eq = y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr);
  return { decl, eqTimeMin: 4 * eq * DEG };
}

/** Minutes after 00:00 UT of `dayUtcMs` for sunrise (−1) / sunset (+1), or null (polar day/night). */
function sunEventMinutes(dayUtcMs: number, lat: number, lng: number, sign: -1 | 1): number | null {
  let minutes = 720 - 4 * lng;
  for (let i = 0; i < 3; i++) {
    const { decl, eqTimeMin } = solar((dayUtcMs + minutes * 60000) / DAY_MS + 2440587.5);
    const cosH = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
    if (cosH < -1 || cosH > 1) return null;
    const H = Math.acos(cosH) * DEG;
    minutes = 720 - 4 * (lng - sign * H) - eqTimeMin;
  }
  return minutes;
}

function solarNoonMinutes(dayUtcMs: number, lng: number): number {
  let minutes = 720 - 4 * lng;
  for (let i = 0; i < 2; i++) {
    minutes = 720 - 4 * lng - solar((dayUtcMs + minutes * 60000) / DAY_MS + 2440587.5).eqTimeMin;
  }
  return minutes;
}

export type SunTimes = {
  sunrise: Date;
  sunset: Date;
  noon: Date;
  /** False in polar day/night; sunrise/sunset are then 06:00/18:00 local solar time. */
  hasDaylight: boolean;
};

/** Sunrise, solar noon and sunset on the civil date `y-m-d` at the place. */
export function sunTimesYmd(y: number, m: number, d: number, lat: number, lng: number): SunTimes {
  const day = Date.UTC(y, m - 1, d);
  const noonMin = solarNoonMinutes(day, lng);
  const rise = sunEventMinutes(day, lat, lng, -1);
  const set = sunEventMinutes(day, lat, lng, 1);
  const at = (min: number) => new Date(day + Math.round(min * 60000));
  if (rise == null || set == null) {
    return { sunrise: at(noonMin - 360), sunset: at(noonMin + 360), noon: at(noonMin), hasDaylight: false };
  }
  return { sunrise: at(rise), sunset: at(set), noon: at(noonMin), hasDaylight: true };
}

/** Sun times for the device-local calendar date of `date`. lat/lng default to Delhi. */
export function getSunTimes(date: Date, lat?: number | null, lng?: number | null): SunTimes {
  const p = placeOrDefault(lat, lng);
  return sunTimesYmd(date.getFullYear(), date.getMonth() + 1, date.getDate(), p.lat, p.lng);
}

/** Sun times for a 'YYYY-MM-DD' civil date. */
export function getSunTimesIso(dateIso: string, lat?: number | null, lng?: number | null): SunTimes {
  const [y, m, d] = dateIso.split('-').map(Number);
  const p = placeOrDefault(lat, lng);
  return sunTimesYmd(y, m, d, p.lat, p.lng);
}

// ─── Moon (rise) ─────────────────────────────────────────────────────────────

/** Geocentric ecliptic latitude of the Moon (°), Meeus 47.B main terms (±0.01°). */
function moonLatitude(jd: number): number {
  const T = (jd - 2451545) / 36525;
  const D = (297.8501921 + 445267.1114034 * T) * RAD;
  const Mp = (134.9633964 + 477198.8675055 * T) * RAD;
  const F = (93.272095 + 483202.0175233 * T) * RAD;
  const s = (x: number) => Math.sin(x);
  return (5128122 * s(F) + 280602 * s(Mp + F) + 277693 * s(Mp - F) + 173237 * s(2 * D - F)
    + 55413 * s(2 * D - Mp + F) + 46271 * s(2 * D - Mp - F) + 32573 * s(2 * D + F)
    + 17198 * s(2 * Mp + F) + 9266 * s(2 * D + Mp - F) + 8822 * s(2 * Mp - F)) / 1e6;
}

/** Altitude (°) of the Moon's centre, geocentric, at `jd` for the place. */
function moonAltitude(jd: number, lat: number, lng: number): number {
  const lam = tropicalLongitude('Moon', jd) * RAD;
  const bet = moonLatitude(jd) * RAD;
  const T = (jd - 2451545) / 36525;
  const eps = (23.4392911 - 0.0130042 * T) * RAD;
  const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam));
  const dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
  const gmst = norm360(280.46061837 + 360.98564736629 * (jd - 2451545));
  const H = (gmst + lng) * RAD - ra;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(H)) * DEG;
}

/** Upper limb on the horizon with refraction and mean parallax (Meeus 15). */
const MOON_H0 = 0.125;

/** First moonrise after `from` within `hours` (default 27 h), or null. */
export function moonriseAfter(from: Date, lat?: number | null, lng?: number | null, hours = 27): Date | null {
  const p = placeOrDefault(lat, lng);
  const step = 10 / 1440;
  let jd = jdFromDate(from);
  let prev = moonAltitude(jd, p.lat, p.lng) - MOON_H0;
  const end = jd + hours / 24;
  while (jd < end) {
    const next = jd + step;
    const alt = moonAltitude(next, p.lat, p.lng) - MOON_H0;
    if (prev < 0 && alt >= 0) {
      let lo = jd, hi = next;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (moonAltitude(mid, p.lat, p.lng) - MOON_H0 < 0) lo = mid; else hi = mid;
      }
      return dateFromJd(hi);
    }
    jd = next;
    prev = alt;
  }
  return null;
}

/** Moonrise on the civil date `y-m-d` at the place (local day of that longitude), or null. */
export function moonriseOnYmd(y: number, m: number, d: number, lat?: number | null, lng?: number | null): Date | null {
  const p = placeOrDefault(lat, lng);
  // The place's local midnight, from its longitude (good enough to bound the day).
  const start = new Date(Date.UTC(y, m - 1, d) - (p.lng / 15) * 3600000);
  const rise = moonriseAfter(start, p.lat, p.lng, 24);
  return rise;
}
