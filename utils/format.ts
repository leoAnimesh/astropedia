// Display formatting follows the app language. Values sent to the model are
// formatted elsewhere (utils/astrology.ts).
//
// i18n is required lazily so the plain date helpers at the bottom
// (localDateIso, todayIso) stay importable from Node scripts such as
// ml/data/gen_profiles.ts, which can't load react-native.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const i18nModule = (): typeof import('./i18n') => require('./i18n');
const tr         = (key: string, opts?: Record<string, unknown>) => i18nModule().default.t(key, opts) as string;
const intlLocale = () => i18nModule().intlLocale();
const localizeDigits = (s: string) => i18nModule().localizeDigits(s);
const localizeTime   = (s: string) => i18nModule().localizeTime(s);

/** "3 Oct 2026" style, in the app language. */
export function formatBirthDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const formatted = new Date(y, m - 1, d).toLocaleDateString(intlLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  return localizeDigits(formatted);
}

/** "2:30 pm" style, in the app language. */
export function formatBirthTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  const formatted = d.toLocaleTimeString(intlLocale(), { hour: 'numeric', minute: '2-digit' });
  return localizeTime(formatted);
}

export function formatBirthInfo(profile: {
  birthDate: string;
  birthTime?: string;
  birthCity?: string;
}): string {
  const parts: string[] = [];
  if (profile.birthDate) parts.push(formatBirthDate(profile.birthDate));
  if (profile.birthTime) parts.push(formatBirthTime(profile.birthTime));
  if (profile.birthCity) parts.push(profile.birthCity);
  return parts.join(' · ');
}

export function formatRelativeTime(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60)    return tr('common:time.justNow');
  if (s < 3600)  return tr('common:time.minutesAgo', { count: Math.floor(s / 60) });
  if (s < 86400) return tr('common:time.hoursAgo', { count: Math.floor(s / 3600) });
  return tr('common:time.daysAgo', { count: Math.floor(s / 86400) });
}

export function formatMessageDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && now.getDate() === d.getDate()) {
    return formatBirthTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`);
  }
  if (diff < 604800000) return d.toLocaleDateString(intlLocale(), { weekday: 'long' });
  const formatted = d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' });
  return localizeDigits(formatted);
}

/** "3 October 2026" style, in the app language. */
export function formatFullDate(date: Date): string {
  const formatted = date.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  return localizeDigits(formatted);
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return tr('common:greeting.lateNight');
  if (h < 12) return tr('common:greeting.morning');
  if (h < 18) return tr('common:greeting.afternoon');
  return tr('common:greeting.evening');
}

/** "3 Oct" style, in the app language. */
export function todayShort(): string {
  const formatted = new Date().toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' });
  return localizeDigits(formatted);
}

/**
 * YYYY-MM-DD in the device's LOCAL timezone — never UTC.
 *
 * `Date.toISOString()` returns UTC; for users east of GMT this can shift a
 * locally-picked date back by one day (e.g. IST midnight on Aug 6 → Aug 5
 * UTC). Always use this helper for birth dates and "today".
 */
export function localDateIso(date: Date): string {
  const y   = date.getFullYear();
  const m   = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return localDateIso(new Date());
}
