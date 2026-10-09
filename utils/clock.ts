/**
 * Clock-time formatting for the panchang-style screens, in the app language
 * (native digits; Hindi/Bengali day periods via localizeTime).
 */
import { intlLocale, localizeDigits, localizeTime } from './i18n';

/** "9:57 am" / "सुबह ९:५७" style. */
export function clockTime(d: Date): string {
  return localizeTime(d.toLocaleTimeString(intlLocale(), { hour: 'numeric', minute: '2-digit' }));
}

/** "9:57" (12-hour, no am/pm), for compact tables. */
export function clockShort(d: Date): string {
  return localizeDigits(`${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`);
}

/** "9:57 – 11:25". */
export function rangeShort(a: Date, b: Date): string {
  return `${clockShort(a)} – ${clockShort(b)}`;
}

/** "9:57 am – 11:25 am". */
export function rangeTime(a: Date, b: Date): string {
  return `${clockTime(a)} – ${clockTime(b)}`;
}

/** Same calendar day (device local). */
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
