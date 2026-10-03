/**
 * Sky alerts: upcoming sign changes for the slow planets (Sun, Mars, Jupiter,
 * Saturn) plus the profile's own life-phase turns. Pure functions — no React,
 * no notifications — so they can be shared by the Alerts screens and the
 * notification scheduler.
 *
 * Explanations are display text in the app language (namespace `alerts`).
 * alertQuestion() stays English: it is sent to the on-device model.
 */

import { ZODIAC } from '@/constants/astrology';
import {
  getChartPositions,
  getLifeChapters,
  getMoonLongitudeExact,
  PHASE_MEANINGS,
} from './astrology';
import { localDateIso } from './format';
import i18n, { formatMonthYear, tPlanet, tSign } from './i18n';

export const TRANSIT_PLANETS = ['Sun', 'Mars', 'Jupiter', 'Saturn'] as const;
export const TRANSIT_LOOKAHEAD_DAYS = 90;

const DAY_MS = 86400000;

export type TransitAlert = {
  id:       string;
  kind:     'transit';
  planet:   string;
  /** Local date (midnight) of the first day in the new sign. */
  date:     Date;
  fromSign: string;
  toSign:   string;
};

export type PhaseAlert = {
  id:        string;
  kind:      'phase';
  /** Planet that rules the new period. */
  planet:    string;
  phaseKind: 'sub' | 'chapter';
  date:      Date;
  end:       Date;
};

export type SkyAlert = TransitAlert | PhaseAlert;

