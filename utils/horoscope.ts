/**
 * Deterministic daily horoscope generator.
 *
 * Text is rendered in the app language (see the variant pools below).
 *
 * No LLM. Pulls from getFullKundli + today's transits + lunar phase, then
 * fills templated phrasings using a seeded RNG so the same (profile, date)
 * always yields the same horoscope.
 *
 * Each slot picks a phrasing variant keyed by the relevant astrology factor
 * (e.g. ENERGY varies by moon sign + lunar phase, CAREER by sun + dasha).
 * Variant pools can grow over time without breaking the contract.
 */

import { getFullKundli, getLunarPhase, getTodayTransits } from './astrology';
import type { Profile } from './database';
import i18n from './i18n';

export type HoroscopeSections = {
  energy:   string;
  love:     string;
  career:   string;
  wellness: string;
  guidance: string;
  mantra:   string;
};

// ─── Seeded RNG (mulberry32) ──────────────────────────────────────────────────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Variant pools ────────────────────────────────────────────────────────────
// The phrasings live in locales/<lang>/horoscope.json under `gen` so the
// reading shows in the app language. Picks are made against the English pool
// sizes (every language has the same number of variants per pool), so the same
// (profile, date) gives the same reading in every language. Nothing here is
// sent to the model.

const PHASE_KEY: Record<string, string> = {
  'New Moon':        'newMoon',
  'Waxing Crescent': 'waxingCrescent',
  'First Quarter':   'firstQuarter',
  'Waxing Gibbous':  'waxingGibbous',
  'Full Moon':       'fullMoon',
  'Waning Gibbous':  'waningGibbous',
  'Last Quarter':    'lastQuarter',
  'Waning Crescent': 'waningCrescent',
};

const ELEMENT_KEY: Record<string, string> = {
  Fire: 'fire', Earth: 'earth', Air: 'air', Water: 'water',
};

const DASHA_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

/** Number of variants in an (English) pool. */
function poolSize(path: string): number {
  const v = i18n.t(`horoscope:gen.${path}`, { lng: 'en', returnObjects: true }) as unknown;
  return Array.isArray(v) ? v.length : 1;
}

/** Deterministic index into a pool, rendered in the app language. */
function pickText(rng: () => number, path: string, vars?: Record<string, string>): string {
  const i = Math.floor(rng() * poolSize(path));
  return i18n.t(`horoscope:gen.${path}.${i}`, vars ?? {});
}

// ─── Generator ────────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fillDashaFrame(rng: () => number, dashaLord: string, fallback: string, frames: string): string {
  const lord  = DASHA_LORDS.includes(dashaLord) ? dashaLord : fallback;
  const verb  = pickText(rng, `dasha.${lord}.verbs`);
  const theme = i18n.t(`horoscope:gen.dasha.${lord}.theme`);
  return pickText(rng, frames, { verb, verbCap: cap(verb), theme });
}

/**
 * Generate a daily horoscope deterministically from chart + today's sky.
 * Same (profile, date) input → same output. No LLM call.
 */
export function generateDailyHoroscope(profile: Profile, dateIso: string): HoroscopeSections | null {
  if (!profile.birthDate) return null;

  const kundli = getFullKundli({
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? undefined,
    birthLat:  profile.birthLat,
    birthLng:  profile.birthLng,
    birthTz:   profile.birthTz,
  });

  const { sun, moon } = kundli.bigThree;
  if (!sun || !moon) return null;

  const phase     = getLunarPhase(dateIso);
  const dashaLord = kundli.dasha.lord;

  const rng = mulberry32(hashSeed(profile.id + ':' + dateIso));

  const moonEl = ELEMENT_KEY[moon.element] ?? 'water';
  const sunEl  = ELEMENT_KEY[sun.element] ?? 'fire';

  const energy   = pickText(rng, `energy.${PHASE_KEY[phase] ?? 'waxingCrescent'}`);
  const love     = pickText(rng, `love.${moonEl}`);
  const career   = fillDashaFrame(rng, dashaLord, 'Saturn', 'careerFrames');
  const wellness = pickText(rng, `wellness.${moonEl}`);
  const guidance = fillDashaFrame(rng, dashaLord, 'Jupiter', 'guidanceFrames');
  const mantra   = pickText(rng, `mantra.${sunEl}`);

  return { energy, love, career, wellness, guidance, mantra };
}

/**
 * Lightweight one-line teaser used on the home card.
 */
export function generateHoroscopeTeaser(profile: Profile, dateIso: string): string | null {
  const h = generateDailyHoroscope(profile, dateIso);
  return h?.energy ?? null;
}

// Re-export for callers that want today's transit summary alongside the reading.
export { getTodayTransits };
