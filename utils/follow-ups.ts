/*
 * Follow-up chips under Saga's latest reply, chosen from what the reply said.
 * Pure functions with no React Native or i18n imports (unit-tested in Node);
 * app/chat/[threadId].tsx renders the chips with t() and sends them with tAsk().
 *
 * Candidates, in this order (the first 3 the user hasn't already asked are shown):
 *  1. "What changes after {date}?" for the first future month/year in the reply;
 *  2. a plain question about the life area of a planet + house the reply named
 *     ("Saturn in your career house" → "What's ahead for my career?"), skipping
 *     the area the conversation is already about;
 *  3. one practical question for the topic of the exchange (love, career, …);
 *  4. "When exactly?" only if the reply named no month or year;
 *  5. "What should I do now?", "How will I know?".
 * The chips use everyday words: planet and house names never reach the text.
 */
import { findDates, hasDate, westernDigits, words } from './reply-guards';

export type FollowUpLang = 'en' | 'hi' | 'bn';
export type FollowUpArea =
  'money' | 'effort' | 'home' | 'love' | 'health' | 'relationship' | 'luck' | 'career' | 'income' | 'spending';
export type FollowUpTopic = 'love' | 'marriage' | 'career' | 'money' | 'health' | 'family' | 'study' | 'abroad';

export type FollowUp =
  | { key: 'after'; month: number | null; year: number }
  | { key: 'area'; area: FollowUpArea }
  | { key: 'topic'; topic: FollowUpTopic }
  | { key: 'when' | 'do' | 'know' };

/** i18n key of a chip in the chat namespace ("followUps.area.career"). */
export function followUpKey(c: FollowUp): string {
  switch (c.key) {
    case 'area':  return `followUps.area.${c.area}`;
    case 'topic': return `followUps.topic.${c.topic}`;
    default:      return `followUps.${c.key}`;
  }
}

const MONTH_LABELS: Record<FollowUpLang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর',
    'ডিসেম্বর'],
};

/**
 * "March 2031" / "मार्च 2031" / "মার্চ 2031" (Western digits: the i18next
 * nativeDigits postprocessor localises them for display; tAsk keeps them).
 */
export function monthYearLabel(month: number | null, year: number, lang: FollowUpLang): string {
  return month ? `${MONTH_LABELS[lang][month - 1]} ${year}` : String(year);
}

/** Interpolation values for a chip's i18n string in `lang`. */
export function followUpVars(c: FollowUp, lang: FollowUpLang): Record<string, string> | undefined {
  return c.key === 'after' ? { date: monthYearLabel(c.month, c.year, lang) } : undefined;
}

// ─── Lexicons (from ml/data/validate_answer.py) ──────────────────────────────

const PLANET_WORDS: Record<string, string[]> = {
  Sun: ['sun', 'सूर्य', 'सूरज', 'সূর্য'],
  Moon: ['moon', 'चंद्रमा', 'चंद्र', 'चन्द्रमा', 'चन्द्र', 'चाँद', 'चांद', 'চন্দ্র', 'চাঁদ', 'চন্দ্রমা'],
  Mercury: ['mercury', 'बुध', 'বুধ'],
  Venus: ['venus', 'शुक्र', 'শুক্র'],
  Mars: ['mars', 'मंगल', 'মঙ্গল'],
  Jupiter: ['jupiter', 'गुरु', 'बृहस्पति', 'गुरू', 'বৃহস্পতি', 'গুরু'],
  Saturn: ['saturn', 'शनि', 'शनिदेव', 'শনি', 'শনিদেব'],
  Rahu: ['rahu', 'राहु', 'राहू', 'রাহু'],
  Ketu: ['ketu', 'केतु', 'केतू', 'কেতু'],
};
// Slow planets first: their stretches are what people ask about.
const PLANET_ORDER = ['Saturn', 'Jupiter', 'Rahu', 'Ketu', 'Venus', 'Mars', 'Moon', 'Sun', 'Mercury'];
const BN_SUFFIX = ['ের', 'এর', 'র', 'কে', 'তে', 'ও', 'ই', 'য়ের', 'েরও', 'েরই', 'টা', 'টি', 'ে'];
const HI_SUFFIX = ['जी', 'देव'];

const PLANET_OF = new Map<string, string>();
for (const [p, forms] of Object.entries(PLANET_WORDS)) {
  for (const f of forms) {
    PLANET_OF.set(f, p);
    for (const s of [...BN_SUFFIX, ...HI_SUFFIX]) if (!/^[a-z]/.test(f)) PLANET_OF.set(f + s, p);
  }
}

