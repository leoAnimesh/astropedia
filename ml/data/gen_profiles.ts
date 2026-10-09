/**
 * Generate random birth profiles and run them through the app's own chart
 * code, so training prompts carry exactly the chart text the app will send
 * at runtime.
 *
 * Usage (from repo root):
 *   npx tsx --tsconfig ml/data/tsconfig.json ml/data/gen_profiles.ts <count> <out.jsonl> [seed] [today YYYY-MM-DD] [--context-version 1|2]
 *     [--today-range START:END] [--id-prefix p]
 * `today` (default: the local date) dates the transits and timing and is stored
 * in each row; generate.py reads it from there for the "Today:" line.
 * `--today-range 2025-01-01:2029-12-31` instead draws each row's own `today`
 * uniformly from that range (seeded, separate RNG stream so the profile draws
 * stay the same as without it); its context, Age line, transits and timing all
 * use that row's date, so the student can't memorise one set of transit dates.
 * A birth date on/after its row's today is moved back a year. `--id-prefix`
 * (default "p") keeps ids of different profile files apart. `--context-version` (default 2, the newest) picks
 * the chart-context format (utils/astrology.ts ContextVersion); the app sends
 * the version in utils/local-llm.ts CONTEXT_VERSION, so train on the one it
 * will ship with.
 * `--windows` (Saga v2.2) adds `windows`: for every timing-engine topic
 * (utils/timing-engine.ts TIMING_TOPICS) the engine's best window as of the
 * row's today, with the exact Timing line the app appends for a timing
 * question on that topic (utils/agent/adapters/gemma21-prompt.ts windowLine,
 * mode 'line-bottom') and the context with off-window ingress dates cut
 * (filterTransitDates). See RUN_V3.md "Saga v2.2: timing windows".
 */

import { writeFileSync } from 'node:fs';
import { getAstrologyContext, getCurrentMahadasha, getFullKundli, getTimingContext, LATEST_CONTEXT_VERSION, type ContextVersion } from '@/utils/astrology';
import { guessTimeZone } from '@/utils/timezone';
import { TIMING_TOPICS, timingWindows } from '@/utils/timing-engine';
import { filterTransitDates, windowLine } from '@/utils/agent/adapters/gemma21-prompt';

const argv = process.argv.slice(2);
const cvAt = argv.indexOf('--context-version');
const contextVersion = (cvAt >= 0 ? Number(argv.splice(cvAt, 2)[1]) : LATEST_CONTEXT_VERSION) as ContextVersion;
if (contextVersion !== 1 && contextVersion !== 2) throw new Error('--context-version must be 1 or 2');
const trAt = argv.indexOf('--today-range');
const todayRange = trAt >= 0 ? argv.splice(trAt, 2)[1] : null;
const ipAt = argv.indexOf('--id-prefix');
const idPrefix = ipAt >= 0 ? argv.splice(ipAt, 2)[1] : 'p';
const wiAt = argv.indexOf('--windows');
const withWindows = wiAt >= 0 && argv.splice(wiAt, 1).length > 0;
const [countArg = '2000', outPath = 'ml/data/profiles.jsonl', seedArg = '42', todayArg] = argv;
// Local noon of the given day, so transits and timing match the app on that date.
// The day is written into every row ("today"); generate.py uses it for the
// "Today:" line, so the teacher, the transits and the timing share one date.
const pad2 = (n: number) => String(n).padStart(2, '0');
const localToday = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = todayArg ?? localToday(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`today must be YYYY-MM-DD, got ${today}`);
const fixedNow = new Date(`${today}T12:00:00`);
let rangeDays: [number, number] | null = null;  // [start, end] as UTC day numbers
if (todayRange) {
  const m = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(todayRange);
  if (!m) throw new Error(`--today-range must be START:END (YYYY-MM-DD), got ${todayRange}`);
  const day = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86400000);
  rangeDays = [day(m[1]), day(m[2])];
  if (rangeDays[1] < rangeDays[0]) throw new Error('--today-range: END is before START');
}

