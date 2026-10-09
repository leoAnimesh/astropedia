/**
 * Muhurat finder: good windows over the next few days for a chosen activity.
 *
 * Deterministic, built on utils/panchang.ts. This is a deliberately simplified
 * traditional rule set, not a full muhurat calculation (no yoga, lagna or
 * travel direction rules; tara and chandra bala below, when a birth Moon is given):
 *
 *   1. The candidate window is Abhijit muhurat (1/15th of daylight around
 *      local solar noon).
 *   2. Any part of it that overlaps Rahu Kaal is cut away. If less than
 *      MIN_MINUTES remains, the day has no window. (Rahu Kaal touches Abhijit
 *      on Fridays, which end it at noon, and Wednesdays, which start it at noon.)
 *   3. Abhijit is skipped on Wednesdays, per tradition.
 *   4. The day's tithi (taken at midday) is checked against the rule table
 *      below. Avoided tithis remove the day; favoured ones are marked.
 *
 * Tithi numbers are 1–15 within a paksha (fortnight); Amavasya (new moon) is 30.
 *
 * Rule table:
 *   All activities avoid the Rikta ("empty") tithis, Chaturthi (4), Navami (9)
 *   and Chaturdashi (14), in both fortnights, and Amavasya. Everything else is
 *   allowed unless listed below.
 *
 *   Start work  favour 2, 3, 5, 7, 10, 11, 13 · also avoid Ashtami (8)
 *   Travel      favour 2, 3, 5, 7, 10, 11, 13 · also avoid Shashthi (6),
 *               Ashtami (8), Dwadashi (12) and Purnima (15)
 *   Buy         favour 2, 3, 5, 7, 10, 11, 13, Purnima (15)
 *   Sign        favour 2, 3, 5, 7, 10, 11, 13 · also avoid Ashtami (8)
 *
 *   The waxing fortnight (Shukla) is noted as a plus for every activity.
 *
 * Personal strength (when a birth Moon is given, as the chat does for the
 * person asking): the two classical checks every muhurat text applies on top
 * of the panchang, computed for each day and left to the caller to rank by.
 *
 *   Tara Bala   Count the day's nakshatra from the birth nakshatra (birth star
 *               = 1) and take the count modulo 9 (9 for 0). The nine taras are
 *               1 Janma, 2 Sampat, 3 Vipat, 4 Kshema, 5 Pratyari, 6 Sadhaka,
 *               7 Naidhana (Vadha), 8 Mitra, 9 Parama Mitra. Vipat (3),
 *               Pratyari (5) and Naidhana (7) are inauspicious and avoided;
 *               the rest are usable.
 *   Chandra Bala  The house of the day's (transit) Moon sign counted from the
 *               natal Moon sign. 1, 3, 6, 7, 10 and 11 are favourable; the
 *               others are weak (8th, the Moon's own ashtama, is the worst).
 *
 *   Sources: Muhurta Chintamani (Daivajna Rama, 1600), shubhashubha prakarana,
 *   on tara and chandra bala; B. V. Raman, "Muhurtha (Electional Astrology)",
 *   chapter on Tarabala and Chandrabala, which gives the same 3/5/7 taras to
 *   avoid and 1/3/6/7/10/11 as the good Moon houses. Both take the Moon at the
 *   time of the event; we use the Moon at local noon, like the panchang here.
 *   Tara Bala outranks Chandra Bala in both texts ("when the tara is good, a
 *   middling Moon is tolerated"), which is the ranking the chat uses.
 *
 * Day labels and reasons are display text in the app language (namespace
 * `muhurat`). ACTIVITIES and shortDay() stay English: they build the question
 * sent to the on-device model.
 */

import {
  getPanchang,
  formatHourLocal,
  formatWindow,
  formatWindowLocal,
  type Panchang,
  type Window,
} from './panchang';
import { localDateIso } from './format';
import i18n, { formatDayDate, tTithi } from './i18n';
import { getMoonLongitudeExact } from './astrology';

export type Activity = 'work' | 'travel' | 'buy' | 'sign';

/**
 * English label/verb are for the model's question; screens show
 * `muhurat:activity.<id>.label` / `.windows`.
 */
export const ACTIVITIES: { id: Activity; label: string; verb: string }[] = [
  { id: 'work',   label: 'Start work', verb: 'start work' },
  { id: 'travel', label: 'Travel',     verb: 'travel' },
  { id: 'buy',    label: 'Buy',        verb: 'buy' },
  { id: 'sign',   label: 'Sign',       verb: 'sign' },
];

