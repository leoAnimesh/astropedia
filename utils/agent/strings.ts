/**
 * Localized sentences for the deterministic answers (TemplateRenderer) and
 * the timing repair. Kept in TypeScript, not locales/*.json, so the agent
 * layers stay pure and Node-testable (like utils/follow-ups.ts month names).
 * Plain language only: no house numbers, sign names or dasha words.
 * Placeholders: {area} {areaGen} (bn genitive) {start} {end} {peak} {name}
 * {age} {owner} {relation}.
 */
import type { TimingTopic } from '../timing-engine';
import { nativeDigits } from '../reply-guards';

export type Lang = 'en' | 'hi' | 'bn';

/** Topic as a noun phrase: en "marriage", hi "शादी" (takes का/के लिए), bn nominative. */
export const AREA: Record<Lang, Record<TimingTopic, string>> = {
  en: {
    marriage: 'marriage', love: 'love', job: 'a new job', promotion: 'career growth', business: 'business',
    money: 'money', property: 'buying a home or property', children: 'children', education: 'studies',
    foreign: 'going abroad', health: 'health and energy', legal: 'legal matters', general: 'luck',
  },
  hi: {
    marriage: 'शादी', love: 'प्रेम जीवन', job: 'नई नौकरी', promotion: 'करियर में तरक्की', business: 'व्यापार',
    money: 'धन', property: 'घर या संपत्ति', children: 'संतान', education: 'पढ़ाई', foreign: 'विदेश जाने',
    health: 'सेहत में सुधार', legal: 'कानूनी मामलों', general: 'भाग्य',
  },
  bn: {
    marriage: 'বিয়ে', love: 'প্রেম', job: 'নতুন চাকরি', promotion: 'কাজে উন্নতি', business: 'ব্যবসা',
    money: 'টাকাপয়সা', property: 'বাড়ি বা সম্পত্তি কেনা', children: 'সন্তান', education: 'পড়াশোনা',
    foreign: 'বিদেশযাত্রা', health: 'সুস্থতা', legal: 'আইনি বিষয়', general: 'ভাগ্য',
  },
};

/** Bengali genitive ("বিয়ের"), for "…র জন্য" / "…র সঙ্গে". */
export const AREA_GEN_BN: Record<TimingTopic, string> = {
  marriage: 'বিয়ের', love: 'প্রেমের', job: 'নতুন চাকরির', promotion: 'কাজে উন্নতির', business: 'ব্যবসার',
  money: 'টাকাপয়সার', property: 'বাড়ি বা সম্পত্তি কেনার', children: 'সন্তানের', education: 'পড়াশোনার',
  foreign: 'বিদেশযাত্রার', health: 'সুস্থতার', legal: 'আইনি বিষয়ের', general: 'ভাগ্যের',
};

type Table = Record<Lang, string>;

