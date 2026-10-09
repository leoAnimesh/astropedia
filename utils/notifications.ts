/**
 * Local notifications for Astropedia.
 *
 * Two flavours:
 *  - Daily horoscope at 8 AM local time: the next 7 days scheduled one by one,
 *    each showing that day's Moon nakshatra and tithi
 *  - Transit alerts: scheduled 1 day before a slow planet (Sun/Mars/Jupiter/
 *    Saturn) changes sign, looking ahead 90 days
 *
 * Notifications are scheduled locally via expo-notifications — no push server,
 * no analytics, no remote config. Permissions are requested when the user
 * toggles a feature on for the first time.
 *
 * Titles and bodies are written in the app language at scheduling time
 * (namespace `alerts`, keys `notify.*`); a language change re-schedules them.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { localDateIso } from './format';
import i18n, { intlLocale, localizeTime, tNakshatra, tPlanet, tSign, tTithi } from './i18n';
import { getPanchang } from './panchang';
import { explainTransit, getUpcomingPhaseAlerts, getUpcomingTransits } from './transits';
import { getAllProfiles, isSystemProfile, type Profile } from './database';
import { Storage } from './storage';
import { getRahuKaal } from './choghadiya';
import { festivalDate, getFestivals } from './festivals';

// Categories so we can target-cancel each independently when toggled off.
const DAILY_HOROSCOPE_TAG = 'astropedia.daily_horoscope';
const TRANSIT_TAG_PREFIX  = 'astropedia.transit.';
const RAHU_KAAL_TAG       = 'astropedia.rahu_kaal';

/** iOS keeps at most 64 pending local notifications per app (the rest are dropped silently). */
const IOS_PENDING_LIMIT = 64;
/** Head-room under that limit (a reschedule briefly overlapping, future kinds). */
const PENDING_MARGIN = 4;

// Every schedule/cancel runs one at a time. Launch, app-foreground, Settings,
// the Festivals screen and restore can all call these at once; without the
// queue a cancel could interleave with another call's scheduling (a reminder
// left behind after its toggle was turned off) and the festival budget would
// count a half-built set.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// ─── Setup (call once at app start) ───────────────────────────────────────────

let _setup = false;

export function setupNotifications(): void {
  if (_setup || Platform.OS === 'web') return;
  _setup = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  false,
      shouldSetBadge:   false,
    }),
  });
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  // Android 13+ only shows the POST_NOTIFICATIONS prompt once a channel exists.
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Astropedia',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    } catch { /* non-fatal */ }
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  }
  return false;
}

// ─── Daily horoscope (next 7 days, refreshed on app foreground) ──────────────

/**
 * A repeating DAILY trigger can only carry fixed text, so instead we schedule
 * the next DAILY_WINDOW_DAYS mornings as individual DATE notifications, each
 * with that day's Moon nakshatra and tithi. app/_layout.tsx re-calls
 * scheduleDailyHoroscope() whenever the app comes to the foreground, which
 * slides the window forward.
 */
const DAILY_WINDOW_DAYS = 7;

function dailyBody(dateIso: string): string {
  const p = getPanchang(dateIso);
  return i18n.t('alerts:notify.dailyBody', { nakshatra: tNakshatra(p.nakshatra.name), tithi: tTithi(p.tithi.name) });
}

export function scheduleDailyHoroscope(hour: number = 8): Promise<void> {
  return serial(() => scheduleDailyHoroscopeNow(hour));
}

async function scheduleDailyHoroscopeNow(hour: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDailyHoroscopeNow();
  const now = new Date();
  let scheduled = 0;
  // Start from today (skipped if the hour has passed) and fill 7 mornings.
  for (let offset = 0; scheduled < DAILY_WINDOW_DAYS; offset++) {
    const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, 0, 0, 0);
    if (fire.getTime() <= now.getTime()) continue;
    const iso = localDateIso(fire);
    await Notifications.scheduleNotificationAsync({
      identifier: `${DAILY_HOROSCOPE_TAG}.${iso}`,
      content: {
        title: i18n.t('alerts:notify.dailyTitle'),
        body:  dailyBody(iso),
        data:  { route: '/' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
      },
    });
    scheduled++;
  }
}

export function cancelDailyHoroscope(): Promise<void> {
  return serial(cancelDailyHoroscopeNow);
}

async function cancelDailyHoroscopeNow(): Promise<void> {
  if (Platform.OS === 'web') return;
  // Legacy single repeating notification (pre per-day scheduling).
  try { await Notifications.cancelScheduledNotificationAsync(DAILY_HOROSCOPE_TAG); } catch { /* not scheduled */ }
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(DAILY_HOROSCOPE_TAG + '.')) {
      try { await Notifications.cancelScheduledNotificationAsync(n.identifier); } catch {}
    }
  }
}

// ─── Transit alerts ───────────────────────────────────────────────────────────

const TRANSIT_BODY_PLANETS = new Set(['Sun', 'Mars', 'Jupiter', 'Saturn']);

