/**
 * Vedic compatibility (lite Ashtakoot) — pick two profiles, compute a 0–10
 * score from three traditional dimensions: Gana (temperament), Nadi (health),
 * and Bhakoot (rashi distance). Returns a friendly narrative summary too.
 *
 * Deterministic. No LLM. Uses each profile's moon longitude + moon sign.
 */

import type { Profile } from './database';
import { getBigThree, getMoonLongitudeExact } from './astrology';
import { NAKSHATRAS } from '@/constants/astrology';

// ─── Nakshatra metadata (gana + nadi) ─────────────────────────────────────────

type Gana = 'Deva' | 'Manushya' | 'Rakshasa';
type Nadi = 'Aadi'  | 'Madhya'   | 'Antya';

const NAK_GANA: Record<string, Gana> = {
  'Ashwini': 'Deva', 'Mrigashira': 'Deva', 'Punarvasu': 'Deva', 'Pushya': 'Deva',
  'Hasta':   'Deva', 'Swati':      'Deva', 'Anuradha':  'Deva', 'Shravana': 'Deva', 'Revati': 'Deva',
  'Bharani':         'Manushya', 'Rohini':            'Manushya', 'Ardra':           'Manushya',
  'Purva Phalguni':  'Manushya', 'Uttara Phalguni':   'Manushya', 'Purva Ashadha':   'Manushya',
  'Uttara Ashadha':  'Manushya', 'Purva Bhadrapada':  'Manushya', 'Uttara Bhadrapada': 'Manushya',
  'Krittika':  'Rakshasa', 'Ashlesha':  'Rakshasa', 'Magha':       'Rakshasa',
  'Chitra':    'Rakshasa', 'Vishakha':  'Rakshasa', 'Jyeshtha':    'Rakshasa',
  'Mula':      'Rakshasa', 'Dhanishtha':'Rakshasa', 'Shatabhisha': 'Rakshasa',
};

const NAK_NADI: Record<string, Nadi> = {
  'Ashwini':         'Aadi',   'Ardra':            'Aadi',   'Punarvasu':       'Aadi',
  'Uttara Phalguni': 'Aadi',   'Hasta':            'Aadi',   'Jyeshtha':        'Aadi',
  'Mula':            'Aadi',   'Shatabhisha':      'Aadi',   'Purva Bhadrapada':'Aadi',
  'Bharani':         'Madhya', 'Mrigashira':       'Madhya', 'Pushya':          'Madhya',
  'Purva Phalguni':  'Madhya', 'Chitra':           'Madhya', 'Anuradha':        'Madhya',
  'Purva Ashadha':   'Madhya', 'Dhanishtha':       'Madhya', 'Uttara Bhadrapada':'Madhya',
  'Krittika':        'Antya',  'Rohini':           'Antya',  'Ashlesha':        'Antya',
  'Magha':           'Antya',  'Swati':            'Antya',  'Vishakha':        'Antya',
  'Uttara Ashadha':  'Antya',  'Shravana':         'Antya',  'Revati':          'Antya',
};

// ─── Scoring ──────────────────────────────────────────────────────────────────

// Gana (max 6) — Deva-Deva or Manushya-Manushya = 6; Deva-Manushya = 5;
// Manushya-Rakshasa = 1; Deva-Rakshasa = 0; Rakshasa-Rakshasa = 6 (both same).
function ganaScore(a: Gana, b: Gana): number {
  if (a === b) return 6;
  const pair = new Set([a, b]);
  if (pair.has('Deva')     && pair.has('Manushya')) return 5;
  if (pair.has('Manushya') && pair.has('Rakshasa')) return 1;
  return 0; // Deva–Rakshasa
}

// Nadi (max 8) — same nadi = 0 (Nadi dosha), different = 8.
function nadiScore(a: Nadi, b: Nadi): number {
  return a === b ? 0 : 8;
}

