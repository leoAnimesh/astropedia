/**
 * Bundled birth places: country -> states -> cities with coordinates and the
 * IANA time zone (GeoNames, CC BY 4.0; built by scripts/build-places.mjs into
 * assets/places/<code>.json). A country's file is parsed the first time it is
 * needed and kept for the session.
 *
 * Stored places stay "City, State, Country" in English (utils/place-names.ts
 * localises them for display; utils/timezone.ts reads them).
 *
 * Pure TypeScript: the per-country files come through a loader (Metro
 * require() in the app, configurePlaceLoader() under Node).
 */
import { PLACE_COUNTRIES } from '@/constants/place-countries';

type Row = [name: string, lat: number, lng: number, tz?: number, aka?: string, district?: string];
type CountryFile = { s: string[]; z: string[]; c: Row[][] };

export type PlaceCountry = { code: string; name: string; flag: string };
export type PlaceCity = {
  name: string;
  lat: number;
  lng: number;
  /** IANA zone from the data. */
  tz: string;
  /** Other spellings (search only). */
  aka: string[];
  /** District, given only when the name repeats within the state. */
  district?: string;
};

// ─── Loading ──────────────────────────────────────────────────────────────────

/** The app: Metro bundles every country file (constants/place-loaders.ts); none is parsed until used. */
function metroLoader(code: string): unknown {
  const { PLACE_LOADERS } = require('@/constants/place-loaders') as typeof import('@/constants/place-loaders');
  return PLACE_LOADERS[code]?.();
}

let loader: (code: string) => unknown = metroLoader;
const files = new Map<string, CountryFile | null>();

/** Where per-country files come from (the app sets the Metro loader; tests read the JSON). */
export function configurePlaceLoader(fn: (code: string) => unknown): void {
  loader = fn;
  files.clear();
}

function load(code: string): CountryFile | null {
  const cc = code.toUpperCase();
  if (files.has(cc)) return files.get(cc)!;
  let file: CountryFile | null = null;
  try {
    const raw = loader(cc) as CountryFile | undefined;
    if (raw && Array.isArray(raw.s) && Array.isArray(raw.z) && Array.isArray(raw.c)) file = raw;
  } catch {
    file = null;
  }
  files.set(cc, file);
  return file;
}

// ─── Countries ────────────────────────────────────────────────────────────────

/** Flag emoji from an ISO code (regional indicator letters). */
export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

let countryList: PlaceCountry[] | null = null;
export function placeCountries(): PlaceCountry[] {
  countryList ??= PLACE_COUNTRIES.map(([code, name]) => ({ code, name, flag: flagEmoji(code) }));
  return countryList;
}

const nameByCode = new Map(PLACE_COUNTRIES.map(([c, n]) => [c, n]));
const codeByName = new Map(PLACE_COUNTRIES.map(([c, n]) => [n.toLowerCase(), c]));

/** English name new profiles store for a country code. */
export function placeCountryName(code: string): string | null {
  return nameByCode.get(code.toUpperCase()) ?? null;
}

/** ISO code for a country name as this data spells it (other spellings: utils/timezone.ts). */
export function placeCountryCode(name: string): string | null {
  return codeByName.get(name.trim().toLowerCase()) ?? null;
}

// ─── States and cities ────────────────────────────────────────────────────────

/** State / province names of a country, sorted; [] when the country has none. */
export function placeStates(code: string): string[] {
  return load(code)?.s ?? [];
}

function toCity(r: Row, zones: string[]): PlaceCity {
  return {
    name: r[0],
    lat: r[1],
    lng: r[2],
    tz: zones[r[3] ?? 0] ?? zones[0],
    aka: r[4] ? r[4].split('|') : [],
    ...(r[5] ? { district: r[5] } : {}),
  };
}

/**
 * Cities of a state (by name), or of the whole country when it has no states
 * or `state` is null. Sorted by name.
 */
export function placeCities(code: string, state: string | null): PlaceCity[] {
  const f = load(code);
  if (!f) return [];
  if (!f.s.length || state == null) return f.c.flat().map((r) => toCity(r, f.z));
  const i = f.s.indexOf(state);
  return i < 0 ? [] : f.c[i].map((r) => toCity(r, f.z));
}

