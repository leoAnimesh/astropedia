import { useAppLanguage } from '@/utils/i18n';

/**
 * Devanagari / Bengali glyphs fall back to the system Indic fonts, whose vowel
 * signs (ি, ে, ि …) rise above and below the Latin serif's ascender/descender.
 * The fixed lineHeights tuned for English (~1.1–1.25× fontSize) clip them.
 * In hi/bn every text style gets at least this multiple of its fontSize.
 */
export const INDIC_LINE_FACTOR = 1.5;

/** lineHeight that fits Indic script: max(existing, round(fontSize × 1.5)). */
export function indicLineHeight(fontSize: number, lineHeight?: number): number {
  return Math.max(lineHeight ?? 0, Math.round(fontSize * INDIC_LINE_FACTOR));
}

/** True when the app language uses an Indic script (re-renders on switch). */
export function useIsIndic(): boolean {
  return useAppLanguage() !== 'en';
}

type Sheet = Record<string, unknown>;
const cache = new WeakMap<object, object>();

function toIndic<T extends Sheet>(styles: T): T {
  const hit = cache.get(styles);
  if (hit) return hit as T;
  const out: Sheet = {};
  for (const key of Object.keys(styles)) {
    const s = styles[key] as { fontSize?: unknown; lineHeight?: unknown } | null;
    out[key] =
      s && typeof s === 'object' && typeof s.fontSize === 'number' && typeof s.lineHeight === 'number'
        ? { ...s, lineHeight: indicLineHeight(s.fontSize, s.lineHeight) }
        : s;
  }
  cache.set(styles, out);
  return out as T;
}

/**
 * The given StyleSheet, with every style that sets both fontSize and lineHeight
 * given room for Indic vowel marks when the app language is hi/bn. In English
 * the very same object is returned, so English rendering is unchanged.
 *
 *   const baseStyles = StyleSheet.create({ ... });
 *   function Screen() { const styles = useIndicStyles(baseStyles); ... }
 */
export function useIndicStyles<T extends Sheet>(styles: T): T {
  const indic = useIsIndic();
  return indic ? toIndic(styles) : styles;
}
