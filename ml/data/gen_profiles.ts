/**
 * Generate random birth profiles and run them through the app's own chart
 * code, so training prompts carry exactly the chart text the app will send
 * at runtime.
 *
 * Usage (from repo root): npx tsx ml/data/gen_profiles.ts <count> <out.jsonl> [seed]
 */

import { writeFileSync } from 'node:fs';
import { getAstrologyContext, getFullKundli, getTimingContext } from '@/utils/astrology';
import { guessTimeZone } from '@/utils/timezone';

const [, , countArg = '2000', outPath = 'ml/data/profiles.jsonl', seedArg = '42'] = process.argv;

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
];

function randomProfile(i: number) {
  const gender = rand() < 0.48 ? 'female' : rand() < 0.96 ? 'male' : 'other';
  const first = gender === 'female' ? pick(FEMALE) : gender === 'male' ? pick(MALE) : pick([...FEMALE, ...MALE]);
  const name = rand() < 0.7 ? `${first} ${pick(SURNAMES)}` : first;
  // Mostly the app's real audience (born 1985–2008), some older users.
  const year = rand() < 0.85 ? 1985 + Math.floor(rand() * 24) : 1960 + Math.floor(rand() * 25);
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  const birthDate = `${year}-${pad(month)}-${pad(day)}`;
  const birthTime = rand() < 0.8 ? `${pad(Math.floor(rand() * 24))}:${pad(Math.floor(rand() * 60))}` : null;
  const [birthCity, lat, lng] = pick(CITIES);
  // Same time zone the app derives for a profile, so charts match the app's.
  const birthTz = guessTimeZone({ place: birthCity, lat, lng });
  return { id: `p${String(i).padStart(5, '0')}`, name, gender, birthDate, birthTime, birthCity, birthLat: lat, birthLng: lng, birthTz };
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
    context: getAstrologyContext(p),
    // Same timing block utils/ai.ts adds (relative to the generation date).
    timing: getTimingContext(p),
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
console.log(`wrote ${lines.length} profiles to ${outPath}`);
