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
 *
 * Non-timing answers (a plan with `content`, or no "when"): sentences with
 * dates nobody asked for are dropped (and an "Until then…" leaning on them),
 * sentences already said in any earlier reply are dropped, and a reply that
 * names none of the plan's items gets them; model adapters also hold such a
 * reply until it is checked whole (planGuard / acceptable) and show the
 * template answer when the retry fails too.
 *
 * Dates are read in Western and Devanagari / Bengali digits alike
 * (findDates), so the hi/bn repair sentence (native digits) and a model reply
 * (usually Western digits) are judged the same way.
 */
import {
  createSentenceFilter, findDates, nativeDigits, replyOverlap, westernDigits, words,
  type FoundDate, type ReplyGuard,
} from '../reply-guards';
import type { TimingWindow } from '../timing-engine';
import { checkView, type AnswerPlan } from './plan';
import { hasCode } from './checks';
import { contentLead, renderTemplate, repairSentence } from './adapters/template';
import { relevanceHits, relevanceTerms } from './astrologer';
import { S, type Lang } from './strings';

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
      // "By October 2026" said in October 2026 answers nothing, unless it is a chart fact dated this month
      // (a sub-period ending now: a point window the plan allows).
      if (k === nowKey) {
        const fact = windows.some(w => key(w.start.getFullYear(), w.start.getMonth() + 1) === nowKey && key(w.end.getFullYear(), w.end.getMonth() + 1) === nowKey);
        return fact ? 'ok' : 'bad';
      }
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
  // The engine's windows, plus the plan's own dated chart facts (a sub-period ending now, a nearer window it names).
  const windows = [...t.result.windows, ...planFactWindows(plan)];
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

// ─── Non-timing answers: unsolicited dates, repeats, relevance ───────────────

const PLANET_WORD = /\b(?:sun|moon|mars|mercury|jupiter|venus|saturn|rahu|ketu|sade ?sati|dasha|transit)\b|सूर्य|चंद्र|मंगल|बुध|गुरु|बृहस्पति|शुक्र|शनि|राहु|केतु|साढ़े|दशा|গোচর|সূর্য|চন্দ্র|মঙ্গল|বুধ|বৃহস্পতি|শুক্র|শনি|রাহু|কেতু|সাড়ে|দশা/i;

/**
 * The windows a non-timing reply's dates may fall in: the topic's engine
 * windows, the content's optional window and its allowed dates (±1 month).
 * Null when dates aren't policed: a "when" question (createTimingRepair
 * handles it), a chart / planet question (its dates come from the context),
 * or a plan that isn't a written answer.
 */
export function allowedDateWindows(plan: AnswerPlan): TimingWindow[] | null {
  if (plan.route !== 'answer' || plan.mode !== 'saga') return null;
  if (plan.intent.timing || plan.intent.topic === 'chart' || PLANET_WORD.test(plan.question)) return null;
  const out: TimingWindow[] = [...(plan.timing?.result.windows ?? [])];
  if (plan.content?.window) out.push(plan.content.window.best);
  out.push(...planFactWindows(plan));
  return out;
}

/**
 * Dates the plan itself states and therefore trusts: content dates (a
 * sub-period end), the check windows (a nearer / past window a route names),
 * chart-fact dates, and every date in the plan's own lines (point windows).
 */
export function planFactWindows(plan: AnswerPlan): TimingWindow[] {
  const out: TimingWindow[] = [];
  const point = (d: Date) => out.push({ start: d, end: d, peak: d } as TimingWindow);
  for (const d of plan.content?.allowedDates ?? []) point(d);
  for (const w of [...(plan.checks?.windows ?? []), ...(plan.checks?.alt ?? [])]) out.push(w as TimingWindow);
  for (const d of plan.checks?.factDates ?? []) point(d);
  for (const l of plan.say ?? []) {
    for (const fd of findDates(l.text.en)) {
      if (fd.year == null) continue;
      const d = new Date(fd.year, (fd.month ?? 7) - 1, 1);
      if (fd.month == null) out.push({ start: new Date(fd.year, 0, 1), end: new Date(fd.year, 11, 31), peak: d } as TimingWindow);
      else point(d);
    }
  }
  return out;
}

