/**
 * Festival and vrat calendar, computed on device from the panchang.
 *
 * Pure (no React Native / i18n): names and descriptions are i18n keys under
 * `festivals:` (rendered by the screen), so Node tests can check dates.
 *
 * How dates are found
 * - Lunar months are amanta (new moon to new moon), named by the Sun's
 *   sidereal sign at the starting new moon; a month without a sankranti is
 *   adhika (utils/lunar.ts). Rules below use amanta month names. The screen
 *   shows purnimanta names (North Indian default: the Krishna paksha belongs
 *   to the next month); the dates are the same either way.
 * - Each tithi festival is observed on the civil day whose "kaal" (sunrise,
 *   midday, afternoon, evening twilight, midnight or moonrise, depending on
 *   the festival) falls inside the tithi. If the tithi covers that kaal on
 *   two days, the first day is taken; if it covers it on neither (a skipped
 *   tithi), the day the tithi runs on.
 * - Sankranti festivals come from the Sun's sidereal ingress.
 * - Festivals never fall in an adhika month; Ekadashis there get their own
 *   names (Padmini, Parama).
 *
 * These are the common Smarta rules. Regional calendars (Bengali
 * Bisuddha Siddhanta, ISKCON, South Indian amanta, Bangladesh's fixed Poila
 * Boishakh) can differ by a day, so every rule-derived date is flagged
 * `approx` and the screen says so.
 */

import { LUNAR_MONTHS, lunarMonthsBetween, sankrantiAfter, tithiSpan, type LunarMonth } from './lunar';
import { getSunTimes, moonriseAfter, placeOrDefault } from './sun';

export type FestivalKind = 'festival' | 'vrat' | 'ekadashi';
export type FestivalRegion = 'all' | 'north' | 'bengal';
/** When in the day the tithi must be running. */
type Kaal = 'sunrise' | 'midday' | 'afternoon' | 'pradosh' | 'pradoshWindow' | 'midnight' | 'moonrise';

type TithiRule = {
  id:     string;
  kind:   FestivalKind;
  region: FestivalRegion;
  /** Amanta month index (Chaitra = 0), or null for every month. */
  month:  number | null;
  /** 1..30 (Shukla 1–15, Krishna 16–30; 15 = Purnima, 30 = Amavasya). */
  tithi:  number;
  kaal:   Kaal;
  /** Days after the tithi day (Holika Dahan is the evening before Holi). */
  offset?: number;
  /** When the kaal falls inside the tithi on two days: take the first (default) or the second. */
  prefer?: 'first' | 'last';
  /** Major festival: shown in the horoscope month view. */
  major?: boolean;
};

type SankrantiRule = {
  id:     string;
  kind:   FestivalKind;
  region: FestivalRegion;
  sign:   number;
  /** 'sameDay': the ingress day, or the next day if after sunset. 'nextDay': always the next civil day (Bengali month start). */
  rule:   'sameDay' | 'nextDay';
  major?: boolean;
};

// Amanta month indices.
const CHAITRA = 0, SHRAVANA = 4, BHADRAPADA = 5, ASHWIN = 6, KARTIKA = 7, MAGHA = 10, PHALGUNA = 11;

