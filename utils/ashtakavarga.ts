/**
 * Ashtakavarga (BPHS ashtakavarga chapter, Parashari tables) and gochara
 * vedha (Phaladeepika ch. 26), for transit scoring in the timing engine
 * (ml/astro-kb/rules.md §4, §9.12, §9.13). Pure, Node-testable.
 *
 * Each of the seven planets has a bhinnashtakavarga (BAV): every contributor
 * (the seven planets and the ascendant) gives one bindu to the signs counted
 * from its own position by a fixed table. Totals are fixed (Sun 48, Moon 49,
 * Mars 39, Mercury 54, Jupiter 56, Venus 52, Saturn 39), and the seven BAVs
 * add up to the sarvashtakavarga (SAV), 337 bindus over the twelve signs.
 * Transit rule [std]: Jupiter / Saturn through a sign with SAV ≥ 28 give
 * better results, ≤ 25 weaker; the transiting planet's own BAV in that sign
 * (≥ 5 good, ≤ 2 weak) refines it. Without a birth time the Moon's sign
 * stands in for the ascendant (approximate; the caller lowers its weight).
 *
 * Vedha: a good transit from the natal Moon is obstructed while another
 * planet transits the paired house (Jupiter: good 2, 5, 7, 9, 11 / vedha 12,
 * 4, 3, 10, 8; Saturn: good 3, 6, 11 / vedha 12, 9, 5), except between the
 * Sun and Saturn and between the Moon and Mercury.
 */
export type AvPlanet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn';
export type Contributor = AvPlanet | 'Lagna';
export const AV_PLANETS: readonly AvPlanet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const CONTRIBUTORS: readonly Contributor[] = [...AV_PLANETS, 'Lagna'];

/** BAV tables: planet → contributor → houses (1-12) counted from the contributor that get a bindu. */
export const BAV_TABLE: Record<AvPlanet, Record<Contributor, number[]>> = {
  Sun: {
    Sun: [1, 2, 4, 7, 8, 9, 10, 11], Moon: [3, 6, 10, 11], Mars: [1, 2, 4, 7, 8, 9, 10, 11], Mercury: [3, 5, 6, 9, 10, 11, 12],
    Jupiter: [5, 6, 9, 11], Venus: [6, 7, 12], Saturn: [1, 2, 4, 7, 8, 9, 10, 11], Lagna: [3, 4, 6, 10, 11, 12],
  },
  Moon: {
    Sun: [3, 6, 7, 8, 10, 11], Moon: [1, 3, 6, 7, 10, 11], Mars: [2, 3, 5, 6, 9, 10, 11], Mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    Jupiter: [1, 4, 7, 8, 10, 11, 12], Venus: [3, 4, 5, 7, 9, 10, 11], Saturn: [3, 5, 6, 11], Lagna: [3, 6, 10, 11],
  },
  Mars: {
    Sun: [3, 5, 6, 10, 11], Moon: [3, 6, 11], Mars: [1, 2, 4, 7, 8, 10, 11], Mercury: [3, 5, 6, 11],
    Jupiter: [6, 10, 11, 12], Venus: [6, 8, 11, 12], Saturn: [1, 4, 7, 8, 9, 10, 11], Lagna: [1, 3, 6, 10, 11],
  },
  Mercury: {
    Sun: [5, 6, 9, 11, 12], Moon: [2, 4, 6, 8, 10, 11], Mars: [1, 2, 4, 7, 8, 9, 10, 11], Mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    Jupiter: [6, 8, 11, 12], Venus: [1, 2, 3, 4, 5, 8, 9, 11], Saturn: [1, 2, 4, 7, 8, 9, 10, 11], Lagna: [1, 2, 4, 6, 8, 10, 11],
  },
  Jupiter: {
    Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11], Moon: [2, 5, 7, 9, 11], Mars: [1, 2, 4, 7, 8, 10, 11], Mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    Jupiter: [1, 2, 3, 4, 7, 8, 10, 11], Venus: [2, 5, 6, 9, 10, 11], Saturn: [3, 5, 6, 12], Lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  Venus: {
    Sun: [8, 11, 12], Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12], Mars: [3, 5, 6, 9, 11, 12], Mercury: [3, 5, 6, 9, 11],
    Jupiter: [5, 8, 9, 10, 11], Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11], Saturn: [3, 4, 5, 8, 9, 10, 11], Lagna: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  Saturn: {
    Sun: [1, 2, 4, 7, 8, 10, 11], Moon: [3, 6, 11], Mars: [3, 5, 6, 10, 11, 12], Mercury: [6, 8, 9, 10, 11, 12],
    Jupiter: [5, 6, 11, 12], Venus: [6, 11, 12], Saturn: [3, 5, 6, 11], Lagna: [1, 3, 4, 6, 10, 11],
  },
};