export const S = {
  /** The main timing sentence (template answers). {who}: "" or "{name}: " style prefix per language. */
  window: {
    en: '{who}For {area}, the best window is {start} to {end}, peaking around {peak}.',
    hi: '{who}{area} के लिए सबसे अच्छा समय {start} से {end} तक है, खासकर {peak} के आसपास।',
    bn: '{who}{areaGen} জন্য সবচেয়ে ভালো সময় {start} থেকে {end}, বিশেষ করে {peak} নাগাদ।',
  } as Table,
  pastWindow: {
    en: '{who}Looking back, the strongest stretch for {area} was {start} to {end}.',
    hi: '{who}पीछे देखें तो {area} के लिए सबसे मज़बूत समय {start} से {end} तक था।',
    bn: '{who}পিছনে তাকালে, {areaGen} জন্য সবচেয়ে জোরালো সময় ছিল {start} থেকে {end}।',
  } as Table,
  /** The safety-net sentence that replaces a reply's wrong timing sentence. */
  repair: {
    en: 'The best window for this is {start} to {end}, peaking around {peak}.',
    hi: 'इसके लिए सबसे अच्छा समय {start} से {end} तक है, खासकर {peak} के आसपास।',
    bn: 'এর জন্য সবচেয়ে ভালো সময় {start} থেকে {end}, বিশেষ করে {peak} নাগাদ।',
  } as Table,
  /** "When exactly?" / exact-date requests: the peak month inside the window. */
  repairPeak: {
    en: 'Within the window of {start} to {end}, the most likely month is {peak}.',
    hi: '{start} से {end} के बीच सबसे संभावित महीना {peak} है।',
    bn: '{start} থেকে {end}-এর মধ্যে সবচেয়ে সম্ভাব্য মাস {peak}।',
  } as Table,
  repairPast: {
    en: 'Looking back, the strongest stretch for this was {start} to {end}.',
    hi: 'पीछे देखें तो इसके लिए सबसे मज़बूत समय {start} से {end} तक था।',
    bn: 'পিছনে তাকালে, এর জন্য সবচেয়ে জোরালো সময় ছিল {start} থেকে {end}।',
  } as Table,
  whoOther: { en: '{name}: ', hi: '{name} के लिए: ', bn: '{name}-এর ক্ষেত্রে: ' } as Table,
  reasonDasha: {
    en: "That's when the part of the life timeline linked to {area} is active.",
    hi: 'उस समय जीवन का वह दौर चलेगा जो {area} से जुड़ा है।',
    bn: 'তখন জীবনের সেই পর্ব চলবে, যা {areaGen} সঙ্গে জড়িত।',
  } as Table,
  reasonDouble: {
    en: 'At the same time the two big, slow-moving planets both back it, the classic sign that things move.',
    hi: 'उसी समय दोनों बड़े, धीमे चलने वाले ग्रह इसका साथ देते हैं, जो काम बनने का पुराना संकेत है।',
    bn: 'ঠিক তখনই দুই বড়, ধীর গতির গ্রহ একসঙ্গে এর পাশে থাকে, যা কাজ এগোনোর পুরনো লক্ষণ।',
  } as Table,
  reasonJupiter: {
    en: 'The planet of growth also supports it then.',
    hi: 'उस समय विकास का ग्रह भी इसका साथ देता है।',
    bn: 'তখন বৃদ্ধির গ্রহও এর পাশে থাকে।',
  } as Table,
  promiseGood: {
    en: 'The chart shows good support for {area}.',
    hi: 'चार्ट में {area} के लिए अच्छा साथ दिखता है।',
    bn: 'চার্টে {areaGen} জন্য ভালো সমর্থন দেখা যায়।',
  } as Table,
  promiseSlow: {
    en: 'The chart shows {area} coming with patience rather than in a rush.',
    hi: 'चार्ट बताता है कि {area} के मामले में धैर्य रखना होगा; यह जल्दबाज़ी से नहीं, सही समय पर होगा।',
    bn: 'চার্টে {area} তাড়াহুড়ো করে নয়, ধৈর্যের সঙ্গে আসে বলে দেখা যায়।',
  } as Table,
  moderate: {
    en: "It's a steady window rather than a dramatic one, so effort counts.",
    hi: 'यह बहुत तेज़ नहीं, पर स्थिर समय है, इसलिए मेहनत मायने रखती है।',
    bn: 'সময়টা খুব জোরালো নয়, তবে স্থির, তাই চেষ্টাটাই আসল।',
  } as Table,
  noStrong: {
    en: 'Nothing in the next five years stands out strongly, so this is the best of the quieter stretches.',
    hi: 'अगले पाँच साल में कोई बहुत मज़बूत समय नहीं दिखता, इसलिए यह शांत दौरों में सबसे अच्छा है।',
    bn: 'সামনের পাঁচ বছরে খুব জোরালো কোনো সময় দেখা যাচ্ছে না, তাই শান্ত সময়গুলোর মধ্যে এটাই সবচেয়ে ভালো।',
  } as Table,
  nextStrong: {
    en: 'A stronger window comes around {start}.',
    hi: 'इससे मज़बूत समय {start} के आसपास आता है।',
    bn: 'আরও জোরালো সময় আসে {start} নাগাদ।',
  } as Table,
  far: {
    en: "That's a while away; the years before it are good for preparing.",
    hi: 'वह समय अभी थोड़ा दूर है; उससे पहले के साल तैयारी के लिए अच्छे हैं।',
    bn: 'সেটা এখনও কিছুটা দূরে; তার আগের বছরগুলো প্রস্তুতির জন্য ভালো।',
  } as Table,
  second: {
    en: 'If that one passes, the next good stretch is {start} to {end}.',
    hi: 'अगर वह समय निकल जाए, तो अगला अच्छा दौर {start} से {end} तक है।',
    bn: 'সেই সময় পেরিয়ে গেলে, পরের ভালো সময় {start} থেকে {end}।',
  } as Table,
  noTime: {
    en: "The birth time isn't saved, so these dates are approximate. Add it to the profile for a sharper answer.",
    hi: 'जन्म का समय सहेजा नहीं है, इसलिए ये तारीखें अनुमान हैं। सटीक जवाब के लिए प्रोफ़ाइल में जन्म समय जोड़ें।',
    bn: 'জন্মের সময় দেওয়া নেই, তাই এই তারিখগুলো আনুমানিক। আরও নিখুঁত উত্তরের জন্য প্রোফাইলে জন্মের সময় যোগ করুন।',
  } as Table,
  noPlace: {
    en: "The birth place isn't saved, so these dates are approximate.",
    hi: 'जन्म स्थान सहेजा नहीं है, इसलिए ये तारीखें अनुमान हैं।',
    bn: 'জন্মস্থান দেওয়া নেই, তাই এই তারিখগুলো আনুমানিক।',
  } as Table,
  exactDate: {
    en: 'A chart can point to a month and a window, not a single day.',
    hi: 'ग्रहों की चाल से महीना और समय-सीमा बताई जा सकती है, कोई एक तारीख नहीं।',
    bn: 'গ্রহের হিসেবে মাস আর সময়ের পরিসর বলা যায়, নির্দিষ্ট একটা দিন নয়।',
  } as Table,
  minorRomance: {
    en: 'At {age}, this is a time to focus on studies, friends and family rather than marriage or romance.',
    hi: '{age} साल की उम्र में शादी या प्रेम से ज़्यादा पढ़ाई, दोस्तों और परिवार पर ध्यान देने का समय है।',
    bn: '{age} বছর বয়সে বিয়ে বা প্রেমের চেয়ে পড়াশোনা, বন্ধু আর পরিবারের দিকে মন দেওয়ার সময়।',
  } as Table,
  elderChildren: {
    en: "I don't give childbirth timing at this age. Ask me about family happiness and the coming years at home instead.",
    hi: 'इस उम्र के लिए संतान के जन्म का समय बताना ठीक नहीं। परिवार की खुशियों और घर के आने वाले सालों के बारे में पूछिए।',
    bn: 'এই বয়সে সন্তান জন্মের সময় আমি বলি না। বরং পরিবারের আনন্দ আর সংসারের সামনের বছরগুলো নিয়ে জিজ্ঞেস করুন।',
  } as Table,
  death: {
    en: "No chart can tell how long someone will live, and I won't guess. If health or the future is worrying you, ask me about the coming years, and please talk to a doctor about any health concern.",
    hi: 'कोई भी ग्रह-गणना यह नहीं बता सकती कि कोई कितना जिएगा, इसलिए इसका अंदाज़ा लगाना ठीक नहीं। अगर सेहत या भविष्य को लेकर चिंता है, तो आने वाले सालों के बारे में पूछें, और सेहत के लिए डॉक्टर से ज़रूर मिलें।',
    bn: 'কোনো গ্রহের হিসেবই বলতে পারে না কেউ কতদিন বাঁচবেন, আর আমি আন্দাজও করব না। স্বাস্থ্য বা ভবিষ্যৎ নিয়ে দুশ্চিন্তা থাকলে সামনের বছরগুলো নিয়ে জিজ্ঞেস করুন, আর শরীরের ব্যাপারে অবশ্যই ডাক্তার দেখান।',
  } as Table,
  otherMissing: {
    en: "To answer this for your {relation}, I need your {relation}'s own birth details. Add them as a profile, then ask in their chat. The chart open here is {owner}.",
    hi: 'इसका जवाब देने के लिए मुझे उनके अपने जन्म का ब्योरा चाहिए। उन्हें प्रोफ़ाइल में जोड़ें और फिर उनकी चैट में पूछें। यहाँ जो चार्ट खुला है, वह {owner} है।',
    bn: 'এর উত্তর দিতে ওঁর নিজের জন্মের তথ্য লাগবে। ওঁকে প্রোফাইলে যোগ করে ওঁর চ্যাটে জিজ্ঞেস করুন। এখানে যে চার্ট খোলা আছে সেটা {owner}।',
  } as Table,
  ownerSelf: { en: 'yours', hi: 'आपका', bn: 'আপনার' } as Table,
  ownerOther: { en: "{name}'s", hi: '{name} का', bn: '{name}-এর' } as Table,
  /** Krishna without a model: a short line before the app's chosen verse. */
  krishnaOffline: {
    en: "I'm with you. Sit with this verse for a moment; it speaks to what you're carrying.",
    hi: 'मैं तुम्हारे साथ हूँ। इस श्लोक के साथ एक पल ठहरो; यह उसी बात से जुड़ा है जो तुम्हारे मन में है।',
    bn: 'আমি তোমার পাশে আছি। এই শ্লোকটির সঙ্গে একটু থামো; তোমার মনের কথাটির সঙ্গেই এটা জড়িয়ে আছে।',
  } as Table,
  askWhen: {
    en: 'Ask me "when" about any part of life and I will look for the best window in the chart.',
    hi: 'जीवन के किसी भी हिस्से के बारे में "कब" पूछिए, चार्ट में सबसे अच्छा समय ढूँढ़कर बताया जाएगा।',
    bn: 'জীবনের যেকোনো বিষয়ে "কবে" জিজ্ঞেস করুন, আমি চার্টে সবচেয়ে ভালো সময় খুঁজে দেব।',
  } as Table,
};

