/**
 * Life areas for the reports and their "in focus now" count. Pure.
 *
 * Each report kind reads a few houses (whole-sign, from the first house) and
 * a few natural significators (karakas), classical and short:
 *   life    1st (self)                                      Sun, Moon
 *   career  10th (work), 6th (daily work), 2nd (earnings), 11th (gains)
 *                                                           Sun, Saturn, Mercury
 *   love    7th (partner), 5th (romance)                    Venus
 *   health  1st (body), 6th (routine), 12th (rest)          Sun, Moon
 *   study   5th (learning), 4th (schooling), 9th (higher study)
 *                                                           Mercury, Jupiter
 *   family  4th (home, mother), 9th (father), 5th (children), 2nd (family)
 *                                                           Moon, Jupiter
 *   wealth  2nd (savings), 11th (income, gains), 9th (fortune)
 *                                                           Jupiter
 *           (rules.md 5.7 money_wealth; sade sati counts as money pressure)
 *
 * Focus dots count real triggers active today (never a score):
 *   - the running dasha sub-period, when its lord rules or sits in one of
 *     the area's houses or is one of its karakas;
 *   - each slow planet (Jupiter, Saturn, Rahu) now passing through one of
 *     the area's houses;
 *   - sade sati, for life, health (energy) and wealth (money pressure) only.
 * Shown as 1–3 dots: 0–1 triggers Quiet, 2 Active, 3+ Busy.
 */
import { lordOf, occupants, SLOW_PLANETS, type ChartFacts, type PlanetName, type SlowPlanet } from './facts';
import type { DashaPeriod } from '../astrology';

export const REPORT_KINDS = ['life', 'career', 'love', 'health', 'study', 'family', 'wealth'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export type AnyReportKind = ReportKind | 'compat';

export type AreaSpec = {
  /** Main house first. */
  houses: number[];
  karakas: PlanetName[];
  /** Sade sati counts as a trigger. */
  sade: boolean;
  /** Sade sati start / end belongs on the timing list. */
  sadeTiming: boolean;
};

export const AREAS: Record<ReportKind, AreaSpec> = {
  life:   { houses: [1],            karakas: ['Sun', 'Moon'],                sade: true,  sadeTiming: true },
  career: { houses: [10, 6, 2, 11], karakas: ['Sun', 'Saturn', 'Mercury'],   sade: false, sadeTiming: true },
  love:   { houses: [7, 5],         karakas: ['Venus'],                      sade: false, sadeTiming: false },
  health: { houses: [1, 6, 12],     karakas: ['Sun', 'Moon'],                sade: true,  sadeTiming: true },
  study:  { houses: [5, 4, 9],      karakas: ['Mercury', 'Jupiter'],         sade: false, sadeTiming: false },
  family: { houses: [4, 9, 5, 2],   karakas: ['Moon', 'Jupiter'],            sade: false, sadeTiming: true },
  wealth: { houses: [2, 11, 9],     karakas: ['Jupiter'],                    sade: true,  sadeTiming: true },
};

/** The planet rules or sits in one of the area's houses, or is one of its karakas. */
export function linked(f: ChartFacts, kind: ReportKind, planet: string): boolean {
  const a = AREAS[kind];
  if ((a.karakas as string[]).includes(planet)) return true;
  return a.houses.some((h) => lordOf(f, h) === planet || occupants(f, h).includes(planet as PlanetName));
}

export type Trigger =
  | { kind: 'sub'; lord: string; end: Date }
  | { kind: 'transit'; planet: SlowPlanet; house: number; until: Date | null }
  | { kind: 'sade'; end: Date | null };

export type Focus = { count: number; dots: 1 | 2 | 3; triggers: Trigger[] };

export function focusFor(f: ChartFacts, kind: ReportKind): Focus {
  const a = AREAS[kind];
  const triggers: Trigger[] = [];
  const sub = f.dasha.antar;
  if (linked(f, kind, sub.lord)) triggers.push({ kind: 'sub', lord: sub.lord, end: sub.end });
  for (const p of SLOW_PLANETS) {
    const t = f.transits[p];
    if (a.houses.includes(t.house)) triggers.push({ kind: 'transit', planet: p, house: t.house, until: t.until });
  }
  if (a.sade && f.sade.active) triggers.push({ kind: 'sade', end: f.sade.end });
  const count = triggers.length;
  return { count, dots: count >= 3 ? 3 : count === 2 ? 2 : 1, triggers };
}

/** Sub-periods ahead (after the running one) whose lord touches the area. */
export function linkedSubs(f: ChartFacts, kind: ReportKind): DashaPeriod[] {
  return f.dasha.ahead.slice(1).filter((s) => linked(f, kind, s.lord));
}
