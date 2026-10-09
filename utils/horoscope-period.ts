/**
 * Horoscope for Today (extras), This week and This month. Deterministic, no
 * LLM, same spirit as utils/horoscope.ts: real sky facts for the period pick
 * plain-language phrasings (locales <lang>/horoscope.json `period.*`).
 *
 * Inputs per day (at local noon, the person's natal Moon as reference):
 * - Moon's sign counted from the natal Moon sign (chandra bala: 1, 3, 6, 7,
 *   10, 11 easy; 4, 8, 12 heavy; the 8th is "chandrashtama"),
 * - Moon's nakshatra counted from the birth nakshatra (tara bala),
 * - new / full moon (tithi), festivals (utils/festivals.ts),
 * plus for the period: slow-planet sign changes (Jupiter, Saturn, Rahu) and
 * the Sun's monthly move, read relative to the natal Moon like the model
 * context's "Now (sky today)" lines; sade sati status (utils/sade-sati.ts);
 * the dasha stretch running and any stretch change (utils/astrology.ts).
 *
 * The prose never names signs or houses (plain-language direction); planet
 * names appear only where they carry the news (Jupiter moves on, etc.).
 * Same (profile, period, language) → same text.
 */

import { getDashaTimeline, getMoonLongitudeExact, siderealLongitudeAt, signChanges } from './astrology';
import { getFestivals, festivalDate, type FestivalEvent } from './festivals';
import { moonNakshatraAt, moonSignAt, sankrantiAfter, sunSignAt, tithiAt } from './lunar';
import { jdFromDate } from './sun';
import { phaseMeaning } from './transits';
import i18n, { intlLocale, localizeDigits, tPlanet } from './i18n';
import type { Profile } from './database';

export type DayTone = 'good' | 'gentle' | 'neutral';

export type PeriodSections = { love: string; career: string; wellness: string; guidance: string };

export type PeriodMantra = { text: string; note: string };

export type WeekDay = { date: Date; weekday: string; day: string; tone: DayTone; isToday: boolean };

export type KeyDate = { date: Date; month: string; day: string; title: string; sub: string; /** 0 = biggest news. */ rank: number };

export type PeriodHoroscope = {
  label:    string;
  quote:    string;
  sections: PeriodSections;
  mantra:   PeriodMantra;
  days?:    WeekDay[];
  keyDates?: KeyDate[];
};

const DAY_MS = 86400000;
const EASY_MOON = [1, 3, 6, 7, 10, 11];
const HEAVY_MOON = [4, 8, 12];
const GOOD_TARA = [2, 4, 6, 8, 9];
const BAD_TARA = [3, 5, 7];
const JUP_GOOD = [2, 5, 7, 9, 11];
const SAT_GOOD = [3, 6, 11];
const WEEKDAY_RULER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

// ─── Seeded RNG (as utils/horoscope.ts) ──────────────────────────────────────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tr = (key: string, vars?: Record<string, unknown>) => i18n.t(`horoscope:period.${key}`, vars ?? {}) as string;

/** Pick from a pool sized by the English file, rendered in the app language. */
function pick(rng: () => number, key: string, vars?: Record<string, unknown>): string {
  const pool = i18n.t(`horoscope:period.${key}`, { lng: 'en', returnObjects: true }) as unknown;
  const n = Array.isArray(pool) ? pool.length : 1;
  const i = Math.floor(rng() * n);
  return Array.isArray(pool) ? tr(`${key}.${i}`, vars) : tr(key, vars);
}

// ─── Chart and sky helpers ───────────────────────────────────────────────────

type Natal = { moonSign: number; nak: number };

function natalOf(p: Profile): Natal {
  const lon = getMoonLongitudeExact(p.birthDate, p.birthTime, p.birthLng, p.birthTz);
  return { moonSign: Math.floor(lon / 30) % 12, nak: Math.min(26, Math.floor(lon / (360 / 27))) };
}

