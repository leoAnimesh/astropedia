/**
 * Pure text-editing logic for the in-app keyboard. No React Native imports,
 * so it can be unit-tested with plain Node.
 *
 * Positions are UTF-16 offsets (what JS strings and TextInput selections use).
 *
 * Indic handling (Devanagari + Bengali):
 *  - A "cluster" is a base character plus its combining marks (nukta, vowel
 *    signs, halant, anusvara/candrabindu/visarga), and conjuncts joined by a
 *    halant (क्ष, ক্ষ) stay one cluster — the same rule as Unicode 15.1
 *    grapheme clusters (GB9c). Backspace removes one whole cluster so a
 *    conjunct or a consonant+matra is never left half-deleted.
 *  - Typing a vowel sign after a consonant composes in Unicode order
 *    (base, nukta, vowel sign or halant, then bindu/visarga). A second vowel
 *    sign replaces the first; a vowel sign with no consonant to attach to is
 *    typed as the independent vowel instead (ि at the start of a word → इ).
 */

export type EditState = { text: string; caret: number };

// ─── Character classes ───────────────────────────────────────────────────────

const inRange = (c: number, lo: number, hi: number) => c >= lo && c <= hi;

/** Devanagari / Bengali combining marks (nukta, matras, halant, bindus…). */
export function isIndicMark(c: number): boolean {
  return (
    // Devanagari
    inRange(c, 0x0900, 0x0903) ||
    inRange(c, 0x093a, 0x093c) ||
    inRange(c, 0x093e, 0x094f) ||
    inRange(c, 0x0951, 0x0957) ||
    inRange(c, 0x0962, 0x0963) ||
    // Bengali
    inRange(c, 0x0981, 0x0983) ||
    c === 0x09bc ||
    inRange(c, 0x09be, 0x09c4) ||
    inRange(c, 0x09c7, 0x09c8) ||
    inRange(c, 0x09cb, 0x09cd) ||
    c === 0x09d7 ||
    inRange(c, 0x09e2, 0x09e3)
  );
}

export function isIndicConsonant(c: number): boolean {
  return (
    inRange(c, 0x0915, 0x0939) || inRange(c, 0x0958, 0x095f) || inRange(c, 0x0978, 0x097f) ||
    inRange(c, 0x0995, 0x09b9) || c === 0x09dc || c === 0x09dd || c === 0x09df ||
    c === 0x09f0 || c === 0x09f1
  );
}

export function isIndic(c: number): boolean {
  return inRange(c, 0x0900, 0x097f) || inRange(c, 0x0980, 0x09ff);
}

const isVirama = (c: number) => c === 0x094d || c === 0x09cd;
const isJoiner = (c: number) => c === 0x200c || c === 0x200d;
const isNukta = (c: number) => c === 0x093c || c === 0x09bc;
/** Candrabindu / anusvara / visarga — go after the vowel sign. */
const isBindu = (c: number) => inRange(c, 0x0900, 0x0903) || inRange(c, 0x0981, 0x0983);
/** Dependent vowel signs (matras), excluding halant / nukta / bindus. */
export function isMatra(c: number): boolean {
  return (
    inRange(c, 0x093a, 0x093b) || inRange(c, 0x093e, 0x094c) || inRange(c, 0x094e, 0x094f) ||
    inRange(c, 0x0955, 0x0957) || inRange(c, 0x0962, 0x0963) ||
    inRange(c, 0x09be, 0x09c4) || inRange(c, 0x09c7, 0x09c8) || inRange(c, 0x09cb, 0x09cc) ||
    c === 0x09d7 || inRange(c, 0x09e2, 0x09e3)
  );
}

/** Generic "extend" characters that never start a cluster. */
function isExtend(c: number): boolean {
  return (
    isIndicMark(c) ||
    isJoiner(c) ||
    inRange(c, 0x0300, 0x036f) ||   // combining diacritics
    inRange(c, 0x20d0, 0x20ff) ||
    inRange(c, 0xfe00, 0xfe0f)      // variation selectors
  );
}

const isHigh = (c: number) => inRange(c, 0xd800, 0xdbff);
const isLow  = (c: number) => inRange(c, 0xdc00, 0xdfff);
const isSkinTone = (cp: number) => inRange(cp, 0x1f3fb, 0x1f3ff);
const isRegional = (cp: number) => inRange(cp, 0x1f1e6, 0x1f1ff);
const isPictographic = (cp: number) =>
  inRange(cp, 0x1f000, 0x1faff) || inRange(cp, 0x2600, 0x27bf) || inRange(cp, 0x2300, 0x23ff);

/** Start offset of the code point that ends at `end`. */
function cpStart(text: string, end: number): number {
  if (end >= 2 && isLow(text.charCodeAt(end - 1)) && isHigh(text.charCodeAt(end - 2))) return end - 2;
  return end - 1;
}

// ─── Clusters ────────────────────────────────────────────────────────────────