// ─── Search helpers (shared with the picker) ─────────────────────────────────

/** Lower case, no accents, NFC — for plain substring search. */
export function foldForSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();
}

/**
 * Rough phonetic key so spelling variants meet: Bangalore / Bengaluru,
 * Calcutta / Kolkata, Darjeeling / Darjiling, Nabadwip / Navadwip. Latin
 * letters only (other scripts give ''). Must match scripts/build-places.mjs.
 */
export function skeleton(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z]/g, '').replace(/ph/g, 'f').replace(/[cq]/g, 'k').replace(/v/g, 'b').replace(/z/g, 'j')
    .replace(/(.)\1+/g, '$1').replace(/[aeiouyhw]/g, '').replace(/(.)\1+/g, '$1');
}

/** What a search row is matched on: folded names (one per line) and their phonetic keys. */
export type SearchKeys = { haystack: string; skel: string };

/** Search keys for a row shown as `shown`, also findable by `others` (English name, other spellings). */
export function searchKeys(shown: string, others: readonly string[] = []): SearchKeys {
  const names = [shown, ...others.filter((o) => o && o !== shown)];
  return { haystack: names.map(foldForSearch).join('\n'), skel: names.map(skeleton).join('\n') };
}

/**
 * Picker search: plain substring matches first, in list order; then rows
 * whose name sounds the same (typed "Bangalore", "Calcutta", "Darjeeling"
 * find Bengaluru, Kolkata, Darjiling) once the query is long enough for that
 * to mean something. A two-letter key ("Katwa" -> kt) only matches a whole name.
 */
export function filterBySearch<T>(rows: readonly T[], query: string, keys: (row: T) => SearchKeys): T[] {
  const raw = query.trim();
  if (!raw) return [...rows];
  const q = foldForSearch(raw);
  const direct = rows.filter((r) => keys(r).haystack.includes(q));
  const qs = raw.length >= 4 ? skeleton(raw) : '';
  if (qs.length < 2) return direct;
  const hit = qs.length >= 3
    ? (r: T) => keys(r).skel.includes(qs)
    : (r: T) => `\n${keys(r).skel}\n`.includes(`\n${qs}\n`);
  const seen = new Set(direct);
  return direct.concat(rows.filter((r) => !seen.has(r) && hit(r)));
}

// ─── Local look-up of a stored place (no network) ────────────────────────────

export type PlaceMatch = { lat: number; lng: number; tz: string; name: string; state: string | null };

/**
 * Coordinates for a stored place string "City, State, Country" (or "City,
 * Country") from the bundled data. Used when a profile has a place but no
 * coordinates (a typed-in city). Exact name first, then another spelling of
 * it; within the given state first, then the whole country. Null when the
 * country isn't known or nothing matches — never a guess from another
 * country.
 */
export function findPlace(place: string, countryCodeOf: (name: string) => string | null): PlaceMatch | null {
  const parts = place.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const code = countryCodeOf(parts[parts.length - 1]);
  if (!code) return null;
  const f = load(code);
  if (!f) return null;
  const city = parts[0];
  const stateName = parts.length >= 3 ? parts[parts.length - 2] : null;
  const folded = foldForSearch(city);
  const skel = skeleton(city);

  const stateIdx = stateName ? f.s.findIndex((s) => foldForSearch(s) === foldForSearch(stateName)) : -1;
  const scopes: number[] = stateIdx >= 0 ? [stateIdx] : [];
  for (let i = 0; i < f.c.length; i++) if (i !== stateIdx) scopes.push(i);

  const tests: ((r: Row) => boolean)[] = [
    (r) => foldForSearch(r[0]) === folded,
    (r) => !!r[4] && r[4].split('|').some((a) => foldForSearch(a) === folded),
    (r) => skel.length >= 3 && (skeleton(r[0]) === skel || (!!r[4] && r[4].split('|').some((a) => skeleton(a) === skel))),
  ];
  for (const test of tests) {
    for (const i of scopes) {
      const r = f.c[i].find(test);
      if (r) {
        const c = toCity(r, f.z);
        return { lat: c.lat, lng: c.lng, tz: c.tz, name: c.name, state: f.s[i] ?? null };
      }
    }
  }
  return null;
}