const houseFrom = (base: number, sign: number) => ((sign - base + 12) % 12) + 1;

function noon(d: Date, add = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, 12);
}

type DaySky = { date: Date; moonHouse: number; tara: number; tithi: number; score: number; tone: DayTone };

function daySky(d: Date, natal: Natal): DaySky {
  const moonHouse = houseFrom(natal.moonSign, moonSignAt(d));
  const count = ((moonNakshatraAt(d) - natal.nak + 27) % 27) + 1;
  const tara = ((count - 1) % 9) + 1;
  const tithi = tithiAt(d);
  let score = (EASY_MOON.includes(moonHouse) ? 1 : HEAVY_MOON.includes(moonHouse) ? -1 : 0)
    + (GOOD_TARA.includes(tara) ? 1 : BAD_TARA.includes(tara) ? -1 : 0);
  if (tithi === 30) score -= 1;
  const tone: DayTone = moonHouse === 8 || score <= -1 ? 'gentle' : score >= 1 ? 'good' : 'neutral';
  return { date: d, moonHouse, tara, tithi, score, tone };
}

function weekdayLong(d: Date): string {
  return d.toLocaleDateString(intlLocale(), { weekday: 'long' });
}

function dayMonth(d: Date): string {
  return localizeDigits(d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' }));
}

function festivalName(e: FestivalEvent): string {
  return i18n.t(`festivals:${e.nameKey}`);
}

/** Natural-language list: "Tuesday and Thursday". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return tr('and', { a: items.slice(0, -1).join(', '), b: items[items.length - 1] });
}

function lifeArea(house: number): string {
  return tr(`area.${house}`);
}

export function mantraFor(planet: string): string {
  return tr(`mantra.${planet}`);
}

function placeOf(p: Profile) {
  return { lat: p.birthLat, lng: p.birthLng };
}

// ─── Today ───────────────────────────────────────────────────────────────────

export type TodayExtras = { energy: string; mantra: PeriodMantra; tone: DayTone };

/** The Moon-today energy line and the weekday mantra for the Today tab. */
export function getTodayExtras(profile: Profile, date: Date = new Date()): TodayExtras | null {
  if (!profile.birthDate) return null;
  const natal = natalOf(profile);
  const sky = daySky(noon(date), natal);
  const rng = mulberry32(hashSeed(`${profile.id}:today:${date.toDateString()}`));
  const ruler = WEEKDAY_RULER[date.getDay()];
  return {
    energy: pick(rng, `moonToday.${sky.moonHouse}`),
    tone: sky.tone,
    mantra: {
      text: mantraFor(ruler),
      note: tr('mantraNote.weekday', { weekday: weekdayLong(date), planet: tPlanet(ruler) }),
    },
  };
}

// ─── Shared section builders ─────────────────────────────────────────────────

function guidanceLine(rng: () => number, profile: Profile, now: Date): string {
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz);
  const t = getDashaTimeline(moonLon, profile.birthDate, now);
  return pick(rng, `guidance.${t.antar.lord}`);
}

function periodMantra(sade: boolean, antarLord: string, newMoon: Date | null): PeriodMantra {
  if (newMoon) return { text: tr('mantra.Shiva'), note: tr('mantraNote.newMoon', { day: weekdayLong(newMoon) }) };
  if (sade) return { text: mantraFor('Saturn'), note: tr('mantraNote.saturn') };
  return { text: mantraFor(antarLord), note: tr('mantraNote.stretch', { planet: tPlanet(antarLord) }) };
}

// ─── Week ────────────────────────────────────────────────────────────────────

/** Monday-to-Sunday week containing `date`. */
export function weekStart(date: Date): Date {
  const wd = (date.getDay() + 6) % 7; // Monday = 0
  return noon(date, -wd);
}

