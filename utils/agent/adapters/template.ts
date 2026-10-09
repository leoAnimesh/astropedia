/**
 * TemplateRenderer: a complete answer written from the AnswerPlan alone, in
 * en / hi / bn, with no model. Used for the plan's declines and redirects,
 * whenever no model is available (not downloaded, failed to load, web), and
 * as the last fallback of the verify layer. Pure.
 *
 * Output is user-visible, so hi/bn text carries Devanagari / Bengali digits
 * ("এপ্রিল ২০৩১"), like the rest of the app; the verifier reads both forms.
 */
import type { AnswerPlan } from '../plan';
import { AREA, AREA_GEN_BN, HELPS, S, fill, localText, monthLabel, relationWord, type Lang } from '../strings';
import { dateInWindows, type TimingTopic, type TimingWindow } from '../../timing-engine';
import { formatGitaQuote, pickGitaVerse } from '../../gita';
import { findDates, replyOverlap, westernDigits } from '../../reply-guards';
import type { AnswerContent } from '../astrologer';
import {
  FOLLOW_LEAD_ASK, NEXT_ITEM_ASK,
  AND, ASK_MORE, BECAUSE, COMMA, DOCTOR_LINE, EXAMPLES, EXAMPLES_MORE, FIELD_LINE, FOLLOW_LEAD, FOLLOW_LEAD_NEXT, LEAD, MEET_LINE, NEXT_ITEM, PLACE_LINE, TIP, TIP2,
  WEAK_LINE, WINDOW_LINE,
} from '../ask-strings';

const firstName = (name: string) => name.split(' ')[0];

function vars(lang: Lang, topic: TimingTopic, w?: TimingWindow): Record<string, string> {
  return {
    area: AREA[lang][topic],
    areaGen: AREA_GEN_BN[topic],
    ...(w ? { start: monthLabel(w.start, lang), end: monthLabel(w.end, lang), peak: monthLabel(w.peak, lang) } : {}),
  };
}

/** "The strongest window for this is …" (the verify layer's repair sentence). */
export function repairSentence(plan: AnswerPlan): string {
  const t = plan.timing!;
  const table = t.result.past ? S.repairPast : plan.notes.includes('narrow') ? S.repairPeak : S.repair;
  return localText(fill(table[plan.lang], vars(plan.lang, t.topic, t.best)), plan.lang);
}

/** The timing paragraph: window, reasons, strength, second window, notes. */
export function timingSentences(plan: AnswerPlan, { withHelps = true } = {}): string[] {
  const t = plan.timing;
  if (!t) return [];
  const lang = plan.lang;
  const v = vars(lang, t.topic, t.best);
  const out: string[] = [];
  const other = plan.subject.isYou === false && plan.decline !== 'minorRomance';
  const who = other ? fill(S.whoOther[lang], { name: firstName(plan.subject.name) }) : '';
  out.push(fill((t.result.past ? S.pastWindow : t.topic === 'general' ? S.windowGeneral : S.window)[lang], { ...v, who }));
  if (plan.notes.includes('narrow')) out.push(fill(S.repairPeak[lang], v));
  if (!t.result.past) {
    if (t.best.reasons.some(r => r.kind === 'dasha')) out.push(fill(S.reasonDasha[lang], v));
    if (t.best.reasons.some(r => r.kind === 'doubleTransit')) out.push(S.reasonDouble[lang]);
    else if (t.best.reasons.some(r => r.kind === 'jupiterTransit')) out.push(S.reasonJupiter[lang]);
    if (plan.notes.includes('noStrong')) {
      out.push(S.noStrong[lang]);
      const ns = t.result.nextStrong;
      if (ns) out.push(fill(S.nextStrong[lang], { start: monthLabel(ns.start, lang) }));
    } else if (plan.notes.includes('moderate')) out.push(S.moderate[lang]);
    if (plan.notes.includes('far')) out.push(S.far[lang]);
    if (t.second) out.push(fill(S.second[lang], vars(lang, t.topic, t.second)));
    if (withHelps) out.push(HELPS[lang][t.topic]);
  }
  if (plan.notes.includes('exactDate')) out.push(S.exactDate[lang]);
  if (plan.notes.includes('noTime')) out.push(S.noTime[lang]);
  else if (plan.notes.includes('noPlace')) out.push(S.noPlace[lang]);
  return out.map(x => localText(x, lang));
}

