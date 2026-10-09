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
import { dateInWindows, nearerStretch, yearsAway, TOPIC_RULES, type Link, type LinkKind, type TimingTopic, type TimingWindow } from '../../timing-engine';
import { PLANET_PLAIN } from '../category-strings';
import { formatGitaQuote, pickGitaVerse } from '../../gita';
import { findDates, replyOverlap, westernDigits } from '../../reply-guards';
import type { AnswerContent } from '../astrologer';
import {
  FOLLOW_LEAD_ASK, NEXT_ITEM_ASK, AREA_OF_HOUSE,
  AND, BECAUSE, COMMA, DOCTOR_LINE, EXAMPLES, EXAMPLES_MORE, FIELD_LINE, FOLLOW_LEAD, FOLLOW_LEAD_NEXT, LEAD, MEET_LINE, NEXT_ITEM, PLACE_LINE, TIP, TIP2,
  WEAK_LINE, WINDOW_LINE,
} from '../ask-strings';

const firstName = (name: string) => name.split(' ')[0];

/** Topic words a category reads better with than the engine topic's ("clearing your loans", not "money"). */
const AREA_OVERRIDE: Record<string, { l: Record<Lang, string>; gen: string }> = {
  debt: { l: { en: 'clearing your loans', hi: 'कर्ज़ से छुटकारे', bn: 'ঋণ শোধ' }, gen: 'ঋণ শোধের' },
  owed: { l: { en: 'getting your money back', hi: 'पैसा वापस मिलने', bn: 'টাকা ফেরত পাওয়া' }, gen: 'টাকা ফেরত পাওয়ার' },
  approval: { l: { en: 'getting the loan approved', hi: 'लोन मंज़ूर होने', bn: 'ঋণ মঞ্জুর হওয়া' }, gen: 'ঋণ মঞ্জুর হওয়ার' },
  vehicle: { l: { en: 'buying a vehicle', hi: 'गाड़ी लेने', bn: 'গাড়ি কেনা' }, gen: 'গাড়ি কেনার' },
  relationship: { l: { en: 'your relationship', hi: 'रिश्ते में सुधार', bn: 'সম্পর্ক ভালো হওয়া' }, gen: 'সম্পর্ক ভালো হওয়ার' },
};
const VEHICLE = /\b(?:car|bike|scooter|vehicle|gaa?di|gari|motorcycle)\b|गाड़ी|गाडी|वाहन|स्कूटर|গাড়ি|গাড়ি|বাইক/i;

const HELP_APPROVAL: Record<Lang, string> = {
  en: 'Until then, keep every repayment on time and your expenses within budget; lenders look at that record first.',
  hi: 'तब तक हर किस्त समय पर चुकाएँ और खर्च बजट में रखें; लोन देने वाले सबसे पहले यही रिकॉर्ड देखते हैं।',
  bn: 'ততদিন প্রতিটা কিস্তি সময়ে শোধ করুন আর খরচ বাজেটের মধ্যে রাখুন; ঋণদাতারা প্রথমে এই রেকর্ডটাই দেখেন।',
};

function areaOverride(plan: AnswerPlan | undefined, topic: TimingTopic): (typeof AREA_OVERRIDE)[string] | null {
  if (!plan) return null;
  if (topic === 'money' && plan.resolved === 'debt_loans') {
    return plan.intent.flags.owed ? AREA_OVERRIDE.owed : /approv|\bpass\b|sanction|मंज़ूर|मंजूर|पास|মঞ্জুর|পাস/i.test(plan.question) ? AREA_OVERRIDE.approval : AREA_OVERRIDE.debt;
  }
  if (topic === 'property' && VEHICLE.test(plan.question)) return AREA_OVERRIDE.vehicle;
  if (topic === 'love' && plan.resolved === 'relationship_problems') return AREA_OVERRIDE.relationship;
  return null;
}

