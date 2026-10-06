/*
 * Small deterministic checks on the on-device model's replies (astro-gemma-v2,
 * CONTEXT_VERSION 2). Pure functions with no React Native imports, so they can be
 * unit-tested in Node. utils/ai.ts decides when to apply them.
 *
 * Known v2 failure modes (scratchpad v2-eval.md) they target:
 *  - follow-up turns that repeat the previous answer, often verbatim;
 *  - hi/bn replies that come out in English (Latin script), mostly chart
 *    readings in Bengali and Hinglish/Banglish questions;
 *  - pure greetings answered with a full chart dump.
 */

export type GuardLang = 'en' | 'hi' | 'bn';

/**
 * Retry a follow-up whose overlap (replyOverlap) with the previous answer is at
 * least this. On the v2 eval, unrelated answers for the same chart overlap at
 * most 0.36 (201 pairs); flagged follow-up repeats score 0.39-1.0, most >= 0.68.
 */
export const REPEAT_OVERLAP_MAX = 0.5;
/** Retry a hi/bn reply whose letters are less than this share native script. */
export const NATIVE_SCRIPT_MIN = 0.4;
/** Temperature for the single retry (the app's default is 0.3). */
export const RETRY_TEMPERATURE = 0.6;
/** Letters needed before the script check decides on a partial reply. */
export const SCRIPT_DECIDE_LETTERS = 24;
/** Words needed before the repetition check decides on a partial reply. */
export const REPEAT_DECIDE_WORDS = 16;

// Letters plus combining marks, so Devanagari/Bengali words keep their vowel signs.
const WORD_RE = /[\p{L}\p{M}\p{N}]+/gu;

export function words(text: string): string[] {
  return (text.toLowerCase().normalize('NFC').match(WORD_RE) ?? []);
}

function ngramSet(ws: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
}

function sentences(text: string): string[] {
  return text.split(/[.!?।॥\n]+/).map(s => words(s).join(' ')).filter(s => s.split(' ').length >= 4);
}

/**
 * How much of `reply` already appeared in `previous`, 0..1: the larger of
 *  - the share of the reply's word 4-grams found in the previous reply, and
 *  - the share of the reply's sentences (4+ words) found verbatim in it.
 * Short replies (< 4 words) use shorter n-grams. Markdown and punctuation are ignored.
 */
export function replyOverlap(reply: string, previous: string): number {
  const a = words(reply);
  const b = words(previous);
  if (a.length === 0 || b.length === 0) return 0;
  const n = Math.min(4, a.length);
  const ga = ngramSet(a, n);
  const gb = ngramSet(b, n);
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  const gram = ga.size ? hit / ga.size : 0;

  const sa = sentences(reply);
  const prev = ` ${b.join(' ')} `;
  const sent = sa.length ? sa.filter(s => prev.includes(` ${s} `)).length / sa.length : 0;
  return Math.max(gram, sent);
}

const NATIVE: Record<Exclude<GuardLang, 'en'>, RegExp> = {
  hi: /[ऀ-ॿ]/,
  bn: /[ঀ-৿]/,
};
const LATIN = /[A-Za-zÀ-ɏ]/;

/**
 * Share of letters in `text` written in the script of `lang` (Devanagari for
 * hi, Bengali for bn), 0..1. Counts base letters only (not vowel signs), so
 * the ratio is comparable to a Latin letter count. `ignore` words (e.g. the
 * user's Latin-script name) are left out. Returns 1 for English or no letters.
 */
export function nativeScriptRatio(text: string, lang: GuardLang, ignore: string[] = []): number {
  if (lang === 'en') return 1;
  let s = text;
  for (const w of ignore) if (w) s = s.split(w).join(' ');
  const native = NATIVE[lang];
  let nat = 0;
  let lat = 0;
  for (const ch of s) {
    if (/\p{L}/u.test(ch)) {
      if (native.test(ch)) nat++;
      else if (LATIN.test(ch)) lat++;
    }
  }
  const total = nat + lat;
  return total === 0 ? 1 : nat / total;
}

/** Letters (any script) in `text`, for deciding when a partial reply is long enough to judge. */
export function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length;
}

// ─── Greetings ────────────────────────────────────────────────────────────────

