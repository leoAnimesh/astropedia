/**
 * Text helpers for the traditional kundli-match detail on the compatibility
 * screen (app/report/pair.tsx, partner mode): the Nadi / Bhakoot cancellation
 * reasons, Manglik exemptions, and the detailed question sent to the Love guru.
 * Keys live in the `compatibility` namespace (match.* and question.*).
 */
import { NAKSHATRAS } from '@/constants/astrology';
import {
  SIGN_LORD, SIGN_NAMES,
  type DoshaDetail, type KundliMatch, type ManglikExemption, type ManglikInfo,
} from './ashtakoota';
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
