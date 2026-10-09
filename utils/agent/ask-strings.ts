/**
 * Localized text for the non-timing answer types (utils/agent/astrologer.ts):
 * what each planet means for a career field, a partner, money, studies,
 * strengths, health habits and places, plus the plain "why" phrases. Like
 * ./strings.ts: pure, en / hi / bn, plain language (no house numbers, sign
 * names, "ruler" / "lord" or period labels; planets are named by what they
 * stand for, "the planet of discipline and hard work").
 *
 * Every item carries `terms`: words (any of the three languages) whose
 * presence in a reply shows it used the item (verify.ts relevance check).
 */
import type { Planet } from '../timing-engine';
import type { Lang } from './strings';

export type L3 = Record<Lang, string>;

/** One thing an answer can name: a field, a trait, a source of money … */
export type ItemText = {
  label: L3;
  /** Shorter label for lists ("technology and data"); defaults to `label`. */
  short?: L3;
  /** Concrete examples (roles, subjects …); optional. */
  examples?: L3;
  /** Short English phrase for model prompts ("technology and data work"). */
  model: string;
  /** Relevance words, en | hi | bn alternation (case-insensitive). */
  terms: string;
};

/** "the planet of discipline and hard work" (hi: masculine ग्रह; bn: genitive by appending 'ের'). */
export const PLANET_NAME: Record<Planet, L3> = {
  Sun: { en: 'the planet of authority and leadership', hi: 'अधिकार और नेतृत्व का ग्रह', bn: 'নেতৃত্ব আর কর্তৃত্বের গ্রহ' },
  Moon: { en: 'the planet of care and feelings', hi: 'देखभाल और भावनाओं का ग्रह', bn: 'যত্ন আর আবেগের গ্রহ' },
  Mars: { en: 'the planet of energy and courage', hi: 'ऊर्जा और साहस का ग्रह', bn: 'শক্তি আর সাহসের গ্রহ' },
  Mercury: { en: 'the planet of intellect and communication', hi: 'बुद्धि और संवाद का ग्रह', bn: 'বুদ্ধি আর যোগাযোগের গ্রহ' },
  Jupiter: { en: 'the planet of wisdom and growth', hi: 'ज्ञान और विकास का ग्रह', bn: 'জ্ঞান আর বৃদ্ধির গ্রহ' },
  Venus: { en: 'the planet of beauty and creativity', hi: 'सौंदर्य और रचनात्मकता का ग्रह', bn: 'সৌন্দর্য আর সৃজনশীলতার গ্রহ' },
  Saturn: { en: 'the planet of discipline and hard work', hi: 'अनुशासन और मेहनत का ग्रह', bn: 'শৃঙ্খলা আর পরিশ্রমের গ্রহ' },
  Rahu: { en: 'the point of ambition and new paths', hi: 'महत्वाकांक्षा और नए रास्तों का बिंदु', bn: 'উচ্চাকাঙ্ক্ষা আর নতুন পথের বিন্দু' },
  Ketu: { en: 'the point of focus and depth', hi: 'एकाग्रता और गहराई का बिंदु', bn: 'মনোযোগ আর গভীরতার বিন্দু' },
};

/** Life areas by house (plain): en "career", hi "करियर", bn genitive "কাজের". */
export const AREA_OF_HOUSE: Record<Lang, string[]> = {
  en: ['', 'personal growth', 'money and family', 'effort and skills', 'home', 'creativity and study', 'daily work and health', 'partnership',
    'change', 'luck and learning', 'career', 'gains and friends', 'abroad and spending'],
  hi: ['', 'व्यक्तित्व', 'धन और परिवार', 'मेहनत और हुनर', 'घर-परिवार', 'रचनात्मकता और पढ़ाई', 'रोज़ के काम और सेहत', 'साझेदारी',
    'बदलाव', 'भाग्य और ज्ञान', 'करियर', 'लाभ और दोस्तों', 'विदेश और खर्च'],
  bn: ['', 'নিজের', 'টাকা আর পরিবারের', 'পরিশ্রম আর দক্ষতার', 'বাড়ির', 'সৃজনশীলতা আর পড়াশোনার', 'রোজকার কাজ আর স্বাস্থ্যের', 'সম্পর্কের',
    'পরিবর্তনের', 'ভাগ্য আর শিক্ষার', 'কাজের', 'লাভ আর বন্ধুদের', 'বিদেশ আর খরচের'],
};

/** How a planet is tied to an area, as a clause. {p} planet phrase, {pg} its bn genitive, {area}. */
export const WHY: Record<'lord' | 'occupant' | 'aspect' | 'withLord' | 'amk' | 'strong' | 'karaka' | 'navamsa' | 'd10' | 'fromMoon' | 'fromSun' | 'dk' | 'd9' | 'varga' | 'yoga', L3> = {
  navamsa: { en: '{p} guides your work side in the finer, ninth-part chart', hi: 'बारीक नवांश चार्ट में आपके काम वाले पहलू की दिशा {p} तय करता है', bn: 'সূক্ষ্ম নবাংশ চার্টে আপনার কাজের দিকটা চালায় {p}' },
  d10: { en: 'your career chart puts {p} in charge of your work', hi: 'आपके करियर चार्ट में काम की बागडोर {p} के हाथ में है', bn: 'আপনার কেরিয়ার চার্টে কাজের দায়িত্ব {p}-এর হাতে' },
  fromSun: { en: '{p} also leads your {area} side counted from your Sun', hi: 'आपके सूर्य से गिनने पर भी आपके {area} वाले पहलू की दिशा {p} तय करता है', bn: 'আপনার সূর্য থেকে গুনলেও আপনার {area} দিকটা চালায় {p}' },
  fromMoon: { en: '{p} also leads your {area} side counted from your Moon', hi: 'आपके चंद्रमा से गिनने पर भी आपके {area} वाले पहलू की दिशा {p} तय करता है', bn: 'আপনার চাঁদ থেকে গুনলেও আপনার {area} দিকটা চালায় {p}' },
  dk: { en: '{p} is the planet your chart picks out for your partner', hi: 'आपके चार्ट में जीवनसाथी का संकेत {p} देता है', bn: 'আপনার চার্টে সঙ্গীর ইঙ্গিত দেয় {p}' },
  d9: { en: 'the marriage chart also points to {p}', hi: 'विवाह चार्ट भी {p} की ओर इशारा करता है', bn: 'বিয়ের চার্টও {p}-এর দিকে ইঙ্গিত করে' },
  varga: { en: 'a finer division of your chart also points to {p}', hi: 'चार्ट का एक बारीक हिस्सा भी {p} की ओर इशारा करता है', bn: 'চার্টের একটা সূক্ষ্ম ভাগও {p}-এর দিকে ইঙ্গিত করে' },
  yoga: { en: '{p} is part of a supportive combination in your chart', hi: '{p} आपके चार्ट के एक सहायक योग का हिस्सा है', bn: '{p} আপনার চার্টের একটা সহায়ক যোগের অংশ' },
  lord: { en: 'your {area} side is guided by {p}', hi: 'आपके {area} वाले पहलू की दिशा {p} तय करता है', bn: 'আপনার {area} দিকটা চালায় {p}' },
  occupant: { en: '{p} sits in your {area} side', hi: '{p} आपके {area} वाले पहलू में बैठा है', bn: '{p} আছে আপনার {area} দিকে' },
  aspect: { en: '{p} looks at your {area} side', hi: '{p} की नज़र आपके {area} वाले पहलू पर है', bn: '{pg} নজর আছে আপনার {area} দিকে' },
  withLord: { en: '{p} sits with the planet that guides your {area} side', hi: '{p} आपके {area} वाले पहलू को चलाने वाले ग्रह के साथ बैठा है', bn: '{p} আছে আপনার {area} দিক চালানো গ্রহের সঙ্গে' },
  amk: { en: '{p} is the planet your chart picks out for work', hi: 'आपके चार्ट में काम की दिशा {p} दिखाता है', bn: 'আপনার চার্টে কাজের দিশা দেখায় {p}' },
  strong: { en: '{p} is strong in your chart', hi: '{p} आपके चार्ट में मज़बूत है', bn: '{p} আপনার চার্টে জোরালো' },
  karaka: { en: '{p} naturally stands for this part of life', hi: '{p} स्वाभाविक रूप से जीवन के इस पहलू से जुड़ा है', bn: '{p} স্বভাবতই জীবনের এই দিকের সঙ্গে জড়িত' },
};

// ─── Career field / domain ───────────────────────────────────────────────────

