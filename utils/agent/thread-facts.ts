/**
 * Per-thread facts memory: what the user has told us about themselves in this
 * conversation ("but I'm already married", "I meant my sister", "I'm a
 * woman", "I'm not religious"), so a later turn is planned with it even after
 * the message has scrolled out of the history the pipeline sees (the chat
 * keeps the last 12 messages; the facts are stored with the thread,
 * threads.facts, and folded with what the visible history says).
 *
 * Pure (no React Native, no i18n). en / hi / bn and Hinglish / Banglish.
 * Statements, not questions: "will I get married" never sets `married`.
 */
import type { Relation } from './intent';

export type ThreadFacts = {
  v: 1;
  /** Already married (true) / single or divorced (false). */
  married?: boolean;
  divorced?: boolean;
  /** Has a job now (true) / unemployed or resigned (false). */
  employed?: boolean;
  student?: boolean;
  hasChildren?: boolean;
  pregnant?: boolean;
  inRelationship?: boolean;
  gender?: 'woman' | 'man' | 'nonbinary';
  /** Not religious: remedies are secular habits only. */
  secular?: boolean;
  /** Lives abroad already. */
  abroad?: boolean;
  /**
   * Whose chart the thread is about after a correction ("I was asking about
   * my sister, not me" → sister; "no, about me" → self). Undefined = as typed.
   */
  subject?: Relation | 'self';
};

export const EMPTY_FACTS: ThreadFacts = { v: 1 };

