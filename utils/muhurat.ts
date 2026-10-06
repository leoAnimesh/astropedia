/**
 * Muhurat finder: good windows over the next few days for a chosen activity.
 *
 * Deterministic, built on utils/panchang.ts. This is a deliberately simplified
 * traditional rule set, not a full muhurat calculation (no nakshatra, yoga,
 * lagna, tara-bala, chandra-bala or travel direction rules):
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
};

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
): MuhuratDay[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const out: MuhuratDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
    out.push(evaluateDay(localDateIso(d), activity, lat, lng, now));
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
