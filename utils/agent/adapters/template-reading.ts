/**
 * The chart card reading without a model: the same "SUN: …\nMOON: …" lines
 * the [reading] task writes (hooks/use-chart-reading.ts parseReading), built
 * from chart facts with the report engine's sentences (locales
 * <lang>/reports.json `e.*`), so the card is never empty when no model can
 * run (web, failed load, unsupported install). Deterministic per profile,
 * day and language; text is in `lang` with its own digits (i18n post-processor).
 */
import i18n from '../../i18n';
import { elementOf, getChartFacts, lordOf } from '../../reports/facts';
import { focusFor } from '../../reports/areas';
import { monthLabel, type Lang } from '../strings';
import type { ReadingRequest } from './types';

const sentence = (s: string, lang: Lang) => (/[.!?।]$/.test(s) ? s : `${s}${lang === 'en' ? '.' : '।'}`);

export function templateReading(profile: ReadingRequest['profile'], lang: Lang, now: Date = new Date()): string {
  const t = (key: string, vars: Record<string, unknown> = {}) => i18n.t(`reports:e.${key}`, { ...vars, lng: lang }) as string;
  const f = getChartFacts(profile, now);
  const cap = (s: string) => (lang === 'en' && s ? s[0].toUpperCase() + s.slice(1) : s);
  const lines = [
    `SUN: ${t(`life.nature.${elementOf(f.planets.Sun.sign)}`)}`,
    `MOON: ${t(`life.mind.${f.moonSign}`)}`,
  ];
  if (f.ascSign != null) lines.push(`RISING: ${sentence(t(`short.nature.${elementOf(f.ascSign)}`), lang)}`);
  const maha = f.dasha.maha;
  lines.push(`DASHA: ${sentence(cap(t('now.until', { what: t(`now.sub.${maha.lord}`), date: monthLabel(maha.end, lang) })), lang)}`);
  const place = t(`place.${f.planets[lordOf(f, 1)].house}`);
  lines.push(`OVERVIEW: ${t('life.focus', { place })} ${t(`lineNow.life.${focusFor(f, 'life').dots}`)}`);
  return lines.join('\n');
}