const nfc = (s: string) => s.normalize('NFC').toLowerCase().replace(/[’`]/g, "'");
const rx = (parts: string[]) => new RegExp(parts.join('|').normalize('NFC'), 'i');

const MARRIED = rx([
  "\\b(?:i'?m|i am|we'?re|we are) (?:already |happily )?married\\b", '\\balready married\\b', '\\bi (?:got|was|have been) married\\b',
  '\\bmarried (?:for|since|last|two|\\d)', '\\b(?:my|our) (?:marriage|wedding) (?:was|happened|took place)\\b',
  '\\bmarried (?:hoon|hu|hun|achhi|achi)\\b', '\\bshaa?di (?:ho (?:chuki|gayi|gai)|hui thi|ho gayi thi)', '\\bshaa?dishuda\\b',
  '\\bbiye (?:hoye ?(?:geche|gechhe|gache)|to hoye)', '\\bbibahito\\b', '\\balready bibahito\\b',
  'शादीशुदा', 'शादी (?:तो )?(?:पिछले साल )?हो (?:चुकी|गई|गयी)', 'विवाहित', 'बीवी है', 'पत्नी है', 'पति है',
  'বিবাহিত', 'বিয়ে (?:তো )?হয়ে (?:গেছে|গিয়েছে)', 'বিয়ে (?:তো )?হয়ে (?:গেছে|গিয়েছে)', 'আমার তো বিয়ে', 'আমার তো বিয়ে',
]);
const SINGLE = rx([
  "\\b(?:i'?m|i am) (?:still )?(?:single|unmarried|not married)\\b", "\\bnot married\\b", '\\bunmarried\\b', 'अविवाहित', 'शादी नहीं हुई', 'অবিবাহিত', 'বিয়ে হয়নি',
]);
const DIVORCED = rx(["\\b(?:i'?m|i am|i got|after my) divorced?\\b", '\\bafter (?:my|the) divorce\\b', 'तलाकशुदा', 'तलाक हो (?:चुका|गया)', 'ডিভোর্সি', 'ডিভোর্স হয়ে গেছে']);
const EMPLOYED = rx([
  "\\bi (?:already )?(?:have|got) (?:a )?job\\b", "\\b(?:i'?m|i am) (?:already )?(?:employed|working)\\b", '\\balready (?:have a job|employed|working)\\b',
  '\\bmy current (?:company|job|role)\\b', '\\b(?:job|naukri) (?:to )?hai\\b', '\\bjob to hai\\b', '\\bchakri (?:to )?kori\\b', '\\bchakri (?:to )?ache\\b',
  'नौकरी (?:तो )?(?:है|करता|करती|लग (?:गई|गयी|चुकी))', 'जॉब (?:तो )?है', 'আমি তো চাকরি করি', 'চাকরি (?:তো )?(?:করি|আছে|করছি)',
]);
const UNEMPLOYED = rx([
  "\\b(?:i'?m|i am|been) unemployed\\b", '\\bunemployed\\b', '\\bi (?:lost|quit) my job\\b', '\\bi resigned\\b', '\\bjobless\\b',
  '\\bnaukri chali gayi\\b', '\\bchakri nei\\b', '\\bchakri chole geche\\b', 'नौकरी नहीं है', 'नौकरी चली गई', 'बेरोज़गार', 'বেকার', 'চাকরি নেই', 'চাকরি চলে গেছে',
]);
const NOT_STUDENT = rx(["\\b(?:i'?m|i am) not a student\\b", '\\bnot studying\\b', 'मैं स्टूडेंट नहीं', 'मैं छात्र नहीं', 'আমি ছাত্র নই', 'আমি ছাত্রী নই']);
const STUDENT = rx(["\\b(?:i'?m|i am) (?:a )?(?:student|in college|in school|in class \\d+)\\b", 'मैं (?:स्टूडेंट|छात्र|छात्रा) हूँ', 'আমি (?:ছাত্র|ছাত্রী)']);
const CHILDREN = rx(["\\bwe (?:have|already have) (?:a |two |\\d )?(?:kids?|child(?:ren)?|son|daughter)\\b", "\\bi (?:have|already have) (?:a |two |\\d )?(?:kids?|child(?:ren)?|son|daughter)\\b", 'बच्चे हैं', 'बच्चा है', 'সন্তান আছে', 'বাচ্চা আছে']);
const PREGNANT = rx(["\\b(?:i'?m|i am|she'?s|my wife is) (?:\\d+ (?:weeks|months) )?pregnant\\b", "\\bwe'?re expecting\\b", 'प्रेग्नेंट हूँ', 'गर्भवती', 'অন্তঃসত্ত্বা', 'প্রেগন্যান্ট']);
const WOMAN = rx(["\\b(?:i'?m|i am) (?:a )?(?:woman|girl|female|lady)\\b", 'मैं (?:एक )?(?:लड़की|लड़की|महिला|औरत) हूँ', 'আমি (?:একজন )?(?:মেয়ে|মহিলা)', '\\bmain ladki hu\\b', '\\bami meye\\b']);
const MAN = rx(["\\b(?:i'?m|i am) (?:a )?(?:man|guy|boy|male)\\b", 'मैं (?:एक )?(?:लड़का|लड़का|पुरुष|आदमी) हूँ', 'আমি (?:একজন )?(?:ছেলে|পুরুষ)', '\\bmain ladka hu\\b', '\\bami chele\\b']);
const NONBINARY = rx(["\\b(?:i'?m|i am) (?:non-?binary|enby|genderqueer)\\b"]);
const SECULAR = rx(["\\b(?:i'?m|i am) (?:not religious|an atheist|atheist|not a believer)\\b", "\\bi don'?t (?:believe in|follow) (?:god|religion|rituals)\\b", '\\bnot religious\\b', 'नास्तिक', 'धार्मिक नहीं', 'নাস্তিক', 'ধার্মিক নই']);
const ABROAD = rx(["\\bi (?:live|work|am settled|already live) (?:abroad|in (?:the )?(?:us|usa|uk|canada|australia|germany|dubai))\\b", '\\balready abroad\\b', 'मैं विदेश में (?:रहता|रहती)', 'আমি বিদেশে থাকি']);
const IN_RELATIONSHIP = rx(["\\bi have a (?:girlfriend|boyfriend|partner)\\b", "\\b(?:i'?m|i am|we'?re) (?:in a relationship|dating|together)\\b", 'मेरी गर्लफ्रेंड है', 'मेरा बॉयफ्रेंड है', 'আমার প্রেম আছে']);

/** "I was asking about my sister, not me" / "meri nahi, meri behen ki" / "amar na, amar boner". */
const SUBJECT_OTHER = rx([
  "\\b(?:i (?:was|am|'m) asking|i meant|i mean|asking|question (?:is|was)) (?:about |for )?(?:my |for my )", '\\bnot (?:me|mine|about me)\\b',
  '\\bmeri nahi\\b', '\\bmera nahi\\b', '\\bamar na\\b', '\\bamar noy\\b', 'मेरी नहीं', 'मेरा नहीं', 'मेरे बारे में नहीं', 'আমার না', 'আমার নয়', 'আমার নয়',
]);
const SUBJECT_SELF = rx([
  "\\b(?:no,? )?(?:about|for) me\\b", "\\bi (?:was|am|'m) asking about (?:me|myself)\\b", '\\bmeri baat\\b', '\\bmere baare me\\b', '\\bamar kotha\\b',
  'मेरे बारे में पूछ', 'मेरी बात', 'আমার কথা বলছি', 'আমার কথা জিজ্ঞেস',
]);

/** A message states a fact about the user (or corrects whose chart the thread is about). */
export function factsFromMessage(message: string, relationIn?: (q: string) => Relation | null): Partial<ThreadFacts> {
  const q = nfc(message);
  const out: Partial<ThreadFacts> = {};
  if (DIVORCED.test(q)) { out.divorced = true; out.married = false; }
  else if (MARRIED.test(q)) out.married = true;
  else if (SINGLE.test(q)) out.married = false;
  if (UNEMPLOYED.test(q)) out.employed = false;
  else if (EMPLOYED.test(q)) out.employed = true;
  if (NOT_STUDENT.test(q)) out.student = false;
  else if (STUDENT.test(q)) out.student = true;
  if (CHILDREN.test(q)) out.hasChildren = true;
  if (PREGNANT.test(q)) out.pregnant = true;
  if (NONBINARY.test(q)) out.gender = 'nonbinary';
  else if (WOMAN.test(q)) out.gender = 'woman';
  else if (MAN.test(q)) out.gender = 'man';
  if (SECULAR.test(q)) out.secular = true;
  if (ABROAD.test(q)) out.abroad = true;
  if (IN_RELATIONSHIP.test(q)) out.inRelationship = true;
  const rel = relationIn?.(q) ?? null;
  if (rel && SUBJECT_OTHER.test(q)) out.subject = rel;
  else if (SUBJECT_SELF.test(q)) out.subject = 'self';
  return out;
}

/** True when the message corrects the thread (a fact or whose chart), not just asks. */
export function isCorrection(message: string, relationIn?: (q: string) => Relation | null): boolean {
  return Object.keys(factsFromMessage(message, relationIn)).length > 0;
}

/** Fold stored facts and every user message of the visible history (oldest first) into the thread's facts. */
export function threadFacts(userMessages: string[], stored?: ThreadFacts | null, relationIn?: (q: string) => Relation | null): ThreadFacts {
  let f: ThreadFacts = { ...EMPTY_FACTS, ...(stored ?? {}) };
  for (const m of userMessages) f = { ...f, ...factsFromMessage(m, relationIn) };
  return f;
}

export function serializeFacts(f: ThreadFacts): string | null {
  const keys = Object.keys(f).filter(k => k !== 'v');
  return keys.length ? JSON.stringify(f) : null;
}

export function parseFacts(raw: string | null | undefined): ThreadFacts {
  if (!raw) return { ...EMPTY_FACTS };
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? { ...EMPTY_FACTS, ...o, v: 1 } : { ...EMPTY_FACTS };
  } catch {
    return { ...EMPTY_FACTS };
  }
}