/**
 * The full deterministic answer for a plan. Routes 'crisis', 'greeting' and
 * 'canned' use the app's i18n strings and are rendered by the pipeline; for
 * those, and for an answer with no topic, this returns null.
 */
export function renderTemplate(plan: AnswerPlan, previous: string[] = []): string | null {
  const lang = plan.lang;
  if (plan.route === 'decline') {
    switch (plan.decline) {
      case 'death': return withLines(plan, S.death[lang], previous);
      case 'elderChildren': return withLines(plan, S.elderChildren[lang], previous);
      case 'otherMissing': {
        const owner = plan.subject.isYou === false
          ? fill(S.ownerOther[lang], { name: firstName(plan.subject.name) }) : S.ownerSelf[lang];
        return fill(S.otherMissing[lang], { relation: relationWord(plan.missingRelation ?? 'relative'), owner });
      }
      case 'minorRomance': {
        const parts = [fill(S.minorRomance[lang], { age: plan.age ?? '' })];
        if (plan.timing) parts.push(...timingSentences(plan));
        return localText(parts.join(' '), lang);
      }
      case 'emergency': case 'abuse': case 'identity': case 'childSexWhy': case 'askWhich':
        return withLines(plan, '', previous);
      default: return null;
    }
  }
  if (plan.route !== 'answer') return null;
  const t = plan.timing;
  let core = '';
  if (!plan.coreOff) {
    if (plan.content && !plan.intent.timing) core = renderContent(plan, previous);
    else if (t) {
      // The window answers the question, so it comes first; the promise is its first reason.
      const parts = timingSentences(plan);
      const fact = plan.facts[0];
      if (fact && !t.result.past) parts.splice(1, 0, localText(fill(S[fact.code][lang], vars(lang, t.topic)), lang));
      core = localText(parts.join(' '), lang);
    }
  }
  if (!core && !plan.say.length) return null;
  return withLines(plan, core, previous);
}

/** Soft word budget for a whole template answer (first answers 60-140 words, follow-ups 30-90: rules.md §1.6). */
const BUDGET: Record<Lang, number> = { en: 135, hi: 150, bn: 120 };

/**
 * The plan's lines around the core paragraph: lead lines first, then the
 * core, body and end lines. Lines already said in an earlier reply are left
 * out (unless required), and optional body lines stop at the word budget.
 */
function withLines(plan: AnswerPlan, core: string, previous: string[]): string {
  const lang = plan.lang;
  const said = (x: string) => previous.some(p => replyOverlap(westernDigits(x), p) >= SAID_MAX);
  const pick = (pos: 'lead' | 'body' | 'end') => plan.say.filter(l => l.pos === pos).map(l => ({ l, text: l.text[lang] }))
    .filter(({ l, text }) => l.required || !said(text));
  const lead = pick('lead'), body = pick('body'), end = pick('end');
  const count = (x: string) => x.split(/\s+/).filter(Boolean).length;
  let n = count(core) + [...lead, ...end].reduce((a, x) => a + count(x.text), 0);
  const keptBody: string[] = [];
  for (const b of body) {
    if (!b.l.required && n + count(b.text) > BUDGET[lang] && keptBody.length >= 1) continue;
    keptBody.push(b.text);
    n += count(b.text);
  }
  const coreSentences = core ? core.split(/(?<=[.!?।])\s+/) : [];
  // Answer first (rules.md §1.1): a timing core's window sentence (after a yes/no likelihood line) comes before
  // feelings and context lines; feelings-first categories (distress, why-now) keep their order.
  const DIRECT = new Set(['likelihood', 'compat_score', 'lucky_values', 'muhurat_days', 'computed_fact', 'leaning', 'decline_name', 'decline_sex', 'no_exact_day', 'peak', 'window', 'emergency', 'safety_resources']);
  // The core (a window, or a "which / what" answer's items) leads unless the category starts with feelings.
  const timingFirst = !plan.coreOff && !!core && !['mental_health_distress', 'why_now_current_phase', 'family_parents_siblings', 'relationship_problems'].includes(plan.resolved);
  let head: string[] = lead.map(x => x.text);
  let coreRest = coreSentences;
  if (timingFirst && coreSentences.length) {
    const direct = lead.filter(x => DIRECT.has(x.l.code)).map(x => x.text);
    const rest = lead.filter(x => !DIRECT.has(x.l.code)).map(x => x.text);
    head = [...direct, coreSentences[0], ...rest];
    coreRest = coreSentences.slice(1);
  }
  const parts = [...head, ...coreRest, ...keptBody, ...end.map(x => x.text)].filter(x => x && x.trim());
  // Never the same sentence twice (a line and the core can share one).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of parts) {
    const k = westernDigits(x).trim();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(capFirst(x));
  }
  return localText(out.join(' '), lang);
}