export const CAREER: Record<Planet, ItemText> = {
  Sun: {
    short: { en: 'government and leadership roles', hi: 'सरकारी और नेतृत्व वाले काम', bn: 'সরকারি ও নেতৃত্বের কাজ' },
    label: { en: 'government, administration and leadership roles', hi: 'सरकारी, प्रशासन और नेतृत्व वाले काम', bn: 'সরকারি, প্রশাসন আর নেতৃত্বের কাজ' },
    examples: { en: 'civil services, public-sector management, team lead or manager roles, policy work', hi: 'सिविल सेवा, सरकारी विभाग, टीम लीड या मैनेजर, नीति से जुड़ा काम', bn: 'সিভিল সার্ভিস, সরকারি দপ্তর, টিম লিড বা ম্যানেজার, নীতি-সংক্রান্ত কাজ' },
    model: 'government, administration or leadership roles',
    terms: 'government|administrat|leadership|manager|civil servic|public sector|policy|सरकार|प्रशासन|नेतृत्व|मैनेजर|सिविल|সরকার|প্রশাসন|নেতৃত্ব|ম্যানেজার|সিভিল',
  },
  Moon: {
    short: { en: 'care and public-facing work', hi: 'सेवा और लोगों से जुड़ा काम', bn: 'সেবা ও মানুষের সঙ্গে কাজ' },
    label: { en: 'care, hotels and public-facing work', hi: 'देखभाल, सेवा और लोगों से जुड़ा काम', bn: 'যত্ন, আতিথেয়তা আর মানুষের সঙ্গে কাজ' },
    examples: { en: 'nursing and caregiving, hotels and tourism, customer success, HR, food', hi: 'स्वास्थ्य सेवा, होटल और पर्यटन, कस्टमर सर्विस, एचआर', bn: 'স্বাস্থ্যসেবা, হোটেল ও পর্যটন, কাস্টমার সার্ভিস, এইচআর' },
    model: 'care, hotels or public-facing work',
    terms: 'caregiv|caring|hotels?\\b|touris|nurs|customer|public-facing|people-facing|\\bhr\\b|human resources|food|travel|देखभाल|सेवा|होटल|पर्यटन|कस्टमर|एचआर|नर्स|যত্ন|আতিথেয়তা|সেবা|হোটেল|পর্যটন|কাস্টমার|এইচআর|নার্স',
  },
  Mars: {
    short: { en: 'engineering and technical work', hi: 'इंजीनियरिंग और तकनीकी काम', bn: 'ইঞ্জিনিয়ারিং ও কারিগরি কাজ' },
    label: { en: 'engineering, technical and action-driven work', hi: 'इंजीनियरिंग, तकनीकी और जोश वाले काम', bn: 'ইঞ্জিনিয়ারিং, কারিগরি আর উদ্যমের কাজ' },
    examples: { en: 'mechanical or civil engineering, hardware, defence or police, surgery, sports, real estate', hi: 'मैकेनिकल या सिविल इंजीनियरिंग, रक्षा या पुलिस, सर्जरी, खेल, रियल एस्टेट', bn: 'মেকানিক্যাল বা সিভিল ইঞ্জিনিয়ারিং, প্রতিরক্ষা বা পুলিশ, সার্জারি, খেলা, রিয়েল এস্টেট' },
    model: 'engineering, technical or action-driven work',
    terms: 'engineer|technical|hardware|defen[cs]e|police|surg|sport|real estate|construct|इंजीनियर|तकनीकी|रक्षा|पुलिस|सर्जरी|खेल|रियल एस्टेट|ইঞ্জিনিয়ার|কারিগরি|প্রতিরক্ষা|পুলিশ|সার্জারি|খেলা|রিয়েল এস্টেট',
  },
  Mercury: {
    short: { en: 'technology and data', hi: 'टेक्नोलॉजी और डेटा', bn: 'প্রযুক্তি ও ডেটা' },
    label: { en: 'technology, data and communication', hi: 'टेक्नोलॉजी, डेटा और संवाद से जुड़ा काम', bn: 'প্রযুক্তি, ডেটা আর যোগাযোগের কাজ' },
    examples: { en: 'software development, data analysis, writing and content, sales, finance and accounts', hi: 'सॉफ़्टवेयर, डेटा एनालिसिस, लेखन और कंटेंट, सेल्स, अकाउंट्स', bn: 'সফটওয়্যার, ডেটা বিশ্লেষণ, লেখালেখি ও কনটেন্ট, সেলস, হিসাবরক্ষণ' },
    model: 'technology, data or communication work',
    terms: 'tech|software|data|analy|writing|writer|content|sales|accounting|accounts\\b|commerce|टेक्नोलॉजी|तकनीक|सॉफ़्टवेयर|सॉफ्टवेयर|डेटा|लेखन|कंटेंट|सेल्स|अकाउंट|आईटी|প্রযুক্তি|টেকনোলজি|সফটওয়্যার|ডেটা|লেখালেখি|কনটেন্ট|সেলস|হিসাব|আইটি|বিশ্লেষণ',
  },
  Jupiter: {
    short: { en: 'advisory and finance work', hi: 'सलाह और वित्त का काम', bn: 'পরামর্শ ও ফিনান্সের কাজ' },
    label: { en: 'teaching, law, finance and advisory work', hi: 'शिक्षा, कानून, वित्त और सलाह से जुड़ा काम', bn: 'শিক্ষা, আইন, অর্থ আর পরামর্শের কাজ' },
    examples: { en: 'teaching or training, law, banking and finance, consulting, counselling', hi: 'पढ़ाना या ट्रेनिंग, कानून, बैंकिंग और वित्त, कंसल्टिंग, काउंसलिंग', bn: 'শিক্ষকতা বা ট্রেনিং, আইন, ব্যাংকিং ও ফিনান্স, কনসাল্টিং, কাউন্সেলিং' },
    model: 'teaching, law, finance or advisory work',
    terms: 'teach|train|\\blaw|legal|bank|financ|advis|consult|counsel|educat|शिक्षा|पढ़ा|ट्रेनिंग|कानून|बैंक|वित्त|सलाह|कंसल्ट|काउंसल|শিক্ষা|শিক্ষক|ট্রেনিং|আইন|ব্যাংক|ফিনান্স|অর্থ|পরামর্শ|কনসাল্ট|কাউন্সেল',
  },
  Venus: {
    short: { en: 'design and creative media', hi: 'डिज़ाइन और रचनात्मक मीडिया', bn: 'ডিজাইন ও সৃজনশীল মিডিয়া' },
    label: { en: 'design, arts, media and creative work', hi: 'डिज़ाइन, कला, मीडिया और रचनात्मक काम', bn: 'ডিজাইন, শিল্প, মিডিয়া আর সৃজনশীল কাজ' },
    examples: { en: 'UI/UX or product design, graphic design, media and marketing, fashion', hi: 'UI/UX या प्रोडक्ट डिज़ाइन, ग्राफ़िक डिज़ाइन, मीडिया और मार्केटिंग, फ़ैशन', bn: 'UI/UX বা প্রোডাক্ট ডিজাইন, গ্রাফিক ডিজাইন, মিডিয়া ও মার্কেটিং, ফ্যাশন' },
    model: 'design, arts, media or creative work',
    terms: 'design|\\barts?\\b|artist|media|creativ|marketing|fashion|brand|music|film|beauty|डिज़ाइन|डिजाइन|कला|मीडिया|रचनात्मक|मार्केटिंग|फ़ैशन|फैशन|संगीत|ডিজাইন|শিল্প|মিডিয়া|সৃজনশীল|মার্কেটিং|ফ্যাশন|সঙ্গীত',
  },
  Saturn: {
    short: { en: 'operations and systems work', hi: 'संचालन और सिस्टम का काम', bn: 'পরিচালনা ও সিস্টেমের কাজ' },
    label: { en: 'operations, systems and long-term structured work', hi: 'संचालन, सिस्टम और लंबे समय वाले व्यवस्थित काम', bn: 'পরিচালনা, সিস্টেম আর দীর্ঘমেয়াদি গোছানো কাজ' },
    examples: { en: 'operations and project management, infrastructure or backend engineering, manufacturing, public service, research', hi: 'संचालन और प्रोजेक्ट मैनेजमेंट, इन्फ्रास्ट्रक्चर या बैकएंड इंजीनियरिंग, मैन्युफैक्चरिंग, सरकारी सेवा, रिसर्च', bn: 'পরিচালনা ও প্রজেক্ট ম্যানেজমেন্ট, ইনফ্রাস্ট্রাকচার বা ব্যাকএন্ড ইঞ্জিনিয়ারিং, উৎপাদন শিল্প, সরকারি পরিষেবা, গবেষণা' },
    model: 'operations, systems or long-term structured work',
    terms: 'operations|systems?\\b|structured work|project manag|infrastructure|backend|manufactur|public service|research|संचालन|सिस्टम|व्यवस्थित|इन्फ्रास्ट्रक्चर|बैकएंड|मैन्युफैक्चरिंग|उत्पादन|रिसर्च|शोध|পরিচালনা|সিস্টেম|গোছানো|ইনফ্রা|ব্যাকএন্ড|উৎপাদন|গবেষণা|রিসার্চ',
  },
  Rahu: {
    short: { en: 'new tech and AI', hi: 'नई टेक्नोलॉजी और एआई', bn: 'নতুন প্রযুক্তি ও এআই' },
    label: { en: 'new technology, AI, foreign and unconventional fields', hi: 'नई टेक्नोलॉजी, एआई, विदेशी कंपनियाँ और अलग रास्ते', bn: 'নতুন প্রযুক্তি, এআই, বিদেশি সংস্থা আর আলাদা পথ' },
    examples: { en: 'AI and emerging tech, startups, foreign or multinational companies, digital media', hi: 'एआई और नई टेक्नोलॉजी, स्टार्टअप, विदेशी या मल्टीनेशनल कंपनी, डिजिटल मीडिया', bn: 'এআই ও নতুন প্রযুক্তি, স্টার্টআপ, বিদেশি বা বহুজাতিক সংস্থা, ডিজিটাল মিডিয়া' },
    model: 'new technology, AI, foreign or unconventional fields',
    terms: '\\bai\\b|artificial|emerging|startup|foreign|multinational|\\bmnc|digital|unconventional|new tech|एआई|नई टेक्नोलॉजी|नई तकनीक|स्टार्टअप|विदेश|मल्टीनेशनल|डिजिटल|এআই|নতুন প্রযুক্তি|স্টার্টআপ|বিদেশ|বহুজাতিক|মাল্টিন্যাশনাল|ডিজিটাল',
  },
  Ketu: {
    short: { en: 'research and specialist tech work', hi: 'रिसर्च और खास तकनीकी काम', bn: 'গবেষণা ও বিশেষ কারিগরি কাজ' },
    label: { en: 'research, coding and specialist technical work', hi: 'रिसर्च, कोडिंग और खास तकनीकी काम', bn: 'গবেষণা, কোডিং আর বিশেষ কারিগরি কাজ' },
    examples: { en: 'research, coding and debugging, data science, niche technical specialities', hi: 'रिसर्च, कोडिंग, डेटा साइंस, किसी खास तकनीक में महारत', bn: 'গবেষণা, কোডিং, ডেটা সায়েন্স, নির্দিষ্ট প্রযুক্তিতে দক্ষতা' },
    model: 'research, coding or specialist technical work',
    terms: 'research|coding|\\bcode|program|debug|specialist|niche|data science|रिसर्च|शोध|कोडिंग|प्रोग्राम|डेटा साइंस|विशेषज्ञ|গবেষণা|রিসার্চ|কোডিং|প্রোগ্রাম|ডেটা সায়েন্স|বিশেষজ্ঞ',
  },
};

// ─── Partner ─────────────────────────────────────────────────────────────────

export const PARTNER: Record<Planet, ItemText> = {
  Sun: { label: { en: 'confident, principled and a natural leader', hi: 'आत्मविश्वासी, उसूलों वाला और नेतृत्व करने वाला', bn: 'আত্মবিশ্বাসী, নীতিবান আর নেতৃত্ব দিতে পারেন এমন' }, model: 'confident, principled, a natural leader', terms: 'confiden|principl|leader|आत्मविश्वास|उसूल|नेतृत्व|আত্মবিশ্বাস|নীতি|নেতৃত্ব' },
  Moon: { label: { en: 'caring, emotional and family-minded', hi: 'ख्याल रखने वाला, भावुक और परिवार से जुड़ा', bn: 'যত্নশীল, আবেগপ্রবণ আর পরিবারমুখী' }, model: 'caring, emotional, family-minded', terms: 'caring|emotion|family|nurtur|ख्याल|भावुक|परिवार|देखभाल|যত্ন|আবেগ|পরিবার' },
  Mars: { label: { en: 'energetic, direct and protective', hi: 'ऊर्जावान, सीधी बात करने वाला और रक्षा करने वाला', bn: 'উদ্যমী, স্পষ্টবাদী আর আগলে রাখার মতো' }, model: 'energetic, direct, protective', terms: 'energ|direct|protect|active|bold|ऊर्जा|सीधी|रक्षा|साहसी|উদ্যম|স্পষ্ট|আগলে|সাহসী' },
  Mercury: { label: { en: 'witty, talkative and smart', hi: 'हाज़िरजवाब, बातूनी और समझदार', bn: 'রসিক, কথা বলতে ভালোবাসেন আর বুদ্ধিমান' }, model: 'witty, talkative, smart', terms: 'witt|talk|smart|clever|communicat|intelligen|हाज़िरजवाब|हाजिरजवाब|बातूनी|समझदार|बुद्धि|রসিক|কথা|বুদ্ধি' },
  Jupiter: { label: { en: 'wise, kind and well educated', hi: 'समझदार, दयालु और पढ़ा-लिखा', bn: 'জ্ঞানী, দয়ালু আর শিক্ষিত' }, model: 'wise, kind, well educated', terms: 'wise|kind|educat|ethic|respect|समझदार|दयालु|पढ़ा-लिखा|शिक्षित|ज्ञानी|জ্ঞানী|দয়ালু|দয়ালু|শিক্ষিত' },
  Venus: { label: { en: 'attractive, artistic and affectionate', hi: 'आकर्षक, कलात्मक और प्यार करने वाला', bn: 'আকর্ষণীয়, শিল্পমনা আর স্নেহময়' }, model: 'attractive, artistic, affectionate', terms: 'attract|artist|affection|charm|beaut|romantic|आकर्षक|कलात्मक|प्यार|सुंदर|আকর্ষণ|শিল্প|স্নেহ|সুন্দর' },
  Saturn: { label: { en: 'mature, responsible and loyal, maybe a little older', hi: 'परिपक्व, ज़िम्मेदार और वफ़ादार, शायद उम्र में थोड़ा बड़ा', bn: 'পরিণত, দায়িত্বশীল আর বিশ্বস্ত, হয়তো বয়সে একটু বড়' }, model: 'mature, responsible, loyal, maybe a little older', terms: 'matur|responsib|loyal|older|serious|stable|steady|परिपक्व|ज़िम्मेदार|जिम्मेदार|वफ़ादार|वफादार|পরিণত|দায়িত্ব|বিশ্বস্ত' },
  Rahu: { label: { en: 'ambitious and unconventional, maybe from a different background', hi: 'महत्वाकांक्षी और अलग सोच वाला, शायद अलग माहौल से', bn: 'উচ্চাকাঙ্ক্ষী আর আলাদা ধরনের, হয়তো ভিন্ন পরিবেশ থেকে' }, model: 'ambitious, unconventional, maybe from a different background', terms: 'ambiti|unconvention|different|unusual|महत्वाकांक्षी|अलग|উচ্চাকাঙ্ক্ষী|আলাদা|ভিন্ন' },
  Ketu: { label: { en: 'private, spiritual and independent', hi: 'शांत, आध्यात्मिक और आत्मनिर्भर', bn: 'চাপা স্বভাবের, আধ্যাত্মিক আর স্বাধীনচেতা' }, model: 'private, spiritual, independent', terms: 'private|spiritual|independen|quiet|शांत|आध्यात्मिक|आत्मनिर्भर|চাপা|আধ্যাত্মিক|স্বাধীন' },
};

/** Where a partner is likely met, by the house the partnership area's guide sits in. */
export const MEET: L3[] = [
  { en: '', hi: '', bn: '' },
  { en: 'you will probably make the first move yourself', hi: 'शायद पहला कदम आप खुद उठाएँगे', bn: 'সম্ভবত প্রথম পা আপনিই বাড়াবেন' },
  { en: 'through family', hi: 'परिवार के ज़रिए', bn: 'পরিবারের মাধ্যমে' },
  { en: 'through friends, siblings or social media', hi: 'दोस्तों, भाई-बहनों या सोशल मीडिया के ज़रिए', bn: 'বন্ধু, ভাইবোন বা সোশ্যাল মিডিয়ার মাধ্যমে' },
  { en: 'close to home, through family circles', hi: 'घर के पास, परिवार के जान-पहचान वालों से', bn: 'বাড়ির কাছেই, পরিবারের চেনাজানার মধ্যে' },
  { en: 'through a love connection, studies or a shared hobby', hi: 'प्रेम, पढ़ाई या किसी साझा शौक के ज़रिए', bn: 'প্রেম, পড়াশোনা বা কোনো শখের সূত্রে' },
  { en: 'at work or through service', hi: 'काम की जगह पर या सेवा के दौरान', bn: 'কাজের জায়গায় বা সেবার সূত্রে' },
  { en: 'through a formal match or a partnership', hi: 'रिश्ते की बात या किसी साझेदारी के ज़रिए', bn: 'সম্বন্ধ বা কোনো অংশীদারির সূত্রে' },
  { en: 'suddenly, in an unexpected way', hi: 'अचानक, अनपेक्षित तरीके से', bn: 'হঠাৎ, অপ্রত্যাশিত ভাবে' },
  { en: 'through travel, teachers or a place of learning', hi: 'यात्रा, गुरुओं या पढ़ाई की जगह के ज़रिए', bn: 'ভ্রমণ, শিক্ষক বা পড়াশোনার জায়গার সূত্রে' },
  { en: 'through work or career circles', hi: 'काम या करियर के दायरे में', bn: 'কাজ বা কেরিয়ারের পরিচিতির মধ্যে' },
  { en: 'through friends and your wider network', hi: 'दोस्तों और जान-पहचान के बड़े दायरे से', bn: 'বন্ধু আর চেনাজানার বড় বৃত্তের মাধ্যমে' },
  { en: 'far from home, abroad or online', hi: 'घर से दूर, विदेश में या ऑनलाइन', bn: 'বাড়ি থেকে দূরে, বিদেশে বা অনলাইনে' },
];

// ─── Money sources ───────────────────────────────────────────────────────────

