/**
 * Hinglish / Banglish replies: a Latin-script question in Hindi or Bengali
 * ("meri shaadi kab hogi?", "chakri kobe pabo?") gets its answer in the same
 * register ("Shaadi ke liye sabse achha samay September 2029 se …").
 *
 * Not automatic transliteration. The template answer is written in Devanagari
 * / Bengali from the app's sentence tables; every table sentence (and every
 * value that fills one of its {slots}: planet names, areas, items, months) has
 * a hand-written romanized form in ./roman-hi.ts / ./roman-bn.ts. The answer is
 * split into sentences, each sentence is matched back to the table sentence it
 * came from (slots captured and romanized the same way, recursively), and the
 * romanized forms are put together. Dates come out as "September 2029" with
 * Latin digits.
 *
 * All or nothing: if any sentence (or slot value) has no romanized form, the
 * answer stays in the native script (romanize returns null), so a reply never
 * mixes scripts. The reverse direction (nativize) reads an earlier Latin reply
 * back into the native sentences, so the repeat checks of follow-ups still see
 * what was said.
 *
 * Pure: no React Native, no i18n.
 */
import type { Lang } from './strings';
import { westernDigits } from '../reply-guards';
import { ROMAN_HI } from './roman-hi';
import { ROMAN_BN } from './roman-bn';

type RLang = 'hi' | 'bn';
const NATIVE = /[ऀ-ॿঀ-৿]/;
const NATIVE_G = /[ऀ-ॿঀ-৿]/g;
const LATIN_G = /[A-Za-z]/g;

// ─── Register ─────────────────────────────────────────────────────────────────

/** Words that mark a Latin-script message as Hindi (not English) / Bengali. */
const HINT: Record<RLang, RegExp> = {
  hi: /\b(?:hai|hain|hoga|hogi|honge|hoge|kab|kya|kyu|kyun|kyon|kaise|kaisa|kaisi|kaun|kaunsa|kaunsi|konsa|konsi|mera|meri|mere|mujhe|mujhko|hum|humara|humare|hamara|hamare|aap|aapka|aapki|tum|tumhara|nahi|nahin|nhi|karu|karun|karoon|karna|karni|chahiye|milegi|milega|milenge|lagegi|lagega|shaadi|shadi|naukri|kundli|kundali|batao|bataiye|bata|yaar|accha|acha|achha|theek|thik|abhi|agla|agle|saal|paisa|paise|ghar|wale|wali|wala|aayega|aayegi|ayega|jaunga|jaungi|hu|hoon|ho|rahi|raha|rahe|bahut|bohot|sab|kuch|mein|mai|gaadi|gadi|lu|lun|pareshan|ji|beta|beti|pati|patni|sasural|saas|bhi|aur|ya|se|ke|ki|ka|ko|liye|wapas|kitne|kitna|kaha|kahan|tak|baar|din|subh|shubh|upay|totka|dasha|mahadasha|sadhna|banegi|banega|dhandha|vyapar|padhai|pariksha|naam|bimari|maut)\b/i,
  bn: /\b(?:ami|amar|amake|amader|amra|apni|apnar|apnake|tumi|tomar|tomake|kobe|keno|kemon|kothay|kothai|hobe|hoche|hocche|hochhe|ache|achhe|achi|achho|acho|nei|bolo|bolun|bolcho|korbo|korte|korle|parbo|parchi|pabo|pabe|chakri|chakrir|biye|bari|barir|bhalo|kharap|theke|jonno|sathe|ekhon|ebar|ebaar|kintu|taka|somoy|kichu|kichui|onek|khub|kono|kon|jabo|nebo|nebe|kinbo|porbo|pashe|mene|dicche|dichhe|bose|jani|cholche|shobhab|swabhab|shobhav|gari|din|jog|bou|bor|cheler|meyer|baba|mayer|ma|dhore|bujhte|ranna|shikhao|mamla|jomir|sesh|ferot|deoa|dhar|jomate|kinbo|thik|hocche|kombe|kaj|kaje|porashona|porashonar|shoshur|shashuri|jhamela|mitbe|somporko|raji|nadi|dosh|totka|rong|porle|prabhab|shonir|adhyatmik|poth|janmo|agey|chilo|shudhu|haan|ba|bolo|okkhor|namer|prothom|banchben|kotodin|chele|meye|kundli|kushti|jater|moddhe|nijer|bhul|sob|acho)\b/i,
};