function transitBody(planet: string, newSign: string): string {
  const vars = { planet: tPlanet(planet), sign: tSign(newSign) };
  return TRANSIT_BODY_PLANETS.has(planet)
    ? i18n.t(`alerts:notify.transitBody.${planet}`, vars)
    : i18n.t('alerts:notify.transitBody.other', vars);
}

export function scheduleTransitAlerts(profile: Profile | null): Promise<void> {
  return serial(() => scheduleTransitAlertsNow(profile));
}

async function scheduleTransitAlertsNow(profile: Profile | null): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelTransitAlertsNow();

  // Who the personal parts of these alerts were written for; carried in every
  // payload so a tap after switching profiles still opens the right person.
  const who = profile ?? await resolveActiveProfile();
  const pid = who?.id;
  const alertRoute = (id: string) => (pid ? `/alerts/${id}?profileId=${encodeURIComponent(pid)}` : `/alerts/${id}`);

  for (const change of getUpcomingTransits()) {
    // Fire the notification at 9 AM local the day BEFORE the change.
    const fire = new Date(change.date.getTime() - 86400000);
    fire.setHours(9, 0, 0, 0);
    if (fire.getTime() <= Date.now()) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: TRANSIT_TAG_PREFIX + change.planet,
      content: {
        title: i18n.t('alerts:notify.transitTitle', { planet: tPlanet(change.planet) }),
        body:  transitBody(change.planet, change.toSign),
        data:  { route: alertRoute(change.id), planet: change.planet, profileId: pid },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
      },
    });
  }

  // Personal life-phase turns: a reminder a week before. Callers usually pass
  // null, so fall back to the active profile (or "you").
  for (const phase of getUpcomingPhaseAlerts(who)) {
    const fire = new Date(phase.date.getTime() - 7 * 86400000);
    fire.setHours(9, 0, 0, 0);
    if (fire.getTime() <= Date.now()) continue;
    const { title, lines } = explainTransit(phase, who);
    await Notifications.scheduleNotificationAsync({
      identifier: TRANSIT_TAG_PREFIX + phase.id,
      content: {
        title: i18n.t('alerts:notify.phaseTitle', { title }),
        body:  lines[0],
        data:  { route: alertRoute(phase.id), profileId: pid },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
      },
    });
  }
}

async function resolveActiveProfile(): Promise<Profile | null> {
  try {
    const all = (await getAllProfiles()).filter((p) => !isSystemProfile(p.id));
    const activeId = Storage.getActiveProfileId();
    return all.find((p) => p.id === activeId) ?? all.find((p) => p.isYou) ?? all[0] ?? null;
  } catch {
    return null;
  }
}

export function cancelTransitAlerts(): Promise<void> {
  return serial(cancelTransitAlertsNow);
}

async function cancelTransitAlertsNow(): Promise<void> {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(TRANSIT_TAG_PREFIX)) {
      try { await Notifications.cancelScheduledNotificationAsync(n.identifier); } catch {}
    }
  }
}

// ─── Rahu Kaal heads-up (opt-in) ──────────────────────────────────────────────

/** Minutes before Rahu Kaal starts that the heads-up fires. */
const RAHU_LEAD_MIN = 15;
const RAHU_WINDOW_DAYS = 7;

function clock(d: Date): string {
  return localizeTime(d.toLocaleTimeString(intlLocale(), { hour: 'numeric', minute: '2-digit' }));
}

/**
 * The next RAHU_WINDOW_DAYS Rahu Kaal windows, each announced RAHU_LEAD_MIN
 * minutes before it starts. Computed for the active profile's birth place
 * (like the Home sky strip and Panchang; Delhi when unknown). Re-run on app
 * foreground (app/_layout.tsx) so the window slides forward.
 */
export function scheduleRahuKaalHeadsUp(): Promise<void> {
  return serial(scheduleRahuKaalHeadsUpNow);
}

