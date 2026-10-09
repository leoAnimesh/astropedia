#!/usr/bin/env node
/**
 * Writes assets/legal/licenses.json: every package that ships in the app (the
 * production dependency closure of package.json, read from node_modules) with
 * its version, licence, copyright lines and homepage, plus the native and
 * font components bundled by those packages that npm metadata doesn't name.
 * The full text of each licence is stored once (the first package's LICENSE
 * file with its copyright lines removed); the app shows both in
 * Settings → About → Open-source licences (app/legal/licenses.tsx).
 *
 * Run after changing dependencies:  yarn licenses
 * The model licences (Gemma, Llama 3.2, Qwen) come from the model catalog and
 * are shown separately; they are not npm packages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets/legal/licenses.json');
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Build-time or web-only packages that never reach the iOS / Android app.
const BUILD_ONLY = new Set(['expo-build-properties', 'react-native-web', 'react-dom']);
// Tooling subtrees pulled in by expo / react-native that run at build time
// only (CLI, bundler, Babel, codegen, config plugins, dev server).
const TOOLING = [
  /^@expo\/(cli|metro|metro-config|metro-runtime|prebuild-config|config|config-plugins|config-types|fingerprint|devtools|env|image-utils|json-file|plist|package-manager|osascript|spawn-async|code-signing-certificates|server|schema-utils|ws-tunnel|xcpretty|log-box|inline-modules|router-server|local-build-cache-provider)$/,
  /^@babel\//, /^babel-/, /^metro/, /^@react-native\/(babel-|codegen|community-cli|dev-middleware|debugger|gradle-plugin|metro-config|eslint|typescript-config|js-polyfills)/,
  /^hermes-(compiler|parser|estree)$/, /^expo-modules-autolinking$/, /^@expo\/.*-plugin$/, /^react-refresh$/,
  /^@react-native-community\/cli/, /^jest/, /^@jest\//, /^typescript$/, /^eslint/,
];
const isTooling = (name) => TOOLING.some((re) => re.test(name));

/** Bundled components without their own npm package (native code, fonts). */
const EXTRA = [
  { name: 'ExecuTorch', version: '1.4.1', license: 'BSD-3-Clause', copyright: ['Copyright (c) Meta Platforms, Inc. and affiliates.'], url: 'https://github.com/pytorch/executorch', via: 'react-native-executorch' },
  { name: 'XNNPACK', version: '', license: 'BSD-3-Clause', copyright: ['Copyright (c) Facebook, Inc. and its affiliates.', 'Copyright 2019 Google LLC'], url: 'https://github.com/google/XNNPACK', via: 'react-native-executorch' },
  { name: 'Hermes', version: '', license: 'MIT', copyright: ['Copyright (c) Meta Platforms, Inc. and affiliates.'], url: 'https://github.com/facebook/hermes', via: 'react-native' },
  { name: 'MMKV', version: '', license: 'BSD-3-Clause', copyright: ['Copyright (C) 2018 THL A29 Limited, a Tencent company.'], url: 'https://github.com/Tencent/MMKV', via: 'react-native-mmkv' },
  { name: 'SQLite', version: '', license: 'blessing', copyright: ['The SQLite source code is in the public domain.'], url: 'https://sqlite.org/copyright.html', via: 'expo-sqlite' },
  { name: 'Geist and Geist Mono fonts', version: '', license: 'OFL-1.1', copyright: ['Copyright 2024 The Geist Project Authors'], url: 'https://github.com/vercel/geist-font', via: '@expo-google-fonts/geist' },
  { name: 'Instrument Serif font', version: '', license: 'OFL-1.1', copyright: ['Copyright 2022 The Instrument Serif Project Authors'], url: 'https://github.com/Instrument/instrument-serif', via: '@expo-google-fonts/instrument-serif' },
  // Birth places (assets/places, scripts/build-places.mjs). CC BY 4.0 asks for credit and a note of changes.
  { name: 'GeoNames place data', version: '', license: 'CC-BY-4.0', copyright: ['Place names, coordinates and time zones: GeoNames (geonames.org).', 'Changed: places of 1,000+ people only, coordinates rounded, reformatted for the app.'], url: 'https://www.geonames.org', via: 'assets/places' },
  // Bhagavad Gita text (assets/gita-corpus). See assets/gita-corpus/README.md.
  { name: 'Bhagavad Gita, English translation', version: '', license: 'Public-Domain', copyright: ['Translated by Kashinath Trimbak Telang, Sacred Books of the East vol. 8 (Oxford, 1882). Public domain.', 'Changed: split into verses, archaic spellings of names modernised, OCR typos fixed.'], url: 'https://sacred-texts.com/hin/sbe08/index.htm', via: 'assets/gita-corpus' },
  { name: 'Bhagavad Gita, Sanskrit text', version: '', license: 'Unlicense', copyright: ['From github.com/gita/gita, released into the public domain.'], url: 'https://github.com/gita/gita', via: 'assets/gita-corpus' },
];

