/**
 * Local notifications for Astropedia.
 *
 * Two flavours:
 *  - Daily horoscope at 8 AM local time (repeating)
 *  - Transit alerts: scheduled 1 day before a slow planet (Sun/Mars/Jupiter/
 *    Saturn) changes sign, looking ahead 90 days
 *
 * Notifications are scheduled locally via expo-notifications — no push server,
 * no analytics, no remote config. Permissions are requested when the user
 * toggles a feature on for the first time.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ZODIAC } from '@/constants/astrology';
import { getChartPositions } from './astrology';
import { localDateIso } from './format';
import type { Profile } from './database';

// Categories so we can target-cancel each independently when toggled off.
const DAILY_HOROSCOPE_TAG = 'astropedia.daily_horoscope';
const TRANSIT_TAG_PREFIX  = 'astropedia.transit.';

// How far ahead to schedule transit reminders.
const TRANSIT_LOOKAHEAD_DAYS = 90;
const TRANSIT_PLANETS_OF_INTEREST = ['Sun', 'Mars', 'Jupiter', 'Saturn'];

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

// ─── Daily horoscope (8 AM local, repeats) ────────────────────────────────────

export async function scheduleDailyHoroscope(hour: number = 8): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDailyHoroscope();
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_HOROSCOPE_TAG,
    content: {
      title:  'Your day, written in the stars',
      body:   "Open Astropedia to see today's reading.",
      data:   { route: '/' },
    },
    trigger: {
      type:    Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute:  0,
    },
  });
}

export async function cancelDailyHoroscope(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_HOROSCOPE_TAG);
  } catch { /* not scheduled */ }
}

// ─── Transit alerts ───────────────────────────────────────────────────────────

type SignChange = {
  planet:   string;
  date:     Date;     // local date of the change
  newSign:  string;
};

/**
 * Walk day-by-day for each tracked planet, looking for the first sign-change
 * within TRANSIT_LOOKAHEAD_DAYS. Returns at most one upcoming change per
 * planet — the next major shift.
 */
function findUpcomingSignChanges(): SignChange[] {
  const today    = new Date();
  const todayIsoStr = localDateIso(today);
  const todayPos = getChartPositions({ birthDate: todayIsoStr, birthTime: '12:00' });
  const startSign: Record<string, number> = {};
  for (const p of todayPos) startSign[p.name] = p.signIndex;

  const found: SignChange[] = [];
  const stillSearching      = new Set(TRANSIT_PLANETS_OF_INTEREST);

  for (let offset = 1; offset <= TRANSIT_LOOKAHEAD_DAYS && stillSearching.size; offset++) {
    const d   = new Date(today.getTime() + offset * 86400000);
    const iso = localDateIso(d);
    const pos = getChartPositions({ birthDate: iso, birthTime: '12:00' });
    for (const p of pos) {
      if (!stillSearching.has(p.name)) continue;
      if (p.signIndex !== startSign[p.name]) {
        found.push({ planet: p.name, date: d, newSign: ZODIAC[p.signIndex].name });
        stillSearching.delete(p.name);
      }
    }
  }
  return found;
}

function transitBody(planet: string, newSign: string): string {
  const flavors: Record<string, string> = {
    Sun:     `Sun moves into ${newSign} tomorrow — a fresh chapter of focus and identity opens.`,
    Mars:    `Mars enters ${newSign} tomorrow — your drive and energy shift gear.`,
    Jupiter: `Jupiter moves into ${newSign} tomorrow — a wider, more generous season begins.`,
    Saturn:  `Saturn enters ${newSign} tomorrow — a slow, steady reshaping starts.`,
  };
  return flavors[planet] ?? `${planet} enters ${newSign} tomorrow.`;
}

export async function scheduleTransitAlerts(profile: Profile | null): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelTransitAlerts();
  const changes = findUpcomingSignChanges();

  for (const change of changes) {
    // Fire the notification at 9 AM local the day BEFORE the change.
    const fire = new Date(change.date.getTime() - 86400000);
    fire.setHours(9, 0, 0, 0);
    if (fire.getTime() <= Date.now()) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: TRANSIT_TAG_PREFIX + change.planet,
      content: {
        title: `${change.planet} is shifting`,
        body:  transitBody(change.planet, change.newSign),
        data:  { route: '/panchang', planet: change.planet },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
      },
    });
  }
  // Silence unused-profile warning while keeping the API future-proof for when
  // we want to weight transits against the user's natal chart.
  void profile;
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
