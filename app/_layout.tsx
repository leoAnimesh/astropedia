import { useEffect, useState } from 'react';
import { Stack, router, type ErrorBoundaryProps, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider } from '@/components/keyboard';
import { AppState, LogBox, StyleSheet } from 'react-native';
import {
  useFonts,
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import 'react-native-reanimated';
import i18n from '@/utils/i18n';   // initialise translations before first render

import { initDatabase, getAllProfiles, getAllThreads, isSystemProfile, chatsMovedToGurus } from '@/utils/database';
import { Storage } from '@/utils/storage';
import { useProfileStore } from '@/stores/profile-store';
import { useThreadStore } from '@/stores/thread-store';
import { useSeenStore } from '@/stores/seen-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { OverlayProvider, showDialog } from '@/components/overlays';
import { unloadLocalLLM } from '@/utils/local-llm';
import { handleModelAppState, startModelSetup, useModelSetup } from '@/utils/model-download';
import { resumePendingModelSwitch } from '@/utils/model-switch';
import { ModelSetupOverlay } from '@/components/overlays/ModelSetupOverlay';
import { setupNotifications, refreshScheduledNotifications } from '@/utils/notifications';
import { installGlobalErrorHandlers, logger } from '@/utils/logger';
import { AppErrorScreen } from '@/components/errors/AppErrorScreen';

// Uncaught errors and unhandled promise rejections are recorded (logged only;
// production prints nothing). Render errors land on ErrorBoundary below.
installGlobalErrorHandlers();

SplashScreen.preventAutoHideAsync();

// HuggingFace CDN doesn't send content-length headers for tokenizer JSON files —
// this is expected and harmless; the download succeeds via chunked transfer.
LogBox.ignoreLogs(['[React Native ExecuTorch] No content-length header']);

// The on-device model downloads from Hugging Face on first launch
// (utils/model-download.ts). Start as early as possible so it is usually
// done by the end of onboarding; a verified install is found in milliseconds.
startModelSetup();

/** Any render error below the root: a friendly en/hi/bn recovery screen (restart / try again / share details). */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorScreen {...props} />;
}