// Whole messages made only of these (after normalisation) are pure greetings.
const GREETING_PHRASES = [
  // English / romanised
  'hi', 'hello', 'hey', 'heya', 'hiya', 'helo', 'hellow', 'hlo', 'hola', 'yo', 'sup', 'howdy',
  'greetings', 'good morning', 'good afternoon', 'good evening', 'gm',
  'namaste', 'namaskar', 'namaskaram', 'nomoskar', 'nomoshkar', 'pranam', 'pranaam', 'ram ram',
  'jai shri krishna', 'radhe radhe', 'salam', 'assalamualaikum', 'sat sri akal',
  // Hindi
  'नमस्ते', 'नमस्कार', 'प्रणाम', 'हेलो', 'हैलो', 'हाय', 'हाई', 'राम राम', 'जय श्री कृष्ण', 'राधे राधे',
  'सुप्रभात', 'शुभ प्रभात', 'शुभ संध्या',
  // Bengali
  'নমস্কার', 'নমস্তে', 'প্রণাম', 'হ্যালো', 'হেলো', 'হাই', 'হায়', 'সুপ্রভাত', 'শুভ সকাল', 'শুভ সন্ধ্যা',
  'আসসালামু আলাইকুম', 'সালাম', 'জয় শ্রী কৃষ্ণ', 'রাধে রাধে',
];
// Words that may accompany a greeting without making it a question.
const GREETING_FILLER = new Set([
  'there', 'saga', 'ji', 'dear', 'friend', 'all', 'everyone', 'again', 'bro', 'sis', 'didi', 'dada', 'bhai',
  'सागा', 'जी', 'दोस्त', 'भाई', 'दीदी',
  'সাগা', 'জি', 'বন্ধু', 'দাদা', 'দিদি', 'ভাই',
]);
const GREETING_WORDS = new Set(GREETING_PHRASES.flatMap(p => p.split(' ')));

/**
 * True when the message is only a greeting ("hi", "Hello Saga!", "नमस्ते जी",
 * "নমস্কার 🙏", "heyyy") with no question or other content.
 */
export function isPureGreeting(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 40 || /[?？]/.test(text)) return false;
  // Collapse stretched Latin letters ("hiii", "heyyy", "hellooo").
  const ws = words(text).map((w) => {
    if (GREETING_WORDS.has(w) || !/^[a-z]+$/.test(w)) return w;
    const trailing = w.replace(/(.)\1+$/, '$1');
    return GREETING_WORDS.has(trailing) ? trailing : w.replace(/(.)\1+/g, '$1');
  });
  if (ws.length === 0 || ws.length > 5) return false;
  if (!ws.some(w => GREETING_WORDS.has(w))) return false;
  if (!ws.every(w => GREETING_WORDS.has(w) || GREETING_FILLER.has(w))) return false;
  // The greeting words must form whole phrases, not just share words with them
  // ("good" alone, "ram" alone are not greetings).
  const rest = ` ${ws.filter(w => !GREETING_FILLER.has(w)).join(' ')} `;
  let left = rest;
  for (const p of [...GREETING_PHRASES].sort((x, y) => y.length - x.length)) {
    left = left.split(` ${p} `).join('  ');
  }
  return left.trim() === '';
}

// ─── Chart reading seeds ──────────────────────────────────────────────────────

/**
 * Text placed at the start of the model's reading turn to steer it into the
 * right script. Bengali readings come out in English 9-11/12 times unseeded;
 * "SUN: স্বভাবে " gave Bengali in 11/12 (scratchpad seed.py). Hindi readings
 * are right 11/12 unseeded, so Hindi is seeded only on the retry. Returns ''
 * for no seed. parseReading reads the "SUN:" line, so seeds keep that key.
 */
export function readingSeed(lang: GuardLang, attempt: 0 | 1): string {
  if (lang === 'bn') return attempt === 0 ? 'SUN: স্বভাবে ' : 'SUN: তিনি ';
  if (lang === 'hi') return attempt === 0 ? '' : 'SUN: स्वभाव से ';
  return '';
}