// English context house names (utils/astrology.ts HOUSE_NAMES and older spellings).
const EN_HOUSE: Record<string, number> = {
  self: 1, money: 2, effort: 3, home: 4, romance: 5, partnership: 7, change: 8, luck: 9, career: 10,
  gains: 11, abroad: 12,
  'work and health': 6, 'rest and abroad': 12, 'effort and siblings': 3, 'romance and children': 5,
};

// Everyday house words in hi/bn replies; a word may stand for several houses,
// the words in one name are intersected ("কাজ আর স্বাস্থ্যের ঘরে" → 6).
const H = (...xs: number[]) => xs;
const INDIC_HOUSE_KEYS: Record<string, number[]> = {
  // Hindi
  'स्वभाव': H(1), 'व्यक्तित्व': H(1), 'पहचान': H(1),
  'पैसे': H(2), 'पैसा': H(2), 'पैसों': H(2), 'धन': H(2), 'बचत': H(2), 'वाणी': H(2), 'परिवार': H(2, 4), 'कमाई': H(2, 11),
  'हिम्मत': H(3), 'साहस': H(3), 'मेहनत': H(3), 'प्रयास': H(3), 'पराक्रम': H(3), 'बातचीत': H(3), 'भाई': H(3), 'बहन': H(3),
  'सुख': H(4), 'माँ': H(4), 'मां': H(4), 'मकान': H(4), 'घरेलू': H(4),
  'प्रेम': H(5, 7), 'प्यार': H(5, 7), 'रोमांस': H(5), 'संतान': H(5), 'बच्चों': H(5), 'पढ़ाई': H(5),
  'सेहत': H(6), 'स्वास्थ्य': H(6), 'रोग': H(6), 'दुश्मन': H(6), 'कर्ज़': H(6), 'कर्ज': H(6), 'काम': H(6, 10), 'नौकरी': H(6, 10),
  'शादी': H(7), 'विवाह': H(7), 'साझेदारी': H(7), 'पार्टनरशिप': H(7), 'जीवनसाथी': H(7), 'रिश्तों': H(5, 7), 'रिश्ते': H(5, 7),
  'बदलाव': H(8), 'परिवर्तन': H(8), 'अचानक': H(8), 'रहस्य': H(8),
  'भाग्य': H(9), 'किस्मत': H(9), 'क़िस्मत': H(9), 'धर्म': H(9), 'पिता': H(9),
  'करियर': H(10), 'कैरियर': H(10), 'पेशे': H(10), 'कर्म': H(10), 'प्रतिष्ठा': H(10),
  'लाभ': H(11), 'फ़ायदे': H(11), 'फायदे': H(11), 'आमदनी': H(11), 'दोस्तों': H(11), 'आय': H(2, 11),
  'आराम': H(12), 'विदेश': H(12), 'खर्च': H(12), 'ख़र्च': H(12), 'खर्चे': H(12), 'ख़र्चे': H(12), 'नींद': H(12), 'व्यय': H(12),
  // Bengali
  'ব্যক্তিত্বের': H(1), 'ব্যক্তিত্ব': H(1), 'স্বভাবের': H(1), 'নিজস্বতার': H(1),
  'টাকার': H(2), 'টাকাপয়সার': H(2), 'অর্থের': H(2), 'ধনের': H(2), 'সঞ্চয়ের': H(2), 'পরিবারের': H(2, 4),
  'উপার্জনের': H(2, 11), 'রোজগারের': H(2, 11), 'পয়সার': H(2),
  'সাহসের': H(3), 'পরিশ্রমের': H(3), 'চেষ্টার': H(3), 'ভাইবোনের': H(3), 'যোগাযোগের': H(3), 'উদ্যমের': H(3),
  'বাড়ির': H(4), 'সংসারের': H(4), 'সুখের': H(4), 'মায়ের': H(4),
  'প্রেমের': H(5, 7), 'ভালোবাসার': H(5, 7), 'সন্তানের': H(5), 'রোমান্সের': H(5), 'পড়াশোনার': H(5),
  'স্বাস্থ্যের': H(6), 'রোগের': H(6), 'শত্রুর': H(6), 'ঋণের': H(6), 'কাজের': H(6, 10), 'চাকরির': H(6, 10),
  'বিয়ের': H(7), 'বিবাহের': H(7), 'অংশীদারির': H(7), 'অংশীদারিত্বের': H(7), 'সঙ্গীর': H(7), 'জীবনসঙ্গীর': H(7),
  'সম্পর্কের': H(5, 7), 'দাম্পত্যের': H(7),
  'পরিবর্তনের': H(8), 'বদলের': H(8), 'রহস্যের': H(8), 'রূপান্তরের': H(8),
  'ভাগ্যের': H(9), 'কপালের': H(9), 'ধর্মের': H(9), 'বাবার': H(9),
  'কর্মজীবনের': H(10), 'ক্যারিয়ারের': H(10), 'কেরিয়ারের': H(10), 'পেশার': H(10), 'কর্মের': H(10),
  'লাভের': H(11), 'আয়ের': H(2, 11), 'বন্ধুদের': H(11), 'ইচ্ছাপূরণের': H(11), 'প্রাপ্তির': H(11),
  'বিদেশের': H(12), 'বিশ্রামের': H(12), 'খরচের': H(12), 'ব্যয়ের': H(12), 'ঘুমের': H(12),
};
const INDIC_HOUSE_WORD = new Set(['घर', 'घरों', 'ঘর', 'ঘরে', 'ঘরের', 'ঘরটা', 'ঘরটি', 'ঘরেই', 'ঘরও']);
const INDIC_CONNECT = new Set(['वाले', 'वाला', 'वाली', 'के', 'की', 'का', 'और', 'व', 'एवं', 'तथा', 'से', 'जुड़े',
  'আর', 'ও', 'এবং', 'বা', 'সংক্রান্ত']);

