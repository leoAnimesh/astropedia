/**
 * Compatibility report for two people (ReportCompat board).
 *
 *  - Partner: the traditional 36-point count (utils/ashtakoota.ts
 *    matchCharts: eight kootas, labelled as tradition, shown with plain
 *    names) plus the Mars check stated plainly. Adults only.
 *  - Friend / Family: no score at all. The three temperament checks of
 *    utils/compatibility.ts computeCompatibility (gana, nadi, bhakoot) only
 *    pick which plain sentences apply.
 *
 * Chapters read both Moon signs (element), the kootas that fit or don't,
 * and "good times ahead" from both people's dasha sub-periods and Jupiter's
 * moves counted from each Moon (utils/reports/facts.ts).
 */
import { matchCharts, verdictFor, type KootaKey } from '../ashtakoota';
import { computeCompatibility } from '../compatibility';
import { guruLocked } from '../guru-context';
import type { Profile } from '../database';
import i18n, { tPlanet } from '../i18n';
import { chartHash, elementOf, getChartFacts, type Element } from './facts';
import { dmy, lang, minutesToRead, my, sg, tr } from './build';
import { REPORT_VERSION, type Chapter, type CompatExtras, type KootaRow, type ReportPayload, type TimelineItem } from './types';

export type CompatMode = 'partner' | 'friend' | 'family';
export const COMPAT_MODES: readonly CompatMode[] = ['partner', 'friend', 'family'];

type Person = Pick<Profile, 'id' | 'name' | 'birthDate' | 'birthTime' | 'birthLat' | 'birthLng' | 'birthTz' | 'gender'>;

const DAY_MS = 86400000;
const first = (p: Person) => p.name.split(' ')[0] || p.name;

/** Display order of the eight kootas on the card (the ReportCompat board). */
const KOOTA_DISPLAY: KootaKey[] = ['gana', 'maitri', 'nadi', 'bhakoot', 'yoni', 'tara', 'vashya', 'varna'];

/** Bride first, groom second (the matching tradition), guessed from gender. */
export function orientPair<T extends Pick<Person, 'gender'>>(a: T, b: T): [T, T] {
  if (a.gender === 'man' || b.gender === 'woman') return [b, a];
  return [a, b];
}

/** Partner matching is shown only when both people are adults. */
export function partnerAllowed(a: Pick<Person, 'birthDate'>, b: Pick<Person, 'birthDate'>, now: Date = new Date()): boolean {
  return !guruLocked('love', a.birthDate, now) && !guruLocked('love', b.birthDate, now);
}

function pairKey(x: Element, y: Element): string {
  if (x === y) return 'sameElement';
  const s = new Set([x, y]);
  const has = (a: Element, b: Element) => s.has(a) && s.has(b);
  if (has('fire', 'air')) return 'fireAir';
  if (has('earth', 'water')) return 'earthWater';
  if (has('fire', 'water')) return 'fireWater';
  if (has('fire', 'earth')) return 'fireEarth';
  if (has('air', 'water')) return 'airWater';
  return 'airEarth';
}

const MODE_LORDS: Record<CompatMode, string[]> = {
  partner: ['Venus', 'Jupiter', 'Moon'],
  friend: ['Mercury', 'Jupiter', 'Venus'],
  family: ['Moon', 'Jupiter', 'Venus'],
};
const JUP_GOOD = [2, 5, 7, 9, 11];

