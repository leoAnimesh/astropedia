/**
 * L0 — Deterministic answer dispatcher.
 *
 * For questions with a single correct answer (rashi, nakshatra, current dasha,
 * lunar phase, etc.) we skip the LLM entirely and return a pre-formatted reply
 * in Saga's voice. Universal device support, zero inference cost, instant.
 *
 * Returns `null` when the available profile data isn't enough — caller should
 * fall through to the LLM in that case.
 */

import type { Profile } from './database';
import {
  getBigThree,
  getMoonLongitudeExact,
  getNakshatra,
  getCurrentMahadasha,
  getLunarPhase,
  getTodayTransits,
} from './astrology';
import { todayIso } from './format';

export type DeterministicTopic =
  | 'sun_sign'
  | 'moon_sign'
  | 'rising_sign'
  | 'big_three'
  | 'nakshatra'
  | 'current_dasha'
  | 'lunar_phase'
  | 'today_transits';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function monthsUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime();
  const now    = Date.now();
  return Math.max(0, Math.round((target - now) / (1000 * 60 * 60 * 24 * 30.4375)));
}

function answerSunSign(profile: Profile): string | null {
  const { sun } = getBigThree(profile);
  if (!sun) return null;
  return `Your sun sign is ${sun.name} ${sun.glyph} — a ${sun.element.toLowerCase()} sign. ${sun.description}`;
}

function answerMoonSign(profile: Profile): string | null {
  const { moon } = getBigThree(profile);
  if (!moon) return null;
  return `Your moon sign is ${moon.name} ${moon.glyph}. That's the part of you that runs underneath — your instincts and emotional weather. ${moon.description}`;
}

function answerRisingSign(profile: Profile): string | null {
  const { rising } = getBigThree(profile);
  if (!rising) {
    return `I'd need your exact birth time and place to figure out your rising sign. Add those in your profile and I can tell you.`;
  }
  return `Your rising sign is ${rising.name} ${rising.glyph} — the face you show the world, especially on first meetings. ${rising.description}`;
}

function answerBigThree(profile: Profile): string | null {
  const { sun, moon, rising } = getBigThree(profile);
  if (!sun || !moon) return null;
  const parts = [
    `Sun in ${sun.name} ${sun.glyph} — that's your core self.`,
    `Moon in ${moon.name} ${moon.glyph} — your emotional world.`,
  ];
  if (rising) {
    parts.push(`Rising in ${rising.name} ${rising.glyph} — how you come across to others.`);
  } else {
    parts.push(`Add your birth time and city in your profile to unlock your rising sign too.`);
  }
  return parts.join(' ');
}

function answerNakshatra(profile: Profile): string | null {
  if (!profile.birthDate) return null;
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined);
  const nak     = getNakshatra(moonLon);
  return `Your moon nakshatra is ${nak.name}, ruled by ${nak.lord}. It shapes the texture of your mind and your dasha cycle.`;
}

function answerCurrentDasha(profile: Profile): string | null {
  if (!profile.birthDate) return null;
  const moonLon = getMoonLongitudeExact(profile.birthDate, profile.birthTime ?? undefined);
  const dasha   = getCurrentMahadasha(moonLon, profile.birthDate);
  const months  = monthsUntil(dasha.endDate);
  const ends    = prettyDate(dasha.endDate);
  return `You're currently in ${dasha.lord} Mahadasha until ${ends} (about ${months} months left). This is the big planetary chapter coloring your life right now.`;
}

function answerLunarPhase(): string {
  const phase = getLunarPhase(todayIso());
  return `Today's moon is in the ${phase} phase. ${
    phase === 'New Moon'      ? 'A quiet start — good for setting intentions.' :
    phase === 'Full Moon'     ? 'Energy peaks — emotions and outcomes ripen.' :
    phase.includes('Waxing')  ? 'Energy building — a time to act and grow.' :
                                'Energy releasing — a time to reflect and let go.'
  }`;
}

function answerTodayTransits(): string {
  const transits = getTodayTransits();
  if (transits.length === 0) return `I couldn't compute today's planetary positions just now.`;
  const summary = transits
    .slice(0, 5)
    .map(t => `${t.name} in ${t.signName}`)
    .join(', ');
  return `Right now: ${summary}. These are the planets shaping the day's general mood.`;
}

/**
 * Resolve a deterministic topic to a formatted answer in Saga's voice.
 * Returns null when profile data is insufficient — caller should fall back
 * to the LLM with whatever context it has.
 */
export function deterministicAnswer(
  topic:   DeterministicTopic,
  profile: Profile,
): string | null {
  switch (topic) {
    case 'sun_sign':       return answerSunSign(profile);
    case 'moon_sign':      return answerMoonSign(profile);
    case 'rising_sign':    return answerRisingSign(profile);
    case 'big_three':      return answerBigThree(profile);
    case 'nakshatra':      return answerNakshatra(profile);
    case 'current_dasha':  return answerCurrentDasha(profile);
    case 'lunar_phase':    return answerLunarPhase();
    case 'today_transits': return answerTodayTransits();
  }
}

// ─── Intent classification ────────────────────────────────────────────────────

const PATTERNS: Array<{ topic: DeterministicTopic; rx: RegExp }> = [
  // Order matters — more specific patterns first.
  { topic: 'big_three',      rx: /\b(big\s*three|big\s*3|sun\s+moon\s+(and\s+)?rising|my\s+chart\s+(summary|overview)|kundli\s+(summary|overview))\b/i },
  { topic: 'rising_sign',    rx: /\b(rising\s+sign|ascendant|lagna)\b/i },
  { topic: 'moon_sign',      rx: /\b(moon\s+sign|rashi)\b/i },
  { topic: 'sun_sign',       rx: /\b(sun\s+sign|zodiac\s+sign|what\s+sign\s+am\s+i|which\s+sign\s+am\s+i)\b/i },
  { topic: 'nakshatra',      rx: /\b(nakshatra|janma\s+star|birth\s+star)\b/i },
  { topic: 'current_dasha',  rx: /\b(current\s+dasha|mahadasha|maha\s+dasha|which\s+dasha|what\s+dasha)\b/i },
  { topic: 'lunar_phase',    rx: /\b(moon\s+phase|lunar\s+phase|phase\s+of\s+the\s+moon|moon\s+today)\b/i },
  { topic: 'today_transits', rx: /\b(today'?s?\s+transits?|current\s+transits?|planets?\s+today|where\s+are\s+the\s+planets)\b/i },
];

export function classifyDeterministic(message: string): DeterministicTopic | null {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null; // long messages are unlikely to be lookups
  for (const { topic, rx } of PATTERNS) {
    if (rx.test(trimmed)) return topic;
  }
  return null;
}
