/**
 * Key layouts for the in-app keyboard (English QWERTY, Hindi and Bengali
 * grids) and the geometry used to draw and hit-test them.
 *
 * Pure data + math — no React Native imports.
 */
import { MATRA_TO_VOWEL, VOWEL_TO_MATRA } from './text-edit';

export type LayoutLang = 'en' | 'hi' | 'bn';
export const LAYOUT_LANGS: LayoutLang[] = ['en', 'hi', 'bn'];
/** Short label on the language key. */
export const LANG_SHORT: Record<LayoutLang, string> = { en: 'EN', hi: 'हि', bn: 'বা' };

export type PageId = 'letters' | 'vowels' | 'numbers' | 'symbols';

export type KeyKind =
  | 'char'       // types `value`
  | 'shift'
  | 'backspace'
  | 'space'
  | 'return'
  | 'page'       // switches to `page`
  | 'digits'     // toggles Western / native digits on the numbers page
  | 'lang'       // cycles EN / हि / বা
  | 'globe';     // switches the field to the system keyboard

export type KeyDef = {
  id:     string;
  kind:   KeyKind;
  /** What a char key types. */
  value?: string;
  /** Glyph drawn on the key (defaults to value). */
  label?: string;
  /** Typed on long-press (vowel ↔ vowel sign, nukta forms, native digit…). */
  alt?:   string;
  /** Width in grid units; `0` = take the row's remaining space. */
  w?:     number;
  page?:  PageId;
};

export type PageDef = {
  id:    PageId;
  /** Grid width in units (keys are 1 unit unless they say otherwise). */
  units: number;
  rows:  KeyDef[][];
};

// ─── Key helpers ─────────────────────────────────────────────────────────────

const DOTTED = '◌';
const isMarkLabel = (ch: string) => {
  const c = ch.charCodeAt(0);
  return (c >= 0x0900 && c <= 0x0903) || (c >= 0x093a && c <= 0x094f && c !== 0x093d) ||
    (c >= 0x0951 && c <= 0x0957) || c === 0x0962 || c === 0x0963 ||
    (c >= 0x0981 && c <= 0x0983) || c === 0x09bc || (c >= 0x09be && c <= 0x09cd && c !== 0x09ce) ||
    c === 0x09d7 || c === 0x09e2 || c === 0x09e3;
};

/** Combining marks are drawn on a dotted circle so they're legible alone. */
export function glyphLabel(value: string): string {
  return Array.from(value).length === 1 && isMarkLabel(value) ? DOTTED + value : value;
}

function ch(value: string, alt?: string, w?: number): KeyDef {
  return { id: `c:${value}`, kind: 'char', value, label: glyphLabel(value), alt, w };
}

/** Space-separated chars → keys. `alts` maps a char to its long-press alternate. */
function row(chars: string, alts: Record<string, string> = {}): KeyDef[] {
  return chars.split(' ').filter(Boolean).map((c) => ch(c, alts[c]));
}

const shift     = (): KeyDef => ({ id: 'shift', kind: 'shift', w: 1.5 });
const backspace = (w = 1.5): KeyDef => ({ id: 'backspace', kind: 'backspace', w });
const page = (to: PageId, label: string, w = 1.5): KeyDef => ({ id: `page:${to}`, kind: 'page', page: to, label, w });
const lang  = (): KeyDef => ({ id: 'lang', kind: 'lang', w: 1 });
const globe = (): KeyDef => ({ id: 'globe', kind: 'globe', w: 1 });
const space = (): KeyDef => ({ id: 'space', kind: 'space', w: 0 });
const ret   = (): KeyDef => ({ id: 'return', kind: 'return', w: 1.75 });

// ─── Long-press alternates ───────────────────────────────────────────────────

/** Consonant → nukta form. */
const NUKTA_HI: Record<string, string> = {
  'क': 'क़', 'ख': 'ख़', 'ग': 'ग़', 'ज': 'ज़', 'ड': 'ड़', 'ढ': 'ढ़', 'फ': 'फ़', 'य': 'य़', 'र': 'ऱ', 'न': 'ऩ',
};
const NUKTA_BN: Record<string, string> = { 'ড': 'ড়', 'ঢ': 'ঢ়', 'য': 'য়', 'ত': 'ৎ' };

