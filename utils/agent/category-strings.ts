/**
 * Localized sentences for the Stage 2 categories (utils/agent/routes.ts):
 * safety and professional lines, declines, the follow-up sentences and the
 * feature routes (muhurat, lucky values, compatibility, chart facts). Like
 * ./strings.ts and ./ask-strings.ts: pure, en / hi / bn, plain language (no
 * house numbers, sign names or dasha labels unless the user used the term;
 * planets named by what they stand for). Placeholders in {braces}; digits are
 * Western here and localized when the template finishes a sentence.
 *
 * Wording is chosen so the shared check vocabulary (./checks.ts) recognises
 * each line in every language: a doctor line names a doctor, a counsellor
 * line a counsellor or a trusted person, likelihood lines use the ladder of
 * rules.md §1.9 (strong / reasonable / slower).
 */
import type { L3 } from './ask-strings';

export const C = {
  // ─── Feelings, likelihood, professionals ──────────────────────────────────
  validation: {
    en: 'I know this has been a hard time.',
    hi: 'मैं समझ सकता हूँ, यह समय आसान नहीं रहा।',
    bn: 'বুঝতে পারছি, সময়টা সহজ যাচ্ছে না।',
  },
  validationWait: {
    en: 'I know the wait has been hard.',
    hi: 'मैं समझ सकता हूँ, इतना इंतज़ार आसान नहीं।',
    bn: 'বুঝতে পারছি, এতদিনের অপেক্ষা সহজ নয়।',
  },
  likelyStrong: {
    en: 'The chart gives this a strong chance, though nothing is guaranteed.',
    hi: 'चार्ट में इसकी मज़बूत संभावना दिखती है, हालाँकि कुछ भी पक्का नहीं होता।',
    bn: 'চার্টে এর জোরালো সম্ভাবনা দেখা যায়, যদিও কিছুই নিশ্চিত নয়।',
  },
  likelyModerate: {
    en: 'The chart gives this a reasonable chance, and it grows with steady effort.',
    hi: 'चार्ट में इसकी अच्छी संभावना है, और लगातार मेहनत से यह और बढ़ती है।',
    bn: 'চার্টে এর ভালো সম্ভাবনা আছে, আর টানা চেষ্টায় তা আরও বাড়ে।',
  },
  likelyWeak: {
    en: 'This comes slowly rather than quickly in your chart, so steady effort matters more here.',
    hi: 'आपके चार्ट में यह जल्दी नहीं, धीरे-धीरे होता दिखता है, इसलिए यहाँ लगातार मेहनत ज़्यादा काम आएगी।',
    bn: 'আপনার চার্টে এটা তাড়াতাড়ি নয়, ধীরে ধীরে হতে দেখা যায়, তাই এখানে টানা চেষ্টাই বেশি কাজে দেবে।',
  },
  deathCare: {
    en: 'Please stay close to their doctors, and look after your own rest too.',
    hi: 'उनके डॉक्टरों के संपर्क में रहें, और अपनी नींद व आराम का भी ध्यान रखें।',
    bn: 'ওঁর ডাক্তারদের সঙ্গে যোগাযোগ রাখুন, আর নিজের ঘুম ও বিশ্রামের দিকেও খেয়াল রাখুন।',
  },
  /** Legal yes/no (rules.md §5.23: a supportive period for the case, never the verdict). */
  legalStrong: {
    en: 'Your chart shows a supportive period for the case, though the outcome rests on the facts and your lawyer.',
    hi: 'आपके चार्ट में इस मामले के लिए सहायक समय दिखता है, हालाँकि फ़ैसला तथ्यों और आपके वकील की तैयारी पर टिका है।',
    bn: 'আপনার চার্টে মামলার জন্য সহায়ক সময় দেখা যায়, যদিও রায় নির্ভর করে তথ্য আর আপনার উকিলের প্রস্তুতির ওপর।',
  },
  legalModerate: {
    en: 'Your chart shows reasonable support for the case; the facts and a good lawyer matter most.',
    hi: 'आपके चार्ट में इस मामले को ठीक-ठाक साथ मिलता दिखता है; सबसे ज़्यादा मायने तथ्यों और अच्छे वकील के हैं।',
    bn: 'আপনার চার্টে মামলার জন্য মোটামুটি সমর্থন দেখা যায়; সবচেয়ে জরুরি তথ্য আর একজন ভালো উকিল।',
  },
  legalWeak: {
    en: 'Your chart shows a slower stretch for the case, so patience and a good lawyer matter most.',
    hi: 'आपके चार्ट में इस मामले के लिए धीमा समय दिखता है, इसलिए धैर्य और अच्छे वकील की सबसे ज़्यादा ज़रूरत है।',
    bn: 'আপনার চার্টে মামলার জন্য ধীর সময় দেখা যায়, তাই ধৈর্য আর একজন ভালো উকিলই সবচেয়ে জরুরি।',
  },
  /** "Is medicine right for me?": how the named field sits among the chart's study fits. */
  fitStrong: {
    en: 'Yes, {option} is among the strongest fits in your chart.',
    hi: 'हाँ, {option} आपके चार्ट के सबसे अच्छे विकल्पों में से है।',
    bn: 'হ্যাঁ, {option} আপনার চার্টের সবচেয়ে মানানসই বিষয়গুলোর মধ্যে পড়ে।',
  },
  fitModerate: {
    en: '{option} can work for you, though it is not your chart\'s first pick.',
    hi: '{option} आपके लिए ठीक रह सकता है, हालाँकि यह आपके चार्ट की पहली पसंद नहीं है।',
    bn: '{option} আপনার জন্য চলতে পারে, যদিও এটা আপনার চার্টের প্রথম পছন্দ নয়।',
  },
  fitWeak: {
    en: '{option} is not among the stronger fits in your chart; other fields come out ahead.',
    hi: '{option} आपके चार्ट के मज़बूत विकल्पों में नहीं है; दूसरे क्षेत्र आगे दिखते हैं।',
    bn: '{option} আপনার চার্টের জোরালো বিষয়গুলোর মধ্যে নেই; অন্য বিষয়গুলো এগিয়ে।',
  },
  /** A yes/no answer's window in one short sentence (when the full timing paragraph is off). */
  windowShort: {
    en: 'The most supportive stretch is {start} to {end}.',
    hi: 'सबसे सहायक समय {start} से {end} तक है।',
    bn: 'সবচেয়ে সহায়ক সময় {start} থেকে {end}।',
  },
  /** "That's too far / why so late?" when the window is actually near. */
  fuNotFar: {
    en: "It's actually close: the window opens in {start}, so start preparing now.",
    hi: 'असल में यह दूर नहीं है: अच्छा समय {start} में शुरू हो रहा है, इसलिए अभी से तैयारी शुरू करें।',
    bn: 'আসলে এটা দূরে নয়: ভালো সময় শুরু হচ্ছে {start}-এ, তাই এখন থেকেই প্রস্তুতি শুরু করুন।',
  },
  documents: {
    en: 'The final decision rests on your documents and the rules, so keep them complete and consistent.',
    hi: 'आख़िरी फ़ैसला आपके कागज़ात और नियमों पर होता है, इसलिए कागज़ात पूरे और सही रखें।',
    bn: 'শেষ সিদ্ধান্ত নির্ভর করে আপনার কাগজপত্র আর নিয়মের ওপর, তাই কাগজপত্র সম্পূর্ণ আর ঠিকঠাক রাখুন।',
  },
  lawyer: {
    en: 'Please keep a lawyer closely involved; they can guide every legal step.',
    hi: 'कृपया किसी वकील को साथ रखें; हर कानूनी कदम पर वही सही राह दिखा सकते हैं।',
    bn: 'অনুগ্রহ করে একজন উকিলকে পাশে রাখুন; প্রতিটি আইনি পদক্ষেপে তিনিই পথ দেখাবেন।',
  },
  counsellor: {
    en: 'Talking it through with a counsellor or someone you trust can really help.',
    hi: 'किसी काउंसलर या भरोसेमंद व्यक्ति से खुलकर बात करना सच में मदद करता है।',
    bn: 'একজন কাউন্সেলর বা বিশ্বস্ত কারও সঙ্গে খোলাখুলি কথা বললে সত্যিই সাহায্য হয়।',
  },
  teleManas: {
    en: 'If it ever feels like too much, Tele-MANAS (14416) is free and confidential.',
    hi: 'अगर कभी बहुत भारी लगे, तो टेली-मानस (14416) मुफ़्त और गोपनीय है।',
    bn: 'কখনও খুব ভারী লাগলে টেলি-মানস (14416) বিনামূল্যে আর গোপনে কথা বলার সুযোগ দেয়।',
  },
  finAdviser: {
    en: 'For a big money decision, a financial adviser can help you plan it safely.',
    hi: 'बड़े आर्थिक फ़ैसले के लिए किसी वित्तीय सलाहकार की मदद से योजना बनाएँ।',
    bn: 'বড় আর্থিক সিদ্ধান্তের জন্য একজন আর্থিক পরামর্শদাতার সাহায্যে পরিকল্পনা করুন।',
  },
  doctor: {
    en: 'For anything medical, please see a doctor.',
    hi: 'किसी भी बीमारी के लिए डॉक्टर से ज़रूर मिलें।',
    bn: 'শরীরের কোনো সমস্যায় অবশ্যই ডাক্তার দেখান।',
  },
  doctorFertility: {
    en: 'Alongside this, please keep working with your doctor or a fertility specialist; they can guide the medical side best.',
    hi: 'इसके साथ अपने डॉक्टर या फ़र्टिलिटी विशेषज्ञ की सलाह लेते रहें; चिकित्सा से जुड़ी बातें वही सबसे अच्छी तरह समझा सकते हैं।',
    bn: 'এর পাশাপাশি আপনার ডাক্তার বা ফার্টিলিটি বিশেষজ্ঞের পরামর্শ নিতে থাকুন; চিকিৎসার দিকটা তাঁরাই সবচেয়ে ভালো বোঝাবেন।',
  },
  emergency: {
    en: 'What you describe needs medical care now: please call 112 or go to the nearest hospital or doctor right away. A chart can never judge this, and it should not wait.',
    hi: 'आप जो बता रहे हैं, उसमें तुरंत इलाज की ज़रूरत है: अभी 112 पर कॉल करें या सबसे पास के अस्पताल या डॉक्टर के पास जाएँ। चार्ट से इसका अंदाज़ा कभी नहीं लगाया जा सकता, और इसमें देर नहीं करनी चाहिए।',
    bn: 'আপনি যা বলছেন তাতে এখনই চিকিৎসা দরকার: এখনই 112-এ ফোন করুন বা কাছের হাসপাতাল বা ডাক্তারের কাছে যান। চার্ট দিয়ে এটা কখনও বিচার করা যায় না, আর এতে দেরি করা ঠিক নয়।',
  },
  abuseSafety: {
    en: "Your safety comes first. If you are in danger, call 112 or the women's helpline 181, and reach out to someone you trust. No chart reading should keep you in harm's way, and none of this is your fault.",
    hi: 'आपकी सुरक्षा सबसे पहले है। अगर आप ख़तरे में हैं, तो 112 या महिला हेल्पलाइन 181 पर कॉल करें, और किसी भरोसेमंद व्यक्ति से बात करें। कोई भी ग्रह-गणना आपको ख़तरे में रहने की वजह न बने, और इसमें आपकी कोई ग़लती नहीं है।',
    bn: 'আপনার নিরাপত্তাই আগে। বিপদে থাকলে 112 বা মহিলা হেল্পলাইন 181-এ ফোন করুন, আর বিশ্বস্ত কারও সঙ্গে কথা বলুন। কোনো গ্রহের হিসেব যেন আপনাকে বিপদের মধ্যে রেখে না দেয়, আর এতে আপনার কোনো দোষ নেই।',
  },
  abuseCounsellor: {
    en: 'A counsellor can also help you plan your next steps safely, at your own pace.',
    hi: 'कोई काउंसलर आपके अगले कदम सुरक्षित तरीके से, आपकी अपनी रफ़्तार से तय करने में मदद कर सकता है।',
    bn: 'একজন কাউন্সেলর আপনার পরের পদক্ষেপগুলো নিরাপদে, নিজের মতো করে ঠিক করতে সাহায্য করতে পারেন।',
  },
  noBlame: {
    en: "This isn't about anyone being at fault.",
    hi: 'इसमें किसी की ग़लती ढूँढ़ने की ज़रूरत नहीं।',
    bn: 'এতে কারও দোষ খোঁজার দরকার নেই।',
  },
  respectChoice: {
    en: 'The decision is yours to make, and it deserves time.',
    hi: 'फ़ैसला आपका अपना है, और इसके लिए समय लेना ठीक है।',
    bn: 'সিদ্ধান্তটা আপনার নিজের, আর এর জন্য সময় নেওয়াই ভালো।',
  },
  respectFaith: {
    en: 'Follow whatever fits your own beliefs; your choice matters more than any ritual.',
    hi: 'वही अपनाएँ जो आपकी अपनी आस्था से मेल खाए; किसी भी रस्म से ज़्यादा आपकी मर्ज़ी मायने रखती है।',
    bn: 'যেটা আপনার নিজের বিশ্বাসের সঙ্গে মেলে সেটাই নিন; কোনো আচার-অনুষ্ঠানের চেয়ে আপনার সিদ্ধান্তই বড়।',
  },
  ackCorrection: { en: 'Thanks for telling me.', hi: 'बताने के लिए धन्यवाद।', bn: 'জানানোর জন্য ধন্যবাদ।' },

  // ─── Small talk, scope, frustration ───────────────────────────────────────
  thanks: {
    en: "You're welcome, I'm glad it helped. Ask me anytime.",
    hi: 'आपका स्वागत है, ख़ुशी हुई कि यह काम आया। जब चाहें पूछिए।',
    bn: 'স্বাগত, কাজে লেগেছে জেনে খুশি হলাম। যখন খুশি জিজ্ঞেস করবেন।',
  },
  smalltalk: {
    en: "I'm well, thank you! I'm Saga, your astrology guide. Would you like to look at your career, your relationships, or how the coming year looks?",
    hi: 'मैं ठीक हूँ, धन्यवाद! मैं सागा हूँ, आपका ज्योतिष साथी। क्या आप अपने करियर, रिश्तों या आने वाले साल के बारे में जानना चाहेंगे?',
    bn: 'আমি ভালো আছি, ধন্যবাদ! আমি সাগা, আপনার জ্যোতিষ সঙ্গী। আপনার কাজ, সম্পর্ক বা সামনের বছরটা কেমন যাবে, তা নিয়ে জানতে চান?',
  },
  scope: {
    en: "That's outside what I can help with; I'm here for your chart. I can tell you about your career strengths or your best period this year, if you'd like.",
    hi: 'यह मेरे दायरे से बाहर है; मैं आपकी कुंडली के बारे में बात करने के लिए हूँ। चाहें तो आपके करियर की ताकत या इस साल के सबसे अच्छे समय के बारे में बता सकता हूँ।',
    bn: 'এটা আমার কাজের বাইরে; আমি আপনার কুষ্ঠি নিয়ে কথা বলার জন্য আছি। চাইলে আপনার কাজের জোরের দিক বা এই বছরের সবচেয়ে ভালো সময় নিয়ে বলতে পারি।',
  },
  gambling: {
    en: "I don't give lottery numbers or market tips: no chart can pick those, and betting money on them isn't safe.",
    hi: 'मैं लॉटरी नंबर या शेयर बाज़ार की टिप्स नहीं देता: कोई कुंडली यह नहीं बता सकती, और इस पर पैसा लगाना सुरक्षित नहीं।',
    bn: 'আমি লটারির নম্বর বা শেয়ার বাজারের টিপস দিই না: কোনো কুষ্ঠি এগুলো বলতে পারে না, আর এতে টাকা লাগানো নিরাপদ নয়।',
  },
  calm: {
    en: "Sorry that didn't help. Tell me what you'd like to know, for example which career fits you or when a change is likely, and I'll be specific.",
    hi: 'माफ़ कीजिए, यह जवाब काम नहीं आया। बताइए आप क्या जानना चाहते हैं, जैसे कौन सा करियर आपके लिए सही है या बदलाव कब संभव है, मैं साफ़-साफ़ बताऊँगा।',
    bn: 'দুঃখিত, উত্তরটা কাজে লাগল না। বলুন কী জানতে চান, যেমন কোন কাজ আপনার জন্য ঠিক বা পরিবর্তন কবে হতে পারে, আমি স্পষ্ট করে বলব।',
  },
  calmAsk: {
    en: "I'm here to help. Ask me anything about your chart, for example which career fits you or when a change is likely.",
    hi: 'मैं मदद के लिए हूँ। अपनी कुंडली के बारे में कुछ भी पूछिए, जैसे कौन सा करियर आपके लिए सही है या बदलाव कब संभव है।',
    bn: 'আমি সাহায্য করতে আছি। আপনার কুষ্ঠি নিয়ে যা খুশি জিজ্ঞেস করুন, যেমন কোন কাজ আপনার জন্য ঠিক বা পরিবর্তন কবে হতে পারে।',
  },
  /** "Is marriage even in my chart?": yes first (the engine always finds a window; never "not in your chart"). */
  marriageYes: {
    en: 'Yes, marriage is clearly shown in your chart; the question is timing, not whether.',
    hi: 'हाँ, आपके चार्ट में शादी साफ़ दिखती है; सवाल सिर्फ़ समय का है, होने या न होने का नहीं।',
    bn: 'হ্যাঁ, আপনার চার্টে বিয়ে স্পষ্ট দেখা যায়; প্রশ্নটা শুধু সময়ের, হবে কি না তার নয়।',
  },
  calmShort: {
    en: "Sorry if that wasn't clear; here it is more simply.",
    hi: 'माफ़ कीजिए अगर बात साफ़ नहीं थी; सीधे शब्दों में कहूँ तो:',
    bn: 'দুঃখিত, কথাটা স্পষ্ট না হয়ে থাকলে সহজ করে বলি:',
  },

  // ─── Declines and policies ────────────────────────────────────────────────
  identity: {
    en: "A chart doesn't decide things like caste, complexion, religion or who you love, and I'd rather not guess at them.",
    hi: 'जाति, रंग, धर्म या आप किससे प्यार करेंगे, यह कुंडली तय नहीं करती, और मैं इनका अंदाज़ा नहीं लगाऊँगा।',
    bn: 'জাত, গায়ের রং, ধর্ম বা আপনি কাকে ভালোবাসবেন, তা কুষ্ঠি ঠিক করে না, আর আমি এসব আন্দাজও করব না।',
  },
  identityAlt: {
    en: "What it can show is your partner's nature and where you're likely to meet.",
    hi: 'हाँ, यह ज़रूर बताया जा सकता है कि आपका साथी स्वभाव से कैसा होगा और मुलाकात कहाँ होने की संभावना है।',
    bn: 'তবে আপনার সঙ্গী স্বভাবে কেমন হবেন আর কোথায় দেখা হতে পারে, তা বলা যায়।',
  },
  identitySelf: {
    en: 'Who you are and who you love is yours to define; a chart doesn\'t decide it, and every answer is respected here. If you like, I can look at your relationships or the year ahead.',
    hi: 'आप कौन हैं और किससे प्यार करते हैं, यह आप खुद तय करते हैं; कुंडली यह तय नहीं करती, और यहाँ हर जवाब का सम्मान है। चाहें तो मैं आपके रिश्तों या आने वाले साल के बारे में बता सकता हूँ।',
    bn: 'আপনি কে আর কাকে ভালোবাসেন, তা আপনিই ঠিক করেন; কুষ্ঠি তা ঠিক করে না, আর এখানে প্রতিটি উত্তরই সম্মানের। চাইলে আপনার সম্পর্ক বা সামনের বছর নিয়ে বলতে পারি।',
  },
  name: {
    en: "A chart can't show anyone's name or initial, so I won't guess one.",
    hi: 'कुंडली से किसी का नाम या पहला अक्षर पता नहीं चलता, इसलिए मैं अंदाज़ा नहीं लगाऊँगा।',
    bn: 'কুষ্ঠি থেকে কারও নাম বা নামের প্রথম অক্ষর জানা যায় না, তাই আমি আন্দাজ করব না।',
  },
  childSexWhy: {
    en: "I don't predict a baby's sex, even for fun: in India finding it out before birth isn't allowed, because it has been misused for sex selection, and no chart can show it anyway.",
    hi: 'मैं बच्चे का लिंग नहीं बताता, मज़ाक में भी नहीं: भारत में जन्म से पहले यह जानना क़ानूनन मना है, क्योंकि इसका ग़लत इस्तेमाल हुआ है, और कोई कुंडली इसे दिखा भी नहीं सकती।',
    bn: 'আমি শিশুর লিঙ্গ বলি না, মজা করেও না: ভারতে জন্মের আগে তা জানা আইনত নিষিদ্ধ, কারণ এর অপব্যবহার হয়েছে, আর কোনো কুষ্ঠি তা দেখাতেও পারে না।',
  },
  childSexAlt: {
    en: "I'm happy to look at the coming months for your family and home instead.",
    hi: 'इसके बजाय मैं आपके परिवार और घर के आने वाले महीनों के बारे में ख़ुशी से बता सकता हूँ।',
    bn: 'বরং আপনার পরিবার আর ঘরের সামনের মাসগুলো নিয়ে আনন্দের সঙ্গে বলতে পারি।',
  },
  deathSorry: {
    en: "I'm so sorry they are unwell.",
    hi: 'मुझे बहुत दुख है कि वे इतने बीमार हैं।',
    bn: 'উনি অসুস্থ শুনে খুব খারাপ লাগছে।',
  },
  diagnosis: {
    en: "I can't tell which illness someone has, or how serious it is; only a doctor's check-up can.",
    hi: 'कौन सी बीमारी है या कितनी गंभीर है, यह कुंडली से नहीं बताया जा सकता; यह सिर्फ़ डॉक्टर की जाँच से पता चलता है।',
    bn: 'কোন রোগ বা তা কতটা গুরুতর, তা কুষ্ঠি থেকে বলা যায় না; সেটা শুধু ডাক্তারের পরীক্ষাতেই জানা যায়।',
  },
  stopTreatment: {
    en: "Please don't stop or change any medicine without your doctor: no gemstone or remedy replaces treatment.",
    hi: 'डॉक्टर से पूछे बिना कोई दवा बंद या कम न करें: कोई रत्न या उपाय इलाज की जगह नहीं ले सकता।',
    bn: 'ডাক্তারের পরামর্শ ছাড়া কোনো ওষুধ বন্ধ বা বদল করবেন না: কোনো রত্ন বা প্রতিকার চিকিৎসার বিকল্প নয়।',
  },
  surgery: {
    en: "The surgeon's judgement comes first here; a chart can't predict how an operation will go.",
    hi: 'यहाँ सर्जन की राय सबसे पहले है; कुंडली से यह नहीं बताया जा सकता कि ऑपरेशन कैसा रहेगा।',
    bn: 'এখানে সার্জনের মতামতই আগে; অপারেশন কেমন হবে তা কুষ্ঠি থেকে বলা যায় না।',
  },
  surgeryCare: {
    en: 'What helps most is rest, following the doctor\'s instructions exactly and having family close by.',
    hi: 'सबसे ज़्यादा मदद आराम, डॉक्टर की हर बात मानने और परिवार के साथ रहने से मिलती है।',
    bn: 'সবচেয়ে বেশি সাহায্য করে বিশ্রাম, ডাক্তারের প্রতিটি নির্দেশ মেনে চলা আর পরিবারের পাশে থাকা।',
  },
  otherUnwell: {
    en: "I'm sorry {name} is unwell. I can't judge medical outcomes from a chart; the doctors treating them are the right people for that.",
    hi: 'मुझे दुख है कि {name} की तबीयत ठीक नहीं है। कुंडली से इलाज का नतीजा नहीं बताया जा सकता; यह उनका इलाज कर रहे डॉक्टर ही बता सकते हैं।',
    bn: '{name} অসুস্থ শুনে খারাপ লাগছে। কুষ্ঠি থেকে চিকিৎসার ফল বলা যায় না; যে ডাক্তাররা দেখছেন, তাঁরাই সেটা বলতে পারবেন।',
  },
  caregiver: {
    en: 'Staying close, keeping their routine calm and looking after your own rest helps the whole family.',
    hi: 'उनके पास रहना, उनकी दिनचर्या शांत रखना और अपनी नींद व आराम का ध्यान रखना पूरे परिवार की मदद करता है।',
    bn: 'পাশে থাকা, তাঁর রুটিন শান্ত রাখা আর নিজের ঘুম ও বিশ্রামের যত্ন নেওয়া পুরো পরিবারকে সাহায্য করে।',
  },
  mindReading: {
    en: "I can't read another person's feelings from your chart; their heart is theirs to share.",
    hi: 'आपके चार्ट से किसी और के मन की बात नहीं पढ़ी जा सकती; यह वही बता सकते हैं।',
    bn: 'আপনার চার্ট থেকে অন্য কারও মনের কথা পড়া যায় না; সেটা তিনিই বলতে পারেন।',
  },
  mindReadingStep: {
    en: 'The surest way to know is a calm, honest conversation with them, without pressure.',
    hi: 'जानने का सबसे पक्का तरीका है उनसे शांति और ईमानदारी से, बिना दबाव के बात करना।',
    bn: 'জানার সবচেয়ে ভালো উপায় হলো চাপ না দিয়ে তাঁর সঙ্গে শান্তভাবে, সৎভাবে কথা বলা।',
  },
  country: {
    en: "Classical charts don't name a country, so I won't pick one for you; what the chart shows is how strongly it favours living abroad and when.",
    hi: 'पुराने ग्रंथ किसी देश का नाम नहीं बताते, इसलिए मैं कोई देश नहीं चुनूँगा; चार्ट यह दिखाता है कि विदेश में रहने का झुकाव कितना है और कब।',
    bn: 'শাস্ত্রে কোনো দেশের নাম বলা থাকে না, তাই আমি কোনো দেশ বেছে দেব না; চার্ট দেখায় বিদেশে থাকার টান কতটা আর কখন।',
  },
  kaalSarp: {
    en: "Kaal Sarp isn't part of the classical texts this app follows, so there's nothing to fear from it.",
    hi: 'काल सर्प उन पुराने ग्रंथों में नहीं है जिन पर यह ऐप चलता है, इसलिए इससे डरने की कोई बात नहीं।',
    bn: 'কাল সর্প সেই প্রাচীন শাস্ত্রে নেই যেগুলো এই অ্যাপ মেনে চলে, তাই এ নিয়ে ভয়ের কিছু নেই।',
  },
  kaalSarpRespect: {
    en: "If you value your pandit's guidance, that's your choice to respect; for peace of mind, simple discipline and kindness are enough.",
    hi: 'अगर आप पंडित जी की सलाह को मानते हैं, तो यह आपका निर्णय है; मन की शांति के लिए सादा अनुशासन और दया काफ़ी है।',
    bn: 'পুরোহিতমশাইয়ের পরামর্শ মানলে সেটা আপনার সিদ্ধান্ত; মনের শান্তির জন্য সাধারণ শৃঙ্খলা আর দয়াই যথেষ্ট।',
  },
  ceremony: {
    en: 'For a griha pravesh or a wedding, the day is traditionally fixed with your family priest; the Muhurat tab covers simpler activities like starting work, buying, signing and travel.',
    hi: 'गृह प्रवेश या शादी जैसे मौकों का दिन परंपरा से परिवार के पुरोहित तय करते हैं; मुहूर्त टैब काम शुरू करने, खरीदारी, हस्ताक्षर और यात्रा जैसे कामों के लिए है।',
    bn: 'গৃহপ্রবেশ বা বিয়ের মতো অনুষ্ঠানের দিন প্রথা মেনে পরিবারের পুরোহিত ঠিক করেন; মুহূর্ত ট্যাব কাজ শুরু, কেনাকাটা, সই আর যাত্রার মতো কাজের জন্য।',
  },
  muhuratPointer: {
    en: 'For a day you choose yourself, like signing or a ceremony, the Muhurat tab picks good dates.',
    hi: 'जिस दिन को आप खुद चुनते हैं, जैसे हस्ताक्षर या कोई रस्म, उसके लिए मुहूर्त टैब अच्छे दिन बताता है।',
    bn: 'যে দিনটা আপনি নিজে বেছে নেন, যেমন সই বা কোনো অনুষ্ঠান, তার জন্য মুহূর্ত ট্যাব ভালো দিন দেখায়।',
  },
  insist: {
    en: 'I understand you want a date, but a chart can narrow a life event to a month and a window, not a single day.',
    hi: 'मैं समझता हूँ कि आप एक तारीख चाहते हैं, पर कुंडली किसी घटना को महीने और समय-सीमा तक ही बता सकती है, किसी एक तारीख तक नहीं।',
    bn: 'বুঝতে পারছি আপনি একটা তারিখ চান, কিন্তু কুষ্ঠি কোনো ঘটনাকে মাস আর সময়ের পরিসর পর্যন্ত বলতে পারে, নির্দিষ্ট একটা দিন নয়।',
  },

  // ─── Birth data, past events ──────────────────────────────────────────────
  answersAnyway: {
    en: 'Yes, I can still read a lot from your chart.',
    hi: 'हाँ, फिर भी आपके चार्ट से काफ़ी कुछ बताया जा सकता है।',
    bn: 'হ্যাঁ, তবুও আপনার চার্ট থেকে অনেক কিছু বলা যায়।',
  },
  stillRead: {
    en: 'Even without the birth time, the chart still gives a useful answer.',
    hi: 'जन्म समय के बिना भी चार्ट से काम का जवाब मिल जाता है।',
    bn: 'জন্মসময় ছাড়াও চার্ট থেকে কাজের উত্তর পাওয়া যায়।',
  },
  recovery: {
    en: 'For recovery and energy afterwards, your chart shows a {kind} period from {start} to {end}.',
    hi: 'उसके बाद रिकवरी और ऊर्जा के लिए आपके चार्ट में {start} से {end} तक {kind} समय है।',
    bn: 'তার পরে সেরে ওঠা আর শক্তির জন্য আপনার চার্টে {start} থেকে {end} পর্যন্ত {kind} সময়।',
  },
  noTimeHow: {
    en: 'Without a birth time I read your houses from your Moon sign, which still gives a useful picture, though timing is approximate.',
    hi: 'जन्म समय के बिना मैं आपकी चंद्र राशि से घर गिनता हूँ; इससे भी काफ़ी काम की तस्वीर मिलती है, बस समय अनुमानित रहता है।',
    bn: 'জন্মসময় ছাড়া আমি আপনার চন্দ্ররাশি থেকে ঘর গুনি; তাতেও কাজের ছবি পাওয়া যায়, শুধু সময়টা আনুমানিক থাকে।',
  },
  addTime: {
    en: "If you can find the time (a birth certificate, a hospital record or a family member's memory), add it to your profile for sharper answers.",
    hi: 'अगर जन्म का समय मिल जाए (जन्म प्रमाणपत्र, अस्पताल का रिकॉर्ड या परिवार की याद से), तो उसे प्रोफ़ाइल में जोड़ें, जवाब और सटीक होंगे।',
    bn: 'জন্মের সময়টা পেলে (জন্ম সার্টিফিকেট, হাসপাতালের রেকর্ড বা পরিবারের কারও মনে থাকলে), প্রোফাইলে যোগ করুন, উত্তর আরও নিখুঁত হবে।',
  },
  whyApprox: {
    en: "It's approximate because without the birth time the rising sign, and with it the houses, can't be fixed, and the life-cycle dates can shift a little.",
    hi: 'यह अनुमानित इसलिए है क्योंकि जन्म समय के बिना लग्न और घर तय नहीं होते, और जीवन-चक्र की तारीखें थोड़ी खिसक सकती हैं।',
    bn: 'এটা আনুমানিক, কারণ জন্মসময় ছাড়া লগ্ন আর ঘর ঠিক করা যায় না, আর জীবনচক্রের তারিখগুলো একটু সরে যেতে পারে।',
  },
  inviteConfirm: {
    en: 'Does that match what you went through? If it does, it also tells us your birth time is reliable.',
    hi: 'क्या यह आपके अनुभव से मेल खाता है? अगर हाँ, तो इससे यह भी पता चलता है कि आपका जन्म समय सही है।',
    bn: 'এটা কি আপনার অভিজ্ঞতার সঙ্গে মেলে? মিললে বোঝা যায় আপনার জন্মসময়ও ঠিক আছে।',
  },
  pastHeavy: {
    en: 'Looking back, {year} falls in a heavier phase: {why}.',
    hi: 'पीछे देखें तो {year} एक भारी दौर में आता है: {why}।',
    bn: 'পিছনে তাকালে {year} একটা ভারী সময়ের মধ্যে পড়ে: {why}।',
  },
  pastLight: {
    en: 'Looking back, {year} was a fairly supportive year in your chart: {why}.',
    hi: 'पीछे देखें तो {year} आपके चार्ट में काफ़ी सहारा देने वाला साल था: {why}।',
    bn: 'পিছনে তাকালে {year} আপনার চার্টে মোটামুটি সহায়ক বছর ছিল: {why}।',
  },

  // ─── Career, money, studies ───────────────────────────────────────────────
  govtStrong: {
    en: 'Your chart has good support for government and public-sector work: the planet of authority, which stands for government, is strong and tied to your work side.',
    hi: 'आपके चार्ट में सरकारी नौकरी के लिए अच्छा साथ है: अधिकार का ग्रह, जो सरकार का प्रतीक है, मज़बूत है और आपके काम वाले पहलू से जुड़ा है।',
    bn: 'আপনার চার্টে সরকারি চাকরির জন্য ভালো সমর্থন আছে: কর্তৃত্বের গ্রহ, যা সরকারের প্রতীক, জোরালো আর আপনার কাজের দিকের সঙ্গে যুক্ত।',
  },
  govtFair: {
    en: 'Your chart gives government and public-sector work a fair chance: the planet of authority is steady rather than dominant, so preparation decides a lot.',
    hi: 'आपके चार्ट में सरकारी नौकरी की ठीक-ठाक संभावना है: अधिकार का ग्रह स्थिर है पर बहुत प्रबल नहीं, इसलिए तैयारी बहुत कुछ तय करेगी।',
    bn: 'আপনার চার্টে সরকারি চাকরির মোটামুটি সম্ভাবনা আছে: কর্তৃত্বের গ্রহ স্থির, তবে খুব প্রবল নয়, তাই প্রস্তুতিই অনেকটা ঠিক করবে।',
  },
  govtWeak: {
    en: "Government work isn't the chart's strongest pull; private-sector roles in your best-fit fields look more natural, so keep both doors open.",
    hi: 'सरकारी नौकरी चार्ट का सबसे मज़बूत झुकाव नहीं है; आपके अनुकूल क्षेत्रों में प्राइवेट नौकरियाँ ज़्यादा सहज दिखती हैं, इसलिए दोनों रास्ते खुले रखें।',
    bn: 'সরকারি চাকরি চার্টের সবচেয়ে জোরালো টান নয়; আপনার মানানসই ক্ষেত্রে বেসরকারি কাজ বেশি স্বাভাবিক দেখায়, তাই দুটো পথই খোলা রাখুন।',
  },
  studyStrategy: {
    en: 'Use the coming months for mock tests under exam conditions and steady revision of weak areas; consistency matters more than extra hours.',
    hi: 'आने वाले महीनों में परीक्षा जैसे माहौल में मॉक टेस्ट दें और कमज़ोर हिस्सों का लगातार रिवीज़न करें; ज़्यादा घंटों से ज़्यादा नियमितता मायने रखती है।',
    bn: 'সামনের মাসগুলোয় পরীক্ষার মতো পরিবেশে মক টেস্ট দিন আর দুর্বল অংশগুলো নিয়মিত রিভিশন করুন; বেশি ঘণ্টার চেয়ে নিয়মিত পড়াই বেশি কাজের।',
  },
  studyStrategyGovt: {
    en: 'Prepare with a fixed daily schedule, a weekly mock test and steady revision, and keep one private-sector option open as well.',
    hi: 'रोज़ का तय समय, हर हफ़्ते एक मॉक टेस्ट और लगातार रिवीज़न के साथ तैयारी करें, और एक प्राइवेट विकल्प भी खुला रखें।',
    bn: 'রোজের নির্দিষ্ট সময়, প্রতি সপ্তাহে একটা মক টেস্ট আর নিয়মিত রিভিশন নিয়ে প্রস্তুতি নিন, আর একটা বেসরকারি বিকল্পও খোলা রাখুন।',
  },
  moneyHabit: {
    en: 'Save a fixed share first each month, keep three months of expenses aside, and avoid lending or big bets in weaker months.',
    hi: 'हर महीने सबसे पहले एक तय हिस्सा बचाएँ, तीन महीने के खर्च जितनी बचत अलग रखें, और कमज़ोर महीनों में उधार देने या बड़े दाँव से बचें।',
    bn: 'প্রতি মাসে আগে একটা নির্দিষ্ট অংশ সঞ্চয় করুন, তিন মাসের খরচ আলাদা রাখুন, আর দুর্বল মাসগুলোয় ধার দেওয়া বা বড় ঝুঁকি এড়িয়ে চলুন।',
  },
  debtPlan: {
    en: 'List every loan, pay the costliest first, and ask your bank about restructuring before you miss a payment; save a little each month even while repaying.',
    hi: 'हर कर्ज़ की सूची बनाएँ, सबसे महँगा पहले चुकाएँ, और किस्त छूटने से पहले बैंक से रीस्ट्रक्चरिंग की बात करें; चुकाते हुए भी हर महीने थोड़ी बचत करें।',
    bn: 'সব ঋণের তালিকা করুন, সবচেয়ে দামি ঋণটা আগে শোধ করুন, আর কিস্তি বাদ পড়ার আগেই ব্যাংকের সঙ্গে পুনর্গঠনের কথা বলুন; শোধ করার মধ্যেও প্রতি মাসে একটু সঞ্চয় করুন।',
  },
  owed: {
    en: "Follow up calmly and in writing, and keep a record of what you lent; the chart can show a better period, not the other person's choice.",
    hi: 'शांति से और लिखित में बात आगे बढ़ाएँ, और जो पैसा दिया उसका हिसाब रखें; चार्ट बेहतर समय बता सकता है, सामने वाले का फ़ैसला नहीं।',
    bn: 'শান্তভাবে আর লিখিতভাবে খোঁজ নিন, আর কত টাকা দিয়েছিলেন তার হিসেব রাখুন; চার্ট ভালো সময় দেখাতে পারে, অন্যজনের সিদ্ধান্ত নয়।',
  },
  propertyChecks: {
    en: 'Before you commit, check the budget, the documents and the legal title; for the registration day itself, use the Muhurat tab.',
    hi: 'पक्का करने से पहले बजट, कागज़ात और कानूनी मालिकाना हक़ जाँच लें; रजिस्ट्री के दिन के लिए मुहूर्त टैब देखें।',
    bn: 'পাকা করার আগে বাজেট, কাগজপত্র আর আইনি মালিকানা যাচাই করুন; রেজিস্ট্রির দিনের জন্য মুহূর্ত ট্যাব দেখুন।',
  },
  partnershipGood: {
    en: 'A partnership looks reasonably supported in your chart: your partnership side and your own side work well together. Put every share and role in writing.',
    hi: 'आपके चार्ट में साझेदारी को ठीक-ठाक साथ मिलता है: साझेदारी वाला पहलू और आपका अपना पहलू मेल खाते हैं। हर हिस्सेदारी और ज़िम्मेदारी लिखित में तय करें।',
    bn: 'আপনার চার্টে অংশীদারি মোটামুটি সহায়ক: আপনার অংশীদারির দিক আর নিজের দিক মিলে কাজ করে। প্রতিটি ভাগ আর দায়িত্ব লিখিতভাবে ঠিক করুন।',
  },
  partnershipCareful: {
    en: 'A partnership looks slower in your chart; you do better keeping control yourself, so if you go ahead, use clear contracts and a small start.',
    hi: 'आपके चार्ट में साझेदारी थोड़ी धीमी दिखती है; नियंत्रण अपने हाथ में रखना आपके लिए बेहतर है, इसलिए आगे बढ़ें तो साफ़ अनुबंध और छोटी शुरुआत करें।',
    bn: 'আপনার চার্টে অংশীদারি একটু ধীর দেখায়; নিয়ন্ত্রণ নিজের হাতে রাখাই আপনার পক্ষে ভালো, তাই এগোলে স্পষ্ট চুক্তি আর ছোট শুরু করুন।',
  },
  switchNow: {
    en: 'Moving is supported once your stronger window opens, so start applying now and make the switch inside it.',
    hi: 'मज़बूत समय शुरू होते ही बदलाव को साथ मिलता है, इसलिए अभी से आवेदन शुरू करें और उसी समय में बदलाव करें।',
    bn: 'জোরালো সময় শুরু হলেই বদলের সমর্থন মেলে, তাই এখন থেকেই আবেদন শুরু করুন আর সেই সময়ের মধ্যে বদলান।',
  },
  switchWait: {
    en: 'Better to grow where you are for now and move in the stronger window; keep your options warm meanwhile.',
    hi: 'अभी जहाँ हैं वहीं आगे बढ़ना बेहतर है और मज़बूत समय में बदलाव करें; तब तक विकल्प तैयार रखें।',
    bn: 'আপাতত যেখানে আছেন সেখানেই এগোনো ভালো, আর জোরালো সময়ে বদলান; ততদিন বিকল্পগুলো তৈরি রাখুন।',
  },
  dontQuit: {
    en: "Don't quit before you have an offer in hand: apply now so the move lands inside your window, and keep your current income steady.",
    hi: 'हाथ में ऑफ़र आने से पहले नौकरी न छोड़ें: अभी आवेदन करें ताकि बदलाव उसी समय में हो, और मौजूदा आमदनी बनाए रखें।',
    bn: 'হাতে অফার আসার আগে চাকরি ছাড়বেন না: এখনই আবেদন করুন যাতে বদলটা ওই সময়ের মধ্যে হয়, আর এখনকার আয় বজায় রাখুন।',
  },

  // ─── Relationships ────────────────────────────────────────────────────────
  communication: {
    en: 'Pick one calm time each week to talk, listen first, and avoid big decisions in the middle of an argument.',
    hi: 'हर हफ़्ते बात करने का एक शांत समय तय करें, पहले सुनें, और झगड़े के बीच बड़े फ़ैसले न लें।',
    bn: 'প্রতি সপ্তাহে কথা বলার একটা শান্ত সময় ঠিক করুন, আগে শুনুন, আর ঝগড়ার মাঝে বড় সিদ্ধান্ত নেবেন না।',
  },
  exBack: {
    en: 'Their choice matters most here; focus on what you can control and let any reconnection come without pressure.',
    hi: 'यहाँ उनका फ़ैसला सबसे ज़्यादा मायने रखता है; जो आपके हाथ में है उस पर ध्यान दें और बिना दबाव के रिश्ते को मौका दें।',
    bn: 'এখানে তাঁর সিদ্ধান্তই সবচেয়ে বড়; যা আপনার হাতে আছে তাতে মন দিন, আর চাপ ছাড়াই সম্পর্ককে সুযোগ দিন।',
  },
  parentsTalk: {
    en: 'Talk to your parents early and calmly, let them get to know the person, and give them time.',
    hi: 'माता-पिता से जल्दी और शांति से बात करें, उन्हें उस व्यक्ति को जानने का मौका दें, और उन्हें समय दें।',
    bn: 'বাবা-মায়ের সঙ্গে আগেভাগে শান্তভাবে কথা বলুন, মানুষটিকে চেনার সুযোগ দিন, আর তাঁদের সময় দিন।',
  },
  familyStep: {
    en: 'Try small routines: one shared meal a week, and clear, kind words about who does what.',
    hi: 'छोटी आदतें अपनाएँ: हफ़्ते में एक बार साथ खाना, और कौन क्या करेगा इस पर साफ़ और नरम बात।',
    bn: 'ছোট অভ্যাস গড়ুন: সপ্তাহে একবার একসঙ্গে খাওয়া, আর কে কী করবে তা নিয়ে স্পষ্ট, নরম কথা বলা।',
  },
  divorceCase: {
    en: 'If you are already in proceedings, the period from {start} to {end} looks best for settling things.',
    hi: 'अगर मामला पहले से चल रहा है, तो {start} से {end} तक का समय चीज़ें सुलझाने के लिए सबसे अच्छा दिखता है।',
    bn: 'মামলা ইতিমধ্যে চললে, {start} থেকে {end} সময়টা বিষয়টা মেটানোর জন্য সবচেয়ে ভালো দেখায়।',
  },
  divorceStrain: {
    en: 'What the chart shows is a strained phase in your partnership side, easing from around {start}; it does not decide your marriage for you.',
    hi: 'चार्ट में आपके साझेदारी वाले पहलू पर तनाव का एक दौर दिखता है, जो लगभग {start} से हल्का होता है; आपकी शादी का फ़ैसला चार्ट नहीं करता।',
    bn: 'চার্টে আপনার সম্পর্কের দিকে একটা টানাপোড়েনের সময় দেখা যায়, যা মোটামুটি {start} থেকে হালকা হয়; আপনার বিয়ের সিদ্ধান্ত চার্ট নেয় না।',
  },
  marriedHarmony: {
    en: 'Then the question is how your marriage goes from here: the period from {start} to {end} is especially warm for the two of you.',
    hi: 'तो असली सवाल यह है कि आपकी शादी आगे कैसी रहेगी: {start} से {end} तक का समय आप दोनों के लिए खास तौर पर अच्छा है।',
    bn: 'তাহলে আসল প্রশ্ন হলো আপনাদের বিয়ে সামনে কেমন যাবে: {start} থেকে {end} সময়টা আপনাদের দুজনের জন্য বিশেষ করে ভালো।',
  },
  marriedChild: {
    en: "It's also a good time if you're planning a child.",
    hi: 'अगर आप संतान की योजना बना रहे हैं, तो यह समय उसके लिए भी अच्छा है।',
    bn: 'সন্তানের পরিকল্পনা থাকলে, এই সময়টা তার জন্যও ভালো।',
  },
  compatScore: {
    en: 'You two score {score} out of 36, which tradition calls {verdict}.',
    hi: 'आप दोनों के {score} गुण 36 में से मिलते हैं, जिसे परंपरा में {verdict} माना जाता है।',
    bn: 'আপনাদের দুজনের 36-এর মধ্যে {score} গুণ মেলে, যাকে প্রথায় {verdict} বলা হয়।',
  },
  compatGood: { en: 'Your strongest areas are {good}.', hi: 'आपकी सबसे अच्छी बातें हैं: {good}।', bn: 'আপনাদের সবচেয়ে ভালো দিক: {good}।' },
  compatWork: { en: 'The one area to work on is {work}.', hi: 'जिस एक बात पर काम करना है: {work}।', bn: 'যে একটা দিকে কাজ করতে হবে: {work}।' },
  compatLow: {
    en: 'Many happy couples have a low score; how you talk and support each other matters more than the number.',
    hi: 'कई ख़ुश जोड़ों के गुण कम मिलते हैं; आपस की बातचीत और साथ, इस संख्या से ज़्यादा मायने रखते हैं।',
    bn: 'অনেক সুখী দম্পতির গুণ কম মেলে; একে অপরের সঙ্গে কথা বলা আর পাশে থাকাই সংখ্যার চেয়ে বেশি জরুরি।',
  },
  compatDecide: {
    en: 'Whether to marry is your decision; a score alone should never decide it.',
    hi: 'शादी करनी है या नहीं, यह आपका फ़ैसला है; सिर्फ़ गुणों की संख्या से यह तय नहीं होना चाहिए।',
    bn: 'বিয়ে করবেন কি না, সেটা আপনার সিদ্ধান্ত; শুধু গুণের সংখ্যা দিয়ে তা ঠিক হওয়া উচিত নয়।',
  },
  compatNadi: {
    en: 'About the nadi point your family mentions: {nadi}. Talk it through with them calmly, with the full picture.',
    hi: 'नाड़ी दोष की जो बात परिवार कर रहा है: {nadi}। पूरी तस्वीर के साथ उनसे शांति से बात करें।',
    bn: 'পরিবার যে নাড়ি দোষের কথা বলছে: {nadi}। পুরো ছবিটা নিয়ে তাঁদের সঙ্গে শান্তভাবে কথা বলুন।',
  },
  compatScreen: { en: 'The Compatibility screen has the full breakdown.', hi: 'पूरा ब्योरा कम्पैटिबिलिटी स्क्रीन पर है।', bn: 'পুরো বিবরণ কম্প্যাটিবিলিটি স্ক্রিনে আছে।' },
  compatAsk: {
    en: 'To check your compatibility, I need their birth date, time and place: add them as a profile, then open the Compatibility screen or ask me again.',
    hi: 'मिलान के लिए मुझे उनकी जन्म तिथि, समय और जगह चाहिए: उन्हें प्रोफ़ाइल में जोड़ें, फिर कम्पैटिबिलिटी स्क्रीन खोलें या मुझसे दोबारा पूछें।',
    bn: 'মিল দেখার জন্য তাঁর জন্মতারিখ, সময় আর জায়গা লাগবে: প্রোফাইলে যোগ করুন, তারপর কম্প্যাটিবিলিটি স্ক্রিন খুলুন বা আবার জিজ্ঞেস করুন।',
  },
  compatWorkOn: {
    en: 'To build on it, keep one unhurried conversation a week about plans and worries, and agree how you will handle disagreements before they come up.',
    hi: 'इसे मज़बूत करने के लिए हर हफ़्ते योजनाओं और चिंताओं पर एक इत्मीनान वाली बातचीत रखें, और असहमति आने से पहले तय करें कि उसे कैसे सँभालेंगे।',
    bn: 'এটা মজবুত করতে প্রতি সপ্তাহে পরিকল্পনা আর দুশ্চিন্তা নিয়ে একটা ধীরস্থির কথা বলুন, আর মতভেদ আসার আগেই ঠিক করুন সেটা কীভাবে সামলাবেন।',
  },
  askProfile: {
    en: "To answer this for your {relation}, I need your {relation}'s own birth details. Add them as a profile, then ask in their chat.",
    hi: 'इसका जवाब देने के लिए मुझे उनके अपने जन्म का ब्योरा चाहिए। उन्हें प्रोफ़ाइल में जोड़ें, फिर उनकी चैट में पूछें।',
    bn: 'এর উত্তর দিতে ওঁর নিজের জন্মের তথ্য লাগবে। ওঁকে প্রোফাইলে যোগ করে ওঁর চ্যাটে জিজ্ঞেস করুন।',
  },
  askWhich: {
    en: 'You have two {relation} profiles saved: {names}. Which one do you mean? Open her chat and ask there, or tell me the name.',
    hi: 'आपके दो प्रोफ़ाइल सहेजे हैं: {names}। आप कौन सी बात कर रहे हैं? उनकी चैट खोलकर पूछें या मुझे नाम बताएँ।',
    bn: 'আপনার দুটো প্রোফাইল সেভ করা আছে: {names}। কোন জনের কথা বলছেন? তাঁর চ্যাট খুলে জিজ্ঞেস করুন বা নামটা বলুন।',
  },
  grandchildren: {
    en: "That joy comes through your children's own charts; if you add your son's or daughter's birth details, I can look at their family timing. Your own chart shows warm years at home, and how you enjoy them is your choice.",
    hi: 'यह ख़ुशी आपके बच्चों की अपनी कुंडली से दिखती है; अपने बेटे या बेटी का जन्म ब्योरा जोड़ें तो मैं उनके परिवार का समय देख सकता हूँ। आपकी अपनी कुंडली घर में सुखद साल दिखाती है, और इन्हें कैसे जीना है, यह आपका फ़ैसला है।',
    bn: 'এই আনন্দটা দেখা যায় আপনার সন্তানদের নিজেদের কুষ্ঠিতে; ছেলে বা মেয়ের জন্মের তথ্য যোগ করলে তাঁদের পরিবারের সময় দেখতে পারি। আপনার নিজের কুষ্ঠিতে ঘরে সুখের বছর দেখা যায়, আর তা কীভাবে কাটাবেন সেটা আপনার সিদ্ধান্ত।',
  },
  retirement: {
    en: 'How you spend these years is your choice; the chart suggests an unhurried pace, time with family and passing on your experience.',
    hi: 'इन सालों को कैसे बिताना है, यह आपका फ़ैसला है; चार्ट इत्मीनान, परिवार के साथ समय और अपने अनुभव बाँटने की ओर इशारा करता है।',
    bn: 'এই বছরগুলো কীভাবে কাটাবেন সেটা আপনার সিদ্ধান্ত; চার্ট বলে ধীরস্থির ছন্দ, পরিবারের সঙ্গে সময় আর নিজের অভিজ্ঞতা ভাগ করে নেওয়ার কথা।',
  },
  elderChildDoctor: {
    en: 'If you are considering it, a fertility specialist is the right person to guide you.',
    hi: 'अगर आप इस बारे में सोच रहे हैं, तो किसी फ़र्टिलिटी विशेषज्ञ डॉक्टर से सलाह लें।',
    bn: 'এ নিয়ে ভাবলে একজন ফার্টিলিটি বিশেষজ্ঞ ডাক্তারের পরামর্শ নিন।',
  },

  // ─── Wellbeing ────────────────────────────────────────────────────────────
  selfCare: {
    en: 'Meanwhile, regular sleep, a short daily walk and some quiet time each day help most.',
    hi: 'तब तक नियमित नींद, रोज़ थोड़ी सैर और हर दिन कुछ शांत समय सबसे ज़्यादा मदद करते हैं।',
    bn: 'ততদিন নিয়মিত ঘুম, রোজ একটু হাঁটা আর প্রতিদিন কিছুটা শান্ত সময় সবচেয়ে বেশি সাহায্য করে।',
  },
  distressPhase: {
    en: 'Part of what you are feeling fits your chart\'s current phase: {why}.',
    hi: 'आप जो महसूस कर रहे हैं, उसका कुछ हिस्सा आपके चार्ट के मौजूदा दौर से मेल खाता है: {why}।',
    bn: 'আপনি যা অনুভব করছেন তার কিছুটা আপনার চার্টের এখনকার পর্বের সঙ্গে মেলে: {why}।',
  },
  healthPhase: {
    en: 'Your chart shows a lower-energy phase right now: {why}.',
    hi: 'आपके चार्ट में अभी कम ऊर्जा वाला दौर दिखता है: {why}।',
    bn: 'আপনার চার্টে এখন কম শক্তির একটা সময় দেখা যায়: {why}।',
  },
  angry: {
    en: 'Quick anger usually comes with a lot of drive: a daily workout, a pause of ten breaths before replying, and enough sleep help you use that energy well.',
    hi: 'जल्दी गुस्सा अक्सर ज़्यादा जोश के साथ आता है: रोज़ व्यायाम, जवाब देने से पहले दस साँसों का ठहराव और पूरी नींद इस ऊर्जा को सही दिशा देते हैं।',
    bn: 'তাড়াতাড়ি রাগ সাধারণত অনেক উদ্যমের সঙ্গে আসে: রোজ ব্যায়াম, উত্তর দেওয়ার আগে দশটা শ্বাসের বিরতি আর পর্যাপ্ত ঘুম এই শক্তিকে ঠিক পথে চালায়।',
  },
  peaceLikely: {
    en: 'Inner peace looks reachable for you, and it grows with a steady, simple practice.',
    hi: 'आपके लिए मन की शांति पाना संभव दिखता है, और यह सादे, नियमित अभ्यास से बढ़ती है।',
    bn: 'আপনার জন্য মনের শান্তি পাওয়া সম্ভব দেখায়, আর সহজ, নিয়মিত অনুশীলনে তা বাড়ে।',
  },

  // ─── Remedies ─────────────────────────────────────────────────────────────
  remedyLead: {
    en: "You don't need anything expensive. For {planet}, the traditional remedies are free: {items}.",
    hi: 'आपको कुछ महँगा करने की ज़रूरत नहीं। {planet} के लिए पारंपरिक उपाय मुफ़्त हैं: {items}।',
    bn: 'কোনো দামি কিছু করার দরকার নেই। {planet}-এর জন্য প্রথাগত প্রতিকারগুলো বিনামূল্যে: {items}।',
  },
  remedySecular: {
    en: "Here are remedies that aren't rituals at all: {items}.",
    hi: 'ये ऐसे उपाय हैं जिनमें कोई रस्म नहीं: {items}।',
    bn: 'এগুলো এমন প্রতিকার যাতে কোনো আচার নেই: {items}।',
  },
  remedyOptional: {
    en: 'These are optional and free; take up the ones that fit your beliefs, and your own effort does the rest.',
    hi: 'ये सब मुफ़्त और वैकल्पिक हैं; जो आपकी आस्था से मेल खाएँ, वही अपनाएँ, बाकी आपकी मेहनत करेगी।',
    bn: 'এগুলো বিনামূল্যে আর ঐচ্ছিক; যেগুলো আপনার বিশ্বাসের সঙ্গে মেলে সেগুলো নিন, বাকিটা আপনার চেষ্টাই করবে।',
  },
  gem: {
    en: "Traditionally {gem} is linked to {planet}, but it isn't required: never wear one out of fear, and it's no substitute for effort or treatment. If you still consider it, speak to a qualified person and don't overspend.",
    hi: 'परंपरा में {gem} को {planet} से जोड़ा जाता है, पर यह ज़रूरी नहीं: डर से कभी रत्न न पहनें, और यह मेहनत या इलाज की जगह नहीं लेता। फिर भी सोचें तो किसी जानकार से पूछें और ज़्यादा ख़र्च न करें।',
    bn: 'প্রথা অনুযায়ী {gem}-কে {planet}-এর সঙ্গে যুক্ত ধরা হয়, তবে এটা দরকার নেই: ভয় থেকে কখনও রত্ন পরবেন না, আর এটা চেষ্টা বা চিকিৎসার বিকল্প নয়। তবুও ভাবলে কোনো যোগ্য মানুষের সঙ্গে কথা বলুন আর বেশি খরচ করবেন না।',
  },
  gemFast: {
    en: "No stone makes things happen faster; steady routine and effort in your good window do far more.",
    hi: 'कोई भी रत्न चीज़ों को जल्दी नहीं करवाता; अच्छे समय में नियमित दिनचर्या और मेहनत कहीं ज़्यादा काम करती है।',
    bn: 'কোনো পাথর কাজ তাড়াতাড়ি করায় না; ভালো সময়ে নিয়মিত রুটিন আর চেষ্টাই অনেক বেশি কাজ করে।',
  },

  // ─── Lucky values, muhurat ────────────────────────────────────────────────
  luckyToday: {
    en: 'Today your lucky colour is {colour} and your lucky number is {number}, from {planet}.',
    hi: 'आज आपका शुभ रंग {colour} है और शुभ अंक {number}, जो {planet} से जुड़ा है।',
    bn: 'আজ আপনার শুভ রং {colour} আর শুভ সংখ্যা {number}, যা {planet}-এর সঙ্গে যুক্ত।',
  },
  luckyNumber: {
    en: 'Your lucky number is {number}, from {planet}, the planet of your Moon sign; today\'s number is {today}.',
    hi: 'आपका शुभ अंक {number} है, जो आपकी चंद्र राशि के ग्रह {planet} से आता है; आज का अंक {today} है।',
    bn: 'আপনার শুভ সংখ্যা {number}, যা আপনার চন্দ্ররাশির গ্রহ {planet} থেকে আসে; আজকের সংখ্যা {today}।',
  },
  luckyDay: {
    en: 'Your lucky day of the week is {weekday}, the day of {planet}, the planet of your Moon sign.',
    hi: 'आपका शुभ दिन {weekday} है, जो आपकी चंद्र राशि के ग्रह {planet} का दिन है।',
    bn: 'আপনার শুভ বার {weekday}, যা আপনার চন্দ্ররাশির গ্রহ {planet}-এর দিন।',
  },
  luckyTime: { en: "Today's best time window is {time}.", hi: 'आज का सबसे अच्छा समय {time} है।', bn: 'আজকের সবচেয়ে ভালো সময় {time}।' },
  luckyNudge: {
    en: 'Think of it as a gentle nudge, not a rule; the Today screen shows it every day.',
    hi: 'इसे एक हल्का इशारा समझें, कोई नियम नहीं; टुडे स्क्रीन पर यह रोज़ दिखता है।',
    bn: 'একে একটা হালকা ইঙ্গিত ভাবুন, নিয়ম নয়; টুডে স্ক্রিনে এটা রোজ দেখা যায়।',
  },
  muhuratDays: {
    en: 'For {activity}, the best upcoming days are {days}, on favourable lunar days and clear of Rahu Kaal.',
    hi: '{activity} के लिए आने वाले सबसे अच्छे दिन हैं {days}, शुभ तिथि पर और राहु काल से बचकर।',
    bn: '{activity}-এর জন্য সামনের সবচেয়ে ভালো দিন {days}, শুভ তিথিতে আর রাহু কাল বাদ দিয়ে।',
  },
  muhuratNone: {
    en: 'The next few days have no clean window for {activity}; the Muhurat tab shows the following weeks.',
    hi: 'अगले कुछ दिनों में {activity} के लिए कोई साफ़ समय नहीं है; मुहूर्त टैब पर आगे के हफ़्ते देखें।',
    bn: 'সামনের কয়েক দিনে {activity}-এর জন্য পরিষ্কার সময় নেই; মুহূর্ত ট্যাবে পরের সপ্তাহগুলো দেখুন।',
  },
  muhuratMore: { en: "You'll find more options in the Muhurat tab.", hi: 'और विकल्प मुहूर्त टैब में मिलेंगे।', bn: 'আরও বিকল্প মুহূর্ত ট্যাবে পাবেন।' },
  muhuratDoctor: {
    en: 'For a surgery date, your doctor decides first; a muhurat only matters if the doctor gives you a choice.',
    hi: 'ऑपरेशन की तारीख़ पहले डॉक्टर तय करते हैं; मुहूर्त तभी मायने रखता है जब डॉक्टर विकल्प दें।',
    bn: 'অপারেশনের তারিখ আগে ডাক্তার ঠিক করেন; ডাক্তার বিকল্প দিলে তবেই মুহূর্ত দেখা যায়।',
  },

  // ─── Chart facts (the user's own terms) ──────────────────────────────────
  manglikYes: {
    en: "Yes: Mars sits in one of the classic 'manglik' positions in your chart.",
    hi: 'हाँ: आपके चार्ट में मंगल एक पारंपरिक मांगलिक स्थिति में है।',
    bn: 'হ্যাঁ: আপনার চার্টে মঙ্গল একটা প্রথাগত মাঙ্গলিক অবস্থানে আছে।',
  },
  manglikMild: {
    en: "Mildly: Mars touches a 'manglik' position from one point of view, not from your main one.",
    hi: 'हल्का सा: मंगल एक नज़रिए से मांगलिक स्थिति में है, मुख्य नज़रिए से नहीं।',
    bn: 'হালকাভাবে: মঙ্গল একটা দিক থেকে মাঙ্গলিক অবস্থানে, প্রধান দিক থেকে নয়।',
  },
  manglikCancelled: {
    en: "Mars sits in a 'manglik' position, but in your chart it is cancelled ({why}), so it doesn't apply.",
    hi: 'मंगल मांगलिक स्थिति में है, पर आपके चार्ट में यह रद्द हो जाता है ({why}), इसलिए यह लागू नहीं होता।',
    bn: 'মঙ্গল মাঙ্গলিক অবস্থানে আছে, তবে আপনার চার্টে তা কেটে যায় ({why}), তাই এটা খাটে না।',
  },
  manglikNo: {
    en: "No: Mars isn't in a 'manglik' position in your chart.",
    hi: 'नहीं: आपके चार्ट में मंगल मांगलिक स्थिति में नहीं है।',
    bn: 'না: আপনার চার্টে মঙ্গল মাঙ্গলিক অবস্থানে নেই।',
  },
  manglikMeaning: {
    en: "It's very common, about half of all charts, and in practice it just means matching charts carefully; it isn't a bad omen.",
    hi: 'यह बहुत आम है, लगभग आधी कुंडलियों में होता है, और असल में इसका मतलब बस कुंडली ध्यान से मिलाना है; यह कोई अशुभ संकेत नहीं।',
    bn: 'এটা খুবই সাধারণ, প্রায় অর্ধেক কুষ্ঠিতে থাকে, আর আসলে এর মানে শুধু কুষ্ঠি যত্ন করে মেলানো; এটা কোনো অশুভ লক্ষণ নয়।',
  },
  sadeIn: {
    en: "You're in sade sati now, in its {phase} phase; it ends around {end}.",
    hi: 'आप अभी साढ़ेसाती में हैं, इसके {phase} चरण में; यह लगभग {end} में खत्म होती है।',
    bn: 'আপনি এখন সাড়ে সাতির মধ্যে, তার {phase} পর্বে; এটা মোটামুটি {end}-এ শেষ হয়।',
  },
  sadeOut: {
    en: "You're not in sade sati now; the next one begins around {start}.",
    hi: 'आप अभी साढ़ेसाती में नहीं हैं; अगली लगभग {start} में शुरू होगी।',
    bn: 'আপনি এখন সাড়ে সাতির মধ্যে নেই; পরেরটা মোটামুটি {start}-এ শুরু হবে।',
  },
  sadeMeaning: {
    en: "It's a slower, effort-heavy phase, mainly for energy, mood and money; it does not stop marriage, jobs or studies.",
    hi: 'यह धीमा, ज़्यादा मेहनत माँगने वाला दौर है, ख़ासकर ऊर्जा, मन और पैसे के लिए; यह शादी, नौकरी या पढ़ाई नहीं रोकता।',
    bn: 'এটা একটু ধীর, পরিশ্রমের সময়, মূলত শক্তি, মন আর টাকার জন্য; এটা বিয়ে, চাকরি বা পড়াশোনা আটকায় না।',
  },
  sadeWhat: {
    en: "Sade sati is the roughly seven-and-a-half years when Saturn passes over your Moon sign and the signs either side of it.",
    hi: 'साढ़ेसाती वह लगभग साढ़े सात साल का समय है जब शनि आपकी चंद्र राशि और उसके दोनों ओर की राशियों से गुज़रता है।',
    bn: 'সাড়ে সাতি হলো প্রায় সাড়ে সাত বছরের সময়, যখন শনি আপনার চন্দ্ররাশি আর তার দুপাশের রাশি পার হয়।',
  },
  dashaNow: {
    en: "You're in the period (mahadasha) of {maha} until {end}, with the sub-period of {antar} until {aEnd}.",
    hi: 'अभी आपकी {maha} की महादशा {end} तक चल रही है, और उसमें {antar} की अंतर्दशा {aEnd} तक।',
    bn: 'এখন আপনার {maha}-এর মহাদশা {end} পর্যন্ত চলছে, তার মধ্যে {antar}-এর অন্তর্দশা {aEnd} পর্যন্ত।',
  },
  dashaMeaning: {
    en: 'In plain words, this period centres your life on {area}.',
    hi: 'सीधे शब्दों में, यह दौर आपके जीवन का ध्यान {area} पर रखता है।',
    bn: 'সহজ কথায়, এই পর্ব আপনার জীবনের মন টানে {area} দিকে।',
  },
  placement: {
    en: '{planet} in that part of your chart brings {nature} to your {area} side: {effect}',
    hi: 'चार्ट के उस हिस्से में {planet} आपके {area} वाले पहलू में {nature} लाता है: {effect}',
    bn: 'চার্টের ওই জায়গায় {planet} আপনার {area} দিকে {nature} আনে: {effect}',
  },

  // ─── Year summary, purpose ────────────────────────────────────────────────
  year: {
    en: '{year} looks strongest for {a1}{a2}: your best windows for them fall in it.',
    hi: '{year} में सबसे मज़बूत समय {a1}{a2} के लिए दिखता है: इनके सबसे अच्छे दौर इसी साल में आते हैं।',
    bn: '{year} সবচেয়ে জোরালো দেখায় {a1}{a2}-এর জন্য: এদের সবচেয়ে ভালো সময় এই বছরেই পড়ে।',
  },
  yearCareful: {
    en: 'Money and energy need a careful hand, since Saturn presses on your Moon sign then.',
    hi: 'उस समय पैसे और ऊर्जा को सँभालकर चलें, क्योंकि शनि आपकी चंद्र राशि पर दबाव डालता है।',
    bn: 'সে সময় টাকা আর শক্তি সাবধানে চালান, কারণ শনি তখন আপনার চন্দ্ররাশির ওপর চাপ দেয়।',
  },
  yearCycle: {
    en: 'A new part of your life cycle also begins in {month}, which shifts your focus toward {area}.',
    hi: '{month} में आपके जीवन-चक्र का एक नया हिस्सा भी शुरू होता है, जो ध्यान {area} की ओर ले जाता है।',
    bn: '{month}-এ আপনার জীবনচক্রের একটা নতুন অংশও শুরু হয়, যা মন টানে {area} দিকে।',
  },
  yearFocus: { en: 'Put {a1} first that year.', hi: 'उस साल {a1} को सबसे पहले रखें।', bn: 'সেই বছর {a1}-কে সবার আগে রাখুন।' },
  purposePractice: {
    en: 'A simple practice suits you: {practice}.',
    hi: 'आपके लिए एक सादा अभ्यास ठीक रहेगा: {practice}।',
    bn: 'আপনার জন্য একটা সহজ অনুশীলন ভালো: {practice}।',
  },

  // ─── Follow-ups ───────────────────────────────────────────────────────────
  fuWhyDasha: {
    en: 'That window is when the sub-period of {planet} runs, and it is tied to {topic} in your chart: {link}.',
    hi: 'उस समय {planetObl} की अंतर्दशा चलती है, जो आपके चार्ट में {topic} से जुड़ी है: {link}।',
    bn: 'ওই সময়ে {planetGen} অন্তর্দশা চলে, যা আপনার চার্টে {topic} সঙ্গে যুক্ত: {link}।',
  },
  interview: {
    en: "The result of this interview depends on how it went and on the company's needs; the chart only shows how strongly the period backs you.",
    hi: 'इस इंटरव्यू का नतीजा इस पर निर्भर है कि वह कैसा गया और कंपनी को क्या चाहिए; चार्ट सिर्फ़ यह दिखाता है कि यह समय आपका कितना साथ देता है।',
    bn: 'এই ইন্টারভিউয়ের ফল নির্ভর করে সেটা কেমন হয়েছে আর সংস্থার কী দরকার তার ওপর; চার্ট শুধু দেখায় সময়টা আপনার কতটা পাশে আছে।',
  },
  fuWhyDouble: {
    en: 'At the same time Jupiter and Saturn both back that side of your chart, the classic sign that things move.',
    hi: 'उसी समय बृहस्पति और शनि दोनों चार्ट के उस पहलू का साथ देते हैं, जो काम बनने का पुराना संकेत है।',
    bn: 'ঠিক তখনই বৃহস্পতি আর শনি দুজনেই চার্টের ওই দিকের পাশে থাকে, যা কাজ এগোনোর পুরনো লক্ষণ।',
  },
  fuWhyJupiter: {
    en: 'Jupiter, the planet of growth, also supports that side of your chart then.',
    hi: 'उस समय विकास का ग्रह बृहस्पति भी चार्ट के उस पहलू का साथ देता है।',
    bn: 'তখন বৃদ্ধির গ্রহ বৃহস্পতিও চার্টের ওই দিকের পাশে থাকে।',
  },
  fuWhyNoTransit: {
    en: 'Jupiter and Saturn add less then, so the life cycle does most of the work.',
    hi: 'उस समय बृहस्पति और शनि का योगदान कम है, इसलिए ज़्यादातर काम जीवन-चक्र करता है।',
    bn: 'তখন বৃহস্পতি আর শনির অবদান কম, তাই বেশিরভাগ কাজ করে জীবনচক্রই।',
  },
  fuLate: {
    en: 'It comes later because the life cycle running now points elsewhere: {now}.',
    hi: 'यह देर से इसलिए आता है क्योंकि अभी का जीवन-चक्र किसी और तरफ़ इशारा करता है: {now}।',
    bn: 'এটা দেরিতে আসে, কারণ এখনকার জীবনচক্র অন্য দিকে টানে: {now}।',
  },
  fuNearer: {
    en: 'A nearer option is {start} to {end}; it is softer, but worth using.',
    hi: 'इससे पहले {start} से {end} का एक विकल्प भी है; यह थोड़ा हल्का है, पर इसका फ़ायदा उठाना ठीक रहेगा।',
    bn: 'এর আগে {start} থেকে {end}-এর একটা বিকল্পও আছে; একটু হালকা, তবে কাজে লাগানো ভালো।',
  },
  fuNext: {
    en: 'After that, the next good period is {start} to {end}.',
    hi: 'उसके बाद अगला अच्छा दौर {start} से {end} तक है।',
    bn: 'তার পরের ভালো সময় {start} থেকে {end}।',
  },
  fuNowCycle: {
    en: 'Right now your sub-period of {planet} runs until {end}; it favours building skills and groundwork more than big moves.',
    hi: 'अभी {planetObl} की अंतर्दशा {end} तक चल रही है; यह बड़े कदमों से ज़्यादा हुनर और तैयारी के लिए अच्छी है।',
    bn: 'এখন {planetGen} অন্তর্দশা {end} পর্যন্ত চলছে; বড় পদক্ষেপের চেয়ে দক্ষতা আর প্রস্তুতির জন্য এটা ভালো।',
  },
  fuMoreArea: {
    en: 'Beyond this, your chart is also active for {area} from {start} to {end}.',
    hi: 'इसके अलावा आपका चार्ट {start} से {end} तक {area} के लिए भी सक्रिय है।',
    bn: 'এ ছাড়া {start} থেকে {end} পর্যন্ত আপনার চার্ট {areaGen} জন্যও সক্রিয়।',
  },
  fuRef: {
    en: 'Within the {start} to {end} window I mentioned,',
    hi: 'जिस {start} से {end} के समय की बात मैंने की,',
    bn: 'যে {start} থেকে {end}-এর সময়ের কথা বললাম,',
  },
  settleAbroad: {
    en: 'Your chart shows a real pull toward living abroad for the long term, not just trips.',
    hi: 'आपके चार्ट में सिर्फ़ यात्राएँ नहीं, लंबे समय तक विदेश में रहने का असली झुकाव दिखता है।',
    bn: 'আপনার চার্টে শুধু ভ্রমণ নয়, দীর্ঘদিন বিদেশে থাকার সত্যিকারের টান দেখা যায়।',
  },
  settleMixed: {
    en: 'Your chart favours work stints and travel abroad more than settling there for good.',
    hi: 'आपका चार्ट विदेश में हमेशा के लिए बसने से ज़्यादा काम के मौकों और यात्राओं का साथ देता है।',
    bn: 'আপনার চার্ট বিদেশে চিরকালের জন্য থিতু হওয়ার চেয়ে কাজের সুযোগ আর ভ্রমণের দিকে বেশি টানে।',
  },
  settleHome: {
    en: 'Your chart leans toward trips and study abroad, with your long-term base closer to home.',
    hi: 'आपका चार्ट विदेश यात्रा और पढ़ाई की ओर झुकता है, पर लंबे समय का ठिकाना घर के पास।',
    bn: 'আপনার চার্ট বিদেশ ভ্রমণ আর পড়াশোনার দিকে টানে, তবে দীর্ঘদিনের ঠিকানা বাড়ির কাছেই।',
  },
  optionLean: {
    en: 'Between {a} and {b}, your chart leans to {pick}: {why}.',
    hi: '{a} और {b} में से आपका चार्ट {pick} की ओर झुकता है: {why}।',
    bn: '{a} আর {b}-এর মধ্যে আপনার চার্ট {pick}-এর দিকে টানে: {why}।',
  },
  optionBoth: {
    en: 'Between {a} and {b}, your chart supports both about equally, so let your interest and a short trial decide.',
    hi: '{a} और {b} दोनों को आपका चार्ट लगभग बराबर साथ देता है, इसलिए अपनी रुचि और एक छोटे अनुभव से फ़ैसला करें।',
    bn: '{a} আর {b} দুটোকেই আপনার চার্ট প্রায় সমান সমর্থন করে, তাই নিজের আগ্রহ আর একটা ছোট অভিজ্ঞতা দিয়ে ঠিক করুন।',
  },
  loveLean: {
    en: 'Your chart leans toward {kind}: {why}.',
    hi: 'आपका चार्ट {kind} की ओर झुकता है: {why}।',
    bn: 'আপনার চার্ট {kind}-এর দিকে টানে: {why}।',
  },
  yogaCareer: {
    en: 'Your chart also has a supportive combination for status and work: {how}.',
    hi: 'आपके चार्ट में पद और काम के लिए एक सहायक योग भी है: {how}।',
    bn: 'আপনার চার্টে পদ আর কাজের জন্য একটা সহায়ক যোগও আছে: {how}।',
  },
  yogaMoney: {
    en: 'There is also a supportive combination for wealth: {how}.',
    hi: 'धन के लिए भी एक सहायक योग है: {how}।',
    bn: 'ধনের জন্যও একটা সহায়ক যোগ আছে: {how}।',
  },
  yogaSelf: {
    en: 'A supportive combination in your chart adds to this: {how}.',
    hi: 'आपके चार्ट का एक सहायक योग इसे और बढ़ाता है: {how}।',
    bn: 'আপনার চার্টের একটা সহায়ক যোগ এটাকে আরও বাড়ায়: {how}।',
  },
} satisfies Record<string, L3>;

