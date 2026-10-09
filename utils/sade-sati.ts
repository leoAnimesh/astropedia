/**
 * Sade sati tracker: every stretch in a life when transit Saturn passes the
 * 12th, 1st and 2nd sidereal signs from the natal Moon, with its three phases,
 * retrograde dips and brief returns, plus the shorter Saturn check-ins on the
 * 4th (kantaka) and 8th (ashtama) signs from the Moon.
 *
 * Same frame and logic as the model context (utils/astrology.ts
 * transitLines: Lahiri sidereal, true Saturn, Moon sign from the exact birth
 * moment) and the same retrograde-aware ingress search (signChanges).
 *
 * Pure (no React Native / i18n), so Node tests can load it.
 */

import { getMoonLongitudeExact, siderealLongitudeAt, signChanges, type BirthData } from './astrology';
import { jdFromDate } from './sun';

const DAY_MS = 86400000;
const YEAR_MS = 365.25 * DAY_MS;

export type SadeSatiPhase = 'rising' | 'peak' | 'setting';

export type Span = { start: Date; end: Date };

export type SadeSatiPeriod = {
  /** First time Saturn enters the 12th from the Moon. */
  start: Date;
  /** When Saturn first leaves the 2nd from the Moon (the main end). */
  end: Date;
  /** Final exit, after any retrograde return into the 2nd (≥ end). */
  finalEnd: Date;
  /** Phase spans (start of the phase to the start of the next one). */
  phases: Record<SadeSatiPhase, Span>;
  /** Retrograde slips back into the zone after the main end ("brief return"). */
  returns: Span[];
  /** Started before birth (already running when the person was born). */
  beforeBirth: boolean;
};

export type SaturnCheckIn = { kind: 'fourth' | 'eighth'; start: Date; end: Date };

export type SadeSatiStatus = {
  moonSign: number;
  periods: SadeSatiPeriod[];
  /** Index into periods of the one running now, or -1. */
  currentIndex: number;
  /** Phase running now (if in sade sati). */
  phase: SadeSatiPhase | null;
  /** Saturn is outside the main span but inside a brief return. */
  inReturn: boolean;
  /** Index of the next period that hasn't started, or -1. */
  nextIndex: number;
  /** Next 4th/8th-from-Moon Saturn stretches after now (or running now). */
  checkIns: SaturnCheckIn[];
  /** Progress 0..1 through the current period (start → end). */
  progress: number;
};

type Stint = { sign: number; start: Date; end: Date };

/** Saturn's sign stints from `from` over `years` (retrograde re-entries included). */
function saturnStints(from: Date, years: number): Stint[] {
  const jd0 = jdFromDate(from);
  let sign = Math.floor(siderealLongitudeAt('Saturn', jd0) / 30) % 12;
  let start = from;
  const out: Stint[] = [];
  for (const c of signChanges('Saturn', from, Math.round(years * 365.25))) {
    out.push({ sign, start, end: c.date });
    sign = c.to;
    start = c.date;
  }
  out.push({ sign, start, end: new Date(from.getTime() + years * YEAR_MS) });
  return out;
}

const houseFrom = (moonSign: number, sign: number) => ((sign - moonSign + 12) % 12) + 1;
const inZone = (h: number) => h === 12 || h === 1 || h === 2;

/**
 * Sade sati periods and check-ins for a person, from birth to `untilAge`.
 * Gaps out of the zone shorter than 2 years are retrograde dips inside one
 * period (Saturn's sade sati repeats only every ~30 years).
 */
export function getSadeSati(profile: BirthData, now: Date = new Date(), untilAge = 100): SadeSatiStatus {
  const { moonSign, stints, periods } = lifetimePeriods(profile, untilAge);
  return statusAt(moonSign, stints, periods, now);
}

// ─── Cache ────────────────────────────────────────────────────────────────────
// The Saturn scan (~20-30 ms in Node, several times that on Hermes) depends
// only on the birth data and the horizon, never on `now`, so it is computed
// once per person and horizon and shared by Home, the Sade Sati screen, the
// Gita card and the Month horoscope. Results are read-only for callers.

type Lifetime = { moonSign: number; stints: Stint[]; periods: SadeSatiPeriod[] };
const LIFETIME_CACHE_MAX = 16;
const lifetimeCache = new Map<string, Lifetime>();

function lifetimePeriods(profile: BirthData, untilAge: number): Lifetime {
  const key = [profile.birthDate, profile.birthTime ?? '', profile.birthLng ?? '', profile.birthTz ?? '', untilAge].join('|');
  const hit = lifetimeCache.get(key);
  if (hit) {
    // Most recently used goes last (Map keeps insertion order).
    lifetimeCache.delete(key);
    lifetimeCache.set(key, hit);
    return hit;
  }
  const value = computeLifetime(profile, untilAge);
  lifetimeCache.set(key, value);
  if (lifetimeCache.size > LIFETIME_CACHE_MAX) lifetimeCache.delete(lifetimeCache.keys().next().value!);
  return value;
}

