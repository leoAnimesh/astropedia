// Applies the verify-layer timing repair (+ countdown strip, as the app does) to eval answers.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPlan } from '/Users/animesh/Developer/projects/astropedia/utils/agent/plan.ts';
import { repairTiming, splitSentences } from '/Users/animesh/Developer/projects/astropedia/utils/agent/verify.ts';
import { stripCountdowns } from '/Users/animesh/Developer/projects/astropedia/utils/reply-guards.ts';
const SP = process.env.OUT ?? '.';
const [src, dst] = process.argv.slice(2);
const profiles = Object.fromEntries(readFileSync(`/Users/animesh/Developer/projects/astropedia/ml/data/eval_timing_profiles.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).map(p => [p.id, p]));
const prompts = new Map(readFileSync(`${SP}/prompts.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).map(p => [`${p.id}|${p.variant}`, p]));
let changed = 0, n = 0;
const out = readFileSync(src, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).map(a => {
  const p = prompts.get(`${a.id}|${a.variant}`)!;
  const plan = buildPlan({ question: p.user, profile: profiles[p.profile], lang: p.lang, now: new Date(`${p.today}T12:00:00`) });
  if (plan.timing?.topic !== p.topic) console.error('topic', p.id, plan.timing?.topic);
  const stripped = splitSentences(a.answer).map(stripCountdowns).join('');
  const fixed = repairTiming(stripped, plan);
  n++; if (fixed !== stripped) changed++;
  return JSON.stringify({ ...a, answer: fixed, original: a.answer });
});
writeFileSync(dst, out.join('\n') + '\n');
console.log(`repaired ${changed}/${n}`);