function vars(lang: Lang, topic: TimingTopic, w?: TimingWindow, plan?: AnswerPlan): Record<string, string> {
  const o = areaOverride(plan, topic);
  return {
    area: o ? o.l[lang] : AREA[lang][topic],
    areaGen: o ? o.gen : AREA_GEN_BN[topic],
    ...(w ? { start: monthLabel(w.start, lang), end: monthLabel(w.end, lang), peak: monthLabel(w.peak, lang) } : {}),
  };
}

/** "The strongest window for this is …" (the verify layer's repair sentence). */
export function repairSentence(plan: AnswerPlan): string {
  const t = plan.timing!;
  const table = t.result.past ? S.repairPast : plan.notes.includes('narrow') ? S.repairPeak : S.repair;
  return localText(fill(table[plan.lang], vars(plan.lang, t.topic, t.best, plan)), plan.lang);
}

/** How a sub-period planet is tied to the topic, as a clause with the planet as subject. */
const LINK_TEXT: Partial<Record<LinkKind, Record<Lang, string>>> = {
  occupant: { en: '{p} sits in your {area} side', hi: '{p} आपके {area} वाले पहलू में बैठा है', bn: '{p} আছে আপনার {area} দিকে' },
  lord: { en: '{p} guides your {area} side', hi: '{p} आपके {area} वाले पहलू को चलाता है', bn: '{p} আপনার {area} দিকটা চালায়' },
  aspect: { en: '{p} looks at your {area} side', hi: '{p} की नज़र आपके {area} वाले पहलू पर है', bn: '{p}-এর নজর আছে আপনার {area} দিকে' },
  withLord: { en: '{p} sits with the planet that guides your {area} side', hi: '{p} आपके {area} वाले पहलू के स्वामी ग्रह के साथ है', bn: '{p} আছে আপনার {area} দিকের অধিপতির সঙ্গে' },
  karaka: { en: '{p} naturally stands for {topic}', hi: '{p} स्वाभाविक रूप से {topic} से जुड़ा है', bn: '{p} স্বভাবতই {topicGen} সঙ্গে জড়িত' },
};
const LINK_ORDER: LinkKind[] = ['occupant', 'lord', 'aspect', 'withLord', 'karaka'];
/** House words for a topic's reason ("the Sun guides your schooling side" for exams, not "your home side"). */
const TOPIC_HOUSE_WORD: Partial<Record<TimingTopic, Record<number, Record<Lang, string>>>> = {
  education: { 4: { en: 'schooling', hi: 'शिक्षा', bn: 'শিক্ষার' }, 5: { en: 'learning', hi: 'पढ़ाई', bn: 'পড়াশোনার' } },
  love: { 5: { en: 'romance', hi: 'प्रेम', bn: 'প্রেমের' } },
  marriage: { 5: { en: 'romance', hi: 'प्रेम', bn: 'প্রেমের' } },
  children: { 5: { en: 'children', hi: 'संतान', bn: 'সন্তানের' } },
};
/** "Saturn" / "the Moon" as a sentence subject; `bare` drops the article ("your Moon phase"). */
const planetName = (p: string, l: Lang, bare = false) => (bare ? (PLANET_PLAIN[p]?.[l] ?? p).replace(/^the /, '') : PLANET_PLAIN[p]?.[l] ?? p);

/**
 * The window's chart reason in one sentence: the sub-period (antardasha) planet running
 * then and its strongest tie to the topic's houses ("That's when your Saturn phase runs,
 * and Saturn sits in your career side."), plus the slow-planet transit support. Falls
 * back to the major-period planet when the sub-period planet has no tie. Rubric 3.2:
 * one concrete chart reason instead of "the part of the life timeline linked to …".
 */
