/**
 * Deterministic daily horoscope generator.
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

function pick<T>(rng: () => number, pool: readonly T[]): T {
  return pool[Math.floor(rng() * pool.length)];
}

// ─── Variant pools ────────────────────────────────────────────────────────────
// Each pool deliberately short for v2 — grow over time.

const ENERGY_BY_PHASE: Record<string, readonly string[]> = {
  'New Moon': [
    'A quiet undertow today — like the day is asking you to slow down before you start something new.',
    'Things feel still, almost like a held breath. Use it to figure out what you actually want.',
    'A reset kind of day. Don\'t push — just notice what wants to begin.',
  ],
  'Waxing Crescent': [
    'A little spark of forward motion. Small things you start today have legs.',
    'You\'ll feel like doing — go with it, but pick the one thing that matters.',
    'A gentle build of energy. Plant something today; you\'ll see it grow this week.',
  ],
  'First Quarter': [
    'Something\'s asking you to push through a little resistance. The friction is the point.',
    'A day that wants you to commit. Make the call you\'ve been putting off.',
    'You\'ll feel pulled in two directions. Pick one and go — both will sort themselves later.',
  ],
  'Waxing Gibbous': [
    'Energy is full and bright. Take the bigger swing today, not the safer one.',
    'You\'ll find yourself wanting to fix everything at once. Do one thing well.',
    'Productive day if you stay specific. Vagueness is the only thing that\'ll trip you up.',
  ],
  'Full Moon': [
    'Feelings will run close to the surface. Don\'t fight them — they\'re trying to tell you something.',
    'A day of full light. Things you\'ve been avoiding will be hard to ignore.',
    'You\'ll feel everything more than usual. That\'s not a weakness today; it\'s the signal.',
  ],
  'Waning Gibbous': [
    'A reflective kind of day. Notice what you\'re ready to stop carrying.',
    'You\'ll see something clearly that was murky a week ago. Trust it.',
    'A good day to wrap up loose ends, not start fresh ones.',
  ],
  'Last Quarter': [
    'Let something go today. You\'ll feel lighter for it.',
    'A day for cleaning house — literal or otherwise.',
    'Resist the urge to defend an old position. You\'re allowed to change your mind.',
  ],
  'Waning Crescent': [
    'A soft, low-energy day. Rest is the productive choice.',
    'Quiet inside today. Don\'t mistake it for being stuck — you\'re composting.',
    'A day to be gentle with yourself. Tomorrow has its own pace.',
  ],
};

const LOVE_BY_MOON_ELEMENT: Record<string, readonly string[]> = {
  Fire:  [
    'Say the bold thing today. The people who matter will meet you there.',
    'Don\'t play it cool with someone who actually matters to you.',
    'Affection lands warmer when it\'s direct today — no hints, no games.',
  ],
  Earth: [
    'Small acts of care will mean more than grand gestures today.',
    'Show up reliably for someone today — that\'s the whole thing.',
    'A practical kindness is the love language working today.',
  ],
  Air:   [
    'A long talk could shift something today. Don\'t cut it short.',
    'Words matter today — say the kind one out loud, not just in your head.',
    'Curiosity is romantic today. Ask the question you\'ve been wondering about.',
  ],
  Water: [
    'Let yourself feel a little tender today. It\'s not weakness; it\'s the bridge.',
    'A soft moment is waiting if you slow down enough to notice it.',
    'Don\'t armor up today — the person across from you wants the real you.',
  ],
};

const DASHA_FLAVOR: Record<string, { theme: string; verbs: readonly string[] }> = {
  Sun:     { theme: 'identity and purpose',          verbs: ['lead', 'step forward', 'be seen'] },
  Moon:    { theme: 'emotion and intuition',         verbs: ['listen inward', 'nurture', 'feel'] },
  Mars:    { theme: 'action and courage',            verbs: ['act', 'push', 'start'] },
  Mercury: { theme: 'learning and communication',    verbs: ['write', 'speak up', 'connect'] },
  Jupiter: { theme: 'growth and wisdom',             verbs: ['expand', 'teach', 'say yes'] },
  Venus:   { theme: 'love and beauty',               verbs: ['enjoy', 'create', 'soften'] },
  Saturn:  { theme: 'discipline and slow building',  verbs: ['stay', 'finish', 'commit'] },
  Rahu:    { theme: 'ambition and unfamiliar paths', verbs: ['take the risk', 'go bigger', 'try the new thing'] },
  Ketu:    { theme: 'release and inner work',        verbs: ['let go', 'pare down', 'sit with it'] },
};

const CAREER_FRAMES: readonly string[] = [
  'Today is for the work nobody else sees. {verb_cap} the boring part — it\'s where the result lives.',
  'A good day to {verb} on the thing that matters, not the thing that\'s loudest.',
  '{verb_cap} — even a small step today compounds in this chapter of {theme}.',
  'Don\'t scatter today. One real hour beats four anxious ones.',
];

const WELLNESS_BY_MOON_ELEMENT: Record<string, readonly string[]> = {
  Fire:  [
    'Move your body today, even briefly. The energy needs somewhere to go.',
    'You\'ll feel restless if you stay still too long. Walk it out.',
    'Spicy or hot foods hit different today — go gentle on yourself.',
  ],
  Earth: [
    'Step outside for a few minutes. Even a tree counts.',
    'Eat a real meal today. Your body is asking for grounded fuel.',
    'A long stretch or short walk does more than caffeine today.',
  ],
  Air:   [
    'Don\'t skip sleep tonight — your mind will run twice as hot tomorrow if you do.',
    'Five minutes of breathing slowly will reset your whole afternoon.',
    'Get off the screen for an hour. Anywhere. Your nervous system will thank you.',
  ],
  Water: [
    'Drink more water than you think. Today rewards it.',
    'A bath, a shower, anything with water — it\'ll reset your mood.',
    'Cry if you need to. Hydrate after.',
  ],
};

const GUIDANCE_FRAMES: readonly string[] = [
  'The clearest move today: {verb} the one thing that\'s been quietly waiting.',
  'You don\'t need a plan — you need to {verb} once, today.',
  'Stop waiting to feel ready. {verb_cap}, then the feeling catches up.',
  'The smallest right action beats the perfect one you don\'t take.',
];

const MANTRAS_BY_ELEMENT: Record<string, readonly string[]> = {
  Fire:  ['Bold beats perfect.', 'I move when it matters.', 'My fire is a tool, not a problem.'],
  Earth: ['Slow is steady. Steady is enough.', 'I build with patience.', 'My ground holds me.'],
  Air:   ['I listen to the room and to myself.', 'Curiosity is my compass.', 'Clear words, clear day.'],
  Water: ['I feel, and I keep going.', 'Tender is also strong.', 'My depth is a gift.'],
};

// ─── Generator ────────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fillCareer(rng: () => number, dashaLord: string): string {
  const flavor = DASHA_FLAVOR[dashaLord] ?? DASHA_FLAVOR.Saturn;
  const verb   = pick(rng, flavor.verbs);
  const frame  = pick(rng, CAREER_FRAMES);
  return frame
    .replaceAll('{verb_cap}', cap(verb))
    .replaceAll('{verb}',     verb)
    .replaceAll('{theme}',    flavor.theme);
}

function fillGuidance(rng: () => number, dashaLord: string): string {
  const flavor = DASHA_FLAVOR[dashaLord] ?? DASHA_FLAVOR.Jupiter;
  const verb   = pick(rng, flavor.verbs);
  const frame  = pick(rng, GUIDANCE_FRAMES);
  return frame
    .replaceAll('{verb_cap}', cap(verb))
    .replaceAll('{verb}',     verb);
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
  });

  const { sun, moon } = kundli.bigThree;
  if (!sun || !moon) return null;

  const phase     = getLunarPhase(dateIso);
  const dashaLord = kundli.dasha.lord;

  const rng = mulberry32(hashSeed(profile.id + ':' + dateIso));

  const energy   = pick(rng, ENERGY_BY_PHASE[phase] ?? ENERGY_BY_PHASE['Waxing Crescent']);
  const love     = pick(rng, LOVE_BY_MOON_ELEMENT[moon.element]);
  const career   = fillCareer(rng, dashaLord);
  const wellness = pick(rng, WELLNESS_BY_MOON_ELEMENT[moon.element]);
  const guidance = fillGuidance(rng, dashaLord);
  const mantra   = pick(rng, MANTRAS_BY_ELEMENT[sun.element]);

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
