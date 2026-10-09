/**
 * Bhagavad Gita verse of the day: a deterministic rotation through the 62
 * curated verses (assets/gita-corpus/curated-verses.json, the ones Krishna
 * mode quotes, with original Hindi/Bengali renderings), plus the Sanskrit and
 * IAST transliteration from assets/gita-corpus/sanskrit-verses.json
 * (github.com/gita/gita, public domain).
 *
 * Every calendar date maps to one verse; consecutive days step 23 places
 * through the canonical order (23 is coprime with 62, so all 62 verses come
 * up once before any repeats, and neighbouring days come from different
 * chapters). No React Native imports: Node tests load it.
 */

type CuratedFile = {
  themes: Record<string, string[]>;
  verses: Record<string, { ref: string; text: string; text_hi?: string; text_bn?: string }>;
};
type SanskritFile = { verses: Record<string, { sanskrit: string; transliteration: string }> };

const CURATED: CuratedFile = require('@/assets/gita-corpus/curated-verses.json');
const SANSKRIT: SanskritFile = require('@/assets/gita-corpus/sanskrit-verses.json');

export type DailyVerse = {
  id:       string;
  /** "2.47" */
  ref:      string;
  chapter:  number;
  verse:    number;
  text_en:  string;
  text_hi?: string;
  text_bn?: string;
  sanskrit?: string;
  transliteration?: string;
  /** Curated theme the verse belongs to first (anxiety, duty, …), for the "For your day" note. */
  theme:    string;
};

const ORDER: string[] = Object.keys(CURATED.verses).sort((a, b) => {
  const [, ca, va] = a.split('-').map(Number);
  const [, cb, vb] = b.split('-').map(Number);
  return ca - cb || va - vb;
});

const STRIDE = 23;
const THEME_ORDER = ['duty', 'anxiety', 'failure', 'purpose', 'anger', 'relationships', 'loss', 'gratitude'];

function themeOf(id: string): string {
  for (const t of THEME_ORDER) if (CURATED.themes[t]?.includes(id)) return t;
  return Object.keys(CURATED.themes).find((t) => CURATED.themes[t].includes(id)) ?? 'duty';
}

/** Whole days from 2026-01-01 to the local calendar date of `date`. */
function dayNumber(date: Date): number {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2026, 0, 1)) / 86400000);
}

export function verseById(id: string): DailyVerse {
  const v = CURATED.verses[id];
  const [, chapter, verse] = id.split('-').map(Number);
  const sk = SANSKRIT.verses[id];
  return {
    id, ref: v.ref, chapter, verse,
    text_en: v.text, text_hi: v.text_hi, text_bn: v.text_bn,
    sanskrit: sk?.sanskrit, transliteration: sk?.transliteration,
    theme: themeOf(id),
  };
}

/** The verse for the local calendar date of `date`. Same date → same verse, on every device. */
export function getVerseOfDay(date: Date = new Date()): DailyVerse {
  const n = ORDER.length;
  const k = (((dayNumber(date) * STRIDE) % n) + n) % n;
  return verseById(ORDER[k]);
}

/** The verses of the `count` days before `date`, most recent first. */
export function getEarlierVerses(date: Date = new Date(), count = 3): { date: Date; verse: DailyVerse }[] {
  const out: { date: Date; verse: DailyVerse }[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - i, 12);
    out.push({ date: d, verse: getVerseOfDay(d) });
  }
  return out;
}

/** The verse text in the app language, falling back to English. */
export function verseText(v: DailyVerse, lang: 'en' | 'hi' | 'bn'): string {
  return (lang === 'hi' ? v.text_hi : lang === 'bn' ? v.text_bn : undefined) ?? v.text_en;
}

export const DAILY_VERSE_COUNT = ORDER.length;
