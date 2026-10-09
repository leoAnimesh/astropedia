/**
 * Display-only localisation of places (Hindi / Bengali).
 *
 * Stored places ("City, State, Country") and coordinates ALWAYS keep the English
 * names from the place data (utils/places.ts; profiles from earlier builds keep
 * their older spellings) — utils/timezone.ts derives the time zone from them. Everything here maps English -> a label for the screen and falls back to
 * the English original when there is no entry. Countries: full table (generated);
 * states: India + Bangladesh; cities: major Indian and Bangladeshi cities.
 * Pure TypeScript; safe under Node.
 */
import { COUNTRY_NAMES } from '@/constants/country-names';
import { countryCodeFromName } from '@/utils/timezone';

type Lng = string; // 'en' | 'hi' | 'bn'
type Pair = [hi: string, bn: string];

// ─── States (keyed by country code, then English name from the data) ─────────
// Older spellings stay so profiles saved by earlier builds still localise.

const STATES: Record<string, Record<string, Pair>> = {
  IN: {
    'Andaman and Nicobar Islands': ['अंडमान और निकोबार द्वीपसमूह', 'আন্দামান ও নিকোবর দ্বীপপুঞ্জ'],
    'Andaman and Nicobar': ['अंडमान और निकोबार', 'আন্দামান ও নিকোবর'],
    'Andhra Pradesh': ['आंध्र प्रदेश', 'অন্ধ্রপ্রদেশ'],
    'Arunachal Pradesh': ['अरुणाचल प्रदेश', 'অরুণাচল প্রদেশ'],
    'Assam': ['असम', 'অসম'],
    'Bihar': ['बिहार', 'বিহার'],
    'Chandigarh': ['चंडीगढ़', 'চণ্ডীগড়'],
    'Chhattisgarh': ['छत्तीसगढ़', 'ছত্তিশগড়'],
    'Dadra and Nagar Haveli and Daman and Diu': ['दादरा और नगर हवेली और दमन और दीव', 'দাদরা ও নগর হাভেলি এবং দমন ও দিউ'],
    'Delhi': ['दिल्ली', 'দিল্লি'],
    'Goa': ['गोवा', 'গোয়া'],
    'Gujarat': ['गुजरात', 'গুজরাত'],
    'Haryana': ['हरियाणा', 'হরিয়ানা'],
    'Himachal Pradesh': ['हिमाचल प्रदेश', 'হিমাচল প্রদেশ'],
    'Jammu and Kashmir': ['जम्मू और कश्मीर', 'জম্মু ও কাশ্মীর'],
    'Jharkhand': ['झारखंड', 'ঝাড়খণ্ড'],
    'Karnataka': ['कर्नाटक', 'কর্ণাটক'],
    'Kerala': ['केरल', 'কেরল'],
    'Ladakh': ['लद्दाख', 'লাদাখ'],
    'Lakshadweep': ['लक्षद्वीप', 'লাক্ষাদ্বীপ'],
    'Madhya Pradesh': ['मध्य प्रदेश', 'মধ্যপ্রদেশ'],
    'Maharashtra': ['महाराष्ट्र', 'মহারাষ্ট্র'],
    'Manipur': ['मणिपुर', 'মণিপুর'],
    'Meghalaya': ['मेघालय', 'মেঘালয়'],
    'Mizoram': ['मिज़ोरम', 'মিজোরাম'],
    'Nagaland': ['नागालैंड', 'নাগাল্যান্ড'],
    'Odisha': ['ओडिशा', 'ওড়িশা'],
    'Puducherry': ['पुदुचेरी', 'পুদুচেরি'],
    'Punjab': ['पंजाब', 'পাঞ্জাব'],
    'Rajasthan': ['राजस्थान', 'রাজস্থান'],
    'Sikkim': ['सिक्किम', 'সিকিম'],
    'Tamil Nadu': ['तमिलनाडु', 'তামিলনাড়ু'],
    'Telangana': ['तेलंगाना', 'তেলঙ্গানা'],
    'Tripura': ['त्रिपुरा', 'ত্রিপুরা'],
    'Uttar Pradesh': ['उत्तर प्रदेश', 'উত্তরপ্রদেশ'],
    'Uttarakhand': ['उत्तराखंड', 'উত্তরাখণ্ড'],
    'West Bengal': ['पश्चिम बंगाल', 'পশ্চিমবঙ্গ'],
  },
  BD: {
    'Barisal Division': ['बरिशाल विभाग', 'বরিশাল বিভাগ'],
    'Chittagong Division': ['चटगाँव विभाग', 'চট্টগ্রাম বিভাগ'],
    'Chittagong': ['चटगाँव', 'চট্টগ্রাম'],
    'Dhaka Division': ['ढाका विभाग', 'ঢাকা বিভাগ'],
    'Khulna Division': ['खुलना विभाग', 'খুলনা বিভাগ'],
    'Mymensingh Division': ['मयमनसिंह विभाग', 'ময়মনসিংহ বিভাগ'],
    'Rajshahi Division': ['राजशाही विभाग', 'রাজশাহী বিভাগ'],
    'Rangpur Division': ['रंगपुर विभाग', 'রংপুর বিভাগ'],
    'Sylhet Division': ['सिलहट विभाग', 'সিলেট বিভাগ'],
    'Barisal District': ['बरिशाल ज़िला', 'বরিশাল জেলা'],
    'Chittagong District': ['चटगाँव ज़िला', 'চট্টগ্রাম জেলা'],
    'Dhaka District': ['ढाका ज़िला', 'ঢাকা জেলা'],
    'Khulna District': ['खुलना ज़िला', 'খুলনা জেলা'],
    'Mymensingh District': ['मयमनसिंह ज़िला', 'ময়মনসিংহ জেলা'],
    'Rajshahi District': ['राजशाही ज़िला', 'রাজশাহী জেলা'],
    'Rangpur District': ['रंगपुर ज़िला', 'রংপুর জেলা'],
    'Sylhet District': ['सिलहट ज़िला', 'সিলেট জেলা'],
  },
};