export const unstable_settings = {
  anchor: '(app)',
};

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  // Reactive onboarding-done flag — drives the <Stack.Protected> guards.
  // When this flips to true (after the birth-place step creates the profile), the router
  // automatically redirects out of the onboarding stack into the app stack.
  const onboardingDone = useOnboardingStore((s) => s.done);
  // "Preparing Saga…" overlay owed after onboarding (model still downloading).
  const modelOverlay = useModelSetup((s) => s.overlayPending);

  const [fontsLoaded, fontError] = useFonts({
    'InstrumentSerif-Regular': InstrumentSerif_400Regular,
    'InstrumentSerif-Italic':  InstrumentSerif_400Regular_Italic,
    'Geist-Regular':           Geist_400Regular,
    'Geist-Medium':            Geist_500Medium,
    'Geist-SemiBold':          Geist_600SemiBold,
    'GeistMono-Regular':       GeistMono_400Regular,
  });

  useEffect(() => {
    async function bootstrap() {
      try {
        await initDatabase();
        // A model switch killed between its commit and its chat wipe: finish
        // the wipe before the stores load the old chats.
        await resumePendingModelSwitch().catch(() => {});
        // Existing chats were just regrouped by guru (schema v7): the Chat
        // tab owes a one-time explanation. Never on fresh installs.
        if (chatsMovedToGurus() && !Storage.getGuruNoticeSeen()) Storage.setGuruNoticePending(true);
        // The on-device model loads on demand (~1 s) the first time a chat or
        // chart reading needs it, once utils/model-download.ts installed it.
        const [allProfiles, threads] = await Promise.all([
          getAllProfiles(),
          getAllThreads(),
        ]);

        // Hydrate Zustand from SQLite — but hide synthetic system profiles
        // (e.g. __krishna__) that only exist to anchor Krishna-mode threads
        // to a valid profile_id. They must never appear in the switcher.
        const profiles = allProfiles.filter((p) => !isSystemProfile(p.id));
        useProfileStore.getState().setProfiles(profiles);

        // A profile exists but onboarding was never marked done: the app was
        // closed on the optional notifications step (birth-place saves the
        // profile first). Don't restart onboarding — it would create a second
        // "you" profile — treat it as finished; Settings has the toggles.
        // MMKV and SQLite both live in the app sandbox, so a reinstall wipes
        // both and lands on the language picker.
        if (profiles.length > 0 && !useOnboardingStore.getState().done) {
          Storage.clearOnboardingDraft();
          useOnboardingStore.getState().setDone(true);
        }

        // Chats that existed before guru chats were read already: no unread dots.
        if (chatsMovedToGurus()) useSeenStore.getState().markAllSeen(threads);

        const byProfile: Record<string, typeof threads> = {};
        for (const t of threads) {
          (byProfile[t.profileId] ??= []).push(t);
        }
        const ts = useThreadStore.getState();
        for (const [pid, arr] of Object.entries(byProfile)) {
          ts.setThreads(pid, arr);
        }

        // Restore active profile
        const savedId = Storage.getActiveProfileId();
        if (savedId && profiles.some((p) => p.id === savedId)) {
          useProfileStore.getState().setActiveProfileId(savedId);
        } else if (profiles.length > 0) {
          const self = profiles.find((p) => p.isYou) ?? profiles[0];
          useProfileStore.getState().setActiveProfileId(self.id);
          Storage.setActiveProfileId(self.id);
        }

        // Notifications: register handler and refresh any user-enabled
        // schedules. Daily push self-repeats; transit alerts need to be
        // re-scheduled occasionally so the 90-day window stays fresh.
        // Festival reminders run even with the Settings toggle off (per-festival
        // picks, stale ones from another language). Sequential and idempotent.
        setupNotifications();
        refreshScheduledNotifications().catch(() => {});
      } catch (e) {
        logger.error('Bootstrap error', e);
      } finally {
        setDbReady(true);
      }
    }
    bootstrap();
  }, []);

  // Background/foreground hooks:
  //  - background : free model RAM (~150 MB)
  //  - active     : re-anchor scheduled notifications to the current local
  //                 timezone so DST shifts and travel don't move the 8 AM
  //                 daily push off-target.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      // Model download: resume / retry when the app comes back.
      handleModelAppState(next);
      if (next === 'background' || next === 'inactive') {
        unloadLocalLLM();
      } else if (next === 'active') {
        refreshScheduledNotifications().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Notification taps open the screen named in the notification's data
  // (an alert detail, or home for the daily reading). Waits for the stores to
  // be hydrated and onboarding to be done, so the target route exists. Also
  // handles the tap that launched the app.
  useEffect(() => {
    if (!dbReady || !onboardingDone) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      const route = data?.route;
      if (typeof route !== 'string') return;
      // Profile-specific notifications: show that person's data, whoever is
      // active now. A deleted profile falls back to Home with a gentle note.
      const pid = data?.profileId;
      if (typeof pid === 'string' && pid) {
        const ps = useProfileStore.getState();
        if (!ps.profiles.some((p) => p.id === pid)) {
          router.navigate('/');
          showDialog({ title: i18n.t('alerts:notify.goneTitle'), message: i18n.t('alerts:notify.goneMessage') });
          return;
        }
        if (ps.activeProfileId !== pid) {
          ps.setActiveProfileId(pid);
          Storage.setActiveProfileId(pid);
        }
      }
      // The daily reading ('/') returns to Home even when the app was left on
      // another screen; everything else opens over the current stack.
      if (route === '/') router.navigate('/');
      else router.push(route as Href);
    };
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        open(response);
        // Handled once; don't reopen the same screen on the next launch.
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [dbReady, onboardingDone]);

  // Hide the splash once fonts + DB are ready. Routing is handled declaratively
  // below via <Stack.Protected> — no imperative router.replace needed.
  useEffect(() => {
    if ((fontsLoaded || fontError) && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, dbReady]);

  // Hold rendering until fonts AND the DB/store bootstrap are done. The
  // splash screen stays up until then, so the user never sees the wrong
  // stack mounted with empty data.
  if ((!fontsLoaded && !fontError) || !dbReady) return null;

  return (
    <GestureHandlerRootView style={styles.fill}>
      {/* App keyboard sits outside the bottom-sheet host so it draws above sheets. */}
      <KeyboardProvider>
      <BottomSheetModalProvider>
      <OverlayProvider>
      <Stack screenOptions={STACK_SCREEN_OPTIONS}>
        {/* Onboarding stack — only mounted when onboarding isn't complete. */}
        <Stack.Protected guard={!onboardingDone}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>

        {/* Main app stack — only mounted once onboarding is complete. */}
        <Stack.Protected guard={onboardingDone}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="profile/new"       options={MODAL_OPTIONS} />
          <Stack.Screen name="profile/[id]" />
          <Stack.Screen name="profile/edit/[id]" options={MODAL_OPTIONS} />
          <Stack.Screen name="chat/agent/[agent]" />
          <Stack.Screen name="chat/[threadId]" />
          <Stack.Screen name="horoscope/[profileId]" />
          <Stack.Screen name="phase/[profileId]" />
          <Stack.Screen name="saved" />
          <Stack.Screen name="share-answer" options={MODAL_OPTIONS} />
          <Stack.Screen name="muhurat" />
          <Stack.Screen name="forecast/[profileId]" />
          <Stack.Screen name="family" />
          <Stack.Screen name="journal/[profileId]" />
          <Stack.Screen name="alerts/index" />
          <Stack.Screen name="alerts/[alertId]" />
          <Stack.Screen name="panchang/index" />
          <Stack.Screen name="sade-sati/[profileId]" />
          <Stack.Screen name="dasha/[profileId]" />
          <Stack.Screen name="festivals/index" />
          <Stack.Screen name="gita/index" />
          <Stack.Screen name="compatibility/index" />
          <Stack.Screen name="report/[kind]" />
          <Stack.Screen name="report/pair" />
          <Stack.Screen name="archived" />
          <Stack.Screen name="settings/model" />
          <Stack.Screen name="about/index" />
          <Stack.Screen name="legal/[doc]" />
        </Stack.Protected>
      </Stack>

      {/* "Preparing Saga…": full screen over home right after onboarding while
          the model is still downloading; fades out by itself when ready.
          Returning users see the inline ModelSetupPill instead. */}
      {onboardingDone && modelOverlay && <ModelSetupOverlay />}
      </OverlayProvider>
      </BottomSheetModalProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

// Module-level constants — stable references, never cause Stack to re-render
const STACK_SCREEN_OPTIONS = { headerShown: false } as const;
const MODAL_OPTIONS        = { presentation: 'modal' } as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
