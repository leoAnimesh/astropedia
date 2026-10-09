/**
 * Word suggestions for the app keyboard's suggestion strip (like iOS
 * QuickType): completions and close corrections of the word at the caret,
 * from a per-language word-frequency list (constants/wordlists, built by
 * scripts/build-wordlists.mjs), plus the typing rules that go with them —
 * double-space full stop, and the few safe English fixes ("i" → "I",
 * "dont" → "don't").
 *
 * Pure logic — the lists are passed in (see wordlists.ts), so this runs in
 * plain Node tests.
 */
import { type EditState, isIndic, wordEndAfter, wordStartBefore } from './text-edit';

export type Lang = 'en' | 'hi' | 'bn';

export type WordList = {
  lang:    Lang;
  /** Most frequent first. */
  words:   string[];
  /** Match key of each word (same order). */
  keys:    string[];
  /** Match key → index of its most frequent word. */
  byKey:   Map<string, number>;
  /** First character of the key → word indices (frequency order). */
  buckets: Map<string, number[]>;
};

export type Suggestion = {
  /** What gets inserted. */
  text:  string;
  /** The typed word shown in quotes (keeps the word as typed). */
  typed: boolean;
};

/** Three slots: left, middle, right (null = empty). */
export type Slots = [Suggestion | null, Suggestion | null, Suggestion | null];

/** Autocorrect replaces words on space. Off: a 270M-model app shouldn't
 *  guess at people's words; only the exact fixes below apply. */
export const AUTOCORRECT = false;

// ─── Keys ────────────────────────────────────────────────────────────────────

const safeNormalize = (s: string, form: 'NFD' | 'NFC'): string => {
  try { return s.normalize(form); } catch { return s; }
};

/**
 * Match key: English is lower-cased with accents and apostrophes dropped
 * (so "cafe" finds "café" and "dont" finds "don't"); Indic text is
 * decomposed (nukta forms match however they were typed) without joiners.
 */
