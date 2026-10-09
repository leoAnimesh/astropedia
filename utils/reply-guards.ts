/*
 * Small deterministic checks on the on-device model's replies (astro-gemma-v2
 * and v2.1, CONTEXT_VERSION 2). Pure functions with no React Native imports, so
 * they can be unit-tested in Node. utils/ai.ts decides when to apply them.
 *
 * Known failure modes (scratchpad v2-eval.md, v21-eval.md) they target:
 *  - follow-up turns that repeat the previous answer, often verbatim;
 *  - hi/bn replies that come out in English (Latin script), mostly chart
 *    readings in Bengali and Hinglish/Banglish questions;
 *  - pure greetings answered with a full chart dump;
 *  - "when" questions answered without any month or year, or (v2.1) with only
 *    the current month (questions the timing engine has no window for; the
 *    engine's windows are checked and repaired by utils/agent/verify.ts);
 *  - (v2.1) baby's-sex and partner-name questions answered instead of declined;
 *  - (v2.1) invented "about N months from now" countdowns, wrong 21 of 21 times;
 *  - (v2.1) health / legal answers without "see a doctor / lawyer".
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
/**
 * The repetition check also waits for two whole sentences (or this many
 * words): a repeat often opens with one fresh sentence ("You're asking about
 * the right place…") and then copies the earlier answer, which the first 16
 * words alone can't show (overlap 0.00 at 16 words, 0.76 for the whole reply
 * in the Career-guru report of 2026-10-09).
 */
export const REPEAT_HOLD_WORDS = 40;

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
 * right script. astro-gemma-v21 writes Bengali and Hindi readings in the right
 * script unseeded (12/12 each; v2 needed "SUN: স্বভাবে ", which makes v2.1
 * open awkwardly), so the first attempt is unseeded in every language and only
 * the retry after a wrong-script reading is seeded. Returns '' for no seed.
 * parseReading reads the "SUN:" line, so seeds keep that key.
 */
export function readingSeed(lang: GuardLang, attempt: 0 | 1): string {
  if (lang === 'bn') return attempt === 0 ? '' : 'SUN: তিনি ';
  if (lang === 'hi') return attempt === 0 ? '' : 'SUN: स्वभाव से ';
  return '';
}

