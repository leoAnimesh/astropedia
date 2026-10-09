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
import { initReactI18next, useTranslation } from 'react-i18next';
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
  'family', 'journal', 'alerts', 'astro', 'keyboard',
  'festivals', 'sadesati', 'dasha', 'gita', 'reports',
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
    keyboard:      require('../locales/en/keyboard.json'),
    festivals:     require('../locales/en/festivals.json'),
    sadesati:      require('../locales/en/sadesati.json'),
    dasha:         require('../locales/en/dasha.json'),
    gita:          require('../locales/en/gita.json'),
    reports:       require('../locales/en/reports.json'),
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
    keyboard:      require('../locales/hi/keyboard.json'),
    festivals:     require('../locales/hi/festivals.json'),
    sadesati:      require('../locales/hi/sadesati.json'),
    dasha:         require('../locales/hi/dasha.json'),
    gita:          require('../locales/hi/gita.json'),
    reports:       require('../locales/hi/reports.json'),
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
    keyboard:      require('../locales/bn/keyboard.json'),
    festivals:     require('../locales/bn/festivals.json'),
    sadesati:      require('../locales/bn/sadesati.json'),
    dasha:         require('../locales/bn/dasha.json'),
    gita:          require('../locales/bn/gita.json'),
    reports:       require('../locales/bn/reports.json'),
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

// Every translated string — static copy and interpolated numbers alike — shows
// Hindi/Bengali in their own digits. tAsk() opts out: model questions keep
// Western digits, like the dates and numbers in the model's context.
i18n.use({
  type: 'postProcessor',
  name: 'nativeDigits',
  process(value: string, _key: unknown, options: { lng?: string }, translator: { language?: string }) {
    const lng = options?.lng ?? translator?.language;
    return isSupported(lng) ? localizeDigits(value, lng) : value;
  },
});

i18n.use(initReactI18next).init({
  resources,
  postProcess:   ['nativeDigits'],
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
  return { en: 'en-IN', hi: 'hi-IN-u-nu-deva', bn: 'bn-IN-u-nu-beng' }[lng];
}

/**
 * Map Western digits (0-9) to language-specific digits.
 * Bengali: ০-৯; Hindi (Devanagari): ०-९; English: unchanged.
 */
export function localizeDigits(s: string, lng: AppLanguage = getAppLanguage()): string {
  if (lng === 'en') return s;
  const map = lng === 'bn'
    ? ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']
    : ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return s.replace(/\d/g, (d) => map[Number(d)]);
}

const DAY_PERIODS: Record<Exclude<AppLanguage, 'en'>, [string, string]> = {
  hi: ['पूर्वाह्न', 'अपराह्न'],
  bn: ['পূর্বাহ্ণ', 'অপরাহ্ণ'],
};

/**
 * A formatted clock time in the app language: native digits, and AM/PM in
 * Hindi/Bengali (Hermes' Intl returns the English day periods for both).
 */
export function localizeTime(s: string, lng: AppLanguage = getAppLanguage()): string {
  if (lng === 'en') return s;
  const [am, pm] = DAY_PERIODS[lng];
  return localizeDigits(s, lng)
    .replace(/\b[AaPp]\.?\s?[Mm]\.?(?![A-Za-z])/g, (x) => (/^[Aa]/.test(x) ? am : pm));
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
  return i18n.t(key, { ...vars, lng: askLanguage(), postProcess: [] });
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
  const formatted = d.toLocaleDateString(intlLocale(lng), { month: 'short', year: 'numeric' });
  return localizeDigits(formatted, lng);
}

/** "Sat, 3 Oct" in the app language. */
export function formatDayDate(d: Date): string {
  const formatted = d.toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
  return localizeDigits(formatted);
}

// ─── Reactive language ───────────────────────────────────────────────────────

/**
 * The current app language as React state. Re-renders on every language change.
 * Use this (not getAppLanguage()) for anything computed during render. With the
 * React Compiler on, a bare getAppLanguage()/intlLocale()/tPlanet(x) call has no
 * reactive inputs and is memoised forever, so it never sees a language switch.
 */
export function useAppLanguage(): AppLanguage {
  const { i18n: inst } = useTranslation();
  return isSupported(inst.language) ? inst.language : 'en';
}
