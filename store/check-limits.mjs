#!/usr/bin/env node
// Checks the store listing drafts against App Store / Google Play limits.
// Usage: node store/check-limits.mjs   (exit 1 when anything is over)
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const LIMITS = {
  'Name (30)': 30, 'Subtitle (30)': 30, 'Keywords (100, comma separated, no spaces)': 100,
  'Promotional text (170)': 170, 'Description (4000)': 4000, "What's New (first release)": 4000,
  'App name (30)': 30, 'Short description (80)': 80, 'Full description (4000)': 4000,
};

// Apple and Google count characters (code points), not bytes.
const len = (s) => [...s].length;
let bad = 0;
for (const file of fs.readdirSync(DIR).filter((f) => /^listing\.\w+\.md$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  const parts = text.split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const head = part.slice(0, nl).trim();
    const body = part.slice(nl + 1).split(/^## /m)[0].trim();
    const max = LIMITS[head];
    if (!max) continue;
    const n = len(body);
    const over = n > max;
    if (over) bad++;
    if (head.startsWith('Keywords') && /,\s/.test(body)) { bad++; console.log(`${file}  ${head}: remove spaces after commas`); }
    console.log(`${over ? 'OVER' : 'ok  '} ${file.padEnd(16)} ${head.padEnd(44)} ${String(n).padStart(4)}/${max}`);
  }
}
process.exit(bad ? 1 : 0);
