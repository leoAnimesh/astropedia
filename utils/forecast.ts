/**
 * Year-ahead forecast: twelve months from the current month, built from the
 * Vimshottari sub-periods (antardashas) and slow-planet sign changes.
 *
 * Deterministic. For each month:
 *   - the sub-period running at the start of the month
 *   - any sub-period or life-chapter change inside the month
 *   - Jupiter, Saturn and Rahu/Ketu sign changes inside the month
 *     (mean positions from getChartPositions, sampled every few days and
 *     refined to the day)
 *
 * Month labels, tags and lines are display text in the app language
 * (namespace `forecast`); planet and sign names stay English in the data.
 */

import { ZODIAC, DASHA_YEARS } from '@/constants/astrology';
import {
  getChartPositions,
  getLifeChapters,
  type DashaPeriod,
} from './astrology';
import { localDateIso } from './format';
import i18n, { formatMonthYear, intlLocale, tPlanet, tSign } from './i18n';
import { phaseMeaning } from './transits';

// ─── Sub-period division (mirrors the private helper in utils/astrology.ts) ──

const DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** The nine sub-periods of a life chapter, in dasha order from its own lord. */
export function subPeriodsOf(chapter: DashaPeriod): DashaPeriod[] {
  const out: DashaPeriod[] = [];
  let cursor = chapter.start;
  const first = DASHA_ORDER.indexOf(chapter.lord);
  for (let i = 0; i < DASHA_ORDER.length; i++) {
    const lord = DASHA_ORDER[(first + i) % DASHA_ORDER.length];
    const years = (DASHA_YEARS[chapter.lord] * DASHA_YEARS[lord]) / 120;
    const end = new Date(cursor.getTime() + years * MS_PER_YEAR);
    out.push({ lord, start: cursor, end });
    cursor = end;
  }
  return out;
}

// ─── Slow-planet sign changes ────────────────────────────────────────────────

export type SignChange = { planet: string; date: Date; sign: string };

const SLOW_PLANETS = ['Jupiter', 'Saturn', 'Rahu'];
const STEP_DAYS = 4;

