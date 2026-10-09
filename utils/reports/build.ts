/**
 * Report engine: chart facts → chapters of plain-language text, in the app
 * language (locales <lang>/reports.json `e.*`). Deterministic: the same
 * profile, day and language always give the same report. No model involved.
 *
 * Rules (ReportsSpec board):
 *  - every sentence comes from a chart fact through a template; "Why we say
 *    this" states the fact (sign, house and dasha names appear only there);
 *  - planet names appear sparingly in the prose (timing, focus reason);
 *  - no scores except the focus dots, which count real triggers;
 *  - health is about energy and rest only, with a doctor line top and bottom;
 *  - wealth describes how money comes and stays (rules.md 5.7): never an
 *    investment, stock, crypto or lottery call; big decisions go to a
 *    qualified adviser;
 *  - Love & marriage isn't written for under-18s (guruLocked('love')).
 */
import { DASHA_YEARS, ZODIAC } from '../../constants/astrology';
import i18n, { formatMonthYear, intlLocale, localizeDigits, tNakshatra, tPlanet, tSign } from '../i18n';
import { phaseMeaning } from '../transits';
import { guruLocked } from '../guru-context';
import type { DashaPeriod } from '../astrology';
import {
  chartHash,
  elementOf,
  getChartFacts,
  isStrong,
  lordOf,
  occupants,
  PLANET_ORDER,
  type BirthProfile,
  type ChartFacts,
  type PlanetName,
} from './facts';
import { AREAS, focusFor, linked, linkedSubs, type Focus, type ReportKind } from './areas';
import { timingWindows, type TimingTopic, type TimingWindow } from '../timing-engine';
import { analyzeChart, yogasFor } from '../chart-analysis';
import { planAsk } from '../agent/astrologer';
import {
  REPORT_VERSION,
  type Chapter,
  type GlanceRow,
  type HelpItem,
  type HelpsChapter,
  type ReportLang,
  type ReportPayload,
  type TextChapter,
  type TimelineItem,
  type TimingChapter,
} from './types';

const DAY_MS = 86400000;
const YEAR_MS = 365.25 * DAY_MS;

// ─── Text helpers ─────────────────────────────────────────────────────────────

export const tr = (key: string, vars?: Record<string, unknown>): string =>
  i18n.t(`reports:e.${key}`, vars ?? {}) as string;

export const trArr = (key: string): string[] => {
  const v = i18n.t(`reports:e.${key}`, { returnObjects: true }) as unknown;
  return Array.isArray(v) ? (v as string[]) : [];
};

export const lang = (): ReportLang => {
  const l = i18n.language;
  return l === 'hi' || l === 'bn' ? l : 'en';
};

