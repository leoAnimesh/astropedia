/**
 * Ashtakoota Guna Milan — the traditional North-Indian 36-point kundli match,
 * plus the Nadi / Bhakoot / Manglik (Kuja) dosha checks.
 *
 * Pure and deterministic: no i18n, no React Native, so it runs in Node too
 * (see the verification script used during development). Screens translate
 * the stable keys returned here via the `compatibility` namespace.
 *
 * Conventions
 *   - Signs are 0..11 (Aries..Pisces), nakshatras 0..26 (Ashwini..Revati),
 *     all sidereal (Lahiri), from the Moon's longitude.
 *   - Order matters: every function takes (bride, groom). Varna, Vashya and
 *     Gana tables are directional; Tara and Bhakoot count from the bride.
 *   - Where regional tables differ, the most commonly published North-Indian
 *     (Parashari / Muhurta Chintamani lineage, as used by mainstream Indian
 *     matching software) variant is used and noted next to the table.
 *
 * Maxima: Varna 1 + Vashya 2 + Tara 3 + Yoni 4 + Graha Maitri 5 + Gana 6
 *         + Bhakoot 7 + Nadi 8 = 36.
 */

import { getAscendantDegree, getChartPositions, getMarsLongitudeTrue, getMoonLongitudeExact } from './astrology';

const NAK_SIZE = 360 / 27;

// ─── Signs ────────────────────────────────────────────────────────────────────

export const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

export type PlanetName = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn';

/** Sign lords (rashi adhipati). */
export const SIGN_LORD: PlanetName[] = [
  'Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury',
  'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter',
];

// ─── 1. Varna (max 1) ─────────────────────────────────────────────────────────
// By moon sign: water signs Brahmin (4), fire Kshatriya (3), earth Vaishya (2),
// air Shudra (1). Rule: 1 point when the groom's varna is equal to or higher
// than the bride's, else 0.

export type Varna = 'Brahmin' | 'Kshatriya' | 'Vaishya' | 'Shudra';
const VARNA_RANK: Record<Varna, number> = { Brahmin: 4, Kshatriya: 3, Vaishya: 2, Shudra: 1 };

export function varnaOf(sign: number): Varna {
  switch (sign % 4) {         // Aries=fire, Taurus=earth, Gemini=air, Cancer=water …
    case 0:  return 'Kshatriya';
    case 1:  return 'Vaishya';
    case 2:  return 'Shudra';
    default: return 'Brahmin';
  }
}

export function varnaScore(brideSign: number, groomSign: number): number {
  return VARNA_RANK[varnaOf(groomSign)] >= VARNA_RANK[varnaOf(brideSign)] ? 1 : 0;
}

// ─── 2. Vashya (max 2) ────────────────────────────────────────────────────────
// Groups (classical half-sign split, needs the Moon's degree):
//   Chatushpada (quadruped): Aries, Taurus, Sagittarius 15–30°, Capricorn 0–15°
//   Manava (human):          Gemini, Virgo, Libra, Aquarius, Sagittarius 0–15°
//   Jalachara (water):       Cancer, Pisces, Capricorn 15–30°
//   Vanachara (wild):        Leo
//   Keeta (insect):          Scorpio
// Points: the widely published 5×5 table, rows = bride, columns = groom.
// (Variant note: some tables give the Chatushpada-bride/Vanachara-groom cell
// 0 instead of ½, and a few put Sagittarius/Capricorn wholly in one group.)

export type Vashya = 'Chatushpada' | 'Manava' | 'Jalachara' | 'Vanachara' | 'Keeta';
const VASHYA_ORDER: Vashya[] = ['Chatushpada', 'Manava', 'Jalachara', 'Vanachara', 'Keeta'];
const VASHYA_TABLE: number[][] = [
  //            Chatu  Manava Jala  Vana  Keeta   ← groom
  /* Chatu  */ [2,     1,     1,    0.5,  1],
  /* Manava */ [1,     2,     0.5,  0,    1],
  /* Jala   */ [1,     0.5,   2,    1,    1],
  /* Vana   */ [0,     0,     0,    2,    0],
  /* Keeta  */ [1,     1,     1,    0,    2],
];

export function vashyaOf(moonLon: number): Vashya {
  const sign = Math.floor(moonLon / 30) % 12;
  const firstHalf = moonLon % 30 < 15;
  switch (sign) {
    case 0: case 1:                 return 'Chatushpada';
    case 2: case 5: case 6: case 10: return 'Manava';
    case 3: case 11:                return 'Jalachara';
    case 4:                         return 'Vanachara';
    case 7:                         return 'Keeta';
    case 8:                         return firstHalf ? 'Manava' : 'Chatushpada';
    default:                        return firstHalf ? 'Chatushpada' : 'Jalachara'; // 9 Capricorn
  }
}