export const MONEY: Record<Planet, ItemText> = {
  Sun: { label: { en: 'a steady salary, government work or senior positions', hi: 'स्थिर वेतन, सरकारी काम या ऊँचे पद', bn: 'স্থির বেতন, সরকারি কাজ বা উঁচু পদ' }, model: 'a steady salary, government work or senior positions', terms: 'salary|government|senior|position|वेतन|सरकारी|पद|বেতন|সরকারি|পদ' },
  Moon: { label: { en: 'public-facing work, food, hotels or everyday goods', hi: 'लोगों से जुड़ा काम, खाना, होटल या रोज़मर्रा की चीज़ें', bn: 'মানুষের সঙ্গে কাজ, খাবার, হোটেল বা রোজকার জিনিস' }, model: 'public-facing work, food, hotels or everyday goods', terms: 'public|food|hotels?\\b|everyday|लोगों|खाना|होटल|रोज़मर्रा|মানুষ|খাবার|হোটেল|রোজকার' },
  Mars: { label: { en: 'property, engineering or hands-on technical skills', hi: 'प्रॉपर्टी, इंजीनियरिंग या तकनीकी हुनर', bn: 'সম্পত্তি, ইঞ্জিনিয়ারিং বা হাতে-কলমে কারিগরি দক্ষতা' }, model: 'property, engineering or hands-on technical skills', terms: 'property|engineer|technical|real estate|land|प्रॉपर्टी|ज़मीन|जमीन|इंजीनियर|तकनीकी|সম্পত্তি|জমি|ইঞ্জিনিয়ার|কারিগরি' },
  Mercury: { label: { en: 'skills, trade, freelancing and commissions', hi: 'हुनर, व्यापार, फ्रीलांसिंग और कमीशन', bn: 'দক্ষতা, ব্যবসা-বাণিজ্য, ফ্রিল্যান্সিং আর কমিশন' }, model: 'skills, trade, freelancing and commissions', terms: 'skill|trade|freelanc|commission|business|हुनर|व्यापार|फ्रीलांस|कमीशन|দক্ষতা|বাণিজ্য|ব্যবসা|ফ্রিল্যান্স|কমিশন' },
  Jupiter: { label: { en: 'advice, teaching, finance and long-term investments', hi: 'सलाह, पढ़ाना, वित्त और लंबे समय के निवेश', bn: 'পরামর্শ, শিক্ষকতা, ফিনান্স আর দীর্ঘমেয়াদি বিনিয়োগ' }, model: 'advice, teaching, finance and long-term investments', terms: 'advi[cs]|teach|financ|invest|consult|सलाह|पढ़ा|वित्त|निवेश|পরামর্শ|শিক্ষ|ফিনান্স|বিনিয়োগ|বিনিয়োগ' },
  Venus: { label: { en: 'creative work, design, beauty, luxury goods or the arts', hi: 'रचनात्मक काम, डिज़ाइन, सौंदर्य, लग्ज़री सामान या कला', bn: 'সৃজনশীল কাজ, ডিজাইন, সৌন্দর্য, শৌখিন জিনিস বা শিল্প' }, model: 'creative work, design, beauty, luxury goods or the arts', terms: 'creativ|design|beauty|luxur|\\barts?\\b|रचनात्मक|डिज़ाइन|डिजाइन|सौंदर्य|लग्ज़री|कला|সৃজনশীল|ডিজাইন|সৌন্দর্য|শৌখিন|শিল্প' },
  Saturn: { label: { en: 'steady long-term work and slow, patient savings', hi: 'लंबे समय का स्थिर काम और धीरे-धीरे की बचत', bn: 'দীর্ঘদিনের স্থির কাজ আর ধৈর্য ধরে সঞ্চয়' }, model: 'steady long-term work and slow, patient savings', terms: 'long-term|long term|savings|patient saving|स्थिर|लंबे समय|बचत|স্থির|দীর্ঘ|সঞ্চয়|সঞ্চয়' },
  Rahu: { label: { en: 'technology, foreign sources or new-age fields (keep speculation small)', hi: 'टेक्नोलॉजी, विदेशी स्रोत या नए ज़माने के काम (सट्टे से दूर रहें)', bn: 'প্রযুক্তি, বিদেশি উৎস বা নতুন যুগের কাজ (ফাটকা এড়িয়ে চলুন)' }, model: 'technology, foreign sources or new-age fields, with little speculation', terms: 'tech|foreign|new-age|online|digital|टेक्नोलॉजी|विदेश|नए ज़माने|ऑनलाइन|डिजिटल|প্রযুক্তি|বিদেশ|নতুন যুগ|অনলাইন|ডিজিটাল' },
  Ketu: { label: { en: 'specialist or research skills, and the odd unexpected gain', hi: 'खास हुनर या रिसर्च, और कभी-कभी अचानक फ़ायदा', bn: 'বিশেষ দক্ষতা বা গবেষণা, আর মাঝে মাঝে হঠাৎ লাভ' }, model: 'specialist or research skills, and the odd unexpected gain', terms: 'specialist|research|unexpected|niche|खास|रिसर्च|अचानक|বিশেষ|গবেষণা|হঠাৎ' },
};

// ─── Study field ─────────────────────────────────────────────────────────────

export const STUDY: Record<Planet, ItemText> = {
  Sun: { label: { en: 'political science, public administration or management', hi: 'राजनीति विज्ञान, लोक प्रशासन या मैनेजमेंट', bn: 'রাষ্ট্রবিজ্ঞান, জনপ্রশাসন বা ম্যানেজমেন্ট' }, short: { en: 'political science or management', hi: 'राजनीति विज्ञान या मैनेजमेंट', bn: 'রাষ্ট্রবিজ্ঞান বা ম্যানেজমেন্ট' }, model: 'political science, public administration or management', terms: 'politic|administrat|manage|राजनीति|प्रशासन|मैनेजमेंट|রাষ্ট্রবিজ্ঞান|প্রশাসন|ম্যানেজমেন্ট' },
  Moon: { label: { en: 'psychology, nursing, hotel management or food science', hi: 'मनोविज्ञान, नर्सिंग, होटल मैनेजमेंट या फ़ूड साइंस', bn: 'মনোবিজ্ঞান, নার্সিং, হোটেল ম্যানেজমেন্ট বা খাদ্যবিজ্ঞান' }, short: { en: 'psychology, nursing or hotel management', hi: 'मनोविज्ञान, नर्सिंग या होटल मैनेजमेंट', bn: 'মনোবিজ্ঞান, নার্সিং বা হোটেল ম্যানেজমেন্ট' }, model: 'psychology, nursing, hotel management or food science', terms: 'psycholog|nurs|hotel|food|मनोविज्ञान|नर्सिंग|होटल|फ़ूड|फूड|মনোবিজ্ঞান|নার্সিং|হোটেল|খাদ্য' },
  Mars: { label: { en: 'engineering, medicine or sports science', hi: 'इंजीनियरिंग, मेडिकल या स्पोर्ट्स साइंस', bn: 'ইঞ্জিনিয়ারিং, ডাক্তারি বা স্পোর্টস সায়েন্স' }, short: { en: 'engineering or medicine', hi: 'इंजीनियरिंग या मेडिकल', bn: 'ইঞ্জিনিয়ারিং বা ডাক্তারি' }, model: 'engineering, medicine or sports science', terms: 'engineer|medic|surg|sport|इंजीनियर|मेडिकल|सर्जरी|स्पोर्ट्स|ইঞ্জিনিয়ার|ডাক্তারি|সার্জারি|স্পোর্টস' },
  Mercury: { label: { en: 'computer science, maths, commerce, languages or journalism', hi: 'कंप्यूटर साइंस, गणित, कॉमर्स, भाषाएँ या पत्रकारिता', bn: 'কম্পিউটার সায়েন্স, গণিত, কমার্স, ভাষা বা সাংবাদিকতা' }, short: { en: 'computer science, maths or commerce', hi: 'कंप्यूटर साइंस, गणित या कॉमर्स', bn: 'কম্পিউটার সায়েন্স, গণিত বা কমার্স' }, model: 'computer science, maths, commerce, languages or journalism', terms: 'computer|math|commerce|language|journalis|कंप्यूटर|गणित|कॉमर्स|भाषा|पत्रकारिता|কম্পিউটার|গণিত|কমার্স|ভাষা|সাংবাদিক' },
  Jupiter: { label: { en: 'law, finance, education, management or philosophy', hi: 'कानून, वित्त, शिक्षा, मैनेजमेंट या दर्शन', bn: 'আইন, ফিনান্স, শিক্ষা, ম্যানেজমেন্ট বা দর্শন' }, short: { en: 'law, finance or teaching', hi: 'कानून, वित्त या शिक्षा', bn: 'আইন, ফিনান্স বা শিক্ষা' }, model: 'law, finance, education, management or philosophy', terms: '\\blaw|financ|educat|manage|philosoph|कानून|वित्त|शिक्षा|मैनेजमेंट|दर्शन|আইন|ফিনান্স|শিক্ষা|ম্যানেজমেন্ট|দর্শন' },
  Venus: { label: { en: 'design, fine arts, music, fashion or architecture', hi: 'डिज़ाइन, ललित कला, संगीत, फ़ैशन या आर्किटेक्चर', bn: 'ডিজাইন, চারুকলা, সঙ্গীত, ফ্যাশন বা স্থাপত্য' }, short: { en: 'design, fine arts or architecture', hi: 'डिज़ाइन, ललित कला या आर्किटेक्चर', bn: 'ডিজাইন, চারুকলা বা স্থাপত্য' }, model: 'design, fine arts, music, fashion or architecture', terms: 'design|\\barts?\\b|music|fashion|architect|डिज़ाइन|डिजाइन|कला|संगीत|फ़ैशन|फैशन|आर्किटेक्चर|ডিজাইন|চারুকলা|সঙ্গীত|ফ্যাশন|স্থাপত্য' },
  Saturn: { label: { en: 'civil or mechanical engineering, earth sciences, research or public administration', hi: 'सिविल या मैकेनिकल इंजीनियरिंग, भूविज्ञान, रिसर्च या लोक प्रशासन', bn: 'সিভিল বা মেকানিক্যাল ইঞ্জিনিয়ারিং, ভূতত্ত্ব, গবেষণা বা জনপ্রশাসন' }, short: { en: 'civil engineering or research', hi: 'सिविल इंजीनियरिंग या रिसर्च', bn: 'সিভিল ইঞ্জিনিয়ারিং বা গবেষণা' }, model: 'civil or mechanical engineering, earth sciences, research or public administration', terms: 'civil|mechanical|geolog|earth science|research|administrat|सिविल|मैकेनिकल|भूविज्ञान|रिसर्च|प्रशासन|সিভিল|মেকানিক্যাল|ভূতত্ত্ব|গবেষণা|প্রশাসন' },
  Rahu: { label: { en: 'computer science and AI, foreign languages, aviation or media', hi: 'कंप्यूटर साइंस और एआई, विदेशी भाषाएँ, एविएशन या मीडिया', bn: 'কম্পিউটার সায়েন্স ও এআই, বিদেশি ভাষা, এভিয়েশন বা মিডিয়া' }, short: { en: 'computer science and AI, or media', hi: 'कंप्यूटर साइंस और एआई, या मीडिया', bn: 'কম্পিউটার সায়েন্স ও এআই, বা মিডিয়া' }, model: 'computer science and AI, foreign languages, aviation or media', terms: '\\bai\\b|computer|foreign language|aviation|media|एआई|कंप्यूटर|विदेशी भाषा|एविएशन|मीडिया|এআই|কম্পিউটার|বিদেশি ভাষা|এভিয়েশন|মিডিয়া' },
  Ketu: { label: { en: 'research, maths, coding or life sciences', hi: 'रिसर्च, गणित, कोडिंग या जीव विज्ञान', bn: 'গবেষণা, গণিত, কোডিং বা জীববিজ্ঞান' }, short: { en: 'research, coding or life sciences', hi: 'रिसर्च, कोडिंग या जीव विज्ञान', bn: 'গবেষণা, কোডিং বা জীববিজ্ঞান' }, model: 'research, maths, coding or life sciences', terms: 'research|math|coding|life science|biolog|रिसर्च|गणित|कोडिंग|जीव विज्ञान|গবেষণা|গণিত|কোডিং|জীববিজ্ঞান' },
};

// ─── Strengths and weaknesses ────────────────────────────────────────────────