export type CKey = keyof typeof C;

/** Plain descriptions of the yogas (rules.md §3.9): never their names unless the user used them. */
export const YOGA_PLAIN: Record<string, L3> = {
  gajakesari: { en: 'the planet of wisdom stands strongly with your Moon, a sign of support and good name', hi: 'ज्ञान का ग्रह आपके चंद्रमा के साथ मज़बूती से खड़ा है, जो सहारे और अच्छे नाम का संकेत है', bn: 'জ্ঞানের গ্রহ আপনার চাঁদের সঙ্গে জোরালোভাবে আছে, যা সমর্থন আর সুনামের লক্ষণ' },
  mahapurusha: { en: '{p} is at its own best in a prominent place, which gives a natural, strong style', hi: '{p} अपनी सबसे अच्छी स्थिति में एक प्रमुख जगह पर है, जो एक सहज, मज़बूत अंदाज़ देता है', bn: '{p} নিজের সেরা অবস্থায় একটা গুরুত্বপূর্ণ জায়গায় আছে, যা একটা স্বাভাবিক, জোরালো ধরন দেয়' },
  raja: { en: 'the planets that guide your status and your luck work together', hi: 'आपके पद और भाग्य को चलाने वाले ग्रह साथ मिलकर काम करते हैं', bn: 'আপনার পদ আর ভাগ্য চালানো গ্রহগুলো একসঙ্গে কাজ করে' },
  dhana: { en: 'the planets of your income and your luck are linked', hi: 'आपकी आमदनी और भाग्य के ग्रह आपस में जुड़े हैं', bn: 'আপনার আয় আর ভাগ্যের গ্রহগুলো পরস্পর যুক্ত' },
  viparita: { en: 'difficulties tend to turn into a rise after effort', hi: 'मुश्किलें मेहनत के बाद तरक्की में बदल जाती हैं', bn: 'কষ্টগুলো চেষ্টার পরে উন্নতিতে বদলে যায়' },
  parivartana: { en: 'two parts of your life support each other closely', hi: 'आपके जीवन के दो हिस्से एक-दूसरे का गहरा साथ देते हैं', bn: 'আপনার জীবনের দুটো দিক একে অপরের পাশে ঘনিষ্ঠভাবে থাকে' },
  neechaBhanga: { en: 'a weaker point in your chart is softened and can turn into strength with effort', hi: 'चार्ट का एक कमज़ोर पहलू नरम पड़ता है और मेहनत से ताकत बन सकता है', bn: 'চার্টের একটা দুর্বল দিক নরম হয়ে যায়, আর চেষ্টায় শক্তি হয়ে উঠতে পারে' },
};

