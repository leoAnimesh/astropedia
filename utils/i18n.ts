/**
 * App translations (English, Hindi, Bengali).
 *
 * Strings live in locales/<lang>/<namespace>.json, one namespace per screen
 * area so they can be edited independently. The language is picked on the
 * first onboarding screen and stored in MMKV; until then the phone's language
 * is used when it's one we support.
 *
 * The context blocks sent to the on-device model stay in English (its training
 * format). Questions the app asks on the user's behalf (chips, "Ask Saga"
 * links) use tAsk(): the app language when the model speaks it, else English.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { MODEL_LANGUAGES } from './local-llm';
import { Storage } from './storage';

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi',   native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['code'];

export const NAMESPACES = [
  'common', 'onboarding', 'home', 'chat', 'profile', 'horoscope', 'panchang',
  'compatibility', 'settings', 'phase', 'saved', 'muhurat', 'forecast',
  'family', 'journal', 'alerts', 'astro',
] as const;

// Metro needs static requires, so each file is listed explicitly.
const resources = {
  en: {
    common:        require('../locales/en/common.json'),
    onboarding:    require('../locales/en/onboarding.json'),
    home:          require('../locales/en/home.json'),
    chat:          require('../locales/en/chat.json'),
    profile:       require('../locales/en/profile.json'),
    horoscope:     require('../locales/en/horoscope.json'),
    panchang:      require('../locales/en/panchang.json'),
    compatibility: require('../locales/en/compatibility.json'),
    settings:      require('../locales/en/settings.json'),
    phase:         require('../locales/en/phase.json'),
    saved:         require('../locales/en/saved.json'),
    muhurat:       require('../locales/en/muhurat.json'),
    forecast:      require('../locales/en/forecast.json'),
    family:        require('../locales/en/family.json'),
    journal:       require('../locales/en/journal.json'),
    alerts:        require('../locales/en/alerts.json'),
    astro:         require('../locales/en/astro.json'),
  },
  hi: {
    common:        require('../locales/hi/common.json'),
    onboarding:    require('../locales/hi/onboarding.json'),
    home:          require('../locales/hi/home.json'),
    chat:          require('../locales/hi/chat.json'),
    profile:       require('../locales/hi/profile.json'),
    horoscope:     require('../locales/hi/horoscope.json'),
    panchang:      require('../locales/hi/panchang.json'),
    compatibility: require('../locales/hi/compatibility.json'),
    settings:      require('../locales/hi/settings.json'),
    phase:         require('../locales/hi/phase.json'),
    saved:         require('../locales/hi/saved.json'),
    muhurat:       require('../locales/hi/muhurat.json'),
    forecast:      require('../locales/hi/forecast.json'),
    family:        require('../locales/hi/family.json'),
    journal:       require('../locales/hi/journal.json'),
    alerts:        require('../locales/hi/alerts.json'),
    astro:         require('../locales/hi/astro.json'),
  },
  bn: {
    common:        require('../locales/bn/common.json'),
    onboarding:    require('../locales/bn/onboarding.json'),
    home:          require('../locales/bn/home.json'),
    chat:          require('../locales/bn/chat.json'),
    profile:       require('../locales/bn/profile.json'),
    horoscope:     require('../locales/bn/horoscope.json'),
    panchang:      require('../locales/bn/panchang.json'),
    compatibility: require('../locales/bn/compatibility.json'),
    settings:      require('../locales/bn/settings.json'),
    phase:         require('../locales/bn/phase.json'),
    saved:         require('../locales/bn/saved.json'),
    muhurat:       require('../locales/bn/muhurat.json'),
    forecast:      require('../locales/bn/forecast.json'),
    family:        require('../locales/bn/family.json'),
    journal:       require('../locales/bn/journal.json'),
    alerts:        require('../locales/bn/alerts.json'),
    astro:         require('../locales/bn/astro.json'),
  },
};

function isSupported(code: string | null | undefined): code is AppLanguage {
  return LANGUAGES.some((l) => l.code === code);
}

/** The phone's language if we support it, else English. */
export function deviceLanguage(): AppLanguage {
  try {
    const code = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0];
    return isSupported(code) ? code : 'en';
  } catch {
    return 'en';
  }
}

/** The language the user picked, or null before the onboarding picker. */
export function storedLanguage(): AppLanguage | null {
  const code = Storage.getLanguage();
  return isSupported(code) ? code : null;
}

i18n.use(initReactI18next).init({
  resources,
  lng:           storedLanguage() ?? deviceLanguage(),
  fallbackLng:   'en',
  ns:            NAMESPACES as unknown as string[],
  defaultNS:     'common',
  interpolation: { escapeValue: false },   // React already escapes
  returnNull:    false,
});

export function getAppLanguage(): AppLanguage {
  return isSupported(i18n.language) ? i18n.language : 'en';
}

export async function setAppLanguage(code: AppLanguage): Promise<void> {
  Storage.setLanguage(code);
  await i18n.changeLanguage(code);
}

/** BCP 47 tag for Intl date/number formatting in the current language (or `lng`). */
export function intlLocale(lng: AppLanguage = getAppLanguage()): string {
  return { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN' }[lng];
}

// ─── Questions sent to the model ─────────────────────────────────────────────

/** True when the bundled model reads and answers this language. */
export function modelSpeaks(lang: AppLanguage = getAppLanguage()): boolean {
  return MODEL_LANGUAGES.includes(lang);
}

/** Language for questions the app sends on the user's behalf. */
export function askLanguage(): AppLanguage {
  const lang = getAppLanguage();
  return modelSpeaks(lang) ? lang : 'en';
}

/**
 * A question the app sends to the chat for the user (chip, "Ask Saga" link),
 * in askLanguage(). The same text becomes the user's chat bubble. Pass
 * askLanguage() to tPlanet/tSign/formatMonthYear for interpolated values.
 */
export function tAsk(key: string, vars?: Record<string, unknown>): string {
  return i18n.t(key, { ...vars, lng: askLanguage() });
}

export default i18n;

// ─── Astrology names ─────────────────────────────────────────────────────────
// Code keeps English names (they also go to the model); these translate them
// for display. Unknown names fall back to the English name.

const astroName = (group: string, name: string, lng?: AppLanguage) =>
  i18n.t(`astro:${group}.${name}`, { defaultValue: name, lng });

export const tPlanet    = (name: string, lng?: AppLanguage) => astroName('planet', name, lng);
export const tSign      = (name: string, lng?: AppLanguage) => astroName('sign', name, lng);
export const tNakshatra = (name: string, lng?: AppLanguage) => astroName('nakshatra', name, lng);
export const tWeekday   = (english: string) => astroName('weekday', english);

/** "Krishna Shashthi" / "Shukla Dashami" / "Purnima" / "Amavasya". */
export function tTithi(name: string): string {
  const [first, ...rest] = name.split(' ');
  if (rest.length && (first === 'Shukla' || first === 'Krishna')) {
    return `${astroName('paksha', first)} ${astroName('tithi', rest.join(' '))}`;
  }
  return astroName('tithi', name);
}

// ─── Dates for display ───────────────────────────────────────────────────────
// utils/astrology.ts monthYear() stays English because it feeds the model's
// timing block. Screens use these instead.

/** "Oct 2027" in the app language (or `lng`). */
export function formatMonthYear(d: Date, lng?: AppLanguage): string {
  return d.toLocaleDateString(intlLocale(lng), { month: 'short', year: 'numeric' });
}

/** "Sat, 3 Oct" in the app language. */
export function formatDayDate(d: Date): string {
  return d.toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
}