/**
 * Start offset of the user-perceived character (grapheme cluster) that ends
 * at `end`. Indic text uses the rules above; everything else uses
 * Intl.Segmenter when the engine has it (Hermes doesn't), with a fallback
 * that keeps surrogate pairs, combining marks, skin tones, flags and emoji
 * ZWJ sequences together.
 */
export function clusterStartBefore(text: string, end: number): number {
  if (end <= 0) return 0;
  const lastCp = text.codePointAt(cpStart(text, end))!;
  if (!isIndic(lastCp) && !isJoiner(lastCp)) {
    const seg = segmenterStart(text, end);
    if (seg !== null) return seg;
  }

  let i = end;
  for (;;) {
    // Trailing marks (and skin-tone modifiers) belong to the base before them.
    for (;;) {
      if (i <= 0) return 0;
      const s = cpStart(text, i);
      const cp = text.codePointAt(s)!;
      if (isExtend(cp) || isSkinTone(cp)) i = s;
      else break;
    }
    const b = cpStart(text, i);
    const cp = text.codePointAt(b)!;

    // Conjunct: consonant preceded by halant (optionally + ZWJ/ZWNJ).
    if (isIndicConsonant(cp)) {
      let k = b;
      while (k > 0 && isJoiner(text.charCodeAt(k - 1))) k--;
      if (k > 0 && isVirama(text.charCodeAt(k - 1))) { i = k; continue; }
    }
    // Emoji ZWJ sequence: pictograph preceded by ZWJ.
    if (isPictographic(cp) && b > 0 && text.charCodeAt(b - 1) === 0x200d) {
      // Continue from just before the pictograph; the loop then swallows the
      // ZWJ as an extend character and finds the previous pictograph.
      i = b;
      continue;
    }
    // Flags: regional indicators pair up from the start of the run.
    if (isRegional(cp)) {
      let run = 0;
      let p = b;
      while (p > 0) {
        const q = cpStart(text, p);
        if (isRegional(text.codePointAt(q)!)) { run++; p = q; } else break;
      }
      if (run % 2 === 1) return cpStart(text, b);
    }
    return b;
  }
}

type Segmenter = { segment: (s: string) => Iterable<{ segment: string; index: number }> };
let segmenter: Segmenter | null | undefined;

function segmenterStart(text: string, end: number): number | null {
  if (segmenter === undefined) {
    try {
      const Ctor = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => Segmenter }).Segmenter;
      segmenter = Ctor ? new Ctor(undefined, { granularity: 'grapheme' }) : null;
    } catch {
      segmenter = null;
    }
  }
  if (!segmenter) return null;
  // Only the tail matters; 64 code units covers any realistic cluster.
  const from = Math.max(0, end - 64);
  let last = from;
  for (const s of segmenter.segment(text.slice(from, end))) last = from + s.index;
  // Don't let the window cut a surrogate pair / cluster at its left edge.
  return last === from && from > 0 ? null : last;
}

/** Splits text into grapheme clusters (by walking backwards). */
export function graphemes(text: string): string[] {
  const out: string[] = [];
  let end = text.length;
  while (end > 0) {
    const start = clusterStartBefore(text, end);
    out.unshift(text.slice(start, end));
    end = start;
  }
  return out;
}

// ─── Indic vowel ↔ vowel-sign maps ───────────────────────────────────────────

/** Vowel sign → independent vowel. */
export const MATRA_TO_VOWEL: Record<string, string> = {
  // Devanagari
  'ा': 'आ', 'ि': 'इ', 'ी': 'ई', 'ु': 'उ', 'ू': 'ऊ', 'ृ': 'ऋ', 'ॄ': 'ॠ',
  'े': 'ए', 'ै': 'ऐ', 'ो': 'ओ', 'ौ': 'औ', 'ॅ': 'ऍ', 'ॉ': 'ऑ', 'ॢ': 'ऌ',
  // Bengali
  'া': 'আ', 'ি': 'ই', 'ী': 'ঈ', 'ু': 'উ', 'ূ': 'ঊ', 'ৃ': 'ঋ',
  'ে': 'এ', 'ৈ': 'ঐ', 'ো': 'ও', 'ৌ': 'ঔ',
};

/** Independent vowel → vowel sign. */
export const VOWEL_TO_MATRA: Record<string, string> = Object.fromEntries(
  Object.entries(MATRA_TO_VOWEL).map(([m, v]) => [v, m]),
);

// ─── Edits ───────────────────────────────────────────────────────────────────

function clampCaret(s: EditState): EditState {
  const caret = Math.max(0, Math.min(s.caret, s.text.length));
  return caret === s.caret ? s : { text: s.text, caret };
}

function splice(s: EditState, from: number, to: number, insert: string): EditState {
  return { text: s.text.slice(0, from) + insert + s.text.slice(to), caret: from + insert.length };
}

/**
 * Finds the cluster right before the caret and, when it starts with an Indic
 * consonant, returns where each kind of mark sits in it.
 */