export const STRENGTH: Record<Planet, ItemText & { weak: L3 }> = {
  Sun: { label: { en: 'leadership and confidence', hi: 'नेतृत्व और आत्मविश्वास', bn: 'নেতৃত্ব আর আত্মবিশ্বাস' }, weak: { en: 'pride; let others lead sometimes', hi: 'अहं; कभी-कभी दूसरों को आगे आने दें', bn: 'অহং; মাঝে মাঝে অন্যদের এগোতে দিন' }, model: 'leadership and confidence', terms: 'leader|confiden|नेतृत्व|आत्मविश्वास|নেতৃত্ব|আত্মবিশ্বাস' },
  Moon: { label: { en: 'empathy and care for people', hi: 'सहानुभूति और लोगों की परवाह', bn: 'সহমর্মিতা আর মানুষের প্রতি যত্ন' }, weak: { en: 'mood swings; protect your rest', hi: 'मूड का उतार-चढ़ाव; आराम का ध्यान रखें', bn: 'মেজাজের ওঠানামা; বিশ্রামের যত্ন নিন' }, model: 'empathy and care for people', terms: 'empath|caring|care for|सहानुभूति|परवाह|সহমর্মিতা|যত্ন' },
  Mars: { label: { en: 'courage and drive', hi: 'साहस और जोश', bn: 'সাহস আর উদ্যম' }, weak: { en: 'impatience and a quick temper', hi: 'अधीरता और जल्दी गुस्सा', bn: 'অধৈর্য আর হঠাৎ রাগ' }, model: 'courage and drive', terms: 'courage|drive|brave|साहस|जोश|সাহস|উদ্যম' },
  Mercury: { label: { en: 'quick thinking and communication', hi: 'तेज़ दिमाग और बातचीत का हुनर', bn: 'দ্রুত চিন্তা আর কথা বলার দক্ষতা' }, weak: { en: 'overthinking', hi: 'ज़रूरत से ज़्यादा सोचना', bn: 'অতিরিক্ত ভাবনা' }, model: 'quick thinking and communication', terms: 'quick think|sharp|communicat|तेज़ दिमाग|बातचीत|দ্রুত চিন্তা|কথা বলার' },
  Jupiter: { label: { en: 'wisdom and a gift for guiding others', hi: 'समझदारी और दूसरों को राह दिखाने का गुण', bn: 'জ্ঞান আর অন্যকে পথ দেখানোর গুণ' }, weak: { en: 'over-promising', hi: 'ज़रूरत से ज़्यादा वादे करना', bn: 'বেশি প্রতিশ্রুতি দিয়ে ফেলা' }, model: 'wisdom and a gift for guiding others', terms: 'wisdom|wise|guid|समझदारी|राह दिखाने|জ্ঞান|পথ দেখানো' },
  Venus: { label: { en: 'taste, charm and a sense of harmony', hi: 'अच्छी पसंद, आकर्षण और तालमेल', bn: 'রুচি, আকর্ষণ আর মিলিয়ে চলার গুণ' }, weak: { en: 'too much comfort-seeking', hi: 'आराम की ज़्यादा चाह', bn: 'আরামের প্রতি বেশি টান' }, model: 'taste, charm and a sense of harmony', terms: 'taste|charm|harmon|पसंद|आकर्षण|तालमेल|রুচি|আকর্ষণ|মিলিয়ে' },
  Saturn: { label: { en: 'discipline, patience and staying power', hi: 'अनुशासन, धैर्य और टिके रहने की ताकत', bn: 'শৃঙ্খলা, ধৈর্য আর লেগে থাকার শক্তি' }, weak: { en: 'self-doubt and putting things off', hi: 'खुद पर शक और टालमटोल', bn: 'নিজের ওপর সন্দেহ আর কাজ ফেলে রাখা' }, model: 'discipline, patience and staying power', terms: 'disciplin|patien|staying power|persever|अनुशासन|धैर्य|टिके|শৃঙ্খলা|ধৈর্য|লেগে থাকা' },
  Rahu: { label: { en: 'ambition and fresh ideas', hi: 'महत्वाकांक्षा और नए विचार', bn: 'উচ্চাকাঙ্ক্ষা আর নতুন ভাবনা' }, weak: { en: 'restlessness', hi: 'बेचैनी', bn: 'অস্থিরতা' }, model: 'ambition and fresh ideas', terms: 'ambiti|fresh idea|innovat|महत्वाकांक्षा|नए विचार|উচ্চাকাঙ্ক্ষা|নতুন ভাবনা' },
  Ketu: { label: { en: 'focus, depth and intuition', hi: 'एकाग्रता, गहराई और अंतर्ज्ञान', bn: 'মনোযোগ, গভীরতা আর অন্তর্দৃষ্টি' }, weak: { en: 'pulling away; stay connected to people', hi: 'दूरी बना लेना; लोगों से जुड़े रहें', bn: 'দূরে সরে থাকা; মানুষের সঙ্গে যুক্ত থাকুন' }, model: 'focus, depth and intuition', terms: 'focus|depth|intuiti|एकाग्रता|गहराई|अंतर्ज्ञान|মনোযোগ|গভীরতা|অন্তর্দৃষ্টি' },
};

// ─── Wellbeing habits (not medical advice) ───────────────────────────────────

export const WELLBEING: Record<Planet, ItemText> = {
  Sun: { label: { en: 'morning light, a regular wake-up time and care for heart and eyes', hi: 'सुबह की धूप, समय पर उठना और दिल व आँखों का ख्याल', bn: 'সকালের রোদ, নিয়ম করে ওঠা আর হৃদয় ও চোখের যত্ন' }, model: 'morning light, a regular wake-up time, care for heart and eyes', terms: 'morning|sunlight|wake|heart|eyes|धूप|सुबह|दिल|आँख|রোদ|সকাল|হৃদয়|চোখ' },
  Moon: { label: { en: 'good sleep, enough water and rest for the mind', hi: 'अच्छी नींद, भरपूर पानी और मन का आराम', bn: 'ভালো ঘুম, যথেষ্ট জল আর মনের বিশ্রাম' }, model: 'good sleep, enough water, rest for the mind', terms: 'sleep|water|hydrat|rest|नींद|पानी|आराम|ঘুম|জল|বিশ্রাম' },
  Mars: { label: { en: 'regular exercise to let off stress, and care to avoid injuries', hi: 'तनाव निकालने के लिए नियमित व्यायाम, और चोट से बचाव', bn: 'চাপ কমাতে নিয়মিত ব্যায়াম, আর চোট থেকে সাবধান' }, model: 'regular exercise to let off stress, care to avoid injuries', terms: 'exercis|workout|injur|व्यायाम|कसरत|चोट|ব্যায়াম|ব্যায়াম|চোট' },
  Mercury: { label: { en: 'screen breaks, breathing exercises and calm for the nerves', hi: 'स्क्रीन से ब्रेक, साँस के अभ्यास और मन का सुकून', bn: 'স্ক্রিন থেকে বিরতি, শ্বাসের ব্যায়াম আর স্নায়ুর বিশ্রাম' }, model: 'screen breaks, breathing exercises, calm for the nerves', terms: 'screen|breath|nerv|calm|स्क्रीन|साँस|सांस|सुकून|স্ক্রিন|শ্বাস|স্নায়ু' },
  Jupiter: { label: { en: 'lighter meals and an eye on weight and sugar', hi: 'हल्का खाना और वज़न व शुगर पर नज़र', bn: 'হালকা খাবার আর ওজন ও সুগারের দিকে নজর' }, model: 'lighter meals, an eye on weight and sugar', terms: 'meal|food|diet|weight|sugar|खाना|वज़न|वजन|शुगर|খাবার|ওজন|সুগার' },
  Venus: { label: { en: 'a balanced diet, less sugar and enough water', hi: 'संतुलित भोजन, कम मीठा और भरपूर पानी', bn: 'সুষম খাবার, কম মিষ্টি আর যথেষ্ট জল' }, model: 'a balanced diet, less sugar, enough water', terms: 'balanced|sugar|sweet|water|diet|संतुलित|मीठा|पानी|সুষম|মিষ্টি|জল' },
  Saturn: { label: { en: 'stretching, warmth and a steady routine for joints and bones', hi: 'स्ट्रेचिंग, गरमाहट और नियमित दिनचर्या, जोड़ों और हड्डियों के लिए', bn: 'স্ট্রেচিং, উষ্ণতা আর নিয়মিত রুটিন, হাড় আর গাঁটের জন্য' }, model: 'stretching, warmth, a steady routine for joints and bones', terms: 'stretch|joint|bone|routine|posture|स्ट्रेचिंग|जोड़|हड्डी|दिनचर्या|স্ট্রেচিং|হাড়|হাড়|গাঁট|রুটিন' },
  Rahu: { label: { en: 'a fixed routine and less screen time to ease restlessness', hi: 'तय दिनचर्या और कम स्क्रीन टाइम, ताकि बेचैनी घटे', bn: 'নির্দিষ্ট রুটিন আর কম স্ক্রিন টাইম, যাতে অস্থিরতা কমে' }, model: 'a fixed routine, less screen time to ease restlessness', terms: 'routine|screen|anxi|restless|दिनचर्या|स्क्रीन|बेचैनी|রুটিন|স্ক্রিন|অস্থির' },
  Ketu: { label: { en: 'simple food, care for digestion and regular check-ups', hi: 'सादा खाना, पाचन का ख्याल और नियमित जाँच', bn: 'সাদামাটা খাবার, হজমের যত্ন আর নিয়মিত চেকআপ' }, model: 'simple food, care for digestion, regular check-ups', terms: 'simple food|digest|gut|check-?up|सादा|पाचन|जाँच|जांच|সাদামাটা|হজম|চেকআপ' },
};

// ─── Places (relocation) ─────────────────────────────────────────────────────

export const PLACE: Record<Planet, ItemText> = {
  Sun: { label: { en: 'a capital or administrative city', hi: 'राजधानी या प्रशासनिक शहर', bn: 'রাজধানী বা প্রশাসনিক শহর' }, model: 'a capital or administrative city', terms: 'capital|administrat|राजधानी|प्रशासनिक|রাজধানী|প্রশাসনিক' },
  Moon: { label: { en: 'a place near water or the coast', hi: 'पानी या समुद्र के पास की जगह', bn: 'জল বা সমুদ্রের কাছের জায়গা' }, model: 'a place near water or the coast', terms: 'water|coast|sea|river|पानी|समुद्र|नदी|জল|সমুদ্র|নদী' },
  Mars: { label: { en: 'a busy industrial or tech hub', hi: 'व्यस्त औद्योगिक या टेक शहर', bn: 'ব্যস্ত শিল্প বা টেক শহর' }, model: 'a busy industrial or tech hub', terms: 'industrial|tech hub|busy|औद्योगिक|टेक|व्यस्त|শিল্প|টেক|ব্যস্ত' },
  Mercury: { label: { en: 'a commercial or trading hub', hi: 'व्यापारिक शहर', bn: 'বাণিজ্যিক শহর' }, model: 'a commercial or trading hub', terms: 'commerc|trading|business hub|व्यापारिक|বাণিজ্যিক' },
  Jupiter: { label: { en: 'a university town or culturally rich city', hi: 'शिक्षा और संस्कृति वाला शहर', bn: 'শিক্ষা আর সংস্কৃতির শহর' }, model: 'a university town or culturally rich city', terms: 'universit|cultur|शिक्षा|संस्कृति|শিক্ষা|সংস্কৃতি' },
  Venus: { label: { en: 'a lively, creative, cosmopolitan city', hi: 'रौनक वाला, रचनात्मक और खुला शहर', bn: 'প্রাণবন্ত, সৃজনশীল আর খোলামেলা শহর' }, model: 'a lively, creative, cosmopolitan city', terms: 'lively|creative|cosmopolitan|रौनक|रचनात्मक|প্রাণবন্ত|সৃজনশীল' },
  Saturn: { label: { en: 'an older, quieter or industrial city', hi: 'पुराना, शांत या औद्योगिक शहर', bn: 'পুরনো, শান্ত বা শিল্প শহর' }, model: 'an older, quieter or industrial city', terms: 'older|quiet|industrial|पुराना|शांत|औद्योगिक|পুরনো|শান্ত|শিল্প' },
  Rahu: { label: { en: 'a big international city', hi: 'बड़ा अंतरराष्ट्रीय शहर', bn: 'বড় আন্তর্জাতিক শহর' }, model: 'a big international city', terms: 'international|global|big city|अंतरराष्ट्रीय|बड़ा शहर|আন্তর্জাতিক|বড় শহর' },
  Ketu: { label: { en: 'a quiet, smaller place', hi: 'शांत, छोटी जगह', bn: 'শান্ত, ছোট জায়গা' }, model: 'a quiet, smaller place', terms: 'quiet|small|शांत|छोटी|শান্ত|ছোট' },
};

export const RELOCATE: Record<'abroad' | 'home' | 'mixed', ItemText> = {
  abroad: { label: { en: 'living or working abroad', hi: 'विदेश में रहना या काम करना', bn: 'বিদেশে থাকা বা কাজ করা' }, model: 'living or working abroad', terms: 'abroad|foreign|overseas|विदेश|বিদেশ' },
  home: { label: { en: 'building your life close to your home region', hi: 'अपने ही इलाके के पास जीवन बनाना', bn: 'নিজের এলাকার কাছেই জীবন গড়া' }, model: 'building life close to the home region', terms: 'home region|close to home|near home|roots|local|अपने ही इलाके|घर के पास|নিজের এলাকা|বাড়ির কাছে' },
  mixed: { label: { en: 'work stints or travel abroad, with your roots staying at home', hi: 'विदेश में काम के मौके या यात्राएँ, पर जड़ें घर पर', bn: 'বিদেশে কাজের সুযোগ বা ভ্রমণ, তবে শিকড় বাড়িতেই' }, model: 'work stints or travel abroad, with roots staying at home', terms: 'abroad|travel|stint|roots|विदेश|यात्रा|जड़ें|বিদেশ|ভ্রমণ|শিকড়' },
};

/** Why the chart leans to business / a job (the plain reason of the leaning). */
export const BUSINESS_WHY: Record<'business' | 'job' | 'both', L3> = {
  business: { en: 'your partnership and effort sides are strong, and the planet of trade backs them', hi: 'आपके साझेदारी और मेहनत वाले पहलू मज़बूत हैं, और व्यापार का ग्रह उनका साथ देता है', bn: 'আপনার অংশীদারি আর পরিশ্রমের দিক জোরালো, আর বাণিজ্যের গ্রহ তাদের পাশে আছে' },
  job: { en: 'your daily-work and career sides are steadier than your trade side', hi: 'आपके रोज़ के काम और करियर वाले पहलू व्यापार वाले पहलू से ज़्यादा स्थिर हैं', bn: 'আপনার রোজকার কাজ আর কেরিয়ারের দিক ব্যবসার দিকের চেয়ে বেশি স্থির' },
  both: { en: 'your career and trade sides are about equally strong', hi: 'आपके करियर और व्यापार वाले पहलू लगभग बराबर मज़बूत हैं', bn: 'আপনার কেরিয়ার আর ব্যবসার দিক প্রায় সমান জোরালো' },
};

export const BUSINESS: Record<'business' | 'job' | 'both', ItemText> = {
  business: { label: { en: 'your own business or independent work', hi: 'अपना व्यापार या स्वतंत्र काम', bn: 'নিজের ব্যবসা বা স্বাধীন কাজ' }, model: 'own business or independent work', terms: 'business|own venture|independent|entrepreneur|self-employ|व्यापार|बिज़नेस|बिजनेस|स्वतंत्र|ব্যবসা|স্বাধীন' },
  job: { label: { en: 'a job, growing steadily inside an organisation', hi: 'नौकरी, किसी संस्था में स्थिर तरक्की के साथ', bn: 'চাকরি, কোনো প্রতিষ্ঠানে স্থির উন্নতির সঙ্গে' }, model: 'a job with steady growth inside an organisation', terms: '\\bjob|employ|organi[sz]ation|company|नौकरी|संस्था|कंपनी|চাকরি|প্রতিষ্ঠান|সংস্থা' },
  both: { label: { en: 'a job first, with a side business you grow slowly', hi: 'पहले नौकरी, साथ में धीरे-धीरे बढ़ने वाला छोटा व्यापार', bn: 'আগে চাকরি, সঙ্গে ধীরে ধীরে বাড়ানো একটা পাশের ব্যবসা' }, model: 'a job first, with a side business grown slowly', terms: '\\bjob|side business|side venture|नौकरी|व्यापार|চাকরি|ব্যবসা' },
};

