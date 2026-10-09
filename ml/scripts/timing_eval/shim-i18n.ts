// Node stand-in for utils/i18n.ts: same resources and digit post-processor, no React Native.
import i18next from '/Users/animesh/Developer/projects/astropedia/node_modules/i18next/dist/esm/i18next.js';
import { readFileSync, readdirSync } from 'node:fs';
const R = '/Users/animesh/Developer/projects/astropedia/locales';
const resources: Record<string, Record<string, unknown>> = {};
for (const l of ['en', 'hi', 'bn']) { resources[l] = {}; for (const f of readdirSync(`${R}/${l}`)) resources[l][f.replace('.json', '')] = JSON.parse(readFileSync(`${R}/${l}/${f}`, 'utf8')); }
export const missing: string[] = [];
type L = 'en' | 'hi' | 'bn';
const ok = (c: unknown): c is L => c === 'en' || c === 'hi' || c === 'bn';
export function localizeDigits(s: string, lng: L = getAppLanguage()): string {
  if (lng === 'en') return s;
  const map = lng === 'bn' ? '০১২৩৪৫৬৭৮৯' : '०१२३४५६७८९';
  return s.replace(/\d/g, (d) => map[Number(d)]);
}
i18next.use({ type: 'postProcessor', name: 'nativeDigits', process(v: string, _k: unknown, o: { lng?: string }, tr: { language?: string }) {
  const l = o?.lng ?? tr?.language; return ok(l) ? localizeDigits(v, l) : v; } } as never);
i18next.init({ resources, lng: process.env.LNG ?? 'en', fallbackLng: false as unknown as string, postProcess: ['nativeDigits'],
  interpolation: { escapeValue: false }, saveMissing: true, returnNull: false,
  missingKeyHandler: (_l: unknown, ns: string, key: string) => missing.push(`${ns}:${key}`) } as never);
export default i18next;
export function getAppLanguage(): L { return ok(i18next.language) ? i18next.language : 'en'; }
export const intlLocale = (lng: L = getAppLanguage()) => ({ en: 'en-IN', hi: 'hi-IN-u-nu-deva', bn: 'bn-IN-u-nu-beng' }[lng]);
export const localizeTime = (s: string) => localizeDigits(s);
export const askLanguage = getAppLanguage;
export const modelSpeaks = () => true;
const n = (g: string) => (x: string, lng?: L) => i18next.t(`astro:${g}.${x}`, { defaultValue: x, lng });
export const tPlanet = n('planet'), tSign = n('sign'), tNakshatra = n('nakshatra');
export const tAsk = (k: string, v?: Record<string, unknown>) => i18next.t(k, { ...v, postProcess: [] });
export const formatMonthYear = (d: Date, lng?: L) => localizeDigits(d.toLocaleDateString(intlLocale(lng), { month: 'short', year: 'numeric' }), lng);
export const formatDayDate = (d: Date) => localizeDigits(d.toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short' }));
export const useAppLanguage = getAppLanguage;
