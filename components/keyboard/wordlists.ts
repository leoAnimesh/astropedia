/**
 * Loads the bundled word-frequency lists (constants/wordlists/*.json, built
 * by scripts/build-wordlists.mjs) on first use and caches the index.
 */
import { buildWordList, type Lang, type WordList } from './suggest';

const cache: Partial<Record<Lang, WordList>> = {};

function raw(lang: Lang): { words: string } {
  // Required lazily so the lists are only parsed when the keyboard is used.
  switch (lang) {
    case 'hi': return require('@/constants/wordlists/hi.json');
    case 'bn': return require('@/constants/wordlists/bn.json');
    default:   return require('@/constants/wordlists/en.json');
  }
}

export function getWordList(lang: Lang): WordList | null {
  const hit = cache[lang];
  if (hit) return hit;
  try {
    const list = buildWordList(raw(lang).words.split(' '), lang);
    cache[lang] = list;
    return list;
  } catch {
    return null;
  }
}

export function isWordListLoaded(lang: Lang): boolean {
  return !!cache[lang];
}