// ─── Family / relationship dynamics ──────────────────────────────────────────

/** How a planet colours a bond (family member or partner), without blame. */
export const DYNAMICS: Record<Planet, ItemText> = {
  Sun: { label: { en: 'pride and different values, with respect that grows over time', hi: 'अहं और अलग सोच, जिसमें समय के साथ सम्मान बढ़ता है', bn: 'অহং আর ভিন্ন মূল্যবোধ, যেখানে সময়ের সঙ্গে সম্মান বাড়ে' }, model: 'pride and different values, with respect that grows over time', terms: 'pride|values|respect|अहं|सोच|सम्मान|অহং|মূল্যবোধ|সম্মান' },
  Moon: { label: { en: 'deep care, with some emotional ups and downs', hi: 'गहरी परवाह, पर भावनाओं का कुछ उतार-चढ़ाव', bn: 'গভীর যত্ন, তবে আবেগের কিছু ওঠানামা' }, model: 'deep care with emotional ups and downs', terms: 'care|emotion|mood|परवाह|भावना|উদ্বেগ|যত্ন|আবেগ' },
  Mars: { label: { en: 'quick tempers and strong opinions, with real loyalty underneath', hi: 'जल्दी गुस्सा और पक्की राय, पर भीतर सच्ची वफ़ादारी', bn: 'তাড়াতাড়ি রাগ আর জোরালো মত, তবে ভেতরে সত্যিকারের টান' }, model: 'quick tempers and strong opinions with loyalty underneath', terms: 'temper|opinion|heated|loyal|गुस्सा|राय|वफ़ादार|रাগ|রাগ|মত|টান' },
  Mercury: { label: { en: 'lots of talking and debating, where clear words solve most of it', hi: 'बहुत बातें और बहस, जहाँ साफ़ शब्द ज़्यादातर बात सुलझा देते हैं', bn: 'অনেক কথা আর তর্ক, যেখানে স্পষ্ট কথাই বেশিরভাগ মিটিয়ে দেয়' }, model: 'lots of talking and debating; clear words solve most of it', terms: 'talk|debat|words|बातें|बहस|शब्द|কথা|তর্ক' },
  Jupiter: { label: { en: 'warmth, guidance and real support', hi: 'अपनापन, मार्गदर्शन और सच्चा सहारा', bn: 'আন্তরিকতা, পথ দেখানো আর সত্যিকারের ভরসা' }, model: 'warmth, guidance and real support', terms: 'warmth|guidance|support|अपनापन|मार्गदर्शन|सहारा|আন্তরিক|পথ দেখানো|ভরসা' },
  Venus: { label: { en: 'affection and a wish for harmony', hi: 'स्नेह और मेल-जोल की चाह', bn: 'স্নেহ আর মিলেমিশে থাকার ইচ্ছে' }, model: 'affection and a wish for harmony', terms: 'affection|harmony|स्नेह|मेल|স্নেহ|মিলেমিশে' },
  Saturn: { label: { en: 'duty, some distance and heavy responsibilities, rather than lasting damage', hi: 'ज़िम्मेदारियाँ और थोड़ी दूरी, कोई स्थायी दरार नहीं', bn: 'দায়িত্ব আর খানিক দূরত্ব, কোনো স্থায়ী ফাটল নয়' }, model: 'duty, some distance and heavy responsibilities rather than lasting damage', terms: 'duty|distance|responsib|ज़िम्मेदारी|जिम्मेदारी|दूरी|দায়িত্ব|দূরত্ব' },
  Rahu: { label: { en: 'mixed signals and restlessness, which settle with honesty', hi: 'उलझे संकेत और बेचैनी, जो ईमानदारी से शांत होती है', bn: 'জট পাকানো ইঙ্গিত আর অস্থিরতা, যা সততায় শান্ত হয়' }, model: 'mixed signals and restlessness that settle with honesty', terms: 'mixed signal|restless|उलझे|बेचैनी|জট|অস্থির' },
  Ketu: { label: { en: 'some emotional distance, where giving each other space helps', hi: 'थोड़ी भावनात्मक दूरी, जहाँ एक-दूसरे को जगह देना मदद करता है', bn: 'খানিকটা মনের দূরত্ব, যেখানে একে অপরকে জায়গা দেওয়া কাজে দেয়' }, model: 'some emotional distance where space helps', terms: 'distance|space|दूरी|जगह|দূরত্ব|জায়গা|জায়গা' },
};

/** Whom a family question is about, in plain words. */
export const FAMILY_WHO: Record<string, L3> = {
  father: { en: 'your father', hi: 'पिता', bn: 'বাবার' }, mother: { en: 'your mother', hi: 'माँ', bn: 'মায়ের' },
  parents: { en: 'your parents', hi: 'माता-पिता', bn: 'বাবা-মায়ের' }, siblings: { en: 'your brother or sister', hi: 'भाई-बहन', bn: 'ভাইবোনের' },
  inlaws: { en: 'your in-laws', hi: 'ससुराल', bn: 'শ্বশুরবাড়ির' }, home: { en: 'home', hi: 'घर', bn: 'বাড়ির' },
};

// ─── Purpose / spiritual path ────────────────────────────────────────────────

export const PURPOSE: Record<Planet, ItemText & { practice: L3 }> = {
  Sun: { label: { en: 'leading by example and living by your principles', hi: 'अपने उदाहरण से राह दिखाना और उसूलों पर चलना', bn: 'নিজের উদাহরণে পথ দেখানো আর নীতিতে চলা' }, practice: { en: 'a quiet morning moment in sunlight to set your intention for the day', hi: 'सुबह की धूप में कुछ शांत पल, दिन का संकल्प लेने के लिए', bn: 'সকালের রোদে কয়েক মুহূর্ত শান্ত থেকে দিনের সংকল্প করা' }, model: 'leading by example and living by principles', terms: 'lead|principle|example|उसूल|उदाहरण|राह|নীতি|উদাহরণ|পথ' },
  Moon: { label: { en: 'devotion and caring for others', hi: 'भक्ति और दूसरों की देखभाल', bn: 'ভক্তি আর অন্যের যত্ন' }, practice: { en: 'a few minutes of prayer, music or chanting each morning', hi: 'हर सुबह कुछ मिनट प्रार्थना, संगीत या जप', bn: 'প্রতিদিন সকালে কয়েক মিনিট প্রার্থনা, গান বা জপ' }, model: 'devotion and caring for others', terms: 'devotion|caring|bhakti|भक्ति|देखभाल|ভক্তি|যত্ন' },
  Mars: { label: { en: 'disciplined practice and courage', hi: 'अनुशासित अभ्यास और साहस', bn: 'নিয়মিত অনুশীলন আর সাহস' }, practice: { en: 'yoga or a daily walk done as a practice, at the same time each day', hi: 'रोज़ एक ही समय पर योग या सैर, एक साधना की तरह', bn: 'রোজ একই সময়ে যোগ বা হাঁটা, সাধনার মতো করে' }, model: 'disciplined practice and courage', terms: 'disciplin|courage|practice|अनुशासन|साहस|अभ्यास|অনুশীলন|সাহস' },
  Mercury: { label: { en: 'learning, writing and teaching', hi: 'सीखना, लिखना और सिखाना', bn: 'শেখা, লেখা আর শেখানো' }, practice: { en: 'ten minutes of journaling each night', hi: 'हर रात दस मिनट डायरी लिखना', bn: 'প্রতি রাতে দশ মিনিট ডায়েরি লেখা' }, model: 'learning, writing and teaching', terms: 'learning|writing|teach|सीखना|लिखना|सिखाना|শেখা|লেখা|শেখানো' },
  Jupiter: { label: { en: 'knowledge and sharing wisdom', hi: 'ज्ञान और समझ बाँटना', bn: 'জ্ঞান আর বোধ ভাগ করে নেওয়া' }, practice: { en: 'reading a few lines of a wise book each day and passing on what you learn', hi: 'रोज़ किसी अच्छी किताब की कुछ पंक्तियाँ पढ़ना और सीखी बात बाँटना', bn: 'রোজ কোনো ভালো বইয়ের কয়েক লাইন পড়া আর শেখা কথা ভাগ করা' }, model: 'knowledge and sharing wisdom', terms: 'knowledge|wisdom|ज्ञान|समझ|জ্ঞান|বোধ' },
  Venus: { label: { en: 'devotion through beauty, music and art', hi: 'सुंदरता, संगीत और कला के ज़रिए भक्ति', bn: 'সৌন্দর্য, গান আর শিল্পের মধ্য দিয়ে ভক্তি' }, practice: { en: 'singing, music or keeping a small, clean space for quiet time', hi: 'गाना, संगीत या शांत समय के लिए एक छोटी साफ़ जगह रखना', bn: 'গান, সংগীত বা শান্ত সময়ের জন্য একটা ছোট পরিচ্ছন্ন জায়গা রাখা' }, model: 'devotion through beauty, music and art', terms: 'devotion|music|art|beauty|भक्ति|संगीत|कला|ভক্তি|সংগীত|শিল্প' },
  Saturn: { label: { en: 'service and steady, honest work', hi: 'सेवा और लगातार, ईमानदार काम', bn: 'সেবা আর নিয়মিত, সৎ কাজ' }, practice: { en: 'ten quiet minutes and one act of service each day', hi: 'हर दिन दस शांत मिनट और सेवा का एक काम', bn: 'প্রতিদিন দশ মিনিট শান্ত থাকা আর একটা সেবার কাজ' }, model: 'service and steady, honest work', terms: 'service|steady|सेवा|ईमानदार|সেবা|সৎ' },
  Rahu: { label: { en: 'exploring new paths and ideas with an open mind', hi: 'खुले मन से नए रास्ते और विचार तलाशना', bn: 'খোলা মনে নতুন পথ আর ভাবনা খোঁজা' }, practice: { en: 'trying one practice for a full month before judging it', hi: 'किसी एक अभ्यास को पूरा एक महीना करके देखना, फिर परखना', bn: 'একটা অনুশীলন পুরো এক মাস করে দেখা, তারপর বিচার করা' }, model: 'exploring new paths with an open mind', terms: 'new path|explor|open mind|नए रास्ते|तलाश|नतुन पथ|নতুন পথ|খোঁজা' },
  Ketu: { label: { en: 'meditation and inner quiet', hi: 'ध्यान और भीतर की शांति', bn: 'ধ্যান আর ভেতরের শান্তি' }, practice: { en: 'ten minutes of silent sitting, morning or night', hi: 'सुबह या रात दस मिनट चुपचाप बैठना', bn: 'সকালে বা রাতে দশ মিনিট চুপচাপ বসা' }, model: 'meditation and inner quiet', terms: 'meditat|inner quiet|silen|ध्यान|शांति|ধ্যান|শান্তি' },
};

// ─── Free remedies (rules.md §5.28; never paid) ──────────────────────────────