export function reasonSentence(plan: AnswerPlan): string | null {
  const t = plan.timing;
  if (!t) return null;
  const lang = plan.lang;
  const d = t.best.reasons.find(r => r.kind === 'dasha') as { kind: 'dasha'; maha: string; antar: string; mahaLinks: Link[]; antarLinks: Link[] } | undefined;
  const houses = TOPIC_RULES[t.topic].houses.map(([h]) => h);
  const pick = (links: Link[]) => {
    const ok = links.filter(l => LINK_TEXT[l.kind] && (l.kind === 'karaka' || (l.house != null && houses.includes(l.house))));
    return ok.sort((a, b) => LINK_ORDER.indexOf(a.kind) - LINK_ORDER.indexOf(b.kind)
      || houses.indexOf(a.house ?? 99) - houses.indexOf(b.house ?? 99))[0] ?? null;
  };
  const transit = t.best.reasons.some(r => r.kind === 'doubleTransit') ? S.plusDouble[lang]
    : t.best.reasons.some(r => r.kind === 'jupiterTransit') ? S.plusJupiter[lang] : '';
  const v = vars(lang, t.topic, t.best, plan);
  if (!d) return transit ? transit.trim() : null;
  let planet = d.antar, link = pick(d.antarLinks);
  if (!link && pick(d.mahaLinks)) { planet = d.maha; link = pick(d.mahaLinks); }
  const P = planetName(planet, lang, true);
  let text: string;
  if (link) {
    const clause = fill(LINK_TEXT[link.kind]![lang], {
      p: planetName(planet, lang), area: link.house ? (TOPIC_HOUSE_WORD[t.topic]?.[link.house]?.[lang] ?? AREA_OF_HOUSE[lang][link.house]) : '', topic: AREA[lang][t.topic], topicGen: AREA_GEN_BN[t.topic],
    });
    text = fill(S.reasonPlanet[lang], { P, link: clause });
  } else {
    text = fill(S.reasonPlanetOnly[lang], { P, area: v.area, areaGen: v.areaGen });
  }
  text += transit;
  // Another person's chart: their phase and their houses, not "your".
  if (plan.subject.isYou === false) {
    const name = firstName(plan.subject.name);
    text = lang === 'en' ? text.replace(/\byour\b/g, `${name}'s`)
      : lang === 'hi' ? text.replace(/आपके /g, `${name} के `).replace(/आपकी /g, `${name} की `)
        : text.replace(/আপনার /g, `${name}-এর `);
  }
  return text;
}

/**
 * At most one sentence about other windows (rubric: best window first, never two
 * competing ones): a stronger stretch when the best is only steady, the nearer
 * opening when a strong best is two or more years away, else the next good one.
 */
function altSentence(plan: AnswerPlan): string | null {
  const t = plan.timing!;
  if (plan.notes.includes('narrow') || t.result.past) return null;
  const lang = plan.lang;
  const best = t.best;
  const ws = t.result.windows;
  const lab = (w: { start: Date; end: Date }) => ({ start: monthLabel(w.start, lang), end: monthLabel(w.end, lang) });
  if (best.strength !== 'strong') {
    const strong = ws.filter(w => w !== best && w.strength === 'strong').sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    if (strong) return fill(S.altStronger[lang], lab(strong));
    if (t.result.nextStrong && yearsAway(t.result.nextStrong, plan.now) < 6) return fill(S.altNextStrong[lang], lab(t.result.nextStrong));
    return plan.say.some(l => l.code === 'likelihood') ? null : S.altSteady[lang];
  }
  if (yearsAway(best, plan.now) >= 2) {
    const nearer = ws.filter(w => w !== best && w.start < best.start).sort((a, b) => a.start.getTime() - b.start.getTime())[0]
      ?? nearerStretch(t.result, best);
    if (nearer) return fill(S.altEarlier[lang], lab(nearer));
  }
  const later = ws.filter(w => w !== best && w.start > best.end).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return later ? fill(S.altSecond[lang], lab(later)) : null;
}

/** Categories whose timing paragraph is compact (window and reason only). */
const COMPACT = new Set(['relationship_problems', 'mental_health_distress', 'why_now_current_phase', 'family_parents_siblings', 'divorce_separation', 'health_wellbeing', 'business_vs_job']);

/** Codes of plan lines that already give the answer's practical step (the topic tip is then left out). */
const PRACTICAL = new Set(['practical_step', 'communication_step', 'money_habit', 'study_strategy', 'self_care', 'doctor', 'lawyer']);