async function scheduleRahuKaalHeadsUpNow(): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelRahuKaalHeadsUpNow();
  const who = await resolveActiveProfile();
  const now = new Date();
  for (let offset = 0; offset < RAHU_WINDOW_DAYS + 1; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
    const { start, end } = getRahuKaal(day, who?.birthLat ?? null, who?.birthLng ?? null);
    const fire = new Date(start.getTime() - RAHU_LEAD_MIN * 60000);
    if (fire.getTime() <= now.getTime()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${RAHU_KAAL_TAG}.${localDateIso(day)}`,
      content: {
        title: i18n.t('alerts:notify.rahuTitle'),
        body:  i18n.t('alerts:notify.rahuBody', { start: clock(start), end: clock(end) }),
        data:  { route: '/panchang' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire },
    });
  }
}

export function cancelRahuKaalHeadsUp(): Promise<void> {
  return serial(cancelRahuKaalHeadsUpNow);
}

async function cancelRahuKaalHeadsUpNow(): Promise<void> {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(RAHU_KAAL_TAG + '.')) {
      try { await Notifications.cancelScheduledNotificationAsync(n.identifier); } catch {}
    }
  }
}

// ─── Festival & vrat reminders (opt-in) ───────────────────────────────────────

/**
 * Day-before reminders (8 AM) for festivals and vrats from utils/festivals.ts,
 * computed for the active profile's birth place (Delhi when unknown), like the
 * Panchang and Festivals screens.
 *
 * Two inputs:
 * - the Settings toggle (Storage.getFestivalReminders): every major festival,
 *   Ekadashi, Purnima and Amavasya in the next FESTIVAL_WINDOW_DAYS;
 * - the per-festival "Remind me" switch on the Festivals screen
 *   (Storage.getFestivalRemind(id)): true adds that one (up to a year ahead),
 *   false mutes it even when the Settings toggle is on.
 * Re-run whenever either changes, on app start/foreground and after a
 * language change; it cancels and rebuilds the whole set. To turn the Settings
 * toggle off, call this again (not cancelFestivalReminders), so the
 * per-festival picks survive.
 */
export const FESTIVAL_TAG_PREFIX = 'astropedia.festival.';

/** Global-toggle horizon; explicit per-festival picks look up to a year ahead. */
const FESTIVAL_WINDOW_DAYS = 60;
const FESTIVAL_PICK_DAYS = 370;
/** At most this many; fewer when the other kinds leave less room under IOS_PENDING_LIMIT. */
const FESTIVAL_MAX = 24;
const FESTIVAL_HOUR = 8;
const GLOBAL_RULES = new Set(['purnima', 'amavasya', 'ekadashi-shukla', 'ekadashi-krishna']);

export function scheduleFestivalReminders(opts: { global?: boolean } = {}): Promise<void> {
  return serial(() => scheduleFestivalRemindersNow(opts));
}

async function scheduleFestivalRemindersNow(opts: { global?: boolean }): Promise<void> {
  if (Platform.OS === 'web') return;
  await clearFestivalNotifications();
  // Festivals fill what the daily reading, transit/phase alerts and Rahu Kaal
  // heads-ups leave free (they are scheduled first; see refreshScheduledNotifications).
  const pending = (await Notifications.getAllScheduledNotificationsAsync()).length;
  const budget = Math.max(0, Math.min(FESTIVAL_MAX, IOS_PENDING_LIMIT - PENDING_MARGIN - pending));
  if (budget === 0) return;
  const all = opts.global ?? Storage.getFestivalReminders();
  const who = await resolveActiveProfile();
  const now = new Date();
  const until = new Date(now.getTime() + FESTIVAL_PICK_DAYS * 86400000);
  const globalUntil = localDateIso(new Date(now.getTime() + FESTIVAL_WINDOW_DAYS * 86400000));
  const events = getFestivals(now, until, { lat: who?.birthLat ?? null, lng: who?.birthLng ?? null });
  let count = 0;
  for (const e of events) {
    if (count >= budget) break;
    const pick = Storage.getFestivalRemind(e.id);
    const wanted = pick ?? (all && e.date <= globalUntil && (e.major || GLOBAL_RULES.has(e.ruleId)));
    if (!wanted) continue;
    const day = festivalDate(e);
    const fire = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, FESTIVAL_HOUR, 0, 0, 0);
    if (fire.getTime() <= now.getTime()) continue;
    const name = i18n.t(`festivals:${e.nameKey}`);
    const date = day.toLocaleDateString(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    await Notifications.scheduleNotificationAsync({
      identifier: FESTIVAL_TAG_PREFIX + e.id,
      content: {
        title: i18n.t('festivals:notify.title', { name }),
        body:  i18n.t('festivals:notify.body', { name, date }),
        data:  { route: `/festivals?focus=${encodeURIComponent(e.id)}&date=${e.date}`, festival: e.id, date: e.date },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire },
    });
    count++;
  }
}

/** Remove every scheduled festival notification. */
async function clearFestivalNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(FESTIVAL_TAG_PREFIX)) {
      try { await Notifications.cancelScheduledNotificationAsync(n.identifier); } catch {}
    }
  }
}

/**
 * The Settings toggle turned off: drop the toggle's reminders but keep the
 * ones the user switched on for single festivals on the Festivals screen.
 */
export function cancelFestivalReminders(): Promise<void> {
  return serial(() => scheduleFestivalRemindersNow({ global: false }));
}

// ─── Launch / foreground refresh ──────────────────────────────────────────────

/**
 * Rebuild every reminder set from the current toggles, language, place and
 * date (app/_layout.tsx: on launch and whenever the app comes to the
 * foreground). One at a time, festivals last so they get what is left of the
 * iOS budget. Festival reminders always run: they handle the Settings toggle
 * being off (only per-festival picks stay) and drop stale ones. Each step is
 * idempotent: it cancels its own identifiers before scheduling.
 */
export async function refreshScheduledNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  const steps: [boolean, () => Promise<void>][] = [
    [Storage.getDailyHoroscopePush(), () => scheduleDailyHoroscope()],
    [Storage.getTransitAlerts(),      () => scheduleTransitAlerts(null)],
    [Storage.getRahuKaalPush(),       scheduleRahuKaalHeadsUp],
    [true,                            () => scheduleFestivalReminders()],
  ];
  for (const [on, run] of steps) {
    if (!on) continue;
    try { await run(); } catch { /* best-effort: one failing kind must not stop the rest */ }
  }
}
