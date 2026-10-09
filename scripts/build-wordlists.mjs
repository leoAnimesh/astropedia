#!/usr/bin/env node
/**
 * Builds the word-frequency lists behind the app keyboard's suggestion strip
 * (components/keyboard/suggest.ts) from text already in the repo:
 *
 *   - ml/data/raw/*.jsonl   teacher answers + question banks (git-ignored;
 *                           skipped when absent, so re-runs on a fresh clone
 *                           only use the tracked sources below)
 *   - locales/<lang>/*.json UI strings
 *   - assets/gita-corpus    verse translations (English, text before "Key terms")
 *   - assets/astrology-corpus
 *   - a small built-in seed of everyday English words (the corpus is
 *     astrology-heavy, so plain chat words like "thanks" would be missing)
 *
 * Output: constants/wordlists/<lang>.json = { "v": 1, "words": "w1 w2 …" },
 * most frequent first. Each file is kept under MAX_BYTES.
 *
 *   node scripts/build-wordlists.mjs
 */
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'constants', 'wordlists');
const MAX_BYTES = 150 * 1024;
const MAX_WORDS = { en: 15000, hi: 15000, bn: 15000 };
const MIN_COUNT = 2;

/** @type {Record<'en'|'hi'|'bn', Map<string, Map<string, number>>>} word(lower) → surface form → count */
const counts = { en: new Map(), hi: new Map(), bn: new Map() };

const LATIN_WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
// Devanagari / Bengali letters + marks (no danda U+0964/5, no digits).
const DEVA_WORD = /[ऀ-ॣॱ-ॿ‌‍]+/g;
const BENG_WORD = /[ঀ-ৣৰ-ৱৼ‌‍]+/g;

function add(lang, surface, weight = 1) {
  const key = lang === 'en' ? surface.toLowerCase() : surface;
  let forms = counts[lang].get(key);
  if (!forms) counts[lang].set(key, (forms = new Map()));
  forms.set(surface, (forms.get(surface) ?? 0) + weight);
}

function addText(lang, text, weight = 1) {
  if (typeof text !== 'string' || !text) return;
  if (lang === 'en') {
    for (const m of text.matchAll(LATIN_WORD)) {
      const w = m[0].replace(/’/g, "'");
      if (w.length > 1 || w === 'a' || w === 'I') add('en', w, weight);
    }
  } else {
    const re = lang === 'hi' ? DEVA_WORD : BENG_WORD;
    for (const m of text.normalize('NFC').matchAll(re)) {
      const w = m[0].replace(/^[‌‍]+|[‌‍]+$/g, '');
      if (!w) continue;
      // Must start with a letter, not a combining mark.
      const c = w.codePointAt(0);
      const startsWithMark = lang === 'hi'
        ? (c >= 0x0900 && c <= 0x0903) || (c >= 0x093a && c <= 0x094f && c !== 0x093d) || (c >= 0x0951 && c <= 0x0957) || c === 0x0962 || c === 0x0963
        : (c >= 0x0981 && c <= 0x0983) || c === 0x09bc || (c >= 0x09be && c <= 0x09d7) || c === 0x09e2 || c === 0x09e3;
      if (!startsWithMark) add(lang, w, weight);
    }
  }
}

function walkStrings(value, fn) {
  if (typeof value === 'string') fn(value);
  else if (Array.isArray(value)) value.forEach((v) => walkStrings(v, fn));
  else if (value && typeof value === 'object') for (const v of Object.values(value)) walkStrings(v, fn);
}

const langOfFile = (f) => (/_bn[._]/.test(f) || /_bn\b/.test(f) ? 'bn' : /_hi[._]/.test(f) || /_hi\b/.test(f) ? 'hi' : 'en');

// ─── Sources ─────────────────────────────────────────────────────────────────

const stats = [];

// Teacher answers + question banks (one JSON object per line).
const RAW = path.join(ROOT, 'ml', 'data', 'raw');
if (fs.existsSync(RAW)) {
  for (const f of fs.readdirSync(RAW).sort()) {
    if (!f.endsWith('.jsonl')) continue;
    // Duplicated snapshots would just double counts; romanised Hindi/Bengali
    // ("kab hogi shaadi") would pollute the English list.
    if (/snapshot|latin|hinglish|pilot/.test(f) || f === 'answers.jsonl') continue;
    const fileLang = langOfFile(f);
    let lines = 0;
    for (const line of fs.readFileSync(path.join(RAW, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const lang = ['en', 'hi', 'bn'].includes(rec.lang) ? rec.lang : fileLang;
      const texts = [];
      if (Array.isArray(rec.turns)) for (const t of rec.turns) texts.push(t.user, t.assistant);
      if (Array.isArray(rec.questions)) texts.push(...rec.questions);
      for (const t of texts) addText(lang, t);
      lines++;
    }
    stats.push(`${f}: ${lines}`);
  }
} else {
  stats.push('ml/data/raw: missing (skipped)');
}

// UI strings (weighted up: they're the app's own vocabulary).
for (const lang of ['en', 'hi', 'bn']) {
  const dir = path.join(ROOT, 'locales', lang);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    walkStrings(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), (s) =>
      addText(lang, s.replace(/\{\{[^}]*\}\}/g, ' '), 3));
  }
}