/** Weekday names (0 = Sunday). */
export const WEEKDAY: Record<'en' | 'hi' | 'bn', string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  hi: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
  bn: ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'],
};
export const MONTH_SHORT: Record<'en' | 'hi' | 'bn', string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
};

export const COLOUR: Record<string, L3> = {
  orange: { en: 'orange', hi: 'नारंगी', bn: 'কমলা' }, white: { en: 'white', hi: 'सफ़ेद', bn: 'সাদা' }, red: { en: 'red', hi: 'लाल', bn: 'লাল' },
  green: { en: 'green', hi: 'हरा', bn: 'সবুজ' }, yellow: { en: 'yellow', hi: 'पीला', bn: 'হলুদ' }, blue: { en: 'blue', hi: 'नीला', bn: 'নীল' },
};

/** Planet names as people say them (remedies, lucky values, chart facts the user asked about by name). */
export const PLANET_PLAIN: Record<string, L3> = {
  Sun: { en: 'the Sun', hi: 'सूर्य', bn: 'সূর্য' }, Moon: { en: 'the Moon', hi: 'चंद्रमा', bn: 'চাঁদ' }, Mars: { en: 'Mars', hi: 'मंगल', bn: 'মঙ্গল' },
  Mercury: { en: 'Mercury', hi: 'बुध', bn: 'বুধ' }, Jupiter: { en: 'Jupiter', hi: 'बृहस्पति', bn: 'বৃহস্পতি' }, Venus: { en: 'Venus', hi: 'शुक्र', bn: 'শুক্র' },
  Saturn: { en: 'Saturn', hi: 'शनि', bn: 'শনি' }, Rahu: { en: 'Rahu', hi: 'राहु', bn: 'রাহু' }, Ketu: { en: 'Ketu', hi: 'केतु', bn: 'কেতু' },
};

