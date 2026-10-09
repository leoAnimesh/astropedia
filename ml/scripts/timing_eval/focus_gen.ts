// GURU_CONTEXT_FOCUS eval: does sending a guru only its chart lines (utils/guru-context.ts
// focusContext) hurt astro-gemma v2.1? Prompts are built exactly as the app builds them
// (buildPlan → gemma21 sagaSystem, line-bottom timing line), in three variants:
//   full   the whole v2 context (shipped: GURU_CONTEXT_FOCUS off)
//   guru   the guru's own areas + transits (constants/gurus.ts `context`)
//   plan   AnswerPlan.focus: the guru's lines plus the question topic's area (utils/agent/plan.ts planFocus)
// Two sets: the timing set of eval_gen.ts (10 profiles x 7 "when" questions, en/hi/bn rotating,
// 4 todays), each asked to the topic's guru; and 40 non-timing guru questions
// (love / career / health / family / study x 8) in en, hi and bn, profiles rotating.
// Usage (from this folder; OUT = a work dir):
//   OUT=/tmp/fe TZ=Asia/Kolkata node --no-warnings --import ./hooks.mjs focus_gen.ts
//   ../../.venv/bin/python run_pte.py /tmp/fe/prompts.jsonl /tmp/fe/answers.jsonl
//   ../../.venv/bin/python focus_score.py /tmp/fe/prompts.jsonl /tmp/fe/answers.jsonl
import { readFileSync, writeFileSync } from 'node:fs';
import { sagaSystem } from '/Users/animesh/Developer/projects/astropedia/utils/agent/adapters/gemma21-prompt.ts';
import { buildPlan } from '/Users/animesh/Developer/projects/astropedia/utils/agent/plan.ts';
import { GURUS, type AgentId } from '/Users/animesh/Developer/projects/astropedia/constants/gurus.ts';
import type { TimingTopic } from '/Users/animesh/Developer/projects/astropedia/utils/timing-engine.ts';

