import { create } from 'zustand';
import { Storage } from '@/utils/storage';
import type { AccentKey } from '@/constants/themes';

type SettingsStore = {
  accentKey: AccentKey;
  darkModeOverride: 'system' | 'light' | 'dark';
  setAccentKey: (key: AccentKey) => void;
  setDarkModeOverride: (v: 'system' | 'light' | 'dark') => void;
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  // Initialized from MMKV synchronously — safe because MMKV reads are sync
  accentKey:        Storage.getAccentKey(),
  darkModeOverride: Storage.getDarkModeOverride(),

  setAccentKey: (key) => {
    Storage.setAccentKey(key);
    set({ accentKey: key });
  },
  setDarkModeOverride: (v) => {
    Storage.setDarkModeOverride(v);
    set({ darkModeOverride: v });
  },
}));