export const REMEDY: Record<Planet, { practice: L3; secular: L3 }> = {
  Sun: { practice: { en: 'waking early and sitting in morning light, respecting your father and elders, and the Gayatri or Aditya Hridayam if you like', hi: 'जल्दी उठकर सुबह की धूप में बैठना, पिता और बड़ों का सम्मान, और चाहें तो गायत्री मंत्र या आदित्य हृदय', bn: 'ভোরে উঠে সকালের রোদে বসা, বাবা আর গুরুজনদের সম্মান করা, আর চাইলে গায়ত্রী মন্ত্র বা আদিত্য হৃদয়' },
    secular: { en: 'waking early, getting morning light and helping an elder each week', hi: 'जल्दी उठना, सुबह की धूप लेना और हर हफ़्ते किसी बुज़ुर्ग की मदद करना', bn: 'ভোরে ওঠা, সকালের রোদ নেওয়া আর প্রতি সপ্তাহে কোনো বয়স্ক মানুষকে সাহায্য করা' } },
  Moon: { practice: { en: 'regular sleep, time near water, calling your mother, and Shiva prayers if you like; giving water or milk to someone in need', hi: 'नियमित नींद, पानी के पास कुछ समय, माँ से बात करना, और चाहें तो शिव की प्रार्थना; किसी ज़रूरतमंद को पानी या दूध देना', bn: 'নিয়মিত ঘুম, জলের কাছে কিছুটা সময়, মায়ের সঙ্গে কথা বলা, আর চাইলে শিবের প্রার্থনা; কোনো দরকারি মানুষকে জল বা দুধ দেওয়া' },
    secular: { en: 'regular sleep, time near water and calling your mother', hi: 'नियमित नींद, पानी के पास समय और माँ से बात करना', bn: 'নিয়মিত ঘুম, জলের কাছে সময় আর মায়ের সঙ্গে কথা বলা' } },
  Mars: { practice: { en: 'daily exercise, turning anger into sport, helping your siblings, and the Hanuman Chalisa if you like', hi: 'रोज़ व्यायाम, गुस्से को खेल में बदलना, भाई-बहनों की मदद, और चाहें तो हनुमान चालीसा', bn: 'রোজ ব্যায়াম, রাগকে খেলায় বদলানো, ভাইবোনদের সাহায্য, আর চাইলে হনুমান চালিসা' },
    secular: { en: 'daily exercise, a sport for your energy and helping your siblings', hi: 'रोज़ व्यायाम, ऊर्जा के लिए कोई खेल और भाई-बहनों की मदद', bn: 'রোজ ব্যায়াম, শক্তির জন্য কোনো খেলা আর ভাইবোনদের সাহায্য' } },
  Mercury: { practice: { en: 'learning something every day, keeping your accounts tidy, helping students, and the Vishnu Sahasranama if you like', hi: 'रोज़ कुछ नया सीखना, हिसाब साफ़ रखना, विद्यार्थियों की मदद, और चाहें तो विष्णु सहस्रनाम', bn: 'রোজ কিছু শেখা, হিসেব পরিষ্কার রাখা, ছাত্রছাত্রীদের সাহায্য, আর চাইলে বিষ্ণু সহস্রনাম' },
    secular: { en: 'learning something daily, keeping accounts tidy and helping a student', hi: 'रोज़ कुछ सीखना, हिसाब साफ़ रखना और किसी विद्यार्थी की मदद', bn: 'রোজ কিছু শেখা, হিসেব পরিষ্কার রাখা আর কোনো ছাত্রকে সাহায্য' } },
  Jupiter: { practice: { en: 'studying or teaching, respecting your teachers, giving books or food, and prayers on Thursdays if you like', hi: 'पढ़ना या पढ़ाना, गुरुओं का सम्मान, किताबें या भोजन दान, और चाहें तो गुरुवार की प्रार्थना', bn: 'পড়া বা পড়ানো, শিক্ষকদের সম্মান, বই বা খাবার দান, আর চাইলে বৃহস্পতিবারের প্রার্থনা' },
    secular: { en: 'studying or teaching, thanking a mentor and donating books', hi: 'पढ़ना या पढ़ाना, किसी गुरु का धन्यवाद और किताबें दान', bn: 'পড়া বা পড়ানো, কোনো শিক্ষককে ধন্যবাদ আর বই দান' } },
  Venus: { practice: { en: 'art or music, keeping your home clean and pleasant, respecting your partner, and Lakshmi prayers if you like', hi: 'कला या संगीत, घर साफ़ और सुंदर रखना, साथी का सम्मान, और चाहें तो लक्ष्मी पूजा', bn: 'শিল্প বা গান, ঘর পরিষ্কার আর সুন্দর রাখা, সঙ্গীকে সম্মান, আর চাইলে লক্ষ্মীর প্রার্থনা' },
    secular: { en: 'art or music, a clean and pleasant home and kindness to your partner', hi: 'कला या संगीत, साफ़-सुथरा घर और साथी के प्रति नरमी', bn: 'শিল্প বা গান, পরিচ্ছন্ন ঘর আর সঙ্গীর প্রতি নরম ব্যবহার' } },
  Saturn: { practice: { en: 'discipline and punctuality, serving elderly people or workers, and the Hanuman Chalisa on Saturdays if you like', hi: 'अनुशासन और समय की पाबंदी, बुज़ुर्गों या मज़दूरों की सेवा, और चाहें तो शनिवार को हनुमान चालीसा', bn: 'শৃঙ্খলা আর সময়ানুবর্তিতা, বয়স্ক মানুষ বা শ্রমিকদের সেবা, আর চাইলে শনিবার হনুমান চালিসা' },
    secular: { en: 'a steady routine, being punctual and spending time helping elderly people or workers', hi: 'नियमित दिनचर्या, समय की पाबंदी और बुज़ुर्गों या मज़दूरों की मदद में समय देना', bn: 'নিয়মিত রুটিন, সময় মেনে চলা আর বয়স্ক মানুষ বা শ্রমিকদের সাহায্যে সময় দেওয়া' } },
  Rahu: { practice: { en: 'cutting down screens and intoxicants, staying honest, helping animals, and Durga prayers if you like', hi: 'स्क्रीन और नशे से दूरी, ईमानदारी, जानवरों की मदद, और चाहें तो दुर्गा की प्रार्थना', bn: 'স্ক্রিন আর নেশা কমানো, সৎ থাকা, পশুদের সাহায্য, আর চাইলে দুর্গার প্রার্থনা' },
    secular: { en: 'less screen time, staying honest and helping animals', hi: 'कम स्क्रीन टाइम, ईमानदारी और जानवरों की मदद', bn: 'কম স্ক্রিন টাইম, সততা আর পশুদের সাহায্য' } },
  Ketu: { practice: { en: 'meditation, caring for stray animals, and Ganesha prayers if you like', hi: 'ध्यान, बेसहारा जानवरों की देखभाल, और चाहें तो गणेश वंदना', bn: 'ধ্যান, রাস্তার পশুদের যত্ন, আর চাইলে গণেশ বন্দনা' },
    secular: { en: 'a few minutes of quiet sitting and caring for stray animals', hi: 'कुछ मिनट शांत बैठना और बेसहारा जानवरों की देखभाल', bn: 'কয়েক মিনিট শান্ত বসা আর রাস্তার পশুদের যত্ন' } },
};

export const REMEDY_TERMS = 'routine|exercise|sleep|service|serv|help|meditat|prayer|chalisa|mantra|light|study|teach|discipline|punctual|donat|honest|दिनचर्या|व्यायाम|नींद|सेवा|मदद|ध्यान|प्रार्थना|चालीसा|मंत्र|अनुशासन|दान|ईमानदारी|রুটিন|ব্যায়াম|ঘুম|সেবা|সাহায্য|ধ্যান|প্রার্থনা|চালিসা|মন্ত্র|শৃঙ্খলা|দান|সৎ';

// ─── Love or arranged ────────────────────────────────────────────────────────

export const LOVE_KIND: Record<'love' | 'arranged' | 'both', ItemText> = {
  love: { label: { en: 'a love marriage', hi: 'लव मैरिज', bn: 'প্রেম করে বিয়ে' }, model: 'a love marriage', terms: 'love marriage|लव मैरिज|प्रेम विवाह|প্রেম করে বিয়ে|প্রেমের বিয়ে' },
  arranged: { label: { en: 'an arranged marriage that grows into love', hi: 'अरेंज मैरिज, जिसमें प्यार धीरे-धीरे बढ़ता है', bn: 'দেখাশোনা করে বিয়ে, যেখানে ভালোবাসা ধীরে ধীরে বাড়ে' }, model: 'an arranged marriage that grows into love', terms: 'arranged|अरेंज|দেখাশোনা' },
  both: { label: { en: "a love marriage with your family's blessing", hi: 'परिवार की रज़ामंदी वाली लव मैरिज', bn: 'পরিবারের সম্মতিতে প্রেমের বিয়ে' }, model: "a love marriage with the family's blessing", terms: 'love marriage|blessing|लव मैरिज|रज़ामंदी|रजामंदी|প্রেমের বিয়ে|সম্মতি' },
};
export const LOVE_WHY: Record<'link57' | 'venus5' | 'rahu' | 'link79' | 'jupiter7' | 'none', L3> = {
  link57: { en: 'the guides of your romance side and your partnership side work together', hi: 'आपके प्रेम वाले और साझेदारी वाले पहलू को चलाने वाले ग्रह साथ काम करते हैं', bn: 'আপনার প্রেমের দিক আর সম্পর্কের দিক চালানো গ্রহেরা একসঙ্গে কাজ করে' },
  venus5: { en: 'the planet of love sits with the guide of your romance side', hi: 'प्रेम का ग्रह आपके रोमांस वाले पहलू के ग्रह के साथ है', bn: 'প্রেমের গ্রহ আপনার রোমান্সের দিকের গ্রহের সঙ্গে আছে' },
  rahu: { en: 'an unconventional streak touches your partnership side', hi: 'आपके साझेदारी वाले पहलू में अलग सोच की झलक है', bn: 'আপনার সম্পর্কের দিকে একটা অন্যরকম ছোঁয়া আছে' },
  link79: { en: 'your partnership side is tied to family, tradition and blessings', hi: 'आपका साझेदारी वाला पहलू परिवार, परंपरा और आशीर्वाद से जुड़ा है', bn: 'আপনার সম্পর্কের দিক পরিবার, প্রথা আর আশীর্বাদের সঙ্গে যুক্ত' },
  jupiter7: { en: 'the planet of wisdom watches over your partnership side', hi: 'ज्ञान का ग्रह आपके साझेदारी वाले पहलू पर नज़र रखता है', bn: 'জ্ঞানের গ্রহ আপনার সম্পর্কের দিকে নজর রাখে' },
  none: { en: 'no single pull dominates, so how you meet is open', hi: 'कोई एक झुकाव हावी नहीं, इसलिए मुलाकात का तरीका खुला है', bn: 'কোনো একটা টান প্রবল নয়, তাই দেখা হওয়ার পথ খোলা' },
};

// ─── Answer sentences ────────────────────────────────────────────────────────

type Table = L3;

/** Opening sentence per ask; two variants each (the template picks one that doesn't repeat the thread). */
export const LEAD: Record<string, Table[]> = {
  careerField: [
    { en: 'Your chart points most clearly to {items}.', hi: 'आपके चार्ट का सबसे साफ़ झुकाव इन क्षेत्रों की ओर है: {items}।', bn: 'আপনার চার্ট সবচেয়ে স্পষ্টভাবে দেখায় এই দিকগুলো: {items}।' },
    { en: 'The fields that suit you best are {items}.', hi: 'आपके लिए सबसे अच्छे क्षेत्र हैं: {items}।', bn: 'আপনার জন্য সবচেয়ে মানানসই ক্ষেত্রগুলো হলো {items}।' },
  ],
  partner: [
    { en: 'Your chart describes a partner who is {items}.', hi: 'आपका चार्ट ऐसे जीवनसाथी की ओर इशारा करता है जो {items} हो।', bn: 'আপনার চার্ট এমন সঙ্গীর কথা বলে, যিনি {items}।' },
    { en: 'The person who suits you is likely {items}.', hi: 'आपके लिए सही व्यक्ति शायद {items} होगा।', bn: 'আপনার জন্য মানানসই মানুষটি সম্ভবত {items}।' },
  ],
  moneySources: [
    { en: 'Your money comes most naturally from {items}.', hi: 'आपके लिए पैसा सबसे सहज रूप से {items} से आता है।', bn: 'আপনার টাকা সবচেয়ে সহজে আসে {items} থেকে।' },
    { en: 'The best sources of income for you are {items}.', hi: 'आपकी कमाई के सबसे अच्छे स्रोत हैं: {items}।', bn: 'আপনার আয়ের সবচেয়ে ভালো উৎস হলো {items}।' },
  ],
  studyField: [
    { en: 'The subjects that suit you best are {items}.', hi: 'आपके लिए सबसे अच्छे विषय हैं: {items}।', bn: 'আপনার জন্য সবচেয়ে মানানসই বিষয় হলো {items}।' },
    { en: 'Your chart favours {items} for study.', hi: 'पढ़ाई के लिए आपका चार्ट {items} का साथ देता है।', bn: 'পড়াশোনার জন্য আপনার চার্ট যেদিকে টানে: {items}।' },
  ],
  strengths: [
    { en: 'Your biggest strengths are {items}.', hi: 'आपकी सबसे बड़ी ताकतें हैं: {items}।', bn: 'আপনার সবচেয়ে বড় শক্তি: {items}।' },
    { en: 'What stands out in you is {items}.', hi: 'आपमें सबसे खास बात है: {items}।', bn: 'আপনার মধ্যে যা সবচেয়ে চোখে পড়ে তা হলো {items}।' },
  ],
  wellbeing: [
    { en: 'For your wellbeing, the habits that help most are {items}.', hi: 'आपकी सेहत के लिए सबसे ज़्यादा मदद करने वाली आदतें हैं: {items}।', bn: 'আপনার সুস্থতার জন্য সবচেয়ে কাজের অভ্যাস হলো {items}।' },
    { en: 'Your chart asks you to look after {items}.', hi: 'आपका चार्ट कहता है कि {items} का ध्यान रखें।', bn: 'আপনার চার্ট বলে এগুলোর দিকে নজর দিন: {items}।' },
  ],
  relocation: [
    { en: 'Your chart leans towards {items}.', hi: 'आपके चार्ट का झुकाव है: {items}।', bn: 'আপনার চার্টের ঝোঁক এই দিকে: {items}।' },
    { en: 'The pattern in your chart is {items}.', hi: 'आपके चार्ट का रुझान है: {items}।', bn: 'আপনার চার্টের ঝোঁক হলো {items}।' },
  ],
  businessVsJob: [
    { en: 'Your chart favours {items}.', hi: 'आपका चार्ट इस ओर झुकता है: {items}।', bn: 'আপনার চার্ট বেশি টানে এই দিকে: {items}।' },
    { en: 'The better fit for you is {items}.', hi: 'आपके लिए बेहतर है: {items}।', bn: 'আপনার জন্য বেশি মানানসই হলো {items}।' },
  ],
  family: [
    { en: 'With {who}, your chart shows {items}.', hi: '{who} के साथ आपके चार्ट में दिखता है: {items}।', bn: '{who} সঙ্গে আপনার চার্টে দেখা যায়: {items}।' },
    { en: 'The bond with {who} carries {items}.', hi: '{who} के साथ रिश्ते में है: {items}।', bn: '{who} সঙ্গে সম্পর্কে আছে: {items}।' },
  ],
  relationship: [
    { en: 'In your relationships the chart shows {items}. That is a pattern to work with, not an ending.', hi: 'आपके रिश्तों में चार्ट दिखाता है: {items}। यह एक दौर है, अंत नहीं।', bn: 'আপনার সম্পর্কে চার্ট দেখায়: {items}। এটা একটা ধরন, শেষ নয়।' },
    { en: 'What runs through your relationships is {items}.', hi: 'आपके रिश्तों में बार-बार दिखता है: {items}।', bn: 'আপনার সম্পর্কগুলোয় বারবার দেখা যায়: {items}।' },
  ],
  purpose: [
    { en: 'Your chart points to {items} as your path.', hi: 'आपके चार्ट में आपकी राह यह दिखती है: {items}।', bn: 'আপনার চার্ট আপনার পথ হিসেবে দেখায়: {items}।' },
    { en: 'The theme that gives your life meaning is {items}.', hi: 'आपके जीवन को अर्थ देने वाला विषय है: {items}।', bn: 'আপনার জীবনে অর্থ আনে এই বিষয়: {items}।' },
  ],
  remedies: [
    { en: 'The kindest remedies for you are {items}.', hi: 'आपके लिए सबसे सरल उपाय हैं: {items}।', bn: 'আপনার জন্য সবচেয়ে সহজ প্রতিকার: {items}।' },
    { en: 'What supports you most is {items}.', hi: 'आपको सबसे ज़्यादा सहारा देता है: {items}।', bn: 'আপনাকে সবচেয়ে বেশি সাহায্য করে: {items}।' },
  ],
  loveArranged: [
    { en: 'Your chart leans toward {items}.', hi: 'आपका चार्ट इस ओर झुकता है: {items}।', bn: 'আপনার চার্ট বেশি টানে এই দিকে: {items}।' },
    { en: 'The likelier path for you is {items}.', hi: 'आपके लिए ज़्यादा संभावित रास्ता है: {items}।', bn: 'আপনার জন্য বেশি সম্ভাব্য পথ: {items}।' },
  ],
  whyNow: [
    { en: 'What you are feeling comes from where you are in your life cycles: {items}.', hi: 'आप जो महसूस कर रहे हैं, वह आपके जीवन के मौजूदा चक्र से आता है: {items}।', bn: 'আপনি যা অনুভব করছেন, তা আসে আপনার জীবনের এখনকার চক্র থেকে: {items}।' },
    { en: 'Here is why things feel this way right now: {items}.', hi: 'अभी ऐसा क्यों लग रहा है, इसकी वजह है: {items}।', bn: 'এখন কেন এমন লাগছে, তার কারণ: {items}।' },
  ],
};

