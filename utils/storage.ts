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

  // Daily horoscope cache (keyed by profileId + date — stores JSON of HoroscopeSections).
  // v3 = deterministic template generator (v2/v1 stored LLM-shaped output and is incompatible).
  getHoroscopeCache: (profileId: string, date: string): string | null => {
    const v = getStorage().getString(`horoscope_v3_${profileId}_${date}`);
    return (v && v.length > 2) ? v : null; // treat empty / '{}' as cache miss
  },
  setHoroscopeCache: (profileId: string, date: string, json: string): void =>
    getStorage().set(`horoscope_v3_${profileId}_${date}`, json),
  deleteHoroscopeCache: (profileId: string, date: string): void =>
    getStorage().delete(`horoscope_v3_${profileId}_${date}`),

  // Active profile
  getActiveProfileId: (): string | null =>
    getStorage().getString('active_profile_id') ?? null,
  setActiveProfileId: (id: string): void =>
    getStorage().set('active_profile_id', id),

  // Local LLM download state: every on-device model version whose files are
  // fully downloaded (progressive loading keeps a small starter model next to
  // the target model). Seeded once from the legacy single-model flags
  // `model_downloaded` + `model_version`.
  getModelsOnDisk: (): string[] => {
    const raw = getStorage().getString('models_on_disk');
    if (raw == null) {
      const legacy = getStorage().getBoolean('model_downloaded') ? getStorage().getString('model_version') : undefined;
      return legacy ? [legacy] : [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  },
  setModelsOnDisk: (versions: string[]): void =>
    getStorage().set('models_on_disk', JSON.stringify(versions)),

  // User's manual model choice. 'auto' (default) means follow the detected
  // device tier; a specific tier overrides auto-detection. Values must match
  // the tiers defined in utils/device-tier.ts.
  getPreferredModelTier: (): string => getStorage().getString('preferred_model_tier') ?? 'auto',
  setPreferredModelTier: (v: string): void => getStorage().set('preferred_model_tier', v),

  // Cached result of detectDeviceTier(), so we don't re-probe RAM every launch.
  getDeviceTier:   (): string | null => getStorage().getString('cached_device_tier') ?? null,
  setDeviceTier:   (v: string): void => getStorage().set('cached_device_tier', v),
  clearDeviceTier: (): void => getStorage().delete('cached_device_tier'),

  // What the user told us they're here for during onboarding. Used to seed a
  // starter prompt on the home screen until the user starts their first chat.
  getStarterIntent: (): string | null => getStorage().getString('starter_intent') ?? null,
  setStarterIntent: (v: string): void => getStorage().set('starter_intent', v),
  clearStarterIntent: (): void => getStorage().delete('starter_intent'),

  // Local notification preferences. Permissions are still requested at
  // toggle-on time — these just track the user's intent.
  getDailyHoroscopePush: (): boolean => getStorage().getBoolean('push_daily_horoscope') ?? false,
  setDailyHoroscopePush: (v: boolean): void => getStorage().set('push_daily_horoscope', v),
  getTransitAlerts:      (): boolean => getStorage().getBoolean('push_transit_alerts')  ?? false,
  setTransitAlerts:      (v: boolean): void => getStorage().set('push_transit_alerts',  v),

  // Onboarding-flow draft. The user's in-flight onboarding data, persisted as
  // one JSON blob so closing the app mid-flow doesn't lose progress.
  getOnboardingDraft: (): Record<string, unknown> | null => {
    const raw = getStorage().getString('onboarding_draft');
    if (!raw) return null;
    try { return JSON.parse(raw) as Record<string, unknown>; }
    catch { return null; }
  },
  setOnboardingDraft: (draft: Record<string, unknown>): void =>
    getStorage().set('onboarding_draft', JSON.stringify(draft)),
  clearOnboardingDraft: (): void => getStorage().delete('onboarding_draft'),

  // Free-tier daily message counter. Counts only LLM-tier replies — L0
  // deterministic and cache hits are free regardless of count. Resets at
  // midnight local time naturally because the key includes the date.
  getDailyMessageCount: (date: string): number => {
    const raw = getStorage().getString(`daily_msgs_${date}`);
    return raw ? parseInt(raw, 10) || 0 : 0;
  },
  setDailyMessageCount: (date: string, count: number): void =>
    getStorage().set(`daily_msgs_${date}`, String(count)),

  // AI-generated chart readings (cached per profile)
  getChartReading: (profileId: string): string | null =>
    getStorage().getString(`chart_reading_v2_${profileId}`) ?? null,
  setChartReading: (profileId: string, json: string): void =>
    getStorage().set(`chart_reading_v2_${profileId}`, json),
  deleteChartReading: (profileId: string): void =>
    getStorage().delete(`chart_reading_v2_${profileId}`),

  // Clear everything (used by reset)
  clear: (): void => {
    const s = getStorage();
    s.delete('onboarding_done');
    s.delete('accent_key');
    s.delete('dark_mode');
    s.delete('active_profile_id');
    // intentionally keep models_on_disk — no need to re-download on reset
  },
};
