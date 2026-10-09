/**
 * Birth time zones: which IANA zone a birth place is in, and what a civil
 * clock time there means in UT (with historical offsets — India's +06:30
 * war time 1942–45, pre-1947 Calcutta/Bombay time, US/UK daylight saving…).
 *
 * Offsets come from the platform's ICU tz database through
 * Intl.DateTimeFormat({ timeZone }) — Hermes on iOS/Android and Node both
 * carry it. Pure TypeScript: no React Native imports, safe under Node.
 */

import { COUNTRY_CODES, ZONES_BY_COUNTRY, type ZoneRef } from '@/constants/timezones';
import { PLACE_COUNTRIES } from '@/constants/place-countries';

// ─── UTC offsets via Intl ─────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  if (formatters.has(zone)) return formatters.get(zone)!;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12:   false,
      year:     'numeric',
      month:    'numeric',
      day:      'numeric',
      hour:     'numeric',
      minute:   'numeric',
      second:   'numeric',
    });
    // Unknown zones throw on construction in spec-compliant engines; make
    // sure this one really resolved to the requested zone.
    f.format(0);
  } catch {
    f = null;
  }
  formatters.set(zone, f);
  return f;
}

/** Wall-clock fields of `ms` (UTC epoch ms) in `zone`, or null if Intl can't tell. */
function wallClock(zone: string, ms: number): [number, number, number, number, number, number] | null {
  const f = formatterFor(zone);
  if (!f) return null;
  try {
    let y: number, mo: number, d: number, h: number, mi: number, s: number;
    if (typeof f.formatToParts === 'function') {
      const parts: Record<string, string> = {};
      for (const p of f.formatToParts(new Date(ms))) parts[p.type] = p.value;
      [y, mo, d, h, mi, s] = [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second].map(Number);
    } else {
      // "5/15/1990, 08:30:00"
      const m = f.format(new Date(ms)).match(/(\d+)\/(\d+)\/(-?\d+),?\s+(\d+):(\d+):(\d+)/);
      if (!m) return null;
      [mo, d, y, h, mi, s] = m.slice(1).map(Number);
    }
    if ([y, mo, d, h, mi, s].some((n) => !Number.isFinite(n))) return null;
    return [y, mo, d, h % 24, mi, s];
  } catch {
    return null;
  }
}

/** UTC offset of `zone` at the instant `ms`, in minutes (may be fractional for LMT-era offsets). */
export function zoneOffsetMinutes(zone: string, ms: number): number | null {
  const w = wallClock(zone, ms);
  if (!w) return null;
  const asUtc = Date.UTC(w[0], w[1] - 1, w[2], w[3], w[4], w[5]);
  // Date.UTC maps years 0–99 to 1900–1999; irrelevant for birth dates.
  return (asUtc - Math.floor(ms / 1000) * 1000) / 60000;
}

/** Standard (non-DST) offset from the bundled table, for engines without the zone. */
function tableOffsetMinutes(zone: string): number | null {
  for (const refs of Object.values(ZONES_BY_COUNTRY)) {
    for (const r of refs) if (r[0] === zone) return r[3];
  }
  return null;
}

/**
 * UTC epoch ms of a civil (wall-clock) time in `zone`. Handles DST: in the
 * spring-forward gap the later offset is used, in the fall-back overlap the
 * earlier (first) occurrence. Returns null when the zone is unknown.
 */
export function civilToUtcMs(
  zone: string,
  y: number, mo: number, d: number, h: number, mi: number,
): number | null {
  const local = Date.UTC(y, mo - 1, d, h, mi);
  if (!Number.isFinite(local)) return null;
  const o1 = zoneOffsetMinutes(zone, local);
  if (o1 == null) {
    const std = tableOffsetMinutes(zone);
    return std == null ? null : local - std * 60000;
  }
  let utc = local - o1 * 60000;
  const o2 = zoneOffsetMinutes(zone, utc);
  if (o2 != null && o2 !== o1) {
    const alt = local - o2 * 60000;
    const o3 = zoneOffsetMinutes(zone, alt);
    // Use the candidate that maps back to the same wall clock; otherwise the
    // time falls in a DST gap — take the larger UTC instant (after the jump).
    if (o3 === o2) utc = alt;
    else utc = Math.max(utc, alt);
  }
  return utc;
}

