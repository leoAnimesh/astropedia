/**
 * Lucky colour, number and time for a person on a day. Deterministic and
 * computed on device; framed in the UI as a gentle nudge, never "unlucky".
 *
 * - Ruler: the weekday's planet (Friday → Venus). If that planet is a natural
 *   enemy of the ruler of the person's Moon sign, the Moon-sign ruler is used
 *   instead, so the pick is personal without ever saying "bad day".
 * - Colour: the ruler's traditional colour (Sun orange, Moon white, Mars red,
 *   Mercury green, Jupiter yellow, Venus white, Saturn blue).
 * - Number: the ruler's number (Sun 1, Moon 2, Jupiter 3, Mercury 5, Venus 6,
 *   Saturn 8, Mars 9).
 * - Time: the day's best choghadiya (first Amrit, else Shubh, else Labh)
 *   clear of Rahu Kaal, at the person's birth place (Delhi without one),
 *   matching the Panchang screen.
 *
 * `color` is an i18n key under `common:lucky.color.*`.
 */

import { getMoonLongitudeExact } from './astrology';
import { getBestWindow } from './choghadiya';

export type LuckyProfile = {
  birthDate?: string | null;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
  birthTz?: string | null;
};

export type LuckyDay = {
  /** i18n key under common:lucky.color.* (e.g. "white"). */
  color: string;
  /** Swatch colour for the UI. */
  colorHex: string;
  number: number;
  /** "8:29–9:57" style, in the app language (absent if no window could be found). */
  time?: string;
  timeStart?: Date;
  timeEnd?: Date;
  /** Planet the pick comes from, and why. */
  ruler: string;
  basis: 'weekday' | 'moonSign';
};

const WEEKDAY_RULER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const SIGN_RULER = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];

const ENEMIES: Record<string, string[]> = {
  Sun: ['Venus', 'Saturn'],
  Moon: [],
  Mars: ['Mercury'],
  Mercury: ['Moon'],
  Jupiter: ['Mercury', 'Venus'],
  Venus: ['Sun', 'Moon'],
  Saturn: ['Sun', 'Moon', 'Mars'],
};

export const LUCKY_COLOR: Record<string, { key: string; hex: string }> = {
  Sun:     { key: 'orange', hex: '#E8833A' },
  Moon:    { key: 'white',  hex: '#F4F1E8' },
  Mars:    { key: 'red',    hex: '#C8463D' },
  Mercury: { key: 'green',  hex: '#4E9A62' },
  Jupiter: { key: 'yellow', hex: '#E7C24A' },
  Venus:   { key: 'white',  hex: '#F4F1E8' },
  Saturn:  { key: 'blue',   hex: '#3D5A99' },
};

export const LUCKY_NUMBER: Record<string, number> = {
  Sun: 1, Moon: 2, Jupiter: 3, Mercury: 5, Venus: 6, Saturn: 8, Mars: 9,
};

function moonSignRuler(p: LuckyProfile | null | undefined): string | null {
  if (!p?.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) return null;
  try {
    const lon = getMoonLongitudeExact(p.birthDate, p.birthTime, p.birthLng, p.birthTz);
    return Number.isFinite(lon) ? SIGN_RULER[Math.floor(lon / 30) % 12] : null;
  } catch {
    return null;
  }
}

/** "8:29–9:57" in the app language; plain digits when i18n isn't loaded (Node). */
function formatRange(a: Date, b: Date): string {
  const plain = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { localizeDigits } = require('./i18n') as typeof import('./i18n');
    return localizeDigits(`${plain(a)}–${plain(b)}`);
  } catch {
    return `${plain(a)}–${plain(b)}`;
  }
}

export function getLuckyForDay(profile: LuckyProfile | null | undefined, date: Date = new Date()): LuckyDay {
  const dayRuler = WEEKDAY_RULER[date.getDay()];
  const moonRuler = moonSignRuler(profile);
  const useMoon = !!moonRuler && ENEMIES[moonRuler]?.includes(dayRuler);
  const ruler = useMoon ? moonRuler! : dayRuler;
  const best = getBestWindow(date, profile?.birthLat, profile?.birthLng);
  return {
    color:    LUCKY_COLOR[ruler].key,
    colorHex: LUCKY_COLOR[ruler].hex,
    number:   LUCKY_NUMBER[ruler],
    time:      best ? formatRange(best.start, best.end) : undefined,
    timeStart: best?.start,
    timeEnd:   best?.end,
    ruler,
    basis: useMoon ? 'moonSign' : 'weekday',
  };
}
