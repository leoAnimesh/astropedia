import { Appearance } from 'react-native';
import { create } from 'zustand';
import { Storage } from '@/utils/storage';
import type { AccentKey, ThemeMode } from '@/constants/themes';

type SettingsStore = {
  accentKey: AccentKey;
  /** 'system' follows the OS appearance live; 'light' / 'dark' force it. */
  darkModeOverride: ThemeMode;
  setAccentKey: (key: AccentKey) => void;
  setDarkModeOverride: (v: ThemeMode) => void;
};

// Make native chrome (system keyboard, alerts, modals, status bar) follow the
// chosen mode; 'unspecified' hands control back to the OS so 'system' stays live.
function applyNativeScheme(mode: ThemeMode) {
  try { Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode); } catch { /* unsupported */ }
}

const initialMode = Storage.getDarkModeOverride();
applyNativeScheme(initialMode);

export const useSettingsStore = create<SettingsStore>((set) => ({
  // Initialized from MMKV synchronously — safe because MMKV reads are sync
  accentKey:        Storage.getAccentKey(),
  darkModeOverride: initialMode,

  setAccentKey: (key) => {
    Storage.setAccentKey(key);
    set({ accentKey: key });
  },
  setDarkModeOverride: (v) => {
    Storage.setDarkModeOverride(v);
    applyNativeScheme(v);
    set({ darkModeOverride: v });
  },
}));