const HOUSE_AREA: Record<number, FollowUpArea> = {
  2: 'money', 3: 'effort', 4: 'home', 5: 'love', 6: 'health', 7: 'relationship', 9: 'luck', 10: 'career',
  11: 'income', 12: 'spending',
};

// Topic words: English stems (prefix match), Hindi words (exact), Bengali words (+ case endings).
const TOPIC_WORDS: Record<FollowUpTopic, string[]> = {
  love: ['love', 'relationship', 'romance', 'romantic', 'boyfriend', 'girlfriend', 'crush', 'dating', 'partner',
    'प्यार', 'प्रेम', 'रिश्ता', 'रिश्ते', 'रिश्तों', 'मोहब्बत', 'पार्टनर', 'बॉयफ्रेंड', 'गर्लफ्रेंड',
    'প্রেম', 'ভালোবাসা', 'সম্পর্ক', 'প্রেমিক', 'প্রেমিকা'],
  marriage: ['marriage', 'married', 'marry', 'wedding', 'spouse', 'husband', 'wife',
    'शादी', 'विवाह', 'ब्याह', 'जीवनसाथी', 'पति', 'पत्नी',
    'বিয়ে', 'বিবাহ', 'স্বামী', 'স্ত্রী', 'জীবনসঙ্গী'],
  career: ['job', 'jobs', 'career', 'work', 'promotion', 'office', 'business', 'profession', 'interview', 'boss',
    'नौकरी', 'करियर', 'कैरियर', 'काम', 'प्रमोशन', 'बिज़नेस', 'बिजनेस', 'व्यापार', 'व्यवसाय', 'इंटरव्यू',
    'চাকরি', 'কেরিয়ার', 'ক্যারিয়ার', 'কাজ', 'ব্যবসা', 'প্রমোশন', 'ইন্টারভিউ'],
  money: ['money', 'finance', 'financial', 'wealth', 'salary', 'savings', 'invest', 'debt', 'loan', 'income',
    'पैसा', 'पैसे', 'पैसों', 'धन', 'कमाई', 'आमदनी', 'बचत', 'निवेश', 'कर्ज', 'कर्ज़', 'सैलरी',
    'টাকা', 'টাকাপয়সা', 'অর্থ', 'আয়', 'সঞ্চয়', 'বিনিয়োগ', 'ঋণ', 'বেতন'],
  health: ['health', 'illness', 'sick', 'pain', 'doctor', 'disease', 'medical',
    'सेहत', 'स्वास्थ्य', 'बीमारी', 'दर्द', 'डॉक्टर', 'तबीयत', 'इलाज',
    'স্বাস্থ্য', 'শরীর', 'অসুখ', 'ব্যথা', 'ডাক্তার', 'চিকিৎসা'],
  family: ['family', 'mother', 'father', 'parents', 'siblings',
    'परिवार', 'माँ', 'मां', 'पिता', 'माता', 'माता-पिता', 'घरवाले',
    'পরিবার', 'মা', 'বাবা', 'সংসার', 'বাবা-মা'],
  study: ['study', 'studies', 'studying', 'exam', 'college', 'school', 'education', 'university',
    'पढ़ाई', 'परीक्षा', 'एग्ज़ाम', 'एग्जाम', 'कॉलेज', 'स्कूल',
    'পড়াশোনা', 'পরীক্ষা', 'কলেজ', 'স্কুল'],
  abroad: ['abroad', 'foreign', 'overseas', 'visa', 'relocate', 'relocation', 'emigrate',
    'विदेश', 'वीज़ा', 'वीजा', 'परदेस',
    'বিদেশ', 'ভিসা'],
};
const TOPIC_ORDER = Object.keys(TOPIC_WORDS) as FollowUpTopic[];
// Areas a topic chip already covers (the area chip then picks another one).
const TOPIC_AREAS: Record<FollowUpTopic, FollowUpArea[]> = {
  love: ['love', 'relationship'], marriage: ['relationship', 'love'], career: ['career'],
  money: ['money', 'income'], health: ['health'], family: ['home'], study: ['love'], abroad: ['spending'],
};