/**
 * Sentence filter for a non-timing answer: a sentence whose future dates are
 * all outside the allowed windows (the v2.1 habit of answering "which field?"
 * with "by October 2026", the month every chart's transit line shares) is
 * dropped. Past dates and in-window dates stay.
 */
export function createDateFilter(plan: AnswerPlan): { transform: (chunk: string) => string; changes: () => number } {
  const windows = allowedDateWindows(plan);
  let changes = 0;
  if (!windows) return { transform: s => s, changes: () => 0 };
  let dropped = false;
  return {
    transform: (chunk: string) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(chunk)!;
      if (!m[2]) return chunk;
      if (judgeSentence(m[2], windows, plan.now) === 'bad') { changes++; dropped = true; return ''; }
      // "Until then, …" leans on the sentence just dropped.
      if (dropped && DANGLING.test(m[2])) { changes++; return ''; }
      dropped = false;
      return chunk;
    },
    changes: () => changes,
  };
}

const DANGLING = /^(?:\*\*)?(?:until then|by then|till then|before then|after that|from then|in the meantime|meanwhile|तब तक|उससे पहले|उसके बाद|इस बीच|ততদিন|তার আগে|তার পরে|এর মধ্যে|ততক্ষণ)/i;

/** Previous assistant replies of a thread (Western digits, like a model reply). */
export const previousReplies = (history: { role: string; content: string }[] = []): string[] =>
  history.filter(m => m.role === 'assistant' && m.content.trim()).map(m => westernDigits(m.content));

/** A sentence counts as repeated when this share of it already appeared in an earlier reply. */
export const SENTENCE_REPEAT_MAX = 0.6;

/**
 * Sentence filter that drops a sentence (6+ words) already said in any earlier
 * reply of the thread: the safety net behind the whole-reply repeat check,
 * for a reply that starts fresh and then copies.
 */
export function createRepeatFilter(
  previous: string[], { keepDated = false } = {},
): { transform: (chunk: string) => string; changes: () => number } {
  let changes = 0;
  if (!previous.length) return { transform: s => s, changes: () => 0 };
  return {
    transform: (chunk: string) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(chunk)!;
      if (words(m[2]).length < 6) return chunk;
      // A "when" answer's window sentence may restate the earlier window (the timing repair owns those).
      if (keepDated && findDates(m[2]).length) return chunk;
      const o = previous.reduce((x, p) => Math.max(x, replyOverlap(westernDigits(m[2]), p)), 0);
      if (o >= SENTENCE_REPEAT_MAX) { changes++; return ''; }
      return chunk;
    },
    changes: () => changes,
  };
}

/** The reply names one of the plan's key items (true when the plan has none). */
export function isRelevant(plan: AnswerPlan, reply: string): boolean {
  const c = plan.content;
  if (!c || plan.intent.timing) return true;
  return relevanceTerms(c).test(westernDigits(reply));
}

/** Words / sentences a non-timing answer must keep after the date and repeat filters. */
const MIN_KEPT_WORDS = 18;
/**
 * Distinct plan-item words a model reply must use to be shown (one alone is
 * often incidental: "keep in touch" is not an answer about communication work).
 */
const MIN_ITEM_HITS = 2;

/**
 * A whole model reply for a non-timing plan is acceptable when, after the
 * verify layer would take out unasked dates and sentences repeated from
 * `previous`, at least two sentences / MIN_KEPT_WORDS words are left and they
 * use at least MIN_ITEM_HITS distinct words of the plan's items. Otherwise
 * the reply is retried (then the template answer is shown): the user never
 * sees a stub like "Until then, keep applying." left over from a dropped
 * date sentence.
 */
