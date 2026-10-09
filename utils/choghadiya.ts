/**
 * Choghadiya (day and night, 8 parts each), Rahu Kaal, Yamaganda and Gulika
 * Kaal for a date and place. Pure (no React Native / i18n): Node tests load it.
 *
 * Day = sunrise → sunset, split into 8 equal parts; night = sunset → next
 * sunrise, 8 parts. The day sequence starts with the weekday ruler's
 * choghadiya and walks the cycle Udveg (Sun) → Chal (Venus) → Labh (Mercury)
 * → Amrit (Moon) → Kaal (Saturn) → Shubh (Jupiter) → Rog (Mars); the 8th part
 * repeats the 1st. The night starts with the ruler five days on (Sunday night
 * starts with Shubh) and steps two places back through the same cycle.
 *
 * Rahu Kaal / Yamaganda / Gulika are fixed eighths of the daytime by weekday
 * (the same tables Drik Panchang and AstroSage use).
 *
 * Location: callers pass the place they show times for. The app has no
 * device location, so screens pass the active profile's birth place and fall
 * back to Delhi (same as the existing Panchang screen; see utils/sun.ts).
 */

import { getSunTimes, type SunTimes } from './sun';

export type ChoghadiyaName = 'Udveg' | 'Chal' | 'Labh' | 'Amrit' | 'Kaal' | 'Shubh' | 'Rog';
export type ChoghadiyaQuality = 'good' | 'okay' | 'avoid';

export type ChoghadiyaSlot = {
  name:    ChoghadiyaName;
  quality: ChoghadiyaQuality;
  start:   Date;
  end:     Date;
  /** 'day' (sunrise → sunset) or 'night' (sunset → next sunrise). */
  half:    'day' | 'night';
  /** 0..7 within its half. */
  index:   number;
};

export type Choghadiya = {
  day:     ChoghadiyaSlot[];
  night:   ChoghadiyaSlot[];
  sunrise: Date;
  sunset:  Date;
  nextSunrise: Date;
};

const CYCLE: ChoghadiyaName[] = ['Udveg', 'Chal', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog'];

/** Cycle position of the weekday ruler's choghadiya, Sunday = 0 … Saturday = 6. */
const DAY_START = [0, 3, 6, 2, 5, 1, 4]; // Udveg, Amrit, Rog, Labh, Shubh, Chal, Kaal

export const CHOGHADIYA_QUALITY: Record<ChoghadiyaName, ChoghadiyaQuality> = {
  Amrit: 'good', Shubh: 'good', Labh: 'good',
  Chal: 'okay',
  Udveg: 'avoid', Kaal: 'avoid', Rog: 'avoid',
};

function split(start: Date, end: Date, names: ChoghadiyaName[], half: 'day' | 'night'): ChoghadiyaSlot[] {
  const part = (end.getTime() - start.getTime()) / 8;
  return names.map((name, i) => ({
    name,
    quality: CHOGHADIYA_QUALITY[name],
    start: new Date(start.getTime() + i * part),
    end:   new Date(i === 7 ? end.getTime() : start.getTime() + (i + 1) * part),
    half,
    index: i,
  }));
}

function sunAround(date: Date, lat?: number | null, lng?: number | null): { today: SunTimes; tomorrow: SunTimes } {
  const today = getSunTimes(date, lat, lng);
  const tomorrow = getSunTimes(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12), lat, lng);
  return { today, tomorrow };
}

/**
 * Day and night choghadiya for the civil date of `date` (device-local
 * calendar day). The night half runs into the next morning.
 */
export function getChoghadiya(date: Date, lat?: number | null, lng?: number | null): Choghadiya {
  const { today, tomorrow } = sunAround(date, lat, lng);
  const wd = date.getDay();
  const dayNames: ChoghadiyaName[] = [];
  for (let i = 0; i < 8; i++) dayNames.push(CYCLE[(DAY_START[wd] + i) % 7]);
  const nightStart = DAY_START[(wd + 4) % 7];
  const nightNames: ChoghadiyaName[] = [];
  for (let i = 0; i < 8; i++) nightNames.push(CYCLE[(((nightStart - 2 * i) % 7) + 7) % 7]);
  return {
    day:   split(today.sunrise, today.sunset, dayNames, 'day'),
    night: split(today.sunset, tomorrow.sunrise, nightNames, 'night'),
    sunrise: today.sunrise,
    sunset:  today.sunset,
    nextSunrise: tomorrow.sunrise,
  };
}