const TOPIC_OF = new Map<string, FollowUpTopic>();
const EN_TOPIC_STEMS: [string, FollowUpTopic][] = [];
for (const topic of TOPIC_ORDER) {
  for (const w of TOPIC_WORDS[topic]) {
    if (/^[a-z]/.test(w)) EN_TOPIC_STEMS.push([w, topic]);
    else {
      TOPIC_OF.set(w, topic);
      if (/[ঀ-৿]/.test(w)) for (const s of BN_SUFFIX) TOPIC_OF.set(w + s, topic);
    }
  }
}

function topicOfWord(w: string): FollowUpTopic | undefined {
  const t = TOPIC_OF.get(w);
  if (t) return t;
  if (!/^[a-z]+$/.test(w)) return undefined;
  for (const [stem, topic] of EN_TOPIC_STEMS) {
    if (w === stem || (stem.length >= 4 && w.startsWith(stem) && w.length - stem.length <= 4)) return topic;
  }
  return undefined;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

type HouseHit = { at: number; house: number; span: number[] };

function clauses(text: string): string[][] {
  return text.normalize('NFC').split(/[.,;:!?।॥\n—–()]+/).map(c => words(c)).filter(ws => ws.length > 0);
}

function housesIn(ws: string[]): HouseHit[] {
  const out: HouseHit[] = [];
  ws.forEach((w, k) => {
    if (w === 'house') {
      for (const n of [3, 1]) {
        const name = ws.slice(Math.max(0, k - n), k).join(' ');
        if (k - n >= 0 && EN_HOUSE[name]) {
          out.push({ at: k, house: EN_HOUSE[name], span: Array.from({ length: n + 1 }, (_, i) => k - n + i) });
          return;
        }
      }
      return;
    }
    if (!INDIC_HOUSE_WORD.has(w)) return;
    let cands: number[] | null = null;
    const span = [k];
    for (let j = k - 1; j >= 0 && j >= k - 6; j--) {
      const keys = INDIC_HOUSE_KEYS[ws[j]];
      if (keys) {
        cands = cands ? cands.filter(h => keys.includes(h)) : keys;
        span.push(j);
      } else if (INDIC_CONNECT.has(ws[j])) {
        span.push(j);
      } else break;
    }
    if (cands && cands.length === 1) out.push({ at: k, house: cands[0], span });
  });
  return out;
}

/** Planet + house pairs a reply names ("Saturn in your career house"), in order. */
export function planetHousePairs(reply: string): { planet: string; house: number }[] {
  const out: { planet: string; house: number }[] = [];
  for (const ws of clauses(reply)) {
    const planets = ws.map((w, i) => ({ i, p: PLANET_OF.get(w) })).filter(x => x.p) as { i: number; p: string }[];
    for (const h of housesIn(ws)) {
      const first = Math.min(...h.span);
      const before = planets.filter(x => x.i < first && first - x.i <= 8).pop();
      const after = planets.find(x => x.i > h.at && x.i - h.at <= 4);
      const hit = before ?? after;
      if (hit) out.push({ planet: hit.p, house: h.house });
    }
  }
  return out;
}

/** The exchange's topic: question words count 3×, reply words 1× (house names ignored). */
export function detectTopic(question: string, reply: string): FollowUpTopic | null {
  const score = new Map<FollowUpTopic, number>();
  const add = (ws: string[], weight: number, skip = new Set<number>()) => ws.forEach((w, i) => {
    if (skip.has(i)) return;
    const t = topicOfWord(w);
    if (t) score.set(t, (score.get(t) ?? 0) + weight);
  });
  add(words(question), 3);
  for (const ws of clauses(reply)) add(ws, 1, new Set(housesIn(ws).flatMap(h => h.span)));
  let best: FollowUpTopic | null = null;
  for (const t of TOPIC_ORDER) if ((score.get(t) ?? 0) > (best ? score.get(best)! : 0)) best = t;
  return best;
}

export type FollowUpInput = {
  /** Saga's latest reply. */
  reply: string;
  /** The user's question it answers. */
  question?: string;
  /** Today (dates before next month are not "after" dates). */
  now?: Date;
  /**
   * The timing engine's windows for the question (utils/agent/pipeline.ts
   * planChipWindows). When given, the "after" chip only uses a reply date
   * inside them, else the best window's start, so chip dates always come
   * from the engine.
   */
  windows?: { start: Date; end: Date }[];
};

const ymKey = (y: number, m: number) => y * 12 + m - 1;
function inWindows(d: { year: number | null; month: number | null }, windows: { start: Date; end: Date }[]): boolean {
  if (d.year == null) return false;
  return windows.some((w) => {
    if (d.month == null) return w.start.getFullYear() <= d.year! && w.end.getFullYear() >= d.year!;
    const k = ymKey(d.year!, d.month);
    return k >= ymKey(w.start.getFullYear(), w.start.getMonth() + 1) - 1 && k <= ymKey(w.end.getFullYear(), w.end.getMonth() + 1) + 1;
  });
}

/** All candidate chips for a reply, best first (see the file comment). */
export function followUpCandidates({ reply, question = '', now = new Date(), windows }: FollowUpInput): FollowUp[] {
  const out: FollowUp[] = [];
  const nowKey = now.getFullYear() * 12 + now.getMonth() + 1;
  const future = findDates(reply).find(d => d.year != null &&
    (d.month ? d.year * 12 + d.month > nowKey : d.year > now.getFullYear()) &&
    (!windows?.length || inWindows(d, windows)));
  if (future) out.push({ key: 'after', month: future.month, year: future.year! });
  else if (windows?.length) out.push({ key: 'after', month: windows[0].start.getMonth() + 1, year: windows[0].start.getFullYear() });

  const topic = detectTopic(question, reply);
  const covered = topic ? TOPIC_AREAS[topic] : [];
  const areas = planetHousePairs(reply)
    .map((x, order) => ({ ...x, order, area: HOUSE_AREA[x.house] }))
    .filter(x => x.area && !covered.includes(x.area))
    .sort((a, b) => PLANET_ORDER.indexOf(a.planet) - PLANET_ORDER.indexOf(b.planet) || a.order - b.order);
  if (areas.length) out.push({ key: 'area', area: areas[0].area });
  if (topic) out.push({ key: 'topic', topic });

  if (!hasDate(reply)) out.push({ key: 'when' });
  out.push({ key: 'do' }, { key: 'know' });
  return out;
}

/** Lower-case letters and digits only, for comparing questions. */
export function normalizeQuestion(s: string): string {
  return words(westernDigits(s)).join(' ');
}

/**
 * The first `n` candidates whose texts (`texts(c)`: e.g. the shown label and the
 * sent question) the user hasn't already asked in this thread and that don't
 * repeat an earlier chip.
 */
export function pickFollowUps(
  candidates: FollowUp[], asked: string[], texts: (c: FollowUp) => string[], n = 3,
): FollowUp[] {
  const seen = new Set(asked.map(normalizeQuestion));
  const out: FollowUp[] = [];
  for (const c of candidates) {
    if (out.length >= n) break;
    const ts = texts(c).map(normalizeQuestion).filter(Boolean);
    if (ts.length === 0 || ts.some(t => seen.has(t))) continue;
    ts.forEach(t => seen.add(t));
    out.push(c);
  }
  return out;
}

// ─── Model-written chips (astro-gemma v2.1 "[followups]" task) ────────────────
//
// Pure helpers for utils/ai.ts suggestFollowUps (behind MODEL_FOLLOWUPS in
// utils/local-llm.ts). The prompt must stay byte-identical to
// ml/data/build_sft.py student_followups_system / followups_convo, and the
// checks follow ml/data/validate_answer.py validate_followups (format, length,
// script, astrology words, unsafe topics, "your", invented years, repeats of an
// asked question, duplicates).

/** One question + answer of the conversation the chips follow. */
export type FollowUpTurn = { user: string; assistant: string };
/** A chat message as the chat screen stores it. */
export type FollowUpMessage = { role: 'user' | 'assistant'; content: string };

/** Turns the model sees: the last few (the training data has 1-3; build_sft followups_convo). */
export const FOLLOWUPS_MAX_TURNS = 3;
/** New-token cap for the 3 lines (hi/bn questions take more tokens per word). */
export const FOLLOWUPS_MAX_TOKENS: Record<FollowUpLang, number> = { en: 48, hi: 64, bn: 64 };
export const FOLLOWUPS_TEMPERATURE = 0.2;
/** Model chips replace the rule-based ones only when at least this many pass the checks. */
export const MODEL_FOLLOWUPS_MIN = 2;
/** validate_answer.py FOLLOWUP_MAX_WORDS, plus a character cap for the chip width. */
export const FOLLOWUP_MAX_WORDS: Record<FollowUpLang, number> = { en: 8, hi: 9, bn: 8 };
export const FOLLOWUP_MAX_CHARS = 60;

/** build_sft.student_followups_system: "[followups]", plus "\nLang: hi|bn" for Hindi / Bengali. */
export function followUpsSystem(lang: FollowUpLang): string {
  return `[followups]${lang === 'en' ? '' : `\nLang: ${lang}`}`;
}

/** build_sft.followups_convo: "User: …\nAssistant: …" per turn, joined with "\n". */
export function followUpsConvo(turns: FollowUpTurn[]): string {
  return turns.map(tr => `User: ${tr.user.trim()}\nAssistant: ${tr.assistant.trim()}`).join('\n');
}

/**
 * The conversation's question/answer pairs, oldest first, ending with the
 * question `lastAnswer` replies to (the last user message in `history`). A
 * user message without a reply (an error bubble was dropped) is skipped. At
 * most `maxTurns`, newest kept.
 */
export function followUpTurns(
  history: FollowUpMessage[], lastAnswer: string, maxTurns = FOLLOWUPS_MAX_TURNS,
): FollowUpTurn[] {
  const turns: FollowUpTurn[] = [];
  let question: string | null = null;
  for (const m of history) {
    if (m.role === 'user') question = m.content;
    else if (question != null) {
      turns.push({ user: question, assistant: m.content });
      question = null;
    }
  }
  if (question != null) turns.push({ user: question, assistant: lastAnswer });
  return turns.slice(-maxTurns);
}

/** The [followups] request: system text and the one user turn (ai.ts adds the Gemma template). */
export function followUpsPrompt(turns: FollowUpTurn[], lang: FollowUpLang): { system: string; user: string } {
  return { system: followUpsSystem(lang), user: followUpsConvo(turns) };
}

// Lists from ml/data/validate_answer.py (FOLLOWUP_ASTRO, EN_SIGN, EN_SIGN_WORD,
// RULER_WORD, LABEL_WORD, FOLLOWUP_BAD_TOPIC = TOPICS death/child_sex/name + extras).
const EN_SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius',
  'capricorn', 'aquarius', 'pisces'];