/**
 * The reply register for a question: true when the app language is hi / bn and
 * the message is predominantly Latin script (≥ 70% of its letters) with at
 * least one Hindi / Bengali word (an English question in a Hindi app keeps the
 * native-script answer).
 */
export function latinRegister(question: string, lang: Lang): boolean {
  if (lang !== 'hi' && lang !== 'bn') return false;
  const q = question.normalize('NFC');
  const native = (q.match(NATIVE_G) ?? []).length;
  const latin = (q.match(LATIN_G) ?? []).length;
  if (latin < 2 || latin / (latin + native) < 0.7) return false;
  // More Hindi / Bengali words than English ones ("board exam me acche marks aayenge?" has "me" in both lists).
  const words = q.toLowerCase().match(/[a-z]+/g) ?? [];
  const hint = new RegExp(`^(?:${HINT[lang].source.replace(/^\\b\(\?:|\)\\b$/g, '')})$`, 'i');
  const ours = words.filter(w => hint.test(w) || EXTRA_HINT[lang].test(w)).length;
  const en = words.filter(w => EN_WORD.test(w)).length;
  return ours > en || (ours > 0 && ours === en);
}

/** More register words (forms the topic lists don't need). */
const EXTRA_HINT: Record<RLang, RegExp> = {
  hi: /^(?:acche|achhe|aayenge|aaenge|ayenge|jayega|jayegi|jaayega|karunga|karungi|chalega|rahega|rahegi|lagega|kyunki|lekin|kis|kiska|kiski|kiske|hoti|hota|hote|tha|thi|hoga|batayein|bataye|bataiye|chal|rahi|wapas|aayega|kar|karke|karte|gaya|gayi|liya|diya|mil|milega|lena|dena|sakta|sakti|sakte|jaldi|kabhi|sahi|galat|accha|bura|bahut|zyada|thoda)$/i,
  bn: /^(?:korchhi|korchi|hobena|hoyeche|hoye|gelo|jabe|ashbe|asbe|pabo|parbe|lagbe|kore|korle|diye|niye|bhabchi|bhabchhi|chai|chaai|dicche|deben|dekhe|bujhi|janina|jani|bolun|bolo|ektu|aro|onek|kotodin|kokhon|kivabe|kibhabe|keno|ki)$/i,
};
/** Common English function words (a Latin message mostly made of these is English, not Hinglish). */
const EN_WORD = /^(?:the|is|are|was|were|will|would|when|what|which|why|how|my|me|i|you|your|can|could|should|do|does|did|for|to|and|of|an|in|on|with|get|be|am|it|this|that|there|have|has|job|marriage)$/i;

// ─── Tables ───────────────────────────────────────────────────────────────────

type Tok = { lit: string } | { slot: string };
type Entry = { from: string; to: string; toks: Tok[]; first: string; last: string; lit: number };
type Table = {
  exact: Map<string, string>; tmpl: Entry[]; multi: string[];
  /** Templates by the first character of their fixed opening, and the slot-first ones by their last three characters. */
  byFirst: Map<string, Entry[]>; byLast: Map<string, Entry[]>; open: Entry[];
};

const nfc = (s: string) => s.normalize('NFC');

function parse(t: string): Tok[] {
  const out: Tok[] = [];
  const re = /\{(\w+)\}/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > at) out.push({ lit: t.slice(at, m.index) });
    out.push({ slot: m[1] });
    at = m.index + m[0].length;
  }
  if (at < t.length) out.push({ lit: t.slice(at) });
  return out;
}

