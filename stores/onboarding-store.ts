import { create } from 'zustand';
import { Storage } from '@/utils/storage';

/**
 * Reactive onboarding state. Mirrors the MMKV `onboarding_done` flag so the
 * router's <Stack.Protected> guards can re-render when it flips.
 *
 * The store is the source of truth for navigation gating; MMKV is the
 * source of truth for persistence. setDone() updates both atomically.
 */
type OnboardingStore = {
  done: boolean;
  setDone: (v: boolean) => void;
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  done: Storage.getOnboardingDone(),
  setDone: (v) => {
    Storage.setOnboardingDone(v);
    set({ done: v });
  },
}));