const TITHI_RULES: TithiRule[] = [
  // Every month
  { id: 'ekadashi-shukla',  kind: 'ekadashi', region: 'all', month: null, tithi: 11, kaal: 'sunrise' },
  { id: 'ekadashi-krishna', kind: 'ekadashi', region: 'all', month: null, tithi: 26, kaal: 'sunrise' },
  { id: 'purnima',          kind: 'vrat',     region: 'all', month: null, tithi: 15, kaal: 'sunrise' },
  { id: 'amavasya',         kind: 'vrat',     region: 'all', month: null, tithi: 30, kaal: 'sunrise' },
  { id: 'pradosh-shukla',   kind: 'vrat',     region: 'all', month: null, tithi: 13, kaal: 'pradoshWindow' },
  { id: 'pradosh-krishna',  kind: 'vrat',     region: 'all', month: null, tithi: 28, kaal: 'pradoshWindow' },
  { id: 'sankashti',        kind: 'vrat',     region: 'all', month: null, tithi: 19, kaal: 'moonrise' },
  // Once a year
  { id: 'maha-shivaratri',  kind: 'festival', region: 'all',    month: MAGHA,      tithi: 29, kaal: 'midnight', major: true },
  // Holi (colours) is Chaitra Krishna Pratipada at sunrise; Holika Dahan is the evening before.
  { id: 'holika-dahan',     kind: 'festival', region: 'north',  month: PHALGUNA,   tithi: 16, kaal: 'sunrise', offset: -1 },
  { id: 'holi',             kind: 'festival', region: 'all',    month: PHALGUNA,   tithi: 16, kaal: 'sunrise', major: true },
  { id: 'ram-navami',       kind: 'festival', region: 'all',    month: CHAITRA,    tithi: 9,  kaal: 'midday', major: true },
  { id: 'hanuman-jayanti',  kind: 'festival', region: 'north',  month: CHAITRA,    tithi: 15, kaal: 'sunrise', major: true },
  // Shravana Purnima at sunrise: the afternoon before is usually under Bhadra.
  { id: 'raksha-bandhan',   kind: 'festival', region: 'all',    month: SHRAVANA,   tithi: 15, kaal: 'sunrise', major: true },
  { id: 'janmashtami',      kind: 'festival', region: 'all',    month: SHRAVANA,   tithi: 23, kaal: 'midnight', major: true },
  { id: 'ganesh-chaturthi', kind: 'festival', region: 'all',    month: BHADRAPADA, tithi: 4,  kaal: 'midday', major: true },
  { id: 'mahalaya',         kind: 'festival', region: 'bengal', month: BHADRAPADA, tithi: 30, kaal: 'afternoon' },
  { id: 'navratri',         kind: 'festival', region: 'all',    month: ASHWIN,     tithi: 1,  kaal: 'sunrise', major: true },
  { id: 'durga-saptami',    kind: 'festival', region: 'bengal', month: ASHWIN,     tithi: 7,  kaal: 'sunrise', major: true },
  { id: 'durga-ashtami',    kind: 'vrat',     region: 'bengal', month: ASHWIN,     tithi: 8,  kaal: 'sunrise', major: true },
  { id: 'durga-navami',     kind: 'festival', region: 'bengal', month: ASHWIN,     tithi: 9,  kaal: 'sunrise' },
  { id: 'bijoya-dashami',   kind: 'festival', region: 'bengal', month: ASHWIN,     tithi: 10, kaal: 'sunrise' },
  { id: 'dussehra',         kind: 'festival', region: 'all',    month: ASHWIN,     tithi: 10, kaal: 'afternoon', major: true },
  { id: 'kojagari',         kind: 'festival', region: 'bengal', month: ASHWIN,     tithi: 15, kaal: 'midnight' },
  { id: 'karva-chauth',     kind: 'vrat',     region: 'north',  month: ASHWIN,     tithi: 19, kaal: 'moonrise', major: true },
  { id: 'dhanteras',        kind: 'festival', region: 'all',    month: ASHWIN,     tithi: 28, kaal: 'pradosh', major: true },
  { id: 'diwali',           kind: 'festival', region: 'all',    month: ASHWIN,     tithi: 30, kaal: 'pradosh', major: true },
  { id: 'kali-puja',        kind: 'festival', region: 'bengal', month: ASHWIN,     tithi: 30, kaal: 'midnight' },
  { id: 'bhai-dooj',        kind: 'festival', region: 'all',    month: KARTIKA,    tithi: 2,  kaal: 'afternoon', prefer: 'last', major: true },
  { id: 'chhath',           kind: 'festival', region: 'north',  month: KARTIKA,    tithi: 6,  kaal: 'sunrise', major: true },
];

const SANKRANTI_RULES: SankrantiRule[] = [
  { id: 'makar-sankranti', kind: 'festival', region: 'all',    sign: 9, rule: 'sameDay', major: true },
  { id: 'poila-boishakh',  kind: 'festival', region: 'bengal', sign: 0, rule: 'nextDay', major: true },
];

/** Ekadashi names by amanta month (index) and paksha; adhika months use Padmini / Parama. */
const EKADASHI_NAMES: [string, string][] = [
  ['Kamada', 'Varuthini'],          // Chaitra
  ['Mohini', 'Apara'],              // Vaishakha
  ['Nirjala', 'Yogini'],            // Jyeshtha
  ['Devshayani', 'Kamika'],         // Ashadha
  ['ShravanaPutrada', 'Aja'],       // Shravana
  ['Parsva', 'Indira'],             // Bhadrapada
  ['Papankusha', 'Rama'],           // Ashwin
  ['Devutthana', 'Utpanna'],        // Kartika
  ['Mokshada', 'Saphala'],          // Margashirsha
  ['PaushaPutrada', 'Shattila'],    // Pausha
  ['Jaya', 'Vijaya'],               // Magha
  ['Amalaki', 'Papmochani'],        // Phalguna
];