// Hindi/Bengali sign names that are not also everyday words (कन्या "girl", सिंह "lion"/surname are left out).
const INDIC_SIGNS = ['मेष', 'वृषभ', 'मिथुन', 'कर्क', 'तुला', 'वृश्चिक', 'धनु', 'मकर', 'कुंभ', 'कुम्भ', 'मीन',
  'মেষ', 'বৃষ', 'মিথুন', 'কর্কট', 'তুলা', 'বৃশ্চিক', 'ধনু', 'মকর', 'কুম্ভ', 'মীন'];
const INDIC_SIGN_OF = new Set(INDIC_SIGNS.flatMap(s => [s, ...BN_SUFFIX.map(x => s + x)]));
const ASTRO_EN = new RegExp(
  `\\b(${EN_SIGNS.join('|')})s?\\b|\\b(zodiac|star signs?|sun signs?|moon signs?|rising signs?|my signs?|ascendant|` +
  'houses?|planets?|planetary|dashas?|mahadashas?|antardashas?|transits?|nakshatras?|kundli|lagna|rashi|sade\\s*sati|' +
  'retrograde|rulers?|ruled by|lords?|stretch(es)?|chapters?|sub-?periods?|life phases?)\\b', 'i');
const ASTRO_INDIC = /ग्रह|राशि|राशी|दशा|नक्षत्र|लग्न|कुंडली|कुण्डली|गोचर|साढ़े?\s*साती|स्वामी|अधिपति|अध्याय|(?:वाले|वाला|वाली)\s+घर(?![ऀ-ॿ])|गुरु का दौर|গ্রহ|রাশি|রাশী|দশা|নক্ষত্র|লগ্ন|কুণ্ডলী|কুন্ডলী|গোচর|সাড়ে\s*সাতি|অধিপতি|অধ্যায়|অধ্যায়/;
const BAD_TOPIC = new RegExp([
  // death / lifespan
  '\\bdie\\b|\\bdeath\\b|dying|lifespan|life span|how long will i live|years.{0,20}live|when will i die|मौत|मृत्यु',
  'मरूँगा|मरूंगा|मरूँगी|मरूंगी|मर जा|कब तक जी|आयु|कितने साल जी|উমর|মৃত্যু|মারা যা|আয়ু|কতদিন বাঁচ|কত দিন বাঁচ',
  '\\bmaut\\b|\\bmarunga\\b|\\bmrityu\\b|kobe morbo|\\bayu\\b',
  // baby's sex
  'boy or (a )?girl|girl or (a )?boy|son or (a )?daughter|baby boy|baby girl|बेटा या बेटी|बेटी या बेटा',
  'लड़का या लड़की|लड़की या लड़का|लड़का होगा|बेटा होगा|ছেলে না মেয়ে|মেয়ে না ছেলে|ছেলে হবে|মেয়ে হবে',
  'chele na meye|ladka ya ladki|beta ya beti',
  // names / initials
  '\\bname\\b|\\binitial|first letter|नाम|অক্ষর|নাম|\\bnaam\\b|\\bnam ki\\b',
  // lottery, remedies
  'उम्र कितनी|lottery|लॉटरी|লটারি|gemstone|रत्न|রত্ন|पूजा|পুজো|\\bpuja\\b|upay|उपाय|প্রতিকার',
].join('|'), 'i');