function computeLifetime(profile: BirthData, untilAge: number): Lifetime {
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz);
  const moonSign = Math.floor(moonLon / 30) % 12;
  const birth = new Date(profile.birthDate + 'T00:00:00');
  // Start 8 years early so a sade sati running at birth is seen whole.
  const scanFrom = new Date(birth.getTime() - 8 * YEAR_MS);
  const stints = saturnStints(scanFrom, untilAge + 8);

  // Group zone stints into periods.
  const groups: Stint[][] = [];
  let cur: Stint[] = [];
  for (const s of stints) {
    if (!inZone(houseFrom(moonSign, s.sign))) continue;
    const last = cur[cur.length - 1];
    if (last && s.start.getTime() - last.end.getTime() > 2 * YEAR_MS) {
      groups.push(cur);
      cur = [];
    }
    cur.push(s);
  }
  if (cur.length) groups.push(cur);

  const periods: SadeSatiPeriod[] = [];
  for (const g of groups) {
    const firstIn = (h: number) => g.find((s) => houseFrom(moonSign, s.sign) === h)?.start;
    const start = g[0].start;
    const peakStart = firstIn(1) ?? start;
    const settingStart = firstIn(2) ?? peakStart;
    // Main end: the first exit out of the zone after reaching the 2nd.
    let end = g[g.length - 1].end;
    for (let i = 0; i < g.length; i++) {
      if (g[i].start < settingStart) continue;
      const next = g[i + 1];
      if (!next || next.start.getTime() !== g[i].end.getTime()) { end = g[i].end; break; }
    }
    const finalEnd = g[g.length - 1].end;
    const returns: Span[] = g.filter((s) => s.start >= end).map((s) => ({ start: s.start, end: s.end }));
    // Merge back-to-back return stints (e.g. 2nd → 1st → 2nd while retrograde).
    const merged: Span[] = [];
    for (const r of returns) {
      const last = merged[merged.length - 1];
      if (last && last.end.getTime() === r.start.getTime()) last.end = r.end; else merged.push({ ...r });
    }
    // Ignore a period entirely past the scan horizon or entirely before birth.
    if (finalEnd < birth) continue;
    if (start.getTime() > birth.getTime() + untilAge * YEAR_MS) continue;
    // Scan horizon cut a period short: drop it unless its main part is complete.
    const horizon = scanFrom.getTime() + (untilAge + 8) * YEAR_MS - DAY_MS;
    if (finalEnd.getTime() >= horizon && end.getTime() >= horizon) continue;
    periods.push({
      start, end, finalEnd,
      phases: {
        rising:  { start, end: peakStart },
        peak:    { start: peakStart, end: settingStart },
        setting: { start: settingStart, end },
      },
      returns: merged,
      beforeBirth: start < birth,
    });
  }

  return { moonSign, stints, periods };
}

/** Where `now` falls in the person's periods; cheap. */
function statusAt(moonSign: number, stints: Stint[], periods: SadeSatiPeriod[], now: Date): SadeSatiStatus {
  const t = now.getTime();
  const currentIndex = periods.findIndex((p) => t >= p.start.getTime() && t < p.finalEnd.getTime());
  const curP = periods[currentIndex];
  let phase: SadeSatiPhase | null = null;
  let inReturn = false;
  if (curP) {
    if (t >= curP.end.getTime()) {
      inReturn = curP.returns.some((r) => t >= r.start.getTime() && t < r.end.getTime());
      phase = inReturn ? 'setting' : null;
    } else {
      phase = t < curP.phases.peak.start.getTime() ? 'rising' : t < curP.phases.setting.start.getTime() ? 'peak' : 'setting';
    }
  }
  const nextIndex = periods.findIndex((p) => p.start.getTime() > t);

  // 4th / 8th from the Moon after now: first contiguous stint group each.
  const checkIns: SaturnCheckIn[] = [];
  for (const [kind, h] of [['fourth', 4], ['eighth', 8]] as const) {
    const hits = stints.filter((s) => houseFrom(moonSign, s.sign) === h && s.end.getTime() > t);
    if (!hits.length) continue;
    const first = hits[0];
    let endAt = first.end;
    for (const s of hits.slice(1)) {
      if (s.start.getTime() - endAt.getTime() < 2 * YEAR_MS) endAt = s.end; else break;
    }
    checkIns.push({ kind, start: first.start, end: endAt });
  }
  checkIns.sort((a, b) => a.start.getTime() - b.start.getTime());

  const progress = curP
    ? Math.min(1, Math.max(0, (t - curP.start.getTime()) / (curP.end.getTime() - curP.start.getTime())))
    : 0;

  return { moonSign, periods, currentIndex, phase, inReturn, nextIndex, checkIns, progress };
}