const RIKTA = [4, 9, 14];
const AMAVASYA = 30;
const GOOD_STARTS = [2, 3, 5, 7, 10, 11, 13];

type Rule = { favour: number[]; avoid: number[] };

const RULES: Record<Activity, Rule> = {
  work:   { favour: GOOD_STARTS,         avoid: [...RIKTA, 8] },
  travel: { favour: GOOD_STARTS,         avoid: [...RIKTA, 6, 8, 12, 15] },
  buy:    { favour: [...GOOD_STARTS, 15], avoid: RIKTA },
  sign:   { favour: GOOD_STARTS,         avoid: [...RIKTA, 8] },
};

/** Shortest usable window once Rahu Kaal is cut away. */
const MIN_MINUTES = 20;

export type MuhuratDay = {
  date:      string;          // YYYY-MM-DD
  isToday:   boolean;
  /** Display label in the app language: "Today · Sat, 3 Oct" / "Sun, 4 Oct". */
  dayLabel:  string;
  tithi:     string;          // "Krishna Shashthi" (English; tTithi() for display)
  /** Present when the day has a good window. */
  window:    Window | null;
  timeLabel: string | null;   // "11:12 AM – 11:59 AM" (English; goes into the Saga question)
  /** The same window formatted in the app language, for display. */
  displayTime: string | null;
  /** Short reasons in the app language, joined with " · " in the UI. */
  reasons:   string[];
  /** Tithi is in the activity's favoured list. */
  favoured:  boolean;
  /** Today's window has already ended. */
  passed:    boolean;
  /** With a birth Moon: the day's tara (1–9) from the birth star, and the transit Moon's house from the natal Moon. */
  tara?:     number;
  chandra?:  number;
  /** Tara Bala usable (not the 3rd, 5th or 7th tara) / Chandra Bala favourable (1, 3, 6, 7, 10, 11). */
  taraOk?:   boolean;
  chandraOk?: boolean;
};

/** The person's natal Moon (sidereal longitude, degrees), for Tara Bala and Chandra Bala. */
export type BirthMoon = { moonLon: number };

const NAK = 360 / 27;
/** Inauspicious taras: Vipat (3), Pratyari (5), Naidhana (7). */
export const BAD_TARAS = [3, 5, 7];
/** Favourable houses of the transit Moon from the natal Moon. */
export const GOOD_CHANDRA = [1, 3, 6, 7, 10, 11];

/** Tara (1–9) of a day whose Moon is at `dayMoonLon`, counted from the birth nakshatra (birth star = 1). */
export function taraOf(birthMoonLon: number, dayMoonLon: number): number {
  const b = Math.floor((((birthMoonLon % 360) + 360) % 360) / NAK);
  const d = Math.floor((((dayMoonLon % 360) + 360) % 360) / NAK);
  const count = ((d - b + 27) % 27) + 1;
  return ((count - 1) % 9) + 1;
}

/** House (1–12) of the transit Moon sign counted from the natal Moon sign. */
export function chandraHouse(birthMoonLon: number, dayMoonLon: number): number {
  const b = Math.floor((((birthMoonLon % 360) + 360) % 360) / 30);
  const d = Math.floor((((dayMoonLon % 360) + 360) % 360) / 30);
  return ((d - b + 12) % 12) + 1;
}