/** One practical line per topic. */
export const HELPS: Record<Lang, Record<TimingTopic, string>> = {
  en: {
    marriage: "In that window, say yes to introductions and let family and friends know you're open.",
    love: 'Be social and open in that window; new people matter more than old patterns.',
    job: 'Use the months before it to update your CV, build skills and line up applications.',
    promotion: 'Make your work visible before then, and ask for the role you want when the window opens.',
    business: 'Plan and save before it, and start or expand when the window opens rather than earlier.',
    money: 'Save steadily until then and avoid risky bets; returns come more easily in that window.',
    property: 'Shortlist places and sort out the money before then, so you can close in that window.',
    children: 'Look after your health together before then, and talk to a doctor about anything medical.',
    education: 'Steady daily study before then pays off most in that window.',
    foreign: 'Get your documents, savings and applications ready before then.',
    health: "Regular sleep, food and movement help most; follow your doctor's advice for anything medical.",
    legal: "Keep your papers in order and follow your lawyer's advice; take important steps in that window if you can.",
    general: 'Start the things that matter most to you in that window.',
  },
  hi: {
    marriage: 'उस समय रिश्तों की बात आगे बढ़ाएँ और परिवार व दोस्तों को बताएँ कि आप तैयार हैं।',
    love: 'उस समय लोगों से मिलें-जुलें और दिल खुला रखें।',
    job: 'उससे पहले के महीनों में अपना बायोडाटा तैयार करें, हुनर बढ़ाएँ और आवेदन भेजते रहें।',
    promotion: 'उससे पहले अपना काम सबके सामने रखें, और समय आने पर साफ़ तौर पर तरक्की की बात करें।',
    business: 'उससे पहले योजना बनाएँ और बचत करें, और शुरुआत या विस्तार उसी समय करें।',
    money: 'तब तक नियमित बचत करें और जोखिम भरे दाँव से बचें; उस समय फ़ायदा आसानी से मिलता है।',
    property: 'उससे पहले जगह देख लें और पैसों का इंतज़ाम कर लें, ताकि उसी समय सौदा पक्का कर सकें।',
    children: 'उससे पहले दोनों अपनी सेहत का ध्यान रखें, और चिकित्सा से जुड़ी हर बात डॉक्टर से पूछें।',
    education: 'उससे पहले रोज़ थोड़ा-थोड़ा पढ़ना उस समय सबसे ज़्यादा काम आएगा।',
    foreign: 'उससे पहले कागज़ात, बचत और आवेदन तैयार रखें।',
    health: 'नियमित नींद, भोजन और व्यायाम सबसे ज़्यादा मदद करते हैं; इलाज के लिए डॉक्टर की सलाह मानें।',
    legal: 'अपने कागज़ात ठीक रखें और वकील की सलाह मानें; हो सके तो ज़रूरी कदम उसी समय उठाएँ।',
    general: 'जो काम आपके लिए सबसे ज़रूरी हैं, उन्हें उसी समय शुरू करें।',
  },
  bn: {
    marriage: 'ওই সময়ে সম্বন্ধের কথায় সাড়া দিন, আর পরিবার-বন্ধুদের জানান যে আপনি প্রস্তুত।',
    love: 'ওই সময়ে মানুষের সঙ্গে মিশুন, মন খোলা রাখুন।',
    job: 'তার আগের মাসগুলোয় বায়োডেটা গুছিয়ে নিন, দক্ষতা বাড়ান আর আবেদন করতে থাকুন।',
    promotion: 'তার আগে নিজের কাজটা সবার চোখে পড়ান, আর সময় এলে স্পষ্ট করে উন্নতির কথা বলুন।',
    business: 'তার আগে পরিকল্পনা আর সঞ্চয় করুন, শুরু বা বাড়ানোর কাজটা ওই সময়েই করুন।',
    money: 'ততদিন নিয়মিত সঞ্চয় করুন, ঝুঁকির বাজি এড়িয়ে চলুন; ওই সময়ে লাভ সহজে আসে।',
    property: 'তার আগে জায়গা দেখে রাখুন আর টাকার ব্যবস্থা করুন, যাতে ওই সময়ে কেনাটা পাকা করতে পারেন।',
    children: 'তার আগে দুজনেই শরীরের যত্ন নিন, আর চিকিৎসার যেকোনো বিষয়ে ডাক্তারের সঙ্গে কথা বলুন।',
    education: 'তার আগে রোজ নিয়ম করে পড়াশোনা করলে ওই সময়ে সবচেয়ে বেশি কাজে দেবে।',
    foreign: 'তার আগে কাগজপত্র, সঞ্চয় আর আবেদন তৈরি রাখুন।',
    health: 'নিয়মিত ঘুম, খাওয়া আর হাঁটাচলা সবচেয়ে বেশি সাহায্য করে; চিকিৎসার জন্য ডাক্তারের পরামর্শ মেনে চলুন।',
    legal: 'কাগজপত্র গুছিয়ে রাখুন আর উকিলের পরামর্শ মেনে চলুন; পারলে জরুরি পদক্ষেপগুলো ওই সময়েই নিন।',
    general: 'যে কাজগুলো আপনার কাছে সবচেয়ে জরুরি, সেগুলো ওই সময়েই শুরু করুন।',
  },
};