/**
 * The timing paragraph (Stage 3: 50-90 words, answer first): the window (with
 * the most likely month when narrowing, or the other person's name), one chart
 * reason, at most one other window, one practical step, and the caveats.
 */
export function timingSentences(plan: AnswerPlan, { withHelps = true } = {}): string[] {
  const t = plan.timing;
  if (!t) return [];
  const lang = plan.lang;
  const v = vars(lang, t.topic, t.best, plan);
  const out: string[] = [];
  const other = plan.subject.isYou === false && plan.decline !== 'minorRomance';
  const name = firstName(plan.subject.name);
  const named = { ...v, name, nameGen: `${name}-এর` };
  const narrow = plan.notes.includes('narrow');
  if (t.result.past) out.push(fill(S.pastWindow[lang], { ...v, who: other ? fill(S.whoOther[lang], { name }) : '' }));
  else if (other) out.push(fill(S.windowOther[lang], named));
  else out.push(fill((narrow ? S.windowNarrow : t.topic === 'general' ? S.windowGeneral : S.window)[lang], { ...v, who: '' }));
  // Where feelings, dynamics or care lead the answer, the window is one part of it: no alternatives.
  // A yes/no answer (likelihood line) is likelihood + window + reason: no alternatives either.
  const compact = COMPACT.has(plan.resolved) || plan.say.some(l => l.code === 'likelihood');
  if (!t.result.past && plan.decline !== 'minorRomance') {
    const reason = reasonSentence(plan);
    if (reason) out.push(reason);
    const alt = compact ? null : altSentence(plan);
    if (alt) out.push(alt);
  }
  if (!t.result.past && withHelps && !plan.say.some(l => PRACTICAL.has(l.code))) {
    // Loan approval: a saving/returns tip is beside the point; repayment record and paperwork are what lenders weigh.
    const approval = areaOverride(plan, t.topic) === AREA_OVERRIDE.approval;
    out.push(other ? fill(S.helpOther[lang], named) : approval ? HELP_APPROVAL[lang] : HELPS[lang][t.topic]);
  }
  if (plan.notes.includes('exactDate')) out.push(S.exactDate[lang]);
  if (plan.notes.includes('noTime')) out.push(S.noTimeShort[lang]);
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
      case 'death': {
        // An accident question gets its own decline; an ill parent gets sympathy first and care lines (plan.say), not "ask me about the coming years".
        if (/\baccident|durghatna|dughotona|दुर्घटना|এক্সিডেন্ট|দুর্ঘটনা/i.test(plan.question)) return withLines(plan, S.accident[lang], previous);
        return withLines(plan, plan.say.some(l => l.code === 'validation') ? S.deathShort[lang] : S.death[lang], previous);
      }
      case 'elderChildren': return withLines(plan, S.elderChildren[lang], previous);
      case 'otherMissing': {
        const owner = plan.subject.isYou === false
          ? fill(S.ownerOther[lang], { name: firstName(plan.subject.name) }) : S.ownerSelf[lang];
        return fill(S.otherMissing[lang], { relation: relationWord(plan.missingRelation ?? 'relative'), owner });
      }
      case 'minorRomance': {
        // The redirect, the study window and one study tip: nothing about romance timing, no extra windows.
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
      // The window answers the question, so it comes first; the sub-period behind it is its reason.
      core = localText(timingSentences(plan).join(' '), lang);
    }
  }
  if (!core && !plan.say.length) return null;
  return withLines(plan, core, previous);
}

/** Soft word budget for a whole template answer (Stage 3 target 50-90 words; Hindi and Bengali run ~10% longer / shorter). */
const BUDGET: Record<Lang, number> = { en: 90, hi: 100, bn: 85 };

/**
 * The plan's lines around the core paragraph: lead lines first, then the
 * core, body and end lines. Lines already said in an earlier reply are left
 * out (unless required), and optional body lines stop at the word budget.
 */
