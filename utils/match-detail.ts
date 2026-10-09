/**
 * Text helpers for the traditional kundli-match detail (partner mode): the
 * Nadi / Bhakoot / Gana cancellation reasons, each person's Manglik reading
 * (references, exemptions, level), and the detailed question sent to the
 * Love guru. matchChecks() builds the "Things to consider" items shared by the
 * compatibility screen (app/report/pair.tsx) and the full report + PDF
 * (utils/reports/compat.ts). Traditional detail keys live in the
 * `compatibility` namespace (match.* and question.*); the plain sentences in
 * `reports` (e.compat.checks.*).
 */
import { NAKSHATRAS } from '../constants/astrology';
import {
  NAK_GANA, SIGN_LORD, SIGN_NAMES, nadiOf, signCount,
  type DoshaDetail, type KundliMatch, type ManglikExemption, type ManglikInfo,
} from './ashtakoota';
import type { CheckItem } from './reports/types';
import { askLanguage, tAsk, tNakshatra, tPlanet, tSign, type AppLanguage } from './i18n';

export type Tr = (key: string, vars?: Record<string, unknown>) => string;

type Named = { name: string; isYou?: boolean | null };
const firstName = (p: Named) => p.name.split(' ')[0] || p.name;

/** "a", "a and b", "a, b and c" with the language's separators. */
export function listJoin(items: string[], sep: string, last: string): string {
  return items.length <= 1 ? (items[0] ?? '') : items.slice(0, -1).join(sep) + last + items[items.length - 1];
}

/** The plain-language reason a Nadi/Bhakoot dosha is cancelled ('' if none). */
export function doshaReason(
  d: DoshaDetail, match: KundliMatch, tr: Tr, planet: (name: string) => string, num: (n: number) => string,
): string {
  if (!d.reason) return '';
  const a = match.brideChart.moon, b = match.groomChart.moon;
  return tr(`match.dosha.reason.${d.reason}`, {
    planet: planet(SIGN_LORD[a.sign]),
    a:      planet(SIGN_LORD[a.sign]),
    b:      planet(SIGN_LORD[b.sign]),
    padaA:  num(a.pada),
    padaB:  num(b.pada),
  });
}

/** Why a person's Manglik placement is exempt, e.g. "Mars is exalted in Capricorn". */
export function exemptionText(m: ManglikInfo, tr: Tr, lng?: AppLanguage, num: (n: number) => string = String): string {
  return m.exemptions.map((e: ManglikExemption) => {
    const ref = m.refs.find((r) => r.exemption === e);
    return tr(`match.dosha.manglik.exemption.${e}`, {
      sign:  tSign(SIGN_NAMES[m.marsSign], lng),
      house: num(ref?.house ?? m.house),
    });
  }).join('; ');
}

/** Graha Maitri points, used by the "Gana softened" reason. */
export function maitriScore(match: KundliMatch): number {
  return match.kootas.find((k) => k.key === 'maitri')?.score ?? 0;
}

/**
 * The detailed matching question for the chat (scores, doshas with their
 * cancellations, each person's Manglik reading), in the language the
 * on-device model speaks.
 */
export function matchQuestion(match: KundliMatch, bride: Named, groom: Named): string {
  const lng = askLanguage();
  const Q = (key: string, vars?: Record<string, unknown>) => tAsk(`compatibility:question.${key}`, vars);
  const tc: Tr = (k, v) => tAsk(`compatibility:${k}`, v);
  const parts = match.kootas
    .map((k) => Q('part', { name: tAsk(`compatibility:match.koota.${k.key}.name`), score: k.score, max: k.max }))
    .join(', ');
  const manglikLine = (p: Named, m: ManglikInfo) => {
    const active = m.refs.filter((r) => r.flagged && !r.exemption);
    const shown  = m.level === 'none' || m.level === 'cancelled' ? m.refs : active;
    return Q(`manglik.${m.level}`, {
      name:      firstName(p),
      refs:      listJoin(shown.map((r) => Q(`basis.${r.ref}`)), Q('refJoin'), Q('refJoinLast')),
      exemption: exemptionText(m, tc, lng),
      approx:    m.approximate ? Q('approx') : '',
      age:       m.ageSoftened ? Q('age') : '',
    });
  };
  const statusQ = (status: string, reason: string) => Q(`status.${status}`, { reason });
  const reason = (d: DoshaDetail) => doshaReason(d, match, tc, (n) => tPlanet(n, lng), String);
  return [
    Q('intro', {
      bride:     firstName(bride),
      brideSign: tSign(SIGN_NAMES[match.brideChart.moon.sign], lng),
      brideNak:  tNakshatra(NAKSHATRAS[match.brideChart.moon.nak].name, lng),
      groom:     firstName(groom),
      groomSign: tSign(SIGN_NAMES[match.groomChart.moon.sign], lng),
      groomNak:  tNakshatra(NAKSHATRAS[match.groomChart.moon.nak].name, lng),
      total:     match.total,
      parts,
    }),
    Q('dosha', {
      nadi:    statusQ(match.nadiDetail.status, reason(match.nadiDetail)),
      bhakoot: statusQ(match.bhakootDetail.status, reason(match.bhakootDetail)),
      gana:    statusQ(match.ganaDetail.status, match.ganaDetail.reason
        ? tAsk(`compatibility:match.dosha.gana.reason.${match.ganaDetail.reason}`, { score: maitriScore(match) })
        : ''),
    }),
    Q('manglikPair', { a: manglikLine(bride, match.manglik.bride), b: manglikLine(groom, match.manglik.groom) }),
    match.manglik.status === 'none' ? '' : Q(`pair.${match.manglik.status}`),
    Q(bride.isYou || groom.isYou ? 'ask.us' : 'ask.them'),
  ].filter(Boolean).join(' ');
}

