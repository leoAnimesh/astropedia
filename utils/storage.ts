import { Platform } from 'react-native';
import type { AccentKey } from '@/constants/themes';

// MMKV wrapper with web localStorage fallback
// All reads are synchronous — designed to be called before first render

let _storage: StorageBackend;

type StorageBackend = {
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: string | boolean | number) => void;
  getString: (key: string) => string | undefined;
  delete: (key: string) => void;
};

function getStorage(): StorageBackend {
  if (_storage) return _storage;

  if (Platform.OS === 'web') {
    _storage = {
      getBoolean: (key) => {
        const v = localStorage.getItem(key);
        return v === null ? undefined : v === 'true';
      },
      set: (key, value) => localStorage.setItem(key, String(value)),
      getString: (key) => localStorage.getItem(key) ?? undefined,
      delete: (key) => localStorage.removeItem(key),
    };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const mmkv = createMMKV({ id: 'astropedia' });
    _storage = {
      getBoolean: (key) => mmkv.getBoolean(key),
      set:        (key, value) => mmkv.set(key, value as string | boolean | number),
      getString:  (key) => mmkv.getString(key),
      delete:     (key) => { mmkv.remove(key); },
    };
  }

  return _storage;
}

export const Storage = {
  // Onboarding
  getOnboardingDone: (): boolean => getStorage().getBoolean('onboarding_done') ?? false,
  setOnboardingDone: (v: boolean): void => getStorage().set('onboarding_done', v),

  // Accent + dark mode
  getAccentKey: (): AccentKey => (getStorage().getString('accent_key') as AccentKey) ?? 'amber',
  setAccentKey: (v: AccentKey): void => getStorage().set('accent_key', v),
  getDarkModeOverride: (): 'system' | 'light' | 'dark' =>
    (getStorage().getString('dark_mode') as 'system' | 'light' | 'dark') ?? 'system',
  setDarkModeOverride: (v: 'system' | 'light' | 'dark'): void =>
    getStorage().set('dark_mode', v),

  // Daily horoscope cache (keyed by profileId + date — stores JSON of HoroscopeSections)
  getHoroscopeCache: (profileId: string, date: string): string | null => {
    const v = getStorage().getString(`horoscope_${profileId}_${date}`);
    return (v && v.length > 2) ? v : null; // treat empty / '{}' as cache miss
  },
  setHoroscopeCache: (profileId: string, date: string, json: string): void =>
    getStorage().set(`horoscope_${profileId}_${date}`, json),
  deleteHoroscopeCache: (profileId: string, date: string): void =>
    getStorage().delete(`horoscope_${profileId}_${date}`),

  // Active profile
  getActiveProfileId: (): string | null =>
    getStorage().getString('active_profile_id') ?? null,
  setActiveProfileId: (id: string): void =>
    getStorage().set('active_profile_id', id),

  // Local LLM download state
  getModelDownloaded: (): boolean => getStorage().getBoolean('model_downloaded') ?? false,
  setModelDownloaded: (v: boolean): void => getStorage().set('model_downloaded', v),

  // AI-generated chart readings (cached per profile)
  getChartReading: (profileId: string): string | null =>
    getStorage().getString(`chart_reading_${profileId}`) ?? null,
  setChartReading: (profileId: string, json: string): void =>
    getStorage().set(`chart_reading_${profileId}`, json),
  deleteChartReading: (profileId: string): void =>
    getStorage().delete(`chart_reading_${profileId}`),

  // Clear everything (used by reset)
  clear: (): void => {
    const s = getStorage();
    s.delete('onboarding_done');
    s.delete('accent_key');
    s.delete('dark_mode');
    s.delete('active_profile_id');
    // intentionally keep model_downloaded — no need to re-download on reset
  },
};