/** Tara Bala and Chandra Bala of a date for a natal Moon (the Moon at local noon of that date). */
export function personalStrength(dateIso: string, birth: BirthMoon): { tara: number; chandra: number; taraOk: boolean; chandraOk: boolean } {
  const moon = getMoonLongitudeExact(dateIso, '12:00');
  const tara = taraOf(birth.moonLon, moon);
  const chandra = chandraHouse(birth.moonLon, moon);
  return { tara, chandra, taraOk: !BAD_TARAS.includes(tara), chandraOk: GOOD_CHANDRA.includes(chandra) };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat, Oct 3" in English, for the model's question. Screens use formatDayDate(). */
export function shortDay(dateIso: string): string {
  const d = new Date(dateIso + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Tithi number within its fortnight, 1–15, or 30 for Amavasya. */
function tithiNumber(p: Panchang): number {
  if (p.tithi.index === 30) return AMAVASYA;
  return p.tithi.index > 15 ? p.tithi.index - 15 : p.tithi.index;
}

/** Abhijit with any Rahu Kaal overlap removed; keeps the longer remaining piece. */
function clearOfRahu(abhijit: Window, rahu: Window): { window: Window; clipped: boolean } {
  const overlaps = rahu.startHour < abhijit.endHour && rahu.endHour > abhijit.startHour;
  if (!overlaps) return { window: abhijit, clipped: false };
  const before: Window = { startHour: abhijit.startHour, endHour: Math.min(abhijit.endHour, rahu.startHour) };
  const after:  Window = { startHour: Math.max(abhijit.startHour, rahu.endHour), endHour: abhijit.endHour };
  const len = (w: Window) => Math.max(0, w.endHour - w.startHour);
  return { window: len(before) >= len(after) ? before : after, clipped: true };
}

export function evaluateDay(
  dateIso: string,
  activity: Activity,
  lat?: number | null,
  lng?: number | null,
  now: Date = new Date(),
): MuhuratDay {
  const p = getPanchang(dateIso, lat, lng);
  const isToday = dateIso === localDateIso(now);
  const day     = formatDayDate(new Date(dateIso + 'T12:00:00'));
  const tithi   = tTithi(p.tithi.name);
  const base = {
    date:     dateIso,
    isToday,
    dayLabel: isToday ? i18n.t('muhurat:todayLabel', { day }) : day,
    tithi:    p.tithi.name,
  };
  const none = (reason: string): MuhuratDay => ({
    ...base, window: null, timeLabel: null, displayTime: null, reasons: [reason], favoured: false, passed: false,
  });

  if (p.vara.index === 3) return none(i18n.t('muhurat:reason.wednesday'));

  const num  = tithiNumber(p);
  const rule = RULES[activity];
  const avoidFor = i18n.t(`muhurat:activity.${activity}.avoidFor`);
  if (num === AMAVASYA) return none(i18n.t('muhurat:reason.amavasya'));
  if (RIKTA.includes(num)) return none(i18n.t('muhurat:reason.rikta', { tithi, avoidFor }));
  if (rule.avoid.includes(num)) {
    return none(i18n.t('muhurat:reason.avoided', { tithi, avoidFor }));
  }

  const { window, clipped } = clearOfRahu(p.abhijit, p.rahuKaal);
  if ((window.endHour - window.startHour) * 60 < MIN_MINUTES) {
    return none(i18n.t('muhurat:reason.rahuCovers'));
  }

  const favoured = rule.favour.includes(num);
  const reasons = [i18n.t('muhurat:reason.abhijit'), tithi];
  if (favoured) {
    reasons.push(i18n.t(p.tithi.paksha === 'Shukla' ? 'muhurat:reason.favouredWaxing' : 'muhurat:reason.favoured'));
  } else if (p.tithi.paksha === 'Shukla') {
    reasons.push(i18n.t('muhurat:reason.waxing'));
  }
  reasons.push(i18n.t(clipped ? 'muhurat:reason.trimmed' : 'muhurat:reason.clear'));

  const nowHour = now.getHours() + now.getMinutes() / 60;
  return {
    ...base,
    window,
    timeLabel: formatWindow(window),
    displayTime: formatWindowLocal(window),
    reasons,
    favoured,
    passed: isToday && nowHour >= window.endHour,
  };
}

export function findMuhurats(
  activity: Activity,
  lat?: number | null,
  lng?: number | null,
  days = 7,
  now: Date = new Date(),
  birth?: BirthMoon | null,
): MuhuratDay[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const out: MuhuratDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
    const iso = localDateIso(d);
    const day = evaluateDay(iso, activity, lat, lng, now);
    out.push(birth && Number.isFinite(birth.moonLon) ? { ...day, ...personalStrength(iso, birth) } : day);
  }
  return out;
}

export type TodayTimings = {
  date:     string;
  tithi:    string;          // English; tTithi() for display
  sunrise:  string;
  sunset:   string;
  rahuKaal: string;
  abhijit:  string;
};

export function getTodayTimings(dateIso: string, lat?: number | null, lng?: number | null): TodayTimings {
  const p = getPanchang(dateIso, lat, lng);
  return {
    date:     dateIso,
    tithi:    p.tithi.name,
    sunrise:  formatHourLocal(p.sunrise),
    sunset:   formatHourLocal(p.sunset),
    rahuKaal: formatWindowLocal(p.rahuKaal),
    abhijit:  formatWindowLocal(p.abhijit),
  };
}