/**
 * The four traditional checks of a partner match, each with a plain sentence
 * (`rt`, reports namespace: e.compat.checks.*) and the compatibility screen's
 * traditional detail (`ct`, compatibility namespace: match.dosha.*).
 * `planet` / `num` localize planet names and digits.
 */
export function matchChecks(
  match: KundliMatch, bride: Named, groom: Named,
  rt: Tr, ct: Tr, planet: (name: string) => string, num: (n: number) => string,
): CheckItem[] {
  const reason = (d: DoshaDetail) => doshaReason(d, match, ct, planet, num);
  const state = (s: string): CheckItem['state'] => (s === 'none' ? 'clear' : s === 'present' ? 'note' : 'eased');
  const item = (key: 'nadi' | 'bhakoot' | 'gana', status: string, detail: string): CheckItem => ({
    key, name: rt(`koota.${key}.name`), trad: rt(`koota.${key}.trad`), state: state(status),
    text: rt(`checks.${key}.${status}`), detail, people: [],
  });
  const bCount = signCount(match.brideChart.moon.sign, match.groomChart.moon.sign);
  const gCount = signCount(match.groomChart.moon.sign, match.brideChart.moon.sign);
  const g = match.ganaDetail;

  const person = (p: Named, m: ManglikInfo) => {
    const active = m.refs.filter((r) => r.flagged && !r.exemption);
    const detail = [
      ct(`match.dosha.manglik.level.${m.level}`, {
        refs: listJoin(active.map((r) => ct(`match.dosha.manglik.basis.${r.ref}`)), ct('match.dosha.manglik.refJoin'), ct('match.dosha.manglik.refJoinLast')),
        exemption: exemptionText(m, ct, undefined, num),
      }),
      m.refs.map((r) => ct('match.dosha.manglik.refItem', { ref: ct(`match.dosha.manglik.basis.${r.ref}`), house: num(r.house) })
        + (r.flagged ? ct(`match.dosha.manglik.refFlag.${r.exemption ? 'exempt' : 'flagged'}`) : '')).join(' · '),
      m.lagnaMissing ? ct(`match.dosha.manglik.approx.${m.lagnaMissing}`) : '',
      m.ageSoftened ? ct('match.dosha.manglik.ageNote') : '',
    ].filter(Boolean);
    return { name: firstName(p), text: rt(`checks.manglik.person.${m.level}`, { name: firstName(p) }), detail };
  };
  const ms = match.manglik.status;

  return [
    item('nadi', match.nadiDetail.status, ct(`match.dosha.nadi.${match.nadiDetail.status}`, {
      nadi: ct(`match.nadiName.${nadiOf(match.brideChart.moon.nak)}`),
      reason: reason(match.nadiDetail),
    })),
    item('bhakoot', match.bhakootDetail.status, ct(`match.dosha.bhakoot.${match.bhakootDetail.status}`, {
      count: `${num(Math.min(bCount, gCount))}/${num(Math.max(bCount, gCount))}`,
      reason: reason(match.bhakootDetail),
    })),
    item('gana', g.status, ct(`match.dosha.gana.${g.status}`, {
      a: ct(`match.ganaName.${NAK_GANA[match.brideChart.moon.nak]}`),
      b: ct(`match.ganaName.${NAK_GANA[match.groomChart.moon.nak]}`),
      reason: g.reason ? ct(`match.dosha.gana.reason.${g.reason}`, { score: num(maitriScore(match)) }) : '',
    })),
    {
      key: 'manglik', name: rt('checks.manglik.name'), trad: rt('checks.manglik.trad'),
      state: ms === 'none' ? 'clear' : ms === 'one' ? 'note' : 'eased',
      text: rt(`checks.manglik.status.${ms}`),
      // The plain status says it; each person's traditional reading is below.
      detail: '',
      people: [person(bride, match.manglik.bride), person(groom, match.manglik.groom)],
    },
  ];
}