/** Script a chip must be in: English in Latin letters, hi in Devanagari, bn in Bengali (no other letters). */
function rightScript(s: string, lang: FollowUpLang): boolean {
  const latin = /[A-Za-z]/.test(s);
  const deva = /[ऀ-ॣ०-ॿ]/.test(s); // । ॥ (U+0964/5) are shared punctuation
  const beng = /[ঀ-৿]/.test(s);
  if (lang === 'en') return latin && !deva && !beng;
  if (lang === 'hi') return deva && !latin && !beng;
  return beng && !latin && !deva;
}

/** Words as validate_answer.py counts them (en: whitespace split; hi/bn: INDIC_WORD runs). */
function followUpWordCount(s: string, lang: FollowUpLang): number {
  if (lang === 'en') return s.trim().split(/\s+/).filter(Boolean).length;
  return (s.match(/[^\s.,!?;:।॥"'“”‘’()[\]{}<>—–\-/*_|…]+/g) ?? []).length;
}

function hasAstroWords(s: string, lang: FollowUpLang): boolean {
  if (ASTRO_EN.test(s) || ASTRO_INDIC.test(s)) return true;
  return words(s).some(w => PLANET_OF.has(w) || (lang !== 'en' && INDIC_SIGN_OF.has(w)));
}

/** validate_answer._qset: the lower-cased words of a question. */
function qset(q: string): Set<string> {
  return new Set(words(westernDigits(q)));
}

// validate_answer._skeleton: consonant skeletons, so "amar biye kobe hobe?" ~ "আমার বিয়ে কবে হবে?".
// Devanagari and Bengali share their layout (Bengali = Devanagari + 0x80), so one table by offset.
const IND_CONS = new Map<number, string>();
[...'kkggnccjjnttddnttddnnppbbmjrrlllbsssh'].forEach((c, i) => IND_CONS.set(0x15 + i, c));
IND_CONS.set(0x5c, 'r').set(0x5d, 'r').set(0x5f, 'j').set(0x02, 'n');
const LAT_SKEL: Record<string, string> = { v: 'b', w: 'b', y: 'j', z: 'j', f: 'p', q: 'k', x: 'k' };

function skeleton(word: string): string {
  let out = '';
  for (const ch of word.toLowerCase().normalize('NFD')) {
    const o = ch.codePointAt(0)!;
    if (o >= 0x0900 && o <= 0x09ff) out += IND_CONS.get((o - 0x0900) % 0x80) ?? '';
    else if (ch >= 'a' && ch <= 'z' && !'aeiouh'.includes(ch)) out += LAT_SKEL[ch] ?? ch;
  }
  return out.replace(/(.)\1+/g, '$1').replace(/h/g, '');
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

/** validate_answer._similar: same question in other words (≥ 60% shared words or, across scripts, skeletons). */
export function similarQuestion(a: string, b: string, lang: FollowUpLang): boolean {
  if (jaccard(qset(a), qset(b)) >= 0.6) return true;
  if (lang !== 'en' && /[A-Za-z]/.test(a + b)) {
    const sk = (q: string) => new Set(words(westernDigits(q)).map(skeleton).filter(Boolean));
    return jaccard(sk(a), sk(b)) >= 0.6;
  }
  return false;
}

/** One model line without numbering, bullets, markdown or wrapping quotes. */
export function cleanFollowUpLine(line: string): string {
  return line
    .replace(/<end_of_turn>|<eos>/g, '')
    .replace(/\*\*/g, '')
    .trim()
    .replace(/^(?:(?:\d+|[०-९]+|[০-৯]+)\s*[.)\]:-]|[-*•·–—]|Q\d+\s*[.):]?)\s*/i, '')
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim();
}

export type FollowUpReject =
  | 'no_qmark' | 'too_long' | 'too_short' | 'script' | 'jargon' | 'topic' | 'second_person' | 'date'
  | 'asked' | 'duplicate';

/**
 * Why a cleaned chip is unusable, or null. `asked`: the user's questions in this
 * thread; `earlier`: chips already accepted; `convo`: the conversation text
 * (years in a chip must come from it).
 */
export function rejectFollowUp(
  chip: string, lang: FollowUpLang, asked: string[], earlier: string[] = [], convo = '',
): FollowUpReject | null {
  if (!/[?？]$/.test(chip)) return 'no_qmark';
  const n = followUpWordCount(chip, lang);
  if (n > FOLLOWUP_MAX_WORDS[lang] || chip.length > FOLLOWUP_MAX_CHARS) return 'too_long';
  if (n < 2) return 'too_short';
  if (!rightScript(chip, lang)) return 'script';
  if (hasAstroWords(chip, lang)) return 'jargon';
  if (BAD_TOPIC.test(chip.normalize('NFC'))) return 'topic';
  if (lang === 'en' && /\byour\b/i.test(chip)) return 'second_person';
  const years = new Set(findDates(convo).map(d => d.year).filter(y => y != null));
  if (findDates(chip).some(d => d.year != null && !years.has(d.year))) return 'date';
  if (asked.some(q => similarQuestion(chip, q, lang))) return 'asked';
  if (earlier.some(q => similarQuestion(chip, q, lang))) return 'duplicate';
  return null;
}

/**
 * The model's output → 0-3 usable chips: non-empty lines, cleaned
 * (cleanFollowUpLine), each checked with rejectFollowUp, first 3 kept.
 */
export function parseModelFollowUps(
  text: string, lang: FollowUpLang, asked: string[], convo = '',
): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (out.length >= 3) break;
    const chip = cleanFollowUpLine(raw);
    if (chip && rejectFollowUp(chip, lang, asked, out, convo) == null) out.push(chip);
  }
  return out;
}