export function vashyaScore(brideMoonLon: number, groomMoonLon: number): number {
  return VASHYA_TABLE[VASHYA_ORDER.indexOf(vashyaOf(brideMoonLon))][VASHYA_ORDER.indexOf(vashyaOf(groomMoonLon))];
}

// ─── 3. Tara / Dina (max 3) ───────────────────────────────────────────────────
// Count nakshatras from the bride's to the groom's (inclusive) and divide by
// 9; repeat from the groom's to the bride's. A remainder of 3 (Vipat),
// 5 (Pratyak) or 7 (Vadha/Naidhana) is inauspicious; every other remainder
// (0 counts as 9, Parama Mitra) is good. Both good = 3, one good = 1½, none = 0.

export function taraCount(fromNak: number, toNak: number): number {
  return ((toNak - fromNak + 27) % 27) + 1; // 1..27
}

export function taraIsGood(fromNak: number, toNak: number): boolean {
  const r = taraCount(fromNak, toNak) % 9;
  return r !== 3 && r !== 5 && r !== 7;
}

export function taraScore(brideNak: number, groomNak: number): number {
  return (taraIsGood(brideNak, groomNak) ? 1.5 : 0) + (taraIsGood(groomNak, brideNak) ? 1.5 : 0);
}

// ─── 4. Yoni (max 4) ──────────────────────────────────────────────────────────
// Each nakshatra has an animal. Same animal = 4; the seven sworn-enemy pairs
// (Horse–Buffalo, Elephant–Lion, Sheep–Monkey, Serpent–Mongoose, Dog–Deer,
// Cat–Rat, Cow–Tiger) = 0; others per the standard symmetric 14×14 table.

export type Yoni =
  | 'Horse' | 'Elephant' | 'Sheep' | 'Serpent' | 'Dog' | 'Cat' | 'Rat'
  | 'Cow' | 'Buffalo' | 'Tiger' | 'Deer' | 'Monkey' | 'Mongoose' | 'Lion';

const YONI_ORDER: Yoni[] = [
  'Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat',
  'Cow', 'Buffalo', 'Tiger', 'Deer', 'Monkey', 'Mongoose', 'Lion',
];

/** Indexed by nakshatra 0..26. */
export const NAK_YONI: Yoni[] = [
  'Horse',    // Ashwini
  'Elephant', // Bharani
  'Sheep',    // Krittika
  'Serpent',  // Rohini
  'Serpent',  // Mrigashira
  'Dog',      // Ardra
  'Cat',      // Punarvasu
  'Sheep',    // Pushya
  'Cat',      // Ashlesha
  'Rat',      // Magha
  'Rat',      // Purva Phalguni
  'Cow',      // Uttara Phalguni
  'Buffalo',  // Hasta
  'Tiger',    // Chitra
  'Buffalo',  // Swati
  'Tiger',    // Vishakha
  'Deer',     // Anuradha
  'Deer',     // Jyeshtha
  'Dog',      // Mula
  'Monkey',   // Purva Ashadha
  'Mongoose', // Uttara Ashadha
  'Monkey',   // Shravana
  'Lion',     // Dhanishtha
  'Horse',    // Shatabhisha
  'Lion',     // Purva Bhadrapada
  'Cow',      // Uttara Bhadrapada
  'Elephant', // Revati
];