/** "a, b and c" in `lang`. */
const AND_ALSO: Record<Lang, string> = { en: ', and also ', hi: ', और साथ ही ', bn: ', সঙ্গে ' };
function joinList(parts: string[], lang: Lang): string {
  if (parts.length <= 1) return parts[0] ?? '';
  // Labels with their own commas ("caring, emotional and family-minded") are joined with "and also".
  if (parts.some(p => p.includes(','))) return parts.join(AND_ALSO[lang]);
  return parts.slice(0, -1).join(COMMA[lang]) + AND[lang] + parts[parts.length - 1];
}

const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * The key-items sentence of a content plan ("Your chart points most clearly
 * to A, B and C."): the verify layer appends it when a model reply names none
 * of the items. `variant` picks the wording.
 */
export function contentLead(content: AnswerContent, lang: Lang, variant = 0): string {
  const leads = LEAD[content.ask];
  const lead = leads[variant % leads.length];
  // Career names its top three fields; other asks their top two (the third is kept for follow-ups).
  const n = content.ask === 'careerField' ? 3 : 2;
  const extra = Object.fromEntries(Object.entries(content.vars ?? {}).map(([k, v]) => [k, v[lang]]));
  return localText(fill(lead[lang], { ...extra, items: joinList(content.items.slice(0, n).map(i => (i.text.short ?? i.text.label)[lang]), lang) }), lang);
}

/** Sentences of an earlier reply count as said when they overlap a candidate this much. */
const SAID_MAX = 0.35;
/** Soft length cap of a template answer (the v5 answers stay under 90 words). */
const MAX_WORDS: Record<Lang, number> = { en: 72, hi: 70, bn: 60 };

/**
 * A complete answer for a non-timing question from its AnswerContent: the
 * items, why (plain), concrete examples, the ask's extra line, a practical
 * tip and, for choice questions, one optional "good time to move" line from
 * the engine. With earlier replies in the thread (`previous`), anything
 * already said is left out: a follow-up on the same ask points back in one
 * line and adds what is new (the second item's examples, another tip), so
 * the template never repeats the thread either.
 */
export function renderContent(plan: AnswerPlan, previous: string[] = []): string {
  const c = plan.content!;
  const lang = plan.lang;
  const said = (t: string) => previous.some(p => replyOverlap(t, p) >= SAID_MAX);
  // A follow-up on the same items (an earlier reply already named them).
  const re = new RegExp(c.items.map(i => `(?:${i.text.terms})`).join('|'), 'iu');
  // A clarification ("I mean which domain?") gets the full answer again, in other words.
  const followUp = !plan.intent.clarifies && c.items.length > 0 && previous.some(p => re.test(p));
  const label = (i: number) => (c.items[i] ? (c.items[i].text.short ?? c.items[i].text.label)[lang] : '');

  const leads = [0, 1, 2, 3].map(v => {
    const items = v % 2 === 1 && c.items.length > 1 ? [...c.items.slice(1), c.items[0]] : c.items;
    return contentLead({ ...c, items }, lang, v);
  });
  const followLeads = [fill((FOLLOW_LEAD_ASK[c.ask] ?? FOLLOW_LEAD)[lang], { item: label(0) }), ...(label(1) ? [fill(FOLLOW_LEAD_NEXT[lang], { item: label(1) })] : [])];
  const lead = followUp
    ? followLeads.find(l => !said(l)) ?? followLeads[followLeads.length - 1]
    : leads.find(l => !said(l)) ?? (plan.intent.clarifies ? leads[1] : leads[0]);
  const parts: string[] = [lead];
  const optional: string[] = [];
  const whys = c.items.flatMap(i => (i.why ? [i.why[lang]] : []));
  if (whys.length && !followUp) optional.push(fill(BECAUSE[lang], { reasons: whys[0] }));
  if (followUp) {
    // Items the thread hasn't named yet come first in a follow-up.
    for (const it of c.items.slice(1)) {
      const named = previous.some(p => new RegExp(it.text.terms, 'iu').test(p));
      if (!named && it.why) optional.unshift(fill((NEXT_ITEM_ASK[c.ask] ?? NEXT_ITEM)[lang], { item: (it.text.short ?? it.text.label)[lang], why: it.why[lang] }));
    }
  }
  const exampleList = (i: number, n: number) => c.items[i]?.text.examples?.[lang].split(/,\s*/).slice(0, n).join(COMMA[lang]);
  if (c.ask === 'careerField') {
    const ex0 = exampleList(0, 3);
    const ex1 = exampleList(1, 3);
    if (ex0) optional.push(fill(EXAMPLES[lang], { examples: ex0 }));
    if (ex1) optional.push(fill(EXAMPLES_MORE[lang], { examples: ex1 }));
  }
  for (const e of c.extra) {
    const t = e.text[lang];
    if (e.kind === 'meet') optional.push(fill(MEET_LINE[lang], { meet: t }));
    else if (e.kind === 'weak') optional.push(fill(WEAK_LINE[lang], { weak: t }));
    else if (e.kind === 'place') optional.push(fill(PLACE_LINE[lang], { place: t }));
    else if (e.kind === 'field') optional.push(fill(FIELD_LINE[lang], { field: t }));
    else optional.push(t);
  }
  const tips = plan.intent.kind === 'advice' || followUp ? [TIP2[c.ask][lang], TIP[c.ask][lang]] : [TIP[c.ask][lang], TIP2[c.ask][lang]];
  optional.push(...tips);
  const w = c.window?.best;
  const gaveWindow = w && previous.some(p => findDates(p).some(d => d.year != null && dateInWindows({ year: d.year, month: d.month }, [w], 0)));
  if (w && !gaveWindow) optional.push(fill(WINDOW_LINE[lang], { start: monthLabel(w.start, lang), end: monthLabel(w.end, lang) }));

  const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
  let n = count(lead);
  let tipped = false;
  for (const o of optional) {
    if (said(o)) continue;
    const isTip = tips.includes(o);
    if (isTip && tipped) continue;
    // One practical tip always fits (rules.md §1.4); other extras stop at the word budget.
    if (n + count(o) > MAX_WORDS[lang] && parts.length >= 3 && !isTip) continue;
    parts.push(o);
    n += count(o);
    if (isTip) tipped = true;
  }
  if (parts.length < 3 && !said(ASK_MORE[lang])) parts.push(ASK_MORE[lang]);
  if (c.ask === 'wellbeing' || plan.resolved === 'health_wellbeing') parts.push(DOCTOR_LINE[lang]);
  return localText(parts.map(capFirst).join(' '), lang);
}

/** A short pointer used when no model is available and the plan has nothing to say. */
export function renderNoTopic(lang: Lang): string {
  return S.askWhen[lang];
}

/** Krishna without a model: a short line, then the verse the app picks for the question (hi/bn digits). */
export function krishnaTemplate(question: string, lang: Lang): string {
  return localText(`${S.krishnaOffline[lang]}\n\n${formatGitaQuote(pickGitaVerse(question), lang)}`, lang);
}