function consonantClusterBefore(text: string, caret: number) {
  if (caret === 0) return null;
  // Only the last syllable matters (not the whole conjunct): base = the last
  // consonant whose marks run up to the caret.
  let i = caret;
  while (i > 0 && isIndicMark(text.charCodeAt(i - 1))) i--;
  if (i === 0) return null;
  const base = text.charCodeAt(i - 1);
  if (!isIndicConsonant(base)) return { start: i - 1, consonant: false, marks: text.slice(i, caret) };
  return { start: i - 1, consonant: true, marks: text.slice(i, caret) };
}

/** Orders marks the way Unicode expects: nukta, vowel sign / halant, bindus. */
function orderMarks(marks: string): string {
  const rank = (c: number) => (isNukta(c) ? 0 : isMatra(c) || isVirama(c) ? 1 : isBindu(c) ? 2 : 1);
  return Array.from(marks)
    .map((ch, idx) => ({ ch, idx, r: rank(ch.charCodeAt(0)) }))
    .sort((a, b) => a.r - b.r || a.idx - b.idx)
    .map((m) => m.ch)
    .join('');
}

/**
 * Inserts `input` at the caret. Single Indic marks compose with the syllable
 * before the caret (see the file comment). Returns null when the edit would
 * exceed `maxLength` (UTF-16 units, like TextInput).
 */
export function insertText(state: EditState, input: string, maxLength?: number): EditState | null {
  const s = clampCaret(state);
  const next = composeInsert(s, input);
  if (maxLength != null && maxLength >= 0 && next.text.length > maxLength) {
    // A replaced vowel sign keeps the same length, so only true growth is rejected.
    if (next.text.length > s.text.length) return null;
  }
  return next;
}

function composeInsert(s: EditState, input: string): EditState {
  const cps = Array.from(input);
  if (cps.length !== 1) return splice(s, s.caret, s.caret, input);
  const c = input.charCodeAt(0);
  if (!isIndicMark(c)) return splice(s, s.caret, s.caret, input);

  const cl = consonantClusterBefore(s.text, s.caret);

  if (isMatra(c)) {
    if (!cl || !cl.consonant) {
      // Nothing to attach to — type the independent vowel instead. (A vowel
      // sign after an independent vowel or a non-letter is never valid.)
      const vowel = MATRA_TO_VOWEL[input];
      return splice(s, s.caret, s.caret, vowel ?? input);
    }
    // Replace an existing vowel sign or halant on this syllable.
    const kept = Array.from(cl.marks).filter((m) => {
      const mc = m.charCodeAt(0);
      return !isMatra(mc) && !isVirama(mc);
    }).join('');
    return splice(s, cl.start + 1, s.caret, orderMarks(kept + input));
  }

  if (isVirama(c)) {
    if (!cl || !cl.consonant) return splice(s, s.caret, s.caret, input);
    const kept = Array.from(cl.marks).filter((m) => {
      const mc = m.charCodeAt(0);
      return !isMatra(mc) && !isVirama(mc) && !isBindu(mc);
    }).join('');
    return splice(s, cl.start + 1, s.caret, orderMarks(kept + input));
  }

  if (isNukta(c)) {
    if (!cl || !cl.consonant) return splice(s, s.caret, s.caret, input);
    if (Array.from(cl.marks).some((m) => isNukta(m.charCodeAt(0)))) return s; // already has one
    return splice(s, cl.start + 1, s.caret, orderMarks(cl.marks + input));
  }

  if (isBindu(c)) {
    if (!cl) return splice(s, s.caret, s.caret, input);
    const kept = Array.from(cl.marks).filter((m) => !isBindu(m.charCodeAt(0))).join('');
    return splice(s, cl.start + 1, s.caret, orderMarks(kept + input));
  }

  return splice(s, s.caret, s.caret, input);
}

/** Deletes the grapheme cluster before the caret (never half a conjunct). */
export function deleteBackward(state: EditState): EditState {
  const s = clampCaret(state);
  if (s.caret === 0) return s;
  const start = clusterStartBefore(s.text, s.caret);
  return splice(s, start, s.caret, '');
}

// ─── Auto-capitalisation (Latin layouts only) ────────────────────────────────

export type AutoCapitalize = 'none' | 'sentences' | 'words' | 'characters';

/** Whether the next Latin letter should be upper-case. */
export function shouldAutoShift(text: string, caret: number, mode: AutoCapitalize = 'sentences'): boolean {
  if (mode === 'none') return false;
  if (mode === 'characters') return true;
  const before = text.slice(0, caret);
  if (before.trim().length === 0) return true;
  if (mode === 'words') return /\s$/.test(before);
  return /[.!?।]\s+$/.test(before) || /\n\s*$/.test(before);
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/**
 * Text as drawn by the custom-keyboard display: trailing spaces become
 * no-break spaces (so text layout measures them and the caret moves), and a
 * trailing newline gets a zero-width space so the empty last line exists.
 */
export function displayText(value: string): string {
  let out = value.replace(/ +$/, (m) => ' '.repeat(m.length));
  if (out.endsWith('\n')) out += '​';
  return out;
}
