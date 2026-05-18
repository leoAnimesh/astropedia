import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
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

import { initDatabase, getAllProfiles, getAllThreads, isSystemProfile } from '@/utils/database';
import { Storage } from '@/utils/storage';
import { useProfileStore } from '@/stores/profile-store';
import { useThreadStore } from '@/stores/thread-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { initLocalLLM, unloadLocalLLM } from '@/utils/local-llm';
import { VedicLoadingOverlay } from '@/components/organisms/VedicLoadingOverlay';
import {
  setupNotifications,
  scheduleDailyHoroscope,
  scheduleTransitAlerts,
} from '@/utils/notifications';

SplashScreen.preventAutoHideAsync();

// HuggingFace CDN doesn't send content-length headers for tokenizer JSON files —
// this is expected and harmless; the download succeeds via chunked transfer.
LogBox.ignoreLogs(['[React Native ExecuTorch] No content-length header']);

export const unstable_settings = {
  anchor: '(app)',
};

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  // Reactive onboarding-done flag — drives the <Stack.Protected> guards.
  // When this flips to true (after the intent screen saves), the router
  // automatically redirects out of the onboarding stack into the app stack.
  const onboardingDone = useOnboardingStore((s) => s.done);

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
        // Only auto-download on first run. After that, model loads on-demand
        // from disk when the user opens a chat (~2–5 s, shown via typing indicator).
        // This keeps RAM at ~150 MB on the home screen instead of ~2.9 GB.
        if (!Storage.getModelDownloaded()) {
          initLocalLLM().catch(() => {});
        }
        const [allProfiles, threads] = await Promise.all([
          getAllProfiles(),
          getAllThreads(),
        ]);

        // Hydrate Zustand from SQLite — but hide synthetic system profiles
        // (e.g. __krishna__) that only exist to anchor Krishna-mode threads
        // to a valid profile_id. They must never appear in the switcher.
        const profiles = allProfiles.filter((p) => !isSystemProfile(p.id));
        useProfileStore.getState().setProfiles(profiles);

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
        setupNotifications();
        if (Storage.getDailyHoroscopePush()) scheduleDailyHoroscope().catch(() => {});
        if (Storage.getTransitAlerts())      scheduleTransitAlerts(null).catch(() => {});
      } catch (e) {
        console.error('Bootstrap error', e);
      } finally {
        setDbReady(true);
      }
    }
    bootstrap();
  }, []);

  // Background/foreground hooks:
  //  - background : free model RAM (~0.5–2 GB depending on tier)
  //  - active     : re-anchor scheduled notifications to the current local
  //                 timezone so DST shifts and travel don't move the 8 AM
  //                 daily push off-target.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        unloadLocalLLM();
      } else if (next === 'active') {
        if (Storage.getDailyHoroscopePush()) scheduleDailyHoroscope().catch(() => {});
        if (Storage.getTransitAlerts())      scheduleTransitAlerts(null).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

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
      <BottomSheetModalProvider>
      <KeyboardProvider>
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
          <Stack.Screen name="chat/[threadId]" />
          <Stack.Screen name="horoscope/[profileId]" />
          <Stack.Screen name="panchang/index" />
          <Stack.Screen name="compatibility/index" />
          <Stack.Screen name="archived" />
        </Stack.Protected>
      </Stack>

      {/* Model-download / model-load overlay. Renders once onboarding is done
          and stays mounted across every app screen so a model swap from
          Settings (or a re-download after a version bump) shows progress
          everywhere, not just on home. */}
      {onboardingDone && <VedicLoadingOverlay />}
      </KeyboardProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

// Module-level constants — stable references, never cause Stack to re-render
const STACK_SCREEN_OPTIONS = { headerShown: false } as const;
const MODAL_OPTIONS        = { presentation: 'modal' } as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
