/**
 * Hand-picked edge-case profiles for the Saga answer audit (ml/data/eval_saga.py),
 * built with the same chart code and record shape as gen_profiles.ts.
 *
 *   npx tsx --tsconfig ml/data/tsconfig.json ml/data/gen_eval_profiles.ts <spec.json> <out.jsonl> <today YYYY-MM-DD> [--context-version 1|2] [--id-suffix _2706]
 *
 * --id-suffix is appended to every id, so the same spec can be dated twice into one file (eval_dates).
 *
 * spec.json: [{ id, name, gender, birthDate, birthTime|null, birthCity|null, birthLat|null, birthLng|null,
 *               isYou?, relationship?, note? }, ...]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { getAstrologyContext, getCurrentMahadasha, getFullKundli, getTimingContext, LATEST_CONTEXT_VERSION, type ContextVersion } from '@/utils/astrology';
import { guessTimeZone } from '@/utils/timezone';

const argv = process.argv.slice(2);
const cvAt = argv.indexOf('--context-version');
const contextVersion = (cvAt >= 0 ? Number(argv.splice(cvAt, 2)[1]) : LATEST_CONTEXT_VERSION) as ContextVersion;
const sfAt = argv.indexOf('--id-suffix');
const idSuffix = sfAt >= 0 ? argv.splice(sfAt, 2)[1] : '';
const [specPath, outPath, todayArg] = argv;
if (!/^\d{4}-\d{2}-\d{2}$/.test(todayArg ?? '')) throw new Error('usage: gen_eval_profiles.ts <spec.json> <out.jsonl> <today YYYY-MM-DD>');
const now = new Date(`${todayArg}T12:00:00`);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

type Spec = {
  id: string; name: string; gender: string | null; birthDate: string; birthTime: string | null;
  birthCity: string | null; birthLat: number | null; birthLng: number | null;
  isYou?: boolean; relationship?: string | null; note?: string;
};

const specs: Spec[] = JSON.parse(readFileSync(specPath, 'utf8'));
const lines = specs.map((s) => {
  const birthTz = s.birthCity ? guessTimeZone({ place: s.birthCity, lat: s.birthLat, lng: s.birthLng }) : null;
  const p = { ...s, id: `${s.id}${idSuffix}`, birthTz, isYou: s.isYou ?? true, relationship: s.relationship ?? null };
  const k = getFullKundli({ birthDate: p.birthDate, birthTime: p.birthTime ?? undefined, birthLat: p.birthLat, birthLng: p.birthLng, birthTz });
  const { sun, moon, rising } = k.bigThree;
  // getFullKundli dates the mahadasha by the wall clock; use `today` like the context does.
  const dasha = getCurrentMahadasha(k.moonLon, p.birthDate, now);
  return JSON.stringify({
    ...p,
    context: getAstrologyContext(p, { version: contextVersion, date: now }),
    contextVersion,
    today: todayArg,
    timing: getTimingContext(p, now, contextVersion),
    reading: {
      firstName: p.name.split(' ')[0], sun: sun?.name ?? null, moon: moon?.name ?? null, rising: rising?.name ?? null,
      nakshatra: k.nakshatra.name, nakshatraLord: k.nakshatra.lord, dashaLord: dasha.lord, dashaEnd: dasha.endDate,
    },
    corpusIds: [sun && `sign-${slug(sun.name)}`, moon && `sign-${slug(moon.name)}`,
      `nakshatra-${slug(k.nakshatra.name)}`, `dasha-${slug(dasha.lord)}`].filter(Boolean),
  });
});
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} eval profiles (context v${contextVersion}) to ${outPath}`);