export const BAV_TOTAL: Record<AvPlanet, number> = { Sun: 48, Moon: 49, Mars: 39, Mercury: 54, Jupiter: 56, Venus: 52, Saturn: 39 };

export type Ashtakavarga = {
  /** Bindus per sign (0 = Aries) for each planet. */
  bav: Record<AvPlanet, number[]>;
  /** Sum of the seven BAVs per sign (total 337). */
  sav: number[];
};

/** BAV and SAV from the natal signs of the seven planets and the ascendant (or Moon) sign. */
export function ashtakavarga(signs: Record<AvPlanet, number>, lagnaSign: number): Ashtakavarga {
  const pos: Record<Contributor, number> = { ...signs, Lagna: lagnaSign };
  const bav = {} as Record<AvPlanet, number[]>;
  const sav = new Array(12).fill(0);
  for (const p of AV_PLANETS) {
    const row = new Array(12).fill(0);
    for (const c of CONTRIBUTORS) for (const h of BAV_TABLE[p][c]) row[(pos[c] + h - 1) % 12] += 1;
    bav[p] = row;
    for (let s = 0; s < 12; s++) sav[s] += row[s];
  }
  return { bav, sav };
}

/** Transit quality of `planet` (Jupiter / Saturn) through `sign`: −1 weak, 0 average, +1 strong (SAV), refined by its own BAV. */
export function transitBindus(av: Ashtakavarga, planet: AvPlanet, sign: number): { sav: number; bav: number; score: number } {
  const sav = av.sav[sign];
  const bav = av.bav[planet][sign];
  let score = sav >= 28 ? 1 : sav <= 25 ? -1 : 0;
  if (bav >= 5) score += 0.5;
  else if (bav <= 2) score -= 0.5;
  return { sav, bav, score };
}

/** Good transit houses from the Moon and their vedha (obstruction) houses. */
export const VEDHA: Partial<Record<AvPlanet, Record<number, number>>> = {
  Jupiter: { 2: 12, 5: 4, 7: 3, 9: 10, 11: 8 },
  Saturn: { 3: 12, 6: 9, 11: 5 },
};
const VEDHA_EXEMPT: [AvPlanet, AvPlanet][] = [['Sun', 'Saturn'], ['Moon', 'Mercury']];

/**
 * Is the good transit of `planet` (in house `house` from the natal Moon)
 * obstructed? `others`: the houses from the Moon of the other transiting
 * planets (the seven; the nodes don't cause vedha). False when the house
 * isn't a good one for the planet.
 */
export function vedhaBlocked(planet: AvPlanet, house: number, others: Partial<Record<AvPlanet, number>>): boolean {
  const v = VEDHA[planet]?.[house];
  if (v == null) return false;
  return (Object.keys(others) as AvPlanet[]).some(o => {
    if (o === planet) return false;
    if (VEDHA_EXEMPT.some(([x, y]) => (x === o && y === planet) || (y === o && x === planet))) return false;
    return others[o] === v;
  });
}