function withLines(plan: AnswerPlan, core: string, previous: string[]): string {
  const lang = plan.lang;
  const said = (x: string) => previous.some(p => replyOverlap(westernDigits(x), p) >= SAID_MAX);
  const pick = (pos: 'lead' | 'body' | 'end') => plan.say.filter(l => l.pos === pos).map(l => ({ l, text: l.text[lang] }))
    // The direct answer to a choice ("IT or finance?") stays even when its reason echoes an earlier reply.
    .filter(({ l, text }) => l.required || l.code === 'leaning' || !said(text));
  const lead = pick('lead'), body = pick('body'), end = pick('end');
  const count = (x: string) => x.split(/\s+/).filter(Boolean).length;
  let n = count(core) + [...lead, ...end].reduce((a, x) => a + count(x.text), 0);
  const keptBody: string[] = [];
  // Codes the plan intends to cover (plan.must) that no kept line carries yet: such a line is kept past the budget.
  const covered = new Set([...lead, ...end].flatMap(x => [x.l.code, ...(x.l.also ?? [])]));
  // The core paragraph (window + sub-period, or the items + their reason) already gives the chart reason.
  if (core) covered.add('chart_reason');
  for (const b of body) {
    const needed = [b.l.code, ...(b.l.also ?? [])].some(c => plan.must.includes(c) && !covered.has(c));
    // Optional body lines stop at the budget (Stage 3: answers ran to 130-180 words keeping "at least one").
    if (!b.l.required && !needed && n + count(b.text) > BUDGET[lang]) continue;
    for (const c of [b.l.code, ...(b.l.also ?? [])]) covered.add(c);
    keptBody.push(b.text);
    n += count(b.text);
  }
  const coreSentences = core ? core.split(/(?<=[.!?।])\s+/) : [];
  // Answer first (rules.md §1.1): a timing core's window sentence (after a yes/no likelihood line) comes before
  // feelings and context lines; feelings-first categories (distress, why-now) keep their order.
  const DIRECT = new Set(['likelihood', 'compat_score', 'lucky_values', 'muhurat_days', 'computed_fact', 'leaning', 'decline_name', 'decline_sex', 'no_exact_day', 'peak', 'window', 'emergency', 'safety_resources', 'explain_reasoning']);
  // The core (a window, or a "which / what" answer's items) leads unless the category starts with feelings.
  const timingFirst = !plan.coreOff && !!core && !['mental_health_distress', 'why_now_current_phase', 'family_parents_siblings', 'relationship_problems'].includes(plan.resolved)
    && plan.category !== 'elderly';
  let head: string[] = lead.map(x => x.text);
  let coreRest = coreSentences;
  if (timingFirst && coreSentences.length) {
    // A one-phrase acknowledgement ("Thanks for telling me.", "Sorry…") still opens the answer.
    // Feelings get one short sentence before the answer (rules.md §1.8), never after the window.
    const OPENER = new Set(['ack_correction', 'calm_boundary', 'validation']);
    const open = lead.filter(x => OPENER.has(x.l.code)).map(x => x.text);
    const direct = lead.filter(x => DIRECT.has(x.l.code)).map(x => x.text);
    const rest = lead.filter(x => !DIRECT.has(x.l.code) && !OPENER.has(x.l.code)).map(x => x.text);
    head = [...open, ...direct, coreSentences[0], ...rest];
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
  if (parts.some(p => p.includes(',') || /\s(?:and|or|और|या|আর|ও|বা)\s/.test(p))) return parts.join(AND_ALSO[lang]);
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
  // Two items lead every answer (rubric: 2-3 options, never a shotgun list); the third is kept for follow-ups.
  const n = 2;
  const extra = Object.fromEntries(Object.entries(content.vars ?? {}).map(([k, v]) => [k, v[lang]]));
  return localText(fill(lead[lang], { ...extra, items: joinList(content.items.slice(0, n).map(i => (i.text.short ?? i.text.label)[lang]), lang) }), lang);
}

/** Sentences of an earlier reply count as said when they overlap a candidate this much. */
const SAID_MAX = 0.35;
/** Soft length cap of a template answer (the v5 answers stay under 90 words). */
const MAX_WORDS: Record<Lang, number> = { en: 62, hi: 66, bn: 56 };

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
  if (c.ask === 'whyNow') return renderWhyNow(plan, previous);
  const lang = plan.lang;
  const said = (t: string) => previous.some(p => replyOverlap(t, p) >= SAID_MAX);
  const label = (i: number) => (c.items[i] ? (c.items[i].text.short ?? c.items[i].text.label)[lang] : '');
  // A follow-up on the same items: an earlier reply already NAMED the first item (its label, not just a shared word).
  const namedBefore = (i: number) => !!c.items[i] && previous.some(p => {
    const w = westernDigits(p).toLowerCase();
    return [c.items[i].text.label[lang], c.items[i].text.short?.[lang]].some(x => x && w.includes(x.toLowerCase()));
  });
  // A clarification ("I mean which domain?") gets the full answer again, in other words.
  const followUp = !plan.intent.clarifies && c.items.length > 0 && namedBefore(0) && !!(FOLLOW_LEAD_ASK[c.ask] ?? DIRECTION_ASKS.has(c.ask));

  const leads = [0, 1, 2, 3].map(v => {
    const items = v % 2 === 1 && c.items.length > 1 ? [...c.items.slice(1), c.items[0]] : c.items;
    return contentLead({ ...c, items }, lang, v);
  });
  // A third turn on a "directions" ask names the next item to try (partner traits never get "the next one to try").
  const followLeads = [fill((FOLLOW_LEAD_ASK[c.ask] ?? FOLLOW_LEAD)[lang], { item: label(0) }),
    ...(label(1) && c.ask !== 'partner' ? [fill(FOLLOW_LEAD_NEXT[lang], { item: label(1) })] : [])];
  // "Where will we meet?": the meeting line is the answer, so it leads.
  const meetQ = c.ask === 'partner' && /\b(?:where|meet|kahan|kaha|kothay|kothai)\b|कहाँ|कहां|मिलूँ|मिलूं|কোথায়|দেখা হবে/i.test(plan.question);
  const meet = c.extra.find(e => e.kind === 'meet');
  let lead = followUp
    ? followLeads.find(l => !said(l)) ?? followLeads[0]
    : leads.find(l => !said(l)) ?? (plan.intent.clarifies ? leads[1] : leads[0]);
  // Love or arranged with no pull either way: say so, then the middle path (not "leans to … because no pull dominates").
  const evenLove = c.ask === 'loveArranged' && /:both$/.test(c.items[0]?.key ?? '');
  if (evenLove && !followUp) lead = fill(LOVE_EVEN[lang], { item: label(0) });
  const parts: string[] = [];
  if (meetQ && meet) parts.push(fill(MEET_LINE[lang], { meet: meet.text[lang] }));
  parts.push(lead);
  const optional: string[] = [];
  const whys = c.items.flatMap(i => (i.why ? [i.why[lang]] : []));
  // (Not when a leaning line already gave the same reason.)
  const leanWhy = plan.say.some(l => l.code === 'leaning' && whys[0] && l.text[lang].includes(whys[0]));
  if (whys.length && !followUp && !leanWhy && !evenLove) optional.push(fill(BECAUSE[lang], { reasons: whys[0] }));
  if (followUp) {
    // Items the thread hasn't named yet come first in a follow-up.
    for (const [k, it] of c.items.slice(1).entries()) {
      if (!namedBefore(k + 1) && it.why) optional.unshift(fill((NEXT_ITEM_ASK[c.ask] ?? NEXT_ITEM)[lang], { item: (it.text.short ?? it.text.label)[lang], why: it.why[lang] }));
    }
    lead = parts[parts.length - 1];
  }
  const exampleList = (i: number, n: number) => c.items[i]?.text.examples?.[lang].split(/,\s*/).slice(0, n).join(COMMA[lang]);
  if (c.ask === 'careerField') {
    // One set of concrete roles (rubric: no more than ~4 options); the second field's roles are a follow-up's new information.
    const ex0 = exampleList(0, 3);
    const ex1 = exampleList(1, 3);
    if (!followUp && ex0) optional.push(fill(EXAMPLES[lang], { examples: ex0 }));
    if (followUp && ex1) optional.push(fill(EXAMPLES_MORE[lang], { examples: ex1 }));
  }
  for (const e of c.extra) {
    const t = e.text[lang];
    if (e.kind === 'meet') { if (!meetQ) optional.push(fill(MEET_LINE[lang], { meet: t })); }
    else if (e.kind === 'weak') optional.push(fill(WEAK_LINE[lang], { weak: t }));
    else if (e.kind === 'place') optional.push(fill(PLACE_LINE[lang], { place: t }));
    else if (e.kind === 'field') optional.push(fill(FIELD_LINE[lang], { field: t }));
    else optional.push(t);
  }
  const leanJob = c.ask === 'businessVsJob' && /:job$/.test(c.items[0]?.key ?? '');
  const tip1 = leanJob ? TIP_JOB[lang] : TIP[c.ask][lang];
  const tips = plan.intent.kind === 'advice' || followUp ? [TIP2[c.ask][lang], tip1] : [tip1, TIP2[c.ask][lang]];
  optional.push(...tips);
  // A dated "good time to move" only where the chart favours the move and it is near (rubric 3.3: no far, unasked dates).
  const w = c.window?.best;
  const moveAsk = (c.ask === 'businessVsJob' && /:(?:business|both)$/.test(c.items[0]?.key ?? '')) || (c.ask === 'relocation' && /:abroad$/.test(c.items[0]?.key ?? ''));
  const near = w && (w.start.getTime() - plan.now.getTime()) / (365.25 * 86400000) < 2;
  const gaveWindow = w && previous.some(p => findDates(p).some(d => d.year != null && dateInWindows({ year: d.year, month: d.month }, [w], 0)));
  if (w && moveAsk && near && !gaveWindow) optional.push(fill(WINDOW_LINE[lang], { start: monthLabel(w.start, lang), end: monthLabel(w.end, lang) }));

  const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
  let n = parts.reduce((a, x) => a + count(x), 0);
  let tipped = false;
  for (const o of optional) {
    if (said(o)) continue;
    const isTip = tips.includes(o);
    if (isTip && tipped) continue;
    // One practical tip always fits (rules.md §1.4); other extras stop at the word budget.
    if (n + count(o) > MAX_WORDS[lang] && parts.length >= 2 && !isTip) continue;
    parts.push(o);
    n += count(o);
    if (isTip) tipped = true;
  }
  if (c.ask === 'wellbeing' || plan.resolved === 'health_wellbeing') parts.push(DOCTOR_LINE[lang]);
  return localText(parts.map(capFirst).join(' '), lang);
}

