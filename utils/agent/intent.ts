/**
 * Layer 1 of the answer pipeline: understand the question.
 *
 * question (+ thread history) → Intent: the life topic, whether it asks
 * "when", about whom, past or future, whether it wants an exact day, and its
 * safety class. Pure (no React Native, no i18n), en / hi / bn and the
 * Latin-script Hinglish / Banglish people actually type.
 *
 * Edge cases handled (tests: scratchpad agent/intent.test.ts):
 *  - states that already happened don't count as the topic: "I am already
 *    married, when will I have a child" → children; "I already have a job,
 *    when promotion" → promotion (`alreadyHave` keeps them);
 *  - negation: "I don't want to marry, when will I get a job" → job;
 *  - several topics: the clause holding the question word wins, then the
 *    strongest word, then the earliest; the others are `secondary`;
 *  - another person: "when will my sister marry" → subject {relation: sister};
 *    "when will I marry my girlfriend" stays the user; a spouse in a children
 *    question ("when will my wife conceive") is the couple, i.e. the user;
 *  - "did I / was it / হয়েছিল / हुई थी" → past;
 *  - "exact date / which day / কোন তারিখ / किस दिन" → exactDate;
 *  - planet, transit and dasha questions ("when does my sade sati end") are
 *    topic 'chart': their dates come from the chart context, not the engine;
 *  - follow-ups without a topic ("When exactly?") inherit the last topic;
 *  - answer kind (timing / choice / nature / advice / yes-no / why) and the
 *    ask a planner exists for ("which roles should I apply for" → careerField);
 *  - clarifications ("Like I'm asking which domain?", "No, I mean…", "what
 *    about…", "मतलब…", "মানে…") re-read the previous question: its topic, kind
 *    and ask fill in what the clarification leaves out.
 */
import type { TimingTopic } from '../timing-engine';
import { cannedQuestion, isCrisisMessage, isTimingQuestion, adviceNeeded, words } from '../reply-guards';
import { categorize, type Category, type CategoryFlags, type FollowUp, type PrevTurn } from './categories';
import { factsFromMessage, EMPTY_FACTS, type ThreadFacts } from './thread-facts';

export type IntentTopic = TimingTopic | 'chart';

export type Relation =
  | 'sister' | 'brother' | 'mother' | 'father' | 'son' | 'daughter' | 'wife' | 'husband' | 'partner'
  | 'friend' | 'cousin' | 'grandparent' | 'relative';

export type SafetyClass = 'crisis' | 'childSex' | 'partnerName' | 'death' | null;

export type Intent = {
  /** Main topic, or null for chat that isn't about a life area. */
  topic: IntentTopic | null;
  /** Other topics in the question, strongest first. */
  secondary: IntentTopic[];
  /** Asks when (or "this year?" / "kab" / "কবে"). */
  timing: boolean;
  /** Asks about the past ("did I…", "হয়েছিল"). */
  past: boolean;
  /** Wants a specific day. */
  exactDate: boolean;
  /** The question is about someone else (relation word with "my" before any "I"). */
  subject: { kind: 'self' } | { kind: 'other'; relation: Relation };
  /** Topics the user says are already true ("I am married"). */
  alreadyHave: IntentTopic[];
  /** Topics the user says they don't want. */
  negated: IntentTopic[];
  /** Inherited from an earlier question in the thread. */
  inherited: boolean;
  safety: SafetyClass;
  /** Health / legal questions: the answer must point to a doctor / lawyer. */
  advice: ('doctor' | 'lawyer')[];
  /** What kind of answer the question wants (timing, a choice, a description, advice, yes/no, why). */
  kind: AnswerKind;
  /**
   * The concrete thing a non-timing question asks for, when the plan has an
   * astrologer's method for it ("which field suits me" → careerField). Null
   * when there is none (or the guru's default is used: plan.ts).
   */
  ask: Ask | null;
  /**
   * The message clarifies the previous question ("Like I'm asking which
   * domain?", "No, I mean…", "what about…"): topic / kind / ask were
   * re-read with the previous question, not answered as a new generic one.
   */
  clarifies: boolean;
  /** One of the 46 rules.md categories: the message's form (follow-up, correction, yes/no …). */
  category: Category;
  /** The content category the answer follows (= category for plain questions). */
  resolved: Category;
  /** What a follow-up asks of the previous answer. */
  followUp: FollowUp | null;
  /** Category details (emergency, gem, two options, muhurat activity …). */
  flags: CategoryFlags;
  /** Facts this message states about the user ("I'm already married", "I meant my sister"). */
  stated: Partial<ThreadFacts>;
  /** The previous user question's intent essentials (null for a first question). */
  prev: PrevTurn | null;
};

/**
 * - timing  "when…", "this year?", "kab", "কবে"
 * - choice  "which field / role / course / city", "business or job", "kaun sa", "কোন"
 * - nature  "what kind of partner", "how will my wife be", "my strengths", "कैसी", "কেমন"
 * - advice  "how can I improve…", "what should I do", "कैसे", "কীভাবে"
 * - yesno   "will I…?", "should I…?", "क्या…", "…হবে কি"
 * - why     "why is this happening", "क्यों", "কেন"
 */
export type AnswerKind = 'timing' | 'choice' | 'nature' | 'advice' | 'yesno' | 'why' | 'general';

/** Non-timing questions plan.ts has a deterministic astrologer's method for. */
export type Ask =
  | 'careerField' | 'businessVsJob' | 'partner' | 'moneySources' | 'studyField' | 'relocation'
  | 'strengths' | 'wellbeing' | 'whyNow'
  // Stage 2 planners (plan.ts picks them from the category, not from words).
  | 'family' | 'relationship' | 'purpose' | 'remedies' | 'loveArranged';

export const ASKS: readonly Ask[] = [
  'careerField', 'businessVsJob', 'partner', 'moneySources', 'studyField', 'relocation', 'strengths', 'wellbeing', 'whyNow',
  'family', 'relationship', 'purpose', 'remedies', 'loveArranged',
];

