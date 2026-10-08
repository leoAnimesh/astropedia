import { Platform } from 'react-native';
import type { AccentKey, ThemeMode } from '@/constants/themes';

// MMKV wrapper with web localStorage fallback
// All reads are synchronous — designed to be called before first render

let _storage: StorageBackend;

type StorageBackend = {
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: string | boolean | number) => void;
  getString: (key: string) => string | undefined;
  delete: (key: string) => void;
  keys: () => string[];
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
      keys: () => Object.keys(localStorage),
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
      keys:       () => mmkv.getAllKeys(),
    };
  }

  return _storage;
}

// v4: readings from astro-gemma-v21 (plainer style; v2's cached Bengali
// readings were mostly English), so they are regenerated once.
const chartReadingKey = (profileId: string, lang: string) =>
  lang === 'en' ? `chart_reading_v4_${profileId}` : `chart_reading_v4_${profileId}_${lang}`;

export const Storage = {
  // Onboarding
  getOnboardingDone: (): boolean => getStorage().getBoolean('onboarding_done') ?? false,
  setOnboardingDone: (v: boolean): void => getStorage().set('onboarding_done', v),

  // Accent + dark mode
  getAccentKey: (): AccentKey => (getStorage().getString('accent_key') as AccentKey) ?? 'amber',
  setAccentKey: (v: AccentKey): void => getStorage().set('accent_key', v),
  // Theme mode: 'system' (default) | 'light' | 'dark'. Stored under `theme_mode`.
  // One-time migration from the legacy `dark_mode` key (written by the old
  // Dark-mode toggle as 'dark' | 'light'; possibly a boolean in older builds):
  // dark -> 'dark'; anything else -> 'system' (the toggle never meant "chose light").
  getDarkModeOverride: (): ThemeMode => {
    const s = getStorage();
    try {
      const cur = s.getString('theme_mode');
      if (cur === 'system' || cur === 'light' || cur === 'dark') return cur;
      let legacyDark = false;
      try { legacyDark = s.getString('dark_mode') === 'dark'; } catch { /* ignore */ }
      if (!legacyDark) {
        try { legacyDark = s.getBoolean('dark_mode') === true; } catch { /* ignore */ }
      }
      const next: ThemeMode = legacyDark ? 'dark' : 'system';
      s.set('theme_mode', next);
      s.delete('dark_mode');
      return next;
    } catch {
      return 'system';
    }
  },
  setDarkModeOverride: (v: ThemeMode): void => getStorage().set('theme_mode', v),

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

  // App language chosen on the first onboarding screen ('en' | 'hi' | 'bn').
  getLanguage: (): string | null => getStorage().getString('language') ?? null,
  setLanguage: (v: string): void => getStorage().set('language', v),

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

  // AI-generated chart readings (cached per profile and reply language).
  getChartReading: (profileId: string, lang = 'en'): string | null =>
    getStorage().getString(chartReadingKey(profileId, lang)) ?? null,
  setChartReading: (profileId: string, json: string, lang = 'en'): void =>
    getStorage().set(chartReadingKey(profileId, lang), json),
  deleteChartReading: (profileId: string): void => {
    for (const lang of ['en', 'hi', 'bn']) getStorage().delete(chartReadingKey(profileId, lang));
  },

  // Model-written follow-up chips (MODEL_FOLLOWUPS), per assistant message id,
  // so reopening a chat doesn't run the model again. [] = the model gave too
  // few usable chips (the rule-based ones are shown); null = not generated.
  getFollowUps: (messageId: string): string[] | null => {
    const raw = getStorage().getString(`followups_v1_${messageId}`);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
    } catch { return null; }
  },
  setFollowUps: (messageId: string, chips: string[]): void =>
    getStorage().set(`followups_v1_${messageId}`, JSON.stringify(chips)),

  // In-app keyboard: 'custom' (the app's own keyboard) or 'system' (the
  // phone's keyboard, chosen with the 🌐 key). Remembered until changed.
  getKeyboardMode: (): 'custom' | 'system' =>
    getStorage().getString('keyboard_mode') === 'system' ? 'system' : 'custom',
  setKeyboardMode: (v: 'custom' | 'system'): void => getStorage().set('keyboard_mode', v),

  // On-device model download (utils/model-download.ts). Raw JSON strings;
  // the caller parses and validates. Not cleared by reset or backup restore:
  // the model on disk survives both.
  getModelInstall: (): string | null => getStorage().getString('model_install_v1') ?? null,
  setModelInstall: (json: string): void => getStorage().set('model_install_v1', json),
  clearModelInstall: (): void => getStorage().delete('model_install_v1'),
  getModelResume: (): string | null => getStorage().getString('model_resume_v1') ?? null,
  setModelResume: (json: string): void => getStorage().set('model_resume_v1', json),
  clearModelResume: (): void => getStorage().delete('model_resume_v1'),
  // The full-screen "Preparing Saga…" overlay owed after onboarding; kept
  // until the model is ready so a relaunch mid-download shows it again.
  getModelOverlayPending: (): boolean => getStorage().getBoolean('model_overlay_pending') ?? false,
  setModelOverlayPending: (v: boolean): void => getStorage().set('model_overlay_pending', v),

  // Everything derived from profile data (daily horoscopes, chart readings,
  // model follow-up chips). Used after a backup restore, when those may
  // describe charts or messages that no longer match. All regenerate on demand.
  clearDerivedCaches: (): void => {
    const s = getStorage();
    for (const key of s.keys()) {
      if (key.startsWith('horoscope_') || key.startsWith('chart_reading_') || key.startsWith('followups_')) {
        s.delete(key);
      }
    }
  },

  // Clear everything (used by reset)
  clear: (): void => {
    const s = getStorage();
    s.delete('onboarding_done');
    s.delete('language');
    s.delete('accent_key');
    s.delete('dark_mode');
    s.delete('theme_mode');
    s.delete('active_profile_id');
  },
};
