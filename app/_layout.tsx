import { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
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

import { initDatabase, getAllProfiles, getAllThreads } from '@/utils/database';
import { Storage } from '@/utils/storage';
import { useProfileStore } from '@/stores/profile-store';
import { useThreadStore } from '@/stores/thread-store';
import { initLocalLLM, unloadLocalLLM } from '@/utils/local-llm';

SplashScreen.preventAutoHideAsync();

// HuggingFace CDN doesn't send content-length headers for tokenizer JSON files —
// this is expected and harmless; the download succeeds via chunked transfer.
LogBox.ignoreLogs(['[React Native ExecuTorch] No content-length header']);

export const unstable_settings = {
  anchor: '(app)',
};

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const navigated = useRef(false);

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
        const [profiles, threads] = await Promise.all([
          getAllProfiles(),
          getAllThreads(),
        ]);

        // Hydrate Zustand from SQLite
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
      } catch (e) {
        console.error('Bootstrap error', e);
      } finally {
        setDbReady(true);
      }
    }
    bootstrap();
  }, []);

  // Free the ~2.9 GB model from RAM whenever the app goes to background.
  // ensureLocalLLM() reloads from disk cache when the user chats again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        unloadLocalLLM();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && dbReady && !navigated.current) {
      navigated.current = true;
      SplashScreen.hideAsync();
      if (!Storage.getOnboardingDone()) {
        router.replace('/(onboarding)');
      }
    }
  }, [fontsLoaded, fontError, dbReady]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.fill}>
      <BottomSheetModalProvider>
      <KeyboardProvider>
      <Stack screenOptions={STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="profile/new"  options={MODAL_OPTIONS} />
        <Stack.Screen name="profile/[id]" />
        <Stack.Screen name="chat/[threadId]" />
        <Stack.Screen name="horoscope/[profileId]" />
        <Stack.Screen name="archived" />
      </Stack>
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