const READING_KEYS = /^[#*\s]*(SUN|MOON|RISING|NAKSHATRA|DASHA|OVERVIEW)[:\s*_]+/gim;

/** nativeScriptRatio of a reading, ignoring its Latin "SUN:"-style keys and the person's name. */
export function readingScriptRatio(text: string, lang: GuardLang, firstName: string): number {
  return nativeScriptRatio(text.replace(READING_KEYS, ''), lang, [firstName]);
}

// ─── Guarded generation ───────────────────────────────────────────────────────
//
// A guarded reply is held back (the chat bubble keeps showing "thinking…")
// until the partial reply passes the checks, then streams live as usual:
//  - script (hi/bn): decided after SCRIPT_DECIDE_LETTERS letters; a mostly
//    Latin reply is stopped right there and retried;
//  - repetition (follow-ups): decided after REPEAT_DECIDE_WORDS words; if that
//    prefix already overlaps the previous answer, the whole reply is held and
//    judged when it ends.
// A failing reply is regenerated once at RETRY_TEMPERATURE; if the retry fails
// too, the better of the two is shown in one go. Text on screen is never
// replaced, and there is never more than one retry.

export type ReplyGuard = {
  lang: GuardLang;
  /** The previous assistant reply in the thread (repetition check), if any. */
  previous?: string;
  /** Latin-script words a hi/bn reply may contain (names). */
  ignore: string[];
};

/**
 * One model run: calls `onToken` per token (returning true stops the run) and
 * resolves when generation ends. `temperature` undefined = the app default.
 */
export type GenerateFn = (onToken: (token: string) => boolean | void, temperature?: number) => Promise<unknown>;

type Attempt = { text: string; released: boolean; stoppedLatin: boolean };

export async function runGuarded(generate: GenerateFn, guard: ReplyGuard, emit: (text: string) => void): Promise<void> {
  const checkScript = guard.lang !== 'en';
  const previous = guard.previous;
  const scriptRatio = (t: string) => nativeScriptRatio(t, guard.lang, guard.ignore);
  const overlap = (t: string) => (previous ? replyOverlap(t, previous) : 0);
  const scriptBad = (a: Attempt) =>
    checkScript && (a.stoppedLatin || (letterCount(a.text) >= 8 && scriptRatio(a.text) < NATIVE_SCRIPT_MIN));
  const repeatBad = (a: Attempt) => !!previous && overlap(a.text) >= REPEAT_OVERLAP_MAX;

  // `final`: the last try, which is never stopped early (a Latin reply is held
  // to the end so there is always a whole reply to show).
  const attempt = async (temperature?: number, final = false): Promise<Attempt> => {
    const a: Attempt = { text: '', released: false, stoppedLatin: false };
    let scriptDone = !checkScript;
    let repeatDone = !previous;
    let repeatSuspect = false;
    let hold = false;
    await generate((token) => {
      a.text += token;
      if (a.released) {
        emit(token);
        return;
      }
      if (!scriptDone && letterCount(a.text) >= SCRIPT_DECIDE_LETTERS) {
        if (scriptRatio(a.text) < NATIVE_SCRIPT_MIN) {
          if (!final) {
            a.stoppedLatin = true;
            return true; // stop now; the reply is retried
          }
          hold = true;
        }
        scriptDone = true;
      }
      if (!repeatDone && !repeatSuspect && words(a.text).length >= REPEAT_DECIDE_WORDS) {
        if (overlap(a.text) < REPEAT_OVERLAP_MAX) repeatDone = true;
        else repeatSuspect = true; // hold to the end and judge the whole reply
      }
      if (scriptDone && repeatDone && !hold) {
        a.released = true;
        emit(a.text);
      }
    }, temperature);
    return a;
  };

  const first = await attempt();
  if (first.released) return;
  if (!scriptBad(first) && !repeatBad(first)) {
    emit(first.text);
    return;
  }

  let second: Attempt;
  try {
    second = await attempt(RETRY_TEMPERATURE, true);
  } catch (err) {
    if (first.stoppedLatin) throw err;
    emit(first.text);
    return;
  }
  if (second.released) return;
  if (first.stoppedLatin || (!scriptBad(second) && !repeatBad(second))) {
    emit(second.text);
    return;
  }
  // Both failed: prefer the right script, then the one that repeats less.
  const rank = (a: Attempt) => (scriptBad(a) ? 2 : 0) + overlap(a.text);
  emit(rank(second) < rank(first) ? second.text : first.text);
}