/**
 * The choghadiya running at `now` and the one after it. Before today's
 * sunrise, yesterday's night half is used.
 */
export function getCurrentChoghadiya(
  now: Date,
  lat?: number | null,
  lng?: number | null,
): { current: ChoghadiyaSlot; next: ChoghadiyaSlot | null; table: Choghadiya } {
  let table = getChoghadiya(now, lat, lng);
  if (now < table.sunrise) {
    table = getChoghadiya(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12), lat, lng);
  }
  const all = [...table.day, ...table.night];
  let k = all.findIndex((s) => now >= s.start && now < s.end);
  if (k < 0) k = all.length - 1;
  let next: ChoghadiyaSlot | null = all[k + 1] ?? null;
  if (!next) next = getChoghadiya(new Date(table.nextSunrise.getTime() + 3600000), lat, lng).day[0];
  return { current: all[k], next, table };
}

// ─── Rahu Kaal, Yamaganda, Gulika ────────────────────────────────────────────

export type TimeWindow = { start: Date; end: Date };

/** 0-based eighth of the daytime, Sunday = 0 … Saturday = 6. */
const RAHU_PART      = [7, 1, 6, 4, 5, 3, 2];
const YAMAGANDA_PART = [4, 3, 2, 1, 0, 6, 5];
const GULIKA_PART    = [6, 5, 4, 3, 2, 1, 0];

function eighth(date: Date, table: number[], lat?: number | null, lng?: number | null): TimeWindow {
  const { sunrise, sunset } = getSunTimes(date, lat, lng);
  const part = (sunset.getTime() - sunrise.getTime()) / 8;
  const k = table[date.getDay()];
  return { start: new Date(sunrise.getTime() + k * part), end: new Date(sunrise.getTime() + (k + 1) * part) };
}

/** Rahu Kaal on the civil date of `date`. lat/lng default to Delhi. */
export function getRahuKaal(date: Date, lat?: number | null, lng?: number | null): TimeWindow {
  return eighth(date, RAHU_PART, lat, lng);
}

export function getYamaganda(date: Date, lat?: number | null, lng?: number | null): TimeWindow {
  return eighth(date, YAMAGANDA_PART, lat, lng);
}

export function getGulikaKaal(date: Date, lat?: number | null, lng?: number | null): TimeWindow {
  return eighth(date, GULIKA_PART, lat, lng);
}

/**
 * Abhijit muhurat: the 8th of 15 daytime muhurtas (centred on local noon).
 * Traditionally not used on Wednesdays; callers may show it anyway.
 */
export function getAbhijit(date: Date, lat?: number | null, lng?: number | null): TimeWindow {
  const { sunrise, sunset } = getSunTimes(date, lat, lng);
  const m = (sunset.getTime() - sunrise.getTime()) / 15;
  return { start: new Date(sunrise.getTime() + 7 * m), end: new Date(sunrise.getTime() + 8 * m) };
}

/**
 * Best daytime window for starting things: the first Amrit, else Shubh,
 * else Labh slot of the day that doesn't overlap Rahu Kaal.
 */
export function getBestWindow(date: Date, lat?: number | null, lng?: number | null): ChoghadiyaSlot | null {
  const { day } = getChoghadiya(date, lat, lng);
  const rahu = getRahuKaal(date, lat, lng);
  const clear = (s: ChoghadiyaSlot) => s.end <= rahu.start || s.start >= rahu.end;
  for (const name of ['Amrit', 'Shubh', 'Labh'] as ChoghadiyaName[]) {
    const hit = day.find((s) => s.name === name && clear(s));
    if (hit) return hit;
  }
  return null;
}