export function generateWeekHoroscope(profile: Profile, date: Date = new Date()): PeriodHoroscope | null {
  if (!profile.birthDate) return null;
  const natal = natalOf(profile);
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => daySky(noon(start, i), natal));
  const end = days[6].date;
  const rng = mulberry32(hashSeed(`${profile.id}:week:${start.toDateString()}`));
  const today = noon(date).getTime();
  const fests = getFestivals(start, end, { ...placeOf(profile) });
  const majors = fests.filter((f) => f.major);
  const newMoon = days.find((d) => d.tithi === 30)?.date ?? null;
  const fullMoon = days.find((d) => d.tithi === 15)?.date ?? null;
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz);
  const antar = getDashaTimeline(moonLon, profile.birthDate, date).antar;
  const sade = inSadeSati(natal, date);

  // Best day for love: highest score, Friday (Venus) breaks ties.
  const byScore = [...days].sort((a, b) => b.score - a.score || (b.date.getDay() === 5 ? 1 : 0) - (a.date.getDay() === 5 ? 1 : 0));
  const best = byScore[0];
  const gentle = [...days].filter((d) => d.tone === 'gentle').sort((a, b) => a.score - b.score)[0];
  let love = pick(rng, 'week.love', { day: weekdayLong(best.date) });
  if (gentle && gentle !== best) love += ' ' + pick(rng, 'week.loveGentle', { day: weekdayLong(gentle.date) });

  const workDays = days.filter((d) => d.date.getDay() !== 0 && d.tone === 'good').slice(0, 2);
  let career = workDays.length
    ? pick(rng, 'week.career', { days: joinList(workDays.map((d) => weekdayLong(d.date))) })
    : pick(rng, 'week.careerQuiet');
  if (newMoon) career += ' ' + tr('week.careerNewMoon', { day: weekdayLong(newMoon) });
  else if (fullMoon) career += ' ' + tr('week.careerFullMoon', { day: weekdayLong(fullMoon) });

  const low = days.find((d) => d.moonHouse === 8);
  const wellness = low
    ? pick(rng, 'week.wellnessLow', { day: weekdayLong(low.date) })
    : newMoon
      ? pick(rng, 'week.wellnessNewMoon', { day: weekdayLong(newMoon) })
      : fullMoon
        ? pick(rng, 'week.wellnessFullMoon', { day: weekdayLong(fullMoon) })
        : pick(rng, 'week.wellness');

  let guidance = guidanceLine(rng, profile, date);
  if (majors.length) {
    const f = majors[0];
    guidance = tr('week.festivalNote', { festival: festivalName(f), day: weekdayLong(festivalDate(f)) }) + ' ' + guidance;
  }

  const avg = days.reduce((s, d) => s + d.score, 0) / 7;
  const quote = majors.length
    ? pick(rng, 'week.quoteFestival', { festival: festivalName(majors[0]), day: weekdayLong(festivalDate(majors[0])) })
    : pick(rng, avg >= 0.6 ? 'week.quoteGood' : avg <= -0.2 ? 'week.quoteGentle' : 'week.quoteMixed');

  const fmt = (d: Date) => localizeDigits(d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' }));
  return {
    label: tr('weekLabel', { start: fmt(start), end: fmt(end) }),
    quote,
    sections: { love, career, wellness, guidance },
    mantra: periodMantra(sade, antar.lord, newMoon),
    days: days.map((d) => ({
      date: d.date,
      weekday: d.date.toLocaleDateString(intlLocale(), { weekday: 'short' }),
      day: localizeDigits(String(d.date.getDate())),
      tone: d.tone,
      isToday: d.date.getTime() === today,
    })),
  };
}

// ─── Month ───────────────────────────────────────────────────────────────────

const SLOW = ['Jupiter', 'Saturn', 'Rahu'] as const;