function build(pairs: readonly (readonly [string, string])[]): Table {
  const exact = new Map<string, string>();
  const tmpl: Entry[] = [];
  for (const [a, b] of pairs) {
    const from = nfc(westernDigits(a)).trim();
    const to = b.trim();
    if (!/\{\w+\}/.test(from)) {
      if (!exact.has(from)) exact.set(from, to);
      continue;
    }
    const toks = parse(from);
    const first = 'lit' in toks[0] ? toks[0].lit : '';
    const lastTok = toks[toks.length - 1];
    // A case ending glued onto the last slot ("{planet}-এর সঙ্গে যুক্ত।" → "শুক্রের সঙ্গে যুক্ত।"): prefilter on the rest.
    const last = 'lit' in lastTok ? lastTok.lit.replace(/^(?:-এর|-কে|-er|-ke)/, '') : '';
    tmpl.push({ from, to, toks, first, last, lit: toks.reduce((n, t) => n + ('lit' in t ? t.lit.length : 0), 0) });
  }
  // The most specific sentence first (more fixed text), so a generic "{a} और {b}" is only a last resort.
  tmpl.sort((a, b) => b.lit - a.lit);
  // How table entries that span several sentences begin (convert() only tries joins that can match one).
  const BREAK = /[।?!.:]\s/;
  const multi = [...[...exact.keys()].filter(k => BREAK.test(k)).map(k => k.split(BREAK)[0]),
    ...tmpl.filter(e => BREAK.test(e.from)).map(e => e.first.split(BREAK)[0])];
  const byFirst = new Map<string, Entry[]>();
  const byLast = new Map<string, Entry[]>();
  const open: Entry[] = [];
  for (const e of tmpl) {
    if (e.first) { const k = e.first[0].toLowerCase(); byFirst.set(k, [...(byFirst.get(k) ?? []), e]); }
    else if (e.last.length >= 3) { const k = e.last.slice(-3); byLast.set(k, [...(byLast.get(k) ?? []), e]); }
    else open.push(e);
  }
  return { exact, tmpl, multi: [...new Set(multi)].filter(Boolean), byFirst, byLast, open };
}

let TABLES: Record<'hi' | 'bn' | 'hiRev' | 'bnRev', Table> | null = null;
function tables() {
  if (!TABLES) {
    TABLES = {
      hi: build(ROMAN_HI), bn: build(ROMAN_BN),
      // Reverse (Latin → native): only fixed sentences and slot templates whose romanized side has slots.
      hiRev: build(ROMAN_HI.map(([a, b]) => [b, a] as const)), bnRev: build(ROMAN_BN.map(([a, b]) => [b, a] as const)),
    };
  }
  return TABLES;
}

// ─── Months and digits ───────────────────────────────────────────────────────

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_NATIVE: Record<RLang, string[][]> = {
  hi: [['जनवरी'], ['फ़रवरी', 'फरवरी'], ['मार्च'], ['अप्रैल'], ['मई'], ['जून'], ['जुलाई'], ['अगस्त'], ['सितंबर', 'सितम्बर'], ['अक्टूबर', 'अक्तूबर'], ['नवंबर', 'नवम्बर'], ['दिसंबर', 'दिसम्बर']],
  bn: [['জানুয়ারি', 'জানুয়ারি'], ['ফেব্রুয়ারি', 'ফেব্রুয়ারি'], ['মার্চ'], ['এপ্রিল'], ['মে'], ['জুন'], ['জুলাই'], ['আগস্ট'], ['সেপ্টেম্বর'], ['অক্টোবর'], ['নভেম্বর'], ['ডিসেম্বর']],
};