// ─── Cities (keyed by country code, then English name from the data) ─────────

const CITIES: Record<string, Record<string, Pair>> = {
  IN: {
    'Mumbai': ['मुंबई', 'মুম্বই'],
    'Delhi': ['दिल्ली', 'দিল্লি'],
    'New Delhi': ['नई दिल्ली', 'নতুন দিল্লি'],
    'Kolkata': ['कोलकाता', 'কলকাতা'],
    'Bengaluru': ['बेंगलुरु', 'বেঙ্গালুরু'],
    'Chennai': ['चेन्नई', 'চেন্নাই'],
    'Hyderabad': ['हैदराबाद', 'হায়দরাবাদ'],
    'Pune': ['पुणे', 'পুণে'],
    'Ahmedabad': ['अहमदाबाद', 'আহমেদাবাদ'],
    'Jaipur': ['जयपुर', 'জয়পুর'],
    'Lucknow': ['लखनऊ', 'লখনউ'],
    'Kanpur': ['कानपुर', 'কানপুর'],
    'Nagpur': ['नागपुर', 'নাগপুর'],
    'Indore': ['इंदौर', 'ইন্দোর'],
    'Bhopal': ['भोपाल', 'ভোপাল'],
    'Patna': ['पटना', 'পাটনা'],
    'Surat': ['सूरत', 'সুরাত'],
    'Varanasi': ['वाराणसी', 'বারাণসী'],
    'Visakhapatnam': ['विशाखापत्तनम', 'বিশাখাপত্তনম'],
    'Thane': ['ठाणे', 'থানে'],
    'Vadodara': ['वडोदरा', 'ভদোদরা'],
    'Ghaziabad': ['गाज़ियाबाद', 'গাজিয়াবাদ'],
    'Ludhiana': ['लुधियाना', 'লুধিয়ানা'],
    'Agra': ['आगरा', 'আগ্রা'],
    'Nashik': ['नाशिक', 'নাসিক'],
    'Faridabad': ['फ़रीदाबाद', 'ফরিদাবাদ'],
    'Meerut': ['मेरठ', 'মীরাট'],
    'Rajkot': ['राजकोट', 'রাজকোট'],
    'Amritsar': ['अमृतसर', 'অমৃতসর'],
    'Allahabad': ['इलाहाबाद', 'এলাহাবাদ'],
    'Prayagraj': ['प्रयागराज', 'প্রয়াগরাজ'],
    'Prayagraj (Allahabad)': ['प्रयागराज (इलाहाबाद)', 'প্রয়াগরাজ (এলাহাবাদ)'],
    'Ranchi': ['राँची', 'রাঁচি'],
    'Howrah': ['हावड़ा', 'হাওড়া'],
    'Coimbatore': ['कोयंबटूर', 'কোয়েম্বাটুর'],
    'Jabalpur': ['जबलपुर', 'জব্বলপুর'],
    'Gwalior': ['ग्वालियर', 'গোয়ালিয়র'],
    'Vijayawada': ['विजयवाड़ा', 'বিজয়ওয়াড়া'],
    'Jodhpur': ['जोधपुर', 'যোধপুর'],
    'Madurai': ['मदुरै', 'মাদুরাই'],
    'Raipur': ['रायपुर', 'রায়পুর'],
    'Kota': ['कोटा', 'কোটা'],
    'Guwahati': ['गुवाहाटी', 'গুয়াহাটি'],
    'Chandigarh': ['चंडीगढ़', 'চণ্ডীগড়'],
    'Gurgaon': ['गुड़गांव', 'গুরগাঁও'],
    'Gurugram': ['गुरुग्राम', 'গুরুগ্রাম'],
    'Noida': ['नोएडा', 'নয়ডা'],
    'Solapur': ['सोलापुर', 'সোলাপুর'],
    'Sholapur': ['सोलापुर', 'সোলাপুর'],
    'Tiruchirappalli': ['तिरुचिरापल्ली', 'তিরুচিরাপল্লি'],
    'Bareilly': ['बरेली', 'বেরেলি'],
    'Aligarh': ['अलीगढ़', 'আলিগড়'],
    'Moradabad': ['मुरादाबाद', 'মোরাদাবাদ'],
    'Gorakhpur': ['गोरखपुर', 'গোরখপুর'],
    'Bhubaneshwar': ['भुवनेश्वर', 'ভুবনেশ্বর'],
    'Bhubaneswar': ['भुवनेश्वर', 'ভুবনেশ্বর'],
    'Salem': ['सेलम', 'সালেম'],
    'Warangal': ['वारंगल', 'ওয়ারঙ্গল'],
    'Thiruvananthapuram': ['तिरुवनंतपुरम', 'তিরুবনন্তপুরম'],
    'Cochin': ['कोच्चि', 'কোচি'],
    'Kochi': ['कोच्चि', 'কোচি'],
    'Dehradun': ['देहरादून', 'দেরাদুন'],
    'Jamshedpur': ['जमशेदपुर', 'জামশেদপুর'],
    'Dhanbad': ['धनबाद', 'ধানবাদ'],
    'Asansol': ['आसनसोल', 'আসানসোল'],
    'Durgapur': ['दुर्गापुर', 'দুর্গাপুর'],
    'Siliguri': ['सिलीगुड़ी', 'শিলিগুড়ি'],
    'Srinagar': ['श्रीनगर', 'শ্রীনগর'],
    'Jammu': ['जम्मू', 'জম্মু'],
    'Shimla': ['शिमला', 'শিমলা'],
    'Panaji': ['पणजी', 'পানাজি'],
    'Panjim': ['पणजी', 'পানাজি'],
    'Mangaluru': ['मंगलुरु', 'মাঙ্গালুরু'],
    'Cuttack': ['कटक', 'কটক'],
    'Gaya': ['गया', 'গয়া'],
    'Kharagpur': ['खड़गपुर', 'খড়্গপুর'],
    'Darjeeling': ['दार्जिलिंग', 'দার্জিলিং'],
    'Darjiling': ['दार्जिलिंग', 'দার্জিলিং'],
    'Haridwar': ['हरिद्वार', 'হরিদ্বার'],
    'Ujjain': ['उज्जैन', 'উজ্জয়িনী'],
    'Mathura': ['मथुरा', 'মথুরা'],
    'Ayodhya': ['अयोध्या', 'অযোধ্যা'],
    'Puri': ['पुरी', 'পুরী'],
  },
  BD: {
    'Dhaka': ['ढाका', 'ঢাকা'],
    'Chittagong': ['चटगाँव', 'চট্টগ্রাম'],
    'Chattogram': ['चटगाँव', 'চট্টগ্রাম'],
    'Khulna': ['खुलना', 'খুলনা'],
    'Rajshahi': ['राजशाही', 'রাজশাহী'],
    'Sylhet': ['सिलहट', 'সিলেট'],
    'Barisal': ['बरिशाल', 'বরিশাল'],
    'Barishal': ['बरिशाल', 'বরিশাল'],
    'Rangpur': ['रंगपुर', 'রংপুর'],
    'Mymensingh': ['मयमनसिंह', 'ময়মনসিংহ'],
    'Comilla': ['कुमिल्ला', 'কুমিল্লা'],
    'Narayanganj': ['नारायणगंज', 'নারায়ণগঞ্জ'],
    'Gazipur': ['गाज़ीपुर', 'গাজীপুর'],
    'Bogra': ['बोगरा', 'বগুড়া'],
    'Jessore': ['जेसोर', 'যশোর'],
    "Cox's Bazar": ['कॉक्स बाज़ार', 'কক্সবাজার'],
    'Dinajpur': ['दिनाजपुर', 'দিনাজপুর'],
    'Tangail': ['टांगाइल', 'টাঙ্গাইল'],
    'Pabna': ['पाबना', 'পাবনা'],
    'Faridpur': ['फ़रीदपुर', 'ফরিদপুর'],
    'Kushtia': ['कुश्तिया', 'কুষ্টিয়া'],
    'Noakhali': ['नोआखाली', 'নোয়াখালী'],
  },
};