function signsOn(d: Date): Record<string, number> {
  const pos = getChartPositions({ birthDate: localDateIso(d), birthTime: '12:00' });
  const out: Record<string, number> = {};
  for (const p of pos) if (SLOW_PLANETS.includes(p.name)) out[p.name] = p.signIndex;
  return out;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/** Sign changes of Jupiter, Saturn and Rahu between `from` and `to`. */
export function findSlowSignChanges(from: Date, to: Date): SignChange[] {
  const out: SignChange[] = [];
  let prevDay = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  let prev = signsOn(prevDay);
  while (prevDay < to) {
    const day = addDays(prevDay, STEP_DAYS);
    const cur = signsOn(day);
    for (const planet of SLOW_PLANETS) {
      if (cur[planet] === prev[planet]) continue;
      // Refine to the first day inside this step showing the new sign.
      let hit = day;
      for (let k = 1; k < STEP_DAYS; k++) {
        const d = addDays(prevDay, k);
        if (signsOn(d)[planet] !== prev[planet]) { hit = d; break; }
      }
      if (hit < to) out.push({ planet, date: hit, sign: ZODIAC[cur[planet]].name });
    }
    prevDay = day;
    prev = cur;
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Month rows ──────────────────────────────────────────────────────────────

export type ForecastMonth = {
  start:     Date;
  /** Short month name in the app language ("Oct", "अक्टू॰"). */
  label:     string;
  year:      number;
  /** Sub-period running at the start of the month. */
  lord:      string;
  /** "Mercury sub-period" or "Change: Ketu begins", in the app language. */
  tag:       string;
  line:      string;
  isCurrent: boolean;
  /** A sub-period or life chapter begins this month. */
  isChange:  boolean;
  changes:   { kind: 'sub' | 'chapter'; lord: string; date: Date }[];
  transits:  SignChange[];
};

/**
 * Shorter steady-state lines for months in the middle of a sub-period, drawn
 * from the same themes as PHASE_MEANINGS (`forecast:steady.<Lord>.0..2`).
 * Rotated month to month so a long sub-period does not read as one line
 * repeated.
 */
const STEADY_LINES = 3;
const STEADY_LORDS = new Set(['Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus']);

/** Sign-change lines in `forecast:transitLine.<Planet>`. */
const TRANSIT_LINE_PLANETS = new Set(['Jupiter', 'Saturn', 'Rahu']);

/** "Oct" in the app language. */
function monthShort(d: Date): string {
  return d.toLocaleDateString(intlLocale(), { month: 'short' });
}

/** "Oct 3" in the app language. */
function dayMonth(d: Date): string {
  return d.toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' });
}

export function transitLabel(t: SignChange): string {
  return i18n.t('forecast:transitLabel', { planet: tPlanet(t.planet), sign: tSign(t.sign), date: dayMonth(t.date) });
}

export function getYearAhead(
  profile: { birthDate: string; birthTime?: string | null; birthLng?: number | null },
  now: Date = new Date(),
  months = 12,
): ForecastMonth[] {
  const life = getLifeChapters(profile, now);
  const chapterIdx = life.currentIndex;
  // Sub-periods of the current chapter and the next one cover any 12-month span
  // (the shortest chapter, Sun, is 6 years).
  const chapters = life.chapters.slice(chapterIdx, chapterIdx + 2);
  const subs = chapters.flatMap(subPeriodsOf);

  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + months, 1);
  const transits = findSlowSignChanges(first, last);

  const out: ForecastMonth[] = [];
  for (let i = 0; i < months; i++) {
    const start = new Date(first.getFullYear(), first.getMonth() + i, 1);
    const end   = new Date(first.getFullYear(), first.getMonth() + i + 1, 1);
    const running = subs.find((s) => s.start <= start && start < s.end) ?? subs[0];

    const changes: ForecastMonth['changes'] = [];
    for (const c of chapters) {
      if (c.start >= start && c.start < end) changes.push({ kind: 'chapter', lord: c.lord, date: c.start });
    }
    for (const s of subs) {
      if (s.start >= start && s.start < end && !changes.some((c) => c.date.getTime() === s.start.getTime())) {
        changes.push({ kind: 'sub', lord: s.lord, date: s.start });
      }
    }
    const monthTransits = transits.filter((t) => t.date >= start && t.date < end);
    const isCurrent = i === 0;
    const change = changes[changes.length - 1];

    let tag: string;
    let line: string;
    if (change) {
      tag = i18n.t(change.kind === 'chapter' ? 'forecast:tag.newChapter' : 'forecast:tag.change', {
        planet: tPlanet(change.lord),
      });
      line = phaseMeaning(change.lord, change.kind);
    } else {
      tag = i18n.t('forecast:tag.sub', { planet: tPlanet(running.lord) });
      const endsNextMonth = running.end < new Date(end.getFullYear(), end.getMonth() + 1, 1);
      if (isCurrent) {
        line = phaseMeaning(running.lord, 'sub');
      } else if (monthTransits.length) {
        const t = monthTransits[0];
        const vars = { planet: tPlanet(t.planet), sign: tSign(t.sign) };
        line = TRANSIT_LINE_PLANETS.has(t.planet)
          ? i18n.t(`forecast:transitLine.${t.planet}`, vars)
          : i18n.t('forecast:transitLine.other', vars);
      } else if (endsNextMonth) {
        const next = subs[subs.indexOf(running) + 1];
        line = next
          ? i18n.t('forecast:lastStretch', {
              planet: tPlanet(running.lord),
              next:   tPlanet(next.lord),
              date:   formatMonthYear(next.start),
            })
          : phaseMeaning(running.lord, 'sub');
      } else {
        line = STEADY_LORDS.has(running.lord)
          ? i18n.t(`forecast:steady.${running.lord}.${i % STEADY_LINES}`)
          : phaseMeaning(running.lord, 'sub');
      }
    }

    out.push({
      start,
      label: monthShort(start),
      year:  start.getFullYear(),
      lord:  running.lord,
      tag,
      line,
      isCurrent,
      isChange: changes.length > 0,
      changes,
      transits: monthTransits,
    });
  }
  return out;
}
