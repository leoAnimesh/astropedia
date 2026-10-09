#!/usr/bin/env node
// Builds the bundled birth-place data (country -> states -> cities with
// coordinates and time zone) from the GeoNames dumps.
//
// Data: GeoNames (https://www.geonames.org), licensed CC BY 4.0. The output
// keeps that licence; the attribution lives in assets/legal/licenses.json
// (scripts/generate-licenses.mjs) and the About screen.
//
// Usage:
//   mkdir -p /tmp/geonames && cd /tmp/geonames
//   curl -LO https://download.geonames.org/export/dump/cities1000.zip && unzip cities1000.zip
//   curl -LO https://download.geonames.org/export/dump/admin1CodesASCII.txt
//   curl -LO https://download.geonames.org/export/dump/admin2Codes.txt
//   curl -LO https://download.geonames.org/export/dump/countryInfo.txt
//   # English other names (Bombay, Calcutta, Madras…), filtered while streaming
//   # (the full alternateNamesV2 file is ~200 MB zipped):
//   cut -f1 cities1000.txt > ids.txt
//   curl -sL https://download.geonames.org/export/dump/alternateNamesV2.zip | bsdtar -xOf - alternateNamesV2.txt \
//     | awk -F'\t' 'NR==FNR{ids[$1]=1;next} $3=="en" && ($2 in ids)' ids.txt - > alternateNames-en.txt
//   node scripts/build-places.mjs /tmp/geonames
//
// Writes:
//   assets/places/<CC>.json      one file per country, loaded lazily (utils/places.ts)
//   constants/place-countries.ts country list (code, English name)
//   constants/place-loaders.ts   the require() map for the country files
//
// Per-country file: { s: string[], z: string[], c: Row[][] }
//   s  state (admin1) names, sorted; [] when the country has no usable states
//   z  IANA zones used in this country; index 0 is the most common
//   c  cities per state (parallel to s; one list when s is empty), sorted by name
//   Row = [name, lat, lng, tz?, aka?, district?]
//     lat/lng  degrees, 3 decimals (~100 m)
//     tz       index into z; omitted when 0
//     aka      other spellings, '|'-separated, for search only (e.g. Bangalore)
//     district admin2 name, only when the name repeats within the state
//   Trailing optional fields are dropped; inner gaps are 0 / ''.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'cities1000.txt'))) {
  console.error('usage: node scripts/build-places.mjs <dir with cities1000.txt, admin1CodesASCII.txt, admin2Codes.txt, countryInfo.txt>');
  process.exit(1);
}

const lines = (f) => fs.readFileSync(path.join(src, f), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));

// Commas separate the parts of a stored place ("City, State, Country"), so a
// name must never contain one.
const COUNTRY_NAME_FIX = {
  BQ: 'Caribbean Netherlands',
};
const clean = (s) => s.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();

// Feature codes that are not places anyone is born in today.
// GeoNames spells South Asian places with transliteration marks (Bānkura);
// people write them without, so use the plain ASCII form there.
const ASCII_COUNTRIES = new Set(['IN', 'BD', 'PK', 'NP', 'LK', 'BT', 'MV']);
const SKIP_FEATURES = new Set(['PPLQ', 'PPLW', 'PPLX', 'PPLH', 'PPLCH']);
const MAX_ALIASES = 4;

// ─── Countries ────────────────────────────────────────────────────────────────

const countries = new Map(); // code -> name
for (const l of lines('countryInfo.txt')) {
  const f = l.split('\t');
  countries.set(f[0], COUNTRY_NAME_FIX[f[0]] ?? clean(f[4]));
}

const admin1 = new Map(); // 'IN.28' -> name
for (const l of lines('admin1CodesASCII.txt')) {
  const f = l.split('\t');
  admin1.set(f[0], clean(f[1]));
}
const admin2 = new Map(); // 'IN.28.123' -> name
for (const l of lines('admin2Codes.txt')) {
  const f = l.split('\t');
  admin2.set(f[0], clean(f[1]));
}

// ─── Cities ───────────────────────────────────────────────────────────────────

/**
 * Rough phonetic key: spelling variants of one name share it (Bangalore /
 * Bengaluru, Calcutta / Kolkata). Must match skeleton() in utils/places.ts.
 */
const skeleton = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z]/g, '').replace(/ph/g, 'f').replace(/[cq]/g, 'k').replace(/v/g, 'b').replace(/z/g, 'j')
  .replace(/(.)\1+/g, '$1').replace(/[aeiouyhw]/g, '').replace(/(.)\1+/g, '$1');

// English other names per GeoNames id (alternateNames-en.txt, optional).
const englishNames = new Map(); // id -> string[]
const altFile = path.join(src, 'alternateNames-en.txt');
if (fs.existsSync(altFile)) {
  for (const l of fs.readFileSync(altFile, 'utf8').split('\n')) {
    const f = l.split('\t');
    if (f[2] !== 'en' || !f[3]) continue;
    if (!englishNames.has(f[1])) englishNames.set(f[1], []);
    englishNames.get(f[1]).push(f[3]);
  }
} else {
  console.warn('alternateNames-en.txt not found: no other spellings (Bombay, Calcutta…) for search');
}