/** "Examples: …" line (career fields). */
export const EXAMPLES: Table = { en: 'Roles to look at: {examples}.', hi: 'इन भूमिकाओं पर ध्यान दें: {examples}।', bn: 'এই ধরনের কাজগুলো দেখুন: {examples}।' };
/** "This is because …" before the reasons. */
export const BECAUSE: Table = { en: 'That is because {reasons}.', hi: 'ऐसा इसलिए है क्योंकि {reasons}।', bn: 'কারণ {reasons}।' };
export const AND: Table = { en: ' and ', hi: ' और ', bn: ' আর ' };
export const COMMA: Table = { en: ', ', hi: ', ', bn: ', ' };
/** Partner: where you meet. */
export const MEET_LINE: Table = { en: 'You are likely to meet {meet}.', hi: 'मुलाकात शायद {meet} होगी।', bn: 'দেখা হওয়ার সম্ভাবনা {meet}।' };
/** Strengths: the weak side. */
export const WEAK_LINE: Table = { en: 'The side to watch is {weak}.', hi: 'जिस बात का ध्यान रखना है: {weak}।', bn: 'যে দিকটায় নজর রাখা দরকার: {weak}।' };
/** Relocation: kind of place. */
export const PLACE_LINE: Table = { en: 'The kind of place that suits you is {place}.', hi: 'आपके लिए सही जगह होगी: {place}।', bn: 'আপনার জন্য মানানসই জায়গা হলো {place}।' };
/** Business vs job: in which field. */
export const FIELD_LINE: Table = { en: 'Either way, the field that suits you most is {field}.', hi: 'रास्ता जो भी चुनें, आपके लिए सबसे अच्छा क्षेत्र है: {field}।', bn: 'যেটাই করুন, আপনার জন্য সবচেয়ে মানানসই ক্ষেত্র হলো {field}।' };
/** Optional window line for choice answers. */
export const WINDOW_LINE: Table = { en: 'A good time to make your move is {start} to {end}.', hi: 'कदम बढ़ाने का अच्छा समय {start} से {end} तक है।', bn: 'পা বাড়ানোর ভালো সময় {start} থেকে {end}।' };
export const DOCTOR_LINE: Table = { en: 'For anything medical, please see a doctor.', hi: 'किसी भी बीमारी के लिए डॉक्टर से ज़रूर मिलें।', bn: 'শরীরের কোনো সমস্যায় অবশ্যই ডাক্তার দেখান।' };

/** One practical line per ask. */
export const TIP: Record<string, Table> = {
  careerField: { en: 'Put these skills first on your CV and apply where they are the main part of the job.', hi: 'इन हुनरों को अपने बायोडाटा में सबसे ऊपर रखें और वहीं आवेदन करें जहाँ ये काम का मुख्य हिस्सा हों।', bn: 'এই দক্ষতাগুলো বায়োডেটার শুরুতে রাখুন, আর যেখানে এগুলোই কাজের মূল অংশ সেখানে আবেদন করুন।' },
  partner: { en: 'Look for these qualities rather than a fixed picture, and let trust build at its own pace.', hi: 'किसी तय तस्वीर के बजाय इन गुणों को देखें, और भरोसे को अपने समय पर बढ़ने दें।', bn: 'কোনো বাঁধা ছবির বদলে এই গুণগুলো খুঁজুন, আর ভরসাকে নিজের মতো করে গড়ে উঠতে দিন।' },
  moneySources: { en: 'Build on these first, save a fixed share every month, and keep risky bets small.', hi: 'पहले इन्हीं पर ध्यान दें, हर महीने तय हिस्सा बचाएँ, और जोखिम वाले दाँव छोटे रखें।', bn: 'আগে এগুলোর ওপর জোর দিন, প্রতি মাসে নির্দিষ্ট অংশ সঞ্চয় করুন, আর ঝুঁকির বাজি ছোট রাখুন।' },
  studyField: { en: 'Try a short course in the first of these before you commit to a long degree.', hi: 'लंबी डिग्री से पहले इनमें से पहले विषय का एक छोटा कोर्स करके देखें।', bn: 'লম্বা ডিগ্রির আগে প্রথম বিষয়টার একটা ছোট কোর্স করে দেখুন।' },
  strengths: { en: 'Lean on these in work and relationships, and choose roles that use them every day.', hi: 'काम और रिश्तों में इन्हीं पर भरोसा करें, और ऐसे काम चुनें जिनमें ये रोज़ काम आएँ।', bn: 'কাজে আর সম্পর্কে এগুলোর ওপর ভরসা রাখুন, আর এমন কাজ বেছে নিন যেখানে এগুলো রোজ কাজে লাগে।' },
  wellbeing: { en: 'Small daily habits matter more than big changes.', hi: 'बड़े बदलावों से ज़्यादा रोज़ की छोटी आदतें मायने रखती हैं।', bn: 'বড় বদলের চেয়ে রোজকার ছোট অভ্যাসই বেশি কাজের।' },
  relocation: { en: 'Visit or take a short stint first, and decide once the move also makes sense for your work.', hi: 'पहले कुछ समय जाकर देखें, और फ़ैसला तब करें जब यह कदम आपके काम के लिए भी सही लगे।', bn: 'আগে কিছুদিন গিয়ে দেখুন, আর সিদ্ধান্ত নিন যখন কাজের দিক থেকেও সেটা ঠিক মনে হয়।' },
  businessVsJob: { en: 'Test the idea on a small scale before you put in big money.', hi: 'बड़ा पैसा लगाने से पहले छोटे स्तर पर आज़माकर देखें।', bn: 'বড় টাকা ঢালার আগে ছোট করে চেষ্টা করে দেখুন।' },
  family: { en: 'Try small routines: one shared meal a week, and clear, kind words about who does what.', hi: 'छोटी आदतें अपनाएँ: हफ़्ते में एक बार साथ खाना, और कौन क्या करेगा इस पर साफ़ और नरम बात।', bn: 'ছোট অভ্যাস গড়ুন: সপ্তাহে একবার একসঙ্গে খাওয়া, আর কে কী করবে তা নিয়ে স্পষ্ট, নরম কথা বলা।' },
  relationship: { en: 'Pick one calm time each week to talk, listen first, and avoid big decisions in the middle of an argument.', hi: 'हर हफ़्ते बात करने का एक शांत समय तय करें, पहले सुनें, और झगड़े के बीच बड़े फ़ैसले न लें।', bn: 'প্রতি সপ্তাহে কথা বলার একটা শান্ত সময় ঠিক করুন, আগে শুনুন, আর ঝগড়ার মাঝে বড় সিদ্ধান্ত নেবেন না।' },
  purpose: { en: 'Start small and keep it daily; meaning grows from practice more than from big decisions.', hi: 'छोटी शुरुआत करें और इसे रोज़ करें; अर्थ बड़े फ़ैसलों से ज़्यादा अभ्यास से आता है।', bn: 'ছোট করে শুরু করুন আর রোজ করুন; বড় সিদ্ধান্তের চেয়ে অনুশীলন থেকেই অর্থ আসে।' },
  remedies: { en: 'These are optional and free; take up the ones that fit your beliefs, and your own effort does the rest.', hi: 'ये सब मुफ़्त और वैकल्पिक हैं; जो आपकी आस्था से मेल खाएँ, वही अपनाएँ, बाकी आपकी मेहनत करेगी।', bn: 'এগুলো বিনামূল্যে আর ঐচ্ছিক; যেগুলো আপনার বিশ্বাসের সঙ্গে মেলে সেগুলো নিন, বাকিটা আপনার চেষ্টাই করবে।' },
  loveArranged: { en: 'Talk openly with your family early; that helps whichever way it goes.', hi: 'परिवार से जल्दी और खुलकर बात करें; रास्ता जो भी हो, इससे मदद मिलती है।', bn: 'পরিবারের সঙ্গে আগেভাগে খোলাখুলি কথা বলুন; পথ যেটাই হোক, এতে সাহায্য হয়।' },
  whyNow: { en: 'Slow progress now is preparation, not failure; keep a steady routine and finish what you start.', hi: 'अभी की धीमी चाल नाकामी नहीं, तैयारी है; नियमित रहें और जो शुरू करें उसे पूरा करें।', bn: 'এখনকার ধীর গতি ব্যর্থতা নয়, প্রস্তুতি; নিয়ম মেনে চলুন আর যা শুরু করেন তা শেষ করুন।' },
};

/** whyNow items. {area} plain area; {end} month label. */
export const WHY_NOW: Record<'maha' | 'antar' | 'sadeSati' | 'ashtama' | 'kantaka' | 'notLinked' | 'linked'
  | 'supportive' | 'effortful' | 'friction' | 'cost' | 'nextLinked' | 'nextOther' | 'rules', Table> = {
  supportive: { en: 'a supportive cycle for you overall', hi: 'कुल मिलाकर आपके लिए सहायक चक्र', bn: 'সব মিলিয়ে আপনার জন্য সহায়ক চক্র' },
  effortful: { en: 'a cycle that asks for effort more than it gives', hi: 'ऐसा चक्र जो देता कम और मेहनत ज़्यादा माँगता है', bn: 'এমন চক্র যা দেয় কম, পরিশ্রম চায় বেশি' },
  friction: { en: 'The long and the short cycle pull in different directions now, which adds friction.', hi: 'अभी लंबा और छोटा चक्र अलग-अलग दिशाओं में खींचते हैं, इसलिए खिंचाव ज़्यादा है।', bn: 'এখন বড় আর ছোট চক্র দুদিকে টানে, তাই টানাপোড়েন বেশি।' },
  cost: { en: 'The two cycles together bring extra expenses and effort.', hi: 'दोनों चक्र मिलकर खर्च और मेहनत बढ़ाते हैं।', bn: 'দুটো চক্র মিলে খরচ আর পরিশ্রম বাড়ায়।' },
  nextLinked: { en: 'The next shorter cycle, from {start}, is tied to {topic}, so things open up then.', hi: '{start} से शुरू होने वाला अगला छोटा चक्र {topic} से जुड़ा है, इसलिए तब रास्ते खुलते हैं।', bn: '{start} থেকে শুরু হওয়া পরের ছোট চক্র {topic} সঙ্গে যুক্ত, তাই তখন পথ খোলে।' },
  nextOther: { en: 'The next shorter cycle begins in {start} and changes the focus again.', hi: 'अगला छोटा चक्र {start} में शुरू होता है और ध्यान फिर बदलता है।', bn: 'পরের ছোট চক্র শুরু হয় {start}-এ আর মন আবার অন্য দিকে যায়।' },
  rules: { en: '{area}', hi: '{area}', bn: '{area}' },
  maha: { en: 'your long {P} period, which centres life on {area}', hi: 'आपका {P} का लंबा दौर, जो जीवन का ध्यान {area} पर रखता है', bn: 'আপনার {P}-এর লম্বা পর্ব, যা জীবনের ঝোঁক রাখে {area} দিকে' },
  antar: { en: 'a shorter {P} period until {end}, focused on {area}', hi: '{end} तक {P} का छोटा दौर, जिसका ध्यान {area} पर है', bn: '{end} পর্যন্ত {P}-এর ছোট পর্ব, যার ঝোঁক {area} দিকে' },
  sadeSati: { en: 'Saturn passing over your Moon sign, a slow, testing time for the mind that eases around {end}', hi: 'आपकी चंद्र राशि पर शनि का गोचर, मन के लिए धीमा और परखने वाला समय, जो {end} के आसपास हल्का होगा', bn: 'আপনার চন্দ্ররাশির ওপর দিয়ে শনির চলা, মনের জন্য ধীর আর পরীক্ষার সময়, যা {end} নাগাদ হালকা হবে' },
  ashtama: { en: 'a heavy Saturn passage with sudden changes, which lifts around {end}', hi: 'शनि का भारी गोचर, अचानक बदलावों के साथ, जो {end} के आसपास हटेगा', bn: 'হঠাৎ বদলের সঙ্গে শনির একটা ভারী যাত্রা, যা {end} নাগাদ কাটবে' },
  kantaka: { en: 'Saturn putting strain on your home and peace of mind, which lifts around {end}', hi: 'घर और मन की शांति पर शनि का दबाव, जो {end} के आसपास हटेगा', bn: 'বাড়ি আর মনের শান্তির ওপর শনির চাপ, যা {end} নাগাদ কাটবে' },
  notLinked: { en: 'This cycle does not light up {topic} much, which is why it feels slow.', hi: 'यह चक्र {topic} को ज़्यादा सहारा नहीं देता, इसीलिए चीज़ें धीमी लगती हैं।', bn: 'এই চক্র {topic} দিকে বেশি সাড়া দেয় না, তাই সব ধীর মনে হয়।' },
  linked: { en: 'This cycle does support {topic}, so steady effort now builds the base.', hi: 'यह चक्र {topic} का साथ देता है, इसलिए अभी की लगातार मेहनत नींव बनाती है।', bn: 'এই চক্র {topic} পাশে আছে, তাই এখনকার টানা চেষ্টাই ভিত গড়ে।' },
};