function monthWord(s: string, lang: RLang): string | null {
  const t = nfc(s);
  const k = MONTH_NATIVE[lang].findIndex(v => v.some(x => nfc(x) === t));
  return k >= 0 ? EN_MONTHS[k] : null;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

/** Romanizes one fragment (a sentence, or a slot value) with the table; null when any part has no form. */
function frag(s: string, T: Table, lang: RLang, rev: boolean, memo: Map<string, string | null>, depth: number): string | null {
  if (memo.has(s)) return memo.get(s)!;
  memo.set(s, null);
  const out = fragInner(s, T, lang, rev, memo, depth);
  memo.set(s, out);
  return out;
}

function fragInner(s: string, T: Table, lang: RLang, rev: boolean, memo: Map<string, string | null>, depth: number): string | null {
  const t = s.trim();
  const lead = s.slice(0, s.length - s.trimStart().length);
  const trail = s.slice(s.trimEnd().length);
  if (!t) return s;
  const done = (x: string) => lead + x + trail;
  // Forward: Latin / digit-only text (names, "IT", "14416") passes as is. Reverse: native text passes.
  if (!rev && !NATIVE.test(t)) return s;
  if (rev && !/[A-Za-z]/.test(t)) return s;
  const ex = T.exact.get(t);
  if (ex != null) return done(ex);
  if (!rev) {
    // "सितंबर 2029", "12 अक्टूबर", a bare month.
    const my = /^(\S+) (\d{4})$/.exec(t);
    if (my && monthWord(my[1], lang)) return done(`${monthWord(my[1], lang)} ${my[2]}`);
    const dm = /^(\d{1,2}) (\S+)$/.exec(t);
    if (dm && monthWord(dm[2], lang)) return done(`${dm[1]} ${monthWord(dm[2], lang)}`);
    const m = monthWord(t, lang);
    if (m) return done(m);
  } else {
    const my = /^([A-Z][a-z]+) (\d{4})$/.exec(t);
    const k = my ? EN_MONTHS.indexOf(my[1]) : -1;
    if (my && k >= 0) return done(`${MONTH_NATIVE[lang][k][0]} ${my[2]}`);
    const dm = /^(\d{1,2}) ([A-Z][a-z]+)$/.exec(t);
    const k2 = dm ? EN_MONTHS.indexOf(dm[2]) : -1;
    if (dm && k2 >= 0) return done(`${dm[1]} ${MONTH_NATIVE[lang][k2][0]}`);
    const k3 = EN_MONTHS.indexOf(t);
    if (k3 >= 0) return done(MONTH_NATIVE[lang][k3][0]);
  }
  if (depth > 7) return null;
  // Sentence-initial capitals in the Latin direction are not part of the table's key.
  const key = rev ? t : t;
  const cands = [...(T.byFirst.get(key[0].toLowerCase()) ?? []), ...(T.byLast.get(key.slice(-3)) ?? []), ...T.open].sort((a, b) => b.lit - a.lit);
  for (const e of cands) {
    if (!key.startsWith(e.first) || !key.endsWith(e.last)) continue;
    if (rev && e.first === '' && e.last === '' && e.toks.length > 3) continue;
    const r = matchEntry(e, key, T, lang, rev, memo, depth + 1);
    if (r != null) return done(r);
  }
  if (rev) {
    // The romanized side capitalises a sentence's first letter; the table may hold it lower-case (a clause).
    const lower = t.charAt(0).toLowerCase() + t.slice(1);
    if (lower !== t) {
      const r = frag(lower, T, lang, rev, memo, depth + 1);
      if (r != null) return done(r);
    }
  }
  const alt = caseVariant(t, lang, rev);
  if (alt) {
    const r = frag(alt.base, T, lang, rev, memo, depth + 1);
    if (r != null) return done(alt.wrap(r));
  }
  return null;
}

/**
 * A slot value in a case form the tables hold in its base form: Hindi oblique ("अनुशासन के ग्रह" for
 * "अनुशासन का ग्रह", strings.ts hiCase) and Bengali genitive ("শনির", "শৃঙ্খলার গ্রহের"). Returns the
 * base form and how to put the romanized base back into the same case.
 */
function caseVariant(t: string, lang: RLang, rev: boolean): { base: string; wrap: (r: string) => string } | null {
  if (!rev && lang === 'hi') {
    const m = /^(.*) के (ग्रह|बिंदु|काम|हुनर|गुण|समय|दौर|पहलू)$/.exec(t);
    if (m) return { base: `${m[1]} का ${m[2]}`, wrap: r => r.replace(/ ka (\S+)$/, ' ke $1') };
    for (const [a, b, ra, rb] of [['वाले', 'वाला', 'wala', 'wale'], ['चलने', 'चलना', 'chalna', 'chalne'], ['बाँटने', 'बाँटना', 'baantna', 'baantne']] as const) {
      if (t.endsWith(a)) return { base: t.slice(0, -a.length) + b, wrap: r => (r.endsWith(ra) ? r.slice(0, -ra.length) + rb : r) };
    }
  }
  if (!rev && lang === 'bn') {
    if (t.endsWith('ের') && t.length > 2) return { base: t.slice(0, -2), wrap: r => `${r}er` };
    // A Latin name takes "-র" ("Priya-র"): the base is the name, and the Latin form joins as "Priyar".
    if (t.endsWith('-র') && t.length > 2) return { base: t.slice(0, -2), wrap: r => `${r}-er` };
    if (t.endsWith('র') && t.length > 1) return { base: t.slice(0, -1), wrap: r => (/[aeiou]$/i.test(r) ? `${r}r` : `${r}er`) };
  }
  if (rev && lang === 'hi') {
    const m = /^(.*) ke (grah|bindu|kaam|hunar|gun|samay|daur|pehlu)$/.exec(t);
    if (m) return { base: `${m[1]} ka ${m[2]}`, wrap: r => r.replace(/ का (\S+)$/, ' के $1') };
  }
  if (rev && lang === 'bn') {
    if (/[^aeiou]er$/i.test(t)) return { base: t.slice(0, -2), wrap: r => `${r}ের` };
    if (/[aeiou]r$/i.test(t)) return { base: t.slice(0, -1), wrap: r => `${r}র` };
  }
  return null;
}

function matchEntry(e: Entry, s: string, T: Table, lang: RLang, rev: boolean, memo: Map<string, string | null>, depth: number): string | null {
  const toks = e.toks;
  const binds: Record<string, string> = {};
  const go = (ti: number, pos: number): boolean => {
    if (ti === toks.length) return pos === s.length;
    const tk = toks[ti];
    if ('lit' in tk) return s.startsWith(tk.lit, pos) && go(ti + 1, pos + tk.lit.length);
    const next = toks[ti + 1];
    const tryAt = (end: number): boolean => {
      const cap = s.slice(pos, end);
      const r = cap === '' ? '' : frag(cap, T, lang, rev, memo, depth);
      if (r == null) return false;
      binds[tk.slot] = r;
      return go(ti + 1, end);
    };
    if (!next) return tryAt(s.length);
    if ('slot' in next) {
      // Two slots in a row ("{who}{area}"): try every split, shortest first.
      for (let end = pos; end <= s.length; end++) if (tryAt(end)) return true;
      return false;
    }
    // Bengali case endings are glued on after the table is filled ("{P}-এর পর্বে" → "শনির পর্বে",
    // strings.ts bnCase), and the Latin form joins them the same way ("Shonir porbe").
    for (const v of litVariants(next.lit, lang, rev)) {
      let at = s.indexOf(v.lit, pos);
      while (at >= 0) {
        const cap = s.slice(pos, at);
        const r = cap === '' ? '' : frag(cap, T, lang, rev, memo, depth);
        if (r != null) {
          binds[tk.slot] = r;
          if (go(ti + 2, at + v.lit.length)) return true;
        }
        at = s.indexOf(v.lit, at + 1);
      }
    }
    return false;
  };
  if (!go(0, 0)) return null;
  return e.to.replace(/\{(\w+)\}/g, (_, k: string) => binds[k] ?? '');
}

/** The spellings a literal can take after a filled slot (Bengali genitive / objective endings). */
function litVariants(lit: string, lang: RLang, rev: boolean): { lit: string }[] {
  if (lang !== 'bn') return [{ lit }];
  if (!rev) {
    if (lit.startsWith('-এর')) { const rest = lit.slice(3); return [{ lit }, { lit: 'ের' + rest }, { lit: 'র' + rest }, { lit: '-র' + rest }]; }
    if (lit.startsWith('-কে')) { const rest = lit.slice(3); return [{ lit }, { lit: 'কে' + rest }]; }
    return [{ lit }];
  }
  if (lit.startsWith('-er')) { const rest = lit.slice(3); return [{ lit }, { lit: 'er' + rest }, { lit: 'r' + rest }]; }
  if (lit.startsWith('-ke')) { const rest = lit.slice(3); return [{ lit }, { lit: 'ke' + rest }]; }
  return [{ lit }];
}

/** Banglish: "Shoni-er" → "Shonir", "Mongol-er" → "Mongoler", "Shoni-ke" → "Shonike"; digits and acronyms keep the hyphen. */
function joinBnEndings(t: string): string {
  return t
    .replace(/-{2,}(er|ke)\b/g, '-$1')
    .replace(/\b([A-Za-z]*[a-z])-er\b/g, (_m, w: string) => (/[aeiou]$/i.test(w) ? `${w}r` : `${w}er`))
    .replace(/\b([A-Za-z]*[a-z])-ke\b/g, '$1ke');
}

const capFirst = (t: string) => t.replace(/^(\s*["'(]?)([a-z])/, (_, a: string, b: string) => a + b.toUpperCase());

/** Splits a paragraph into sentences (after । ? ! . followed by a space). */
const sentences = (p: string) => p.split(/(?<=[।?!.])\s+/).filter(Boolean);

function convert(text: string, T: Table, lang: RLang, rev: boolean): string | null {
  const memo = new Map<string, string | null>();
  const paras = text.split(/(\n+)/);
  const out: string[] = [];
  for (const para of paras) {
    if (!para.trim() || /^\n+$/.test(para)) { out.push(para); continue; }
    const ss = sentences(para.trim());
    const got: string[] = [];
    let i = 0;
    while (i < ss.length) {
      let ok = false;
      // Table sentences can span several sentences (declines); the longest match wins.
      // A sentence that can open a multi-sentence entry tries the longest join first; any other sentence
      // tries itself first and joins only when it has no form on its own.
      const max = Math.min(ss.length, i + 8);
      const longFirst = T.multi.some(f => ss[i].startsWith(f));
      const order = longFirst ? Array.from({ length: max - i }, (_, k) => max - k) : Array.from({ length: max - i }, (_, k) => i + 1 + k);
      for (const j of order) {
        const r = frag(ss.slice(i, j).join(' '), T, lang, rev, memo, 0);
        if (r != null) { got.push(rev ? r : r.split(/(?<=[.?!])\s+/).map(capFirst).join(' ')); i = j; ok = true; break; }
      }
      if (!ok) return null;
    }
    out.push(got.join(' '));
  }
  return out.join('');
}

/**
 * The Latin-script (Hinglish / Banglish) form of a native hi / bn template
 * answer, or null when some sentence has no romanized form (the caller then
 * keeps the native answer). Digits come out Western.
 */
export function romanize(text: string, lang: Lang): string | null {
  if (lang !== 'hi' && lang !== 'bn') return null;
  const src = nfc(westernDigits(text));
  if (!NATIVE.test(src)) return null;
  const r0 = convert(src, tables()[lang], lang, false);
  const r = r0 != null && lang === 'bn' ? joinBnEndings(r0) : r0;
  return r != null && !NATIVE.test(r) ? r : null;
}

/** The native-script sentences behind a Latin-script reply this module wrote (for repeat checks), or null. */
export function nativize(text: string, lang: Lang): string | null {
  if (lang !== 'hi' && lang !== 'bn') return null;
  const src = text.normalize('NFC');
  if (NATIVE.test(src) || !/[A-Za-z]/.test(src)) return null;
  const T = tables()[lang === 'hi' ? 'hiRev' : 'bnRev'];
  return convert(src, T, lang, true);
}

/** The native sentences of a Latin reply in either language (history may not say which), else the reply. */
export function nativeOf(text: string): string {
  if (NATIVE.test(text) || !/[A-Za-z]/.test(text)) return text;
  const hi = HINT.hi.test(text), bn = HINT.bn.test(text);
  if (!hi && !bn) return text;
  const hit = NATIVE_CACHE.get(text);
  if (hit != null) return hit;
  const out = (hi ? nativize(text, 'hi') : null) ?? (bn ? nativize(text, 'bn') : null) ?? text;
  if (NATIVE_CACHE.size > 64) NATIVE_CACHE.delete(NATIVE_CACHE.keys().next().value!);
  NATIVE_CACHE.set(text, out);
  return out;
}
const NATIVE_CACHE = new Map<string, string>();

/** The sentences of a native answer that have no romanized form (coverage reports and tests). */
export function unmatched(text: string, lang: Lang): string[] {
  if (lang !== 'hi' && lang !== 'bn') return [];
  const T = tables()[lang];
  const memo = new Map<string, string | null>();
  const out: string[] = [];
  for (const para of nfc(westernDigits(text)).split(/\n+/)) {
    for (const s of sentences(para.trim())) if (s && frag(s, T, lang, false, memo, 0) == null) out.push(s);
  }
  return out;
}
