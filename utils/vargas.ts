/**
 * Divisional charts (vargas) per BPHS ch. 6, the vargottama check and the
 * birth-time stability flag (ml/astro-kb/rules.md §3.7, §9.1). Pure: chart
 * math only (no React Native, no i18n), so Node tests load it directly.
 *
 * Signs are 0 (Aries) … 11 (Pisces); `odd` means an odd sign in 1-based
 * counting (Aries, Gemini, Leo, … = index 0, 2, 4, …).
 *
 *   D2  Hora          15°      odd: Leo then Cancer; even: Cancer then Leo
 *   D3  Drekkana      10°      the sign, its 5th, its 9th
 *   D4  Chaturthamsa  7°30′    the sign, its 4th, 7th, 10th
 *   D7  Saptamsa      30/7°    odd: from the sign; even: from its 7th
 *   D9  Navamsa       3°20′    floor(λ / (10/3)) mod 12 (= movable from the sign,
 *                              fixed from the 9th, dual from the 5th)
 *   D10 Dasamsa       3°       odd: from the sign; even: from its 9th
 *   D12 Dvadasamsa    2°30′    from the sign
 *   D24 Siddhamsa     1°15′    odd: from Leo; even: from Cancer (BPHS forward mapping)
 *
 * A varga's ascendant is the same formula on the ascendant degree. Vargas
 * finer than D9 change sign every few minutes of birth time (D10 ~12 min,
 * D24 ~5 min), so each varga lagna is recomputed at the birth time ±5 and
 * ±10 minutes; a varga whose lagna changes is `unstable` and its houses are
 * not used. Without a birth time (or place) no varga lagna exists at all.
 *
 * In practice a D9 sign of the ascendant lasts ~13 minutes, so a lagna that
 * survives ±10 minutes is rare: 'firm' (same at ±5 and ±10), 'stable' (same
 * at ±5 only: a birth time recorded to the minute), 'unstable'. Houses of a
 * varga are read when it is at least 'stable'. A planet's varga sign (its
 * dignity there, vargottama) needs no varga lagna; it is used with a birth
 * time when the sign is the same at ±10 minutes (only the Moon moves enough
 * to matter), and for the slow planets' D9 even without a time.
 */
import { getAscendantDegree, getChartPositions, type BirthData } from './astrology';

export type Varga = 'D1' | 'D2' | 'D3' | 'D4' | 'D7' | 'D9' | 'D10' | 'D12' | 'D24';
export const VARGAS: readonly Varga[] = ['D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12', 'D24'];
/** The vargas the chat reads (with the topic each confirms, rules.md §3.7). */
export const USED_VARGAS = ['D9', 'D10', 'D7', 'D4', 'D24', 'D12'] as const;
export type UsedVarga = (typeof USED_VARGAS)[number];

export type VPlanet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu';
const PLANETS: VPlanet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

const norm = (x: number) => ((x % 360) + 360) % 360;
const mod12 = (x: number) => ((x % 12) + 12) % 12;
const EPS = 1e-9;

/** Sign of longitude `lon` (degrees) in varga `v`. */
export function vargaSign(lon: number, v: Varga): number {
  const l = norm(lon);
  const s = Math.floor(l / 30) % 12;
  const d = l - s * 30;
  const odd = s % 2 === 0;
  const part = (size: number) => Math.min(Math.floor((d + EPS) / size), Math.round(30 / size) - 1);
  switch (v) {
    case 'D1': return s;
    case 'D2': return (part(15) === 0) === odd ? 4 : 3;
    case 'D3': return mod12(s + 4 * part(10));
    case 'D4': return mod12(s + 3 * part(7.5));
    case 'D7': return mod12(s + (odd ? 0 : 6) + part(30 / 7));
    case 'D9': return Math.floor((l + EPS) / (10 / 3)) % 12;
    case 'D10': return mod12(s + (odd ? 0 : 8) + part(3));
    case 'D12': return mod12(s + part(2.5));
    case 'D24': return mod12((odd ? 4 : 3) + part(1.25));
  }
}

/** Birth time shifted by `minutes` (date rolls over), as YYYY-MM-DD and HH:MM. */
export function shiftBirth(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes));
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`, time: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}` };
}

export type Stability = 'firm' | 'stable' | 'unstable' | 'noTime';

export type VargaChart = {
  varga: Varga;
  /** Varga ascendant sign; null without a birth time and place. */
  asc: number | null;
  planets: Record<VPlanet, number>;
  /** Lagna unchanged at ±5 and ±10 min ('firm'), at ±5 only ('stable'); 'noTime' without time or place. */
  stability: Stability;
  /** Planets whose sign in this varga is the same at the birth time ±10 min (all of them for D1). */
  planetStable: Record<VPlanet, boolean>;
};