/**
 * The question re-read for the model when the user clarifies ("Like I'm
 * asking which domain?"): a standalone question in the phrasing of the
 * model's training seeds (ml/data/questions.py), in the user's language.
 */
export const ASK_QUESTION: Record<string, Table> = {
  careerField: { en: 'What career suits me?', hi: 'मेरे लिए कौन सा करियर सही है?', bn: 'আমার জন্য কোন কেরিয়ার ঠিক?' },
  partner: { en: 'What will my spouse be like?', hi: 'मेरा जीवनसाथी कैसा होगा?', bn: 'আমার জীবনসঙ্গী কেমন হবেন?' },
  moneySources: { en: 'How can I earn more money?', hi: 'मेरी कमाई कैसे बढ़ेगी?', bn: 'আমার আয় কীভাবে বাড়বে?' },
  studyField: { en: 'Which field should I study?', hi: 'मुझे किस क्षेत्र की पढ़ाई करनी चाहिए?', bn: 'আমার কোন বিষয় নিয়ে পড়া উচিত?' },
  strengths: { en: 'What is my biggest strength?', hi: 'मेरी सबसे बड़ी खूबी क्या है?', bn: 'আমার সবচেয়ে বড় গুণ কী?' },
  wellbeing: { en: 'What should I watch out for with my health?', hi: 'सेहत में मुझे किन बातों का ध्यान रखना चाहिए?', bn: 'স্বাস্থ্যের ব্যাপারে আমার কী খেয়াল রাখা উচিত?' },
  relocation: { en: 'Will I settle abroad?', hi: 'क्या मेरा विदेश में बसना होगा?', bn: 'আমি কি বিদেশে থিতু হব?' },
  businessVsJob: { en: 'Is business or a job better for me?', hi: 'मेरे लिए व्यापार बेहतर है या नौकरी?', bn: 'আমার জন্য ব্যবসা ভালো, নাকি চাকরি?' },
  whyNow: { en: 'Why is everything so hard right now?', hi: 'अभी सब कुछ इतना मुश्किल क्यों है?', bn: 'এখন সবকিছু এত কঠিন কেন?' },
  family: { en: 'How is my relationship with my parents going to be?', hi: 'माता-पिता से मेरा रिश्ता कैसा रहेगा?', bn: 'বাবা-মায়ের সঙ্গে আমার সম্পর্ক কেমন থাকবে?' },
  relationship: { en: 'Why do my relationships keep failing?', hi: 'मेरे रिश्ते बार-बार क्यों टूटते हैं?', bn: 'আমার সম্পর্কগুলো বারবার কেন ভেঙে যায়?' },
  purpose: { en: 'What kind of person am I really?', hi: 'मैं असल में कैसा इंसान हूँ?', bn: 'আমি আসলে কেমন মানুষ?' },
  remedies: { en: 'Is there anything I can do to improve my luck?', hi: 'क्या मैं अपना भाग्य सुधारने के लिए कुछ कर सकता हूँ?', bn: 'ভাগ্য ভালো করতে আমি কি কিছু করতে পারি?' },
  loveArranged: { en: 'Will my marriage be love or arranged?', hi: 'मेरी शादी लव होगी या अरेंज?', bn: 'আমার বিয়ে প্রেমের হবে না দেখাশোনা করে?' },
};

/** Topic nouns for whyNow ("…does not light up {topic}"). */
export const TOPIC_NOUN: Record<string, Table> = {
  job: { en: 'your career', hi: 'आपके करियर', bn: 'আপনার কাজের' },
  promotion: { en: 'your career', hi: 'आपके करियर', bn: 'আপনার কাজের' },
  business: { en: 'business', hi: 'व्यापार', bn: 'ব্যবসার' },
  money: { en: 'money', hi: 'धन', bn: 'টাকাপয়সার' },
  marriage: { en: 'marriage', hi: 'शादी', bn: 'বিয়ের' },
  love: { en: 'love', hi: 'प्रेम', bn: 'প্রেমের' },
  education: { en: 'studies', hi: 'पढ़ाई', bn: 'পড়াশোনার' },
  health: { en: 'health', hi: 'सेहत', bn: 'স্বাস্থ্যের' },
  property: { en: 'home and property', hi: 'घर और संपत्ति', bn: 'বাড়ি আর সম্পত্তির' },
  children: { en: 'family growth', hi: 'परिवार बढ़ने', bn: 'পরিবার বাড়ার' },
  foreign: { en: 'going abroad', hi: 'विदेश जाने', bn: 'বিদেশযাত্রার' },
  legal: { en: 'legal matters', hi: 'कानूनी मामलों', bn: 'আইনি বিষয়ের' },
  general: { en: 'your plans', hi: 'आपकी योजनाओं', bn: 'আপনার পরিকল্পনার' },
};

/** A follow-up on the same ask: point back briefly instead of restating everything. */
export const FOLLOW_LEAD: Table = {
  en: 'To be specific, your strongest direction is {item}.',
  hi: 'साफ़ कहूँ तो आपकी सबसे मज़बूत दिशा है: {item}।',
  bn: 'স্পষ্ট করে বললে, আপনার সবচেয়ে জোরালো দিক হলো {item}।',
};
/** FOLLOW_LEAD / NEXT_ITEM for asks whose items aren't "directions" (partner traits, money sources …). */
export const FOLLOW_LEAD_ASK: Partial<Record<string, Table>> = {
  partner: { en: 'The partner your chart describes is {item}.', hi: 'आपके चार्ट में साथी के ये गुण दिखते हैं: {item}।', bn: 'আপনার চার্টে সঙ্গীর এই গুণগুলো দেখা যায়: {item}।' },
  moneySources: { en: 'As I said, your money comes most naturally from {item}.', hi: 'जैसा बताया, आपका पैसा सबसे सहज रूप से {item} से आता है।', bn: 'যেমন বললাম, আপনার টাকা সবচেয়ে সহজে আসে {item} থেকে।' },
  strengths: { en: 'As I said, your biggest strength is {item}.', hi: 'जैसा बताया, आपकी सबसे बड़ी ताकत है: {item}।', bn: 'যেমন বললাম, আপনার সবচেয়ে বড় শক্তি হলো {item}।' },
};
export const NEXT_ITEM_ASK: Partial<Record<string, Table>> = {
  partner: { en: 'They may also be {item}, because {why}.', hi: 'उनमें ये गुण भी हो सकते हैं: {item}, क्योंकि {why}।', bn: 'ওঁর মধ্যে এই গুণগুলোও থাকতে পারে: {item}, কারণ {why}।' },
  strengths: { en: 'Another strength is {item}, because {why}.', hi: 'एक और ताकत है {item}, क्योंकि {why}।', bn: 'আরেকটা শক্তি হলো {item}, কারণ {why}।' },
};

/** More examples (the second item's). */
export const EXAMPLES_MORE: Table = { en: 'Also worth a look: {examples}.', hi: 'इन पर भी नज़र डालें: {examples}।', bn: 'এগুলোও দেখে নিতে পারেন: {examples}।' };

/** A second practical line per ask, for follow-ups (never the same advice twice). */
export const TIP2: Record<string, Table> = {
  careerField: { en: 'Pick one of these roles, learn its main skill over the next month and show it in a small project.', hi: 'इनमें से एक भूमिका चुनें, अगले एक महीने में उसका मुख्य हुनर सीखें और किसी छोटे प्रोजेक्ट में दिखाएँ।', bn: 'এর মধ্যে একটা কাজ বেছে নিন, সামনের এক মাসে তার মূল দক্ষতাটা শিখুন আর একটা ছোট প্রজেক্টে দেখান।' },
  partner: { en: 'Notice who shows these qualities in everyday life, not just when you first meet.', hi: 'देखें कि ये गुण रोज़ के व्यवहार में किसमें दिखते हैं, सिर्फ़ पहली मुलाकात में नहीं।', bn: 'দেখুন রোজকার আচরণে কার মধ্যে এই গুণগুলো আছে, শুধু প্রথম দেখায় নয়।' },
  moneySources: { en: 'Start one small income stream from the first of these, and put part of every gain into savings.', hi: 'इनमें से पहले वाले से कमाई का एक छोटा ज़रिया शुरू करें, और हर फ़ायदे का कुछ हिस्सा बचाएँ।', bn: 'প্রথমটা দিয়ে আয়ের একটা ছোট পথ শুরু করুন, আর প্রতিটা লাভের কিছু অংশ জমান।' },
  studyField: { en: 'Talk to two people already working in these fields before you choose.', hi: 'चुनने से पहले इन क्षेत्रों में काम कर रहे दो लोगों से बात करें।', bn: 'বেছে নেওয়ার আগে এই ক্ষেত্রগুলোয় কাজ করছেন এমন দুজনের সঙ্গে কথা বলুন।' },
  strengths: { en: 'Ask a friend where they see these in you, and use them on purpose this week.', hi: 'किसी दोस्त से पूछें कि उन्हें ये बातें आपमें कहाँ दिखती हैं, और इस हफ़्ते इन्हें सोच-समझकर काम में लाएँ।', bn: 'কোনো বন্ধুকে জিজ্ঞেস করুন আপনার মধ্যে এগুলো কোথায় দেখেন, আর এই সপ্তাহে জেনেবুঝে কাজে লাগান।' },
  wellbeing: { en: 'Pick one habit and keep it for three weeks before adding another.', hi: 'एक आदत चुनें और दूसरी जोड़ने से पहले तीन हफ़्ते तक उसे निभाएँ।', bn: 'একটা অভ্যাস বেছে নিন, আরেকটা যোগ করার আগে তিন সপ্তাহ সেটা ধরে রাখুন।' },
  relocation: { en: 'Compare the work you would get there with what you have now before you decide.', hi: 'फ़ैसले से पहले वहाँ मिलने वाले काम की तुलना अभी के काम से करें।', bn: 'সিদ্ধান্তের আগে সেখানে যে কাজ পাবেন তার সঙ্গে এখনকার কাজের তুলনা করুন।' },
  businessVsJob: { en: 'Keep a steady income while you test the idea, and grow it only once it pays for itself.', hi: 'आइडिया आज़माते समय स्थिर आमदनी बनाए रखें, और उसे तभी बढ़ाएँ जब वह अपना खर्च खुद निकालने लगे।', bn: 'ভাবনাটা যাচাই করার সময় স্থির আয় বজায় রাখুন, আর সেটা নিজের খরচ তুলতে পারলে তবেই বাড়ান।' },
  family: { en: 'Choose one thing you can do for them this week, without waiting for them to go first.', hi: 'इस हफ़्ते उनके लिए एक काम चुनें, उनके पहल करने का इंतज़ार किए बिना।', bn: 'এই সপ্তাহে ওঁদের জন্য একটা কাজ বেছে নিন, ওঁরা আগে এগোবেন সেই অপেক্ষা না করে।' },
  relationship: { en: 'Write down what you each need most, and talk about one item at a time.', hi: 'दोनों अपनी सबसे बड़ी ज़रूरत लिखें, और एक बार में एक बात पर बात करें।', bn: 'দুজনেই নিজের সবচেয়ে বড় প্রয়োজন লিখুন, আর একবারে একটা বিষয় নিয়ে কথা বলুন।' },
  purpose: { en: 'Keep a note of what made a day feel meaningful; the pattern shows your path.', hi: 'लिखते रहें कि किस बात से दिन सार्थक लगा; उसी में आपकी राह दिखेगी।', bn: 'লিখে রাখুন কোন জিনিসে দিনটা অর্থপূর্ণ লাগল; সেখানেই আপনার পথ দেখা যাবে।' },
  remedies: { en: 'Pick one practice and keep it for forty days before adding another.', hi: 'एक अभ्यास चुनें और दूसरा जोड़ने से पहले उसे चालीस दिन निभाएँ।', bn: 'একটা অনুশীলন বেছে নিন, আরেকটা যোগ করার আগে চল্লিশ দিন সেটা ধরে রাখুন।' },
  loveArranged: { en: 'Let the person meet your family early, so trust builds on both sides.', hi: 'उस व्यक्ति को जल्दी परिवार से मिलवाएँ, ताकि दोनों तरफ़ भरोसा बने।', bn: 'মানুষটিকে আগেভাগে পরিবারের সঙ্গে আলাপ করান, যাতে দুদিকেই ভরসা তৈরি হয়।' },
  whyNow: { en: 'Use this time to build skills and savings; the next cycle rewards what you prepare now.', hi: 'इस समय में हुनर और बचत बढ़ाएँ; अगला चक्र अभी की तैयारी का फल देता है।', bn: 'এই সময়টায় দক্ষতা আর সঞ্চয় বাড়ান; পরের চক্র এখনকার প্রস্তুতির ফল দেয়।' },
};

/** Follow-ups: an item the thread hasn't covered yet. */
export const NEXT_ITEM: Table = {
  en: 'Another strong option is {item}, because {why}.',
  hi: 'एक और अच्छा विकल्प है {item}, क्योंकि {why}।',
  bn: 'আরেকটা ভালো দিক হলো {item}, কারণ {why}।',
};

/** Closing line when a follow-up has little new left to say. */
export const ASK_MORE: Table = {
  en: 'If you like, ask me about one of these in more detail, or about the timing.',
  hi: 'चाहें तो इनमें से किसी एक के बारे में विस्तार से, या समय के बारे में पूछिए।',
  bn: 'চাইলে এগুলোর কোনো একটা নিয়ে বিস্তারিত, বা সময় নিয়ে জিজ্ঞেস করুন।',
};

/** A later follow-up on the same ask, once FOLLOW_LEAD was used: name the next item to try. */
export const FOLLOW_LEAD_NEXT: Table = {
  en: 'Of everything so far, {item} is the next one to try.',
  hi: 'अब तक की बातों में, अगला आज़माने लायक विकल्प है: {item}।',
  bn: 'এ পর্যন্ত যা বললাম, তার মধ্যে এরপর চেষ্টা করার মতো: {item}।',
};