export function acceptable(plan: AnswerPlan, previous: string[], text: string): boolean {
  const dates = createDateFilter(plan);
  const repeats = createRepeatFilter(previous);
  const kept = splitSentences(westernDigits(text)).map(s => repeats.transform(dates.transform(s))).join('');
  const sentences = splitSentences(kept).filter(s => words(s).length >= 3).length;
  const c = plan.content;
  const hits = c && !plan.intent.timing ? relevanceHits(c, kept) : MIN_ITEM_HITS;
  return sentences >= 2 && words(kept).length >= MIN_KEPT_WORDS && hits >= MIN_ITEM_HITS;
}

/**
 * What a model adapter adds to its ReplyGuard for this plan: every earlier
 * reply for the repeat check, the plan's items as `mustMention` for choice /
 * nature questions, and the template answer as the fallback when both tries
 * fail (so a repeat is never shown).
 */
export function planGuard(plan: AnswerPlan, history: { role: string; content: string }[] = []): Partial<ReplyGuard> {
  const previous = previousReplies(history);
  const out: Partial<ReplyGuard> = {};
  if (previous.length) out.previous = previous;
  if (plan.route === 'answer' && plan.mode === 'saga') {
    if (plan.content && !plan.intent.timing) {
      out.mustMention = relevanceTerms(plan.content);
      out.holdAll = true;
      out.accept = (text: string) => acceptable(plan, previous, text);
    }
    const tpl = renderTemplate(plan, previous);
    if (tpl) out.fallback = westernDigits(tpl);
  }
  return out;
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
  history: { role: string; content: string }[] = [],
): AsyncGenerator<string> {
  const repair = createTimingRepair(plan);
  const previous = plan.route === 'answer' && plan.mode === 'saga' ? previousReplies(history) : [];
  const dates = createDateFilter(plan);
  const repeats = createRepeatFilter(previous, { keepDated: !!plan.timing?.asked });
  const out: string[] = [];
  let reply = '';
  const transform = (chunk: string) => repeats.transform(dates.transform(repair.transform(chunk)));
  const filter = createSentenceFilter(transform, (s) => { out.push(s); reply += s; });
  let raw = '';
  for await (const token of source) {
    raw += token;
    filter.push(token);
    while (out.length) yield out.shift()!;
  }
  filter.flush();
  while (out.length) yield out.shift()!;
  if (!raw.trim()) return;
  // Everything was dropped (all repeats / wrong dates): answer from the plan.
  if (dates.changes() + repeats.changes() > 0 && words(reply).length < 6) {
    const tpl = renderTemplate(plan, previous);
    if (tpl) {
      const lead = reply.trim() ? ' ' : '';
      yield lead + tpl + advice(tpl);
      return;
    }
  }
  let tail = repair.finish(reply);
  // A "which field?" answer that names none of the plan's items gets them.
  if (plan.content && !isRelevant(plan, reply)) {
    const add = contentLead(plan.content, plan.lang, previous.length % 2);
    tail += ` ${add}`;
  }
  tail += advice(reply);
  if (tail) yield tail;
}

/**
 * The plan's required lines (rules.md §2: counsellor, helpline, lawyer,
 * documents-decide, policy declines …) that a written reply does not cover,
 * joined as one paragraph ('' when nothing is missing). Checked with the
 * shared vocabulary (checks.ts), in any of the three languages.
 */
export function requiredTail(plan: AnswerPlan, reply: string): string {
  if (plan.route !== 'answer' || plan.mode !== 'saga') return '';
  const view = checkView(plan);
  const add: string[] = [];
  for (const l of plan.say) {
    if (!l.required) continue;
    if (hasCode(l.code, view, reply) || add.includes(l.text[plan.lang])) continue;
    add.push(l.text[plan.lang]);
  }
  return add.join(' ');
}

/** Finalize for display: hi/bn replies in the language's own digits, token by token (a digit is one character). */
export async function* localizeDigitsStream(source: AsyncIterable<string>, lang: Lang): AsyncGenerator<string> {
  for await (const t of source) yield nativeDigits(t, lang);
}