/** Vowel ↔ vowel sign, both directions. */
const VOWEL_ALTS: Record<string, string> = { ...VOWEL_TO_MATRA, ...MATRA_TO_VOWEL };

const DIGITS = {
  en: '1 2 3 4 5 6 7 8 9 0',
  hi: '१ २ ३ ४ ५ ६ ७ ८ ९ ०',
  bn: '১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯ ০',
};

// ─── Pages ───────────────────────────────────────────────────────────────────

/** Letter-page label of the numbers page's "back to letters" key. */
const LETTERS_LABEL: Record<LayoutLang, string> = { en: 'ABC', hi: 'क ख', bn: 'ক খ' };

function bottomRow(l: LayoutLang, from: PageId): KeyDef[] {
  const toNumbers = from === 'letters' || from === 'vowels';
  const pageKey = toNumbers ? page('numbers', '123', 1.25) : page('letters', LETTERS_LABEL[l], 1.25);
  // Indic layouts end sentences with a danda; long-press gives a full stop.
  const stop = l === 'en' ? ch('.') : ch('।', '.');
  return [pageKey, lang(), globe(), ch(','), space(), stop, ret()];
}

function numbersPage(l: LayoutLang, native: boolean): PageDef {
  const western = DIGITS.en.split(' ');
  const local = l === 'en' ? western : DIGITS[l].split(' ');
  const shown = native ? local : western;
  const other = native ? western : local;
  const digitRow = shown.map((d, i) => ch(d, l === 'en' ? undefined : other[i]));
  const digitsKey: KeyDef[] = l === 'en'
    ? []
    : [{ id: 'digits', kind: 'digits', label: native ? '123' : DIGITS[l].split(' ').slice(0, 3).join(''), w: 1.5 }];
  return {
    id: 'numbers',
    units: 10,
    rows: [
      digitRow,
      row('- / : ; ( ) ₹ & @ "'),
      [page('symbols', '#+='), ...row(". , ? ! '"), ...(l === 'en' ? [] : [ch('॥')]), ...digitsKey, backspace(l === 'en' ? 1.5 : 1)],
      bottomRow(l, 'numbers'),
    ],
  };
}

function symbolsPage(l: LayoutLang): PageDef {
  return {
    id: 'symbols',
    units: 10,
    rows: [
      row('[ ] { } # % ^ * + ='),
      row('_ \\ | ~ < > $ € £ •'),
      [page('numbers', '123'), ...row('. , ? ! ’ …'), backspace()],
      bottomRow(l, 'symbols'),
    ],
  };
}

const EN_LETTERS: PageDef = {
  id: 'letters',
  units: 10,
  rows: [
    row('q w e r t y u i o p'),
    row('a s d f g h j k l'),
    [shift(), ...row('z x c v b n m'), backspace()],
    bottomRow('en', 'letters'),
  ],
};

const HI_LETTERS: PageDef = {
  id: 'letters',
  units: 11,
  rows: [
    row('ा ि ी ु ू े ै ो ौ ं ्', VOWEL_ALTS),
    row('क ख ग घ ङ च छ ज झ ञ', NUKTA_HI),
    row('ट ठ ड ढ ण त थ द ध न', NUKTA_HI),
    row('प फ ब भ म य र ल व श', NUKTA_HI),
    [page('vowels', 'अ आ'), ...row('ष स ह क्ष त्र ज्ञ ़ ः'), backspace()],
    bottomRow('hi', 'letters'),
  ],
};

const HI_VOWELS: PageDef = {
  id: 'vowels',
  units: 11,
  rows: [
    row('अ आ इ ई उ ऊ ऋ ए ऐ ओ औ', VOWEL_ALTS),
    row('ा ि ी ु ू ृ े ै ो ौ', VOWEL_ALTS),
    row('ं ः ँ ् ़ ॅ ॉ ऑ ॐ ऽ'),
    [page('letters', 'क ख'), ...row('ड़ ढ़ क़ ख़ ग़ ज़ फ़ श्र'), backspace()],
    bottomRow('hi', 'vowels'),
  ],
};

const BN_LETTERS: PageDef = {
  id: 'letters',
  units: 11,
  rows: [
    row('া ি ী ু ূ ৃ ে ৈ ো ৌ ্', VOWEL_ALTS),
    row('ক খ গ ঘ ঙ চ ছ জ ঝ ঞ', NUKTA_BN),
    row('ট ঠ ড ঢ ণ ত থ দ ধ ন', NUKTA_BN),
    row('প ফ ব ভ ম য র ল শ ষ', NUKTA_BN),
    [page('vowels', 'অ আ'), ...row('স হ ড় ঢ় য় ৎ ং ঁ'), backspace()],
    bottomRow('bn', 'letters'),
  ],
};