type BirthInfo = {
  birthDate:  string;
  birthTime?: string | null;
  birthLng?:  number | null;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ─── Planet sign changes ──────────────────────────────────────────────────────

/**
 * Walk day-by-day for each tracked planet, looking for the first sign change
 * within `lookaheadDays`. At most one change per planet — the next shift.
 * Sorted by date.
 */
export function getUpcomingTransits(
  now: Date = new Date(),
  lookaheadDays: number = TRANSIT_LOOKAHEAD_DAYS,
): TransitAlert[] {
  const today     = startOfDay(now);
  const todayPos  = getChartPositions({ birthDate: localDateIso(today), birthTime: '12:00' });
  const startSign: Record<string, number> = {};
  for (const p of todayPos) startSign[p.name] = p.signIndex;

  const found: TransitAlert[] = [];
  const searching = new Set<string>(TRANSIT_PLANETS);

  for (let offset = 1; offset <= lookaheadDays && searching.size; offset++) {
    const d   = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const iso = localDateIso(d);
    for (const p of getChartPositions({ birthDate: iso, birthTime: '12:00' })) {
      if (!searching.has(p.name) || p.signIndex === startSign[p.name]) continue;
      found.push({
        id:       `${p.name.toLowerCase()}-${iso}`,
        kind:     'transit',
        planet:   p.name,
        date:     d,
        fromSign: ZODIAC[startSign[p.name]].name,
        toSign:   ZODIAC[p.signIndex].name,
      });
      searching.delete(p.name);
    }
  }
  return found.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Life-phase turns ─────────────────────────────────────────────────────────

/** Next sub-period and chapter starts for a profile (from getLifeChapters). */
export function getUpcomingPhaseAlerts(profile: BirthInfo | null | undefined, now: Date = new Date()): PhaseAlert[] {
  if (!profile?.birthDate) return [];
  const life = getLifeChapters(profile, now);
  return life.upcoming
    .filter(({ period }) => period.start.getTime() > now.getTime())
    .map(({ kind, period }) => ({
      id:        `phase-${kind}-${period.lord.toLowerCase()}-${localDateIso(period.start)}`,
      kind:      'phase' as const,
      planet:    period.lord,
      phaseKind: kind,
      date:      period.start,
      end:       period.end,
    }));
}

/** Planet transits plus the profile's phase turns, sorted by date. */
export function getUpcomingAlerts(profile: BirthInfo | null | undefined, now: Date = new Date()): SkyAlert[] {
  return [...getUpcomingTransits(now), ...getUpcomingPhaseAlerts(profile, now)]
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function findAlert(id: string, profile: BirthInfo | null | undefined, now: Date = new Date()): SkyAlert | null {
  return getUpcomingAlerts(profile, now).find((a) => a.id === id) ?? null;
}

// ─── Plain-language explanation ───────────────────────────────────────────────

/**
 * PHASE_MEANINGS (utils/astrology.ts) in the app language. The English
 * constant is the fallback; translations live in `phase:meaning.<Lord>.<kind>`.
 */
export function phaseMeaning(lord: string, kind: 'chapter' | 'sub'): string {
  return i18n.t(`phase:meaning.${lord}.${kind}`, { defaultValue: PHASE_MEANINGS[lord]?.[kind] ?? '' });
}

/** Houses where each planet tends to work easily (counted from the Moon). */
const EASY_HOUSES: Record<string, number[]> = {
  Sun:     [3, 6, 10, 11],
  Mars:    [3, 6, 11],
  Jupiter: [2, 5, 7, 9, 11],
  Saturn:  [3, 6, 11],
};

/** Planets with tone lines in `alerts:tone.<Planet>.easy|steady`. */
const TONE_PLANETS = new Set(['Sun', 'Mars', 'Jupiter', 'Saturn']);
/** Planets with a typical stay in `alerts:lasts.<Planet>`. */
const LASTS_PLANETS = new Set(['Sun', 'Mars', 'Jupiter', 'Saturn']);

export type AlertExplanation = {
  title: string;
  /** Two short sentences: what it touches for you, then how to handle it. */
  lines: [string, string];
  lasts: string;
  /** House counted from the natal Moon (transits with a known birth date). */
  house?: number;
};

function durationLabel(start: Date, end: Date): string {
  const months = (end.getTime() - start.getTime()) / (30.44 * DAY_MS);
  if (months < 1.5) return i18n.t('alerts:lasts.aboutMonth');
  if (months < 18)  return i18n.t('alerts:lasts.aboutMonths', { count: Math.round(months) });
  return i18n.t('alerts:lasts.aboutYears', { count: Math.round(months / 12) });
}

export function moonSignIndex(profile: BirthInfo | null | undefined): number | null {
  if (!profile?.birthDate) return null;
  const lon = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined, profile.birthLng);
  return Math.floor(lon / 30) % 12;
}

export function explainTransit(alert: SkyAlert, profile: BirthInfo | null | undefined): AlertExplanation {
  const planet = tPlanet(alert.planet);
  if (alert.kind === 'phase') {
    const meaning = phaseMeaning(alert.planet, alert.phaseKind);
    return {
      title: i18n.t(`alerts:explain.phaseTitle.${alert.phaseKind}`, { planet }),
      lines: [
        meaning || i18n.t('alerts:explain.phaseFallback'),
        i18n.t('alerts:explain.runsUntil', { date: formatMonthYear(alert.end) }),
      ],
      lasts: durationLabel(alert.date, alert.end),
    };
  }

  const title  = i18n.t('alerts:explain.transitTitle', { planet, sign: tSign(alert.toSign) });
  const lasts  = LASTS_PLANETS.has(alert.planet)
    ? i18n.t(`alerts:lasts.${alert.planet}`)
    : i18n.t('alerts:lasts.fewWeeks');
  const moon   = moonSignIndex(profile);
  const toIdx  = ZODIAC.findIndex((z) => z.name === alert.toSign);

  if (moon == null || toIdx < 0 || !TONE_PLANETS.has(alert.planet)) {
    return {
      title,
      lines: [
        i18n.t('alerts:explain.leaves', { planet, from: tSign(alert.fromSign), to: tSign(alert.toSign) }),
        i18n.t('alerts:explain.addBirthDate'),
      ],
      lasts,
    };
  }

  const house = ((toIdx - moon + 12) % 12) + 1;
  const easy  = EASY_HOUSES[alert.planet]?.includes(house) ?? false;
  return {
    title,
    lines: [
      i18n.t(`alerts:house.${house}`),
      i18n.t(`alerts:tone.${alert.planet}.${easy ? 'easy' : 'steady'}`),
    ],
    lasts,
    house,
  };
}

/** Question sent to Saga from the alert detail screen. English on purpose: the model reads English. */
export function alertQuestion(alert: SkyAlert): string {
  const when = alert.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (alert.kind === 'phase') {
    return `My ${alert.planet} ${alert.phaseKind === 'chapter' ? 'life chapter' : 'sub-period'} starts on ${when}. What does it mean for me?`;
  }
  return `${alert.planet} moves into ${alert.toSign} on ${when}. What does this mean for me?`;
}