const READING_KEYS = /^[#*\s]*(SUN|MOON|RISING|NAKSHATRA|DASHA|OVERVIEW)[:\s*_]+/gim;

/** nativeScriptRatio of a reading, ignoring its Latin "SUN:"-style keys and the person's name. */
export function readingScriptRatio(text: string, lang: GuardLang, firstName: string): number {
  return nativeScriptRatio(text.replace(READING_KEYS, ''), lang, [firstName]);
}

// ─── Dates and timing questions ───────────────────────────────────────────────

const MONTH_NAMES: Record<GuardLang, string[][]> = {
  // Index 0 = January. English full names; short forms are matched separately.
  en: [['january'], ['february'], ['march'], ['april'], ['may'], ['june'], ['july'], ['august'],
    ['september'], ['october'], ['november'], ['december']],
  hi: [['जनवरी'], ['फरवरी', 'फ़रवरी'], ['मार्च'], ['अप्रैल', 'अप्रेल'], ['मई'], ['जून'], ['जुलाई'], ['अगस्त'],
    ['सितंबर', 'सितम्बर'], ['अक्टूबर', 'अक्तूबर'], ['नवंबर', 'नवम्बर'], ['दिसंबर', 'दिसम्बर']],
  bn: [['জানুয়ারি', 'জানুয়ারী'], ['ফেব্রুয়ারি', 'ফেব্রুয়ারী'], ['মার্চ'], ['এপ্রিল'], ['মে'], ['জুন'], ['জুলাই'],
    ['আগস্ট', 'অগাস্ট', 'অগস্ট'], ['সেপ্টেম্বর'], ['অক্টোবর'], ['নভেম্বর'], ['ডিসেম্বর']],
};
const EN_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_INDEX = new Map<string, number>();
for (const lang of ['en', 'hi', 'bn'] as const) {
  MONTH_NAMES[lang].forEach((names, i) => names.forEach(n => MONTH_INDEX.set(n.normalize('NFC'), i + 1)));
}
EN_SHORT.forEach((n, i) => MONTH_INDEX.set(n, i + 1));
MONTH_INDEX.set('sept', 9);
// Bengali case endings on month names ("নভেম্বরে", "জুনের").
const BN_MONTH_SUFFIX = ['ের', 'এর', 'র', 'ে', 'েই', 'ই', 'ও'];

/** Devanagari/Bengali digits → Western digits. */
export function westernDigits(text: string): string {
  return text.replace(/[०-९]/g, d => String(d.charCodeAt(0) - 0x966))
    .replace(/[০-৯]/g, d => String(d.charCodeAt(0) - 0x9e6));
}

/**
 * Western digits → Devanagari (hi) / Bengali (bn) digits; English unchanged.
 * The pure twin of utils/i18n.ts localizeDigits, for user-visible text the
 * agent layers write (templates, repairs, model replies). Model-bound text
 * (prompts, history, chip questions) stays in Western digits: westernDigits.
 */
export function nativeDigits(text: string, lang: GuardLang): string {
  if (lang === 'en') return text;
  const zero = lang === 'bn' ? 0x9e6 : 0x966;
  return text.replace(/[0-9]/g, d => String.fromCharCode(zero + Number(d)));
}

/** nativeDigits for text in whatever script it is written in (hi for Devanagari, bn for Bengali). */
export function nativeDigitsByScript(text: string): string {
  if (/[ঀ-৿]/.test(text)) return nativeDigits(text, 'bn');
  if (/[ऀ-ॣ०-ॿ]/.test(text)) return nativeDigits(text, 'hi');
  return text;
}

export type FoundDate = { month: number | null; year: number | null; index: number };

/**
 * Month-year, month-only and year-only mentions in a reply (any of en/hi/bn,
 * Western or native digits), in order. "May" and short English months count
 * only with a year after them ("you may" is not a date); English month names
 * must be capitalised.
 */
export function findDates(text: string): FoundDate[] {
  const t = westernDigits(text.normalize('NFC'));
  const toks = [...t.matchAll(/[\p{L}\p{M}]+|\d+/gu)].map(m => ({ s: m[0], i: m.index ?? 0 }));
  const isYear = (s?: string) => !!s && /^(19|20)\d\d$/.test(s);
  const out: FoundDate[] = [];
  const usedYear = new Set<number>();
  toks.forEach((tk, k) => {
    let key = tk.s;
    const latin = /^[A-Za-z]+$/.test(key);
    if (latin) {
      if (!/^[A-Z]/.test(key)) return;
      key = key.toLowerCase();
    } else if (!MONTH_INDEX.has(key)) {
      const suf = BN_MONTH_SUFFIX.find(x => key.endsWith(x) && MONTH_INDEX.has(key.slice(0, -x.length)));
      if (suf) key = key.slice(0, -suf.length);
    }
    const month = MONTH_INDEX.get(key);
    if (!month) return;
    let year: number | null = null;
    for (let j = k + 1; j <= k + 2 && j < toks.length; j++) {
      if (isYear(toks[j].s)) { year = Number(toks[j].s); usedYear.add(j); break; }
    }
    if (latin && year == null && (EN_SHORT.includes(key) || key === 'sept')) return;
    out.push({ month, year, index: tk.i });
  });
  toks.forEach((tk, k) => {
    if (!usedYear.has(k) && isYear(tk.s)) out.push({ month: null, year: Number(tk.s), index: tk.i });
  });
  return out.sort((a, b) => a.index - b.index);
}

/** True when the text mentions a month or a year (any script). */
export function hasDate(text: string): boolean {
  return findDates(text).length > 0;
}

const TIMING_EN = /\b(when|how long|how soon|what date|which date|what month|which month|what year|which year|exact date|kab|kobe)\b/i;
const TIMING_PHRASES = [
  'कितने समय', 'कितना समय', 'कितने दिन', 'किस महीने', 'किस साल', 'किस तारीख', 'कौन से महीने', 'कौन-से महीने', 'कौनसे महीने', 'तारीख',
  'কত দিন', 'কতদিন', 'কত সময়', 'কতক্ষণ', 'কোন মাস', 'কোন সাল', 'কোন বছর', 'কোন তারিখ', 'তারিখ',
];
const TIMING_WORDS = new Set(['कब', 'কবে', 'কখন']);

/**
 * True when a question asks when something will happen ("When will I marry?",
 * "When exactly?", "शादी कब होगी?", "কতদিন লাগবে?", "kab hogi").
 */
export function isTimingQuestion(question: string): boolean {
  const q = question.normalize('NFC');
  if (TIMING_EN.test(q)) return true;
  if (TIMING_PHRASES.some(p => q.includes(p))) return true;
  return words(q).some(w => TIMING_WORDS.has(w));
}

/**
 * How a reply's dates relate to `today` (YYYY-MM-DD, the prompt's "Today:"):
 *  - 'none': no month or year at all;
 *  - 'current': no date after the current month, and at least one that is the
 *    current month (or the current year alone) — "by October 2026" said in
 *    October 2026 answers nothing;
 *  - 'ok': anything else (a later date, or only past dates).
 * A month without a year counts as later unless it is the current month.
 * Without a valid `today`, any date is 'ok'.
 */
export function dateStatus(text: string, today?: string): 'none' | 'current' | 'ok' {
  const dates = findDates(text);
  if (dates.length === 0) return 'none';
  const m = /^(\d{4})-(\d{2})/.exec(today ?? '');
  if (!m) return 'ok';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  let current = false;
  for (const d of dates) {
    if (d.year == null) {
      if (d.month !== mo) return 'ok';
      current = true;
    } else if (d.year > y || (d.year === y && d.month != null && d.month > mo)) {
      return 'ok';
    } else if (d.year === y && (d.month == null || d.month === mo)) {
      current = true;
    }
  }
  return current ? 'current' : 'ok';
}

// ─── Questions answered without the model ─────────────────────────────────────

const nfc = (s: string) => s.normalize('NFC');
// Devanagari ड/ढ with or without nukta (NFC keeps ड़ decomposed), Bengali য় likewise.
const DA = 'ड़?';
const KIND_HI = '(?<!(?:कैसा|कैसी|कैसे|कौन सा|कौन सी|कौनसा|कौनसी|वाला|वाली|किस) )';
const KIND_BN = '(?<!(?:কেমন|কোন|কী রকম|কিরকম|কি রকম) )';
const KIND_EN = '(?<!\\b(?:kaisa|kaisi|kaise|kaun sa|kaun si|kaunsa|kaunsi|wala|wali|kemon|kon) )';

const CHILD_SEX = new RegExp(nfc([
  // English
  '\\b(?:boy|girl|son|daughter) or (?:a )?(?:boy|girl|son|daughter)\\b', '\\bis there a son in my (?:chart|kundli|horoscope)\\b', '\\bson yog',
  "\\b(?:baby|child|kid|f(?:o)?etus)(?:'s)? (?:gender|sex)\\b",
  '\\b(?:gender|sex) of (?:my|our|the|her) (?:first |next |second |third |unborn )?(?:baby|child|kid)',
  '\\b(?:will|would) (?:it|he or she|my (?:first |next |second |third )?(?:baby|child|kid)|our (?:first |next |second )?(?:baby|child|kid)) be a (?:baby )?(?:boy|girl|son|daughter)\\b',
  '\\b(?:will|would|can|could|shall) (?:i|we) (?:have|get|be blessed with|give birth to) a (?:baby )?(?:boy|girl|son|daughter)\\b',
  "\\b(?:is it|it'?s|it will be) a (?:baby )?(?:boy|girl)\\b",
  // Hinglish / Banglish
  '\\b(?:ladka|ladki|beta|beti) (?:ya|or|yaa) (?:ladka|ladki|beta|beti)\\b',
  `${KIND_EN}\\b(?:ladka|beta|putra) (?:hoga|paida)`,
  `${KIND_EN}\\b(?:ladki|beti) (?:hogi|paida)`,
  '\\b(?:chele|cheley|meye) (?:na|naki|ki|ba|othoba) (?:chele|cheley|meye)\\b',
  `${KIND_EN}\\b(?:chele|cheley|meye) hobe\\b`,
  // Hindi
  `(?:ल${DA}का|ल${DA}की|बेटा|बेटी|पुत्र|पुत्री) (?:या|अथवा) (?:ल${DA}का|ल${DA}की|बेटा|बेटी|पुत्र|पुत्री)`,
  `${KIND_HI}(?:ल${DA}का|बेटा|पुत्र) (?:होगा|पैदा)`,
  `${KIND_HI}(?:ल${DA}की|बेटी|पुत्री) (?:होगी|पैदा)`,
  'पुत्र प्राप्ति|पुत्र योग|(?:बच्चे|शिशु|संतान|सन्तान|गर्भ) (?:का|के) लिंग',
  // Bengali
  '(?:ছেলে|মেয়ে|পুত্র|কন্যা) (?:না|নাকি|কি|কী|বা|অথবা) (?:ছেলে|মেয়ে|পুত্র|কন্যা)',
  `${KIND_BN}(?:ছেলে|মেয়ে) (?:হবে|হবেনা|সন্তান হবে)`,
  '(?:পুত্র|কন্যা) ?সন্তান (?:হবে|জন্ম|লাভ)|(?:সন্তানের|বাচ্চার|শিশুর|গর্ভের) লিঙ্গ',
].join('|')), 'i');

const PARTNER = '(?:future |would-?be |next |life )?(?:wife|husband|spouse|partner|girlfriend|boyfriend|soul ?mate|fianc[eé]e?|bride|groom)';
const PARTNER_NAME = new RegExp(nfc([
  // English
  `\\b${PARTNER}(?:'s|s'|s)? (?:name|initials?|first letter)(?!\\s+(?:is|was)\\b)`,
  `\\b(?:name|initials?|first letter|starting letter) of (?:my |our |the |her |his )?${PARTNER}`,
  "\\b(?:name|initials?|first letter) of (?:the )?(?:person|girl|boy|guy|man|woman|one) (?:i|i'?ll|i will|i'?m going to) marry",
  "\\bwhat (?:will|would) (?:his|her|their) name be\\b|\\b(?:his|her|their) name (?:will )?(?:start|begin)s? with\\b|\\bwhat(?:'s| is| will be) (?:his|her) name\\b",
  // Hinglish / Banglish
  '\\b(?:naam|nam) (?:kya|kia) (?:hoga|hogi|hogaa)\\b|\\b(?:naam|nam) ka (?:pehla|pahla|first) (?:akshar|letter|word)\\b|\\b(?:naam|nam) kis (?:akshar|letter)',
  '\\b(?:naam|nam) ki hobe\\b|\\b(?:naam|nam)er (?:prothom|first) (?:okkhor|akshar|letter)',
  // Hindi
  'नाम क्या होगा|नाम क्या होगी|नाम किस अक्षर|नाम का पहला अक्षर|नाम का पहला लेटर',
  `(?:उसका|उसकी|उनका|पति|पत्नी|जीवनसाथी|जीवन साथी|बीवी|पार्टनर|दूल्हे|दुल्हन|ल${DA}की|ल${DA}के) (?:का |की )?नाम (?:क्या|कौन|किस)`,
  // Bengali
  'নাম (?:কী|কি) হবে|নামের প্রথম অক্ষর|নামের আদ্যক্ষর|নাম কোন অক্ষর',
  '(?:বরের|বউয়ের|বৌয়ের|বউএর|স্বামীর|স্ত্রীর|জীবনসঙ্গীর|পার্টনারের|তার|ওর|ওঁর|তাঁর) নাম (?:কী|কি|কোন)',
].join('|')), 'i');

/**
 * Questions Saga answers with a canned reply instead of the model (v2.1 answers
 * the baby's-sex question "likely to be a boy", and partner-name questions
 * aren't declined in Bengali):
 *  - 'childSex': will the baby be a boy or a girl (en/hi/bn, Hinglish/Banglish);
 *  - 'partnerName': a future partner's name or initial.
 */
export function cannedQuestion(question: string): 'childSex' | 'partnerName' | null {
  const q = nfc(question).toLowerCase();
  if (CHILD_SEX.test(q)) return 'childSex';
  if (PARTNER_NAME.test(q)) return 'partnerName';
  return null;
}

// ─── Crisis (self-harm / suicide) ─────────────────────────────────────────────
//
// A message about wanting to die or hurt oneself never goes to the model: the
// chat answers with a fixed, kind reply carrying Indian helplines
// (chat:safety.crisis: Tele-MANAS 14416, emergency 112). English, Hindi,
// Bengali and the Latin-script Hinglish / Banglish people actually type.
// Deliberately broad: a false positive costs one gentle helpline message.

const CRISIS_EN = [
  'suicid(?:e|al)', 'kill(?:ing)? my ?self', 'end(?:ing)? (?:my|it) (?:life|all)', 'end it all', '(?:want to|wanna) end everything',
  'take my (?:own )?life', 'taking my (?:own )?life', "(?<!(?:don'?t|do not|never) )(?:want(?:na)? to|wanna) die", 'wish i (?:was|were) dead',
  "(?:don'?t|do not|dont) want to (?:live|be alive|exist)", 'no reason to live', 'better off dead',
  'self[- ]?harm', '(?:hurt|harm|cut)(?:ting)? my ?self', 'overdose',
  // Hinglish
  'khud ?kushi', 'aatma ?hatya', 'atma ?hatya', 'marna chaht[aie]', 'mar ?ja(?:a)?na chaht[aie]',
  'jee?na nahi(?:n)? chaht[aie]', 'zind[ae]gi khatam', 'jaan de d[ou]o?n?',
  // Banglish
  'atm[ao] ?hott?(?:y)?a', 'more jete chai', 'more jete ichh?e', 'morte chai', 'morte ichh?e', 'bachte chai ?na', 'banchte chai ?na', 'bachte ichh?e kore na',
];
const CRISIS_HI = [
  'आत्महत्या', 'ख़ुदकुशी', 'खुदकुशी', 'मरना चाहत', 'मर जाना चाहत', 'मर जाऊं', 'मर जाऊँ', 'मरने का मन', 'मरने को जी',
  'जीना नहीं चाहत', 'जीने का मन नहीं', 'जान दे दूं', 'जान दे दूँ', 'अपनी जान ले',
  'ज़िंदगी ख़त्म', 'जिंदगी खत्म', 'ज़िन्दगी ख़त्म', 'जिन्दगी खत्म', 'खुद को नुकसान', 'ख़ुद को नुक़सान', 'खुद को चोट',
];
const CRISIS_BN = [
  'আত্মহত্যা', 'মরে যেতে চাই', 'মরে যেতে ইচ্ছে', 'মরতে চাই', 'বাঁচতে চাই না', 'বাঁচতে ইচ্ছে করে না', 'বাঁচার ইচ্ছে নেই',
  'নিজেকে শেষ করে', 'নিজেকে আঘাত', 'নিজের ক্ষতি করতে', 'জীবন শেষ করে দি', 'সুইসাইড',
];
const CRISIS = new RegExp(nfc([
  `\\b(?:${CRISIS_EN.join('|')})`,
  ...CRISIS_HI, ...CRISIS_BN,
].join('|')), 'i');

/** True when a message talks about suicide or self-harm (en / hi / bn / Hinglish / Banglish). */
export function isCrisisMessage(message: string): boolean {
  return CRISIS.test(nfc(message).toLowerCase().replace(/[’`]/g, "'"));
}

// ─── Countdown phrases ────────────────────────────────────────────────────────
//
// v2.1 adds "meaning within about N months" after a month-year (bn 19/35
// turns, hi 4/35) and gets the arithmetic wrong almost every time, so the
// clause is removed and the absolute month-year kept.

const N = '(?:\\d+|[०-९]+|[০-৯]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a few|a couple of|a|an)';
const EN_UNIT = '(?:months?|years?|weeks?)';
const EN_CUE = '(?:about|roughly|around|approximately|approx\\.?|nearly|almost|some|just|only|maybe|perhaps)';
const EN_LEAD = "(?:(?:that'?s|that is|which is|i\\.e\\.,?|meaning|so)\\s+)?";
const NOT_AGE = '(?!\\s*(?:old|of age|ago|of (?:effort|work|savings|practice)))';
const COUNTDOWN_EN = [
  // "in about 5 months (from now)", "within roughly 2 years"
  `${EN_LEAD}\\b(?:in|within)\\s+${EN_CUE}\\s+${N}\\s+${EN_UNIT}(?:\\s+(?:from now|from today|away(?!\\s+from)|later|time)|'s time)?\\b${NOT_AGE}`,
  // "about 5 months from now", "in 5 months from now", "5 months away"
  `${EN_LEAD}\\b(?:(?:in|within)\\s+|${EN_CUE}\\s+)?${N}\\s+${EN_UNIT}\\s+(?:from now|from today|away(?!\\s+from))\\b`,
  // "in 5 months' time"
  `${EN_LEAD}\\bin\\s+${N}\\s+${EN_UNIT}(?:'s?|\\s+)\\s*time\\b`,
  // ", about 5 months." closing a clause after a date
  `(?:,|[—–])\\s*${EN_CUE}\\s+${N}\\s+${EN_UNIT}(?=\\s*[.!?—–,;)]|\\s*$)`,
];
// Longest alternatives first ("सालों" before "साल"), so a match never ends mid-word.
const HI_UNIT = '(?:महीनों|महीने|महीना|माह|सालों|साल|वर्षों|वर्ष|हफ्तों|हफ़्तों|हफ्ते|हफ़्ते|सप्ताहों|सप्ताह)';
const HI_CUE = '(?:करीब|क़रीब|लगभग|तकरीबन|तक़रीबन|अंदाज़न|अंदाजन|कोई)';
const HI_AFTER = '(?:में|के अंदर|के भीतर|के बाद|बाद)';
const COUNTDOWN_HI = [
  `(?:यानी|याने|मतलब|अर्थात|यानि)\\s+(?:${HI_CUE}\\s+)?(?:अब से\\s+|आज से\\s+)?${N}\\s+${HI_UNIT}(?:\\s+(?:${HI_AFTER}|तक))?(?![ऀ-ॣॱ-ॿ])`,
  `(?:${HI_CUE}\\s+|अब से\\s+|आज से\\s+)(?:${HI_CUE}\\s+)?${N}\\s+${HI_UNIT}\\s+${HI_AFTER}(?![ऀ-ॣॱ-ॿ])`,
];
const BN_UNIT = '(?:মাসের|মাসে|মাস|বছরের|বছরে|বছর|সপ্তাহের|সপ্তাহে|সপ্তাহ)';
const BN_CUE = '(?:প্রায়|মোটামুটি|আনুমানিক|আন্দাজ|মাত্র)';
const BN_AFTER = '(?:মধ্যেই|মধ্যে|পরেই|পরে|পর|বাদে|নাগাদ|ভিতরে|ভেতরে)';
const COUNTDOWN_BN = [
  `(?:মানে|অর্থাৎ|যার মানে)\\s+(?:${BN_CUE}\\s+)?(?:এখন থেকে\\s+|আজ থেকে\\s+|আর\\s+)?${N}\\s*-?${BN_UNIT}(?:\\s+${BN_AFTER})?(?![ঀ-ৣ])`,
  `(?:${BN_CUE}\\s+|এখন থেকে\\s+|আজ থেকে\\s+)(?:${BN_CUE}\\s+)?${N}\\s*-?${BN_UNIT}\\s*${BN_AFTER}(?![ঀ-ৣ])`,
];
const COUNTDOWN = new RegExp(nfc([...COUNTDOWN_EN, ...COUNTDOWN_HI, ...COUNTDOWN_BN].join('|')), 'gi');
const SENT_END = '.!?।॥';

/**
 * Removes relative-time countdowns ("about 5 months from now", "यानी करीब 5
 * महीने में", "মানে প্রায় ২ মাসের মধ্যে", Western or native digits) and tidies
 * the punctuation around them; the month-year next to them stays. Text without
 * a countdown is returned unchanged (leading/trailing whitespace included, so
 * it is safe on streamed chunks).
 */
export function stripCountdowns(text: string): string {
  const src = nfc(text);
  if (src.search(COUNTDOWN) < 0) return text;
  let out = src.replace(COUNTDOWN, '\u0000');
  out = out
    // "(\u0000)" or "** \u0000 **" left empty
    .replace(/\(\s*\u0000\s*\)/g, '\u0000')
    .replace(/\*\*\s*\u0000\s*\*\*/g, '\u0000')
    // separator + removed clause before the end of a sentence: drop both
    .replace(new RegExp(`[ \\t]*[,;—–-]?[ \\t]*\\u0000[ \\t]*(?=[${SENT_END}]|\\n|$)`, 'g'), '')
    // at the start of a sentence: drop the clause and its trailing comma
    .replace(new RegExp(`(^|[${SENT_END}\\n][ \\t]*)\\u0000[ \\t]*[,;—–]?[ \\t]*(\\p{Ll})?`, 'gu'),
      (_m, lead: string, ch?: string) => lead + (ch ? ch.toUpperCase() : ''))
    // mid-sentence: keep one separator
    .replace(/([ \t]*[,;—–][ \t]*)\u0000[ \t]*(?:[,;—–][ \t]*)?/g, ', ')
    .replace(/[ \t]*\u0000[ \t]*(?:([,;—–])[ \t]*)?/g, (_m, sep?: string) => (sep ? `${sep} ` : ' '))
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]{2,}/g, ' ');
  return out;
}

// ─── Health and legal questions ───────────────────────────────────────────────

const HEALTH_Q = new RegExp(nfc([
  '\\b(?:health|healthy|ill|illness|sick|sickness|disease|symptoms?|fever|surgery|hospital|hospitali[sz]ed|cancer|tumou?r|diabetes|blood pressure|bp',
  'heart (?:attack|disease|problem|condition|surgery)|(?:chest|back|stomach|body|joint|knee|neck|leg|period|tooth) ?pains?|stomach ?ache|headaches?|backache',
  'pregnan\\w*|conceive|conceiving|miscarriage|infertil\\w*|ivf|depress\\w*|anxiety|panic attacks?|mental health|suicid\\w*|self[- ]harm',
  // "medicine" alone is also a field of study ("Is medicine the right field for me?"): only medicine taken counts.
  'medicines|(?:take|taking|took|my|his|her|the) medicine|medicine (?:for|dose)|medication|treatment|therapy|injur\\w*|infection|thyroid|pcos|pcod|migraine|insomnia|asthma|kidney|liver|stroke|paralysis|diagnos\\w*',
  'bimari|bimaari|beemari|bimar|bimaar|beemar|dard|bukhar|bukhaar|sehat|tabiyat|tabiyet|ilaj|ilaaj|dawai|davai',
  'osukh|asukh|osustho|asustho|byatha|betha|shorir kharap|sorir kharap|chikitsa|oshudh|osudh)\\b',
  // Hindi
  'स्वास्थ्य|सेहत|तबीयत|तबियत|बीमार|बिमार|रोग|दर्द|बुखार|सर्जरी|ऑपरेशन|अस्पताल|हॉस्पिटल|कैंसर|डायबिटीज|मधुमेह|ब्लड प्रेशर|बीपी',
  'हार्ट|दिल की बीमारी|दिल का दौरा|गर्भ|प्रेग्नें|प्रेगनें|डिप्रेशन|अवसाद|मानसिक (?:स्वास्थ्य|बीमारी|रोग)|इलाज|दवा|थायराइड|माइग्रेन|चोट|संक्रमण|आत्महत्या',
  // Bengali
  'স্বাস্থ্য|শরীর খারাপ|শরীরের অবস্থা|অসুখ|অসুস্থ|রোগ|ব্যথা|ব্যাথা|জ্বর|সার্জারি|অপারেশন|হাসপাতাল|ক্যান্সার|ক্যানসার|ডায়াবেটিস|সুগার|প্রেসার',
  'হার্ট|গর্ভ|প্রেগন্যান্ট|অন্তঃসত্ত্বা|ডিপ্রেশন|অবসাদ|মানসিক (?:স্বাস্থ্য|রোগ|অসুখ)|চিকিৎসা|ওষুধ|থাইরয়েড|মাইগ্রেন|আত্মহত্যা',
].join('|')), 'i');

const LEGAL_Q = new RegExp(nfc([
  // (No bare "fir": in Hinglish it means "then" — "abhi kya karu fir?"; an FIR is matched in capitals in missingAdvice.)
  '\\b(?:court|courts|lawsuit|legal|divorce|custody|alimony|police|arrest\\w*|jail|prison|bail|litigation|sue|sued|suing|inheritance',
  '(?:property|land|inheritance|family) dispute|case (?:against|filed|hearing)|(?:court|legal|police|criminal|civil|property|land|divorce) case',
  '(?:win|lose|won|lost|winning|losing) (?:the|my|this|our|a) case',
  'mukadma|mukadama|muqadma|muqadama|talaq|talak|thana|zamanat|jamanat|adalat|adalot|kachahri|mamla|mamla[ay])\\b',
  '(?<!\\bin )\\bmy case\\b',
  // Hindi
  'कोर्ट|अदालत|कचहरी|मुकदमा|मुक़दमा|मुकद्दमा|केस|कानूनी|क़ानूनी|तलाक|तलाक़|डिवोर्स|पुलिस|एफआईआर|एफ़आईआर|जेल|जमानत|ज़मानत|वसीयत|बंटवारा',
  '(?:संपत्ति|सम्पत्ति|ज़मीन|जमीन|प्रॉपर्टी|जायदाद)(?: का| की| को लेकर| पर)? (?:विवाद|झग़?ड़ा|झगड़ा)',
  // Bengali
  'কোর্ট|আদালত|মামলা|কেস|আইনি|ডিভোর্স|বিবাহবিচ্ছেদ|পুলিশ|থানা|জেল(?!া)|জামিন|বাটোয়ারা',
  '(?:সম্পত্তি|জমি|প্রপার্টি)(?:র|র নিয়ে| নিয়ে)? ?(?:বিবাদ|ঝামেলা|ঝগড়া)',
].join('|')), 'i');

const DOCTOR = new RegExp(nfc([
  '\\b(?:doctors?|gp|physician|specialists?|medical (?:professional|advice|help|check-?up)|health ?care professional|therapist|counsell?or',
  'psychiatrist|psychologist|gyn(?:a)?ecologist|cardiologist)\\b',
  'डॉक्टर|डाक्टर|डॉ\\.|चिकित्सक|विशेषज्ञ|वैद्य|ডাক্তার|চিকিৎসক|বিশেষজ্ঞ',
].join('|')), 'i');
const LAWYER = new RegExp(nfc(
  '\\b(?:lawyers?|advocates?|attorneys?|solicitors?|legal (?:advice|counsel|expert|help))\\b|वकील|अधिवक्ता|क़ानूनी सलाह|कानूनी सलाह|উকিল|আইনজীবী|আইনি পরামর্শ',
), 'i');

/**
 * The advice lines Saga's reply needs and lacks: 'doctor' for a health or
 * medical question whose reply names no doctor, 'lawyer' for a legal question
 * whose reply names no lawyer (en/hi/bn and Hinglish/Banglish questions; the
 * reply is checked in all three languages).
 */
/** The reply already points to a doctor. */
export function mentionsDoctor(reply: string): boolean {
  return DOCTOR.test(nfc(reply).toLowerCase());
}

export function adviceNeeded(question: string): ('doctor' | 'lawyer')[] {
  const q = nfc(question).toLowerCase();
  const out: ('doctor' | 'lawyer')[] = [];
  if (HEALTH_Q.test(q)) out.push('doctor');
  if (LEGAL_Q.test(q)) out.push('lawyer');
  return out;
}

export function missingAdvice(question: string, reply: string): ('doctor' | 'lawyer')[] {
  const q = nfc(question).toLowerCase();
  const r = nfc(reply);
  const out: ('doctor' | 'lawyer')[] = [];
  if (HEALTH_Q.test(q) && !DOCTOR.test(r)) out.push('doctor');
  if ((LEGAL_Q.test(q) || /\bFIR\b|police complaint/.test(nfc(question))) && !LAWYER.test(r)) out.push('lawyer');
  return out;
}

// ─── Sentence-buffered streaming ──────────────────────────────────────────────

/** Characters a partial sentence may grow to before part of it is let through anyway. */
export const SENTENCE_HOLD_MAX = 240;

/**
 * Passes streamed text through `transform` one whole sentence at a time, so a
 * clause that `transform` removes (stripCountdowns) is never shown and then
 * taken back. Text is let through at each sentence end (. ! ? । ॥ followed by
 * a space, or a newline); a run-on longer than SENTENCE_HOLD_MAX characters is
 * let through except for its last 80 characters. `flush` sends the rest.
 */
export function createSentenceFilter(transform: (text: string) => string, emit: (text: string) => void) {
  let pending = '';
  const out = (t: string) => {
    const s = transform(t);
    if (s) emit(s);
  };
  return {
    push(text: string) {
      pending += text;
      // Each whole sentence goes through `transform` on its own (a chunk can hold several).
      let last = 0;
      for (const m of pending.matchAll(/[.!?।॥](?=\s)|\n/g)) {
        const cut = (m.index ?? 0) + m[0].length;
        if (cut > last) out(pending.slice(last, cut));
        last = cut;
      }
      pending = pending.slice(last);
      if (pending.length > SENTENCE_HOLD_MAX) {
        const cut = pending.lastIndexOf(' ', pending.length - 80);
        if (cut > 0) {
          out(pending.slice(0, cut));
          pending = pending.slice(cut);
        }
      }
    },
    flush() {
      if (pending) out(pending);
      pending = '';
    },
  };
}

// ─── Guarded generation ───────────────────────────────────────────────────────
//
// A guarded reply is held back (the chat bubble keeps showing "thinking…")
// until the partial reply passes the checks, then streams live as usual:
//  - script (hi/bn): decided after SCRIPT_DECIDE_LETTERS letters; a mostly
//    Latin reply is stopped right there and retried;
//  - repetition (follow-ups): decided after REPEAT_DECIDE_WORDS words; if that
//    prefix already overlaps the previous answer, the whole reply is held and
//    judged when it ends;
//  - date (timing questions, `needsDate`): held until a month or year appears
//    that is not just the current month (dateStatus with `today`); a reply that
//    ends without one, or whose only date is the current month, is retried.
// A failing reply is regenerated once at RETRY_TEMPERATURE; if the retry fails
// too, the better of the two is shown in one go. Text on screen is never
// replaced, and there is never more than one retry.

export type ReplyGuard = {
  lang: GuardLang;
  /**
   * Earlier assistant replies in the thread (repetition check): one, or all
   * of them; a reply is a repeat when it overlaps any of them.
   */
  previous?: string | string[];
  /**
   * The reply must name one of these (the plan's key items, e.g. a suggested
   * career field): held until it does; a reply that never does is retried.
   */
  mustMention?: RegExp;
  /**
   * Shown instead when both tries still repeat an earlier reply or miss
   * `mustMention` (the plan's template answer), so a repeat is never shown.
   */
  fallback?: string;
  /**
   * Whole-reply check (the plan's: after unasked dates and repeated sentences
   * are taken out, enough answer is left and it names the plan's items).
   * A reply it rejects is retried, then replaced by `fallback`. Needs `holdAll`.
   */
  accept?: (text: string) => boolean;
  /** Show nothing until the reply is complete and checked (non-timing answers with a plan). */
  holdAll?: boolean;
  /** Latin-script words a hi/bn reply may contain (names). */
  ignore: string[];
  /** The question asks "when" (isTimingQuestion): the reply should name a month or year. */
  needsDate?: boolean;
  /**
   * The prompt's "Today:" (YYYY-MM-DD). With `needsDate`, a reply whose only
   * date is the current month counts as undated once (v2.1 answers 60% of
   * questions "by October 2026" in October 2026); the retry is kept only if it
   * names a later date.
   */
  today?: string;
};

/**
 * One model run: calls `onToken` per token (returning true stops the run) and
 * resolves when generation ends. `temperature` undefined = the app default.
 */
export type GenerateFn = (onToken: (token: string) => boolean | void, temperature?: number) => Promise<unknown>;

type Attempt = { text: string; released: boolean; stoppedLatin: boolean };

/** Whole sentences in a partial reply (end mark followed by more text). */
function completeSentences(text: string): number {
  return (text.match(/[.!?।॥](?=\s+\S)|\n+(?=\S)/g) ?? []).length;
}

export async function runGuarded(generate: GenerateFn, guard: ReplyGuard, emit: (text: string) => void): Promise<void> {
  const checkScript = guard.lang !== 'en';
  const prevs = (Array.isArray(guard.previous) ? guard.previous : guard.previous ? [guard.previous] : []).filter(p => p.trim());
  const hasPrev = prevs.length > 0;
  const must = guard.mustMention;
  const scriptRatio = (t: string) => nativeScriptRatio(t, guard.lang, guard.ignore);
  const overlap = (t: string) => prevs.reduce((m, p) => Math.max(m, replyOverlap(t, p)), 0);
  const scriptBad = (a: Attempt) =>
    checkScript && (a.stoppedLatin || (letterCount(a.text) >= 8 && scriptRatio(a.text) < NATIVE_SCRIPT_MIN));
  const repeatBad = (a: Attempt) => hasPrev && overlap(a.text) >= REPEAT_OVERLAP_MAX;
  const mentions = (t: string) => !must || must.test(westernDigits(t));
  const relevanceBad = (a: Attempt) => !mentions(a.text) || (!!guard.accept && !guard.accept(a.text));
  const dates = (t: string) => dateStatus(t, guard.today);
  // 2 = no date, 1 = only the current month, 0 = fine.
  const dateFail = (a: Attempt) => {
    if (!guard.needsDate) return 0;
    const st = dates(a.text);
    if (st === 'none') return 2;
    return st === 'current' ? 1 : 0;
  };
  const dateBad = (a: Attempt) => dateFail(a) > 0;
  const bad = (a: Attempt) => scriptBad(a) || repeatBad(a) || dateBad(a) || relevanceBad(a);
  // `final`: the last try, which is never stopped early (a Latin reply is held
  // to the end so there is always a whole reply to show).
  const attempt = async (temperature?: number, final = false): Promise<Attempt> => {
    const a: Attempt = { text: '', released: false, stoppedLatin: false };
    let scriptDone = !checkScript;
    let repeatDone = !hasPrev;
    let repeatSuspect = false;
    let dateDone = !guard.needsDate;
    let mentionDone = !must;
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
      if (!repeatDone && !repeatSuspect) {
        const n = words(a.text).length;
        if (n >= REPEAT_DECIDE_WORDS && (completeSentences(a.text) >= 2 || n >= REPEAT_HOLD_WORDS)) {
          if (overlap(a.text) < REPEAT_OVERLAP_MAX) repeatDone = true;
          else repeatSuspect = true; // hold to the end and judge the whole reply
        }
      }
      if (!dateDone && dates(a.text) === 'ok') {
        dateDone = true;
      }
      if (!mentionDone && mentions(a.text)) mentionDone = true;
      if (scriptDone && repeatDone && dateDone && mentionDone && !hold && !guard.holdAll) {
        a.released = true;
        emit(a.text);
      }
    }, temperature);
    return a;
  };

  const first = await attempt();
  if (first.released) return;
  if (!bad(first)) {
    emit(first.text);
    return;
  }

  let second: Attempt;
  try {
    second = await attempt(RETRY_TEMPERATURE, true);
  } catch (err) {
    if (first.stoppedLatin) throw err;
    emit(guard.fallback && (repeatBad(first) || relevanceBad(first)) ? guard.fallback : first.text);
    return;
  }
  if (second.released) return;
  if (!bad(second) || (first.stoppedLatin && !repeatBad(second) && !relevanceBad(second))) {
    emit(second.text);
    return;
  }
  // Both failed: prefer the right script, then one with a date (a later date
  // over only the current month), then the one that repeats less; ties keep the first.
  const rank = (a: Attempt) => (scriptBad(a) ? 4 : 0) + dateFail(a) + overlap(a.text) + (relevanceBad(a) ? 0.5 : 0);
  const best = first.stoppedLatin ? second : rank(second) < rank(first) ? second : first;
  // Never show a repeat or an answer that misses the point when the plan has one ready.
  if (guard.fallback && (repeatBad(best) || relevanceBad(best))) {
    emit(guard.fallback);
    return;
  }
  emit(best.text);
}