export const GEM_OF: Record<string, L3> = {
  Sun: { en: 'ruby', hi: 'माणिक', bn: 'চুনি' }, Moon: { en: 'pearl', hi: 'मोती', bn: 'মুক্তো' }, Mars: { en: 'red coral', hi: 'मूंगा', bn: 'প্রবাল' },
  Mercury: { en: 'emerald', hi: 'पन्ना', bn: 'পান্না' }, Jupiter: { en: 'yellow sapphire', hi: 'पुखराज', bn: 'পোখরাজ' }, Venus: { en: 'diamond', hi: 'हीरा', bn: 'হীরে' },
  Saturn: { en: 'blue sapphire', hi: 'नीलम', bn: 'নীলা' }, Rahu: { en: 'hessonite', hi: 'गोमेद', bn: 'গোমেদ' }, Ketu: { en: "cat's eye", hi: 'लहसुनिया', bn: 'বৈদূর্য' },
};

export const ACTIVITY: Record<string, L3> = {
  work: { en: 'starting new work', hi: 'नया काम शुरू करने', bn: 'নতুন কাজ শুরু করা' },
  sign: { en: 'signing', hi: 'हस्ताक्षर करने', bn: 'সই করা' },
  buy: { en: 'buying', hi: 'खरीदारी', bn: 'কেনাকাটা' },
  travel: { en: 'travel', hi: 'यात्रा', bn: 'যাত্রা' },
};