// ─── Lookups ──────────────────────────────────────────────────────────────────

const pick = (p: Pair | undefined, lng: Lng): string | null =>
  !p ? null : lng === 'hi' ? p[0] : lng === 'bn' ? p[1] : null;

/** Localised country name from its ISO code; English fallback. */
export function localCountryName(code: string, english: string, lng: Lng): string {
  const e = COUNTRY_NAMES[code];
  return (lng === 'hi' ? e?.hi : lng === 'bn' ? e?.bn : undefined) ?? english;
}

export function localStateName(countryCode: string, english: string, lng: Lng): string {
  return pick(STATES[countryCode]?.[english], lng) ?? english;
}

export function localCityName(countryCode: string, english: string, lng: Lng): string {
  return pick(CITIES[countryCode]?.[english], lng) ?? english;
}

/**
 * Display version of a stored place string ("City, State, Country"). Parts it
 * does not know stay as-is. NEVER store or parse the result — display only.
 */
export function localizePlace(place: string, lng: Lng): string {
  if (!place || (lng !== 'hi' && lng !== 'bn')) return place;
  const parts = place.split(',').map((s) => s.trim());
  const cc = countryCodeFromName(parts[parts.length - 1] ?? '');
  if (!cc) return place;
  return parts
    .map((part, i) => {
      if (i === parts.length - 1) return localCountryName(cc, part, lng);
      const asState = localStateName(cc, part, lng);
      return asState !== part ? asState : localCityName(cc, part, lng);
    })
    .join(', ');
}
