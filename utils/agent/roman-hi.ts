/**
 * Hinglish (Latin-script Hindi) forms of the template sentences and their slot
 * values, written by hand (./roman.ts matches a Devanagari answer back to these
 * sentences). Each pair is [Devanagari sentence as in the tables, Hinglish].
 * {slots} must match on both sides. Style: everyday Hinglish as people type it
 * ("aapke liye", "sabse achha samay", "khaas kar"), planet names in their Hindi
 * form (Shani, Guru, Shukra), months in English, Latin digits.
 *
 * Keep in step with strings.ts, ask-strings.ts, category-strings.ts, routes.ts
 * and adapters/template.ts: a sentence changed there without its pair here
 * simply falls back to Devanagari (agent tests report the coverage).
 */
import { HI_ITEMS } from './roman-hi-items';

type P = readonly [string, string];

/** strings.ts: the timing paragraph, caveats and declines. */
const TIMING: P[] = [
  ['{who}{area} के लिए सबसे अच्छा समय {start} से {end} तक है, खासकर {peak} के आसपास।', '{who}{area} ke liye sabse achha samay {start} se {end} tak hai, khaas kar {peak} ke aas-paas.'],
  ['{who}हालात सबसे ज़्यादा {start} से {end} तक सुधरते हैं, खासकर {peak} के आसपास।', '{who}Haalaat sabse zyada {start} se {end} tak sudharte hain, khaas kar {peak} ke aas-paas.'],
  ['{who}{area} के लिए सबसे अच्छा समय {start} से {end} तक है, और सबसे संभावित महीना {peak} है।', '{who}{area} ke liye sabse achha samay {start} se {end} tak hai, aur sabse sambhavit mahina {peak} hai.'],
  ['{name} के लिए {area} का सबसे अच्छा समय {start} से {end} तक है, खासकर {peak} के आसपास।', '{name} ke liye {area} ka sabse achha samay {start} se {end} tak hai, khaas kar {peak} ke aas-paas.'],
  ['यह समय आपके जीवन के {P} वाले दौर में आता है, और {link}।', 'Yeh samay aapki zindagi ke {P} wale daur mein aata hai, aur {link}.'],
  ['यह समय आपके जीवन के {P} वाले दौर में आता है, जो आपके चार्ट में {area} से जुड़ा है।', 'Yeh samay aapki zindagi ke {P} wale daur mein aata hai, jo aapke chart mein {area} se juda hai.'],
  ['वह समय आपके जीवन के {P} वाले दौर में था, और {link}।', 'Woh samay aapki zindagi ke {P} wale daur mein tha, aur {link}.'],
  ['वह समय आपके जीवन के {P} वाले दौर में था, जो आपके चार्ट में {area} से जुड़ा है।', 'Woh samay aapki zindagi ke {P} wale daur mein tha, jo aapke chart mein {area} se juda hai.'],
  // Another person's chart (template.ts reasonParts swaps "आपके" for "{name} के").
  ['यह समय {name} के जीवन के {P} वाले दौर में आता है, और {link}।', 'Yeh samay {name} ki zindagi ke {P} wale daur mein aata hai, aur {link}.'],
  ['यह समय {name} के जीवन के {P} वाले दौर में आता है, जो {name2} के चार्ट में {area} से जुड़ा है।', 'Yeh samay {name} ki zindagi ke {P} wale daur mein aata hai, jo {name2} ke chart mein {area} se juda hai.'],
  ['उस समय गुरु और शनि दोनों का साथ भी मिलता है।', 'Us samay Guru aur Shani dono ka saath bhi milta hai.'],
  ['उस समय गुरु का साथ भी मिलता है।', 'Us samay Guru ka saath bhi milta hai.'],
  ['यह समय स्थिर है, बहुत मज़बूत नहीं; इससे मज़बूत दौर {start} से {end} तक है।', 'Yeh samay sthir hai, bahut mazboot nahi; isse mazboot daur {start} se {end} tak hai.'],
  ['यह समय स्थिर है, बहुत मज़बूत नहीं; इससे मज़बूत दौर {start} के आसपास आता है।', 'Yeh samay sthir hai, bahut mazboot nahi; isse mazboot daur {start} ke aas-paas aata hai.'],
  ['यह बहुत तेज़ नहीं, पर स्थिर समय है, इसलिए मेहनत मायने रखती है।', 'Yeh bahut tez nahi, par sthir samay hai, isliye mehnat maayne rakhti hai.'],
  ['इससे पहले {start} से {end} तक एक छोटा मौका भी है।', 'Isse pehle {start} se {end} tak ek chhota mauka bhi hai.'],
  ['उसके बाद अगला अच्छा दौर {start} से {end} तक है।', 'Uske baad agla achha daur {start} se {end} tak hai.'],
  ['हाँ, आने वाले महीनों में इसका अच्छा साथ है।', 'Haan, aane wale mahinon mein iska achha saath hai.'],
  ['आने वाले महीनों में इसका ज़्यादा ज़ोर नहीं दिखता; बेहतर समय थोड़ा बाद में है।', 'Aane wale mahinon mein iska zyada zor nahi dikhta; behtar samay thoda baad mein hai.'],
  ['इस साल नहीं; ज़्यादा मज़बूत समय बाद में आता है।', 'Is saal nahi; zyada mazboot samay baad mein aata hai.'],
  ['हाँ, आने वाले महीनों में इसका स्थिर साथ है, हालाँकि बहुत तेज़ ज़ोर नहीं।', 'Haan, aane wale mahinon mein iska sthir saath hai, haalanki bahut tez zor nahi.'],
  ['जन्म समय के बिना ये तारीखें अनुमानित हैं; उसे जोड़ने से ये और सटीक होंगी।', 'Janam samay ke bina ye tareekhen anumaanit hain; use jodne se ye aur sateek hongi.'],
  ['उससे पहले के महीने {name} की तैयारी के लिए अच्छे हैं।', 'Usse pehle ke mahine {name} ki taiyari ke liye achhe hain.'],
  ['कुंडली से दुर्घटना का अंदाज़ा नहीं लगाया जा सकता, और मैं इसका अनुमान नहीं लगाऊँगा। सामान्य सावधानी ही सबसे अच्छी सुरक्षा है; चाहें तो आने वाले साल के बारे में पूछिए।', 'Kundli se durghatna ka andaaza nahi lagaya ja sakta, aur main iska anumaan nahi lagaunga. Saamanya saavdhani hi sabse achhi suraksha hai; chahein to aane wale saal ke baare mein poochhiye.'],
  ['कोई भी ग्रह-गणना यह नहीं बता सकती कि कोई कितना जिएगा, और मैं इसका अंदाज़ा नहीं लगाऊँगा।', 'Koi bhi grah-ganana yeh nahi bata sakti ki koi kitna jiyega, aur main iska andaaza nahi lagaunga.'],
  ['{who}पीछे देखें तो {area} के लिए सबसे मज़बूत समय {start} से {end} तक था।', '{who}Peechhe dekhein to {area} ke liye sabse mazboot samay {start} se {end} tak tha.'],
  ['इसके लिए सबसे अच्छा समय {start} से {end} तक है, खासकर {peak} के आसपास।', 'Iske liye sabse achha samay {start} se {end} tak hai, khaas kar {peak} ke aas-paas.'],
  ['{start} से {end} के बीच सबसे संभावित महीना {peak} है।', '{start} se {end} ke beech sabse sambhavit mahina {peak} hai.'],
  ['पीछे देखें तो इसके लिए सबसे मज़बूत समय {start} से {end} तक था।', 'Peechhe dekhein to iske liye sabse mazboot samay {start} se {end} tak tha.'],
  ['{name} के लिए: ', '{name} ke liye: '],
  ['उस समय जीवन का वह दौर चलेगा जो {area} से जुड़ा है।', 'Us samay zindagi ka woh daur chalega jo {area} se juda hai.'],
  ['उसी समय दोनों बड़े, धीमे चलने वाले ग्रह इसका साथ देते हैं, जो काम बनने का पुराना संकेत है।', 'Usi samay dono bade, dheeme chalne wale grah iska saath dete hain, jo kaam banne ka purana sanket hai.'],
  ['उस समय विकास का ग्रह भी इसका साथ देता है।', 'Us samay vikas ka grah bhi iska saath deta hai.'],
  ['चार्ट में {area} के लिए अच्छा साथ दिखता है।', 'Chart mein {area} ke liye achha saath dikhta hai.'],
  ['चार्ट बताता है कि {area} के मामले में धैर्य रखना होगा; यह जल्दबाज़ी से नहीं, सही समय पर होगा।', 'Chart batata hai ki {area} ke maamle mein dhairya rakhna hoga; yeh jaldbaazi se nahi, sahi samay par hoga.'],
  ['अगले पाँच साल में कोई बहुत मज़बूत समय नहीं दिखता, इसलिए यह शांत दौरों में सबसे अच्छा है।', 'Agle paanch saal mein koi bahut mazboot samay nahi dikhta, isliye yeh shaant dauron mein sabse achha hai.'],
  ['इससे मज़बूत समय {start} के आसपास आता है।', 'Isse mazboot samay {start} ke aas-paas aata hai.'],
  ['वह समय अभी थोड़ा दूर है; उससे पहले के साल तैयारी के लिए अच्छे हैं।', 'Woh samay abhi thoda door hai; usse pehle ke saal taiyari ke liye achhe hain.'],
  ['अगर वह समय निकल जाए, तो अगला अच्छा दौर {start} से {end} तक है।', 'Agar woh samay nikal jaaye, to agla achha daur {start} se {end} tak hai.'],
  ['जन्म का समय सहेजा नहीं है, इसलिए ये तारीखें अनुमान हैं। सटीक जवाब के लिए प्रोफ़ाइल में जन्म समय जोड़ें।', 'Janam ka samay save nahi hai, isliye ye tareekhen anumaan hain. Sateek jawab ke liye profile mein janam samay jodein.'],
  ['जन्म स्थान सहेजा नहीं है, इसलिए ये तारीखें अनुमान हैं।', 'Janam sthaan save nahi hai, isliye ye tareekhen anumaan hain.'],
  ['ग्रहों की चाल से महीना और समय-सीमा बताई जा सकती है, कोई एक तारीख नहीं।', 'Grahon ki chaal se mahina aur samay-seema batayi ja sakti hai, koi ek tareekh nahi.'],
  ['{age} साल की उम्र में शादी या प्रेम से ज़्यादा पढ़ाई, दोस्तों और परिवार पर ध्यान देने का समय है।', '{age} saal ki umar mein shaadi ya prem se zyada padhai, doston aur parivaar par dhyaan dene ka samay hai.'],
  ['इस उम्र के लिए संतान के जन्म का समय बताना ठीक नहीं। परिवार की खुशियों और घर के आने वाले सालों के बारे में पूछिए।', 'Is umar ke liye santaan ke janam ka samay batana theek nahi. Parivaar ki khushiyon aur ghar ke aane wale saalon ke baare mein poochhiye.'],
  ['कोई भी ग्रह-गणना यह नहीं बता सकती कि कोई कितना जिएगा, इसलिए इसका अंदाज़ा लगाना ठीक नहीं। अगर सेहत या भविष्य को लेकर चिंता है, तो आने वाले सालों के बारे में पूछें, और सेहत के लिए डॉक्टर से ज़रूर मिलें।', 'Koi bhi grah-ganana yeh nahi bata sakti ki koi kitna jiyega, isliye iska andaaza lagana theek nahi. Agar sehat ya bhavishya ko lekar chinta hai, to aane wale saalon ke baare mein poochhein, aur sehat ke liye doctor se zaroor milein.'],
  ['इसका जवाब देने के लिए मुझे उनके अपने जन्म का ब्योरा चाहिए। उन्हें प्रोफ़ाइल में जोड़ें और फिर उनकी चैट में पूछें। यहाँ जो चार्ट खुला है, वह {owner} है।', 'Iska jawab dene ke liye mujhe unke apne janam ka byora chahiye. Unhe profile mein jodein aur phir unki chat mein poochhein. Yahan jo chart khula hai, woh {owner} hai.'],
  ['आपका', 'aapka'],
  ['{name} का', '{name} ka'],
  ['मैं तुम्हारे साथ हूँ। इस श्लोक के साथ एक पल ठहरो; यह उसी बात से जुड़ा है जो तुम्हारे मन में है।', 'Main tumhare saath hoon. Is shlok ke saath ek pal thehro; yeh usi baat se juda hai jo tumhare mann mein hai.'],
  ['जीवन के किसी भी हिस्से के बारे में "कब" पूछिए, चार्ट में सबसे अच्छा समय ढूँढ़कर बताया जाएगा।', 'Zindagi ke kisi bhi hisse ke baare mein "kab" poochhiye, chart mein sabse achha samay dhoondh kar bataya jayega.'],
  ['मैं ठीक हूँ, धन्यवाद!', 'Main theek hoon, dhanyavaad!'],
  // template.ts: loan approval tip, elder tips, link clauses, why-now, love even, job tip.
  ['तब तक हर किस्त समय पर चुकाएँ और खर्च बजट में रखें; लोन देने वाले सबसे पहले यही रिकॉर्ड देखते हैं।', 'Tab tak har kisht samay par chukayein aur kharcha budget mein rakhein; loan dene wale sabse pehle yahi record dekhte hain.'],
  ['उससे पहले उन लोगों से संपर्क करें जो आपका काम जानते हैं; सलाह, मार्गदर्शन या पार्ट-टाइम काम इस दौर में अच्छे रहते हैं।', 'Usse pehle un logon se sampark karein jo aapka kaam jaante hain; salah, margdarshan ya part-time kaam is daur mein achhe rehte hain.'],
  ['उससे पहले अपने अनुभव को सामने आने दें: दूसरों को राह दिखाएँ और वह काम लें जिसे आप सबसे अच्छा जानते हैं।', 'Usse pehle apne anubhav ko saamne aane dein: doosron ko raah dikhayein aur woh kaam lein jise aap sabse achha jaante hain.'],
  ['उससे पहले पढ़ने या अभ्यास का एक शांत, नियमित क्रम उस समय सबसे ज़्यादा काम आएगा।', 'Usse pehle padhne ya abhyaas ka ek shaant, niyamit kram us samay sabse zyada kaam aayega.'],
  ['{p} आपके {area} वाले पहलू में बैठा है', '{p} aapke {area} wale pehlu mein baitha hai'],
  ['{p} आपके {area} वाले पहलू को चलाता है', '{p} aapke {area} wale pehlu ko chalata hai'],
  ['{p} की नज़र आपके {area} वाले पहलू पर है', '{p} ki nazar aapke {area} wale pehlu par hai'],
  ['{p} आपके {area} वाले पहलू के स्वामी ग्रह के साथ है', '{p} aapke {area} wale pehlu ke swami grah ke saath hai'],
  ['{p} स्वाभाविक रूप से {topic} से जुड़ा है', '{p} swabhavik roop se {topic} se juda hai'],
  ['{p} {name} के {area} वाले पहलू में बैठा है', '{p} {name} ke {area} wale pehlu mein baitha hai'],
  ['{p} {name} के {area} वाले पहलू को चलाता है', '{p} {name} ke {area} wale pehlu ko chalata hai'],
  ['{p} की नज़र {name} के {area} वाले पहलू पर है', '{p} ki nazar {name} ke {area} wale pehlu par hai'],
  ['{p} {name} के {area} वाले पहलू के स्वामी ग्रह के साथ है', '{p} {name} ke {area} wale pehlu ke swami grah ke saath hai'],
  ['आपका चार्ट किसी एक तरफ़ ज़्यादा नहीं झुकता, इसलिए सबसे सहज रास्ता है: {item}।', 'Aapka chart kisi ek taraf zyada nahi jhukta, isliye sabse sahaj raasta hai: {item}.'],
  ['इस दौर में ये गुण सलाह, मार्गदर्शन या पार्ट-टाइम काम में सबसे अच्छे लगते हैं; ऐसा काम चुनें जो बिना थकाए आपको जोड़े रखे।', 'Is daur mein ye gun salah, margdarshan ya part-time kaam mein sabse achhe lagte hain; aisa kaam chunein jo bina thakaye aapko jode rakhe.'],
  ['पहले किसी नौकरी में आगे बढ़ें; कोई साइड काम करना हो तो उसे छोटा और पार्ट-टाइम रखें।', 'Pehle kisi naukri mein aage badhein; koi side kaam karna ho to use chhota aur part-time rakhein.'],
  ['इसकी मुख्य वजह है: {x}।', 'Iski mukhya wajah hai: {x}.'],
  ['हाँ, इसमें शनि की भूमिका है: {x}।', 'Haan, ismein Shani ki bhoomika hai: {x}.'],
  ['अभी शनि मुख्य दबाव नहीं है; बड़ी वजह है: {x}।', 'Abhi Shani mukhya dabaav nahi hai; badi wajah hai: {x}.'],
  ['इसके साथ: {x}।', 'Iske saath: {x}.'],
  ['इस दौर के साथ चलने का एक मुफ़्त, पारंपरिक तरीका: {practice}।', 'Is daur ke saath chalne ka ek muft, paaramparik tareeka: {practice}.'],
  ['शनि चीज़ों को धीमा करता है और धैर्य परखता है; यह नतीजे रोकता नहीं, नियमित मेहनत का फल देता है।', 'Shani cheezon ko dheema karta hai aur dhairya parakhta hai; yeh nateeje rokta nahi, niyamit mehnat ka phal deta hai.'],
  ['यह एक दौर है जिसका अंत तय है, आपके बारे में कोई फ़ैसला नहीं।', 'Yeh ek daur hai jiska ant tay hai, aapke baare mein koi faisla nahi.'],
];

export const ROMAN_HI: readonly P[] = [...TIMING, ...HI_ITEMS];
