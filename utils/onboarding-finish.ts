import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { resetOnboardingDraft } from '@/app/(onboarding)/_store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { requestModelOverlay } from '@/utils/model-download';
import { Storage } from '@/utils/storage';
import { scheduleDailyHoroscope, scheduleTransitAlerts } from '@/utils/notifications';

/**
 * True when notifications are already allowed (iOS provisional counts).
 * Any failure resolves to false so the onboarding step is shown as usual.
 */
export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const p = await Notifications.getPermissionsAsync();
    return (
      p.granted ||
      p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

/** Same storage flags + schedulers the Settings toggles use. */
export async function applyNotificationChoices(opts: { daily: boolean; transit: boolean }) {
  try {
    if (opts.daily) {
      Storage.setDailyHoroscopePush(true);
      await scheduleDailyHoroscope();
    }
    if (opts.transit) {
      Storage.setTransitAlerts(true);
      await scheduleTransitAlerts(null);
    }
  } catch { /* app/_layout re-schedules on next launch/foreground */ }
}

// Flipping the store makes the <Stack.Protected> guards in the root layout
// swap into the app stack — no imperative navigation needed.
// If Saga's model is still downloading, the root layout shows the
// "Preparing Saga…" overlay over home until it's ready.
export function finishOnboarding() {
  resetOnboardingDraft();
  requestModelOverlay();
  useOnboardingStore.getState().setDone(true);
}

/**
 * Called after the profile is saved. If permission is already granted, apply the
 * screen's default toggles (daily + transit on) and finish; returns true.
 * Otherwise returns false and the caller shows the notifications step.
 */
export async function skipNotificationsStepIfGranted(): Promise<boolean> {
  if (!(await isNotificationPermissionGranted())) return false;
  await applyNotificationChoices({ daily: true, transit: true });
  finishOnboarding();
  return true;
}