const LOVE_EVEN: Record<Lang, string> = {
  en: "Your chart doesn't lean strongly either way, so the natural middle path is {item}.",
  hi: 'आपका चार्ट किसी एक तरफ़ ज़्यादा नहीं झुकता, इसलिए सबसे सहज रास्ता है: {item}।',
  bn: 'আপনার চার্ট কোনো এক দিকে বেশি ঝোঁকে না, তাই সবচেয়ে স্বাভাবিক পথ: {item}।',
};

/** Asks whose items are "directions" (FOLLOW_LEAD reads "your strongest direction is …"). */
const DIRECTION_ASKS = new Set(['careerField', 'studyField']);

/** Job-leaning business-vs-job tip (the business tip "test the idea before big money" contradicts a job leaning). */
const TIP_JOB: Record<Lang, string> = {
  en: 'Grow inside a role first; if you want a side venture, keep it small and part-time.',
  hi: 'पहले किसी नौकरी में आगे बढ़ें; कोई साइड काम करना हो तो उसे छोटा और पार्ट-टाइम रखें।',
  bn: 'আগে চাকরিতে এগোন; পাশে কিছু করতে চাইলে সেটা ছোট আর পার্ট-টাইম রাখুন।',
};

const WHY_LEAD: Record<'main' | 'satYes' | 'satNo' | 'also', Record<Lang, string>> = {
  main: { en: 'The main reason is {x}.', hi: 'इसकी मुख्य वजह है: {x}।', bn: 'এর মূল কারণ: {x}।' },
  satYes: { en: 'Yes, Saturn is part of it: {x}.', hi: 'हाँ, इसमें शनि की भूमिका है: {x}।', bn: 'হ্যাঁ, এতে শনির ভূমিকা আছে: {x}।' },
  satNo: { en: "Saturn isn't the main pressure right now; the bigger factor is {x}.", hi: 'अभी शनि मुख्य दबाव नहीं है; बड़ी वजह है: {x}।', bn: 'এখন শনি মূল চাপ নয়; বড় কারণ হলো: {x}।' },
  also: { en: 'Alongside it: {x}.', hi: 'इसके साथ: {x}।', bn: 'এর সঙ্গে: {x}।' },
};