/** Runs the model: (system, user, maxNewTokens, temperature, onText) → full text. */
export type FollowUpsRunner = (
  req: { system: string; user: string; maxNewTokens: number; temperature: number },
  onText: (textSoFar: string) => boolean | void,
) => Promise<string>;

/**
 * Model chips for the reply `lastAnswer` (see utils/ai.ts suggestFollowUps).
 * Returns [] without calling `run` when `enabled` is false. `fits` may drop
 * the oldest turns until the prompt fits the context window. Generation stops
 * once 3 lines are complete or `isCancelled()` turns true (then returns []).
 */
export async function generateFollowUps(
  run: FollowUpsRunner,
  { enabled, history, lastAnswer, lang, isCancelled = () => false, fits = () => true }: {
    enabled: boolean;
    history: FollowUpMessage[];
    lastAnswer: string;
    lang: FollowUpLang;
    isCancelled?: () => boolean;
    fits?: (prompt: { system: string; user: string }) => boolean;
  },
): Promise<string[]> {
  if (!enabled || !lastAnswer.trim() || isCancelled()) return [];
  let turns = followUpTurns(history, lastAnswer);
  if (turns.length === 0) return [];
  while (turns.length > 1 && !fits(followUpsPrompt(turns, lang))) turns = turns.slice(1);
  const prompt = followUpsPrompt(turns, lang);
  const text = await run(
    { ...prompt, maxNewTokens: FOLLOWUPS_MAX_TOKENS[lang], temperature: FOLLOWUPS_TEMPERATURE },
    // Three finished lines are all we use.
    soFar => isCancelled() || soFar.trimStart().split('\n').length > 3,
  );
  if (isCancelled()) return [];
  const asked = history.filter(m => m.role === 'user').map(m => m.content);
  const convo = history.map(m => m.content).concat(lastAnswer).join('\n');
  return parseModelFollowUps(text, lang, asked, convo);
}

/** A chip as the chat screen renders it: shown label and the question sent on tap. */
export type ChipView = { id: string; label: string; ask: string };

/**
 * The chips to show: the model's chips alone (label = sent text, already in the
 * reply language, up to 3) when it gave at least MODEL_FOLLOWUPS_MIN; otherwise
 * the rule-based ones (the same array). Never a mix: the user sees only
 * model-written questions, or only the fallback set.
 */
export function mergeFollowUps(rule: ChipView[], model: string[] | null | undefined, _lang: FollowUpLang = 'en'): ChipView[] {
  if (!model || model.length < MODEL_FOLLOWUPS_MIN) return rule;
  return model.slice(0, 3).map(q => ({ id: `model:${q}`, label: q, ask: q }));
}
