// Usage (from this folder; OUT = a work dir):
//   OUT=/tmp/te TZ=Asia/Kolkata node --no-warnings --import ./hooks.mjs eval_gen.ts [baseline,filter,line-top,line-bottom]
//   ../../.venv/bin/python run_pte.py /tmp/te/prompts.jsonl /tmp/te/answers.jsonl      (TEMP=0.3 for sampling)
//   ../../.venv/bin/python score.py /tmp/te/prompts.jsonl /tmp/te/answers.jsonl
//   OUT=/tmp/te TZ=Asia/Kolkata node --no-warnings --import ./hooks.mjs repair_eval.ts /tmp/te/answers.jsonl /tmp/te/repaired.jsonl  (then score it)
// Date eval for timing answers: 10 profiles x 7 timing questions (en/hi/bn rotating), 4 `today`s,
// prompt variants baseline / filter / line-top / line-bottom. Writes prompts.jsonl {id, variant, system, user, ...}.
import { readFileSync, writeFileSync } from 'node:fs';
import { sagaSystem, type TimingPromptMode } from '/Users/animesh/Developer/projects/astropedia/utils/agent/adapters/gemma21-prompt.ts';
import { timingWindows, type TimingTopic } from '/Users/animesh/Developer/projects/astropedia/utils/timing-engine.ts';
import { classifyIntent } from '/Users/animesh/Developer/projects/astropedia/utils/agent/intent.ts';

const SP = process.env.OUT ?? '.';
const profiles = readFileSync(`/Users/animesh/Developer/projects/astropedia/ml/data/eval_timing_profiles.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(p => !['e03_minor_f', 'e06_son_child'].includes(p.id));
const Q: Record<string, Record<'en' | 'hi' | 'bn', string>> = {
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
const TOPICS = Object.keys(Q);
const TODAYS = ['2026-10-09', '2027-04-15', '2027-11-20', '2028-06-10'];
const LANGS = ['en', 'hi', 'bn'] as const;
const variants = (process.argv[2] ?? 'baseline,filter,line-top,line-bottom').split(',') as TimingPromptMode[];
const out: string[] = [];
let k = 0;
profiles.forEach((p, pi) => {
  const today = TODAYS[pi % TODAYS.length];
  const now = new Date(`${today}T12:00:00`);
  for (let j = 0; j < 7; j++) {
    const topic = TOPICS[(pi * 3 + j) % TOPICS.length];
    if (topic === 'children' && p.id === 'e04_elder_m') continue;
    const lang = LANGS[(k++) % 3];
    const q = Q[topic][lang];
    const intent = classifyIntent(q);
    if (intent.topic !== topic) console.error('INTENT MISMATCH', q, intent.topic, topic);
    const res = timingWindows(p, topic as TimingTopic, now);
    for (const v of variants) {
      const system = sagaSystem({ profile: p, lang, now, timing: { topic: topic as TimingTopic, windows: res.windows, mode: v } });
      out.push(JSON.stringify({ id: `${p.id}_${topic}_${lang}`, variant: v, profile: p.id, today, topic, lang, user: q, system,
        windows: res.windows.map(w => ({ start: w.start.toISOString(), end: w.end.toISOString(), peak: w.peak.toISOString(), strength: w.strength })) }));
    }
  }
});
writeFileSync(`${SP}/prompts.jsonl`, out.join('\n') + '\n');
console.log('items', out.length / variants.length, 'prompts', out.length);