export type FestivalEvent = {
  /** Stable per occurrence, e.g. "diwali-2026-11-08" (reminders are stored by it). */
  id:      string;
  ruleId:  string;
  /** Civil date 'YYYY-MM-DD' (device calendar). */
  date:    string;
  kind:    FestivalKind;
  region:  FestivalRegion;
  /** i18n key for the name under `festivals:name.*` (e.g. "name.diwali", "name.ekadashi.Rama"). */
  nameKey: string;
  /** i18n key for the description under `festivals:about.*`. */
  aboutKey: string;
  /** Lunar date for the detail card; null for sankranti festivals. */
  lunar:   { purnimantaMonth: string; amantaMonth: string; paksha: 'Shukla' | 'Krishna'; tithi: number; adhika: boolean } | null;
  /** Rule-derived: may vary by region / tradition by a day. */
  approx:  boolean;
  major:   boolean;
};

const DAY_MS = 86400000;

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function civilNoon(d: Date, add = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, 12);
}

type Place = { lat: number; lng: number };

/** The instant of a kaal on the civil day of `day`. */
function kaalInstant(day: Date, kaal: Kaal, p: Place): Date | null {
  const s = getSunTimes(day, p.lat, p.lng);
  const rise = s.sunrise.getTime(), set = s.sunset.getTime(), len = set - rise;
  switch (kaal) {
    // A minute after sunrise, so a tithi ending exactly at sunrise doesn't count.
    case 'sunrise':   return new Date(rise + 60000);
    // Middle of the 3rd and 4th fifths of the daytime (madhyahna, aparahna).
    case 'midday':    return new Date(rise + 0.5 * len);
    case 'afternoon': return new Date(rise + 0.7 * len);
    // Middle of pradosh: the 2 h 24 min (three muhurtas) after sunset.
    case 'pradosh':   return new Date(set + 72 * 60000);
    case 'pradoshWindow': return new Date(set);
    case 'midnight': {
      const next = getSunTimes(civilNoon(day, 1), p.lat, p.lng).sunrise.getTime();
      return new Date((set + next) / 2);
    }
    case 'moonrise':  return moonriseAfter(new Date(set - 3600000), p.lat, p.lng, 14);
  }
}