/** Warmer stretches in the next two years for either person. */
function goodTimes(a: Person, b: Person, mode: CompatMode, now: Date): TimelineItem[] {
  const until = now.getTime() + 2 * 365 * DAY_MS;
  const items: TimelineItem[] = [];
  for (const p of [a, b]) {
    const f = getChartFacts(p, now);
    for (const s of f.dasha.ahead) {
      if (!MODE_LORDS[mode].includes(s.lord) || s.start.getTime() > until) continue;
      const isNow = s.start <= now;
      items.push({
        date: isNow ? tr('timing.nowTo', { date: my(s.end) }) : tr('timing.range', { from: my(s.start), to: my(s.end) }),
        tag: tr('timing.tag.chapter'),
        title: tr('compat.warm.sub', { name: first(p), planet: tPlanet(s.lord) }),
        sub: tr(`compat.warm.subSub.${s.lord}`),
        state: isNow ? 'now' : s.start.getTime() - now.getTime() < 365 * DAY_MS ? 'soon' : 'later',
        start: s.start.toISOString(), end: s.end.toISOString(), source: 'sub',
      });
    }
    for (const i of f.ingresses) {
      if (i.planet !== 'Jupiter' || i.date.getTime() > until || !JUP_GOOD.includes(i.toMoonHouse)) continue;
      items.push({
        date: dmy(i.date),
        tag: tr('timing.tag.move'),
        title: tr('compat.warm.jupiter', { name: first(p) }),
        sub: tr('compat.warm.jupiterSub', { name: first(p) }),
        state: i.date.getTime() - now.getTime() < 365 * DAY_MS ? 'soon' : 'later',
        start: i.date.toISOString(), end: null, source: 'move',
      });
    }
  }
  return items.sort((x, y) => x.start.localeCompare(y.start)).slice(0, 6);
}

/**
 * The compatibility report for `a` (the person whose Reports tab it is) and
 * `b`, or null when it can't be written (missing birth date, same person,
 * partner mode with an under-18).
 */
