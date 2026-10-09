/**
 * Layer 4 of the answer pipeline: verify and repair a written answer against
 * its AnswerPlan. Pure (no React Native), so every rule is unit-tested.
 *
 * Timing: when the plan has engine windows and the question asked "when",
 * every dated sentence of the reply is checked as it streams (one whole
 * sentence at a time through createSentenceFilter, so nothing flickers):
 *  - a sentence whose future dates all fall outside the windows (or name the
 *    current month: the date every chart shares, the v2.1 "October 2026"
 *    failure) is replaced by the plan's window sentence the first time and
 *    dropped after that, so the reply never states two different windows;
 *  - a sentence with a date inside a window (±1 month) is kept;
 *  - past dates (birth, "since 2023") are left alone;
 *  - a reply that ends without any date gets the window sentence appended.
 * This supersedes the old copied-transit-date retry (no extra model run).
 */
import { createSentenceFilter, findDates, type FoundDate } from '../reply-guards';
import type { TimingWindow } from '../timing-engine';
import type { AnswerPlan } from './plan';
import { repairSentence } from './adapters/template';
import { S } from './strings';

const key = (y: number, m: number) => y * 12 + m - 1;

export type DateJudgement = 'ok' | 'bad' | 'ignore';

/** One date in a reply against the plan's windows. */
export function judgeDate(d: FoundDate, windows: TimingWindow[], now: Date, past = false): DateJudgement {
  const nowKey = key(now.getFullYear(), now.getMonth() + 1);
  const inside = (w: TimingWindow, slack = 1) => {
    const a = key(w.start.getFullYear(), w.start.getMonth() + 1) - slack;
    const b = key(w.end.getFullYear(), w.end.getMonth() + 1) + slack;
    if (d.year == null) {
      // Month alone: inside if some year of the window has that month.
      for (let k = a; k <= b; k++) if ((k % 12) + 1 === d.month) return true;
      return false;
    }
    if (d.month == null) return w.start.getFullYear() <= d.year && w.end.getFullYear() >= d.year;
    const k = key(d.year, d.month);
    return k >= a && k <= b;
  };
  const curMonth = now.getMonth() + 1;
  if (d.year != null) {
    const k = d.month == null ? null : key(d.year, d.month);
    if (!past) {
      if (d.month == null ? d.year < now.getFullYear() : k! < nowKey) return 'ignore';
      // "By October 2026" said in October 2026 answers nothing.
      if (k === nowKey) return 'bad';
    } else if (d.month == null ? d.year > now.getFullYear() : k! > nowKey) {
      return 'bad';
    }
  } else if (!past && d.month === curMonth) {
    return 'bad';
  }
  return windows.some(w => inside(w)) ? 'ok' : 'bad';
}

/** 'ok' when the sentence has an in-window date, 'bad' when its only dates are wrong, null without dates. */
export function judgeSentence(sentence: string, windows: TimingWindow[], now: Date, past = false): 'ok' | 'bad' | null {
  const js = findDates(sentence).map(d => judgeDate(d, windows, now, past)).filter(j => j !== 'ignore');
  if (js.length === 0) return null;
  return js.includes('ok') ? 'ok' : 'bad';
}

export type TimingRepair = {
  /** Sentence transform for createSentenceFilter (keeps surrounding whitespace). */
  transform: (chunk: string) => string;
  /** Text to append once the reply is complete ('' for none). */
  finish: (reply: string) => string;
  /** How many sentences were replaced or dropped so far. */
  changes: () => number;
};

const BIRTH_TIME_MENTION = /birth ?time|time of birth|जन्म (?:का )?समय|जन्म-समय|জন্মের সময়|জন্মসময়/i;

/** The streaming timing repair for a plan (a no-op without asked-for timing). */
export function createTimingRepair(plan: AnswerPlan): TimingRepair {
  const t = plan.timing;
  if (!t || !t.asked || plan.route !== 'answer') {
    return { transform: s => s, finish: () => '', changes: () => 0 };
  }
  const windows = t.result.windows;
  const past = t.result.past;
  let gave = false;
  let replaced = false;
  let changes = 0;
  const transform = (chunk: string): string => {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(chunk)!;
    const [, lead, core, trail] = m;
    if (!core) return chunk;
    const verdict = judgeSentence(core, windows, plan.now, past);
    if (verdict === 'ok') {
      gave = true;
      return chunk;
    }
    if (verdict === 'bad') {
      changes++;
      if (!replaced && !gave) {
        replaced = true;
        gave = true;
        return lead + repairSentence(plan) + trail;
      }
      return lead;
    }
    return chunk;
  };
  const finish = (reply: string): string => {
    const extra: string[] = [];
    if (!gave) { extra.push(repairSentence(plan)); changes++; }
    else if (plan.notes.includes('narrow') && !replaced) {
      // "When exactly?": name the peak month when the reply didn't.
      const pk = t.best.peak;
      const named = findDates(reply).some(d => d.year === pk.getFullYear() && d.month === pk.getMonth() + 1);
      if (!named) { extra.push(repairSentence(plan)); changes++; }
    }
    if (plan.notes.includes('exactDate') && !reply.includes(S.exactDate[plan.lang]) && !/\b(?:single|exact|specific) day\b|एक दिन|एक तारीख|একটা দিন|নির্দিষ্ট দিন/i.test(reply)) {
      extra.push(S.exactDate[plan.lang]);
    }
    if (plan.notes.includes('noTime') && !BIRTH_TIME_MENTION.test(reply)) extra.push(S.noTime[plan.lang]);
    return extra.length ? ` ${extra.join(' ')}` : '';
  };
  return { transform, finish, changes: () => changes };
}

/** Sentence split matching createSentenceFilter (end mark + whitespace, or a newline). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(/[.!?।॥](?=\s)|\n/g)) {
    const cut = (m.index ?? 0) + m[0].length;
    out.push(text.slice(last, cut));
    last = cut;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The whole-text version of the streaming repair (tests, saved replies). */
export function repairTiming(text: string, plan: AnswerPlan): string {
  const r = createTimingRepair(plan);
  const body = splitSentences(text).map(r.transform).join('');
  return (body + r.finish(body)).replace(/[ \t]{2,}/g, ' ');
}

/**
 * Verify a rendered stream against its plan: the timing repair one whole
 * sentence at a time (createSentenceFilter, so no text is shown and then
 * taken back), then the repair's closing text and `advice(reply)` (the
 * doctor / lawyer lines the reply lacks). Works for any adapter's output.
 */
export async function* verifyStream(
  source: AsyncIterable<string>,
  plan: AnswerPlan,
  advice: (reply: string) => string = () => '',
): AsyncGenerator<string> {
  const repair = createTimingRepair(plan);
  const out: string[] = [];
  let reply = '';
  const filter = createSentenceFilter(repair.transform, (s) => { out.push(s); reply += s; });
  for await (const token of source) {
    filter.push(token);
    while (out.length) yield out.shift()!;
  }
  filter.flush();
  while (out.length) yield out.shift()!;
  if (!reply.trim()) return;
  const tail = repair.finish(reply) + advice(reply);
  if (tail) yield tail;
}