export type VargaSet = {
  charts: Record<Varga, VargaChart>;
  /** Planets in the same sign in D1 and D9 (only where the D9 sign is reliable). */
  vargottama: VPlanet[];
  /** Birth time and place present (the vargas' planets are exact; their lagnas need `stable`). */
  hasTime: boolean;
};

const VALID_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const cache = new Map<string, VargaSet>();

/** All vargas of a birth chart, with stability flags. Memoized per birth data. */
export function vargaCharts(profile: BirthData): VargaSet {
  const time = profile.birthTime && VALID_TIME.test(profile.birthTime) ? profile.birthTime : null;
  const key = [profile.birthDate, time ?? '', profile.birthLat ?? '', profile.birthLng ?? '', profile.birthTz ?? ''].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const p = { ...profile, birthTime: time };
  const lonsOf = (q: BirthData): Record<VPlanet, number> => {
    const out = {} as Record<VPlanet, number>;
    for (const x of getChartPositions(q)) out[x.name as VPlanet] = x.degree;
    return out;
  };
  const shifted = (minutes: number): BirthData => {
    const s = shiftBirth(p.birthDate, time!, minutes);
    return { ...p, birthDate: s.date, birthTime: s.time };
  };
  const lon = lonsOf(p);
  // Planets' varga signs over the birth-time uncertainty: ±10 min, or the whole day without a time.
  const around = time ? [lonsOf(shifted(-10)), lonsOf(shifted(10))]
    : [lonsOf({ ...p, birthTime: '00:00' }), lonsOf({ ...p, birthTime: '23:59' })];
  const ascAt = (minutes: number): number | null => {
    if (!time) return null;
    const s = shiftBirth(p.birthDate, time, minutes);
    return getAscendantDegree(s.date, s.time, p.birthLat, p.birthLng, p.birthTz);
  };
  const asc = ascAt(0);
  const near = asc == null ? [] : [-5, 5].map(ascAt).filter((a): a is number => a != null);
  const far = asc == null ? [] : [-10, 10].map(ascAt).filter((a): a is number => a != null);
  const charts = {} as Record<Varga, VargaChart>;
  for (const v of VARGAS) {
    const planets = {} as Record<VPlanet, number>;
    const planetStable = {} as Record<VPlanet, boolean>;
    for (const pl of PLANETS) {
      planets[pl] = vargaSign(lon[pl], v);
      planetStable[pl] = around.every(o => vargaSign(o[pl], v) === planets[pl]);
    }
    const a = asc == null ? null : vargaSign(asc, v);
    const same = (xs: number[]) => xs.every(x => vargaSign(x, v) === a);
    const stability: Stability = a == null ? 'noTime' : !same(near) ? 'unstable' : same(far) ? 'firm' : 'stable';
    charts[v] = { varga: v, asc: a, planets, stability, planetStable };
  }
  const vargottama = PLANETS.filter(pl => charts.D9.planetStable[pl] && charts.D1.planets[pl] === charts.D9.planets[pl]);
  const out: VargaSet = { charts, vargottama, hasTime: !!time && asc != null };
  cache.set(key, out);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return out;
}

/** The varga's houses may be read: a birth time and place, and its lagna is the same at ±5 minutes. */
export const vargaUsable = (set: VargaSet, v: Varga): boolean => set.charts[v].stability === 'stable' || set.charts[v].stability === 'firm';

/** A planet's sign in a varga is reliable (unchanged over the birth-time uncertainty). */
export const vargaPlanetUsable = (set: VargaSet, v: Varga, p: VPlanet): boolean => set.charts[v].planetStable[p];

/** Lord of house `h` of a varga chart (null without a usable lagna). */
const SIGN_RULER: VPlanet[] = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
export function vargaLord(set: VargaSet, v: Varga, h: number): VPlanet | null {
  const a = set.charts[v].asc;
  if (a == null || !vargaUsable(set, v)) return null;
  return SIGN_RULER[(a + h - 1) % 12];
}

/** Planets in house `h` of a varga chart (empty without a usable lagna). */
export function vargaOccupants(set: VargaSet, v: Varga, h: number): VPlanet[] {
  const a = set.charts[v].asc;
  if (a == null || !vargaUsable(set, v)) return [];
  const sign = (a + h - 1) % 12;
  return PLANETS.filter(p => set.charts[v].planets[p] === sign);
}