export function buildCompatReport(a: Person, b: Person, mode: CompatMode, now: Date = new Date()): ReportPayload | null {
  if (!a.birthDate || !b.birthDate || a.id === b.id) return null;
  if (mode === 'partner' && !partnerAllowed(a, b, now)) return null;
  const fa = getChartFacts(a, now), fb = getChartFacts(b, now);
  const ea = elementOf(fa.moonSign), eb = elementOf(fb.moonSign);
  const A = first(a), B = first(b);
  const chip = (k: string) => tr(`compat.chips.${mode}.${k}`);
  const elLine = tr(`compat.line.${pairKey(ea, eb)}`);
  const chapters: Chapter[] = [];
  let line: string;
  let score: CompatExtras['score'];

  const why = (parts = '') => [
    tr('compat.whyChart'),
    tr('compat.whyMoon', { name: A, sign: sg(fa.moonSign), element: tr(`why.element.${ea}`) }),
    tr('compat.whyMoon', { name: B, sign: sg(fb.moonSign), element: tr(`why.element.${eb}`) }),
    parts ? tr('compat.whyParts', { list: parts }) : '',
  ].filter(Boolean).join(' ');

  if (mode === 'partner') {
    const [bride, groom] = orientPair(a, b);
    const m = matchCharts(bride, groom, now)!;
    const byKey = Object.fromEntries(m.kootas.map((k) => [k.key, k]));
    const kootas: KootaRow[] = KOOTA_DISPLAY.map((key) => ({
      key,
      name: tr(`compat.koota.${key}.name`),
      trad: tr(`compat.koota.${key}.trad`),
      score: byKey[key].score,
      max: byKey[key].max,
    }));
    const verdict = verdictFor(m.total);
    const one = m.manglik.status === 'one' ? (m.manglik.bride.isManglik ? bride : groom) : null;
    score = {
      total: m.total,
      band: tr(`compat.band.${verdict}`),
      verdict,
      kootas,
      mars: tr(`compat.mars.${m.manglik.status}`, { name: one ? first(one) : '' }),
    };
    const tail = tr(`compat.line.partnerTail.${m.total >= 25 ? 'high' : m.total >= 18 ? 'mid' : 'low'}`);
    line = `${elLine} ${tail}`;
    const good = kootas.filter((k) => k.score === k.max).map((k) => tr(`compat.good.${k.key}`)).slice(0, 4);
    const weak = kootas.filter((k) => k.score <= k.max / 2).map((k) => tr(`compat.weak.${k.key}`)).slice(0, 4);
    const kootaWhy = kootas.map((k) => `${k.trad} ${k.score}/${k.max}`).join(', ');
    chapters.push(
      { type: 'text', id: 'ch-connect', chip: chip('connect'), title: chip('connect'),
        body: [ea === eb
          ? tr('compat.connectSame', { e: tr(`compat.element.${ea}`), line: elLine })
          : tr('compat.connectBody', { a: A, b: B, ea: tr(`compat.element.${ea}`), eb: tr(`compat.element.${eb}`), line: elLine }),
          good.length ? tr('compat.connectItemsIntro') : ''].filter(Boolean).join(' '),
        items: good, tone: 'plain', why: why(kootaWhy) },
      { type: 'text', id: 'ch-differ', chip: chip('differ'), title: chip('differ'),
        body: weak.length ? tr('compat.differIntro') : tr('compat.differNone'),
        items: weak, tone: 'watch', why: why(kootaWhy) },
      { type: 'text', id: 'ch-home', chip: chip('home'), title: chip('home'),
        body: ea === eb
          ? tr('compat.homeSame', { h: tr(`compat.homeWant.${ea}`) })
          : tr('compat.homeBody', { a: A, b: B, ha: tr(`compat.homeWant.${ea}`), hb: tr(`compat.homeWant.${eb}`) }),
        items: [], tone: 'plain', why: why() },
    );
  } else {
    const c = computeCompatibility(a as Profile, b as Profile);
    const [gana, nadi, bhakoot] = c ? c.dimensions.map((d) => d.score) : [6, 8, 7];
    const weakDim = gana < 5 ? 'gana' : bhakoot === 0 ? 'bhakoot' : nadi === 0 ? 'nadi' : 'none';
    const good = [gana >= 5 ? 'gana' : '', bhakoot === 7 ? 'bhakoot' : '', nadi === 8 ? 'nadi' : '']
      .filter(Boolean).map((k) => tr(`compat.good.${k}`));
    const tail = tr(`compat.line.${mode}Tail`);
    line = `${elLine} ${tail}`;
    const dimWhy = ([['gana', gana, 6], ['bhakoot', bhakoot, 7], ['nadi', nadi, 8]] as const)
      .map(([k, sc, mx]) => `${tr(`compat.koota.${k}.trad`)} ${sc}/${mx}`).join(', ');
    chapters.push(
      { type: 'text', id: 'ch-connect', chip: chip('connect'), title: chip('connect'),
        body: [ea === eb
          ? tr(`compat.${mode}.connectSame`, { e: tr(`compat.element.${ea}`), line: elLine })
          : tr(`compat.${mode}.connect`, { a: A, b: B, ea: tr(`compat.element.${ea}`), eb: tr(`compat.element.${eb}`), line: elLine }),
          good.length ? tr('compat.connectItemsIntro') : ''].filter(Boolean).join(' '),
        items: good, tone: 'plain', why: why(dimWhy) },
      { type: 'text', id: 'ch-differ', chip: chip('differ'), title: chip('differ'),
        body: tr(`compat.${mode === 'friend' ? 'friend.clash' : 'family.hard'}.${weakDim}`),
        items: [], tone: 'plain', why: why(dimWhy) },
    );
    score = undefined;
  }

  const times = goodTimes(a, b, mode, now);
  chapters.push({
    type: 'timing', id: 'ch-timing', chip: chip('timing'), title: chip('timing'),
    body: times.length ? tr('compat.timingBody') : tr('compat.timingNone'),
    items: times,
    why: `${tr('why.timing')} ${tr(`compat.whyTiming.${mode}`)}`,
  });
  const helps = i18n.t(`reports:e.compat.helps.${mode}`, { returnObjects: true }) as { t: string; s: string }[];
  chapters.push({ type: 'helps', id: 'ch-helps', chip: chip('helps'), title: chip('helps'), items: Array.isArray(helps) ? helps : [], note: '' });

  return {
    version: REPORT_VERSION,
    lang: lang(),
    kind: 'compat',
    profileId: a.id,
    chartHash: `${chartHash(a)}~${chartHash(b)}`,
    generatedAt: now.toISOString(),
    title: i18n.t('reports:kind.compat.title') as string,
    summary: {
      eyebrow: i18n.t(`reports:pair.eyebrow.${mode}`, { a: A, b: B }) as string,
      line,
      glance: [],
      focus: null,
    },
    topNote: null,
    chapters,
    disclaimer: [tr('footer.compatBase', { a: A, b: B, date: dmy(now) }), tr('footer.compat')].join(' '),
    approximate: fa.basis === 'moon' || fb.basis === 'moon',
    minutes: minutesToRead(chapters, [line]),
    compat: { mode, a: { id: a.id, name: A }, b: { id: b.id, name: B }, ...(score ? { score } : {}) },
  };
}