// Gita verse translations (English).
const verses = path.join(ROOT, 'assets', 'gita-corpus', 'verses.json');
if (fs.existsSync(verses)) {
  for (const v of JSON.parse(fs.readFileSync(verses, 'utf8'))) {
    addText('en', String(v.text ?? '').split('Key terms:')[0].replace(/^Bhagavad Gita [\d.]+ —/, ''));
  }
}

// Astrology corpus (any language strings it holds).
function walkDir(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, fn);
    else if (e.name.endsWith('.json')) fn(p);
  }
}
walkDir(path.join(ROOT, 'assets', 'astrology-corpus'), (p) => {
  walkStrings(JSON.parse(fs.readFileSync(p, 'utf8')), (s) => {
    addText('en', s);
    addText('hi', s);
    addText('bn', s);
  });
});

// Everyday English (chat words the corpus may lack). Given a floor count so
// they always make the list, ranked by their position here.
const SEED_EN = `the be to of and a in that have I it for not on with he as you do at this but his by from they we say her
she or an will my one all would there their what so up out if about who get which go me when make can like time no just
him know take people into year your good some could them see other than then now look only come its over think also back
after use two how our work first well way even new want because any these give day most us is are was were has had did
does been being am yes yeah ok okay hi hello hey thanks thank please sorry welcome bye goodbye great nice cool fine sure
really very much more many lot little big small long short old young happy sad love hate need help tell ask feel try
call keep let put mean seem leave show hear play run move live believe hold bring happen write provide sit stand lose
pay meet include continue set learn change lead understand watch follow stop create speak read allow add spend grow open
walk win offer remember consider appear buy wait serve die send expect build stay fall cut reach kill remain suggest
raise pass sell require report decide pull today tomorrow yesterday morning evening night week month weekend monday
tuesday wednesday thursday friday saturday sunday january february march april may june july august september october
november december home house family friend friends mother father mom dad brother sister son daughter wife husband
child children baby job money school college exam exams marriage health business career travel abroad parents boyfriend
girlfriend partner relationship office boss salary loan house car phone email message name place problem question
answer reason idea thing things something nothing everything anything someone anyone everyone always never sometimes
often usually maybe perhaps probably actually again still already soon later early late before after during until
since while where why who whom whose here there right wrong left better best worse worst should would could might must
shall don't doesn't didn't can't won't isn't aren't wasn't weren't haven't hasn't hadn't wouldn't couldn't shouldn't
I'm I've I'll I'd you're you've you'll you'd he's she's it's we're we've they're they've that's what's there's let's
how's who's where's when's why's here's
`.split(/\s+/).filter(Boolean);

// ─── Rank + write ────────────────────────────────────────────────────────────

fs.mkdirSync(OUT, { recursive: true });

function finalize(lang) {
  const seed = lang === 'en' ? new Map(SEED_EN.map((w, i) => [w.toLowerCase(), { w, rank: i }])) : new Map();
  const rows = [];
  for (const [key, forms] of counts[lang]) {
    let total = 0;
    let best = '';
    let bestN = -1;
    for (const [form, n] of forms) {
      total += n;
      if (n > bestN) { best = form; bestN = n; }
    }
    if (lang === 'en') {
      // Keep a capitalised form only when it clearly dominates (names,
      // planets, months, "I"); sentence-initial capitals don't count.
      const lower = forms.get(key) ?? 0;
      best = lower >= total * 0.25 ? key : best;
      if (key.length > 18 || /^(.)\1+$/.test(key)) continue;
    } else if (Array.from(key).length > 16) continue;
    if (total < MIN_COUNT && !seed.has(key)) continue;
    rows.push({ w: best, n: total });
  }
  // Seed words: at least the median count, so they make the cut.
  if (seed.size) {
    const sorted = rows.map((r) => r.n).sort((a, b) => b - a);
    const floor = sorted[Math.min(sorted.length - 1, 2000)] ?? 5;
    const have = new Map(rows.map((r) => [r.w.toLowerCase(), r]));
    for (const [key, { w, rank }] of seed) {
      const boost = floor + (SEED_EN.length - rank);
      const r = have.get(key);
      if (r) r.n = Math.max(r.n, boost);
      else rows.push({ w, n: boost });
    }
  }
  rows.sort((a, b) => b.n - a.n || (a.w < b.w ? -1 : 1));
  let words = rows.slice(0, MAX_WORDS[lang]).map((r) => r.w);
  const enc = (ws) => JSON.stringify({ v: 1, words: ws.join(' ') });
  while (Buffer.byteLength(enc(words)) > MAX_BYTES) words = words.slice(0, Math.floor(words.length * 0.97));
  const json = enc(words);
  fs.writeFileSync(path.join(OUT, `${lang}.json`), json + '\n');
  return `${lang}: ${words.length} words, ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB (from ${counts[lang].size} distinct)`;
}

for (const s of stats) console.log('  ' + s);
for (const lang of ['en', 'hi', 'bn']) console.log(finalize(lang));
