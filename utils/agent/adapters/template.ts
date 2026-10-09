/**
 * TemplateRenderer: a complete answer written from the AnswerPlan alone, in
 * en / hi / bn, with no model. Used for the plan's declines and redirects,
 * whenever no model is available (not downloaded, failed to load, web), and
 * as the last fallback of the verify layer. Pure.
 */
import type { AnswerPlan } from '../plan';
import { AREA, AREA_GEN_BN, HELPS, S, fill, monthLabel, relationWord, type Lang } from '../strings';
import type { TimingTopic, TimingWindow } from '../../timing-engine';

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
  return fill(table[plan.lang], vars(plan.lang, t.topic, t.best));
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
  out.push(fill((t.result.past ? S.pastWindow : S.window)[lang], { ...v, who }));
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
  return out;
}

/**
 * The full deterministic answer for a plan. Routes 'crisis', 'greeting' and
 * 'canned' use the app's i18n strings and are rendered by the pipeline; for
 * those, and for an answer with no topic, this returns null.
 */
export function renderTemplate(plan: AnswerPlan): string | null {
  const lang = plan.lang;
  if (plan.route === 'decline') {
    switch (plan.decline) {
      case 'death': return S.death[lang];
      case 'elderChildren': return S.elderChildren[lang];
      case 'otherMissing': {
        const owner = plan.subject.isYou === false
          ? fill(S.ownerOther[lang], { name: firstName(plan.subject.name) }) : S.ownerSelf[lang];
        return fill(S.otherMissing[lang], { relation: relationWord(plan.missingRelation ?? 'relative'), owner });
      }
      case 'minorRomance': {
        const parts = [fill(S.minorRomance[lang], { age: plan.age ?? '' })];
        if (plan.timing) parts.push(...timingSentences(plan));
        return parts.join(' ');
      }
      default: return null;
    }
  }
  if (plan.route !== 'answer' || !plan.timing) return null;
  const t = plan.timing;
  const parts: string[] = [];
  const fact = plan.facts[0];
  if (fact && !t.result.past) parts.push(fill(S[fact.code][lang], vars(lang, t.topic)));
  parts.push(...timingSentences(plan));
  return parts.join(' ');
}

/** A short pointer used when no model is available and the plan has nothing to say. */
export function renderNoTopic(lang: Lang): string {
  return S.askWhen[lang];
}
