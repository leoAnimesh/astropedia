/**
 * Generate random birth profiles and run them through the app's own chart
 * code, so training prompts carry exactly the chart text the app will send
 * at runtime.
 *
 * Usage (from repo root):
 *   npx tsx --tsconfig ml/data/tsconfig.json ml/data/gen_profiles.ts <count> <out.jsonl> [seed] [today YYYY-MM-DD] [--context-version 1|2]
 * `today` (default: the local date) dates the transits and timing and is stored
 * in each row; generate.py reads it from there for the "Today:" line. `--context-version` (default 2, the newest) picks
 * the chart-context format (utils/astrology.ts ContextVersion); the app sends
 * the version in utils/local-llm.ts CONTEXT_VERSION, so train on the one it
 * will ship with.
 */

import { writeFileSync } from 'node:fs';
import { getAstrologyContext, getFullKundli, getTimingContext, LATEST_CONTEXT_VERSION, type ContextVersion } from '@/utils/astrology';
import { guessTimeZone } from '@/utils/timezone';

const argv = process.argv.slice(2);
const cvAt = argv.indexOf('--context-version');
const contextVersion = (cvAt >= 0 ? Number(argv.splice(cvAt, 2)[1]) : LATEST_CONTEXT_VERSION) as ContextVersion;
if (contextVersion !== 1 && contextVersion !== 2) throw new Error('--context-version must be 1 or 2');
const [countArg = '2000', outPath = 'ml/data/profiles.jsonl', seedArg = '42', todayArg] = argv;
// Local noon of the given day, so transits and timing match the app on that date.
// The day is written into every row ("today"); generate.py uses it for the
// "Today:" line, so the teacher, the transits and the timing share one date.
const pad2 = (n: number) => String(n).padStart(2, '0');
const localToday = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = todayArg ?? localToday(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`today must be YYYY-MM-DD, got ${today}`);
const now = new Date(`${today}T12:00:00`);

// Mulberry32: small seeded PRNG so runs are reproducible.
let seed = Number(seedArg) >>> 0;
function rand(): number {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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
  return { id: `p${String(i).padStart(5, '0')}`, name, gender, birthDate, birthTime, birthCity, birthLat: lat, birthLng: lng, birthTz, isYou, relationship };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

const lines: string[] = [];
for (let i = 0; i < Number(countArg); i++) {
  const p = randomProfile(i);
  const k = getFullKundli({ birthDate: p.birthDate, birthTime: p.birthTime ?? undefined, birthLat: p.birthLat, birthLng: p.birthLng, birthTz: p.birthTz });
  const { sun, moon, rising } = k.bigThree;
  lines.push(JSON.stringify({
    ...p,
    // Same text utils/ai.ts puts in the Saga system prompt.
    context: getAstrologyContext(p, { version: contextVersion, date: now }),
    contextVersion,
    today,
    // Same timing block utils/ai.ts adds (relative to the generation date).
    timing: getTimingContext(p, now, contextVersion),
    reading: {
      firstName: p.name.split(' ')[0],
      sun: sun?.name ?? null,
      moon: moon?.name ?? null,
      rising: rising?.name ?? null,
      nakshatra: k.nakshatra.name,
      nakshatraLord: k.nakshatra.lord,
      dashaLord: k.dasha.lord,
      dashaEnd: k.dasha.endDate,
    },
    // Reference entries in assets/astrology-corpus that describe this chart.
    corpusIds: [
      sun && `sign-${slug(sun.name)}`,
      moon && `sign-${slug(moon.name)}`,
      `nakshatra-${slug(k.nakshatra.name)}`,
      `dasha-${slug(k.dasha.lord)}`,
    ].filter(Boolean),
  }));
}
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} profiles (context v${contextVersion}, today ${today}) to ${outPath}`);