// Plain names only; codes ("TVM") and abbreviations are noise for search.
const ALIAS_NAME = /^[A-Za-z][A-Za-z .'-]{2,39}$/;

/** Other English names of a place that a search by sound wouldn't find. */
function aliasesFor(id, name, ascii) {
  const seen = new Set([skeleton(name), skeleton(ascii)]);
  const out = [];
  for (const raw of englishNames.get(id) ?? []) {
    const a = clean(raw);
    if (!ALIAS_NAME.test(a) || a === a.toUpperCase()) continue;
    const k = skeleton(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
    if (out.length >= MAX_ALIASES) break;
  }
  return out.join('|');
}

const byCountry = new Map(); // code -> city[]
for (const l of fs.readFileSync(path.join(src, 'cities1000.txt'), 'utf8').split('\n')) {
  if (!l) continue;
  const f = l.split('\t');
  const [id, name, ascii, , lat, lng, , feature, cc, , a1, a2, , , pop, , , tz] = f;
  if (SKIP_FEATURES.has(feature) || !countries.has(cc)) continue;
  const city = {
    name: clean(ASCII_COUNTRIES.has(cc) && ascii ? ascii : name),
    lat: Math.round(Number(lat) * 1000) / 1000,
    lng: Math.round(Number(lng) * 1000) / 1000,
    tz,
    state: admin1.get(`${cc}.${a1}`) ?? null,
    district: admin2.get(`${cc}.${a1}.${a2}`) ?? '',
    pop: Number(pop) || 0,
    aka: aliasesFor(id, name, ascii),
  };
  if (!city.name || !Number.isFinite(city.lat) || !Number.isFinite(city.lng)) continue;
  if (!byCountry.has(cc)) byCountry.set(cc, []);
  byCountry.get(cc).push(city);
}

// ─── Write ────────────────────────────────────────────────────────────────────

const outDir = path.join(root, 'assets/places');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const collator = new Intl.Collator('en', { sensitivity: 'base' });
const list = [];
let total = 0;
let bytes = 0;
let cityCount = 0;

for (const [cc, cities] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
  // Zones, most common first.
  const tzCount = new Map();
  for (const c of cities) tzCount.set(c.tz, (tzCount.get(c.tz) ?? 0) + 1);
  const zones = [...tzCount].sort((a, b) => b[1] - a[1]).map(([z]) => z);
  const tzIdx = new Map(zones.map((z, i) => [z, i]));

  // States: only those with cities. Cities whose admin1 code is unknown go to
  // the nearest state that has the same zone… simpler and just as useful for
  // a birth chart: the state of the nearest city with a known state.
  const known = cities.filter((c) => c.state);
  const useStates = new Set(known.map((c) => c.state)).size >= 2;
  if (useStates) {
    for (const c of cities) {
      if (c.state) continue;
      let best = null; let bestD = Infinity;
      for (const k of known) {
        const d = (k.lat - c.lat) ** 2 + (k.lng - c.lng) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      c.state = best.state;
    }
  }
  const states = useStates ? [...new Set(cities.map((c) => c.state))].sort(collator.compare) : [];
  const groups = useStates ? states.map((s) => cities.filter((c) => c.state === s)) : [cities];

  const c = groups.map((g) => {
    g.sort((a, b) => collator.compare(a.name, b.name) || b.pop - a.pop);
    const counts = new Map();
    for (const x of g) counts.set(x.name, (counts.get(x.name) ?? 0) + 1);
    return g.map((x) => {
      const dup = counts.get(x.name) > 1;
      const row = [x.name, x.lat, x.lng, tzIdx.get(x.tz), x.aka, dup ? x.district : ''];
      while (row.length > 3 && (row[row.length - 1] === '' || row[row.length - 1] === 0)) row.pop();
      return row;
    });
  });

  const json = JSON.stringify({ s: states, z: zones, c });
  fs.writeFileSync(path.join(outDir, `${cc}.json`), json);
  bytes += json.length;
  total += 1;
  cityCount += cities.length;
  list.push([cc, countries.get(cc)]);
}

list.sort((a, b) => collator.compare(a[1], b[1]));

const countriesTs = `/**
 * Birth-place countries (generated by scripts/build-places.mjs — do not edit).
 * Data: GeoNames (geonames.org), CC BY 4.0.
 *
 * PLACE_COUNTRIES: [ISO code, English name] for every country with places,
 * sorted by name. The names are what new profiles store.
 */

export const PLACE_COUNTRIES: readonly (readonly [code: string, name: string])[] = [
${list.map(([cc, n]) => `  [${JSON.stringify(cc)}, ${JSON.stringify(n)}],`).join('\n')}
];
`;
fs.writeFileSync(path.join(root, 'constants/place-countries.ts'), countriesTs);

// Static require() per file so Metro bundles them; each is parsed on first use.
const loadersTs = `/**
 * Lazy loaders for assets/places/<code>.json (generated by
 * scripts/build-places.mjs — do not edit). Used by utils/places.ts.
 */

export const PLACE_LOADERS: Record<string, () => unknown> = {
${list.map(([cc]) => `  ${JSON.stringify(cc)}: () => require('../assets/places/${cc}.json'),`).join('\n')}
};
`;
fs.writeFileSync(path.join(root, 'constants/place-loaders.ts'), loadersTs);

console.log(`${total} countries, ${cityCount} places, ${(bytes / 1024 / 1024).toFixed(2)} MB JSON`);