const MONTHS: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
};

/**
 * "March 2028" / "मार्च २०२८" / "মার্চ ২০২৮": user-visible text, so hi/bn use
 * their own digits like the rest of the app (utils/i18n.ts localizeDigits).
 * `western` keeps 0-9 for model-bound text (prompts, chip questions).
 */
export function monthLabel(d: Date, lang: Lang, { western = false } = {}): string {
  const label = `${MONTHS[lang][d.getMonth()]} ${d.getFullYear()}`;
  return western ? label : nativeDigits(label, lang);
}

/** A finished user-visible sentence in `lang`'s digits (ages, years filled into templates). */
export const localText = (text: string, lang: Lang): string => nativeDigits(text, lang);

/** Thread title without a model: the first question, cut to fit the thread list. */
export function questionTitle(question: string, max = 36): string {
  return question.length > max ? `${question.slice(0, max - 2).trim()}…` : question;
}

/** Fill {placeholders}; unknown ones are left as they are. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const EN_RELATION: Record<string, string> = {
  sister: 'sister', brother: 'brother', mother: 'mother', father: 'father', son: 'son', daughter: 'daughter',
  wife: 'wife', husband: 'husband', partner: 'partner', friend: 'friend', cousin: 'cousin',
  grandparent: 'grandparent', relative: 'relative',
};
export const relationWord = (r: string) => EN_RELATION[r] ?? 'family member';