export const pl = (p: string) => tPlanet(p);
export const sg = (s: number) => tSign(ZODIAC[((s % 12) + 12) % 12].name);
export const my = (d: Date) => formatMonthYear(d);
export const dmy = (d: Date) =>
  localizeDigits(d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' }));

/** "a, b and c" in the app language. */
export function joinList(xs: string[]): string {
  if (xs.length < 2) return xs[0] ?? '';
  return tr('and', { a: xs.slice(0, -1).join(tr('listSep')), b: xs[xs.length - 1] });
}

/** Upper-case the first letter (English only; Indic scripts have no case). */
export function cap(s: string): string {
  return lang() === 'en' && s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' ');

/** Main influence on a house: its first occupant, else its ruler. */
function primary(f: ChartFacts, h: number): PlanetName {
  return occupants(f, h)[0] ?? lordOf(f, h);
}

/**
 * The chat planner's top planet for an ask (utils/agent/astrologer.ts: the
 * same career / partner / study ranking the chat names), so a report and a
 * chat answer about the same chart lead with the same field or trait.
 * Falls back to the house's main influence.
 */
function plannerTop(f: ChartFacts, ask: 'careerField' | 'partner' | 'studyField' | 'moneySources', h: number): PlanetName {
  try {
    const c = planAsk(ask, 'nature', f.profile, f.now, null);
    const p = c?.items[0]?.planet;
    if (p) return p as PlanetName;
  } catch { /* fall back */ }
  return primary(f, h);
}

/** Composite planet strength (utils/chart-analysis.ts), the same numbers the chat and timing engine use. */
function strengthOf(f: ChartFacts, p: PlanetName): number | null {
  try { return analyzeChart(f.profile).planets[p].strength; } catch { return null; }
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

// ─── "Why we say this" ───────────────────────────────────────────────────────

function whyBasis(f: ChartFacts): string {
  return f.basis === 'rising'
    ? tr('why.rising', { rising: sg(f.ascSign!), moon: sg(f.moonSign) })
    : tr('why.moonOnly', { moon: sg(f.moonSign) });
}

function whyDignity(f: ChartFacts, p: PlanetName): string {
  const x = f.planets[p];
  if (x.dignity === 'neutral') return '';
  return tr(`why.${x.dignity}`, { planet: pl(p), sign: sg(x.sign) });
}

/** "Saturn sits in the 10th house (career). The ruler of your 10th house, Venus, sits in the 11th." */
function whyHouse(f: ChartFacts, h: number): string {
  const lord = lordOf(f, h);
  const lh = f.planets[lord].house;
  // The ruler sitting at home is said once, by the ruler sentence.
  const occ = occupants(f, h).filter((p) => p !== lord);
  const inH = tr(`why.inHouse.${h}`);
  const parts: string[] = [];
  if (occ.length === 1) parts.push(tr('why.one', { planet: pl(occ[0]), in: inH }));
  if (occ.length > 1) parts.push(tr('why.many', { planets: joinList(occ.map(pl)), in: inH }));
  parts.push(lh === h
    ? tr('why.lordHome', { house: tr(`why.ofHouse.${h}`), planet: pl(lord) })
    : tr('why.lord', { house: tr(`why.ofHouse.${h}`), planet: pl(lord), in: tr(`why.inHouse.${lh}`) }));
  return parts.join(' ');
}

function whyElement(f: ChartFacts, p: PlanetName): string {
  const s = f.planets[p].sign;
  return tr('why.inSign', { planet: pl(p), sign: sg(s), element: tr(`why.element.${elementOf(s)}`) });
}

function whyMoon(f: ChartFacts): string {
  return tr('why.moonSign', { sign: sg(f.moonSign), element: tr(`why.element.${elementOf(f.moonSign)}`) });
}

function whyStretch(f: ChartFacts, kind: ReportKind): string {
  const a = f.dasha.antar;
  const parts = [tr('why.stretch', { start: my(a.start), sub: pl(a.lord), maha: pl(f.dasha.maha.lord), end: my(a.end) })];
  if (kind !== 'life' && linked(f, kind, a.lord)) parts.push(tr('why.stretchLinked', { planet: pl(a.lord), area: tr(`area.${kind}`) }));
  return parts.join(' ');
}

function whyTransits(f: ChartFacts, kind: ReportKind): string {
  const out: string[] = [];
  for (const t of Object.values(f.transits)) {
    if (!AREAS[kind].houses.includes(t.house)) continue;
    const base = { planet: pl(t.planet), in: tr(`why.inHouse.${t.house}`), sign: sg(t.sign) };
    out.push(t.until ? tr('why.transit', { ...base, date: my(t.until) }) : tr('why.transitOpen', base));
  }
  if (AREAS[kind].sade && f.sade.active && f.sade.end && f.sade.phase) {
    out.push(tr('why.sade', { phase: tr(`why.sadePhase.${f.sade.phase}`), date: my(f.sade.end) }));
  }
  return out.join(' ');
}

const chartWhy = (...parts: string[]) => join(tr('why.chart'), ...parts);
const timingWhy = (...parts: string[]) => join(tr('why.timing'), ...parts);

// ─── Focus and "now" ─────────────────────────────────────────────────────────

function focusReason(kind: ReportKind, focus: Focus): string {
  const area = tr(`area.${kind}`);
  if (focus.count === 0) return tr('focus.none', { area });
  const list = focus.triggers.map((t) =>
    t.kind === 'sub' ? tr('focus.sub', { planet: pl(t.lord) })
      : t.kind === 'transit' ? tr('focus.transit', { planetOf: tr(`planetOf.${t.planet}`) })
      : tr('focus.sade'));
  return tr('focus.reason', { count: focus.count, area, list: joinList(list) });
}

/** The short "what's happening" phrase for the tile and the "Right now" row (no focus word). */
export function nowWhat(f: ChartFacts, kind: ReportKind, focus: Focus): string {
  const houses = AREAS[kind].houses;
  const soon = f.now.getTime() + 183 * DAY_MS;
  const entering = f.ingresses.filter((i) => houses.includes(i.toHouse) && !houses.includes(i.fromHouse));
  const enteringSoon = entering.find((i) => i.date.getTime() < soon);
  if (enteringSoon) return tr('now.from', { what: tr(`now.in.${enteringSoon.planet}`), date: my(enteringSoon.date) });
  const sub = focus.triggers.find((t) => t.kind === 'sub');
  if (sub && sub.kind === 'sub') return tr('now.until', { what: tr(`now.sub.${sub.lord}`), date: my(sub.end) });
  const tran = focus.triggers.find((t) => t.kind === 'transit');
  if (tran && tran.kind === 'transit') {
    return tran.until
      ? tr('now.until', { what: tr(`now.stay.${tran.planet}`), date: my(tran.until) })
      : tr(`now.stay.${tran.planet}`);
  }
  const sade = focus.triggers.find((t) => t.kind === 'sade');
  if (sade && sade.kind === 'sade' && sade.end) return tr('now.from', { what: tr('now.sadeEnds'), date: my(sade.end) });
  if (entering[0]) return tr('now.from', { what: tr(`now.in.${entering[0].planet}`), date: my(entering[0].date) });
  const leaving = f.ingresses.find((i) => houses.includes(i.fromHouse) && !houses.includes(i.toHouse));
  if (leaving) return tr('now.from', { what: tr(`now.out.${leaving.planet}`), date: my(leaving.date) });
  return tr('now.steady');
}

export type AreaGlance = { kind: ReportKind; dots: 1 | 2 | 3; count: number; word: string; now: string; label: string };

/** Reports tab tile: focus dots and the "Now" line. */
export function areaGlance(profile: BirthProfile, kind: ReportKind, now: Date = new Date()): AreaGlance | null {
  if (!profile.birthDate) return null;
  const f = getChartFacts(profile, now);
  const focus = focusFor(f, kind);
  const word = tr(`focus.word.${focus.dots}`);
  return {
    kind, dots: focus.dots, count: focus.count, word,
    now: tr('now.line', { word, what: nowWhat(f, kind, focus) }),
    label: tr('focus.label', { word }),
  };
}

// ─── Timing ──────────────────────────────────────────────────────────────────

function stateOf(f: ChartFacts, d: Date): 'soon' | 'later' {
  return d.getTime() - f.now.getTime() < YEAR_MS ? 'soon' : 'later';
}

function subItem(f: ChartFacts, kind: ReportKind, s: DashaPeriod, isNow: boolean): TimelineItem {
  const link = kind !== 'life' && linked(f, kind, s.lord) ? tr(`timing.linked.${kind}`) : '';
  return {
    date: isNow ? tr('timing.nowTo', { date: my(s.end) }) : tr('timing.range', { from: my(s.start), to: my(s.end) }),
    tag: tr('timing.tag.chapter'),
    title: tr(`timing.sub.${s.lord}`),
    sub: join(phaseMeaning(s.lord, 'sub'), link),
    state: isNow ? 'now' : stateOf(f, s.start),
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    source: 'sub',
  };
}

/**
 * The timing-engine topic behind each report's "Best window" (the same
 * window chat gives for that question, so chat and reports agree).
 */
export const REPORT_TOPIC: Record<ReportKind, TimingTopic> = {
  life: 'general', career: 'job', love: 'marriage', health: 'health', study: 'education', family: 'property', wealth: 'money',
};
/** Kinds whose window is shown to under-18s (no job / home / marriage timing for minors). */
const MINOR_WINDOW: ReportKind[] = ['life', 'health', 'study'];

/** The report's best window, or null (minor and an adult topic, or unusable data). */
export function reportWindow(f: ChartFacts, kind: ReportKind): TimingWindow | null {
  if (f.minor && !MINOR_WINDOW.includes(kind)) return null;
  return timingWindows(f.profile, REPORT_TOPIC[kind], f.now).windows[0] ?? null;
}

function windowItem(f: ChartFacts, kind: ReportKind, w: TimingWindow): TimelineItem {
  return {
    date: tr('timing.range', { from: my(w.start), to: my(w.end) }),
    tag: tr('timing.tag.window'),
    title: tr(`timing.window.title.${kind}`),
    sub: tr(w.strength === 'strong' ? 'timing.window.strong' : 'timing.window.steady', { peak: my(w.peak) }),
    state: stateOf(f, w.start),
    start: w.start.toISOString(),
    end: w.end.toISOString(),
    source: 'window',
  };
}

export function timeline(f: ChartFacts, kind: ReportKind): TimelineItem[] {
  const area = AREAS[kind];
  const items: TimelineItem[] = [subItem(f, kind, f.dasha.antar, true)];
  const best = reportWindow(f, kind);
  const subs = kind === 'life' ? f.dasha.ahead.slice(1) : linkedSubs(f, kind);
  for (const s of subs.slice(0, 2)) items.push(subItem(f, kind, s, false));

  const nm = f.dasha.nextMaha;
  if (nm) {
    items.push({
      date: my(nm.start),
      tag: tr('timing.tag.chapter'),
      title: tr('timing.chapter', { years: DASHA_YEARS[nm.lord] }),
      sub: phaseMeaning(nm.lord, 'chapter'),
      state: stateOf(f, nm.start),
      start: nm.start.toISOString(),
      end: nm.end.toISOString(),
      source: 'chapter',
    });
  }

  const sadeDates = area.sadeTiming ? f.sadeEvents : [];
  for (const i of f.ingresses) {
    const into = area.houses.includes(i.toHouse) && !area.houses.includes(i.fromHouse);
    const outOf = area.houses.includes(i.fromHouse) && !area.houses.includes(i.toHouse);
    if (!into && !outOf) continue;
    // A Saturn move that starts or ends sade sati is told once, as that.
    if (i.planet === 'Saturn' && sadeDates.some((e) => Math.abs(e.date.getTime() - i.date.getTime()) < 45 * DAY_MS)) continue;
    items.push({
      date: dmy(i.date),
      tag: tr('timing.tag.move'),
      title: into ? tr(`timing.in.${i.planet}.title`) : tr(`timing.out.${i.planet}.title`),
      sub: into ? tr(`timing.in.${i.planet}.${kind}`) : tr(`timing.out.${i.planet}.sub`),
      state: stateOf(f, i.date),
      start: i.date.toISOString(),
      end: null,
      source: 'move',
    });
  }
  for (const e of sadeDates) {
    const k = e.kind === 'end' ? 'sadeEnd' : 'sadeStart';
    items.push({
      date: my(e.date),
      tag: tr('timing.tag.move'),
      title: tr(`timing.${k}.title`),
      sub: tr(`timing.${k}.sub`),
      state: stateOf(f, e.date),
      start: e.date.toISOString(),
      end: null,
      source: 'sade',
    });
  }
  const [first, ...rest] = items;
  const win = best ? windowItem(f, kind, best) : null;
  if (win) rest.push(win);
  rest.sort((a, b) => a.start.localeCompare(b.start));
  // Date order, at most 7 items; the best window always stays in.
  let room = win ? 5 : 6;
  return [first, ...rest.filter((i) => i === win || room-- > 0)];
}

function timingChapter(f: ChartFacts, kind: ReportKind, title: string, chip: string, body?: string): TimingChapter {
  return {
    type: 'timing',
    id: 'ch-timing',
    chip,
    title,
    body: body ?? (kind === 'life' ? tr('timing.bodyLife') : tr('timing.body', { area: tr(`area.${kind}`) })),
    items: timeline(f, kind),
    why: timingWhy(
      tr('why.timingBody', { nak: tNakshatra(nakName(f)), basis: tr(`why.basis.${f.basis}`) }),
      whyStretch(f, kind),
      whyTransits(f, kind),
    ),
  };
}

function nakName(f: ChartFacts): string {
  // NAKSHATRAS order matches the 27 equal divisions of the sidereal zodiac.
  return NAK_NAMES[Math.min(26, Math.floor(f.moonLon / (360 / 27)))];
}

const NAK_NAMES = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
];

// ─── What helps ──────────────────────────────────────────────────────────────

/** Weekday traditionally tied to each planet (Sunday = 0). */
const WEEKDAY_OF: Record<string, number> = { Sun: 0, Moon: 1, Mars: 2, Mercury: 3, Jupiter: 4, Venus: 5, Saturn: 6, Rahu: 6, Ketu: 2 };

function weekdayName(i: number): string {
  // 7 Jan 2024 was a Sunday.
  return new Date(2024, 0, 7 + i, 12).toLocaleDateString(intlLocale(), { weekday: 'long' });
}

function dayHabit(f: ChartFacts): HelpItem {
  const lord = f.dasha.antar.lord;
  return {
    t: tr('helps.day.t', { weekday: weekdayName(WEEKDAY_OF[lord] ?? 6) }),
    s: tr('helps.day.s', { habit: tr(`helps.habit.${lord}`) }),
  };
}

function pickHelps(kind: ReportKind, keys: string[], f: ChartFacts, n = 3): HelpItem[] {
  return uniq(keys).slice(0, n).map((k) => ({ t: tr(`helps.${kind}.${k}.t`), s: tr(`helps.${kind}.${k}.s`) }));
}

function helpsChapter(f: ChartFacts, kind: ReportKind, focus: Focus, chip: string): HelpsChapter {
  const sub = f.dasha.antar.lord;
  const moonEl = elementOf(f.moonSign);
  const has = (cond: boolean, k: string) => (cond ? [k] : []);
  let keys: string[];
  switch (kind) {
    case 'life':
      keys = [...has(focus.dots >= 2, 'oneThing'), 'journal', 'people', 'body'];
      break;
    case 'career': {
      const rahuWork = f.ingresses.some((i) => i.planet === 'Rahu' && AREAS.career.houses.includes(i.toHouse))
        || AREAS.career.houses.includes(f.transits.Rahu.house);
      keys = [
        ...has(focus.dots >= 2 || ['Rahu', 'Mars'].includes(sub), 'oneGoal'),
        ...has(['Rahu', 'Mars', 'Ketu'].includes(sub) || rahuWork, 'waitMonth'),
        ...has(['Jupiter', 'Saturn'].includes(sub), 'mentor'),
        ...has(focus.dots === 1, 'skill'),
        'wins', 'saveFirst',
      ];
      break;
    }
    case 'love': {
      const fiery = ['Mars', 'Sun'].some((p) => f.planets[p as PlanetName].house === 7) || f.planets.Mars.house === 1;
      const nodes = [1, 7, 5].includes(f.planets.Rahu.house) || sub === 'Rahu';
      const reserved = ['Saturn', 'Ketu', 'Moon'].some((p) => f.planets[p as PlanetName].house === 7) || ['Saturn', 'Ketu'].includes(sub);
      keys = ['talk', ...has(fiery, 'coolDown'), ...has(nodes, 'slow'), ...has(reserved, 'sayIt'), 'ownLife', 'sayIt'];
      break;
    }
    case 'health':
      keys = [
        'sleep',
        ...has(moonEl === 'air' || ['Mercury', 'Rahu'].includes(sub), 'screens'),
        ...has(moonEl === 'fire' || moonEl === 'earth' || ['Mars', 'Sun'].includes(sub), 'move'),
        'light', 'move',
      ];
      // Two of the above, then the doctor line always.
      return {
        type: 'helps', id: 'ch-helps', chip, title: tr('helps.title'),
        items: [...pickHelps('health', keys, f, 2), ...pickHelps('health', ['checkup'], f, 1), dayHabit(f)],
        note: '',
      };
    case 'study':
      keys = [
        'plan',
        ...has(moonEl === 'air' || ['Rahu', 'Mercury'].includes(sub), 'phone'),
        ...has(elementOf(f.planets.Mercury.sign) === 'air', 'teach'),
        ...has(moonEl === 'earth' || moonEl === 'water', 'review'),
        'ask', 'phone',
      ];
      break;
    case 'wealth': {
      const pressure = f.sade.active || ['Rahu', 'Mars', 'Ketu', 'Saturn'].includes(sub);
      keys = [
        'saveFirst',
        ...has(pressure, 'noLend'),
        ...has(focus.dots >= 2 || pressure, 'cushion'),
        ...has(f.minor, 'learn'),
        ...has(!f.minor && ['Rahu', 'Mercury', 'Venus', 'Moon'].includes(sub), 'track'),
        'leak', 'cushion', ...has(!f.minor, 'adviser'),
      ];
      break;
    }
    case 'family':
      keys = [
        'meal',
        ...has(!f.minor, 'call'),
        ...has(f.minor || focus.dots >= 2, 'share'),
        ...has(moonEl === 'water' || ['Ketu', 'Saturn'].includes(sub), 'corner'),
        'listen', 'share',
      ];
      break;
  }
  return {
    type: 'helps', id: 'ch-helps', chip, title: tr('helps.title'),
    items: [...pickHelps(kind, keys, f, 3), dayHabit(f)],
    note: '',
  };
}

// ─── Chapters per kind ───────────────────────────────────────────────────────

function text(id: string, chip: string, title: string, body: string, why: string, items: string[] = [], tone: 'plain' | 'watch' = 'plain'): TextChapter {
  return { type: 'text', id, chip, title, body, items, tone, why };
}

/** Planet watch-outs: debilitated planets first, then the given candidates; avoids `skip` when it can. */
function watchPlanets(f: ChartFacts, candidates: PlanetName[], skip: PlanetName[], n = 3): PlanetName[] {
  const weak = PLANET_ORDER.filter((p) => f.planets[p].dignity === 'debilitated');
  const all = uniq([...weak, ...candidates]);
  const preferred = all.filter((p) => !skip.includes(p));
  return uniq([...preferred, ...all]).slice(0, n);
}

function strongPlanets(f: ChartFacts, candidates: PlanetName[], n = 4): PlanetName[] {
  const strong = PLANET_ORDER.filter((p) => isStrong(f.planets[p]));
  return uniq([...strong, ...candidates]).slice(0, n);
}

function dignityWhys(f: ChartFacts, ps: PlanetName[]): string {
  return ps.map((p) => whyDignity(f, p)).filter(Boolean).join(' ');
}

/** For each listed planet: its dignity if notable, else where it sits. */
function whyFor(f: ChartFacts, ps: PlanetName[]): string {
  return ps.map((p) => whyDignity(f, p)
    || tr('why.one', { planet: pl(p), in: tr(`why.inHouse.${f.planets[p].house}`) })).join(' ');
}

type Built = { chapters: Chapter[]; lead: string; glance: [GlanceRow, GlanceRow]; topNote?: string };

function chips(kind: string) {
  return (k: string) => tr(`${kind}.chips.${k}`);
}
function titles(kind: string) {
  return (k: string) => tr(`${kind}.titles.${k}`);
}

function linkSentence(f: ChartFacts, h: number, key: string): string {
  const lh = f.planets[lordOf(f, h)].house;
  return lh === h ? '' : tr(key, { place: tr(`place.${lh}`) });
}

function buildLife(f: ChartFacts, focus: Focus): Built {
  const c = chips('life'), t = titles('life');
  const el = elementOf(f.ascSign ?? f.moonSign);
  const lord1 = lordOf(f, 1);
  const who = join(
    tr(`life.nature.${el}`),
    tr(`life.mind.${f.moonSign}`),
    tr('life.focus', { place: tr(`place.${f.planets[lord1].house}`) }),
  );
  const strong = strongPlanets(f, [...occupants(f, 1), lord1, lordOf({ first: f.moonSign }, 1), 'Jupiter']);
  const watch = watchPlanets(f, [f.dasha.antar.lord as PlanetName, 'Rahu', 'Saturn', lord1], strong);
  const m = f.dasha.maha, a = f.dasha.antar;
  const chaptersBody = tr('life.chaptersBody', {
    end: my(m.end), meaning: phaseMeaning(m.lord, 'chapter'),
    subEnd: my(a.end), subMeaning: phaseMeaning(a.lord, 'sub'),
  });
  return {
    lead: tr(`life.nature.${el}`),
    glance: [
      { k: tr('glance.life.k1'), v: tr(`short.nature.${el}`) },
      { k: tr('glance.life.k2'), v: tr(`short.inside.${elementOf(f.moonSign)}`) },
    ],
    chapters: [
      text('ch-who', c('who'), t('who'), who,
        chartWhy(whyBasis(f), tr('why.nak', { nak: tNakshatra(nakName(f)) }), whyHouse(f, 1))),
      text('ch-strong', c('strong'), t('strong'), tr('life.strongIntro'),
        chartWhy(whyFor(f, strong)),
        strong.map((p) => tr(`gift.${p}`))),
      text('ch-watch', c('watch'), t('watch'), tr('life.watchIntro'),
        timingWhy(whyStretch(f, 'life'), tr('why.chart'), whyFor(f, watch)),
        watch.map((p) => tr(`watch.${p}`)), 'watch'),
      timingChapter(f, 'life', t('chapters'), c('chapters'), chaptersBody),
      helpsChapter(f, 'life', focus, c('helps')),
    ],
  };
}

function buildCareer(f: ChartFacts, focus: Focus): Built {
  const c = chips('career'), t = titles('career');
  const P = plannerTop(f, 'careerField', 10);
  const lord2 = lordOf(f, 2);
  const gain = primary(f, 11);
  const strong = strongPlanets(f, [...occupants(f, 10), lordOf(f, 10), 'Mercury', lordOf(f, 1)]);
  const watchCands: PlanetName[] = [
    ...(linked(f, 'career', f.dasha.antar.lord) ? [f.dasha.antar.lord as PlanetName] : []),
    ...(AREAS.career.houses.includes(f.planets.Rahu.house) ? ['Rahu' as const] : []),
    lordOf(f, 10), 'Sun', 'Rahu', 'Saturn',
  ];
  const watch = watchPlanets(f, watchCands, strong);
  return {
    lead: tr(`career.p.${P}.lead`),
    glance: [
      { k: tr('glance.career.k1'), v: tr(`giftShort.${P}`) },
      { k: tr('glance.career.k2'), v: tr(`short.money.${lord2}`) },
    ],
    chapters: [
      text('ch-you', c('you'), t('you'),
        join(tr(`career.p.${P}.lead`), tr(`career.p.${P}.more`), linkSentence(f, 10, 'career.link')),
        chartWhy(whyHouse(f, 10), dignityWhys(f, [P]))),
      text('ch-strong', c('strong'), t('strong'), tr('career.strongIntro'),
        chartWhy(whyHouse(f, 10), whyFor(f, strong.filter((p) => !occupants(f, 10).includes(p) && p !== lordOf(f, 10)))), strong.map((p) => tr(`gift.${p}`))),
      text('ch-watch', c('watch'), t('watch'), tr(focus.dots >= 2 ? 'career.watchIntroBusy' : 'career.watchIntro'),
        timingWhy(whyStretch(f, 'career'), whyTransits(f, 'career'), tr('why.chart'), whyFor(f, watch)),
        watch.map((p) => tr(`watch.${p}`)), 'watch'),
      text('ch-money', c('money'), t('money'),
        join(tr(`career.money.${lord2}`), tr('career.gains', { via: tr(`career.via.${gain}`) }), tr('career.rule')),
        chartWhy(whyHouse(f, 2), whyHouse(f, 11))),
      timingChapter(f, 'career', t('timing'), c('timing')),
      helpsChapter(f, 'career', focus, c('helps')),
    ],
  };
}

function buildLove(f: ChartFacts, focus: Focus): Built {
  const c = chips('love'), t = titles('love');
  const P = plannerTop(f, 'partner', 7);
  const venus = f.planets.Venus;
  const vEl = elementOf(venus.sign);
  const give = join(
    tr(`love.give.${vEl}`),
    isStrong(venus) ? tr('love.giveStrong') : venus.dignity === 'debilitated' ? tr('love.giveWeak') : '',
  );
  const lord7 = lordOf(f, 7);
  const cands: PlanetName[] = [
    ...occupants(f, 7),
    ...(f.planets[lord7].dignity === 'debilitated' ? [lord7] : []),
    ...([1, 4, 7, 8, 12].includes(f.planets.Mars.house) ? ['Mars' as const] : []),
    ...([1, 7].includes(f.planets.Rahu.house) ? ['Rahu' as const] : []),
    ...([1, 7].includes(f.planets.Ketu.house) ? ['Ketu' as const] : []),
    ...(venus.dignity === 'debilitated' ? ['Venus' as const] : []),
    lord7, 'Moon', 'Sun',
  ];
  const watch = uniq(cands).slice(0, 3);
  return {
    lead: tr(`love.p.${P}.lead`),
    glance: [
      { k: tr('glance.love.k1'), v: tr(`short.need.${P}`) },
      { k: tr('glance.love.k2'), v: tr(`short.give.${vEl}`) },
    ],
    chapters: [
      text('ch-need', c('need'), t('need'),
        join(tr(`love.p.${P}.lead`), tr(`love.p.${P}.more`), linkSentence(f, 7, 'love.link')),
        chartWhy(whyHouse(f, 7))),
      text('ch-give', c('give'), t('give'), give, chartWhy(whyElement(f, 'Venus'), whyDignity(f, 'Venus'))),
      text('ch-watch', c('watch'), t('watch'), tr('love.watchIntro'),
        chartWhy(whyHouse(f, 7), whyFor(f, watch.filter((p) => !occupants(f, 7).includes(p) && p !== lord7))),
        watch.map((p) => tr(`love.watch.${p}`)), 'watch'),
      timingChapter(f, 'love', t('timing'), c('timing')),
      helpsChapter(f, 'love', focus, c('helps')),
    ],
  };
}

function buildHealth(f: ChartFacts, focus: Focus): Built {
  const c = chips('health'), t = titles('health');
  const P = primary(f, 1);
  const el = elementOf(f.moonSign);
  return {
    topNote: tr('health.top'),
    lead: tr(`health.p.${P}.lead`),
    glance: [
      { k: tr('glance.health.k1'), v: tr(`short.energy.${P}`) },
      { k: tr('glance.health.k2'), v: tr(`short.rest.${el}`) },
    ],
    chapters: [
      text('ch-energy', c('energy'), t('energy'), join(tr(`health.p.${P}.lead`), tr(`health.p.${P}.more`)),
        chartWhy(whyBasis(f), whyHouse(f, 1))),
      text('ch-stress', c('stress'), t('stress'), tr('health.stressIntro'), chartWhy(whyMoon(f)),
        trArr(`health.stress.${el}`), 'watch'),
      text('ch-rest', c('rest'), t('rest'), join(tr(`health.rest.${el}`), f.sade.active ? tr('health.restSade') : ''),
        chartWhy(whyMoon(f), whyHouse(f, 12), whyTransits(f, 'health'))),
      timingChapter(f, 'health', t('timing'), c('timing')),
      helpsChapter(f, 'health', focus, c('helps')),
    ],
  };
}

function buildStudy(f: ChartFacts, focus: Focus): Built {
  const c = chips('study'), t = titles('study');
  const merc = f.planets.Mercury;
  const mEl = elementOf(merc.sign);
  const P = plannerTop(f, 'studyField', 5);
  return {
    lead: tr(`study.learn.${mEl}.lead`),
    glance: [
      { k: tr('glance.study.k1'), v: tr(`short.learn.${mEl}`) },
      { k: tr('glance.study.k2'), v: tr(`short.course.${P}`) },
    ],
    chapters: [
      text('ch-learn', c('learn'), t('learn'),
        join(tr(`study.learn.${mEl}.lead`), tr(`study.learn.${mEl}.more`),
          isStrong(merc) ? tr('study.mindStrong') : merc.dignity === 'debilitated' ? tr('study.mindWeak') : ''),
        chartWhy(whyElement(f, 'Mercury'), whyDignity(f, 'Mercury'))),
      text('ch-focus', c('focus'), t('focus'), tr(`study.focus.${elementOf(f.moonSign)}`), chartWhy(whyMoon(f))),
      text('ch-course', c('course'), t('course'), join(tr(`study.course.${P}`), tr('study.courseEnd')),
        chartWhy(whyHouse(f, 5), whyHouse(f, 9))),
      timingChapter(f, 'study', t('timing'), c('timing')),
      helpsChapter(f, 'study', focus, c('helps')),
    ],
  };
}

type Level = 'strong' | 'mid' | 'weak';
function levelOf(f: ChartFacts, ps: PlanetName[]): Level {
  const strong = ps.some((p) => isStrong(f.planets[p]));
  const weak = ps.some((p) => f.planets[p].dignity === 'debilitated');
  return strong && !weak ? 'strong' : weak && !strong ? 'weak' : 'mid';
}

function buildFamily(f: ChartFacts, focus: Focus): Built {
  const c = chips('family'), t = titles('family');
  const P = primary(f, 4);
  const lord4 = lordOf(f, 4), lord9 = lordOf(f, 9);
  const mother = levelOf(f, uniq([lord4, 'Moon' as const]));
  const father = levelOf(f, uniq([lord9, 'Sun' as const]));
  const chapters: Chapter[] = [
    text('ch-home', c('home'), t('home'),
      join(tr(`family.p.${P}.lead`), tr(`family.p.${P}.more`), linkSentence(f, 4, 'family.link')),
      chartWhy(whyHouse(f, 4), dignityWhys(f, [P]))),
    text('ch-parents', c('parents'), t('parents'),
      join(tr(`family.mother.${mother}`), tr(`family.father.${father}`)),
      chartWhy(whyHouse(f, 4), whyHouse(f, 9), dignityWhys(f, uniq([lord4, 'Moon', lord9, 'Sun'] as PlanetName[])))),
  ];
  if (!f.minor) {
    const C = primary(f, 5);
    chapters.push(text('ch-children', c('children'), t('children'), tr(`family.children.${C}`), chartWhy(whyHouse(f, 5))));
  }
  chapters.push(timingChapter(f, 'family', t('timing'), c('timing')), helpsChapter(f, 'family', focus, c('helps')));
  return {
    lead: tr(`family.p.${P}.lead`),
    glance: [
      { k: tr('glance.family.k1'), v: tr(`short.home.${P}`) },
      { k: tr('glance.family.k2'), v: tr(`short.role.${elementOf(f.moonSign)}`) },
    ],
    chapters,
  };
}

/**
 * Wealth (rules.md 5.7): where money comes from (the chat planner's money
 * source, and where the ruler of the 11th sits), how it stays (the 2nd
 * house's ruler, its hora half in D2 when the birth time is known, Jupiter),
 * classical dhana yogas (utils/chart-analysis.ts), leaks to watch, and the
 * timing engine's money window. Practical, free habits only.
 */
function buildWealth(f: ChartFacts, focus: Focus): Built {
  const c = chips('wealth'), t = titles('wealth');
  const P = plannerTop(f, 'moneySources', 11);
  const lord2 = lordOf(f, 2), lord11 = lordOf(f, 11);
  const src = f.planets[lord11].house;

  // D2 (hora): the 2nd lord in the Sun's half earns, in the Moon's half keeps.
  // Only with a birth time, and only when the half doesn't change within ±10 min.
  let hora: 'sun' | 'moon' | null = null;
  let analysis: ReturnType<typeof analyzeChart> | null = null;
  try { analysis = analyzeChart(f.profile); } catch { analysis = null; }
  const d2 = analysis?.vargas.charts.D2;
  if (f.hasTime && f.hasPlace && d2 && d2.planetStable[lord2]) hora = d2.planets[lord2] === 4 ? 'sun' : 'moon';

  const jup = f.planets.Jupiter;
  const jupLevel: Level = isStrong(jup) ? 'strong' : jup.dignity === 'debilitated' ? 'weak' : 'mid';
  const dhana = analysis ? yogasFor(analysis, [2, 11], ['dhana']) : [];

  const watchCands: PlanetName[] = [
    ...occupants(f, 12),
    ...([2, 11, 12].includes(f.planets.Rahu.house) ? ['Rahu' as const] : []),
    ...([2, 12].includes(f.planets.Mars.house) ? ['Mars' as const] : []),
    ...(linked(f, 'wealth', f.dasha.antar.lord) ? [f.dasha.antar.lord as PlanetName] : []),
    lordOf(f, 12), 'Venus', 'Moon',
  ];
  const watch = watchPlanets(f, watchCands, [P], 3);

  return {
    lead: tr(`wealth.p.${P}.lead`),
    glance: [
      { k: tr('glance.wealth.k1'), v: tr(`short.source.${P}`) },
      { k: tr('glance.wealth.k2'), v: tr(`short.keep.${lord2}`) },
    ],
    chapters: [
      text('ch-earn', c('earn'), t('earn'),
        join(tr(`wealth.p.${P}.lead`), tr(`wealth.p.${P}.more`), tr(`wealth.src.${src}`)),
        chartWhy(whyHouse(f, 11), dignityWhys(f, [P]), tr('why.moneyPlanner', { planet: pl(P) }))),
      text('ch-keep', c('keep'), t('keep'),
        join(tr(`wealth.keep.${lord2}`), hora ? tr(`wealth.hora.${hora}`) : ''),
        chartWhy(whyHouse(f, 2), dignityWhys(f, [lord2]),
          hora ? tr('why.hora', { planet: pl(lord2), half: tr(`why.horaHalf.${hora}`) }) : '')),
      text('ch-signs', c('signs'), t('signs'),
        join(tr(dhana.length ? 'wealth.yoga.found' : 'wealth.yoga.none'), tr(`wealth.jupiter.${jupLevel}`)),
        chartWhy(
          ...dhana.slice(0, 2).map((y) => tr('why.dhana', { a: pl(y.planets[0]), b: pl(y.planets[1] ?? y.planets[0]) })),
          whyFor(f, ['Jupiter']),
        )),
      text('ch-watch', c('watch'), t('watch'), tr(focus.dots >= 2 ? 'wealth.watchIntroBusy' : 'wealth.watchIntro'),
        timingWhy(whyStretch(f, 'wealth'), whyTransits(f, 'wealth'), tr('why.chart'), whyHouse(f, 12),
          whyFor(f, watch.filter((p) => !occupants(f, 12).includes(p) && p !== lordOf(f, 12)))),
        watch.map((p) => tr(`wealth.watch.${p}`)), 'watch'),
      timingChapter(f, 'wealth', t('timing'), c('timing')),
      helpsChapter(f, 'wealth', focus, c('helps')),
    ],
  };
}

const BUILDERS: Record<ReportKind, (f: ChartFacts, focus: Focus) => Built> = {
  life: buildLife, career: buildCareer, love: buildLove, health: buildHealth, study: buildStudy, family: buildFamily,
  wealth: buildWealth,
};

// ─── Assembly ────────────────────────────────────────────────────────────────

/** Strip the <em> markers (share text, word counts, PDF fallbacks). */
export const plain = (s: string) => s.replace(/<\/?em>/g, '');

export function minutesToRead(chapters: Chapter[], extra: string[] = []): number {
  const words: string[] = [...extra];
  for (const c of chapters) {
    if (c.type === 'helps') c.items.forEach((h) => words.push(h.t, h.s));
    else if (c.type === 'checks') {
      words.push(c.title, c.body, c.why);
      c.items.forEach((i) => words.push(i.text, i.detail, ...i.people.flatMap((p) => [p.text, ...p.detail])));
    } else {
      words.push(c.title, c.body, c.why);
      if (c.type === 'text') words.push(...c.items);
      else c.items.forEach((i) => words.push(i.title, i.sub));
    }
  }
  const n = words.join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(n / 180));
}