export const VERDICT: Record<string, L3> = {
  excellent: { en: 'an excellent match', hi: 'बहुत अच्छा मिलान', bn: 'খুব ভালো মিল' },
  good: { en: 'a good match', hi: 'अच्छा मिलान', bn: 'ভালো মিল' },
  average: { en: 'an average match', hi: 'औसत मिलान', bn: 'মাঝারি মিল' },
  low: { en: 'a low score', hi: 'कम गुण', bn: 'কম গুণ' },
};

/** The eight kootas in plain words (strong side / area to work on). */
export const KOOTA_PLAIN: Record<string, { good: L3; work: L3 }> = {
  varna: { good: { en: 'similar values', hi: 'मिलते-जुलते मूल्य', bn: 'কাছাকাছি মূল্যবোধ' }, work: { en: 'respecting each other\'s priorities', hi: 'एक-दूसरे की प्राथमिकताओं का सम्मान', bn: 'একে অপরের অগ্রাধিকারকে সম্মান করা' } },
  vashya: { good: { en: 'a natural pull toward each other', hi: 'एक-दूसरे की ओर सहज खिंचाव', bn: 'একে অপরের প্রতি স্বাভাবিক টান' }, work: { en: 'sharing control fairly', hi: 'फ़ैसलों में बराबरी', bn: 'সিদ্ধান্তে সমান ভাগ' } },
  tara: { good: { en: 'good luck together', hi: 'साथ में अच्छा भाग्य', bn: 'একসঙ্গে ভালো ভাগ্য' }, work: { en: 'patience in difficult phases', hi: 'मुश्किल समय में धैर्य', bn: 'কঠিন সময়ে ধৈর্য' } },
  yoni: { good: { en: 'physical and everyday comfort', hi: 'रोज़मर्रा का सहज साथ', bn: 'রোজকার স্বচ্ছন্দ সঙ্গ' }, work: { en: 'everyday habits and comfort', hi: 'रोज़ की आदतें और सहजता', bn: 'রোজকার অভ্যাস আর স্বস্তি' } },
  maitri: { good: { en: 'friendly outlooks', hi: 'दोस्ताना सोच', bn: 'বন্ধুত্বপূর্ণ ভাবনা' }, work: { en: 'seeing things from each other\'s side', hi: 'एक-दूसरे का नज़रिया समझना', bn: 'একে অপরের দিক থেকে দেখা' } },
  gana: { good: { en: 'matching temperaments', hi: 'मिलते-जुलते स्वभाव', bn: 'মেলানো স্বভাব' }, work: { en: 'communication under stress', hi: 'तनाव में बातचीत', bn: 'চাপের মধ্যে কথা বলা' } },
  bhakoot: { good: { en: 'Moon signs that support each other', hi: 'एक-दूसरे का साथ देने वाली चंद्र राशियाँ', bn: 'একে অপরের সহায়ক চন্দ্ররাশি' }, work: { en: 'money and family plans', hi: 'पैसे और परिवार की योजनाएँ', bn: 'টাকা আর পরিবারের পরিকল্পনা' } },
  nadi: { good: { en: 'a healthy emotional rhythm', hi: 'भावनाओं का स्वस्थ तालमेल', bn: 'আবেগের সুস্থ ছন্দ' }, work: { en: 'giving each other space', hi: 'एक-दूसरे को जगह देना', bn: 'একে অপরকে জায়গা দেওয়া' } },
};
