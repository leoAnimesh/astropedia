/**
 * Curated Bhagavad Gita verses for Krishna mode. The app picks the verse and
 * prints it under Krishna's reply; the model only writes the reply, so it can
 * never misquote scripture. Verses per theme were curated in ml/data
 * (verse_themes.json) and are the same ones the model was trained with.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CURATED: {
  themes: Record<string, string[]>;
  verses: Record<string, { ref: string; text: string; prompt: string; text_hi?: string; text_bn?: string }>;
} = require('@/assets/gita-corpus/curated-verses.json');

// `text` is K. T. Telang's public-domain English translation (1882), shown in
// English and also used as the model's prompt; `text_hi` / `text_bn` are
// Astropedia's own renderings for display (see assets/gita-corpus/README.md).
export type GitaVerse = { id: string; ref: string; text: string; prompt: string; text_hi?: string; text_bn?: string };

// Keyword cues per theme; the first theme with the most hits wins.
const THEME_CUES: Record<string, RegExp> = {
  loss:          /\b(died|death|passed away|lost (my|our)|grief|grieving|funeral|miss (him|her|them)|gone forever)\b/i,
  anxiety:       /\b(anxious|anxiety|worr(y|ied|ying)|panic|scared|afraid|fear|overthink|stress(ed)?|nervous)\b/i,
  purpose:       /\b(purpose|meaning(less)?|pointless|lost in life|what('s| is) the point|direction|empty|hollow)\b/i,
  relationships: /\b(partner|boyfriend|girlfriend|husband|wife|breakup|broke up|left me|lonely|alone|friend(s)?|marriage|divorce)\b/i,
  anger:         /\b(angry|anger|furious|hate|rage|betray(ed)?|resent|annoyed|frustrated|mad at)\b/i,
  duty:          /\b(duty|responsib|parents want|family wants|should i|obligation|trapped|choose between|career or)\b/i,
  failure:       /\b(fail(ed|ure)?|lost my job|fired|rejected|didn'?t (get|make|pass)|couldn'?t finish|mistake|not good enough)\b/i,
  gratitude:     /\b(grateful|thankful|thank god|blessed|peaceful|happy today|going well|calm|content)\b/i,
};

// The same themes in Hindi and Bengali. No \b: JavaScript word boundaries
// only know ASCII letters.
const NATIVE_CUES: Record<string, RegExp> = {
  loss:          /(मृत्यु|मौत|गुज़र गए|गुजर गए|गुज़र गई|खो दिया|शोक|মারা গেছে|মারা গেলেন|মৃত্যু|হারিয়েছি|শোক)/,
  anxiety:       /(चिंता|डर|घबराहट|तनाव|बेचैन|চিন্তা|দুশ্চিন্তা|ভয়|টেনশন|অস্থির)/,
  purpose:       /(मकसद|मतलब|खालीपन|बेकार लग|উদ্দেশ্য|মানে খুঁজে|শূন্য লাগ|অর্থহীন)/,
  relationships: /(पति|पत्नी|प्यार|ब्रेकअप|अकेला|अकेली|शादी|दोस्त|স্বামী|স্ত্রী|প্রেম|ব্রেকআপ|একা|বিয়ে|বন্ধু)/,
  anger:         /(गुस्सा|नफरत|नफ़रत|धोखा|रंजिश|রাগ|ঘৃণা|বিশ্বাসঘাতক|ধোঁকা)/,
  duty:          /(ज़िम्मेदारी|जिम्मेदारी|माता-पिता|फ़र्ज़|फर्ज|কর্তব্য|দায়িত্ব|বাবা-মা)/,
  failure:       /(फेल|हार गया|हार गई|नौकरी चली गई|असफल|गलती|ফেল|ব্যর্থ|চাকরি চলে গেছে|ভুল করে)/,
  gratitude:     /(शुक्रिया|आभारी|सुकून|खुश हूँ|খুশি|কৃতজ্ঞ|শান্তি লাগছে|ভালো লাগছে)/,
};

export function gitaThemeFor(message: string): string {
  let best = '';
  let bestHits = 0;
  for (const [theme, cue] of Object.entries(THEME_CUES)) {
    const native = NATIVE_CUES[theme];
    const hits = (message.match(new RegExp(cue.source, 'gi')) ?? []).length
      + (native ? (message.match(new RegExp(native.source, 'g')) ?? []).length : 0);
    if (hits > bestHits) {
      best = theme;
      bestHits = hits;
    }
  }
  // Nothing matched: a calm, general verse fits most heavy moments.
  return best || 'anxiety';
}

export function pickGitaVerse(message: string): GitaVerse {
  const ids = CURATED.themes[gitaThemeFor(message)] ?? Object.keys(CURATED.verses);
  const id = ids[Math.floor(Math.random() * ids.length)];
  return { id, ...CURATED.verses[id] };
}

const QUOTE_LABEL = { en: '— From the Gita', hi: '— गीता से', bn: '— গীতা থেকে' } as const;

/** Matches the start of the verse block in any language (to strip it from titles). */
export const GITA_QUOTE_START = /\n*\s*— (From the Gita|गीता से|গীতা থেকে)/;

/** The block printed under Krishna's reply, in the reply's language when a rendering exists. */
export function formatGitaQuote(verse: GitaVerse, lang: 'en' | 'hi' | 'bn' = 'en'): string {
  const text = (lang === 'hi' ? verse.text_hi : lang === 'bn' ? verse.text_bn : undefined) ?? verse.text;
  const label = text === verse.text ? QUOTE_LABEL.en : QUOTE_LABEL[lang];
  return `${label} (${verse.ref}):\n"${text}"`;
}