// Bhakoot (max 7) — based on the distance between moon signs (1..12).
// Inauspicious pairs (distance 2/12, 5/9, 6/8) score 0; everything else 7.
function bhakootScore(moonSignA: number, moonSignB: number): number {
  const d = Math.abs(moonSignA - moonSignB);
  const dist = Math.min(d, 12 - d); // shortest way around the wheel, 0..6
  const moonDiff = (moonSignA - moonSignB + 12) % 12;
  const pair = `${moonDiff}-${(12 - moonDiff) % 12}`;
  // The classical Bhakoot dosha distances: 6/8 (|diff|=2 in one direction, 10 in other),
  // 5/9 (|diff|=4 in one direction, 8 in other), 2/12 (|diff|=1 in one direction, 11 in other).
  if (dist === 1 || dist === 4 || dist === 2) {
    // Slight caveat: only some of these specific ordered pairs are dosha in strict tradition;
    // for a lite check we treat all three classical distances as risky.
    // (pair variable retained for potential future refinement)
    void pair;
    return 0;
  }
  return 7;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type CompatibilityDimension = {
  name:      string;
  score:     number;
  max:       number;
  flavor:    string;     // one-line interpretation
};

export type CompatibilityResult = {
  total:      number;        // 0..21
  max:        number;        // 21
  outOfTen:   number;        // 0..10, rounded to 0.5
  verdict:    string;        // short headline
  summary:    string;        // 2–3 sentence narrative
  dimensions: CompatibilityDimension[];
};

function nakshatraFromMoon(profile: Profile) {
  const lon  = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined);
  const idx  = Math.min(26, Math.floor(lon / (360 / 27)));
  return NAKSHATRAS[idx];
}

function moonSignIndex(profile: Profile): number | null {
  const { moon } = getBigThree(profile);
  if (!moon) return null;
  // ZODIAC[idx].name === moon.name; index can be derived from longitude too.
  const lon = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined);
  return Math.floor(lon / 30);
}

export function computeCompatibility(a: Profile, b: Profile): CompatibilityResult | null {
  if (!a.birthDate || !b.birthDate) return null;

  const nakA = nakshatraFromMoon(a);
  const nakB = nakshatraFromMoon(b);
  const ganaA = NAK_GANA[nakA.name];
  const ganaB = NAK_GANA[nakB.name];
  const nadiA = NAK_NADI[nakA.name];
  const nadiB = NAK_NADI[nakB.name];

  const signA = moonSignIndex(a);
  const signB = moonSignIndex(b);
  if (signA == null || signB == null || !ganaA || !ganaB || !nadiA || !nadiB) return null;

  const gana    = ganaScore(ganaA, ganaB);
  const nadi    = nadiScore(nadiA, nadiB);
  const bhakoot = bhakootScore(signA, signB);

  const total    = gana + nadi + bhakoot;
  const max      = 21;
  const outOfTen = Math.round((total / max) * 20) / 2;

  const dimensions: CompatibilityDimension[] = [
    {
      name:   'Temperament (Gana)',
      score:  gana,
      max:    6,
      flavor: gana >= 5
        ? 'Your inner natures move in the same key.'
        : gana >= 3
        ? 'Different temperaments, but workable with care.'
        : 'Two very different inner rhythms — you\'ll need to translate often.',
    },
    {
      name:   'Health & vitality (Nadi)',
      score:  nadi,
      max:    8,
      flavor: nadi === 8
        ? 'Your constitutions complement each other well.'
        : 'Similar constitutions — traditionally a caution flag for shared depletion.',
    },
    {
      name:   'Lifestyle harmony (Bhakoot)',
      score:  bhakoot,
      max:    7,
      flavor: bhakoot === 7
        ? 'Your day-to-day rhythms can sync easily.'
        : 'Your moon signs sit in a classically restless angle to each other.',
    },
  ];

  const firstA = a.name.split(' ')[0];
  const firstB = b.name.split(' ')[0];

  let verdict: string;
  let summary: string;
  if (outOfTen >= 8) {
    verdict = 'Strong match';
    summary = `${firstA} and ${firstB} share a naturally compatible chart pairing — temperament, vitality, and daily rhythm all line up well. A friendship or partnership here has good wind behind it.`;
  } else if (outOfTen >= 5.5) {
    verdict = 'Workable, with effort';
    summary = `${firstA} and ${firstB} have real points of harmony, plus a few traditional friction points. Communication and patience matter more than they would in an effortless pairing — but that's true of most lasting bonds.`;
  } else {
    verdict = 'Challenging pairing';
    summary = `Traditional matching marks this as a careful pairing for ${firstA} and ${firstB}. That doesn't mean it can't work — many real-life partnerships do — but the chart asks for awareness, not autopilot.`;
  }

  return { total, max, outOfTen, verdict, summary, dimensions };
}