const WHY_MEANS: Record<'saturn' | 'phase', Record<Lang, string>> = {
  saturn: {
    en: 'Saturn slows things down and tests patience; it does not block results, and steady routine is what it rewards.',
    hi: 'शनि चीज़ों को धीमा करता है और धैर्य परखता है; यह नतीजे रोकता नहीं, नियमित मेहनत का फल देता है।',
    bn: 'শনি সবকিছু ধীর করে আর ধৈর্যের পরীক্ষা নেয়; এটা ফল আটকায় না, নিয়মিত পরিশ্রমেরই ফল দেয়।',
  },
  phase: {
    en: 'This is a phase with an end date, not a verdict on you.',
    hi: 'यह एक दौर है जिसका अंत तय है, आपके बारे में कोई फ़ैसला नहीं।',
    bn: 'এটা একটা পর্ব, যার শেষ আছে; আপনার সম্পর্কে কোনো রায় নয়।',
  },
};

/**
 * "Why is everything going wrong?": the main cause first (a hard Saturn transit over
 * the Moon when there is one, else the current sub-period, else the major period),
 * the other running cycle, one hopeful dated line when the plan has one, and a step.
 * Answers "is it Saturn?" directly. Stage 3 judging: the older template listed the
 * major and sub-period abstractly and left the Saturn pressure out.
 */