// ─── Birth place → IANA zone ─────────────────────────────────────────────────

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US', 'u.s.a.': 'US', us: 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', 'u.k.': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'great britain': 'GB', britain: 'GB',
  'northern ireland': 'GB',
  uae: 'AE', 'u.a.e.': 'AE', bharat: 'IN', russia: 'RU', 'south korea': 'KR', korea: 'KR',
  'north korea': 'KP', vietnam: 'VN', iran: 'IR', syria: 'SY', 'czech republic': 'CZ', czechia: 'CZ',
  holland: 'NL', burma: 'MM', 'ivory coast': 'CI', laos: 'LA', bolivia: 'BO', venezuela: 'VE',
  tanzania: 'TZ', moldova: 'MD', taiwan: 'TW', 'hong kong': 'HK', macau: 'MO', brunei: 'BN',
};

/** Country names as the bundled place data spells them (what new profiles store). */
let placeCodes: Map<string, string> | null = null;

/** ISO country code for a free-text country name or code ("India", "USA", "IN"). */
export function countryCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  placeCodes ??= new Map(PLACE_COUNTRIES.map(([code, n]) => [n.toLowerCase(), code]));
  if (placeCodes.has(key)) return placeCodes.get(key)!;
  // Spellings stored by earlier builds (the old picker data) are kept here.
  if (COUNTRY_CODES[key]) return COUNTRY_CODES[key];
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  const upper = key.toUpperCase();
  if (upper.length === 2 && ZONES_BY_COUNTRY[upper]) return upper;
  return null;
}

type ZoneRule = string | ((lat: number, lng: number) => string);

const NY = 'America/New_York', CHI = 'America/Chicago', DEN = 'America/Denver', LA = 'America/Los_Angeles';

/**
 * Main zone per state/province for the big multi-zone DST countries, where
 * "nearest zone reference city" alone picks badly (e.g. Houston is nearer
 * Denver than Chicago). Split states use a rough longitude/latitude line.
 */