export function footerFor(kind: string, name: string, now: Date): string {
  const extra = tr(`footer.${kind}`, { defaultValue: '' });
  return join(tr('footer.base', { name, date: dmy(now) }), extra);
}

export function canRead(kind: ReportKind, profile: BirthProfile, now: Date = new Date()): boolean {
  if (!profile.birthDate) return false;
  return !(kind === 'love' && guruLocked('love', profile.birthDate, now));
}

/**
 * The report for one person, in the current app language, or null when it
 * can't be written (no birth date; Love & marriage for an under-18).
 */
export function buildReport(kind: ReportKind, profile: BirthProfile & { id: string; name: string }, now: Date = new Date()): ReportPayload | null {
  if (!canRead(kind, profile, now)) return null;
  const f = getChartFacts(profile, now);
  const focus = focusFor(f, kind);
  const built = BUILDERS[kind](f, focus);
  const word = tr(`focus.word.${focus.dots}`);
  const first = profile.name.split(' ')[0] || profile.name;
  const line = join(built.lead, tr(`lineNow.${kind}.${focus.dots}`));
  return {
    version: REPORT_VERSION,
    lang: lang(),
    kind,
    profileId: profile.id,
    chartHash: chartHash(profile),
    generatedAt: now.toISOString(),
    title: i18n.t(`reports:kind.${kind}.title`) as string,
    summary: {
      eyebrow: i18n.t('reports:detail.inOneLine') as string,
      line,
      glance: [...built.glance, { k: tr('glance.now'), v: cap(nowWhat(f, kind, focus)) }],
      focus: { dots: focus.dots, count: focus.count, label: tr('focus.label', { word }), reason: focusReason(kind, focus) },
    },
    topNote: built.topNote ?? null,
    chapters: built.chapters,
    disclaimer: footerFor(kind, first, now),
    approximate: f.basis === 'moon',
    minutes: minutesToRead(built.chapters, [line]),
  };
}