function renderWhyNow(plan: AnswerPlan, previous: string[]): string {
  const c = plan.content!;
  const lang = plan.lang;
  const said = (t: string) => previous.some(p => replyOverlap(t, p) >= SAID_MAX);
  const get = (k: string) => c.items.find(i => i.key === k);
  const sat = c.items.find(i => i.planet === 'Saturn' && !['why:maha', 'why:antar'].includes(i.key));
  const antar = get('why:antar');
  const maha = get('why:maha');
  const main = sat ?? antar ?? maha;
  if (!main) return '';
  const second = [antar, maha].find(x => x && x !== main);
  const lab = (i: typeof main) => i.text.label[lang];
  const askedSaturn = /\b(?:saturn|shan[iy]|shoni)(?:r|er|ka|ki|ke)?\b|\bsade ?sati\b|शनि|साढ़े ?साती|শনি|সাড়ে ?সাতি/i.test(plan.question);
  const first = askedSaturn ? fill((sat ? WHY_LEAD.satYes : WHY_LEAD.satNo)[lang], { x: lab(main) }) : fill(WHY_LEAD.main[lang], { x: lab(main) });
  const parts: string[] = [first];
  const add = (t: string | undefined) => { if (t && !said(t)) parts.push(t); };
  const repeat = said(first);
  if (second && !repeat) add(fill(WHY_LEAD.also[lang], { x: lab(second) }));
  // A follow-up that already heard the cause gets what it means instead (never just a tip).
  if (repeat || !second) add(sat ? WHY_MEANS.saturn[lang] : WHY_MEANS.phase[lang]);
  const hope = c.extra.find(e => e.kind === 'line' || e.kind === 'topicLink');
  if (hope) add(hope.text[lang]);
  const tip = said(TIP.whyNow[lang]) ? TIP2.whyNow[lang] : TIP.whyNow[lang];
  parts.push(tip);
  if (!parts.length) parts.push(first);
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