const STATE_ZONES: Record<string, Record<string, ZoneRule>> = {
  US: {
    alabama: CHI, alaska: (_la, lo) => (lo < -169.5 ? 'America/Adak' : 'America/Anchorage'), arizona: 'America/Phoenix',
    arkansas: CHI, california: LA, colorado: DEN, connecticut: NY, delaware: NY, 'district of columbia': NY,
    florida: (_la, lo) => (lo < -85.0 ? CHI : NY), georgia: NY, hawaii: 'Pacific/Honolulu',
    idaho: (la) => (la > 45.6 ? LA : 'America/Boise'), illinois: CHI, indiana: 'America/Indiana/Indianapolis',
    iowa: CHI, kansas: (_la, lo) => (lo < -101.5 ? DEN : CHI),
    kentucky: (_la, lo) => (lo < -86.0 ? CHI : 'America/Kentucky/Louisville'), louisiana: CHI, maine: NY,
    maryland: NY, massachusetts: NY, michigan: 'America/Detroit', minnesota: CHI, mississippi: CHI,
    missouri: CHI, montana: DEN, nebraska: (_la, lo) => (lo < -101.3 ? DEN : CHI), nevada: LA,
    'new hampshire': NY, 'new jersey': NY, 'new mexico': DEN, 'new york': NY, 'north carolina': NY,
    'north dakota': (_la, lo) => (lo < -101.5 ? DEN : CHI), ohio: NY, oklahoma: CHI, oregon: LA,
    pennsylvania: NY, 'rhode island': NY, 'south carolina': NY,
    'south dakota': (_la, lo) => (lo < -100.3 ? DEN : CHI),
    tennessee: (_la, lo) => (lo > -85.4 ? NY : CHI), texas: (_la, lo) => (lo < -104.9 ? DEN : CHI),
    utah: DEN, vermont: NY, virginia: NY, washington: LA, 'west virginia': NY, wisconsin: CHI, wyoming: DEN,
    'puerto rico': 'America/Puerto_Rico',
  },
  CA: {
    'british columbia': (_la, lo) => (lo > -120.0 && _la < 50.5 ? 'America/Edmonton' : 'America/Vancouver'),
    alberta: 'America/Edmonton', saskatchewan: 'America/Regina', manitoba: 'America/Winnipeg',
    ontario: (_la, lo) => (lo < -90.0 ? 'America/Winnipeg' : 'America/Toronto'), quebec: 'America/Toronto',
    'new brunswick': 'America/Moncton', 'nova scotia': 'America/Halifax',
    'prince edward island': 'America/Halifax', 'newfoundland and labrador': 'America/St_Johns',
    yukon: 'America/Whitehorse', 'northwest territories': 'America/Edmonton', nunavut: 'America/Iqaluit',
  },
  AU: {
    'new south wales': (_la, lo) => (lo < 141.5 ? 'Australia/Broken_Hill' : 'Australia/Sydney'),
    'australian capital territory': 'Australia/Sydney', victoria: 'Australia/Melbourne',
    queensland: 'Australia/Brisbane', 'south australia': 'Australia/Adelaide',
    'western australia': 'Australia/Perth', tasmania: 'Australia/Hobart', 'northern territory': 'Australia/Darwin',
  },
};

function nearestZone(refs: ZoneRef[], lat: number, lng: number): string {
  let best = refs[0][0];
  let bestD = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const [zone, zLat, zLng] of refs) {
    let dLng = Math.abs(lng - zLng);
    if (dLng > 180) dLng = 360 - dLng;
    const d = (lat - zLat) ** 2 + (dLng * cosLat) ** 2;
    if (d < bestD) { bestD = d; best = zone; }
  }
  return best;
}

export type BirthPlace = {
  /** Display string as stored on the profile: "City, State, Country". */
  place?:       string | null;
  countryCode?: string | null;
  lat?:         number | null;
  lng?:         number | null;
};

/**
 * Best-guess IANA zone for a birth place. Needs the country (explicit code,
 * or the last comma-separated part of `place`); within multi-zone countries
 * uses the state (US/Canada/Australia) or the nearest zone reference city to
 * the coordinates. Returns null when the country can't be identified — the
 * chart then falls back to local mean time from the longitude.
 */
export function guessTimeZone(p: BirthPlace): string | null {
  const parts = (p.place ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const iso = (p.countryCode && ZONES_BY_COUNTRY[p.countryCode.toUpperCase()] ? p.countryCode.toUpperCase() : null)
    ?? countryCodeFromName(parts[parts.length - 1])
    ?? null;
  if (!iso) return null;
  const refs = ZONES_BY_COUNTRY[iso];
  if (!refs?.length) return null;
  if (refs.length === 1) return refs[0][0];

  const lat = p.lat != null && Number.isFinite(p.lat) ? p.lat : null;
  const lng = p.lng != null && Number.isFinite(p.lng) ? p.lng : null;

  const states = STATE_ZONES[iso];
  if (states && parts.length >= 2) {
    // "City, State, Country" — the state is the second-to-last part.
    const rule = states[parts[parts.length - 2].toLowerCase()];
    if (rule) return typeof rule === 'string' ? rule : rule(lat ?? 0, lng ?? 0);
  }
  if (lat == null || lng == null) return null;
  return nearestZone(refs, lat, lng);
}

/** True when the engine can resolve this IANA zone name. */
export function isKnownZone(zone: string | null | undefined): zone is string {
  return !!zone && (formatterFor(zone) != null || tableOffsetMinutes(zone) != null);
}