const nfc = (s: string) => s.normalize('NFC').toLowerCase().replace(/[’`]/g, "'");

// ─── Lexicons ────────────────────────────────────────────────────────────────
// Each entry: [pattern, weight]. Latin patterns are word-start regexes (suffixes
// allowed); Indic entries are substrings (case endings attach to them).

type Lex = [string, number][];

const LATIN: Record<IntentTopic, Lex> = {
  marriage: [['marr(?:y|ied|iage|ying)', 3], ['wed(?:ding)?\\b', 3], ['spouse', 2], ['husband', 2], ['wife', 2], ['bride', 2],
    ['groom', 2], ['life ?partner', 3], ['settle down', 2], ['shaa?di', 3], ['vivaa?h', 3], ['byaa?h', 3], ['biy[ae]h?\\b', 3],
    ['bie\\b', 3], ['bibaho?', 3], ['rishta', 1.5], ['patni', 2], ['pati\\b', 2], ['bou\\b', 2], ['bor\\b', 1.5], ['swami', 1.5], ['proposal', 1.5]],
  love: [['love', 3], ['relationship', 2.5], ['girl ?friend', 2.5], ['boy ?friend', 2.5], ['\\bgf\\b', 2], ['\\bbf\\b', 2],
    ['crush', 2.5], ['dating', 2.5], ['romance', 2.5], ['romantic', 2.5], ['soul ?mate', 2.5], ['break ?up', 2], ['my ex\\b', 2],
    ['pyaa?r', 3], ['prem\\b', 3], ['premik', 3], ['mohabb?at', 3], ['bhalob[ae]sh?a', 3], ['partner(?!ship)', 1]],
  job: [['jobs?\\b', 3], ['employ', 2.5], ['hired', 2.5], ['hiring', 2], ['offer letter', 3], ['interview', 2.5], ['placement', 2.5],
    ['naukri', 3], ['naukari', 3], ['nokri', 3], ['chakri', 3], ['chakori', 3], ['sarkari', 2], ['government post', 3],
    ['career', 1.5], ['resign', 3], ['better company', 2.5], ['work\\b', 0.8], ['kaam\\b', 0.8], ['kaj\\b', 0.8], ['unemploy', 3], ['switch', 1.5],
    // "Which roles should I apply for / which domain / what profession"
    ['roles?\\b', 2], ['apply\\b', 1.5], ['applying', 1.5], ['domains?\\b', 2], ['professions?', 2.5], ['occupation', 2.5],
    ['sectors?\\b', 2], ['industr(?:y|ies)', 2], ['line of work', 3], ['(?:which|what|right|best) fields?\\b', 2], ['fields? of work', 3],
    ['pesha', 2.5], ['kshetra', 1.5]],
  promotion: [['promot', 4], ['my growth', 3], ['raise\\b', 2.5], ['hike', 3], ['increment', 3], ['appraisal', 3], ['higher post', 3],
    ['senior (?:role|position)', 3], ['career growth', 4], ['growth in (?:my )?(?:career|job|office)', 4], ['taraq?q?ee?', 3],
    ['tarakk?i', 3], ['padonn?ati', 4]],
  business: [['business', 3], ['start-?up', 3], ['venture', 2.5], ['entrepreneur', 3], ['own company', 3], ['self-?employ', 3],
    ['shop\\b', 2], ['trade\\b', 1.5], ['trading', 1.5], ['vyapa?a?r', 3], ['vyavsay', 3], ['dhandh?a', 3], ['dukaa?n', 2],
    ['bya?bsh?a', 3], ['babsa', 3], ['partnership firm', 3], ['partnership', 2.5], ['dhandha', 3]],
  money: [['money', 3], ['wealth', 3], ['rich\\b', 2.5], ['financ', 2.5], ['income', 2], ['salary', 1.5], ['savings?', 2],
    ['debts?\\b', 2.5], ['loans?\\b', 2], ['invest', 2], ['profit', 2], ['paisa', 3], ['paise', 3], ['dhan\\b', 2.5],
    ['kamai', 2.5], ['karz', 2.5], ['lakhs?\\b', 2], ['owes? me', 3], ['taka\\b', 3], ['poi?sa\\b', 2], ['dhon\\b', 2.5], ['arthik', 2.5], ['stock market', 2]],
  property: [['property', 3], ['real estate', 3], ['flat\\b', 2.5], ['apartment', 2.5], ['land\\b', 2.5], ['plot\\b', 2.5],
    ['(?:buy|own|purchase|build|get)(?:ing)? (?:a |my |our |my own |our own |new )?(?:house|home|flat|car|vehicle|bike)', 4],
    ['own (?:house|home)', 3], ['vehicle', 2.5], ['\\bcar\\b', 2], ['makaa?n', 3], ['zameen', 3], ['jameen', 3], ['jomi\\b', 3],
    ['gaa?di\\b', 2], ['gari\\b', 2], ['apna ghar', 3], ['ghar (?:kab )?(?:le|kharid|bana)', 3], ['nijer bari', 3],
    ['bari (?:kin|kor|bana)', 3]],
  children: [['child(?:ren)?\\b', 3], ['\\bkids?\\b', 2.5], ['baby', 3], ['pregnan', 3], ['conceiv', 3], ['start a family', 3],
    ['parenthood', 3], ['bacc?h?a\\b', 3], ['bacc?he\\b', 3], ['santaa?n', 3], ['sontan', 3], ['aulaa?d', 3], ['son\\b', 1],
    ['daughter', 1], ['ivf', 2]],
  education: [['stud(?:y|ies|ying)', 3], ['exams?\\b', 3], ['admission', 3], ['college', 2.5], ['universit', 2.5], ['school', 2],
    ['degree', 2.5], ['masters', 2.5], ['subjects?\\b', 1.5], ['\\bmba\\b', 2.5], ['phd', 2.5], ['\\bneet\\b', 3], ['\\bjee\\b', 3], ['upsc', 3],
    ['\\bgate\\b', 2], ['\\bcat\\b', 1.5], ['board', 1.5], ['results?\\b', 1.5], ['scholarship', 3], ['course', 1.5],
    ['padh?ai', 3], ['pariksha', 3], ['porashona', 3], ['porasona', 3], ['porikkha', 3], ['competitive', 2]],
  foreign: [['abroad', 4], ['foreign', 3], ['overseas', 3], ['visa', 3], ['green card', 3], ['\\bpr\\b', 2], ['immigra', 3],
    ['emigra', 3], ['relocat', 2], ['onsite', 2.5], ['videsh', 4], ['bidesh', 4], ['pardes', 3],
    ['\\b(?:usa|us|america|canada|uk|london|australia|germany|dubai|europe|japan|singapore|new zealand)\\b', 2]],
  health: [['health', 3], ['recover', 3], ['illness', 3], ['sick', 2.5], ['disease', 3], ['surgery', 3], ['\\bheal', 2.5],
    ['fitness', 2], ['\\bpain', 2], ['stress', 2], ['tired', 2.5], ['fatigue', 2.5], ['healthy', 3], ['habits?\\b', 1], ['sehat', 3], ['tabiy[ae]t', 3], ['bimaa?ri', 3], ['shorir', 2.5], ['sasth?y', 3],
    ['osukh', 3], ['asukh', 3]],
  legal: [['court', 3], ['case\\b', 2], ['lawsuit', 3], ['legal', 3], ['litigation', 3], ['dispute', 2.5], ['police', 2.5],
    ['divorce', 3], ['custody', 3], ['bail\\b', 3], ['jail', 3], ['mukad?d?a?ma', 3], ['adaa?lat', 3], ['adalot', 3],
    ['kachahri', 3], ['mamla', 2.5], ['talaa?q', 3], ['talak', 3]],
  general: [['luck', 2.5], ['fortune', 2.5], ['good times?', 2], ['bad (?:time|phase|patch)', 2], ['things (?:get|will get) better', 2],
    ['acche din', 3], ['bura (?:waqt|samay)', 3], ['kismat', 3], ['bhagya', 3], ['bhaggo', 3], ['success', 1.5], ['sudin', 3]],
  chart: [['saturn', 4], ['shani', 4], ['jupiter', 4], ['rahu', 4], ['ketu', 4], ['sade ?sati', 5], ['sadhe ?sati', 5],
    ['dhaiya', 5], ['maha ?dasha', 5], ['antar ?dasha', 5], ['dasha', 4], ['transit', 4], ['retrograde', 4], ['mercury', 3],
    ['venus', 3], ['mars\\b', 3], ['manglik', 4], ['nakshatra', 4]],
};

const INDIC: Record<IntentTopic, Lex> = {
  marriage: [['शादी', 3], ['विवाह', 3], ['ब्याह', 3], ['पति', 2], ['पत्नी', 2], ['जीवनसाथी', 3], ['जीवन साथी', 3], ['दुल्हन', 2], ['रिश्ता', 1.5],
    ['বিয়ে', 3], ['বিয়ে', 3], ['বিবাহ', 3], ['স্বামী', 2], ['স্ত্রী', 2], ['বউ', 2], ['বৌ', 2], ['জীবনসঙ্গী', 3], ['পাত্র', 1.5]],
  love: [['प्यार', 3], ['प्रेम', 3], ['मोहब्बत', 3], ['गर्लफ्रेंड', 2.5], ['बॉयफ्रेंड', 2.5], ['रिलेशनशिप', 2.5], ['क्रश', 2.5],
    ['প্রেম', 3], ['ভালোবাসা', 3], ['ভালবাসা', 3], ['প্রেমিক', 3], ['সম্পর্ক', 2], ['ক্রাশ', 2.5], ['গার্লফ্রেন্ড', 2.5], ['বয়ফ্রেন্ড', 2.5]],
  job: [['नौकरी', 3], ['नोकरी', 3], ['रोज़गार', 3], ['रोजगार', 3], ['इंटरव्यू', 2.5], ['प्लेसमेंट', 2.5], ['जॉब', 3], ['करियर', 1.5],
    ['कैरियर', 1.5], ['काम', 0.8], ['पेशा', 2.5], ['पेशे', 2.5], ['आवेदन', 1.5], ['फील्ड', 2], ['फ़ील्ड', 2], ['क्षेत्र', 1.5], ['डोमेन', 2], ['रोल', 2],
    ['চাকরি', 3], ['চাকরী', 3], ['জব', 3], ['ইন্টারভিউ', 2.5], ['ক্যারিয়ার', 1.5], ['কেরিয়ার', 1.5], ['কাজ', 0.8],
    ['পেশা', 2.5], ['আবেদন', 1.5], ['ফিল্ড', 2], ['ক্ষেত্র', 1.5], ['ডোমেন', 2], ['রোল', 2], ['লাইন', 1]],
  promotion: [['प्रमोशन', 4], ['पदोन्नति', 4], ['तरक्की', 3], ['तरक़्क़ी', 3], ['इंक्रीमेंट', 3], ['वेतन वृद्धि', 3],
    ['প্রমোশন', 4], ['পদোন্নতি', 4], ['ইনক্রিমেন্ট', 3], ['বেতন বৃদ্ধি', 3]],
  business: [['व्यापार', 3], ['व्यवसाय', 3], ['बिज़नेस', 3], ['बिजनेस', 3], ['धंधा', 3], ['दुकान', 2], ['स्टार्टअप', 3],
    ['ব্যবসা', 3], ['ব্যবসায়', 3], ['ব্যবসায়', 3], ['দোকান', 2], ['স্টার্টআপ', 3]],
  money: [['पैसा', 3], ['पैसे', 3], ['पैसों', 3], ['तंगी', 2], ['धन', 2.5], ['दौलत', 3], ['अमीर', 2.5], ['कमाई', 2.5], ['आमदनी', 2.5], ['कर्ज', 2.5], ['क़र्ज़', 2.5],
    ['लोन', 2], ['बचत', 2], ['निवेश', 2], ['आर्थिक', 2.5], ['सैलरी', 1.5],
    ['টাকা', 3], ['অর্থ', 2.5], ['ধন', 2.5], ['সম্পদ', 2.5], ['আয়', 2], ['আয়', 2], ['ঋণ', 2.5], ['লোন', 2], ['সঞ্চয়', 2], ['সঞ্চয়', 2],
    ['বিনিয়োগ', 2], ['বিনিয়োগ', 2], ['আর্থিক', 2.5], ['বড়লোক', 2.5], ['বেতন', 1.5]],
  property: [['मकान', 3], ['ज़मीन', 3], ['जमीन', 3], ['प्लॉट', 2.5], ['फ्लैट', 2.5], ['गाड़ी', 2], ['गाडी', 2], ['वाहन', 2.5], ['संपत्ति', 2.5],
    ['सम्पत्ति', 2.5], ['प्रॉपर्टी', 3], ['अपना घर', 3], ['घर खरीद', 3], ['घर ले', 2.5], ['घर बन', 2.5],
    ['জমি', 3], ['ফ্ল্যাট', 2.5], ['গাড়ি', 2], ['গাড়ি', 2], ['সম্পত্তি', 2.5], ['প্রপার্টি', 3], ['নিজের বাড়ি', 3], ['বাড়ি কিন', 3],
    ['বাড়ি কিন', 3], ['বাড়ি বানা', 3], ['বাড়ি বানা', 3]],
  children: [['बच्चा', 3], ['बच्चे', 3], ['संतान', 3], ['सन्तान', 3], ['औलाद', 3], ['गर्भ', 3], ['प्रेग्नेंसी', 3], ['प्रेगनेंसी', 3],
    ['সন্তান', 3], ['বাচ্চা', 3], ['শিশু', 2], ['গর্ভ', 3], ['প্রেগন্যান্ট', 3]],
  education: [['पढ़ाई', 3], ['पढ़ाई', 3], ['परीक्षा', 3], ['एग्जाम', 3], ['एग्ज़ाम', 3], ['एडमिशन', 3], ['दाखिला', 3], ['कॉलेज', 2.5],
    ['स्कूल', 2], ['डिग्री', 2.5], ['रिजल्ट', 2], ['पढ़ाई', 3], ['विषय', 1.5], ['पढ़ना', 2], ['पढ़ूँ', 2], ['कोर्स', 2.5],
    ['পড়াশোনা', 3], ['পড়াশোনা', 3], ['পড়াশুনা', 3], ['পড়াশুনা', 3], ['পরীক্ষা', 3], ['ভর্তি', 3], ['কলেজ', 2.5], ['স্কুল', 2],
    ['ডিগ্রি', 2.5], ['রেজাল্ট', 2], ['উচ্চশিক্ষা', 3], ['উচ্চ শিক্ষা', 3], ['उच्च शिक्षा', 3], ['বিষয়', 1.5], ['বিষয়', 1.5], ['পড়া উচিত', 2], ['কোর্স', 2.5]],
  foreign: [['विदेश', 4], ['परदेस', 3], ['वीज़ा', 3], ['वीजा', 3], ['अमेरिका', 2], ['कनाडा', 2], ['लंदन', 2],
    ['বিদেশ', 4], ['প্রবাস', 3], ['ভিসা', 3], ['আমেরিকা', 2], ['কানাডা', 2], ['লন্ডন', 2]],
  health: [['सेहत', 3], ['स्वास्थ्य', 3], ['तबीयत', 3], ['तबियत', 3], ['बीमारी', 3], ['ठीक हो', 2], ['स्वस्थ', 3], ['तनाव', 2], ['थकान', 2.5], ['आदत', 1],
    ['স্বাস্থ্য', 3], ['শরীর', 2.5], ['অসুখ', 3], ['সুস্থ', 2.5], ['রোগ', 2.5], ['ক্লান্ত', 2.5], ['মানসিক চাপ', 2], ['অভ্যাস', 1]],
  legal: [['कोर्ट', 3], ['अदालत', 3], ['मुकदमा', 3], ['मुक़दमा', 3], ['केस', 2], ['कानूनी', 3], ['क़ानूनी', 3], ['तलाक', 3], ['पुलिस', 2.5],
    ['আদালত', 3], ['কোর্ট', 3], ['মামলা', 3], ['কেস', 2], ['আইনি', 3], ['ডিভোর্স', 3], ['পুলিশ', 2.5]],
  general: [['किस्मत', 3], ['क़िस्मत', 3], ['भाग्य', 3], ['अच्छा समय', 2], ['अच्छे दिन', 3], ['बुरा समय', 2.5],
    ['ভাগ্য', 3], ['ভালো সময়', 2], ['ভালো সময়', 2], ['খারাপ সময়', 2.5], ['খারাপ সময়', 2.5], ['সুদিন', 3]],
  chart: [['शनि', 4], ['बृहस्पति', 4], ['राहु', 4], ['केतु', 4], ['साढ़े साती', 5], ['साढ़ेसाती', 5], ['ढैय्या', 5], ['महादशा', 5],
    ['अंतर्दशा', 5], ['दशा', 4], ['गोचर', 4], ['शनि', 4], ['মঙ্গলিক', 4], ['মাঙ্গলিক', 4],
    ['শনি', 4], ['বৃহস্পতি', 4], ['রাহু', 4], ['কেতু', 4], ['সাড়ে সাতি', 5], ['সাড়ে সাতি', 5], ['মহাদশা', 5], ['দশা', 4], ['গোচর', 4]],
};

const TOPICS = Object.keys(LATIN) as IntentTopic[];
const LATIN_RE: Record<IntentTopic, [RegExp, number][]> = Object.fromEntries(
  TOPICS.map(t => [t, LATIN[t].map(([p, w]) => [new RegExp(p.startsWith('\\b') ? p : `\\b${p}`, 'g'), w] as [RegExp, number])]),
) as Record<IntentTopic, [RegExp, number][]>;
const INDIC_LEX: Record<IntentTopic, [string, number][]> = Object.fromEntries(
  TOPICS.map(t => [t, INDIC[t].map(([s, w]) => [s.normalize('NFC'), w] as [string, number])]),
) as Record<IntentTopic, [string, number][]>;

const ROMANCE = /\b(?:love|girl ?friend|boy ?friend|gf|bf|crush|dating|romance|romantic|pyaa?r|prem|premik)\b|प्यार|प्रेम|गर्लफ्रेंड|बॉयफ्रेंड|প্রেম|ভালোবাসা|গার্লফ্রেন্ড|বয়ফ্রেন্ড/i;
const FAMILY_REL = /\b(?:father|mother|dad|mom|mum|papa|mummy|parents?|brother|sister|sibling|in-?laws?|saas|sasur|bhai|behen|didi|dada|boudi|baba|maa)\b|पिता|पापा|माँ|मां|माता|भाई|बहन|सास|ससुर|ननद|देवर|बाबा|বাবা|মা\b|মায়ের|ভাই|বোন|দাদা|দিদি|শ্বশুর|শাশুড়ি|ননদ/i;

/** Topic hits in a text: topic → [best weight, first index]. */
function topicHits(text: string): Map<IntentTopic, { w: number; at: number }> {
  const out = new Map<IntentTopic, { w: number; at: number }>();
  const add = (t: IntentTopic, w: number, at: number) => {
    const cur = out.get(t);
    if (!cur) out.set(t, { w, at });
    else out.set(t, { w: cur.w + w * 0.5, at: Math.min(cur.at, at) });
  };
  for (const t of TOPICS) {
    for (const [re, w] of LATIN_RE[t]) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) add(t, w, m.index);
    }
    for (const [s, w] of INDIC_LEX[t]) {
      const i = text.indexOf(s);
      if (i >= 0) add(t, w, i);
    }
  }
  // "My relationship with my father / brother / in-laws" is family, not romance (Stage 3: a minor's question
  // about her father was declined as romance).
  if (out.has('love') && FAMILY_REL.test(text) && !ROMANCE.test(text)) out.delete('love');
  // "Property dispute / divorce case" is legal; "salary hike" is promotion.
  if (out.has('legal') && out.has('property')) out.get('property')!.w *= 0.5;
  if (out.has('promotion')) {
    const job = out.get('job');
    if (job) job.w *= 0.5;
    const money = out.get('money');
    if (money) money.w *= 0.5;
  }
  return out;
}

// ─── Clauses: already-true states, negation, the question clause ────────────

const CLAUSE_SPLIT = new RegExp([
  '[,.;!?।॥\\n]+', '\\s(?:but|and|so|now|then|also|though|although|because)\\s', '\\s(?:lekin|par|aur|ab|toh|kintu|tobe|ebong|ekhon)\\s',
  '\\s(?:लेकिन|पर|और|अब|तो|मगर)\\s', '\\s(?:কিন্তু|তবে|আর|এবং|এখন|তো)\\s',
].join('|'), 'g');

const ALREADY = new RegExp([
  // English
  "\\balready\\b", "\\bi(?:'m| am) (?:happily )?(?:married|engaged|employed|working|pregnant|a (?:mother|father|parent))\\b",
  "\\bwe(?:'re| are) (?:married|engaged)\\b", "(?<!\\b(?:will|would|can|could|shall|should|to|may|might) )\\bi (?:got|have been|was) (?:married|engaged|hired)\\b",
  "(?<!\\b(?:will|would|can|could|shall|should|to|may|might) )\\bi (?:have|own|got) (?:a |an |my )?(?:job|kids?|child(?:ren)?|son|daughter|house|home|flat|car|business|wife|husband|degree)\\b",
  "\\bi(?:'m| am) (?:in a job|working at|working in|working as|studying at)\\b", '\\bmarried for\\b', '\\bsince (?:my|our) (?:marriage|wedding)\\b',
  // Hinglish / Banglish
  '\\b(?:shaa?di|biye|bie) (?:ho (?:chuki|gayi|gai)|hoye ?(?:geche|gechhe|gache))', '\\bshaa?dishuda\\b', '\\bbibahito\\b',
  '\\bmarried (?:hoon|hu|hun|achhi|achi)\\b', '\\b(?:naukri|job|chakri) (?:hai|lag (?:gayi|gai|chuki)|achhe|ache|kori|karta|karti|karte)\\b',
  '\\bpehle se\\b', '\\bage theke(?:i)?\\b',
  // Hindi
  'शादीशुदा', 'शादी हो (?:चुकी|गई|गयी)', 'विवाहित', 'पहले से', 'नौकरी (?:है|करता|करती|करते|लग (?:गई|गयी|चुकी))', 'जॉब (?:है|करता|करती)',
  'बच्चे हैं', 'बच्चा है',
  // Bengali
  'বিবাহিত', 'বিয়ে হয়ে (?:গেছে|গিয়েছে)', 'বিয়ে হয়ে (?:গেছে|গিয়েছে)', 'ইতিমধ্যে', 'আগে থেকেই', 'চাকরি (?:আছে|করি|করছি|পেয়ে গেছি|পেয়ে গেছি)',
  'সন্তান আছে', 'বাচ্চা আছে',
].join('|'), 'i');

const NEGATED = new RegExp([
  "\\b(?:don'?t|do not|never|not) (?:want|wish|plan|intend)(?: to)?\\b", '\\bnot interested\\b', '\\bno interest\\b', "\\bwon'?t\\b",
  '\\bnahi(?:n)? (?:chahiye|chahta|chahti|karni|karna|karunga|karungi)\\b', '\\bchai ?na\\b', '\\bkorbo na\\b', '\\bichhe nei\\b',
  'नहीं चाहिए', 'नहीं चाहता', 'नहीं चाहती', 'नहीं करनी', 'नहीं करना', 'नहीं करूंगा', 'नहीं करूँगा', 'नहीं करूंगी', 'इच्छा नहीं',
  'চাই না', 'চাইনা', 'করব না', 'করবো না', 'ইচ্ছে নেই', 'ইচ্ছা নেই',
].join('|'), 'i');

const QUESTION_CUE = new RegExp([
  '\\?', '\\b(?:when|will|how|what|which|why|kab|kobe|kokhon|kya|ki|kyu|kyun|keno|is there)\\b', 'कब', 'क्या', 'कैसे', 'क्यों', 'কবে', 'কখন', 'কি ', 'কী', 'কেন',
].join('|'), 'i');

// ─── Subject: whose question is it ───────────────────────────────────────────

const RELATIONS: [Relation, string[]][] = [
  ['sister', ['sister', 'sis', 'behen', 'bahen', 'behan', 'didi', 'bon', 'boner', 'बहन', 'दीदी', 'বোন', 'দিদি']],
  ['brother', ['brother', 'bro', 'bhai', 'bhaiya', 'dada', 'bhaiyer', 'भाई', 'भैया', 'ভাই', 'দাদা']],
  ['mother', ['mother', 'mom', 'mum', 'mummy', 'maa', 'mayer', 'माँ', 'मां', 'माता', 'মা', 'মায়ের', 'মায়ের']],
  ['father', ['father', 'dad', 'papa', 'baba', 'babar', 'पिता', 'पापा', 'বাবা']],
  ['son', ['son', 'beta', 'chele', 'cheler', 'बेटा', 'बेटे', 'ছেলে']],
  ['daughter', ['daughter', 'beti', 'meye', 'meyer', 'बेटी', 'মেয়ে', 'মেয়ে']],
  ['wife', ['wife', 'biwi', 'patni', 'bou', 'bouer', 'पत्नी', 'बीवी', 'বউ', 'বৌ', 'স্ত্রী']],
  ['husband', ['husband', 'pati', 'swami', 'bor', 'पति', 'স্বামী']],
  ['partner', ['partner', 'girlfriend', 'boyfriend', 'gf', 'bf', 'fiance', 'fiancee', 'fiancé', 'fiancée']],
  ['friend', ['friend', 'dost', 'bondhu', 'दोस्त', 'মিত্র', 'বন্ধু']],
  ['cousin', ['cousin', 'কাজিন', 'कज़िन']],
  ['grandparent', ['grandmother', 'grandfather', 'grandma', 'grandpa', 'dadi', 'nani', 'dadu', 'thakuma', 'दादी', 'नानी', 'दादा', 'নানা', 'ঠাকুমা']],
  ['relative', ['uncle', 'aunt', 'aunty', 'chacha', 'mama', 'mausi', 'kaku', 'mashi', 'চাচা', 'মামা', 'মাসি', 'काका', 'मामा', 'मौसी']],
];
const POSSESSIVE = new Set(['my', 'meri', 'mera', 'mere', 'amar', 'mor', 'मेरी', 'मेरा', 'मेरे', 'আমার', 'मेरी']);
const FIRST_PERSON = new Set(['i', "i'll", "i'm", 'im', 'me', 'main', 'mai', 'mujhe', 'ami', 'amake', 'मैं', 'मै', 'मुझे', 'আমি', 'আমাকে',
  'we', 'hum', 'amra', 'हम', 'আমরা']);
// "My marriage / meri shaadi / আমার বিয়ে": the possessive belongs to the topic itself.
const REL_OF = new Map<string, Relation>();
for (const [rel, ws] of RELATIONS) for (const w of ws) REL_OF.set(w.normalize('NFC'), rel);
const BN_CASE = ['ের', 'এর', 'র', 'কে', 'য়ের', 'য়ের'];

function relationOfWord(w: string): Relation | undefined {
  const r = REL_OF.get(w) ?? REL_OF.get(w.replace(/'s$/, ''));
  if (r) return r;
  for (const s of BN_CASE) if (w.endsWith(s) && REL_OF.has(w.slice(0, -s.length))) return REL_OF.get(w.slice(0, -s.length));
  if (/^[a-z]+s$/.test(w) && REL_OF.has(w.slice(0, -1))) return REL_OF.get(w.slice(0, -1));
  return undefined;
}

const WITH = new Set(['with', 'from', 'against', 'se', 'sathe', 'shathe', 'sange', 'से', 'সঙ্গে', 'সাথে', 'থেকে']);
const GENITIVE = new Set(['ki', 'ka', 'ke', 'की', 'का', 'के']);
const GEN_WORD = new RegExp('^(?:cheler|meyer|boner|bhaier|bhaiyer|babar|mayer|dadar|didir|bouer|borer)$|(?:ের|র)$'.normalize('NFC'));

function subjectOf(text: string, topic: IntentTopic | null): Intent['subject'] {
  const ws = words(text.replace(/'s\b/g, ''));
  let relAt = -1;
  let rel: Relation | undefined;
  for (let i = 0; i < ws.length; i++) {
    const r = relationOfWord(ws[i]);
    if (!r) continue;
    // "a dispute with my uncle", "भाई से झगड़ा": the relation is the other party, not whose chart.
    if (WITH.has(ws[i - 1] ?? '') || WITH.has(ws[i - 2] ?? '') || WITH.has(ws[i + 1] ?? '') || (ws[i + 1] === 'के' && ws[i + 2] === 'साथ')) continue;
    // "my sister", "meri behen", "আমার বোনের" (the possessive within two words before)
    if ([ws[i - 1], ws[i - 2]].some(w => w && POSSESSIVE.has(w))) { rel = r; relAt = i; break; }
    // "beti ki naukri", "cheler chakri", "দাদার বিদেশ": a genitive relation without "my".
    const genitive = GENITIVE.has(ws[i + 1] ?? '') || GEN_WORD.test(ws[i]);
    if (genitive && i <= 1) { rel = r; relAt = i; break; }
  }
  if (!rel) return { kind: 'self' };
  const meAt = ws.findIndex(w => FIRST_PERSON.has(w));
  if (meAt >= 0 && meAt < relAt) return { kind: 'self' };
  // A spouse / partner in a children or marriage question is the couple: the user.
  if ((rel === 'wife' || rel === 'husband' || rel === 'partner') && (topic === 'children' || topic === 'marriage' || topic === 'love')) {
    return { kind: 'self' };
  }
  return { kind: 'other', relation: rel };
}

// ─── Past, exact date, extra timing cues, death ──────────────────────────────

const PAST = new RegExp([
  '^\\s*(?:did|was|were|had)\\b', '\\bwhen (?:did|was|were)\\b', '\\bhave i (?:already|ever)\\b', '\\bin the past\\b',
  '\\b(?:hui|hua|hue) (?:thi|tha|the)\\b', '\\bhoyechh?ilo\\b', '\\bhoyechh?ilo\\b',
  'हुई थी', 'हुआ था', 'हुए थे', 'हो गई थी', 'হয়েছিল', 'হয়েছিল', 'হয়েছিলো', 'হয়েছিলো', 'ছিল কি', 'ছিলো কি',
].join('|'), 'i');

const EXACT = new RegExp([
  '\\bexact(?:ly)? (?:date|day|time)\\b', '\\bwhich (?:day|date)\\b', '\\bwhat (?:day|date)\\b', '\\bspecific (?:date|day)\\b',
  '\\bdate and time\\b', '\\bta(?:a|ri)ri?kh\\b', '\\bkis din\\b', '\\bkon(?:o)? din\\b', '\\bkon tarikh\\b',
  'किस दिन', 'कौन सी तारीख', 'कौनसी तारीख', 'सही तारीख', 'तारीख', 'সঠিক তারিখ', 'কোন তারিখ', 'কোন দিন', 'তারিখ',
].join('|'), 'i');

const EXTRA_TIMING = new RegExp([
  '\\bthis year\\b', '\\bnext year\\b', '\\bhow long\\b', '\\bkab tak\\b', '\\bis saal\\b', '\\bagle saal\\b', '\\bei bochh?or\\b',
  '\\bwill i ever\\b', '\\bsoon\\b', 'इस साल', 'अगले साल', 'कब तक', 'এই বছর', 'সামনের বছর', 'আগামী বছর', 'কতদিনে', 'কত দিনে',
].join('|'), 'i');

const DEATH = new RegExp([
  '\\bwill i (?:have|meet with) an? accident\\b', '\\baccident (?:yog|in my chart)\\b', '\\bhow long will (?:my |his |her )?\\w+ live\\b', '\\bkotodin banchben\\b', '\\bkotodin bachben\\b',
  '\\bmaut kab likhi\\b', '\\bmeri maut\\b', '\\bayu kitni\\b', 'कब तक जीएंगे', 'कितने दिन जिएंगे', 'দুর্ঘটনা হবে', 'কতদিন বাঁচবেন', 'আর কতদিন বাঁচ',
  '\\bwill i die\\b', '\\b(?:am i going to|could i) die\\b', '\\bdie (?:young|early|in an? \\w+)\\b', '\\bmar jaunga\\b', '\\bmore jabo\\b',
  'मर जाऊंगा', 'मर जाऊँगा', 'मर जाऊंगी', 'मारा जाऊंगा', 'মরে যাব', 'মারা যাব',
  '\\bwhen will i die\\b', '\\bhow long will i live\\b', '\\b(?:my|his|her) (?:death|lifespan|life span)\\b', '\\bdeath (?:date|time|year)\\b',
  '\\bwhen will (?:my )?\\w+ die\\b', '\\bmaut kab\\b', '\\bmrityu\\b', '\\bkobe morbo\\b', '\\bkobe mara\\b',
  'मौत कब', 'मृत्यु कब', 'कब मरूंगा', 'कब मरूँगा', 'कब मरूंगी', 'आयु कितनी', 'कितने साल जीऊंगा', 'মৃত্যু কবে', 'কবে মারা', 'কবে মরব', 'আয়ু কত', 'আয়ু কত',
].join('|'), 'i');

// ─── Answer kind, ask, clarification ─────────────────────────────────────────

const rx = (parts: string[]) => new RegExp(parts.join('|').normalize('NFC'), 'i');

const WHY = rx(['\\bwhy\\b', '\\bkyu?o?n\\b', '\\bkyun\\b', '\\bkeno\\b', '\\bkeno\\b', 'क्यों', 'क्यूं', 'क्यूँ', 'কেন']);

const CHOICE = rx([
  '\\bwhich\\b', '\\bwhat (?:fields?|domains?|lines?|sectors?|industr(?:y|ies)|careers?|jobs?|roles?|professions?|course|subjects?|stream|branch|city|country|place)\\b',
  '\\bwhat (?:kind|type|sort) of (?:work|jobs?|careers?|roles?|business|course|studies|degree)\\b',
  '\\bwhat should i (?:study|choose|pick|take|become|apply|do (?:as|for) (?:a )?(?:career|job|living))\\b',
  '\\b(?:best|right|suitable|ideal) (?:fields?|domains?|careers?|roles?|lines?|professions?|course|subjects?|stream|city|country|place)\\b',
  '\\bwhere (?:will|would|should|can|do|am|is)\\b', '\\bsuits? me\\b', '\\bsuited (?:to|for) me\\b', '\\bgood fit\\b', '\\bright fit\\b',
  '\\b(?:should|shall|can) i\\b.*\\bor\\b', '\\b(?:business|job|naukri|chakri) (?:or|ya|naki|vs\\.?) (?:business|job|naukri|chakri|vyapar|byabsa)\\b',
  '\\b(?:kaun ?sa|kaun ?si|kaun ?se|konsa|konsi|kon ?sa|kis (?:field|line|kshetra|tarah k[ae]|type k[ae]))\\b', '\\bkon (?:line|field|chakri|kaj|bishoy|subject|dik)\\b', '\\bkin (?:roles?|fields?|jobs?|companies)\\b',
  'किन ', 'किस ', 'कौन सा', 'कौन सी', 'कौन से', 'कौनसा', 'कौनसी', 'कौन-सा', 'कौन-सी', 'किस क्षेत्र', 'किस फील्ड', 'किस फ़ील्ड', 'किस लाइन', 'किस तरह का काम',
  'कोन सा', 'किस तरह', 'किस प्रकार', 'कहाँ', 'कहां', 'चाहिए या ', 'या नौकरी', 'या व्यापार', 'या बिज़नेस', 'या बिजनेस',
  'কোন ', 'কোনটা', 'কোনটি', 'কী ধরনের', 'কি ধরনের', 'কোন ধরনের', 'কোথায়', 'কোথা থেকে', 'কী নিয়ে', 'কি নিয়ে', 'কী নিয়ে', 'কি নিয়ে', 'নাকি',
]);

const NATURE = rx([
  '\\bwhat (?:kind|type|sort) of\\b', '\\bhow (?:will|would) (?:my|be)\\b', '\\bhow is my\\b', '\\bwhat (?:will|would) my \\w+(?: \\w+)? be like\\b',
  '\\bdescribe\\b', '\\b(?:nature|personality|character|temperament|strengths?|weakness(?:es)?|talents?|qualities|good at|gifts?)\\b',
  '\\bwhat am i\\b', '\\bwho am i\\b', '\\bwhat (?:is|are) my\\b',
  '\\bkaisa\\b', '\\bkaisi\\b', '\\bkaise (?:hog|hon)', '\\bswabhav\\b', '\\bkemon\\b', '\\bshobhab\\b',
  'कैसा', 'कैसी', 'कैसे होंगे', 'कैसे होगें', 'स्वभाव', 'खूबी', 'खूबियाँ', 'खूबियां', 'ख़ूबी', 'खूबियाँ', 'खूबियां', 'कमज़ोरी', 'कमजोरी', 'ताकत', 'ताक़त', 'प्रतिभा',
  'কেমন', 'স্বভাব', 'গুণ', 'দুর্বলতা', 'প্রতিভা', 'শক্তির দিক',
]);

const ADVICE = rx([
  '\\bhow (?:can|do|should|could|to|would) (?:i|we)\\b', '\\bhow to\\b', '\\bwhat (?:should|can|could|must) (?:i|we) do\\b', '\\bwhat to do\\b',
  '\\btips?\\b', '\\badvice\\b', '\\bremed(?:y|ies)\\b', '\\bimprove\\b', '\\bincrease\\b', '\\bboost\\b', '\\bgrow my\\b', '\\bget better\\b',
  '\\bkaise\\b', '\\bkya kar(?:u|un|oon|na chahiye)\\b', '\\bupay\\b', '\\bupaay\\b', '\\bkivabe\\b', '\\bki ?bhabe\\b', '\\bki korbo\\b', '\\bki kora uchit\\b',
  'कैसे', 'उपाय', 'क्या करूँ', 'क्या करूं', 'क्या करना चाहिए', 'सुधार', 'बढ़ा',
  'কীভাবে', 'কিভাবে', 'কী ভাবে', 'কি ভাবে', 'কেমন করে', 'উপায়', 'উপায়', 'কী করা উচিত', 'কি করা উচিত', 'কী করব', 'কি করব', 'বাড়া',
]);

const YESNO = rx([
  '^\\s*(?:will|would|can|could|should|shall|is|are|am|do|does|have|has)\\b', '\\b(?:will|can|should|shall) i\\b', '\\bam i\\b', '\\bis (?:it|there)\\b',
  '\\bkya (?:mujhe|meri|mera|mere|main|mai|hum)\\b', '\\b(?:hoga|hogi|milega|milegi) (?:kya|ki nahi)\\b', '\\b(?:hobe|pabo|parbo) (?:ki|kina)\\b',
  // Banglish "… ki ferot pabo?", "… ki hobe?" (the particle ki before the verb).
  '\\bki\\b[^?]{0,30}\\b(?:pabo|hobe|parbo|korbe|debe|asbe|milbe)\\b\\s*\\??\\s*$',
  '^\\s*क्या ', 'क्या मुझे', 'क्या मैं', 'क्या मेरी', 'क्या मेरा', 'होगा या नहीं', 'होगी या नहीं', 'मिलेगी या नहीं',
  'আমার কি ', 'আমি কি ', 'হবে কি', 'পাব কি', 'পাবো কি', 'পারব কি', 'পারবো কি', 'হবে কিনা', 'কি\\s*[?？]\\s*$',
]);

/** "Like I'm asking which domain?", "No, I mean…", "what about…", "मेरा मतलब…", "মানে…". */
const CLARIFY = rx([
  "^\\s*(?:like|i mean|i meant|no+|nope|not that|not when|i'?m asking|i am asking|i was asking|i asked|my question (?:is|was)|what about|and what about|how about|i want to know|i wanted to know|actually|rather|instead)\\b",
  "\\b(?:i'?m|i am|i was) asking\\b", '\\bi mean\\b', '\\bnot (?:the )?(?:timing|time|when|date)\\b', "\\bi didn'?t ask (?:when|about)\\b",
  '^\\s*(?:matlab|mera matlab|mtlb|mane|mani|ami bolchi|ami jante chai(?:chi)?|nahi|na)\\b', '\\bpuch (?:raha|rahi) (?:hu|hoon|hun)\\b',
  '^\\s*(?:मतलब|मेरा मतलब|नहीं|ना)', '^\\s*और [^?]*के बारे में', 'मेरा सवाल', 'मैं पूछ रहा', 'मैं पूछ रही', 'समय नहीं',
  '^\\s*(?:মানে|না[,।\\s])', '^\\s*আর [^?]*[?]', 'আমি জানতে চাইছি', 'আমি জানতে চাই', 'আমি বলছি', 'আমার প্রশ্ন', 'আমি জিজ্ঞেস করছি', 'সময় না',
]);

const ASK_WORDS: [Ask, RegExp][] = [
  ['businessVsJob', rx([
    '\\b(?:business|vyapar|byabsa|startup)\\b.*\\b(?:or|ya|naki|vs\\.?|versus)\\b.*\\b(?:job|naukri|chakri|service)\\b',
    '\\b(?:job|naukri|chakri|service)\\b.*\\b(?:or|ya|naki|vs\\.?|versus)\\b.*\\b(?:business|vyapar|byabsa|startup)\\b',
    '(?:व्यापार|बिज़नेस|बिजनेस|धंधा).*(?:या|अथवा).*(?:नौकरी|जॉब)', '(?:नौकरी|जॉब).*(?:या|अथवा).*(?:व्यापार|बिज़नेस|बिजनेस|धंधा)',
    '(?:ব্যবসা).*(?:নাকি|না|বা|অথবা).*(?:চাকরি)', '(?:চাকরি).*(?:নাকি|না|বা|অথবা).*(?:ব্যবসা)',
    '\\bsuited for business\\b', '\\bgood (?:for|at) business\\b', '\\bshould i (?:start|do) (?:a |my own )?business\\b',
  ])],
  ['strengths', rx([
    '\\b(?:strengths?|weakness(?:es)?|talents?|good at|gifts?|personality|nature|temperament|character)\\b', '\\bwho am i\\b',
    '\\bswabhav\\b', '\\bshobhab\\b', 'स्वभाव', 'खूबी', 'खूबियाँ', 'खूबियां', 'ख़ूबी', 'कमज़ोरी', 'कमजोरी', 'ताकत', 'ताक़त', 'प्रतिभा', 'স্বভাব', 'গুণ', 'দুর্বলতা', 'প্রতিভা',
  ])],
  ['careerField', rx([
    '\\b(?:fields?|domains?|roles?|sectors?|industr(?:y|ies)|lines? of work|professions?|occupation|careers?|kind of (?:work|job)|type of (?:work|job))\\b',
    '\\bwhich (?:job|company|companies)\\b', '\\bwhat (?:job|work)\\b', '\\bapply (?:for|to)\\b', '\\bsuits? me\\b', '\\bpesha\\b',
    'पेशा', 'पेशे', 'फील्ड', 'फ़ील्ड', 'क्षेत्र', 'डोमेन', 'रोल', 'लाइन', 'करियर', 'कैरियर', 'किस तरह का काम', 'कौन सी नौकरी', 'कौन सा काम',
    'পেশা', 'ফিল্ড', 'ক্ষেত্র', 'ডোমেন', 'রোল', 'লাইন', 'ক্যারিয়ার', 'কেরিয়ার', 'কোন চাকরি', 'কোন কাজ', 'কী কাজ', 'কি কাজ',
  ])],
  ['partner', rx([
    '\\b(?:partner|spouse|wife|husband|life ?partner|soul ?mate|bride|groom|jeevan ?sathi|patni|pati|bou|bor)\\b', '\\bwho will i marry\\b',
    '\\b(?:love|arranged) (?:or|vs\\.?) (?:love|arranged)\\b',
    'जीवनसाथी', 'जीवन साथी', 'पत्नी', 'पति', 'साथी', 'জীবনসঙ্গী', 'স্ত্রী', 'স্বামী', 'বউ', 'বর', 'সঙ্গী',
  ])],
  ['moneySources', rx([
    '\\b(?:earn|earning|income|source of (?:money|income)|side income|money|wealth|rich|invest\\w*|savings?|kamai|paisa|taka)\\b',
    'कमाई', 'आमदनी', 'पैसा', 'पैसे', 'धन', 'निवेश', 'আয়', 'আয়', 'টাকা', 'রোজগার', 'বিনিয়োগ', 'বিনিয়োগ', 'অর্থ',
  ])],
  ['studyField', rx([
    '\\b(?:study|studies|course|subjects?|stream|branch|degree|masters|mba|phd|major|specializ\\w+|specialis\\w+|science|commerce|arts|engineering|medical)\\b',
    'पढ़ाई', 'पढ़ाई', 'विषय', 'कोर्स', 'डिग्री', 'स्ट्रीम', 'পড়াশোনা', 'পড়াশোনা', 'বিষয়', 'বিষয়', 'কোর্স', 'ডিগ্রি', 'স্ট্রিম',
  ])],
  ['relocation', rx([
    '\\b(?:abroad|foreign|overseas|settle|relocat\\w*|move|moving|shift|city|country|place to live|where should i live|videsh|bidesh)\\b',
    'विदेश', 'शहर', 'देश', 'बसना', 'बस जा', 'शिफ्ट', 'বিদেশ', 'শহর', 'দেশ', 'থিতু', 'শিফট',
  ])],
  ['wellbeing', rx([
    '\\b(?:health|healthy|fitness|fit|energy|sleep|stress|diet|body|habits?|sehat|swasthya)\\b',
    'सेहत', 'स्वास्थ्य', 'तबीयत', 'नींद', 'तनाव', 'স্বাস্থ্য', 'শরীর', 'ঘুম', 'মানসিক চাপ',
  ])],
];

/** A yes/no question form in any language ("Will I…?", "क्या …?", "… কি …?"), also when it asks "this year?". */
const YESNO_ANY = rx(['(?:^|[.?!]\\s+)(?:is|will|can|should|am|are|do|does|would)\\b', '\\bkya\\b(?! kar)', '(?:^|\\s)কি\\s(?!কর)', '(?:^|\\s)कि\\s', 'क्या', '\\b(?:hobe|pabo|parbo) to\\b', '\\bya nahi\\b', 'হবে তো']);
/** "What is …?" ends a question that is not yes/no ("मेरे जीवन का उद्देश्य क्या है?", "jibon er uddeshyo ki?"). */
const WHAT_IS = rx(['क्या (?:है|हैं)\\s*[?？]?\\s*$', '\\bkya (?:hai|hain)\\s*[?]?\\s*$', 'কী\\s*[?？]?\\s*$', 'কী কী\\s*[?？]?\\s*$']);
const WHAT_TO_DO = rx(['\\bki kor(?:bo|i)\\b', '\\bkya kar(?:u|un|oon|na)\\b', 'क्या करूँ', 'क्या करूं', 'क्या करना', 'কী করব', 'কি করব', 'কী করা', 'কি করা']);
export function isYesNo(question: string): boolean {
  const q = nfc(question);
  return !WHAT_TO_DO.test(q) && !WHAT_IS.test(q) && (YESNO.test(q) || YESNO_ANY.test(q));
}

/** Kind of answer a message wants (`timing` comes from the timing cues). */
export function answerKind(question: string, timing: boolean): AnswerKind {
  const q = nfc(question);
  if (timing) return 'timing';
  if (WHY.test(q)) return 'why';
  if (CHOICE.test(q)) return 'choice';
  if (NATURE.test(q)) return 'nature';
  if (ADVICE.test(q)) return 'advice';
  if (YESNO.test(q)) return 'yesno';
  return 'general';
}

/** A message that clarifies the previous question rather than asking a new one. */
export function isClarification(question: string): boolean {
  return CLARIFY.test(nfc(question));
}

/** Topics whose non-timing questions map to an ask without a keyword (topic → ask). */
const TOPIC_ASK: Partial<Record<IntentTopic, Ask>> = {
  job: 'careerField', promotion: 'careerField', business: 'businessVsJob', marriage: 'partner', love: 'partner',
  money: 'moneySources', education: 'studyField', foreign: 'relocation', health: 'wellbeing',
};

/**
 * The ask for a non-timing question: why-questions explain the current phase;
 * otherwise the first ask whose words the question uses (business-vs-job and
 * strengths before the broad career words), then the topic's own ask. Yes/no
 * questions only get an ask from explicit words ("should I do business or a
 * job?"); "will I get a job?" stays a topic question with its window.
 */
export function askOf(question: string, kind: AnswerKind, topic: IntentTopic | null): Ask | null {
  if (kind === 'timing') return null;
  if (kind === 'why') return 'whyNow';
  const q = nfc(question);
  const words = ASK_WORDS.filter(([, re]) => re.test(q)).map(([a]) => a);
  if (words.includes('businessVsJob')) return 'businessVsJob';
  if (kind === 'yesno') {
    if (words.includes('relocation') && (topic === 'foreign' || /\bsettle|बस|থিতু/.test(q))) return 'relocation';
    return null;
  }
  if (kind === 'general') return null;
  // "What will their nature be like?" in a partner thread describes the partner.
  if ((topic === 'marriage' || topic === 'love') && (kind === 'nature' || kind === 'choice')) return 'partner';
  if (words.includes('strengths') && (!topic || topic === 'general' || kind === 'nature')) return 'strengths';
  // The topic decides between overlapping words ("which course for my career" → study).
  const own = topic ? TOPIC_ASK[topic] : undefined;
  if (own && words.includes(own)) return own;
  if (words.length) return words[0];
  // "How can I improve my love life?" is advice, not a partner description.
  if (kind === 'advice' && own === 'partner') return null;
  return own ?? null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * The intent of `question`. `previousQuestions` (oldest first) lets a
 * topic-less follow-up ("When exactly?", "আর কবে?") inherit the thread's topic;
 * `facts` (thread-facts.ts) are what the user said earlier in the thread
 * ("I'm already married", "I meant my sister").
 */
export function classifyIntent(question: string, previousQuestions: string[] = [], facts: ThreadFacts = EMPTY_FACTS): Intent {
  const base = classifyBase(question, previousQuestions);
  const prevQ = previousQuestions[previousQuestions.length - 1];
  let prev: PrevTurn | null = null;
  if (prevQ) {
    const p = classifyIntent(prevQ, previousQuestions.slice(0, -1), facts);
    prev = { question: prevQ, category: p.category, resolved: p.resolved, topic: p.topic, safety: p.safety, kind: p.kind, chain: [p.resolved, ...(p.prev?.chain ?? [])] };
  }
  const stated = factsFromMessage(question, relationIn);
  // A correction re-asks the previous question about someone else: "I was asking about my sister".
  let subject = base.subject;
  if (stated.subject && stated.subject !== 'self') subject = { kind: 'other', relation: stated.subject };
  else if (stated.subject === 'self') subject = { kind: 'self' };
  else if (facts.subject && facts.subject !== 'self' && subject.kind === 'self' && !FIRST_PERSON_RE.test(nfc(question))) {
    subject = { kind: 'other', relation: facts.subject };
  }
  let topic = base.topic;
  let inherited = base.inherited;
  // "I was asking about my sister, not me" carries no topic of its own: the previous one.
  if (stated.subject && prev?.topic && (!topic || inherited)) { topic = prev.topic; inherited = true; }
  const cat = categorize({
    question, topic, inherited, kind: base.kind, ask: base.ask, timing: base.timing, past: base.past, exactDate: base.exactDate,
    subject, safety: base.safety, clarifies: base.clarifies, stated, prev, facts,
  });
  const past = base.past || cat.category === 'past_event_verification';
  // A family-dynamics question ("will my brother support me?") reads the user's own chart (the sibling / parent houses).
  if (cat.category === 'family_parents_siblings' || cat.resolved === 'family_parents_siblings') subject = { kind: 'self' };
  return { ...base, topic, inherited, subject, past, category: cat.category, resolved: cat.resolved, followUp: cat.followUp, flags: cat.flags, stated, prev };
}

/** First-person words: an explicit "I / my / मैं / আমি" question is about the user even after a subject correction. */
const FIRST_PERSON_RE = /\b(?:i|i'm|i'll|me|my|mine|main|mai|mujhe|mera|meri|mere|ami|amar|amake)\b|मैं|मुझे|मेरा|मेरी|मेरे|আমি|আমার|আমাকে/i;

/** The relation a message names after "my" (for subject corrections). */
export function relationIn(q: string): Relation | null {
  const ws = words(nfc(q).replace(/'s\b/g, ''));
  for (let k = 0; k < ws.length; k++) {
    const r = relationOfWord(ws[k]);
    if (r && [ws[k - 1], ws[k - 2]].some(w => w && POSSESSIVE.has(w))) return r;
  }
  return null;
}

type BaseIntent = Omit<Intent, 'category' | 'resolved' | 'followUp' | 'flags' | 'stated' | 'prev'>;

function classifyBase(question: string, previousQuestions: string[] = []): BaseIntent {
  const q = nfc(question);
  const clauses = q.split(CLAUSE_SPLIT).map(c => c.trim()).filter(Boolean);
  const score = new Map<IntentTopic, { w: number; at: number }>();
  const alreadyHave: IntentTopic[] = [];
  const negated: IntentTopic[] = [];
  let offset = 0;
  for (const c of clauses) {
    const hits = topicHits(c);
    const done = ALREADY.test(c);
    const neg = !done && NEGATED.test(c);
    const asks = QUESTION_CUE.test(c) || isTimingQuestion(c);
    for (const [t, h] of hits) {
      if (done) { if (!alreadyHave.includes(t)) alreadyHave.push(t); continue; }
      if (neg) { if (!negated.includes(t)) negated.push(t); continue; }
      const w = h.w * (asks ? 2 : 1);
      const cur = score.get(t);
      score.set(t, cur ? { w: cur.w + w, at: cur.at } : { w, at: offset + h.at });
    }
    offset += c.length + 1;
  }
  // A clause like "I'm married" that only states a fact still counts if the
  // question names nothing else: "I'm married. Will it last?" → marriage.
  if (score.size === 0 && alreadyHave.length) score.set(alreadyHave[0], { w: 1, at: 0 });

  const ranked = [...score.entries()].sort((a, b) => b[1].w - a[1].w || a[1].at - b[1].at).map(([t]) => t);
  // Chart words ("Saturn", "dasha") mixed with a life topic: "when will Saturn
  // help my career" is a career question; "when does my sade sati end" is chart.
  let topic: IntentTopic | null = ranked[0] ?? null;
  if (topic === 'chart' && ranked[1] && ranked[1] !== 'chart') {
    const life = score.get(ranked[1])!.w;
    if (life >= 3) topic = ranked[1];
  }
  let inherited = false;
  if (!topic) {
    for (const prev of [...previousQuestions].reverse()) {
      const p = classifyBase(prev);
      if (p.topic) { topic = p.topic; inherited = true; break; }
    }
  }
  const timing = isTimingQuestion(question) || EXTRA_TIMING.test(q) || EXACT.test(q);
  let kind = answerKind(question, timing);
  let ask = askOf(question, kind, topic);
  // "Like I'm asking which domain?": re-read the previous question with the
  // clarification (its topic / kind / ask fill what this message leaves out).
  const prevQ = previousQuestions[previousQuestions.length - 1];
  const clarifies = !!prevQ && isClarification(question);
  if (clarifies) {
    const prev = classifyBase(prevQ, previousQuestions.slice(0, -1));
    if ((!topic || inherited) && prev.topic) { topic = prev.topic; inherited = true; }
    if ((kind === 'general' || kind === 'yesno') && prev.kind !== 'timing') kind = prev.kind;
    ask = askOf(question, kind, topic) ?? (kind === prev.kind || kind === 'general' ? prev.ask : null)
      ?? askOf(`${prevQ} ${question}`, kind, topic);
  }
  const canned = cannedQuestion(question);
  const safety: SafetyClass = isCrisisMessage(question) ? 'crisis' : canned ?? (DEATH.test(q) ? 'death' : null);
  return {
    topic,
    secondary: ranked.filter(t => t !== topic),
    timing,
    past: PAST.test(q),
    exactDate: EXACT.test(q),
    subject: subjectOf(q, topic),
    alreadyHave,
    negated,
    inherited,
    safety,
    advice: adviceNeeded(question),
    kind,
    ask,
    clarifies,
  };
}

/** Relation words (any language) that a profile's free-text relationship may use. */
export function relationMatches(relationship: string | null | undefined, relation: Relation): boolean {
  if (!relationship) return false;
  const ws = words(nfc(relationship));
  return ws.some(w => relationOfWord(w) === relation);
}