// Mulberry32: small seeded PRNG so runs are reproducible.
let seed = Number(seedArg) >>> 0;
function rand(): number {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Second stream for the per-row dates (--today-range), so the profiles
// themselves are drawn exactly as without the option.
let dateSeed = (Number(seedArg) ^ 0x9e3779b9) >>> 0;
function randDate(): number {
  dateSeed = (dateSeed + 0x6d2b79f5) >>> 0;
  let t = dateSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rowToday(): string {
  if (!rangeDays) return today;
  const d = new Date((rangeDays[0] + Math.floor(randDate() * (rangeDays[1] - rangeDays[0] + 1))) * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const pad = (n: number) => String(n).padStart(2, '0');

const FEMALE = ['Priya', 'Ananya', 'Sneha', 'Kavya', 'Isha', 'Meera', 'Riya', 'Aditi', 'Pooja', 'Nisha',
  'Divya', 'Shreya', 'Tanvi', 'Aarohi', 'Lakshmi', 'Fatima', 'Sara', 'Emma', 'Olivia', 'Maya',
  'Zoya', 'Neha', 'Anjali', 'Ritu', 'Sanya', 'Grace', 'Hana', 'Leila', 'Chloe', 'Amara'];
const MALE = ['Arjun', 'Rahul', 'Vikram', 'Aditya', 'Rohan', 'Karan', 'Siddharth', 'Animesh', 'Arup', 'Dev',
  'Kabir', 'Aryan', 'Nikhil', 'Rajesh', 'Suresh', 'Imran', 'Faisal', 'James', 'Liam', 'Noah',
  'Omar', 'Vivek', 'Manish', 'Harsh', 'Yash', 'Daniel', 'Ethan', 'Kenji', 'Mateo', 'Samir'];
const SURNAMES = ['Sharma', 'Mondal', 'Iyer', 'Patel', 'Gupta', 'Reddy', 'Banerjee', 'Khan', 'Singh', 'Nair',
  'Das', 'Mehta', 'Kapoor', 'Joshi', 'Rao', 'Chatterjee', 'Smith', 'Garcia', 'Ali', 'Fernandes'];

const CITIES: readonly [string, number, number][] = [
  ['Kolkata, India', 22.57, 88.36], ['Mumbai, India', 19.08, 72.88], ['Delhi, India', 28.61, 77.21],
  ['Bengaluru, India', 12.97, 77.59], ['Chennai, India', 13.08, 80.27], ['Hyderabad, India', 17.39, 78.49],
  ['Pune, India', 18.52, 73.86], ['Ahmedabad, India', 23.02, 72.57], ['Jaipur, India', 26.91, 75.79],
  ['Lucknow, India', 26.85, 80.95], ['Patna, India', 25.59, 85.14], ['Guwahati, India', 26.14, 91.74],
  ['Kochi, India', 9.93, 76.27], ['Bhubaneswar, India', 20.30, 85.82], ['Varanasi, India', 25.32, 82.97],
  ['Siliguri, India', 26.73, 88.40], ['Dhaka, Bangladesh', 23.81, 90.41], ['Kathmandu, Nepal', 27.72, 85.32],
  ['Colombo, Sri Lanka', 6.93, 79.86], ['Karachi, Pakistan', 24.86, 67.01], ['Dubai, UAE', 25.20, 55.27],
  ['Singapore', 1.35, 103.82], ['London, UK', 51.51, -0.13], ['New York, USA', 40.71, -74.01],
  ['San Francisco, USA', 37.77, -122.42], ['Toronto, Canada', 43.65, -79.38], ['Sydney, Australia', -33.87, 151.21],
  ['Berlin, Germany', 52.52, 13.40], ['Nairobi, Kenya', -1.29, 36.82], ['Tokyo, Japan', 35.68, 139.69],
  ['Los Angeles, California, USA', 34.05, -118.24], ['Buenos Aires, Argentina', -34.60, -58.38],
  ['Oslo, Norway', 59.91, 10.75], ['Auckland, New Zealand', -36.85, 174.76],
];

// Relationship labels as users type them for profiles that aren't themselves.
const RELATIONS = ['mother', 'father', 'wife', 'husband', 'partner', 'son', 'daughter', 'brother', 'sister', 'friend', 'Maa', 'best friend'];

function randomProfile(i: number) {
  // Same machine values the app stores (utils/database.ts Profile.gender).
  const g = rand();
  const gender = g < 0.42 ? 'woman' : g < 0.84 ? 'man' : g < 0.88 ? 'non_binary' : g < 0.94 ? 'unspecified' : null;
  const first = gender === 'woman' ? pick(FEMALE) : gender === 'man' ? pick(MALE) : pick([...FEMALE, ...MALE]);
  const name = rand() < 0.7 ? `${first} ${pick(SURNAMES)}` : first;
  // Mostly the app's real audience (born 1985–2008), some older users and
  // some children whose parents ask about them.
  const yr = rand();
  const year = yr < 0.8 ? 1985 + Math.floor(rand() * 24) : yr < 0.93 ? 1950 + Math.floor(rand() * 35) : 2009 + Math.floor(rand() * 17);
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  const birthDate = `${year}-${pad(month)}-${pad(day)}`;
  const birthTime = rand() < 0.8 ? `${pad(Math.floor(rand() * 24))}:${pad(Math.floor(rand() * 60))}` : null;
  let [birthCity, lat, lng]: [string | null, number | null, number | null] = pick(CITIES);
  // The app allows no place (no rising, time read as UT) and typed cities
  // without a country (no zone: local mean time from the coordinates).
  const place = rand();
  if (place < 0.04) [birthCity, lat, lng] = [null, null, null];
  else if (place < 0.07) birthCity = birthCity!.split(',')[0];
  // Same time zone the app derives for a profile, so charts match the app's.
  const birthTz = birthCity ? guessTimeZone({ place: birthCity, lat, lng }) : null;
  // Most chats are about the user; some about family or friends.
  const isYou = rand() >= 0.15;
  const relationship = isYou ? null : rand() < 0.9 ? pick(RELATIONS) : null;
  return { id: `${idPrefix}${String(i).padStart(5, '0')}`, name, gender, birthDate, birthTime, birthCity, birthLat: lat, birthLng: lng, birthTz, isYou, relationship };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

const lines: string[] = [];
for (let i = 0; i < Number(countArg); i++) {
  const p = randomProfile(i);
  const rowDay = rowToday();
  const now = rangeDays ? new Date(`${rowDay}T12:00:00`) : fixedNow;
  // Children are born up to 2025; never after the row's own today.
  if (p.birthDate >= rowDay) p.birthDate = `${Number(rowDay.slice(0, 4)) - 1}${p.birthDate.slice(4)}`;
  const k = getFullKundli({ birthDate: p.birthDate, birthTime: p.birthTime ?? undefined, birthLat: p.birthLat, birthLng: p.birthLng, birthTz: p.birthTz });
  const { sun, moon, rising } = k.bigThree;
  // getFullKundli dates the mahadasha by the wall clock; the reading must use the row's today.
  const dasha = getCurrentMahadasha(k.moonLon, p.birthDate, now);
  lines.push(JSON.stringify({
    ...p,
    // Same text utils/ai.ts puts in the Saga system prompt.
    context: getAstrologyContext(p, { version: contextVersion, date: now }),
    contextVersion,
    today: rowDay,
    // Same timing block utils/ai.ts adds (relative to the generation date).
    timing: getTimingContext(p, now, contextVersion),
    ...(withWindows ? { windows: Object.fromEntries(TIMING_TOPICS.map((topic) => {
      const r = timingWindows(p, topic, now);
      const w = r.windows[0];
      if (!w) return [topic, null];
      const iso = (d: Date) => localToday(d).slice(0, 7);
      return [topic, {
        line: windowLine(topic, w),
        context: filterTransitDates(getAstrologyContext(p, { version: contextVersion, date: now }), r.windows),
        start: iso(w.start), end: iso(w.end), peak: iso(w.peak), strength: w.strength, confidence: w.confidence,
        others: r.windows.slice(1).map((x) => ({ start: iso(x.start), end: iso(x.end), peak: iso(x.peak) })),
        nextStrong: r.nextStrong ? iso(r.nextStrong.start) : null,
      }];
    })) } : {}),
    reading: {
      firstName: p.name.split(' ')[0],
      sun: sun?.name ?? null,
      moon: moon?.name ?? null,
      rising: rising?.name ?? null,
      nakshatra: k.nakshatra.name,
      nakshatraLord: k.nakshatra.lord,
      dashaLord: dasha.lord,
      dashaEnd: dasha.endDate,
    },
    // Reference entries in assets/astrology-corpus that describe this chart.
    corpusIds: [
      sun && `sign-${slug(sun.name)}`,
      moon && `sign-${slug(moon.name)}`,
      `nakshatra-${slug(k.nakshatra.name)}`,
      `dasha-${slug(dasha.lord)}`,
    ].filter(Boolean),
  }));
}
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} profiles (context v${contextVersion}, today ${todayRange ?? today}) to ${outPath}`);