const BN_VOWELS: PageDef = {
  id: 'vowels',
  units: 11,
  rows: [
    row('অ আ ই ঈ উ ঊ ঋ এ ঐ ও ঔ', VOWEL_ALTS),
    row('া ি ী ু ূ ৃ ে ৈ ো ৌ', VOWEL_ALTS),
    row('ং ঃ ঁ ্ ় ৎ ঽ'),
    [page('letters', 'ক খ'), ...row('ক্ষ জ্ঞ শ্র ড় ঢ় য় ৳'), backspace()],
    bottomRow('bn', 'vowels'),
  ],
};

/** The page to show for a language. */
export function getPage(l: LayoutLang, id: PageId, nativeDigits = false): PageDef {
  if (id === 'numbers') return numbersPage(l, nativeDigits);
  if (id === 'symbols') return symbolsPage(l);
  if (l === 'en') return EN_LETTERS;
  if (id === 'vowels') return l === 'hi' ? HI_VOWELS : BN_VOWELS;
  return l === 'hi' ? HI_LETTERS : BN_LETTERS;
}

/** Indic glyphs are drawn in the system font (the app fonts are Latin-only). */
export function isIndicLabel(label: string): boolean {
  for (const c of label) {
    const cp = c.codePointAt(0)!;
    if ((cp >= 0x0900 && cp <= 0x09ff)) return true;
  }
  return false;
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** `uid` is unique within a page (the same char can appear twice). */
export type KeyRect = { uid: string; key: KeyDef; row: number; x: number; y: number; w: number; h: number };

/** Height of the key area for a language (its letters page sets it, so
 *  switching pages never changes the keyboard height). */
export function keyAreaHeight(l: LayoutLang): number {
  const rows = getPage(l, 'letters').rows.length;
  const rowHeight = rows <= 4 ? 52 : rows === 5 ? 47 : 43;
  return PAD_TOP + rows * rowHeight + PAD_BOTTOM;
}

const PAD_X = 3;
const PAD_TOP = 6;
const PAD_BOTTOM = 4;

/**
 * Lays out a page in a `width` × `height` key area. Each rect is the key's
 * full cell (the touch target); the drawn key is inset by a gap. Rows
 * narrower than the grid are centred.
 */
export function layoutPage(p: PageDef, width: number, height: number): KeyRect[] {
  const rowHeight = (height - PAD_TOP - PAD_BOTTOM) / p.rows.length;
  const unit = (width - PAD_X * 2) / p.units;
  const rects: KeyRect[] = [];
  p.rows.forEach((keys, r) => {
    const fixed = keys.reduce((s, k) => s + (k.w === 0 ? 0 : (k.w ?? 1)), 0);
    const flex = keys.filter((k) => k.w === 0).length;
    const free = Math.max(0, p.units - fixed);
    const flexW = flex ? free / flex : 0;
    const total = fixed + flexW * flex;
    let x = PAD_X + ((p.units - total) / 2) * unit;
    const y = PAD_TOP + r * rowHeight;
    keys.forEach((k, i) => {
      const w = (k.w === 0 ? flexW : (k.w ?? 1)) * unit;
      rects.push({ uid: `${r}.${i}.${k.id}`, key: k, row: r, x, y, w, h: rowHeight });
      x += w;
    });
  });
  return rects;
}

/** The key under a point: the touched row (clamped), then the key whose
 *  cell contains x, else the nearest one — so edge taps still land. */
export function hitTest(rects: KeyRect[], x: number, y: number): KeyRect | null {
  if (!rects.length) return null;
  const rowHeight = rects[0].h;
  const rows = rects[rects.length - 1].row + 1;
  const r = Math.max(0, Math.min(rows - 1, Math.floor((y - PAD_TOP) / rowHeight)));
  let best: KeyRect | null = null;
  let bestD = Infinity;
  for (const k of rects) {
    if (k.row !== r) continue;
    if (x >= k.x && x < k.x + k.w) return k;
    const d = x < k.x ? k.x - x : x - (k.x + k.w);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}