/** Hindu day of civil date `d`: sunrise → next sunrise. */
function hinduDaySpan(d: Date, p: Place): [number, number] {
  return [getSunTimes(d, p.lat, p.lng).sunrise.getTime(), getSunTimes(civilNoon(d, 1), p.lat, p.lng).sunrise.getTime()];
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Arunodaya: 96 minutes (4 ghatis) before sunrise. */
const ARUNODAYA_MS = 96 * 60000;

function observedDay(month: LunarMonth, rule: TithiRule, p: Place): Date {
  const span = tithiSpan(month.start, rule.tithi);
  const s0 = span.start.getTime(), s1 = span.end.getTime();
  const days: Date[] = [];
  for (let d = civilNoon(span.start, -1); d <= civilNoon(span.end, 1); d = civilNoon(d, 1)) days.push(d);

  if (rule.kaal === 'pradoshWindow') {
    // Pradosh vrat: the evening whose pradosh (sunset + 2 h 24 min) overlaps
    // Trayodashi the most.
    let best: Date | null = null, bestMs = 0;
    for (const d of days) {
      const set = getSunTimes(d, p.lat, p.lng).sunset.getTime();
      const ms = overlap(set, set + 144 * 60000, s0, s1);
      if (ms > bestMs) { best = d; bestMs = ms; }
    }
    if (best) return best;
  } else {
    const hits = days.filter((d) => {
      const k = kaalInstant(d, rule.kaal, p);
      return !!k && k >= span.start && k < span.end;
    });
    if (rule.kind === 'ekadashi' && hits.length >= 2) {
      // Dashami-viddha: if Dashami still runs at arunodaya on the first day,
      // the fast moves to the next day (Smarta and Vaishnava agree then).
      const rise = getSunTimes(hits[0], p.lat, p.lng).sunrise.getTime();
      return rise - ARUNODAYA_MS < s0 ? hits[1] : hits[0];
    }
    if (hits.length) return rule.prefer === 'last' ? hits[hits.length - 1] : hits[0];
  }
  // The kaal never falls inside the tithi: take the Hindu day that holds most of it.
  let best = days[0], bestMs = -1;
  for (const d of days) {
    const [a, b] = hinduDaySpan(d, p);
    const ms = overlap(a, b, s0, s1);
    if (ms > bestMs) { best = d; bestMs = ms; }
  }
  return best;
}

function ekadashiName(month: LunarMonth, tithi: number): string {
  if (month.adhika) return tithi === 11 ? 'Padmini' : 'Parama';
  return EKADASHI_NAMES[month.index][tithi === 11 ? 0 : 1];
}

export type FestivalOptions = {
  lat?: number | null;
  lng?: number | null;
  /** Include region-specific festivals (default: all). */
  regions?: FestivalRegion[];
};

/**
 * Every festival and vrat whose observed date falls in [from, to] (civil
 * dates, inclusive), sorted by date. Place defaults to Delhi.
 */
export function getFestivals(from: Date, to: Date, opts: FestivalOptions = {}): FestivalEvent[] {
  const p = placeOrDefault(opts.lat, opts.lng);
  const regions = opts.regions ?? ['all', 'north', 'bengal'];
  const fromIso = iso(from), toIso = iso(to);
  const out: FestivalEvent[] = [];
  const months = lunarMonthsBetween(new Date(from.getTime() - 3 * DAY_MS), new Date(to.getTime() + 3 * DAY_MS));

  for (const month of months) {
    for (const rule of TITHI_RULES) {
      if (!regions.includes(rule.region)) continue;
      if (rule.month != null && (rule.month !== month.index || month.adhika)) continue;
      const day = civilNoon(observedDay(month, rule, p), rule.offset ?? 0);
      const date = iso(day);
      if (date < fromIso || date > toIso) continue;
      const isEkadashi = rule.kind === 'ekadashi';
      const name = isEkadashi ? ekadashiName(month, rule.tithi) : null;
      // Holika Dahan (Holi − 1 day) is the Purnima evening.
      const shownTithi = Math.min(30, Math.max(1, rule.tithi + Math.min(0, rule.offset ?? 0)));
      out.push({
        id:       `${rule.id}-${date}`,
        ruleId:   rule.id,
        date,
        kind:     rule.kind,
        region:   rule.region,
        nameKey:  name ? `name.ekadashi.${name}` : `name.${rule.id}`,
        aboutKey: isEkadashi ? (month.adhika ? 'about.ekadashiAdhika' : 'about.ekadashi') : `about.${rule.id}`,
        lunar: {
          amantaMonth:     LUNAR_MONTHS[month.index],
          purnimantaMonth: LUNAR_MONTHS[shownTithi > 15 && !month.adhika ? (month.index + 1) % 12 : month.index],
          paksha:          shownTithi > 15 ? 'Krishna' : 'Shukla',
          tithi:           shownTithi > 15 ? shownTithi - 15 : shownTithi,
          adhika:          month.adhika,
        },
        approx: true,
        major:  !!rule.major,
      });
    }
  }

  for (const rule of SANKRANTI_RULES) {
    if (!regions.includes(rule.region)) continue;
    // Ingresses within the window (a year has one per sign).
    for (let t = sankrantiAfter(rule.sign, new Date(from.getTime() - 40 * DAY_MS));
      t.getTime() < to.getTime() + 40 * DAY_MS;
      t = sankrantiAfter(rule.sign, new Date(t.getTime() + 300 * DAY_MS))) {
      let day = civilNoon(t);
      if (rule.rule === 'nextDay') day = civilNoon(t, 1);
      else if (t > getSunTimes(day, p.lat, p.lng).sunset) day = civilNoon(t, 1);
      const date = iso(day);
      if (date < fromIso || date > toIso) continue;
      out.push({
        id: `${rule.id}-${date}`, ruleId: rule.id, date, kind: rule.kind, region: rule.region,
        nameKey: `name.${rule.id}`, aboutKey: `about.${rule.id}`, lunar: null, approx: true, major: !!rule.major,
      });
    }
  }

  // Bengali Kali Puja shares Diwali's night in most years; keep both (different
  // names and observances) but drop exact duplicates of the same rule and day.
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a) - rank(b)));
}

/** Festivals before vrats before ekadashis on the same day, majors first. */
function rank(e: FestivalEvent): number {
  return (e.major ? 0 : 10) + (e.kind === 'festival' ? 0 : e.kind === 'vrat' ? 1 : 2);
}

/** Festivals in one calendar month (month 1..12). */
export function getFestivalsInMonth(year: number, month: number, opts: FestivalOptions = {}): FestivalEvent[] {
  return getFestivals(new Date(year, month - 1, 1, 12), new Date(year, month, 0, 12), opts);
}

/** The Gregorian date (local midnight) of an event's 'YYYY-MM-DD'. */
export function festivalDate(e: FestivalEvent): Date {
  const [y, m, d] = e.date.split('-').map(Number);
  return new Date(y, m - 1, d);
}