export function matchKey(word: string, lang: Lang): string {
  if (lang === 'en') {
    return safeNormalize(word.toLowerCase(), 'NFD').replace(/[̀-ͯ'’]/g, '');
  }
  return safeNormalize(word, 'NFD').replace(/[‌‍]/g, '');
}

export function buildWordList(words: string[], lang: Lang): WordList {
  const keys: string[] = [];
  const byKey = new Map<string, number>();
  const buckets = new Map<string, number[]>();
  words.forEach((w, i) => {
    const k = matchKey(w, lang);
    keys.push(k);
    if (!k) return;
    if (!byKey.has(k)) byKey.set(k, i);
    const b = k[0];
    let arr = buckets.get(b);
    if (!arr) buckets.set(b, (arr = []));
    arr.push(i);
  });
  return { lang, words, keys, byKey, buckets };
}

// ─── Word at the caret ───────────────────────────────────────────────────────

/** The word being typed: from its start up to the caret. */
export function currentWord(text: string, caret: number): { start: number; end: number; word: string } {
  const start = wordStartBefore(text, caret);
  return { start, end: caret, word: text.slice(start, caret) };
}

// ─── Exact English fixes ─────────────────────────────────────────────────────

const CONTRACTIONS: Record<string, string> = {
  i: 'I', im: "I'm", ive: "I've", dont: "don't", doesnt: "doesn't", didnt: "didn't",
  cant: "can't", wont: "won't", isnt: "isn't", arent: "aren't", wasnt: "wasn't",
  werent: "weren't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't",
  wouldnt: "wouldn't", couldnt: "couldn't", shouldnt: "shouldn't", youre: "you're",
  theyre: "they're", thats: "that's", whats: "what's", theres: "there's",
  youve: "you've", theyve: "they've", wouldve: "would've", couldve: "could've",
  shouldve: "should've", doesn: "doesn't", ain: "ain't",
};

/**
 * The safe fix for an English word, or null: "i" → "I", "i'm" → "I'm",
 * missing apostrophes in unambiguous contractions. Words that are real
 * words without the apostrophe ("well", "were", "ill", "lets") are left.
 */
export function exactFix(word: string): string | null {
  if (!word) return null;
  const lower = word.toLowerCase();
  if (/^i['’](m|ve|ll|d)$/.test(lower)) {
    const fixed = 'I' + word.slice(1).replace('’', "'");
    return fixed === word ? null : fixed;
  }
  const hit = CONTRACTIONS[lower];
  if (!hit || hit === word) return null;
  // Keep a capital the user typed ("Dont" → "Don't").
  return /^[A-Z]/.test(word) && hit[0] !== 'I' ? hit[0].toUpperCase() + hit.slice(1) : hit;
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

/** Damerau distance ≤ 1 (one insert, delete, substitute or swap). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;                       // substitute
    return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Matches the typed word's case: "Hel" → "Hello", "HEL" → "HELLO". */
export function matchCase(word: string, typed: string): string {
  if (!/[A-Za-z]/.test(typed)) return word;
  if (typed.length > 1 && typed === typed.toUpperCase() && typed !== typed.toLowerCase()) return word.toUpperCase();
  if (/^[A-Z]/.test(typed)) return word[0].toUpperCase() + word.slice(1);
  return word;
}

const MAX_SCAN = 4000;

/**
 * Completions (most frequent words starting with the typed letters) and
 * one-edit corrections, best first, excluding the typed word itself.
 */
export function candidates(list: WordList, typed: string, limit = 3): string[] {
  const key = matchKey(typed, list.lang);
  if (!key) return [];
  const out: string[] = [];
  const seen = new Set<string>([key]);
  const push = (i: number) => {
    const k = list.keys[i];
    if (seen.has(k)) return;
    seen.add(k);
    out.push(list.words[i]);
  };

  // A different spelling of the same key ("dont" → "don't", "jupiter" → "Jupiter").
  const same = list.byKey.get(key);
  const typedForm = list.lang === 'en' ? typed : safeNormalize(typed, 'NFD');
  const sameForm = same !== undefined ? (list.lang === 'en' ? list.words[same] : safeNormalize(list.words[same], 'NFD')) : null;
  const variant = same !== undefined && sameForm !== typedForm && sameForm!.toLowerCase() !== typedForm;
  if (variant) out.push(list.words[same!]);

  const bucket = list.buckets.get(key[0]) ?? [];
  const completions: number[] = [];
  for (let n = 0; n < bucket.length && n < MAX_SCAN && completions.length < limit; n++) {
    const i = bucket[n];
    const k = list.keys[i];
    if (k.length > key.length && k.startsWith(key)) completions.push(i);
  }

  // Corrections once a couple of letters are in. They lead only when
  // nothing completes the letters, or for a longer unknown word whose
  // correction is far more common than any completion (a likely typo).
  const corrections: number[] = [];
  if (Array.from(key).length >= 2) {
    const scan = Math.min(list.words.length, 12000);
    for (let i = 0; i < scan && corrections.length < limit; i++) {
      const k = list.keys[i];
      if (k !== key && Math.abs(k.length - key.length) <= 1 && withinOneEdit(k, key)) corrections.push(i);
    }
  }
  const known = same !== undefined;
  const order = !known && completions.length === 0
    ? corrections
    : !known && corrections.length && Array.from(key).length >= 4 && corrections[0] < completions[0] / 4
      ? [corrections[0], ...completions, ...corrections.slice(1)]
      : [...completions, ...corrections];
  for (const i of order) { if (out.length >= limit) break; push(i); }
  return out.slice(0, limit);
}

/**
 * The strip's three slots for the word at the caret. The middle slot keeps
 * what was typed — plain when it's a known word, "in quotes" when it isn't —
 * and the sides hold the best two other words.
 */
export function suggest(list: WordList | null, text: string, caret: number, opts: { fixes?: boolean } = {}): Slots {
  const { word } = currentWord(text, caret);
  if (!word || !list) return [null, null, null];
  // Only suggest for the list's script (an English word typed on the Hindi
  // layout gets no Hindi suggestions, and vice versa).
  const indic = isIndic(word.charCodeAt(0));
  if ((list.lang === 'en') === indic) return [null, { text: word, typed: true }, null];

  const key = matchKey(word, list.lang);
  const idx = list.byKey.get(key);
  const typedKnown = idx !== undefined && (
    list.lang === 'en' ? list.words[idx].toLowerCase() === word.toLowerCase() : matchKey(list.words[idx], list.lang) === key
  );
  const fix = list.lang === 'en' && opts.fixes !== false ? exactFix(word) : null;
  let others = candidates(list, word, 3).map((w) => (list.lang === 'en' ? matchCase(w, word) : w));
  if (fix) others = [fix, ...others.filter((w) => w !== fix)];
  others = others.filter((w) => w !== word).slice(0, 2);

  const middle: Suggestion = { text: word, typed: !typedKnown };
  const left = others[0] ? { text: others[0], typed: false } : null;
  const right = others[1] ? { text: others[1], typed: false } : null;
  return [left, middle, right];
}

/**
 * Applies a tapped suggestion: replaces the whole word around the caret and
 * leaves one space after it (reusing a space that's already there).
 */
export function applySuggestion(state: EditState, word: string): EditState {
  const caret = Math.max(0, Math.min(state.caret, state.text.length));
  const start = wordStartBefore(state.text, caret);
  const end = wordEndAfter(state.text, caret);
  const before = state.text.slice(0, start) + word;
  const after = state.text.slice(end);
  if (after.startsWith(' ')) return { text: before + after, caret: before.length + 1 };
  return { text: before + ' ' + after, caret: before.length + 1 };
}

// ─── Typing rules ────────────────────────────────────────────────────────────

/**
 * Double-tapping space after a word ends the sentence: "word␣" + space →
 * "word. " in English, "शब्द। " / "শব্দ। " after Hindi or Bengali text.
 * Returns the edit, or null when the rule doesn't apply (after punctuation,
 * a second space already, or at the start).
 */
export function doubleSpace(state: EditState): EditState | null {
  const { text, caret } = state;
  if (caret < 2 || text[caret - 1] !== ' ') return null;
  const prev = text.charCodeAt(caret - 2);
  const ch = text[caret - 2];
  const wordy = /[A-Za-z0-9À-ɏ)"'’”]/.test(ch) || isIndic(prev) && prev !== 0x0964 && prev !== 0x0965;
  if (!wordy) return null;
  // Find the script of the last word (skip closing quotes / brackets).
  let i = caret - 2;
  while (i > 0 && /[)"'’”]/.test(text[i])) i--;
  const stop = isIndic(text.charCodeAt(i)) ? '।' : '.';
  const nextText = text.slice(0, caret - 1) + stop + ' ' + text.slice(caret);
  return { text: nextText, caret: caret + 1 };
}

/** Characters that end a word and trigger the exact English fixes. */
export const WORD_ENDERS = new Set([' ', '.', ',', '?', '!', ';', ':', '\n']);