const SP = process.env.OUT ?? '.';
const profiles = readFileSync('/Users/animesh/Developer/projects/astropedia/ml/data/eval_timing_profiles.jsonl', 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(p => !['e03_minor_f', 'e06_son_child'].includes(p.id));
type L = 'en' | 'hi' | 'bn';
const LANGS: L[] = ['en', 'hi', 'bn'];
const TODAYS = ['2026-10-09', '2027-04-15', '2027-11-20', '2028-06-10'];

const TIMING_Q: Record<string, Record<L, string>> = {
  marriage: { en: 'When will I get married?', hi: 'मेरी शादी कब होगी?', bn: 'আমার বিয়ে কবে হবে?' },
  job: { en: 'When will I get a new job?', hi: 'मुझे नई नौकरी कब मिलेगी?', bn: 'আমি নতুন চাকরি কবে পাব?' },
  money: { en: 'When will my money situation improve?', hi: 'मेरी आर्थिक स्थिति कब सुधरेगी?', bn: 'আমার টাকাপয়সার অবস্থা কবে ভালো হবে?' },
  promotion: { en: 'When will I get a promotion?', hi: 'मेरा प्रमोशन कब होगा?', bn: 'আমার প্রমোশন কবে হবে?' },
  property: { en: 'When can I buy my own house?', hi: 'मैं अपना घर कब खरीद पाऊंगा?', bn: 'আমি নিজের বাড়ি কবে কিনতে পারব?' },
  foreign: { en: 'When will I go abroad?', hi: 'मैं विदेश कब जाऊंगा?', bn: 'আমি বিদেশে কবে যাব?' },
  children: { en: 'When will we have a child?', hi: 'हमारी संतान कब होगी?', bn: 'আমাদের সন্তান কবে হবে?' },
  education: { en: 'When is a good time for further studies?', hi: 'आगे की पढ़ाई के लिए अच्छा समय कब है?', bn: 'আরও পড়াশোনার জন্য ভালো সময় কবে?' },
  business: { en: 'When should I start my own business?', hi: 'मैं अपना बिज़नेस कब शुरू करूं?', bn: 'আমি নিজের ব্যবসা কবে শুরু করব?' },
  love: { en: 'When will I find love?', hi: 'मुझे प्यार कब मिलेगा?', bn: 'আমি কবে ভালোবাসা পাব?' },
};
const TOPIC_AGENT: Record<string, AgentId> = {
  marriage: 'love', love: 'love', job: 'career', promotion: 'career', money: 'career', business: 'career',
  foreign: 'career', property: 'family', children: 'family', education: 'study', health: 'health',
};

// [en, hi, bn] per question; no relation words (they route to "add their profile") and no "when".
const GURU_Q: Record<string, [string, string, string][]> = {
  love: [
    ['What kind of partner suits me?', 'मेरे लिए कैसा जीवनसाथी सही रहेगा?', 'আমার জন্য কেমন জীবনসঙ্গী ভালো হবে?'],
    ['Why do my relationships keep ending?', 'मेरे रिश्ते बार-बार क्यों टूट जाते हैं?', 'আমার সম্পর্কগুলো বারবার কেন ভেঙে যায়?'],
    ['Is a love marriage or an arranged marriage better for me?', 'मेरे लिए लव मैरिज अच्छी है या अरेंज्ड मैरिज?', 'আমার জন্য প্রেমের বিয়ে ভালো না সম্বন্ধ করে বিয়ে?'],
    ['How can I make my relationship stronger?', 'मैं अपना रिश्ता और मज़बूत कैसे करूँ?', 'আমার সম্পর্ক আরও মজবুত কীভাবে করব?'],
    ['Will my married life be happy?', 'क्या मेरा वैवाहिक जीवन सुखी रहेगा?', 'আমার বিবাহিত জীবন কি সুখের হবে?'],
    ['Why do I find it hard to open up in love?', 'प्यार में दिल की बात कहना मुझे मुश्किल क्यों लगता है?', 'ভালোবাসায় মনের কথা বলতে আমার কেন কষ্ট হয়?'],
    ['What does my chart say about romance?', 'मेरी कुंडली प्रेम के बारे में क्या कहती है?', 'আমার চার্ট প্রেম নিয়ে কী বলে?'],
    ['Should I give my relationship another chance?', 'क्या मुझे अपने रिश्ते को एक और मौका देना चाहिए?', 'আমার সম্পর্ককে কি আরেকটা সুযোগ দেওয়া উচিত?'],
  ],
  career: [
    ['What kind of work suits me best?', 'मेरे लिए कौन सा काम सबसे अच्छा है?', 'আমার জন্য কোন ধরনের কাজ সবচেয়ে ভালো?'],
    ['Should I switch my job or stay?', 'नौकरी बदलूँ या यहीं रहूँ?', 'চাকরি বদলাব না এখানেই থাকব?'],
    ['Is business or a job better for me?', 'मेरे लिए बिज़नेस अच्छा है या नौकरी?', 'আমার জন্য ব্যবসা ভালো না চাকরি?'],
    ['Why am I not getting recognition at work?', 'मुझे काम में पहचान क्यों नहीं मिल रही?', 'কাজে আমি স্বীকৃতি পাচ্ছি না কেন?'],
    ['How can I save more money?', 'मैं ज़्यादा पैसे कैसे बचाऊँ?', 'আমি কীভাবে বেশি টাকা জমাব?'],
    ['Will I do well in a government job?', 'क्या मैं सरकारी नौकरी में अच्छा करूँगा?', 'সরকারি চাকরিতে কি আমি ভালো করব?'],
    ['How is my career going right now?', 'अभी मेरा करियर कैसा चल रहा है?', 'এখন আমার কেরিয়ার কেমন চলছে?'],
    ['Is it wise for me to invest in shares?', 'क्या शेयर में पैसा लगाना मेरे लिए ठीक रहेगा?', 'শেয়ারে টাকা লাগানো কি আমার জন্য ঠিক হবে?'],
  ],
  health: [
    ['How can I keep my energy up?', 'मैं अपनी ऊर्जा कैसे बनाए रखूँ?', 'আমি কীভাবে শরীরের শক্তি ধরে রাখব?'],
    ['Why do I feel so stressed lately?', 'आजकल मैं इतना तनाव में क्यों रहता हूँ?', 'ইদানীং আমি এত চাপে থাকি কেন?'],
    ['What should I watch out for in my health?', 'सेहत में मुझे किस बात का ध्यान रखना चाहिए?', 'স্বাস্থ্যে আমাকে কোন দিকে খেয়াল রাখতে হবে?'],
    ['How can I sleep better?', 'मैं बेहतर नींद कैसे लूँ?', 'আমি কীভাবে ভালো ঘুমাব?'],
    ['Is this a tiring phase for me?', 'क्या यह मेरे लिए थकान भरा दौर है?', 'এটা কি আমার জন্য ক্লান্তির সময়?'],
    ['What daily routine suits my body?', 'मेरे शरीर के लिए कौन सी दिनचर्या सही है?', 'আমার শরীরের জন্য কোন রুটিন ভালো?'],
    ['How can I calm my mind?', 'मैं अपना मन शांत कैसे करूँ?', 'আমি কীভাবে মন শান্ত করব?'],
    ['Why do I get tired so easily?', 'मैं इतनी जल्दी क्यों थक जाता हूँ?', 'আমি এত তাড়াতাড়ি ক্লান্ত হয়ে পড়ি কেন?'],
  ],
  family: [
    ['How can I bring my family closer?', 'मैं अपने परिवार को और करीब कैसे लाऊँ?', 'পরিবারকে আরও কাছে কীভাবে আনব?'],
    ['Will there be peace at home?', 'क्या घर में शांति रहेगी?', 'বাড়িতে কি শান্তি থাকবে?'],
    ['Should I live with my family or move out?', 'परिवार के साथ रहूँ या अलग हो जाऊँ?', 'পরিবারের সঙ্গে থাকব না আলাদা হব?'],
    ['How can I reduce fights at home?', 'घर में झगड़े कैसे कम करूँ?', 'বাড়িতে ঝগড়া কীভাবে কমাব?'],
    ['Is buying a house a good idea for me?', 'क्या घर खरीदना मेरे लिए अच्छा रहेगा?', 'বাড়ি কেনা কি আমার জন্য ভালো হবে?'],
    ['Will my home life be happy?', 'क्या मेरा घरेलू जीवन सुखी रहेगा?', 'আমার সংসার জীবন কি সুখের হবে?'],
    ['What does my chart say about family?', 'मेरी कुंडली परिवार के बारे में क्या कहती है?', 'আমার চার্ট পরিবার নিয়ে কী বলে?'],
    ['How do I handle tension at home?', 'घर के तनाव को कैसे संभालूँ?', 'বাড়ির টেনশন কীভাবে সামলাব?'],
  ],
  study: [
    ['Which subject suits me?', 'मेरे लिए कौन सा विषय सही है?', 'আমার জন্য কোন বিষয় ঠিক?'],
    ["Why can't I concentrate on my studies?", 'मैं पढ़ाई में ध्यान क्यों नहीं लगा पाता?', 'পড়াশোনায় আমি মন দিতে পারি না কেন?'],
    ['Should I study abroad?', 'क्या मुझे विदेश में पढ़ना चाहिए?', 'আমার কি বিদেশে পড়া উচিত?'],
    ['Will I do well in my exams?', 'क्या मैं परीक्षा में अच्छा करूँगा?', 'পরীক্ষায় কি আমি ভালো করব?'],
    ["Is a master's degree worth it for me?", 'क्या मेरे लिए मास्टर्स करना ठीक रहेगा?', 'আমার জন্য কি মাস্টার্স করা ঠিক হবে?'],
    ['How should I prepare for competitive exams?', 'प्रतियोगी परीक्षा की तैयारी कैसे करूँ?', 'প্রতিযোগিতামূলক পরীক্ষার প্রস্তুতি কীভাবে নেব?'],
    ['Am I better suited to science or arts?', 'मैं विज्ञान के लिए बना हूँ या कला के लिए?', 'আমি বিজ্ঞানে ভালো না কলায়?'],
    ['How can I remember what I study?', 'जो पढ़ता हूँ उसे याद कैसे रखूँ?', 'যা পড়ি তা কীভাবে মনে রাখব?'],
  ],
};

// utils/agent/adapters/gemma21.ts TIMING_PROMPT_MODE (that module imports React Native).
const TIMING_PROMPT_MODE = 'line-bottom' as const;
const variants = ['full', 'guru', 'plan'] as const;
const out: string[] = [];
let skipped = 0;
function emit(set: 'timing' | 'guru', id: string, p: any, today: string, lang: L, agent: AgentId, q: string, topic: string) {
  const now = new Date(`${today}T12:00:00`);
  const plan = buildPlan({ question: q, profile: p, lang, agent, now });
  if (plan.route !== 'answer') { skipped++; console.error('skip', id, plan.route, plan.decline); return; }
  const t = plan.timing;
  const timing = t && t.asked ? { topic: t.topic, windows: t.result.windows, mode: TIMING_PROMPT_MODE } : null;
  const full = sagaSystem({ profile: p, lang, now, timing });
  for (const v of variants) {
    const focus = v === 'full' ? null : v === 'guru' ? GURUS[agent].context : plan.focus;
    const system = sagaSystem({ profile: p, lang, now, timing, focus });
    out.push(JSON.stringify({
      id, variant: v, set, profile: p.id, today, topic, agent, lang, user: q, system, full,
      windows: (t?.asked ? t.result.windows : []).map(w => ({ start: w.start.toISOString(), end: w.end.toISOString(), peak: w.peak.toISOString(), strength: w.strength })),
      planTopic: t?.topic ?? plan.intent.topic ?? null,
    }));
  }
}

// Timing set (eval_gen.ts selection), each asked to the topic's guru.
let k = 0;
const TOPICS = Object.keys(TIMING_Q);
profiles.forEach((p, pi) => {
  const today = TODAYS[pi % TODAYS.length];
  for (let j = 0; j < 7; j++) {
    const topic = TOPICS[(pi * 3 + j) % TOPICS.length];
    if (topic === 'children' && p.id === 'e04_elder_m') continue;
    const lang = LANGS[(k++) % 3];
    emit('timing', `t_${p.id}_${topic}_${lang}`, p, today, lang, TOPIC_AGENT[topic], TIMING_Q[topic][lang], topic);
  }
});

// Guru set: 40 questions x en/hi/bn, profiles and todays rotating.
let g = 0;
for (const [agent, qs] of Object.entries(GURU_Q)) {
  qs.forEach((tri, qi) => {
    LANGS.forEach((lang, li) => {
      const p = profiles[(g + li) % profiles.length];
      const today = TODAYS[(qi + li) % TODAYS.length];
      emit('guru', `g_${agent}${qi + 1}_${lang}_${p.id}`, p, today, lang, agent as AgentId, tri[li], agent);
    });
    g++;
  });
}

writeFileSync(`${SP}/prompts.jsonl`, out.join('\n') + '\n');
console.log('items', out.length / variants.length, 'prompts', out.length, 'skipped', skipped);