const LICENSE_FILES = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;
const COPYRIGHT_LINE = /^\s*(copyright|\(c\)|©)\b.*$/gim;

function readPkg(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function resolveDir(name, fromDir) {
  try {
    const req = createRequire(path.join(fromDir, 'package.json'));
    return path.dirname(req.resolve(`${name}/package.json`));
  } catch {
    // Packages whose "exports" hide package.json: walk node_modules upwards.
    let d = fromDir;
    for (;;) {
      const cand = path.join(d, 'node_modules', name);
      if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
      const up = path.dirname(d);
      if (up === d) return null;
      d = up;
    }
  }
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return 'UNKNOWN';
}

function licenseText(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const f = files.find((x) => LICENSE_FILES.test(x));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8') : null;
}

function repoUrl(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const url = pkg.homepage || r || '';
  return url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/#.*$/, '');
}

// ─── Walk the production dependency closure ────────────────────────────────
const seen = new Map(); // "name@version" → entry
const texts = {};
const queue = Object.keys(rootPkg.dependencies ?? {})
  .filter((n) => !BUILD_ONLY.has(n))
  .map((name) => ({ name, from: ROOT }));

while (queue.length) {
  const { name, from } = queue.shift();
  if (isTooling(name)) continue;
  const dir = resolveDir(name, from);
  if (!dir) continue;
  const pkg = readPkg(dir);
  if (!pkg) continue;
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;

  const license = licenseOf(pkg);
  const text = licenseText(dir);
  const copyright = text ? [...new Set((text.match(COPYRIGHT_LINE) ?? []).map((l) => l.trim()))].slice(0, 4) : [];
  if (!copyright.length && pkg.author) {
    const a = typeof pkg.author === 'string' ? pkg.author : pkg.author.name;
    if (a) copyright.push(`Copyright (c) ${a.replace(/\s*<[^>]*>|\s*\([^)]*\)/g, '').trim()}`);
  }
  if (text && !texts[license]) {
    texts[license] = text.replace(COPYRIGHT_LINE, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  seen.set(key, { name: pkg.name, version: pkg.version, license, copyright, url: repoUrl(pkg) });

  for (const dep of Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) })) {
    queue.push({ name: dep, from: dir });
  }
}

const packages = [...seen.values(), ...EXTRA.map(({ via: _via, ...e }) => e)]
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

// Standard texts the walk may not have met (fonts, bundled native code).
const BSD3 = `Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;
texts['BSD-3-Clause'] ??= BSD3;
texts['OFL-1.1'] ??= 'This Font Software is licensed under the SIL Open Font License, Version 1.1. The full licence is available at https://openfontlicense.org/open-font-license-official-text/';
texts['CC-BY-4.0'] ??= 'Creative Commons Attribution 4.0 International. You are free to share and adapt the material for any purpose, even commercially, as long as you give appropriate credit, provide a link to the licence and indicate if changes were made. No warranties are given. Full licence: https://creativecommons.org/licenses/by/4.0/legalcode';
texts.blessing ??= 'The author disclaims copyright to this source code. In place of a legal notice, here is a blessing: May you do good and not evil. May you find forgiveness for yourself and forgive others. May you share freely, never taking more than you give.';
texts['Public-Domain'] ??= 'This work is in the public domain: its copyright has expired. No permission is needed to copy, adapt or share it.';
texts.Unlicense ??= 'This is free and unencumbered software released into the public domain. Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means. See https://unlicense.org';

// Only keep texts something refers to (compound ids like "MIT AND OFL-1.1" keep both parts).
const used = new Set(packages.flatMap((p) => [p.license, ...p.license.split(/\s+(?:AND|OR)\s+|[()]/).filter(Boolean)]));
const keptTexts = Object.fromEntries(Object.entries(texts).filter(([k]) => used.has(k)).sort(([a], [b]) => a.localeCompare(b)));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ packages, texts: keptTexts }, null, 1) + '\n');

const byLicense = packages.reduce((m, p) => ((m[p.license] = (m[p.license] ?? 0) + 1), m), {});
console.log(`wrote ${path.relative(ROOT, OUT)}: ${packages.length} packages, ${Object.keys(keptTexts).length} licence texts`);
console.log(Object.entries(byLicense).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
const flagged = packages.filter((p) => /GPL|AGPL|UNKNOWN|SSPL|CC-BY-NC/i.test(p.license) && !/LGPL/.test(p.license));
if (flagged.length) {
  console.warn(`\nreview these licences before release:\n${flagged.map((p) => `  ${p.name}@${p.version}: ${p.license}`).join('\n')}`);
}