const YONI_TABLE: number[][] = [
  //   Hor Ele She Ser Dog Cat Rat Cow Buf Tig Dee Mon Mgs Lio
  /* Horse    */ [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  /* Elephant */ [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  /* Sheep    */ [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  /* Serpent  */ [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  /* Dog      */ [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  /* Cat      */ [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  /* Rat      */ [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  /* Cow      */ [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  /* Buffalo  */ [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  /* Tiger    */ [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  /* Deer     */ [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  /* Monkey   */ [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  /* Mongoose */ [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  /* Lion     */ [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

export function yoniScore(brideNak: number, groomNak: number): number {
  return YONI_TABLE[YONI_ORDER.indexOf(NAK_YONI[brideNak])][YONI_ORDER.indexOf(NAK_YONI[groomNak])];
}

/** Exposed for verification only. */
export const _yoniTable = { order: YONI_ORDER, table: YONI_TABLE };

// ─── 5. Graha Maitri (max 5) ──────────────────────────────────────────────────
// Natural (naisargika) friendships of the moon-sign lords, per Parashara:
//   Sun:     friends Moon, Mars, Jupiter · neutral Mercury · enemies Venus, Saturn
//   Moon:    friends Sun, Mercury · neutral Mars, Jupiter, Venus, Saturn
//   Mars:    friends Sun, Moon, Jupiter · neutral Venus, Saturn · enemy Mercury
//   Mercury: friends Sun, Venus · neutral Mars, Jupiter, Saturn · enemy Moon
//   Jupiter: friends Sun, Moon, Mars · neutral Saturn · enemies Mercury, Venus
//   Venus:   friends Mercury, Saturn · neutral Mars, Jupiter · enemies Sun, Moon
//   Saturn:  friends Mercury, Venus · neutral Jupiter · enemies Sun, Moon, Mars
// Points from the two one-way relations: same lord or friend/friend = 5,
// friend/neutral = 4, neutral/neutral = 3, friend/enemy = 1,
// neutral/enemy = ½, enemy/enemy = 0.

type Relation = 'friend' | 'neutral' | 'enemy';
const FRIENDS: Record<PlanetName, PlanetName[]> = {
  Sun: ['Moon', 'Mars', 'Jupiter'], Moon: ['Sun', 'Mercury'], Mars: ['Sun', 'Moon', 'Jupiter'],
  Mercury: ['Sun', 'Venus'], Jupiter: ['Sun', 'Moon', 'Mars'], Venus: ['Mercury', 'Saturn'],
  Saturn: ['Mercury', 'Venus'],
};
const ENEMIES: Record<PlanetName, PlanetName[]> = {
  Sun: ['Venus', 'Saturn'], Moon: [], Mars: ['Mercury'], Mercury: ['Moon'],
  Jupiter: ['Mercury', 'Venus'], Venus: ['Sun', 'Moon'], Saturn: ['Sun', 'Moon', 'Mars'],
};

export function relation(of: PlanetName, toward: PlanetName): Relation {
  if (FRIENDS[of].includes(toward)) return 'friend';
  if (ENEMIES[of].includes(toward)) return 'enemy';
  return 'neutral';
}

export function maitriBetweenLords(a: PlanetName, b: PlanetName): number {
  if (a === b) return 5;
  const pair = [relation(a, b), relation(b, a)].sort().join('/');
  switch (pair) {
    case 'friend/friend':   return 5;
    case 'friend/neutral':  return 4;
    case 'neutral/neutral': return 3;
    case 'enemy/friend':    return 1;
    case 'enemy/neutral':   return 0.5;
    default:                return 0; // enemy/enemy
  }
}

export function grahaMaitriScore(brideSign: number, groomSign: number): number {
  return maitriBetweenLords(SIGN_LORD[brideSign], SIGN_LORD[groomSign]);
}

/** Same lord, or each lord counts the other as a natural friend. */
export function lordsFriendly(signA: number, signB: number): boolean {
  return grahaMaitriScore(signA, signB) === 5;
}

// ─── 6. Gana (max 6) ──────────────────────────────────────────────────────────
// Deva: Ashwini, Mrigashira, Punarvasu, Pushya, Hasta, Swati, Anuradha,
//       Shravana, Revati.
// Manushya: Bharani, Rohini, Ardra, P./U. Phalguni, P./U. Ashadha,
//       P./U. Bhadrapada.
// Rakshasa: Krittika, Ashlesha, Magha, Chitra, Vishakha, Jyeshtha, Mula,
//       Dhanishtha, Shatabhisha.
// Points (rows = bride, columns = groom), the common North-Indian table:
//              Deva Manushya Rakshasa
//   Deva        6     6        0
//   Manushya    5     6        0
//   Rakshasa    1     0        6

export type Gana = 'Deva' | 'Manushya' | 'Rakshasa';
const GANA_ORDER: Gana[] = ['Deva', 'Manushya', 'Rakshasa'];
const GANA_TABLE: number[][] = [
  [6, 6, 0],
  [5, 6, 0],
  [1, 0, 6],
];

/** Indexed by nakshatra 0..26. */
export const NAK_GANA: Gana[] = [
  'Deva', 'Manushya', 'Rakshasa', 'Manushya', 'Deva', 'Manushya', 'Deva', 'Deva', 'Rakshasa',
  'Rakshasa', 'Manushya', 'Manushya', 'Deva', 'Rakshasa', 'Deva', 'Rakshasa', 'Deva', 'Rakshasa',
  'Rakshasa', 'Manushya', 'Manushya', 'Deva', 'Rakshasa', 'Rakshasa', 'Manushya', 'Manushya', 'Deva',
];

export function ganaScore(brideNak: number, groomNak: number): number {
  return GANA_TABLE[GANA_ORDER.indexOf(NAK_GANA[brideNak])][GANA_ORDER.indexOf(NAK_GANA[groomNak])];
}

// ─── 7. Bhakoot (max 7) ───────────────────────────────────────────────────────
// Count moon signs from the bride's to the groom's (inclusive) and back.
// 2/12, 5/9 and 6/8 relationships are Bhakoot dosha (0 points); 1/1, 3/11,
// 4/10 and 7/7 get the full 7.

export function signCount(fromSign: number, toSign: number): number {
  return ((toSign - fromSign + 12) % 12) + 1; // 1..12
}

export function bhakootScore(brideSign: number, groomSign: number): number {
  const c = signCount(brideSign, groomSign);
  return [2, 12, 5, 9, 6, 8].includes(c) ? 0 : 7;
}

// ─── 8. Nadi (max 8) ──────────────────────────────────────────────────────────
// Aadi (Vata), Madhya (Pitta), Antya (Kapha) run in a zig-zag through the 27
// nakshatras. Same nadi = 0 (Nadi dosha), different = 8.

export type Nadi = 'Aadi' | 'Madhya' | 'Antya';

export function nadiOf(nak: number): Nadi {
  // Zig-zag of period 6: A M N N M A | A M N N M A …
  return (['Aadi', 'Madhya', 'Antya', 'Antya', 'Madhya', 'Aadi'] as Nadi[])[nak % 6];
}

export function nadiScore(brideNak: number, groomNak: number): number {
  return nadiOf(brideNak) === nadiOf(groomNak) ? 0 : 8;
}

// ─── Doshas ───────────────────────────────────────────────────────────────────
// Convention for every dosha below: the koota POINTS never change. When a
// classical exception applies, the koota keeps its 0 and only the dosha flag
// moves from 'present' to 'cancelled' (shown on screen as "0 points, but
// traditionally considered cancelled because …").

export type DoshaStatus = 'none' | 'present' | 'cancelled';

/**
 * Bhakoot dosha (2/12, 5/9, 6/8 moon signs) is treated as cancelled when the
 * two moon signs share a lord (Aries/Scorpio, Taurus/Libra, Gemini/Virgo,
 * Sagittarius/Pisces, Capricorn/Aquarius) or their lords are mutual natural
 * friends (Graha Maitri = 5). These two are the exceptions nearly every
 * North-Indian matcher applies.
 *
 * Variant deliberately NOT applied: "Bhakoot is cancelled when Tara and Graha
 * Maitri are both favourable". It appears in some regional texts and apps,
 * but not consistently (thresholds differ, and many omit it), so applying it
 * would make our flag disagree with most printed match reports.
 */
export function bhakootDosha(brideSign: number, groomSign: number): DoshaStatus {
  return bhakootDoshaDetail(brideSign, groomSign).status;
}

export type CancelReason = 'sameSign' | 'sameNakshatra' | 'differentPada' | 'sameLord' | 'friendlyLords';
export type DoshaDetail = { status: DoshaStatus; reason?: CancelReason };

const lordReason = (a: number, b: number): CancelReason =>
  SIGN_LORD[a] === SIGN_LORD[b] ? 'sameLord' : 'friendlyLords';

export function bhakootDoshaDetail(brideSign: number, groomSign: number): DoshaDetail {
  if (bhakootScore(brideSign, groomSign) > 0) return { status: 'none' };
  return lordsFriendly(brideSign, groomSign)
    ? { status: 'cancelled', reason: lordReason(brideSign, groomSign) }
    : { status: 'present' };
}

/**
 * Nadi dosha (same nadi, 0 of 8) is treated as cancelled, checked in order:
 *   (a) same nakshatra, Moon in different signs        → 'sameNakshatra'
 *   (b) same nakshatra and sign, but a different pada   → 'differentPada'
 *   (c) same sign, different nakshatras                 → 'sameSign'
 *   (d) different signs whose lords are the same or
 *       mutual natural friends                          → 'sameLord' / 'friendlyLords'
 * Same nakshatra AND same pada (a pada never straddles two signs, so that is
 * also the same sign) is the full dosha and is never cancelled — even though
 * the sign lords are then trivially "the same".
 */
export function nadiDosha(bride: MoonPoint, groom: MoonPoint): DoshaStatus {
  return nadiDoshaDetail(bride, groom).status;
}

export function nadiDoshaDetail(bride: MoonPoint, groom: MoonPoint): DoshaDetail {
  if (nadiScore(bride.nak, groom.nak) > 0) return { status: 'none' };
  const sameSign = bride.sign === groom.sign;
  const sameNak  = bride.nak === groom.nak;
  const samePada = sameNak && bride.pada === groom.pada;
  if (samePada) return { status: 'present' };
  if (sameNak && !sameSign) return { status: 'cancelled', reason: 'sameNakshatra' };
  if (sameNak)              return { status: 'cancelled', reason: 'differentPada' };
  if (sameSign)             return { status: 'cancelled', reason: 'sameSign' };
  if (lordsFriendly(bride.sign, groom.sign)) {
    return { status: 'cancelled', reason: lordReason(bride.sign, groom.sign) };
  }
  return { status: 'present' };
}

/**
 * Gana dosha: a Rakshasa nakshatra paired with a Deva or Manushya one (Gana
 * score 0 or 1 of 6). Common exception, applied here as an informational
 * note only: the mismatch is "softened" when Graha Maitri is high (≥ 4 of 5,
 * the Moon lords get along) or Bhakoot is full (7 of 7). Scores unchanged.
 */
export type GanaDetail = { status: 'none' | 'present' | 'softened'; reason?: 'maitri' | 'bhakoot' };

export function ganaDoshaDetail(bride: MoonPoint, groom: MoonPoint): GanaDetail {
  if (ganaScore(bride.nak, groom.nak) > 1) return { status: 'none' };
  if (grahaMaitriScore(bride.sign, groom.sign) >= 4) return { status: 'softened', reason: 'maitri' };
  if (bhakootScore(bride.sign, groom.sign) === 7)    return { status: 'softened', reason: 'bhakoot' };
  return { status: 'present' };
}

// ─── Manglik (Kuja) dosha ─────────────────────────────────────────────────────
// Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house (whole-sign houses),
// counted from up to three references: the Lagna (needs birth time AND place),
// the Moon (always), and Venus (only when a reliable Venus sign is supplied).
//
// Exemptions (classical, as commonly used in North India). Each applies to
// the reference it was found from:
//   - 'ownSign':  Mars in Aries or Scorpio (this also covers "4th in Aries/Scorpio")
//   - 'exalted':  Mars in Capricorn          (this also covers "7th in Capricorn")
//   - 'houseSign': 1st in Leo/Aquarius, 2nd in Gemini/Virgo, 4th in Aries/Scorpio,
//                 7th in Capricorn/Cancer, 8th in Sagittarius/Pisces,
//                 12th in Taurus/Libra
//   - 'jupiter':  Mars conjunct Jupiter or aspected by it (Jupiter's 5th/7th/9th
//                 whole-sign aspect).
//
// Per person (`level`):
//   'none'      Mars isn't in a Manglik house from any reference checked
//   'cancelled' it is, but an exemption applies to every reference that flags it
//   'mild'      flagged (unexempted) from only one of two or more references
//   'present'   flagged from two or more references — or from the only
//               reference available (e.g. Moon only, marked approximate)
// Age: many families consider the dosha weakened after 28. This is reported
// as an informational note (`ageSoftened`), never as a cancellation.
//
// Venus and Jupiter signs come from getChartPositions(), which returns true
// geocentric sidereal positions (checked against JPL Horizons), so with a
// Lagna there are three references (Lagna, Moon, Venus) and without one two
// (Moon, Venus) — 'mild' means exactly one of them flags Mars.

export const MANGLIK_HOUSES = [1, 2, 4, 7, 8, 12];
export const MANGLIK_AGE_SOFTEN = 28;

const MARS_OWN = [0, 7];
const MARS_EXALT = 9;
/** House → Mars signs that exempt that house. */
const HOUSE_EXEMPT: Record<number, number[]> = {
  1: [4, 10], 2: [2, 5], 4: [0, 7], 7: [9, 3], 8: [8, 11], 12: [1, 6],
};

export type ManglikRef = 'lagna' | 'moon' | 'venus';
export type ManglikExemption = 'ownSign' | 'exalted' | 'houseSign' | 'jupiter';
export type ManglikLevel = 'none' | 'mild' | 'present' | 'cancelled';

export type ManglikRefResult = {
  ref:     ManglikRef;
  /** House of Mars from this reference, 1..12. */
  house:   number;
  /** Mars in a Manglik house from this reference (before exemptions). */
  flagged: boolean;
  /** Set when flagged but exempt. */
  exemption: ManglikExemption | null;
};

export type ManglikInfo = {
  level:       ManglikLevel;
  /** level is 'mild' or 'present'. */
  isManglik:   boolean;
  refs:        ManglikRefResult[];
  /** Distinct exemptions that cancelled a flagged reference. */
  exemptions:  ManglikExemption[];
  /** No Lagna (Moon only) or no birth time (Moon and Mars a little uncertain). */
  approximate: boolean;
  /** Why there's no Lagna, if there isn't one. */
  lagnaMissing: 'time' | 'place' | null;
  /** Manglik and aged 28+: the dosha is traditionally seen as weakened (note only). */
  ageSoftened: boolean;
  marsSign:    number;
  /** Primary reference: 'lagna' when an ascendant was available, else 'moon'. */
  basis:       'lagna' | 'moon';
  /** House of Mars from the primary reference. */
  house:       number;
  houseFromMoon: number;
};

export function houseFrom(baseSign: number, planetSign: number): number {
  return signCount(baseSign, planetSign);
}

/** The exemption that clears Mars in `house` (from some reference), if any. */
export function manglikExemption(marsSign: number, house: number, jupiterSign?: number | null): ManglikExemption | null {
  if (MARS_OWN.includes(marsSign)) return 'ownSign';
  if (marsSign === MARS_EXALT)     return 'exalted';
  if (HOUSE_EXEMPT[house]?.includes(marsSign)) return 'houseSign';
  if (jupiterSign != null && [1, 5, 7, 9].includes(houseFrom(jupiterSign, marsSign))) return 'jupiter';
  return null;
}

export type ManglikExtras = {
  /** Venus' sidereal sign, only when reliably known. */
  venusSign?:   number | null;
  /** Jupiter's sidereal sign, only when reliably known. */
  jupiterSign?: number | null;
  /** Defaults to true when a Lagna is given, else false. */
  hasTime?:     boolean;
  /** Why there's no Lagna (for display). */
  lagnaMissing?: 'time' | 'place' | null;
  /** Age in whole years, for the 28+ note. */
  age?:         number | null;
};

export function manglikFromSigns(
  marsSign: number, moonSign: number, lagnaSign: number | null, extras: ManglikExtras = {},
): ManglikInfo {
  const bases: [ManglikRef, number][] = [];
  if (lagnaSign != null) bases.push(['lagna', lagnaSign]);
  bases.push(['moon', moonSign]);
  if (extras.venusSign != null) bases.push(['venus', extras.venusSign]);

  const refs: ManglikRefResult[] = bases.map(([ref, base]) => {
    const house   = houseFrom(base, marsSign);
    const flagged = MANGLIK_HOUSES.includes(house);
    return { ref, house, flagged, exemption: flagged ? manglikExemption(marsSign, house, extras.jupiterSign) : null };
  });

  const flagged = refs.filter((r) => r.flagged);
  const active  = flagged.filter((r) => !r.exemption);
  const level: ManglikLevel =
    flagged.length === 0 ? 'none'
    : active.length === 0 ? 'cancelled'
    : active.length === 1 && refs.length >= 2 ? 'mild'
    : 'present';
  const isManglik = level === 'mild' || level === 'present';
  const houseFromMoon = houseFrom(moonSign, marsSign);
  const hasTime = extras.hasTime ?? lagnaSign != null;

  return {
    level,
    isManglik,
    refs,
    exemptions: [...new Set(flagged.map((r) => r.exemption).filter((e): e is ManglikExemption => !!e))],
    approximate: lagnaSign == null || !hasTime,
    lagnaMissing: lagnaSign == null ? (extras.lagnaMissing ?? 'time') : null,
    ageSoftened: isManglik && extras.age != null && extras.age >= MANGLIK_AGE_SOFTEN,
    marsSign,
    basis: lagnaSign == null ? 'moon' : 'lagna',
    house: lagnaSign == null ? houseFromMoon : houseFrom(lagnaSign, marsSign),
    houseFromMoon,
  };
}

// ─── Putting it together ─────────────────────────────────────────────────────

export type KootaKey = 'varna' | 'vashya' | 'tara' | 'yoni' | 'maitri' | 'gana' | 'bhakoot' | 'nadi';

export const KOOTA_MAX: Record<KootaKey, number> = {
  varna: 1, vashya: 2, tara: 3, yoni: 4, maitri: 5, gana: 6, bhakoot: 7, nadi: 8,
};
export const KOOTA_ORDER: KootaKey[] = ['varna', 'vashya', 'tara', 'yoni', 'maitri', 'gana', 'bhakoot', 'nadi'];

export type MoonPoint = {
  /** Sidereal Moon longitude 0..360. */
  lon:  number;
  sign: number;
  nak:  number;
  /** 1..4 */
  pada: number;
};

export function moonPoint(lon: number): MoonPoint {
  const l = ((lon % 360) + 360) % 360;
  const nak = Math.min(26, Math.floor(l / NAK_SIZE));
  return {
    lon:  l,
    sign: Math.floor(l / 30) % 12,
    nak,
    pada: Math.min(4, Math.floor((l - nak * NAK_SIZE) / (NAK_SIZE / 4)) + 1),
  };
}

export type KootaResult = { key: KootaKey; score: number; max: number };

export type Verdict = 'excellent' | 'good' | 'average' | 'low';

/** <18 low (not recommended), 18–24 average, 25–32 good, 33–36 excellent. */
export function verdictFor(total: number): Verdict {
  if (total >= 33) return 'excellent';
  if (total >= 25) return 'good';
  if (total >= 18) return 'average';
  return 'low';
}

export type AshtakootaResult = {
  kootas:  KootaResult[];
  total:   number;
  max:     36;
  verdict: Verdict;
  nadiDosha:    DoshaStatus;
  bhakootDosha: DoshaStatus;
  nadiDetail:    DoshaDetail;
  bhakootDetail: DoshaDetail;
  /** Informational only; Gana points are unchanged. */
  ganaDetail:    GanaDetail;
};

/** Score two Moon positions — bride first, groom second. */
export function scoreAshtakoota(bride: MoonPoint, groom: MoonPoint): AshtakootaResult {
  const scores: Record<KootaKey, number> = {
    varna:   varnaScore(bride.sign, groom.sign),
    vashya:  vashyaScore(bride.lon, groom.lon),
    tara:    taraScore(bride.nak, groom.nak),
    yoni:    yoniScore(bride.nak, groom.nak),
    maitri:  grahaMaitriScore(bride.sign, groom.sign),
    gana:    ganaScore(bride.nak, groom.nak),
    bhakoot: bhakootScore(bride.sign, groom.sign),
    nadi:    nadiScore(bride.nak, groom.nak),
  };
  const kootas = KOOTA_ORDER.map((key) => ({ key, score: scores[key], max: KOOTA_MAX[key] }));
  const total  = kootas.reduce((s, k) => s + k.score, 0);
  return {
    kootas,
    total,
    max: 36,
    verdict: verdictFor(total),
    nadiDosha:    nadiDosha(bride, groom),
    bhakootDosha: bhakootDosha(bride.sign, groom.sign),
    nadiDetail:    nadiDoshaDetail(bride, groom),
    bhakootDetail: bhakootDoshaDetail(bride.sign, groom.sign),
    ganaDetail:    ganaDoshaDetail(bride, groom),
  };
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export type Role = 'bride' | 'groom';

export type BirthData = {
  birthDate: string;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
  /** IANA zone of the birth place; null/absent → local mean time from longitude. */
  birthTz?: string | null;
};

/** Whole years between a YYYY-MM-DD birth date and `today` (null if unparseable). */
export function ageOn(birthDate: string, today: Date = new Date()): number | null {
  const [y, m, d] = (birthDate ?? '').split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

export type PersonChart = {
  moon:    MoonPoint;
  lagnaSign: number | null;
  manglik: ManglikInfo;
  /** False when no birth time was given (Moon may be off by up to ~6°). */
  hasTime: boolean;
  /** False when there are no birth coordinates (so no Lagna). */
  hasPlace: boolean;
  age:     number | null;
};

export function personChart(p: BirthData, today: Date = new Date()): PersonChart {
  const time  = p.birthTime || undefined;
  const tz    = p.birthTz ?? null;
  const hasTime  = !!p.birthTime;
  const hasPlace = p.birthLat != null && p.birthLng != null;
  const moon  = moonPoint(getMoonLongitudeExact(p.birthDate, time, p.birthLng, tz));
  const asc   = getAscendantDegree(p.birthDate, time, p.birthLat, p.birthLng, tz);
  const lagnaSign = asc == null ? null : Math.floor(asc / 30) % 12;
  const marsSign  = Math.floor(getMarsLongitudeTrue(p.birthDate, time, p.birthLng, tz) / 30) % 12;
  const planets   = getChartPositions({ ...p, birthTime: time ?? null, birthTz: tz });
  const signOf    = (name: string) => planets.find((x) => x.name === name)?.signIndex ?? null;
  const age = ageOn(p.birthDate, today);
  const manglik = manglikFromSigns(marsSign, moon.sign, lagnaSign, {
    venusSign:   signOf('Venus'),
    jupiterSign: signOf('Jupiter'),
    hasTime,
    lagnaMissing: !hasTime ? 'time' : !hasPlace ? 'place' : null,
    age,
  });
  return { moon, lagnaSign, manglik, hasTime, hasPlace, age };
}

/**
 * Pair status:
 *   'none'      nobody has Mars in a Manglik house
 *   'exempt'    someone does, but their exemptions cancel it (nobody active)
 *   'cancelled' both are Manglik (mild or full) — traditionally balanced
 *   'one'       only one of the two is Manglik
 */
export type ManglikPairStatus = 'none' | 'exempt' | 'cancelled' | 'one';

export type ManglikPair = {
  bride:  ManglikInfo;
  groom:  ManglikInfo;
  status: ManglikPairStatus;
};

export function manglikPair(bride: ManglikInfo, groom: ManglikInfo): ManglikPair {
  const n = Number(bride.isManglik) + Number(groom.isManglik);
  const status: ManglikPairStatus =
    n === 2 ? 'cancelled'
    : n === 1 ? 'one'
    : bride.level === 'cancelled' || groom.level === 'cancelled' ? 'exempt'
    : 'none';
  return { bride, groom, status };
}

export type KundliMatch = AshtakootaResult & {
  brideChart: PersonChart;
  groomChart: PersonChart;
  manglik:    ManglikPair;
};

export type MatchSubject = BirthData & { id?: string; gender?: string | null };

export function matchCharts(bride: MatchSubject, groom: MatchSubject, today: Date = new Date()): KundliMatch | null {
  if (!bride.birthDate || !groom.birthDate) return null;
  if (bride.id != null && bride.id === groom.id) return null; // same person in both slots
  const b = personChart(bride, today);
  const g = personChart(groom, today);
  const res = scoreAshtakoota(b.moon, g.moon);
  return {
    ...res,
    brideChart: b,
    groomChart: g,
    manglik: manglikPair(b.manglik, g.manglik),
  };
}

// ─── Data checks for the screen ──────────────────────────────────────────────
// None of these block a match except `sameProfile`; the rest are gentle notes.

export const ADULT_AGE = 18;
/** Age gap (years) from which a gentle, non-judgemental note is shown. */
export const AGE_GAP_NOTE = 15;

export type MatchNotes = {
  /** The same profile is in both slots — blocked. */
  sameProfile:    boolean;
  /** Two profiles with identical birth date, time and place (likely a duplicate). */
  identicalBirth: boolean;
  /** Under 18 today. Matching is meant for adults; shown as a note, not blocked. */
  minors:         Role[];
  /** Whole-year gap when ≥ AGE_GAP_NOTE, else null. */
  ageGap:         number | null;
  /** Has a birth date but no birth time. */
  noTime:         Role[];
  /** Has a birth time but no birth place (no Lagna, Moon-based Manglik only). */
  noPlace:        Role[];
  /** Bride/groom not given by gender (woman + man), so the user set the order. */
  rolesManual:    boolean;
};

export function matchNotes(
  bride: MatchSubject | null, groom: MatchSubject | null, today: Date = new Date(),
): MatchNotes {
  const people: [Role, MatchSubject | null][] = [['bride', bride], ['groom', groom]];
  const dated = people.filter((e): e is [Role, MatchSubject] => !!e[1]?.birthDate);
  const sameProfile = !!bride && !!groom && bride.id != null && bride.id === groom.id;
  const ages = dated.map(([, p]) => ageOn(p.birthDate, today));
  const gap = ages.length === 2 && ages[0] != null && ages[1] != null ? Math.abs(ages[0] - ages[1]) : null;
  return {
    sameProfile,
    identicalBirth: !sameProfile && !!bride?.birthDate && !!groom?.birthDate
      && bride.birthDate === groom.birthDate
      && (bride.birthTime ?? '') === (groom.birthTime ?? '')
      && (bride.birthLat ?? null) === (groom.birthLat ?? null)
      && (bride.birthLng ?? null) === (groom.birthLng ?? null)
      && (bride.birthTz ?? null) === (groom.birthTz ?? null),
    minors:  dated.filter(([, p]) => { const a = ageOn(p.birthDate, today); return a != null && a < ADULT_AGE; }).map(([r]) => r),
    ageGap:  !sameProfile && gap != null && gap >= AGE_GAP_NOTE ? gap : null,
    noTime:  dated.filter(([, p]) => !p.birthTime).map(([r]) => r),
    noPlace: dated.filter(([, p]) => !!p.birthTime && (p.birthLat == null || p.birthLng == null)).map(([r]) => r),
    rolesManual: !(bride?.gender === 'woman' && groom?.gender === 'man'),
  };
}