export function generateMonthHoroscope(profile: Profile, date: Date = new Date()): PeriodHoroscope | null {
  if (!profile.birthDate) return null;
  const natal = natalOf(profile);
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  const nDays = last.getDate();
  const days = Array.from({ length: nDays }, (_, i) => daySky(noon(first, i), natal));
  const rng = mulberry32(hashSeed(`${profile.id}:month:${first.getFullYear()}-${first.getMonth()}`));
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz);
  const inSade = inSadeSati(natal, date);
  const keyDates: KeyDate[] = [];
  const kd = (d: Date, title: string, sub: string, rank: number) => keyDates.push({
    date: d,
    month: d.toLocaleDateString(intlLocale(), { month: 'short' }),
    day: localizeDigits(String(d.getDate())),
    title, sub, rank,
  });

  // Festivals (major only) and the full / new moon.
  const fests = getFestivals(first, last, { ...placeOf(profile) });
  const seenDays = new Set<string>();
  for (const f of fests) {
    if (f.major && !seenDays.has(f.date)) {
      seenDays.add(f.date);
      kd(festivalDate(f), festivalName(f), i18n.t(`festivals:short.${f.ruleId}`, { defaultValue: '' }), 2);
    }
  }
  for (const f of fests) {
    if ((f.ruleId === 'purnima' || f.ruleId === 'amavasya') && !seenDays.has(f.date)) {
      seenDays.add(f.date);
      const full = f.ruleId === 'purnima';
      kd(festivalDate(f), tr(full ? 'month.fullMoon' : 'month.newMoon'), tr(full ? 'month.fullMoonSub' : 'month.newMoonSub'), 3);
    }
  }

  // The Sun's monthly move.
  const sunIn = sankrantiAfter((sunSignAt(first) + 1) % 12, new Date(first.getTime() - DAY_MS));
  if (sunIn >= first && sunIn <= new Date(last.getTime() + 12 * 3600000)) {
    const h = houseFrom(natal.moonSign, sunSignAt(new Date(sunIn.getTime() + DAY_MS)));
    kd(noon(sunIn), tr('month.sunMoves'), tr('month.sunMovesSub', { area: lifeArea(h) }), 1);
  }

  // Slow planets changing sign this month.
  let bigNews: string | null = null;
  for (const planet of SLOW) {
    for (const c of signChanges(planet, new Date(first.getTime() - DAY_MS), nDays + 1)) {
      if (c.date < first || c.date > new Date(last.getTime() + 12 * 3600000)) continue;
      const h = houseFrom(natal.moonSign, c.to);
      const hFrom = houseFrom(natal.moonSign, c.from);
      let sub: string;
      if (planet === 'Jupiter') sub = tr(JUP_GOOD.includes(h) ? 'month.jupiterGood' : 'month.jupiterSlow', { area: lifeArea(h) });
      else if (planet === 'Saturn') {
        const zone = (x: number) => x === 12 || x === 1 || x === 2;
        sub = zone(h) && !zone(hFrom) ? tr('month.saturnSadeBegins')
          : !zone(h) && zone(hFrom) ? tr('month.saturnSadeEnds')
          : tr(SAT_GOOD.includes(h) ? 'month.saturnGood' : 'month.saturnSteady', { area: lifeArea(h) });
      } else sub = tr('month.rahu', { area: lifeArea(h) });
      kd(noon(c.date), tr('month.planetMoves', { planet: tPlanet(planet) }), sub, 0);
      if (!bigNews && planet !== 'Rahu') {
        bigNews = planet === 'Jupiter'
          ? tr(JUP_GOOD.includes(h) ? 'month.quoteJupiterGood' : 'month.quoteJupiterSlow', { date: dayMonth(c.date) })
          : tr('month.quoteSaturn', { date: dayMonth(c.date) });
      }
    }
  }

  // A new dasha stretch starting this month.
  const tl = getDashaTimeline(moonLon, profile.birthDate, first);
  const lastNight = new Date(last.getTime() + 12 * 3600000);
  if (tl.nextAntar.start >= first && tl.nextAntar.start <= lastNight) {
    kd(noon(tl.nextAntar.start), tr('month.stretch', { planet: tPlanet(tl.nextAntar.lord) }), phaseMeaning(tl.nextAntar.lord, 'sub'), 0);
    if (!bigNews) bigNews = tr('month.quoteStretch', { planet: tPlanet(tl.nextAntar.lord), date: dayMonth(tl.nextAntar.start) });
  }

  // Sections.
  const half = Math.floor(nDays / 2);
  const s1 = days.slice(0, half).reduce((s, d) => s + d.score, 0) / half;
  const s2 = days.slice(half).reduce((s, d) => s + d.score, 0) / (nDays - half);
  const secondBetter = s2 - s1 > 0.15, firstBetter = s1 - s2 > 0.15;
  const love = firstBetter ? pick(rng, 'month.loveFirst') : secondBetter ? pick(rng, 'month.loveSecond') : pick(rng, 'month.loveSteady');

  const satNow = houseFrom(natal.moonSign, siderealSaturnSign(date));
  const careerA = inSade ? pick(rng, 'month.careerSade') : SAT_GOOD.includes(satNow) ? pick(rng, 'month.careerSaturnHelps') : pick(rng, 'month.careerSteady');
  const midDate = noon(first, half);
  const careerB = secondBetter ? ' ' + tr('month.careerFrom', { date: dayMonth(midDate) }) : firstBetter ? ' ' + tr('month.careerEarly') : '';
  const career = careerA + careerB;

  const wellness = inSade || satNow === 4 || satNow === 8 ? pick(rng, 'month.wellnessRoutine') : pick(rng, 'month.wellness');

  let guidance = guidanceLine(rng, profile, date);
  const reset = fests.find((f) => ['navratri', 'diwali', 'makar-sankranti', 'poila-boishakh', 'chhath', 'maha-shivaratri'].includes(f.ruleId));
  if (reset) guidance = tr('month.festivalReset', { festival: festivalName(reset) }) + ' ' + guidance;

  const avg = days.reduce((s, d) => s + d.score, 0) / nDays;
  const majorFest = fests.find((f) => f.major);
  const quote = bigNews
    ?? (inSade ? pick(rng, 'month.quoteSade')
      : majorFest ? pick(rng, 'month.quoteFestival', { festival: festivalName(majorFest), date: dayMonth(festivalDate(majorFest)) })
      : pick(rng, avg >= 0.4 ? 'month.quoteGood' : 'month.quoteMixed'));

  const mantra = inSade
    ? { text: mantraFor('Saturn'), note: tr('mantraNote.saturn') }
    : JUP_GOOD.includes(houseFrom(natal.moonSign, jupiterSign(date)))
      ? { text: mantraFor('Jupiter'), note: tr('mantraNote.jupiter') }
      : { text: mantraFor(tl.antar.lord), note: tr('mantraNote.stretch', { planet: tPlanet(tl.antar.lord) }) };

  return {
    label: localizeDigits(first.toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' })),
    quote,
    sections: { love, career, wellness, guidance },
    mantra,
    // At most 7 rows: the biggest news first, then shown in date order.
    keyDates: [...keyDates].sort((a, b) => a.rank - b.rank || a.date.getTime() - b.date.getTime()).slice(0, 7)
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
  };
}

// Saturn / Jupiter signs (sidereal) on a date.

/** Saturn in the 12th, 1st or 2nd sign from the natal Moon (same test as utils/sade-sati.ts). */
function inSadeSati(natal: Natal, d: Date): boolean {
  const h = houseFrom(natal.moonSign, siderealSaturnSign(d));
  return h === 12 || h === 1 || h === 2;
}

function siderealSaturnSign(d: Date): number {
  return Math.floor(siderealLongitudeAt('Saturn', jdFromDate(d)) / 30) % 12;
}

function jupiterSign(d: Date): number {
  return Math.floor(siderealLongitudeAt('Jupiter', jdFromDate(d)) / 30) % 12;
}
