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
import i18n, { tNakshatra, tPlanet, tSign, tTithi } from './i18n';
import { getPanchang } from './panchang';
import { explainTransit, getUpcomingPhaseAlerts, getUpcomingTransits } from './transits';
import { getAllProfiles, isSystemProfile, type Profile } from './database';
import { Storage } from './storage';

// Categories so we can target-cancel each independently when toggled off.
const DAILY_HOROSCOPE_TAG = 'astropedia.daily_horoscope';
const TRANSIT_TAG_PREFIX  = 'astropedia.transit.';

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

export async function scheduleDailyHoroscope(hour: number = 8): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDailyHoroscope();
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

export async function cancelDailyHoroscope(): Promise<void> {
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

export async function scheduleTransitAlerts(profile: Profile | null): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelTransitAlerts();

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
        data:  { route: `/alerts/${change.id}`, planet: change.planet },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
      },
    });
  }

  // Personal life-phase turns: a reminder a week before. Callers usually pass
  // null, so fall back to the active profile (or "you").
  const who = profile ?? await resolveActiveProfile();
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
        data:  { route: `/alerts/${phase.id}` },
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

export async function cancelTransitAlerts(): Promise<void> {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(TRANSIT_TAG_PREFIX)) {
      try { await Notifications.cancelScheduledNotificationAsync(n.identifier); } catch {}
    }
  }
}
