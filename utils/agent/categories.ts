/**
 * The 46 question categories of ml/astro-kb/rules.md §5, recognised from the
 * question, the previous turn and the thread's facts. intent.ts calls
 * `categorize` last, after topic / kind / subject / safety; plan.ts routes on
 * the result. Pure, en / hi / bn and the Latin-script Hinglish / Banglish
 * people type.
 *
 * `category` is what the message is (its form: a follow-up, a correction, a
 * yes/no, another person …); `resolved` is the content category the answer
 * follows (for "Which domain though?" after a job question: career_field).
 * For plain questions both are the same.
 */
import type { IntentTopic, AnswerKind, Ask, Relation } from './intent';
import type { ThreadFacts } from './thread-facts';
import { isPureGreeting, westernDigits } from '../reply-guards';

export const CATEGORIES = [
  'career_field', 'job_change_timing', 'promotion', 'business_vs_job', 'government_job', 'foreign_settlement', 'money_wealth',
  'debt_loans', 'property_vehicle', 'marriage_timing', 'love_vs_arranged', 'partner_traits_meeting', 'relationship_problems',
  'divorce_separation', 'compatibility_other_person', 'children_timing', 'family_parents_siblings', 'education_field',
  'exams_competitive', 'health_wellbeing', 'mental_health_distress', 'crisis_self_harm', 'legal_court', 'spirituality_purpose',
  'personality', 'why_now_current_phase', 'chart_technical', 'remedies', 'lucky_factors', 'muhurat', 'general_luck',
  'other_profile', 'minor', 'elderly', 'no_birth_time', 'past_event_verification', 'yes_no', 'exact_date_or_name',
  'death_lifespan', 'baby_sex', 'off_topic', 'greeting', 'abusive_or_very_short', 'follow_up_clarification',
  'contradictory_follow_up', 'sensitive_identity',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * What a follow-up asks of the previous answer:
 *  - specific  "be more specific", "thoda specific" → roles / concrete next steps
 *  - why       "why that period?", "यही समय क्यों?" → the reasoning behind it
 *  - whatNow   "what should I do till then?", "এখন কী করব?" → practical steps
 *  - exactly   "when exactly?", "ঠিক কোন মাসে?" → the peak month
 *  - insist    "just tell me the date", "exact date batao na" → no exact day, peak, Muhurat tab
 *  - more      "anything else?" → the next window / another area
 *  - tooFar    "that's too far", "itna late kyu?" → the nearer / next window
 *  - shouldI   "so should I quit now?" → a leaning and a step
 *  - which     "which domain?", "MS in what?", "IT or finance, pick one" → options
 *  - meaning   "what does sade sati even mean?" → explain the term
 */
export type FollowUp = 'specific' | 'why' | 'whatNow' | 'exactly' | 'insist' | 'more' | 'tooFar' | 'shouldI' | 'which' | 'meaning';

export type CategoryFlags = {
  emergency?: boolean;
  abuse?: boolean;
  gambling?: boolean;
  gem?: boolean;
  /** Feelings in the message ("unemployed for 6 months", "ghar wale pareshan", "I'm 34 and still single"). */
  feelings?: boolean;
  /** Children: trying for long / IVF → doctor. */
  trying?: boolean;
  /** A visa / loan / admission decision → documents decide. */
  documents?: boolean;
  /** "Does he love me?": can't read minds. */
  mindReading?: boolean;
  /** "Which country is lucky for me?" */
  country?: boolean;
  /** Government / public-sector words. */
  govt?: boolean;
  /** A specific exam (NEET, UPSC, CA …) or "pass / clear / crack". */
  exam?: boolean;
  /** "Is a partnership a good idea?" */
  partnership?: boolean;
  /** "Will my parents accept…?" */
  parentsAccept?: boolean;
  /** Money owed to the user. */
  owed?: boolean;
  /** Medical: surgery / medicine / diagnosis ("which diseases", "is it thyroid", "stop my BP medicine"). */
  diagnosis?: boolean;
  stopTreatment?: boolean;
  surgery?: boolean;
  /** Year-ahead ("how will 2027 be"). */
  year?: number | 'next' | null;
  /** Retirement / grandchildren (elders). */
  retirement?: boolean;
  grandchildren?: boolean;
  /** Thanks / ok after an answer. */
  thanks?: boolean;
  /** "how are you", "who are you". */
  smalltalk?: boolean;
  /** "Kaal sarp" named by the user. */
  kaalSarp?: boolean;
  /** Two named options ("IT or finance", "MBA or MS"). */
  options?: [string, string] | null;
  /** Remarriage ("again after my divorce"). */
  remarriage?: boolean;
  /** The muhurat activity. */
  activity?: 'work' | 'travel' | 'buy' | 'sign' | 'ceremony' | null;
  /** The lucky value asked for. */
  lucky?: 'number' | 'colour' | 'day' | 'any' | null;
  /** Rahu in the 7th, "what does X in my Nth house mean". */
  placement?: { planet: string; house: number } | null;
  technical?: 'manglik' | 'sadeSati' | 'dasha' | 'placement' | 'kaalSarp' | null;
  /** The user asks to choose / decide ("should I separate?"). */
  decision?: boolean;
  /** "Will it be permanent or just for work?" */
  settleOrTrip?: boolean;
};

export type CategoryResult = { category: Category; resolved: Category; followUp: FollowUp | null; flags: CategoryFlags };

export type PrevTurn = {
  question: string;
  category: Category;
  resolved: Category;
  topic: IntentTopic | null;
  safety: string | null;
  kind: AnswerKind;
  /** Resolved categories of all earlier user turns, latest first (this one included). */
  chain: Category[];
};

export type CategoryInput = {
  question: string;
  topic: IntentTopic | null;
  inherited: boolean;
  kind: AnswerKind;
  ask: Ask | null;
  timing: boolean;
  past: boolean;
  exactDate: boolean;
  subject: { kind: 'self' } | { kind: 'other'; relation: Relation };
  safety: string | null;
  clarifies: boolean;
  /** Facts this message states ("I'm already married"). */
  stated: Partial<ThreadFacts>;
  prev: PrevTurn | null;
  facts: ThreadFacts;
};

const nfc = (s: string) => s.normalize('NFC').toLowerCase().replace(/[’`]/g, "'");
const rx = (parts: string[]) => new RegExp(parts.join('|').normalize('NFC'), 'i');

// ─── Lexicons ────────────────────────────────────────────────────────────────

export const EMERGENCY = rx([
  '\\bchest pain', '\\bpain in (?:my|the) chest', "\\bcan'?t breathe\\b", '\\b(?:difficulty|trouble|hard) breathing\\b', '\\bshort(?:ness)? of breath\\b',
  '\\bunconscious\\b', '\\bfainted\\b', '\\bheavy bleeding\\b', '\\bbleeding (?:a lot|heavily)\\b', '\\bstroke\\b', '\\bheart attack\\b', '\\bseizure\\b',
  '\\bpoison', '\\bsevere (?:pain|bleeding|burn)', '\\bchest me dard\\b', '\\bsaans (?:nahi|nahin) (?:aa|le)',
  'सीने में दर्द', 'छाती में दर्द', 'सांस नहीं', 'साँस नहीं', 'बेहोश', 'दिल का दौरा', 'बहुत खून',
  'বুকে ব্যথা', 'বুকে ব্যাথা', 'শ্বাস নিতে কষ্ট', 'নিঃশ্বাস নিতে পারছি না', 'অজ্ঞান', 'হার্ট অ্যাটাক', 'অনেক রক্ত',
]);

export const ABUSE = rx([
  '\\b(?:hits|beats|slaps|hurts|kicks|abuses|chokes|threatens) me\\b', '\\bhit me\\b', '\\bdomestic violence\\b', '\\bphysically abus',
  '\\bmaarta hai\\b', '\\bmarta hai\\b', '\\bpeet(?:ta|ti) hai\\b', '\\bmare\\b.*\\bamake\\b', '\\bgaye haat tole\\b',
  'मारता है', 'मारती है', 'पीटता है', 'हाथ उठाता', 'घरेलू हिंसा', 'মারধর', 'গায়ে হাত তোলে', 'আমাকে মারে', 'মারে আমাকে',
]);

const LOTTERY = rx(['\\blotter(?:y|ies)\\b', '\\bjackpot\\b', '\\bbetting\\b', '\\bgambl', '\\bsatta\\b', '\\bcasino\\b', 'लॉटरी', 'सट्टा', 'লটারি', 'জুয়া', 'জুয়া']);
const MARKET = rx(['\\bshare market\\b', '\\bstock market\\b', '\\bstocks?\\b', '\\bcrypto', '\\bbitcoin\\b', '\\bsensex\\b', '\\bnifty\\b', 'शेयर बाज़ार', 'शेयर बाजार', 'শেয়ার বাজার', 'শেয়ার বাজার']);

const IDENTITY = rx([
  '\\bcaste\\b', '\\bjaa?ti?\\b', '\\bjaat(?:er)?\\b', '\\bjat(?:er|e)\\b', '\\bcommunity\\b', '\\bfair(?:-skinned| skinned)?\\b(?! (?:chance|deal|price))', '\\bfair complexion\\b',
  '\\bcomplexion\\b', '\\bskin colou?r\\b', '\\bgori\\b', '\\bgora\\b', '\\bforsha\\b', '\\bfarsa\\b', '\\bgay\\b', '\\blesbian\\b', '\\bbisexual\\b', '\\bsexual(?:ity| orientation)\\b',
  '\\bsame religion\\b', '\\binter-?caste\\b', '\\binter-?faith\\b', '\\bdisabilit',
  'जाति', 'जात में', 'गोरी', 'गोरा', 'रंग गोरा', 'धर्म की', 'समलैंगिक', 'জাত', 'জাতের', 'ফর্সা', 'গায়ের রং', 'গায়ের রং', 'সমকামী',
]);

const THANKS = rx([
  '^\\s*(?:thanks?(?: you)?(?: so much| a lot| very much)?|thank u|thx|ty|ok(?:ay)?|okk+|got it|great|cool|nice|alright|fine|hmm+|done)\\s*[!.]*\\s*$',
  '^\\s*(?:dhanyavaa?d|shukriya|thank you ji|accha|achha|thik hai|theek hai|dhonnobad|achha thik ache|thik ache)\\s*[!.]*\\s*$',
  '^\\s*(?:धन्यवाद|शुक्रिया|ठीक है|अच्छा)\\s*[!।.]*\\s*$', '^\\s*(?:ধন্যবাদ|আচ্ছা|ঠিক আছে)\\s*[!।.]*\\s*$',
]);
const SMALLTALK = rx([
  '^\\s*(?:how are you|how r u|kemon acho|kemon achen|kaise ho|kaise hain|aap kaise hain|who are you|what are you|are you (?:a )?real)\\b',
  '^\\s*(?:आप कैसे हैं|कैसे हो|तुम कौन हो|আপনি কেমন আছেন|কেমন আছ|কেমন আছেন|তুমি কে)',
]);
const ABUSIVE = rx([
  '\\buseless\\b', '\\bfraud\\b', '\\bfake\\b', '\\bscam\\b', '\\bnonsense\\b', '\\brubbish\\b', '\\bstupid\\b', '\\bwaste\\b', '\\bliar\\b', '\\bwrong (?:again|answer)\\b',
  '\\bbakwas\\b', '\\bbakwaas\\b', '\\bkuch bhi bol', '\\bjhooth', '\\bbekar\\b', '\\bfaltu\\b', '\\bbhul bol', '\\bvul bol', '\\bmiththe\\b',
  'बकवास', 'बेकार', 'झूठ', 'फालतू', 'फ़ालतू', 'ফালতু', 'বাজে কথা', 'ভুল বলছ', 'মিথ্যে',
]);
const VERY_SHORT = /^\s*[?？!.…]+\s*$/;

const OFF_TOPIC = rx([
  '\\b(?:python|javascript|java|c\\+\\+|sql|html|code|coding|script|program|function) (?:to|for|that)\\b', '\\bwrite (?:me )?(?:a|an) (?:python|code|script|program|essay|poem|letter|email)\\b',
  '\\bcapital of\\b', '\\bweather\\b', '\\bforecast for\\b', '\\bnews\\b', '\\brecipe\\b', '\\bhow to (?:cook|make) \\w+', '\\bcook(?:ing)?\\b',
  '\\bwho will win\\b', '\\bipl\\b', '\\bworld cup\\b', '\\bmatch (?:today|tomorrow|result)\\b', '\\belection\\b', '\\btranslate\\b', '\\bjoke\\b',
  '\\bhomework\\b', '\\bsolve\\b', '\\bmausam\\b', '\\bkhabar\\b', '\\bkhobor\\b', '\\branna\\b', '\\bbiryani\\b', '\\bkaun jeetega\\b', '\\bke jitbe\\b',
  '\\bupar jayega\\b', '\\bneeche jayega\\b',
  'मौसम', 'खबर', 'ख़बर', 'समाचार', 'रेसिपी', 'कौन जीतेगा', 'আবহাওয়া', 'আবহাওয়া', 'খবর', 'রান্না', 'রেসিপি', 'কে জিতবে',
]);

const MUHURAT = rx([
  '\\bmuh[uo]o?rt', '\\bmuhurat', '\\bauspicious (?:date|day|time|muhurat)', '\\bgood (?:date|day) (?:\\w+ ){0,4}(?:to|for) (?:sign|start|buy|join|move|travel|open|launch|register|shift|begin|book)',
  '\\b(?:date|day) (?:\\w+ ){0,3}to (?:sign|start my|buy|join|move in|open|launch|register)\\b', '\\bshubh (?:din|muhurat|samay|tithi|mahurat)', '\\bshubho (?:din|muhurto|somoy)',
  '\\bgriha ?pravesh', '\\bgruha ?pravesh', '\\bkon din (?:bhalo|valo)\\b', '\\bkaunsa din (?:accha|achha|shubh)\\b',
  'शुभ (?:दिन|मुहूर्त|मुहुर्त|समय|तिथि)', 'मुहूर्त', 'गृह प्रवेश', 'गृहप्रवेश', 'शुभ मुहूर्त',
  'শুভ (?:দিন|মুহূর্ত|সময়|সময়|তিথি)', 'মুহূর্ত', 'গৃহপ্রবেশ', 'গৃহ প্রবেশ', 'কোন দিন ভালো',
]);
const ACT_SIGN = rx(['\\bsign', '\\bagreement', '\\bcontract', '\\bregist', '\\bdeal\\b', 'हस्ताक्षर', 'एग्रीमेंट', 'अनुबंध', 'रजिस्ट्री', 'চুক্তি', 'সই', 'এগ্রিমেন্ট', 'রেজিস্ট্রি']);
const ACT_BUY = rx(['\\bbuy', '\\bpurchase', '\\bcar\\b', '\\bgaa?di\\b', '\\bgari\\b', '\\bkin(?:bo|te)\\b', '\\bkharid', 'खरीद', 'ख़रीद', 'गाड़ी', 'গাড়ি', 'গাড়ি', 'কিনব', 'কেনা', 'কিনতে', 'লেনা', 'लेने']);
const ACT_TRAVEL = rx(['\\btravel', '\\btrip\\b', '\\bjourney\\b', '\\byatra\\b', 'यात्रा', 'যাত্রা', 'ভ্রমণ']);
const ACT_WORK = rx(['\\bstart', '\\bjoin', '\\bbegin', '\\bopen(?:ing)?\\b', '\\blaunch', '\\bnew (?:job|work|business|shop)', 'शुरू', 'नया काम', 'শুরু', 'নতুন কাজ']);
const ACT_CEREMONY = rx(['\\bgriha ?pravesh', '\\bgruha ?pravesh', '\\bhouse ?warming\\b', '\\bwedding (?:date|muhurat)', '\\bnaming ceremony\\b', '\\bmundan\\b', 'गृह प्रवेश', 'गृहप्रवेश', 'नामकरण', 'शादी का मुहूर्त', 'গৃহপ্রবেশ', 'গৃহ প্রবেশ', 'অন্নপ্রাশন', 'বিয়ের দিন']);

const LUCKY = rx([
  '\\blucky (?:number|colou?r|day|stone|gem)', '\\bcolou?r (?:should|to) (?:i )?wear\\b', '\\bwhich colou?r\\b', '\\bkaunsa rang\\b', '\\bkon rong\\b', '\\bkonsa rang\\b', '\\bshubh (?:ank|rang)\\b',
  'लकी नंबर', 'लकी कलर', 'शुभ अंक', 'शुभ रंग', 'कौन सा रंग', 'কোন রঙ', 'লাকি নম্বর', 'লাকি কালার', 'শুভ সংখ্যা', 'শুভ রং', 'শুভ রঙ',
]);

const GEM = rx([
  '\\bgem(?:stone)?s?\\b', '\\bsapphire\\b', '\\bruby\\b', '\\bemerald\\b', '\\bpearl\\b', '\\bcoral\\b', '\\bdiamond\\b', '\\bhessonite\\b', '\\bcat\'?s eye\\b',
  '\\bneelam\\b', '\\bpukhraj\\b', '\\bmanik\\b', '\\bpanna\\b', '\\bmoonga\\b', '\\bmoti\\b', '\\bgomed\\b', '\\bratna\\b', '\\bpathor\\b', '\\bstone\\b',
  'नीलम', 'पुखराज', 'माणिक', 'पन्ना', 'मूंगा', 'मोती', 'गोमेद', 'रत्न', 'नीला', 'নীলা', 'পোখরাজ', 'চুনি', 'পান্না', 'প্রবাল', 'মুক্তো', 'গোমেদ', 'রত্ন', 'পাথর',
]);
const REMEDY = rx([
  '\\bremed(?:y|ies)\\b', '\\bupa+y\\b', '\\bupaay\\b', '\\btotka\\b', '\\bprotikar\\b', '\\bmantra (?:for|to)\\b', '\\brudraksh', '\\byantra\\b', '\\bpuja (?:for|to)\\b', '\\bwhat can i do (?:for|about) (?:saturn|shani|rahu|ketu|mars)',
  'उपाय', 'टोटका', 'प्रतिकार', 'প্রতিকার', 'টোটকা', 'উপায়', 'উপায়',
]);
const NON_RITUAL = rx(["\\bnot religious\\b", '\\bisn\'?t a ritual\\b', '\\bwithout (?:a )?ritual', '\\batheist\\b', 'नास्तिक', 'नास्तिक', 'নাস্তিক']);

const COMPAT = rx([
  '\\bcompatib', '\\bkundl[ia] (?:match|milan|mil(?:ti|egi|ega)?)', '\\bmatch(?:ing)? (?:our|my) (?:kundli|chart|horoscope)', '\\bgun (?:milan|milte|mile|milega)', '\\bgunas?\\b', '\\bguna\\b',
  '\\bnadi dosh', '\\bbhakoot', '\\bright (?:person|one|partner) for me\\b', '\\bis (?:she|he) the one\\b', '\\bscore is (?:only )?\\d', '\\/36\\b', '\\bout of 36\\b',
  '\\bkundli match', '\\bkushti mil', 'कुंडली मिल', 'गुण मिल', 'गुण मिलते', 'कितने गुण', 'नाड़ी दोष', 'कुंडली मिलान', 'কুষ্ঠি (?:কি )?মিল', 'কুষ্ঠি মিলবে', 'কত গুণ', 'গুণ মেলে', 'নাড়ি দোষ', 'নাড়ি দোষ', 'nadi dosh',
]);

const DIVORCE = rx([
  '\\bdivorc', '\\btalaa?q\\b', '\\btalak\\b', '\\bseparat(?:e|ion|ed) (?:from|with)?\\b', '\\bleave my (?:husband|wife)\\b', '\\balag ho\\b', '\\balada hoye\\b',
  'तलाक', 'अलग हो जा', 'अलग होना', 'ডিভোর্স', 'বিবাহবিচ্ছেদ', 'আলাদা হয়ে', 'আলাদা হয়ে', 'আলাদা হব',
]);

const DISTRESS = rx([
  '\\banxious\\b', '\\banxiety\\b', '\\bdepress(?:ed|ion)\\b', '\\blonely\\b', '\\bloneliness\\b', '\\bfeel (?:so )?(?:sad|empty|hopeless|low|lost|alone)\\b', '\\bpanic\\b',
  '\\bstress(?:ed)?\\b(?!.*\\b(?:health|tired|body)\\b)', '\\btension\\b(?!.*\\b(?:home|ghar|family)\\b)', '\\budaa?s\\b', '\\bakela\\b', '\\bakeli\\b', '\\bmon (?:bhalo nei|kharap)\\b', '\\bkhub tension\\b', '\\bbahut stress\\b',
  'उदास', 'अकेला', 'अकेली', 'अकेलापन', 'तनाव में', 'घबराहट', 'चिंता', 'मन बहुत', 'মন খারাপ', 'মন খুব খারাপ', 'মন ভালো নেই', 'একা লাগে', 'একাকী', 'দুশ্চিন্তা', 'উদ্বেগ', 'হতাশ',
]);

const FAMILY_WHO = rx([
  '\\bfather\\b', '\\bdad\\b', '\\bpapa\\b', '\\bmother\\b', '\\bmom\\b', '\\bmum\\b', '\\bmummy\\b', '\\bparents\\b', '\\bbrother\\b', '\\bsister\\b', '\\bsiblings?\\b',
  '\\bin-?laws?\\b', '\\bsaas\\b', '\\bsasur\\b', '\\bsasural\\b', '\\bshoshur\\b', '\\bshashuri\\b', '\\bbhai\\b', '\\bbhaiya\\b', '\\bdidi\\b', '\\bbehen\\b', '\\bbaba\\b', '\\bmaa\\b',
  '\\bhome\\b', '\\bfamily\\b', '\\bghar\\b', '\\bbari(?:te|r)\\b',
  'पिता', 'पापा', 'माँ', 'मां', 'मम्मी', 'माता-पिता', 'भाई', 'बहन', 'सास', 'ससुर', 'ससुराल', 'घर में', 'परिवार',
  'বাবা', 'মা', 'মায়ের', 'ভাই', 'ভাইয়ের', 'ভাইয়ের', 'বোন', 'দাদা', 'দিদি', 'শ্বশুর', 'শাশুড়ি', 'শ্বশুরবাড়ি', 'বাড়িতে', 'বাড়িতে', 'পরিবার',
]);
const FAMILY_DYN = rx([
  '\\brelationship with\\b', '\\bget along\\b', '\\bsupport me\\b', '\\btension\\b', '\\bfight', '\\bquarrel', '\\bconflict', '\\bbond\\b', '\\bhow (?:is|will) my relationship\\b',
  '\\bbanegi\\b', '\\bbanti\\b', '\\bjhagda\\b', '\\bjhagra\\b', '\\bkalah\\b', '\\boshanti\\b', '\\bsomporko\\b', '\\bsambandh\\b', '\\brishta kaisa\\b', '\\bkemon somporko\\b',
  'रिश्ता', 'रिश्ते', 'तनाव', 'झगड़', 'झगड', 'कैसी बनेगी', 'कैसे बनेगी', 'संबंध', 'সম্পর্ক', 'অশান্তি', 'ঝগড়া', 'ঝগড়া', 'মনোমালিন্য',
]);

const SPIRIT = rx([
  '\\blife purpose\\b', '\\bpurpose (?:of|in) (?:my )?life\\b', '\\bmy purpose\\b', '\\bmeaning of (?:my )?life\\b', '\\bspiritual', '\\bsadh(?:a)?na\\b', '\\bmeditat', '\\bbhakti\\b',
  '\\bmoksh', '\\bdharma\\b', '\\binner peace\\b', '\\bpeace of mind\\b', '\\benlighten', '\\bguru\\b', '\\buddeshya\\b', '\\buddesho\\b', '\\badhyatmik\\b',
  'उद्देश्य', 'आध्यात्मिक', 'साधना', 'मोक्ष', 'ध्यान', 'उद्देश', 'উদ্দেশ্য', 'আধ্যাত্মিক', 'সাধনা', 'মোক্ষ', 'ধ্যান',
]);

const PERSONALITY = rx([
  '\\bstrengths?\\b', '\\bweakness(?:es)?\\b', '\\bpersonality\\b', '\\bwhat kind of (?:a )?person\\b', '\\bwho am i\\b', '\\bwhat am i like\\b', '\\bmy nature\\b',
  '\\bnature kaisa\\b', '\\bswabhaa?v\\b', '\\bshobhab\\b', '\\bswabhab\\b', '\\bangry so (?:quickly|easily|fast)\\b', '\\bget angry\\b', '\\bso emotional\\b', '\\btemper\\b',
  'ताकत', 'ताक़त', 'कमज़ोरी', 'कमजोरी', 'स्वभाव', 'व्यक्तित्व', 'गुस्सा', 'শক্তি আর দুর্বলতা', 'দুর্বলতা', 'স্বভাব', 'ব্যক্তিত্ব', 'রাগ',
]);

const WHY_NOW = rx([
  '\\b(?:everything|all|nothing) (?:is )?(?:going )?(?:wrong|works? out|bad)\\b', '\\bso many (?:obstacles|problems)\\b', '\\bbad (?:time|phase|patch|period|luck)\\b',
  '\\bmaking (?:\\w+ )?(?:so )?hard\\b', '\\bwhy is (?:life|everything) so hard\\b', '\\bmy dasha (?:that|is)\\b', '\\bshani ka (?:asar|prabhav)\\b', '\\bshonir prabhab\\b',
  '\\bsab (?:kuch )?(?:galat|bura|bigad)', '\\bkaam bigad', '\\bbura (?:waqt|samay|time)\\b', '\\bkharap somoy\\b', '\\bkichui thik\\b', '\\bthik hocche na\\b',
  'बुरा समय', 'बुरा वक्त', 'सब बुरा', 'सब कुछ बुरा', 'सब गलत', 'खराब समय', 'খারাপ সময়', 'খারাপ সময়', 'সব কিছু (?:এত )?খারাপ', 'সবকিছু খারাপ', 'এত খারাপ যাচ্ছে', 'কিছুই ঠিক',
]);

const TECH_MANGLIK = rx(['\\bmangli?k\\b', '\\bmangal dosh', '\\bkuja dosh', 'मांगलिक', 'मंगल दोष', 'মাঙ্গলিক', 'মঙ্গলিক', 'মঙ্গল দোষ']);
const TECH_SADE = rx(['\\bsade ?sati\\b', '\\bsadhe ?sati\\b', '\\bsaade ?saati\\b', '\\bdhaiy[ay]a\\b', 'साढ़े ?साती', 'साढ़ेसाती', 'साढ़े साती', 'সাড়ে সাতি', 'সাড়ে সাতি', 'সাড়েসাতি']);
const TECH_DASHA = rx(['\\b(?:which|what|kiski|kon|konsi) (?:maha ?)?dasha\\b', '\\bmaha ?dasha\\b', '\\bdasha (?:chal|cholche)', '\\bcurrent dasha\\b', 'महादशा', 'दशा चल', 'মহাদশা', 'দশা চলছে']);
const TECH_KAAL = rx(['\\bkaa?l ?sarp', '\\bkalsarp', 'काल ?सर्प', 'কাল ?সর্প']);
const PLACEMENT = /\b(sun|moon|mars|mercury|jupiter|venus|saturn|rahu|ketu) in (?:my |the )?(\d{1,2})(?:st|nd|rd|th) house\b/i;

const PAST_EXTRA = rx([
  '\\bso far\\b', '\\bpichle \\d+ saal\\b', '\\bpichhle\\b', '\\bago\\b(?=.*\\b(?:was|did)\\b)', '\\bagey kobe\\b', '\\bchilo\\b', '\\bchhilo\\b',
  'था\\?', 'थी\\?', 'चल रहा था', 'ছিল\\?', 'ছিলো', 'ছিল কি',
]);

const NO_TIME = rx([
  "\\bdon'?t know (?:my )?(?:exact )?birth ?time\\b", '\\bbirth ?time (?:nahi|nahin|na) (?:pata|jani)\\b', '\\bonly know my birth (?:date|day)\\b', '\\bwithout (?:my )?birth ?time\\b',
  '\\bjanmo? ?somoy jani na\\b', '\\bbirth time jani na\\b', 'जन्म का समय नहीं', 'जन्म समय नहीं', 'जन्म का समय पता नहीं', 'জন্মসময় জানি না', 'জন্মের সময় জানি না',
]);

const YESNO_SPECIFIC = rx([
  '\\b(?:the|this|that) visa\\b', '\\bvisa (?:milega|hobe|pabo|approve|approved)', '\\bget (?:the|my) visa\\b', '\\bthe job at\\b', '\\bthis job\\b', '\\bye naukri\\b', '\\bchakri ?ta\\b',
  '\\byes or no\\b', '\\bhaan ya na\\b', '\\bhaan ba na\\b', '\\bha ba na\\b', '\\bdoes (?:he|she) (?:love|like|miss) me\\b', '\\bwill (?:he|she) say yes\\b',
  'वीज़ा मिलेगा', 'वीजा मिलेगा', 'हाँ या ना', 'हां या ना', 'ভিসা (?:কি )?পাব', 'হ্যাঁ বা না',
]);
const MIND_READING = rx(['\\bdoes (?:he|she|my \\w+) (?:love|like|miss|think about) me\\b', '\\bwhat (?:is|does) (?:he|she) (?:think|feel)', '\\bkya (?:wo|woh) mujhse pyar\\b', 'क्या वो मुझसे प्यार', 'ও কি আমাকে ভালোবাসে']);

const GOVT = rx([
  '\\bsarkari\\b', '\\bgovt\\b', '\\bgovernment\\b', '\\bpublic sector\\b', '\\bpsu\\b', '\\bcivil services?\\b', '\\bias\\b', '\\bips\\b', '\\bupsc\\b', '\\bssc\\b', '\\bwbcs\\b',
  '\\bbank po\\b', '\\brailway\\b', '\\bpsc\\b', 'सरकारी', 'रेलवे', 'সরকারি', 'রেলওয়ে', 'রেলের',
]);
const EXAM = rx([
  '\\bexams?\\b', '\\bneet\\b', '\\bjee\\b', '\\bcat\\b', '\\bgate\\b', '\\bupsc\\b', '\\bssc\\b', '\\bca (?:finals?|inter|exam)', '\\bprelims?\\b', '\\bmains\\b', '\\bboard (?:exam|marks)',
  '\\bmarks\\b', '\\bclear (?:the|my|it)\\b', '\\bcrack\\b', '\\bpass (?:my|the)\\b', '\\bnikal\\b', '\\bpariksha\\b', '\\bporikkha\\b',
  'परीक्षा', 'एग्जाम', 'एग्ज़ाम', 'क्लियर', 'पास हो', 'निकाल', 'पরীক্ষা', 'পরীক্ষা', 'পাশ করব', 'ক্লিয়ার', 'নিট',
]);
const STUDY_CHOICE = rx([
  '\\bstream\\b', '\\bsubjects?\\b', '\\bmba\\b', '\\bms\\b', '\\bmasters\\b', '\\bphd\\b', '\\badmission\\b', '\\bafter (?:10th|12th)\\b', '\\bscience\\b', '\\bcommerce\\b', '\\barts\\b',
  '\\bmedicine\\b', '\\bmedical\\b', '\\bengineering\\b', '\\bhigher stud', '\\bwhich (?:course|degree|field) (?:should i )?(?:study|take|choose)',
  'स्ट्रीम', 'सब्जेक्ट', 'विषय', 'एडमिशन', 'दाखिला', 'বিষয়', 'বিষয়', 'ভর্তি', 'উচ্চশিক্ষা', 'স্ট্রিম',
]);
const DEBT = rx([
  '\\bdebts?\\b', '\\bloans?\\b', '\\bemi\\b', '\\bkarz', '\\bqarz', '\\bowes? me\\b', '\\bborrow', '\\bdhar\\b', '\\bdhaar\\b', '\\bferot\\b', '\\bfreed? of (?:my )?(?:debt|loan)',
  'कर्ज', 'क़र्ज़', 'कर्ज़', 'ऋण', 'लोन', 'उधार', 'ঋণ', 'লোন', 'ধার', 'দেনা',
]);
const LOVE_ARR = rx([
  '\\blove (?:marriage|or arranged)\\b', '\\barranged (?:marriage|one)\\b', '\\blove or arrange', '\\barrange(?:d)? marriage', '\\bparents (?:accept|agree)', '\\bghar wale (?:manenge|maanenge|raazi)',
  '\\bbarir lok .*(?:raji|mene nebe|manbe)', '\\bfamily (?:accept|agree)', 'लव मैरिज', 'अरेंज', 'घरवाले मानेंगे', 'घर वाले मानेंगे', 'প্রেম করে বিয়ে', 'প্রেম করে বিয়ে', 'দেখাশোনা করে', 'মেনে নেবে', 'রাজি হবে',
]);
const PARENTS_ACCEPT = rx(['\\bparents (?:accept|agree)', '\\bfamily (?:accept|agree)', '\\bghar wale\\b.*\\b(?:manenge|maanenge)', '\\bmanenge\\b', '\\bmaanenge\\b', '\\bmene nebe\\b', '\\braji (?:hobe|hoben)\\b', 'मानेंगे', 'মেনে নেবে', 'রাজি হবে']);
const REL_PROBLEM = rx([
  '\\bmy ex\\b', '\\bex (?:come|ki|ke|kobe)', '\\bbreak ?up\\b', '\\bwe fight\\b', '\\bfight(?:ing)? (?:a lot|every|almost)', '\\bpatch up\\b', '\\bget back together\\b', '\\bcome back\\b',
  '\\brelationships? (?:keep|keeps) failing\\b', '\\bwapas aa', '\\bwapas aayeg', '\\bfire asbe\\b', '\\bjhamela\\b', '\\bjhagda\\b', '\\bmitbe\\b',
  'वापस आएग', 'वापस आएगा', 'वापस आएगी', 'झगड़े', 'झगड़', 'ब्रेकअप', 'ফিরে আসবে', 'ঝামেলা', 'অশান্তি কেন', 'ব্রেকআপ', 'সম্পর্কে এত',
]);
const PARTNER_DESC = rx([
  '\\bwhat will (?:my|he|she|they) (?:\\w+ ){0,2}be like\\b', '\\bwhat (?:kind|type) of (?:partner|spouse|wife|husband|person will i marry)', '\\bnature\\b.*\\b(?:wife|husband|spouse|partner|he|she|bor|bou)\\b',
  '\\b(?:wife|husband|spouse|partner)(?:\'s)? (?:nature|personality)\\b', '\\bdescribe my (?:future )?(?:wife|husband|spouse|partner)', '\\bwhere will i meet\\b', '\\bkahan milega\\b', '\\bkahan milegi\\b',
  '\\bkothay dekha\\b', '\\bwill (?:my|he|she) (?:husband|wife|partner)? ?be caring\\b', '\\bkaisa hoga\\b', '\\bkaisi hogi\\b', '\\bkemon hobe\\b',
  'कैसा होगा', 'कैसी होगी', 'कहाँ मिलूंगी', 'कहाँ मिलूंगा', 'कहाँ मिलेगा', 'কেমন মানুষ', 'কেমন হবে', 'কোথায় দেখা',
]);
const SETTLE_OR_TRIP = rx(['\\bpermanent\\b', '\\bjust for work\\b', '\\bsettle (?:there|permanently)\\b', '\\bstay (?:there|abroad) for good\\b', 'स्थायी', 'हमेशा के लिए', 'স্থায়ী', 'স্থায়ী', 'চিরকালের']);
const COUNTRY = rx(['\\bwhich country\\b', '\\bwhat country\\b', '\\b(?:us|usa|uk|canada|australia|germany) or (?:us|usa|uk|canada|australia|germany)\\b', 'कौन सा देश', 'কোন দেশ']);
const VISA_LOAN = rx(['\\bvisa\\b', '\\bpr\\b', '\\bgreen card\\b', '\\bloan (?:pass|approv|sanction)', '\\b(?:home|car|education) loan\\b.*\\bapprov', '\\badmission\\b', '\\bloan pass\\b', 'वीज़ा', 'वीजा', 'लोन पास', 'ভিসা', 'লোন পাস', 'লোন হবে']);
const PARTNERSHIP = rx(['\\bpartnership\\b', '\\bbusiness partner', '\\bwith my friend\\b.*\\bbusiness\\b', 'साझेदारी', 'पार्टनरशिप', 'অংশীদারি', 'পার্টনারশিপ']);
const OWED = rx(['\\bowes? me\\b', '\\bget (?:it|my money) back\\b', '\\bdhar deoa\\b', '\\bdhaar deoa\\b', '\\bferot pabo\\b', '\\bpaise wapas\\b', 'उधार दिया', 'पैसे वापस', 'ধার দেওয়া', 'ফেরত পাব']);
const DIAGNOSIS = rx(['\\bwhich (?:disease|illness)', '\\bwhat (?:disease|illness)', '\\bis it (?:thyroid|cancer|diabetes|serious|bp|sugar)\\b', '\\bwill i get (?:cancer|diabetes)', '\\bkaunsi bimari\\b', '\\bkya bimari\\b', '\\bsugar ta ki\\b',
  'कौन सी बीमारी', 'कौनसी बीमारी', 'कौन-सी बीमारी', 'कौन सा रोग', 'কোন রোগ', 'কী রোগ', 'সুগার কি']);
const STOP_TREATMENT = rx(['\\bstop (?:my |taking )?(?:\\w+ )?(?:medicine|medication|tablets?|treatment|insulin)', '\\binstead of (?:medicine|treatment)', '\\bdawai (?:band|chhod)', 'दवा बंद', 'दवाई बंद', 'ওষুধ বন্ধ']);
const SURGERY = rx(['\\bsurgery\\b', '\\boperation\\b', '\\bऑपरेशन\\b', 'ऑपरेशन', 'সার্জারি', 'অপারেশন']);
const TRYING = rx(['\\btrying (?:for|to conceive)', '\\bivf\\b', '\\biui\\b', '\\binfertil', "\\bcan'?t conceive", '\\bnot (?:getting|becoming) pregnant\\b', '\\bbachcha (?:kyu|kyon) nahi\\b', 'बच्चा क्यों नहीं', 'संतान क्यों नहीं', 'आईवीएफ', 'আইভিএফ', 'IVF', 'বাচ্চা হচ্ছে না', 'সন্তান হচ্ছে না']);
const FEELINGS = rx([
  '\\bunemployed for\\b', '\\bstill single\\b', '\\bpushing me\\b', '\\bpressur', '\\bworried\\b', '\\bscared\\b', '\\bafraid\\b', '\\bfrustrat', '\\bfeel (?:bad|terrible|awful|stuck)\\b', '\\bfeeling (?:bad|low|stuck)\\b',
  '\\b(?:6|six|\\d+) months\\b.*\\b(?:job|unemploy)', '\\bfailed\\b', '\\bbored\\b', '\\bstuck\\b', '\\bpareshan\\b', '\\btry karte karte\\b', '\\bbose achi\\b', '\\bchap dicche\\b', '\\bbura lag\\b', '\\bvery ill\\b', '\\btight rehta\\b',
  '\\bterrible\\b', '\\bhopeless\\b', 'परेशान', 'चिंता', 'दबाव', 'दुखी', 'বসে আছি', 'চাপ দিচ্ছে', 'চিন্তা', 'কষ্ট', 'খুব খারাপ',
]);
const RETIRE = rx(['\\bretire', '\\bafter retirement\\b', 'रिटायरमेंट', 'सेवानिवृत्ति', 'অবসর']);
const GRANDKIDS = rx(['\\bgrand(?:children|kids|son|daughter|child)\\b', '\\bnaati\\b', '\\bpota\\b', 'पोता', 'नाती', 'নাতি', 'নাতনি']);
const REMARRY = rx(['\\bagain after (?:my|the) divorce\\b', '\\bsecond marriage\\b', '\\bremarr', 'दूसरी शादी', 'দ্বিতীয় বিয়ে', 'দ্বিতীয় বিয়ে']);
const DECISION = rx(['\\bshould i (?:separate|leave|divorce|quit|stay)', '\\bshould we not marry\\b', '\\bshould we (?:still )?marry\\b', '\\balada hoye jabo\\b', 'আলাদা হয়ে যাব', 'আলাদা হয়ে যাব', 'अलग हो जाऊं', 'छोड़ दूं']);
/** Year-ahead questions (Western digits): "how will 2027 be", "2027 সালটা কেমন যাবে", "agla saal kaisa rahega". */
const YEAR_Q = /\b(?:how will|how is|how'?s) (20\d\d)\b|\b(20\d\d) (?:kaisa|kemon|কেমন|सालটা|सालটা|সালটা|साल)|\b(?:next|coming) year\b|\bagla saal\b|\bagle saal\b|\bsamner bochor\b|आने वाला साल|अगला साल|সামনের বছর|আগামী বছর/i;

// Follow-ups (only with a previous question).
const FU_SPECIFIC = rx(['\\bbe (?:more )?specific\\b', '\\bmore specific\\b', '\\bin detail\\b', '\\bspecific(?:ally)? batao\\b', '\\bthoda specific\\b', '\\bektu specific\\b', '\\bdetails?\\b', 'थोड़ा साफ़', 'विस्तार से', 'একটু খুলে', 'বিস্তারিত']);
const FU_WHY = rx(['^\\s*why\\b', '\\bwhy (?:that|this|then|so late|not sooner)\\b', '^\\s*(?:kyu|kyun|kyon|keno)\\b', '\\b(?:itna|etoh?|eto) (?:late|deri)\\b', '\\bwhy approximate\\b', 'यही समय क्यों', 'क्यों\\?$', '^क्यों', 'ওই সময়টাই কেন', 'কেন\\?$', '^কেন', 'এত দেরি']);
const FU_WHATNOW = rx(['\\bwhat (?:should|can|do) i do (?:now|till then|until then|meanwhile|before)', '\\bwhat now\\b', '\\btill then\\b', '\\buntil then\\b', '\\babhi kya kar', '\\bekhon ki kor', '\\bki kori tahole\\b', '\\bbefore that\\b',
  'तब तक (?:मुझे )?क्या', 'अभी क्या करूं', 'अभी क्या करूँ', 'এখন (?:তাহলে )?কী করব', 'এখন কি করব']);
const FU_EXACTLY = rx(['^\\s*when exactly\\b', '\\bexactly when\\b', '\\bwhich month\\b', '\\bthik kon mas', 'ठीक ठीक कब', 'ठीक-ठीक कब', 'किस महीने', 'ঠিক কোন মাসে', 'কোন মাসে']);
const FU_INSIST = rx(['\\bjust tell me the date\\b', '\\btell me the (?:exact )?date\\b', "\\bwon'?t hold you\\b", '\\bexact (?:date|tarikh) (?:batao|bolo)', '\\bexact tarikh\\b', '\\btarikh (?:ta )?bolo\\b', 'तारीख बताओ', 'সঠিক তারিখ', 'তারিখটা বলুন']);
const FU_MORE = rx(['^\\s*(?:anything|what) else\\b', '\\bany other\\b', '\\baur kuch\\b', '\\bar kichu\\b', 'और कुछ', 'আর কিছু']);
const FU_TOOFAR = rx(["\\btoo far\\b", "\\bcan'?t wait that long\\b", '\\bso late\\b', '\\bitna late\\b', '\\beto deri\\b', '\\banything sooner\\b', 'बहुत दूर', 'इतनी देर', 'অনেক দেরি', 'এত দেরি']);
const FU_SHOULDI = rx(['\\bso should i\\b', '\\bshould i (?:quit|resign|leave|wait|apply) (?:now|then)\\b', '\\bto (?:kya|ki) (?:abhi )?(?:chhod|chere)', 'तो क्या अभी', 'তাহলে কি এখন']);
const FU_WHICH = rx(['^\\s*which (?:domain|field|line|area|one)\\b', '\\bpick one\\b', '\\bin what\\??\\s*$', '\\bkis field\\b', '\\bkon line\\b', 'किस फील्ड', 'कौन सा फील्ड', 'কোন লাইনে', 'কোন দিকে']);
const FU_MEANING = rx(['\\bwhat does (?:\\w+ ?){1,3} (?:even )?mean\\b', '\\bwhat is (?:sade sati|dasha|manglik)\\b', 'का मतलब क्या', 'মানে কী']);

const CAREER_FIELD = rx([
  '\\b(?:kon|kaun ?sa|kaunsa|konsa|which|what) (?:career|field|domain|line|kaj|kaam|profession)\\b', '\\bkis kaam\\b', '\\bkon kaj', '\\bwhat other (?:domain|field|career|line)',
  '\\bother domain\\b', '\\bnaturally good at\\b', '\\bkind of work\\b', '\\bstay in \\w+ or (?:move|switch) to\\b', 'किस काम', 'कौन सा करियर', 'কোন কাজ', 'কোন পেশা',
]);
const STUDY_SUBJECT = rx(['\\bmedicine\\b', '\\bmbbs\\b', '\\bstream\\b', '\\bsubjects?\\b', '\\bporbo\\b', '\\bpadhu\\b', '\\bpadhai\\b', '\\bscience lu\\b', '\\b(?:mba|ms) (?:or|ya|na)\\b', 'सब्जेक्ट', 'स्ट्रीम', 'পড়ব', 'পড়ব']);
const CONJ_START = /^\s*(?:and|also|what about|how about|aur|ar|ebong|और|आर|আর|এবং)(?=[\s,?]|$)/i;
const NO_TIME_FU = rx(['\\bwhy approximate\\b', '\\bmake it (?:more )?accurate\\b', '\\bexact birth ?time\\b', 'सटीक कैसे', 'আনুমানিক কেন']);
const PAST_MARK = rx(['\\bwas\\b', '\\bwere\\b', '\\bdid\\b', '\\bso far\\b', '\\btha\\b', '\\bthi\\b', '\\bchilo\\b', '\\bchhilo\\b', 'था', 'थी', 'ছিল', 'ছিলো']);
const PAST_YEAR = /\b(?:19\d\d|20[01]\d|202[0-5])\b/;
const TIMING_CATS: Category[] = ['job_change_timing', 'marriage_timing', 'promotion', 'property_vehicle', 'children_timing', 'money_wealth', 'debt_loans',
  'foreign_settlement', 'general_luck', 'health_wellbeing', 'legal_court', 'exams_competitive', 'government_job', 'education_field', 'why_now_current_phase'];

const OPTION_WORDS: [string, RegExp][] = [
  ['IT', /\b(?:it|software|tech|coding|computer)\b|आईटी|আইটি/i], ['finance', /\bfinance\b|\bbanking\b|बैंकिंग|फाइनेंस|ব্যাংকিং/i],
  ['teaching', /\bteach(?:ing)?\b|पढ़ाना|শিক্ষকতা/i], ['corporate', /\bcorporate\b|कॉर्पोरेट/i], ['engineering', /\bengineering\b|इंजीनियरिंग|ইঞ্জিনিয়ারিং|engineering/i],
  ['design', /\bdesign\b|डिज़ाइन|ডিজাইন/i], ['medicine', /\bmedic(?:ine|al)\b|मेडिकल|ডাক্তারি/i], ['government', /\bgovernment\b|\bgovt\b|\bsarkari\b|सरकारी|সরকারি/i],
  ['MBA', /\bmba\b/i], ['MS', /\bms\b/i], ['science', /\bscience\b|साइंस/i], ['commerce', /\bcommerce\b|कॉमर्स/i],
  ['meditation', /\bmeditation\b|ध्यान/i], ['bhakti', /\bbhakti\b|भक्ति/i], ['sales', /\bsales\b|सेल्स/i], ['private', /\bprivate\b|प्राइवेट|বেসরকারি/i],
];

/** Two options the user names ("IT or finance", "engineering porbo na medical"). */
export function namedOptions(q: string): [string, string] | null {
  if (!/\bor\b|\bya\b|\bna\b|\bnaki\b|\bvs\.?\b|\bbetween\b|या|নাকি|না |বা /i.test(q)) return null;
  const found = OPTION_WORDS.filter(([, re]) => re.test(q)).map(([k]) => k);
  return found.length >= 2 ? [found[0], found[1]] : null;
}

function muhuratActivity(q: string): CategoryFlags['activity'] {
  if (ACT_CEREMONY.test(q)) return 'ceremony';
  if (ACT_SIGN.test(q)) return 'sign';
  if (ACT_BUY.test(q)) return 'buy';
  if (ACT_TRAVEL.test(q)) return 'travel';
  if (ACT_WORK.test(q)) return 'work';
  return 'work';
}

function luckyKind(q: string): CategoryFlags['lucky'] {
  if (/number|nambar|nombor|अंक|नंबर|সংখ্যা|নম্বর/i.test(q)) return 'number';
  if (/colou?r|rang|rong|रंग|রঙ|রং/i.test(q)) return 'colour';
  if (/\bday\b|din\b|दिन|দিন/i.test(q)) return 'day';
  return 'any';
}

const TOPIC_CATEGORY: Record<string, Category> = {
  marriage: 'marriage_timing', love: 'marriage_timing', job: 'job_change_timing', promotion: 'promotion', business: 'business_vs_job',
  money: 'money_wealth', property: 'property_vehicle', children: 'children_timing', education: 'education_field', foreign: 'foreign_settlement',
  health: 'health_wellbeing', legal: 'legal_court', general: 'general_luck', chart: 'chart_technical',
};

/** The content category of a life-topic question. */
function topicCategory(q: string, i: CategoryInput, flags: CategoryFlags): Category {
  const t = i.topic;
  if (i.ask === 'businessVsJob') return 'business_vs_job';
  if (i.ask === 'careerField' && (i.kind === 'choice' || i.kind === 'nature' || i.kind === 'advice')) return flags.govt && !flags.options ? 'government_job' : 'career_field';
  if (i.ask === 'partner') return 'partner_traits_meeting';
  if (i.ask === 'studyField') return 'education_field';
  if (i.ask === 'strengths') return 'personality';
  if (i.ask === 'whyNow' && !t) return 'why_now_current_phase';
  switch (t) {
    case 'job': case 'promotion': case 'education':
      if (flags.govt && !flags.exam) return 'government_job';
      if (flags.exam) return flags.govt && /\b(?:govt|government|sarkari)\b|सरकारी|সরকারি/i.test(q) && !/exam|परीक्षा|পরীক্ষা|एग्जाम/i.test(q) ? 'government_job' : 'exams_competitive';
      if (t === 'education') return STUDY_CHOICE.test(q) || i.kind === 'choice' ? 'education_field' : 'education_field';
      return t === 'promotion' ? 'promotion' : 'job_change_timing';
    case 'marriage': case 'love':
      if (LOVE_ARR.test(q)) return 'love_vs_arranged';
      if (REL_PROBLEM.test(q)) return 'relationship_problems';
      if (PARTNER_DESC.test(q)) return 'partner_traits_meeting';
      return 'marriage_timing';
    case 'money': return DEBT.test(q) || flags.owed ? 'debt_loans' : 'money_wealth';
    default: return t ? TOPIC_CATEGORY[t] : 'general_luck';
  }
}

/**
 * The category of a message. `i.topic` etc. come from intent.ts; the
 * previous turn and the thread's facts resolve follow-ups and corrections.
 */
export function categorize(i: CategoryInput): CategoryResult {
  const q = nfc(i.question);
  const flags: CategoryFlags = {};
  const prev = i.prev;
  const done = (category: Category, resolved: Category = category, followUp: FollowUp | null = null): CategoryResult => ({ category, resolved, followUp, flags });

  flags.gem = GEM.test(q);
  flags.feelings = FEELINGS.test(q);
  flags.govt = GOVT.test(q);
  flags.exam = EXAM.test(q);
  flags.options = namedOptions(q);
  flags.documents = VISA_LOAN.test(q);
  flags.partnership = PARTNERSHIP.test(q);
  flags.parentsAccept = PARENTS_ACCEPT.test(q);
  flags.owed = OWED.test(q);
  flags.trying = TRYING.test(q);
  flags.surgery = SURGERY.test(q);
  flags.diagnosis = DIAGNOSIS.test(q);
  flags.stopTreatment = STOP_TREATMENT.test(q);
  flags.retirement = RETIRE.test(q);
  flags.grandchildren = GRANDKIDS.test(q);
  flags.remarriage = REMARRY.test(q);
  flags.decision = DECISION.test(q);
  flags.settleOrTrip = SETTLE_OR_TRIP.test(q);
  flags.country = COUNTRY.test(q);
  const ym = YEAR_Q.exec(westernDigits(q));
  flags.year = ym ? (ym[1] || ym[2] ? Number(ym[1] || ym[2]) : 'next') : null;

  // Safety first.
  if (i.safety === 'crisis') return done('crisis_self_harm');
  if (EMERGENCY.test(q)) { flags.emergency = true; return done('health_wellbeing'); }
  if (ABUSE.test(q)) { flags.abuse = true; return done('relationship_problems'); }
  if (i.safety === 'childSex') return done('baby_sex');
  if (prev?.safety === 'childSex' && (FU_WHY.test(q) || /\bjust for fun\b|\bmoja\b|\bmazak\b|मज़ाक|মজা|keno bolbe na|why not/i.test(q))) return done('baby_sex', 'baby_sex', 'why');
  if (i.safety === 'death') return done('death_lifespan');
  if (IDENTITY.test(q) && !/\bfair (?:chance|time)\b/i.test(q)) return done('sensitive_identity');
  if (i.safety === 'partnerName') return done('exact_date_or_name', 'partner_traits_meeting');

  // Small talk, thanks, frustration.
  if (isPureGreeting(i.question)) return done('greeting');
  if (THANKS.test(q)) { flags.thanks = true; return done('greeting'); }
  if (SMALLTALK.test(q)) { flags.smalltalk = true; return done('greeting'); }
  if (VERY_SHORT.test(q) || (ABUSIVE.test(q) && q.length < 60)) {
    if (prev && FU_TOOFAR.test(q)) return done('abusive_or_very_short', prev.resolved, 'tooFar');
    return done('abusive_or_very_short', prev ? prev.resolved : 'abusive_or_very_short', prev ? 'specific' : null);
  }

  // Markets and lottery are declined as gambling (a money question keeps its category).
  if ((MARKET.test(q) && /\b(?:win|profit|kamai|tips?|which stock|up|down|upar|neeche|tomorrow|kal)\b|ऊपर|नीचे|कमाई|জিত/i.test(q)) || LOTTERY.test(q)) flags.gambling = true;
  // Off-topic.
  if (MARKET.test(q) && /\b(?:tomorrow|kal|up|down|upar|neeche|win)\b|ऊपर|नीचे|কাল/i.test(q) && !i.topic) { flags.gambling = true; return done('off_topic'); }
  if (OFF_TOPIC.test(q) && !i.topic && !MUHURAT.test(q)) return done('off_topic');

  // Corrections ("but I'm already married", "I meant my sister").
  const corrected = Object.keys(i.stated).length > 0;
  if (prev && corrected) {
    let resolved: Category = prev.resolved;
    if (i.stated.subject && i.stated.subject !== 'self') resolved = 'other_profile';
    else if (i.topic && !i.inherited && i.topic !== prev.topic) resolved = topicCategory(q, i, flags);
    else if (i.stated.employed && (prev.resolved === 'job_change_timing' || prev.topic === 'job')) resolved = 'promotion';
    if (/\bpromot|growth|hike|प्रमोशन|প্রমোশন|তরক্কি|तरक्की/i.test(q)) resolved = 'promotion';
    return done('contradictory_follow_up', resolved);
  }

  // Follow-ups on the previous answer: no topic of their own (or a short message that leans on the last answer).
  const nWords = q.split(/\s+/).filter(Boolean).length;
  if (prev && NO_TIME_FU.test(q)) return done('no_birth_time', prev.resolved, 'why');
  if (prev && FU_INSIST.test(q)) return done('exact_date_or_name', prev.resolved, 'insist');
  if (prev && (!i.topic || i.inherited || nWords <= 7)) {
    const fu: FollowUp | null = FU_EXACTLY.test(q) ? 'exactly' : FU_TOOFAR.test(q) && !FU_WHY.test(q) ? 'tooFar'
      : FU_WHY.test(q) ? (FU_TOOFAR.test(q) ? 'tooFar' : 'why') : FU_WHATNOW.test(q) ? 'whatNow' : FU_SHOULDI.test(q) ? 'shouldI'
      : FU_SPECIFIC.test(q) ? 'specific' : FU_MORE.test(q) ? 'more' : FU_MEANING.test(q) ? 'meaning'
      : FU_WHICH.test(q) || (i.clarifies && (!i.topic || i.inherited)) ? 'which' : null;
    if (fu) {
      let resolved: Category = prev.resolved;
      if (fu === 'which' && (prev.topic === 'job' || prev.topic === 'promotion' || prev.resolved === 'career_field' || i.ask === 'careerField')) resolved = 'career_field';
      if (fu === 'which' && (prev.topic === 'education' || prev.resolved === 'education_field' || i.ask === 'studyField')) resolved = 'education_field';
      if (fu === 'meaning' && TECH_SADE.test(q)) flags.technical = 'sadeSati';
      // "What should I do now?" / "should I quit?" lean on the thread's last timing answer.
      if (fu === 'whatNow' || fu === 'shouldI') resolved = prev.chain.find(c => TIMING_CATS.includes(c)) ?? prev.resolved;
      return done('follow_up_clarification', resolved, fu);
    }
  }
  // Follow-ups that name their own area but lean on the previous answer.
  if (prev) {
    if (REMEDY.test(q) || (flags.gem && /\bwear|pehn|por(?:bo|le)|पहन|পর/i.test(q))) {
      return done('follow_up_clarification', 'remedies', null);
    }
    if (flags.diagnosis && (prev.topic === 'health' || prev.resolved === 'health_wellbeing')) return done('follow_up_clarification', 'health_wellbeing', 'which');
    if (/\bwhat should we work on\b|\bwork on\b/i.test(q) && prev.resolved === 'compatibility_other_person') return done('follow_up_clarification', 'compatibility_other_person', 'whatNow');
    if (flags.settleOrTrip && (prev.topic === 'foreign' || prev.resolved === 'foreign_settlement')) return done('follow_up_clarification', 'foreign_settlement', 'which');
    if (flags.options && (prev.resolved === 'career_field' || prev.topic === 'job')) return done('follow_up_clarification', 'career_field', 'which');
    if (FU_SHOULDI.test(q)) return done('follow_up_clarification', prev.resolved, 'shouldI');
    // "and money?", "और मेरा जीवनसाथी कैसा होगा?", "What will my partner be like?" after a marriage answer.
    const related = (a: IntentTopic | null, b: IntentTopic | null) => !!a && !!b && (a === b || ([a, b].every(t => t === 'marriage' || t === 'love')) || ([a, b].every(t => t === 'job' || t === 'promotion')));
    if (i.topic && (CONJ_START.test(q) || (related(i.topic, prev.topic) && nWords <= 8 && i.subject.kind === 'self' && !i.exactDate))) {
      const own = PARTNER_DESC.test(q) || i.ask === 'partner' ? 'partner_traits_meeting' : topicCategory(q, i, flags);
      if (own !== prev.resolved || CONJ_START.test(q)) return done('follow_up_clarification', own, null);
    }
  }

  // Feature routes (medical safety before remedies: "can I stop my BP medicine if I wear a gemstone?").
  if (flags.stopTreatment || flags.diagnosis) return done('health_wellbeing');
  if (/\b(?:chakri|naukri|job) (?:chere|chhod(?:kar)?|quit)\b.*\b(?:business|byabsa|vyapar|dhandha)\b|\bquit (?:my )?job (?:and|to) start\b|नौकरी छोड़.*(?:व्यापार|बिज़नेस|बिजनेस)|চাকরি ছেড়ে.*ব্যবসা/i.test(q)) return done('business_vs_job');
  if (MUHURAT.test(q)) { flags.activity = muhuratActivity(q); return done('muhurat'); }
  if (LOTTERY.test(q)) { flags.gambling = true; return done('money_wealth'); }
  if (LUCKY.test(q)) { flags.lucky = luckyKind(q); return done('lucky_factors'); }
  if (REMEDY.test(q) || (flags.gem && /\bwear|pehn|por(?:bo|le|a)|पहन|পর|should i\b/i.test(q))) return done('remedies');
  if (COMPAT.test(q)) return done('compatibility_other_person');
  if (DIVORCE.test(q) && !flags.remarriage) return done('divorce_separation');
  if (MIND_READING.test(q)) { flags.mindReading = true; return done('yes_no', 'relationship_problems'); }
  if (flags.surgery && i.topic !== 'business') return done('health_wellbeing');
  if (LOVE_ARR.test(q) || (flags.parentsAccept && /\blove|prem|pyar|somporko|relationship|प्रेम|प्यार|प्रेम|সম্পর্ক|প্রেম/i.test(q))) return done('love_vs_arranged');
  if (flags.partnership) return done('business_vs_job');

  // Technical questions the user phrases themselves; "is it my dasha that…" is a why-now.
  const whyNow = WHY_NOW.test(q);
  if (TECH_KAAL.test(q)) { flags.kaalSarp = true; flags.technical = 'kaalSarp'; return done('chart_technical'); }
  if (!whyNow) {
    if (TECH_MANGLIK.test(q)) { flags.technical = 'manglik'; return done('chart_technical'); }
    if (TECH_SADE.test(q)) { flags.technical = 'sadeSati'; return done('chart_technical'); }
    if (TECH_DASHA.test(q) && !/\bwhy\b|kyu|keno|क्यों|কেন/i.test(q)) { flags.technical = 'dasha'; return done('chart_technical'); }
    const pm = PLACEMENT.exec(q);
    if (pm) { flags.technical = 'placement'; flags.placement = { planet: pm[1][0].toUpperCase() + pm[1].slice(1), house: Number(pm[2]) }; return done('chart_technical'); }
  }

  // Past events before "bad phase" wording ("Did I go through a bad phase in 2019?").
  const pastLike = i.past || ((PAST_EXTRA.test(q) || PAST_YEAR.test(westernDigits(q))) && PAST_MARK.test(q));
  if (pastLike) return done('past_event_verification', i.topic && i.topic !== 'general' ? topicCategory(q, i, flags) : 'general_luck');

  // Wellbeing before life topics ("I'm depressed about my career", "bahut stress hai").
  const bodily = /\b(?:tired|sick|ill|pain|health|body|fever|fatigue|bp|sugar)\b|तबीयत|बीमार|थकान|শরীর|ক্লান্ত|অসুখ/i.test(q);
  if (DISTRESS.test(q) && !bodily) return done('mental_health_distress');
  if (whyNow && (!i.topic || i.topic === 'general' || i.topic === 'chart' || i.kind === 'why' || i.timing)) return done('why_now_current_phase');
  if (SPIRIT.test(q)) return done('spirituality_purpose');

  // Situational forms around a life topic.
  if (NO_TIME.test(q)) return done('no_birth_time', i.topic ? topicCategory(q, i, flags) : 'no_birth_time');
  if (i.subject.kind === 'other' && i.topic && !FAMILY_DYN.test(q)) return done('other_profile', topicCategory(q, i, flags));
  if (FAMILY_WHO.test(q) && FAMILY_DYN.test(q) && !REL_PROBLEM.test(q.replace(/\bhome\b/, ''))) return done('family_parents_siblings');
  if (/\bhome\b|घर में|বাড়িতে|বাড়িতে|barite/i.test(q) && /tension|तनाव|অশান্তি|oshanti|jhagda|झगड़/i.test(q)) return done('family_parents_siblings');
  if (flags.retirement && !i.topic) return done('elderly', 'general_luck');
  if (flags.grandchildren) return done('elderly', 'children_timing');
  if (PERSONALITY.test(q) && !PARTNER_DESC.test(q) && (!i.topic || i.topic === 'general' || i.topic === 'health' || i.kind === 'nature' || i.ask === 'strengths')) return done('personality');
  if (i.exactDate && i.topic && i.topic !== 'chart') return done('exact_date_or_name', topicCategory(q, i, flags));
  if (YESNO_SPECIFIC.test(q) && i.topic) return done('yes_no', topicCategory(q, i, flags));
  if (flags.year && (!i.topic || i.topic === 'general')) return done('general_luck');
  if (flags.country) return done('foreign_settlement');

  // Relationship trouble, partner descriptions and options without a clear topic word.
  if (REL_PROBLEM.test(q) && (!i.topic || ['general', 'love', 'marriage'].includes(i.topic))) return done('relationship_problems');
  if (flags.trying && (!i.topic || i.topic === 'general' || i.topic === 'children')) return done('children_timing');
  if (PARTNER_DESC.test(q) && (!i.topic || i.topic === 'marriage' || i.topic === 'love') && !STUDY_SUBJECT.test(q)) return done('partner_traits_meeting');
  if (flags.options) {
    const study = ['MBA', 'MS', 'science', 'commerce', 'medicine'].some(o => flags.options!.includes(o)) || STUDY_SUBJECT.test(q);
    if (['meditation', 'bhakti'].some(o => flags.options!.includes(o))) return done('spirituality_purpose');
    if (study) return done('education_field');
    if (flags.options.includes('government') && flags.options.includes('private')) return done('government_job');
    return done('career_field');
  }
  if (CAREER_FIELD.test(q) && !i.timing) return done(flags.govt ? 'government_job' : 'career_field');
  if (STUDY_SUBJECT.test(q) && (i.kind === 'choice' || i.kind === 'yesno' || i.ask === 'studyField')) return done('education_field');
  if (flags.exam && (!i.topic || i.topic === 'general' || i.topic === 'education')) {
    return done(flags.govt && !/exam|परीक्षा|পরীক্ষা|एग्जाम/i.test(q) ? 'government_job' : 'exams_competitive');
  }
  if (flags.govt && (!i.topic || i.topic === 'general')) return done('government_job');
  if (flags.owed) return done('debt_loans');

  if (i.topic) return done(topicCategory(q, i, flags));
  if (whyNow) return done('why_now_current_phase');
  // Asks without a topic word ("Which stream after 10th?", "Where will I meet them?").
  const ASK_CAT: Partial<Record<Ask, Category>> = {
    careerField: 'career_field', businessVsJob: 'business_vs_job', partner: 'partner_traits_meeting', moneySources: 'money_wealth',
    studyField: 'education_field', relocation: 'foreign_settlement', strengths: 'personality', wellbeing: 'health_wellbeing', whyNow: 'why_now_current_phase',
  };
  if (i.ask && ASK_CAT[i.ask]) return done(ASK_CAT[i.ask]!);
  if (i.kind === 'nature') return done('personality');
  return done('general_luck');
}
