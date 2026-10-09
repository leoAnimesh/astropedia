/**
 * The on-device model catalog (Settings → On-device model → Change model).
 * Pure: parsing, the compiled-in fallback catalog, which models this device
 * can run, the switch state machine and what a switch clears. The IO lives
 * in utils/model-download.ts (files) and utils/model-switch.ts (the switch).
 *
 * The catalog comes from the Hugging Face manifest's `catalog` array (older
 * builds ignore the key; `latest` / `models` stay as they were) and falls
 * back to FALLBACK_CATALOG_RAW below when the manifest can't be fetched or
 * has no usable entries. ml/model_catalog.json is the source the manifest is
 * written from (ml/scripts/publish_model.py); keep the two in step (a unit
 * test compares them).
 *
 * Only one model is installed at a time: switching downloads and verifies the
 * new one next to the old, then replaces it, clears every chat and the
 * model-written caches, and the app regenerates readings / reports / titles /
 * chips with the new model.
 *
 * Kept free of TypeScript-only runtime syntax so `node --test` can load it.
 */
import {
  MB, basename, compareVersions, filesValid, parseModelSpec, totalBytes,
  type InstallMarker, type ModelSpec, classifyError, errorMessage,
} from './model-download-logic';

export type CatalogLang = 'en' | 'hi' | 'bn';
/** How well a model writes a language, best → basic (shown on the card). */
export type LangQuality = 'best' | 'good' | 'fair' | 'basic';
const QUALITIES: readonly LangQuality[] = ['best', 'good', 'fair', 'basic'];
const LANGS: readonly CatalogLang[] = ['en', 'hi', 'bn'];

export type CatalogAdapter = 'gemma21' | 'instruct';

export type CatalogLicense = {
  /** SPDX-like id ("apache-2.0", "llama3.2", "gemma"). */
  id: string;
  name: string;
  url: string;
  /** Attribution the licence requires to be shown (Llama: "Built with Llama ..."). */
  notice?: string;
};

export type CatalogEntry = {
  /** Unique id; also the install folder (models/<id>) and the install marker's version. */
  id: string;
  name: string;
  /** settings:modelPicker.desc.<key> when the app has a translation for it. */
  descriptionKey?: string;
  description: Record<CatalogLang, string>;
  adapter: CatalogAdapter;
  /** Download + install description (files, hashes, adapter, template, window). */
  spec: ModelSpec;
  contextWindow: number;
  languages: Partial<Record<CatalogLang, LangQuality>>;
  /** Nominal RAM the phone needs (a 6 GB phone = 6144). */
  minRamMB: number;
  recommended: boolean;
  license: CatalogLicense;
  /** Download size: all files. */
  sizeBytes: number;
};

// ─── Parsing ──────────────────────────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 600): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

function parseLicense(raw: unknown): CatalogLicense | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id, 64);
  const name = str(raw.name, 120);
  const url = str(raw.url, 300);
  if (!id || !name || !url || !/^https:\/\//.test(url)) return null;
  const notice = str(raw.notice, 600);
  return { id, name, url, ...(notice ? { notice } : {}) };
}

/**
 * One catalog entry, or null when anything is missing or malformed. Files may
 * name their repo / revision (or a full huggingface.co resolve URL); the
 * entry's `repo` / `revision` apply to files that don't.
 */
export function parseCatalogEntry(raw: unknown, defaultRevision = 'main'): CatalogEntry | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : null;
  const name = str(raw.name, 80);
  if (!id || !name) return null;
  const adapter = raw.adapter === 'gemma21' || raw.adapter === 'instruct' ? raw.adapter : null;
  if (!adapter || !Array.isArray(raw.files)) return null;

  const entryRepo = typeof raw.repo === 'string' ? raw.repo : undefined;
  const files = raw.files.map((f) => (isObj(f) && entryRepo && f.repo === undefined && f.url === undefined ? { ...f, repo: entryRepo } : f));
  const contextWindow = typeof raw.contextWindow === 'number' && Number.isInteger(raw.contextWindow) && raw.contextWindow >= 512
    ? raw.contextWindow : null;
  if (!contextWindow) return null;
  // gemma21: the astro-gemma training format; instruct: none (driven by a plain prompt).
  const spec = parseModelSpec(id, {
    files,
    revision: raw.revision,
    adapter,
    contextVersion: adapter === 'gemma21' ? (raw.contextVersion ?? 2) : 0,
    followups: adapter === 'gemma21' ? (raw.followups ?? true) : true,
    chatFormat: adapter === 'gemma21' ? (raw.chatFormat ?? 'gemma') : 'template',
    ...(raw.chatTemplate !== undefined ? { chatTemplate: raw.chatTemplate } : {}),
    contextWindow,
    ...(raw.minAppVersion !== undefined ? { minAppVersion: raw.minAppVersion } : {}),
  }, defaultRevision);
  if (!spec || !filesValid(spec.files, adapter)) return null;
  // Catalog downloads come from pinned commits only, never a moving branch.
  if (spec.files.some((f) => !/^[0-9a-f]{40}$/.test(f.revision ?? spec.revision))) return null;

  const descRaw = isObj(raw.description) ? raw.description : {};
  const en = str(descRaw.en);
  if (!en) return null;
  const description = { en, hi: str(descRaw.hi) ?? en, bn: str(descRaw.bn) ?? en };
  const descriptionKey = typeof raw.descriptionKey === 'string' && /^[a-z0-9_]{1,40}$/.test(raw.descriptionKey) ? raw.descriptionKey : undefined;

  const languages: Partial<Record<CatalogLang, LangQuality>> = {};
  if (isObj(raw.languages)) {
    for (const l of LANGS) {
      const q = raw.languages[l];
      if ((QUALITIES as readonly unknown[]).includes(q)) languages[l] = q as LangQuality;
    }
  }
  if (!languages.en) return null;
  const minRamMB = typeof raw.minRamMB === 'number' && Number.isFinite(raw.minRamMB) && raw.minRamMB >= 0 ? Math.round(raw.minRamMB) : null;
  if (minRamMB == null) return null;
  const license = parseLicense(raw.license);
  if (!license) return null;

  return {
    id, name, description, adapter, spec, contextWindow, languages, minRamMB, license,
    recommended: raw.recommended === true,
    sizeBytes: totalBytes(spec),
    ...(descriptionKey ? { descriptionKey } : {}),
  };
}

/** Every well-formed entry of a `catalog` array (first of a repeated id wins); [] when unusable. */
export function parseCatalog(raw: unknown, defaultRevision = 'main'): CatalogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogEntry[] = [];
  for (const item of raw) {
    const e = parseCatalogEntry(item, defaultRevision);
    if (e && !out.some((o) => o.id === e.id)) out.push(e);
  }
  return out;
}

/** The manifest's catalog when it has usable entries, else the compiled-in one. */
export function resolveCatalog(manifestRaw: unknown): { entries: CatalogEntry[]; source: 'manifest' | 'fallback' } {
  const fromManifest = isObj(manifestRaw) ? parseCatalog(manifestRaw.catalog) : [];
  if (fromManifest.length > 0) return { entries: fromManifest, source: 'manifest' };
  return { entries: FALLBACK_CATALOG, source: 'fallback' };
}

// ─── Compiled-in catalog ──────────────────────────────────────────────────────
//
// Same entries as ml/model_catalog.json (descriptions live in the locale files
// under settings:modelPicker.desc, the English here is the fallback text).
// Generic models: react-native-executorch's own exports for 0.10.x
// (huggingface.co/software-mansion, tag v0.10.0 = the commits pinned below;
// built for the ExecuTorch 1.4.1 runtime this build ships), XNNPACK, 2048-token
// graphs.

const QWEN3_REPO = 'software-mansion/react-native-executorch-qwen-3';
const QWEN3_REV = '5004436bc2c31aeaeb272a1ea6e47bd7d91da95c';
const LLAMA32_REPO = 'software-mansion/react-native-executorch-llama-3.2';
const LLAMA32_REV = '79216107364ad9dcad8df0c24a2165aaa9c5cbda';
const QWEN3_TOKENIZER_FILES = [
  { path: 'tokenizer_config.json', size: 8_426, sha256: '40baaad5ff41e28668add0a761c0e004fc7d79ff4b3c37e83762363f1cabae03', role: 'tokenizer_config' },
  { path: 'tokenizer.json', size: 11_422_654, sha256: 'aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4', role: 'tokenizer' },
];

export const FALLBACK_CATALOG_RAW: readonly Record<string, unknown>[] = [
  {
    id: 'astro-gemma-v21',
    name: 'Astropedia Saga v2.1',
    descriptionKey: 'saga',
    description: { en: "Astropedia's own model, trained for Vedic astrology answers in English, Hindi and Bengali. Small, fast and the most natural in Hindi and Bengali." },
    adapter: 'gemma21', contextVersion: 2, followups: true, chatFormat: 'gemma', contextWindow: 2048,
    languages: { en: 'best', hi: 'best', bn: 'best' },
    minRamMB: 2048,
    recommended: true,
    license: { id: 'gemma', name: 'Gemma Terms of Use', url: 'https://ai.google.dev/gemma/terms' },
    repo: 'leoanimesh/astropedia-models',
    revision: '795af230c4d4199eea1ca5830b1aa08c9473d0f1',
    files: [
      { path: 'astro-gemma-v21/astro-gemma-tokenizer.json', size: 3_704_810, sha256: '9d972da479ac5de28b69039c3c32c991568c9f0bf9d44d0a62295a55fdc282a8', role: 'tokenizer' },
      { path: 'astro-gemma-v21/astro-gemma.pte', size: 195_659_264, sha256: '82e842eb92ebdb8be2e90e111ba2a2f502334d504c2538b15a6b647fe3085e16', role: 'model' },
    ],
  },
  {
    id: 'qwen3-0.6b',
    name: 'Qwen3 0.6B',
    descriptionKey: 'qwen3_0_6b',
    description: { en: "A general-purpose model from the Qwen team. Good English; Hindi and Bengali replies are simpler than Saga's. Dates and safety checks still come from the app." },
    adapter: 'instruct', chatTemplate: 'qwen3', contextWindow: 2048,
    languages: { en: 'good', hi: 'basic', bn: 'basic' },
    minRamMB: 3072,
    recommended: false,
    license: { id: 'apache-2.0', name: 'Apache 2.0', url: 'https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE' },
    repo: QWEN3_REPO,
    revision: QWEN3_REV,
    files: [
      ...QWEN3_TOKENIZER_FILES,
      { path: '0_6b/xnnpack/qwen_3_0_6b_xnnpack_8da4w.pte', size: 505_686_400, sha256: '7f8ece3b8d24789be7742d25c312d415574e1efc3c4535ace83a564f3fb27aa0', role: 'model' },
    ],
  },
  {
    id: 'llama3.2-1b',
    name: 'Llama 3.2 1B',
    descriptionKey: 'llama3_2_1b',
    description: { en: "Meta's compact general model (SpinQuant). Clear English and decent Hindi; Bengali is weak. Dates and safety checks still come from the app." },
    adapter: 'instruct', chatTemplate: 'llama3', contextWindow: 4096,
    languages: { en: 'good', hi: 'fair', bn: 'basic' },
    minRamMB: 4096,
    recommended: false,
    license: {
      id: 'llama3.2', name: 'Llama 3.2 Community License', url: 'https://www.llama.com/llama3_2/license/',
      notice: 'Built with Llama. Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.',
    },
    repo: LLAMA32_REPO,
    revision: LLAMA32_REV,
    files: [
      { path: 'tokenizer_config.json', size: 54_528, sha256: '1187bb662fc796b799e5035826bef5ce5c2b1aa3c193c0655d125e53a0cbb782', role: 'tokenizer_config' },
      { path: 'tokenizer.json', size: 9_906_781, sha256: '0b9897f5668a5d202662c4bab2be785eb987daf194b557315a690f3d2dff1ce0', role: 'tokenizer' },
      { path: '1b/xnnpack/llama_3_2_1b_xnnpack_spinquant.pte', size: 1_135_951_488, sha256: '998bf825f0990a4dad60fa2246f202011f76a297119811e2f717e0b787765710', role: 'model' },
    ],
  },
  {
    id: 'qwen3-1.7b',
    name: 'Qwen3 1.7B',
    descriptionKey: 'qwen3_1_7b',
    description: { en: 'The larger Qwen model: fuller answers and better Hindi and Bengali than the 0.6B, but slower and only for phones with plenty of memory.' },
    adapter: 'instruct', chatTemplate: 'qwen3', contextWindow: 2048,
    languages: { en: 'good', hi: 'fair', bn: 'fair' },
    minRamMB: 6144,
    recommended: false,
    license: { id: 'apache-2.0', name: 'Apache 2.0', url: 'https://huggingface.co/Qwen/Qwen3-1.7B/blob/main/LICENSE' },
    repo: QWEN3_REPO,
    revision: QWEN3_REV,
    files: [
      ...QWEN3_TOKENIZER_FILES,
      { path: '1_7b/xnnpack/qwen_3_1_7b_xnnpack_8da4w.pte', size: 1_303_738_496, sha256: '72890e735c1333552b6f0ea0db90bec60d403090f00295cb5ebc94264320022a', role: 'model' },
    ],
  },
];

export const FALLBACK_CATALOG: CatalogEntry[] = parseCatalog(FALLBACK_CATALOG_RAW);

// ─── Device support ───────────────────────────────────────────────────────────

export type DeviceInfo = {
  /** Platform.OS. */
  platform: string;
  /** expo-device Device.totalMemory (bytes); null = unknown, RAM isn't filtered. */
  totalMemoryBytes: number | null;
  /** expo-device Device.supportedCpuArchitectures; null = unknown. */
  cpuArchitectures: string[] | null;
  /** Free bytes on the data partition; null = unknown, disk isn't filtered. */
  freeDiskBytes: number | null;
  /** Adapters this build can run (utils/agent/adapters isRunnableAdapter). */
  runnableAdapters: readonly string[];
  appVersion: string;
};

export type UnsupportedReason = 'platform' | 'arch' | 'adapter' | 'app-version' | 'ram' | 'disk';
export type Support = { ok: true } | { ok: false; reason: UnsupportedReason };

/**
 * Phones report less than their nominal RAM (kernel / GPU carve-outs: a
 * "6 GB" phone shows ~5.5 GB), so the check allows this much slack.
 */
export const RAM_REPORT_SLACK = 0.85;
/** Free space a download needs: its size × this (the old model stays until the new one is verified). */
export const DISK_FACTOR = 1.2;
/** ABIs react-native-executorch ships native libraries for on Android. */
const ANDROID_ABIS = ['arm64-v8a', 'x86_64'];

export function bytesNeededFor(entry: Pick<CatalogEntry, 'sizeBytes'>): number {
  return Math.ceil(entry.sizeBytes * DISK_FACTOR);
}

/**
 * Whether this phone can run `entry`. `installed`: it is the current model,
 * so no download (and no free space) is needed.
 */
export function deviceSupport(entry: CatalogEntry, device: DeviceInfo, installed = false): Support {
  if (device.platform !== 'ios' && device.platform !== 'android') return { ok: false, reason: 'platform' };
  if (device.platform === 'android' && device.cpuArchitectures && device.cpuArchitectures.length > 0) {
    const abis = device.cpuArchitectures.map((a) => a.toLowerCase().replace(/[\s_]/g, '-'));
    if (!ANDROID_ABIS.some((want) => abis.includes(want.replace(/_/g, '-')))) return { ok: false, reason: 'arch' };
  }
  if (!device.runnableAdapters.includes(entry.adapter)) return { ok: false, reason: 'adapter' };
  if (entry.spec.minAppVersion && compareVersions(device.appVersion, entry.spec.minAppVersion) < 0) {
    return { ok: false, reason: 'app-version' };
  }
  if (device.totalMemoryBytes != null && device.totalMemoryBytes > 0
      && device.totalMemoryBytes < entry.minRamMB * MB * RAM_REPORT_SLACK) {
    return { ok: false, reason: 'ram' };
  }
  if (!installed && device.freeDiskBytes != null && device.freeDiskBytes >= 0
      && device.freeDiskBytes < bytesNeededFor(entry)) {
    return { ok: false, reason: 'disk' };
  }
  return { ok: true };
}

/**
 * The picker's list: models this phone can run (the current one always, even
 * if the check would now fail), recommended first, then smallest first.
 * Unsupported models are hidden.
 */
export function pickerEntries(entries: CatalogEntry[], device: DeviceInfo, currentId: string | null): CatalogEntry[] {
  return entries
    .filter((e) => e.id === currentId || deviceSupport(e, device, false).ok)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.sizeBytes - b.sizeBytes);
}

// ─── Current model and the persisted choice ───────────────────────────────────

/**
 * The catalog entry the installed model is. The recommended Saga entry also
 * matches a newer Saga installed by an over-the-air update (astro-gemma-v22
 * while the catalog still lists v21).
 */
export function currentEntryId(entries: CatalogEntry[], marker: Pick<InstallMarker, 'version' | 'adapter'> | null): string | null {
  if (!marker) return null;
  const exact = entries.find((e) => e.id === marker.version);
  if (exact) return exact.id;
  const adapter = marker.adapter ?? 'gemma21';
  return entries.find((e) => e.recommended && e.adapter === 'gemma21' && adapter === 'gemma21')?.id ?? null;
}

/**
 * What to persist as the user's choice: null for the recommended Saga (the
 * default track: launches keep following the manifest's `latest` Saga), the
 * entry id for anything else (launches keep that model).
 */
export function selectionToStore(entry: Pick<CatalogEntry, 'id' | 'recommended' | 'adapter'>): string | null {
  return entry.recommended && entry.adapter === 'gemma21' ? null : entry.id;
}

/** The model a launch should keep: the persisted choice when the catalog still has it, else null (follow `latest`). */
export function selectedEntry(entries: CatalogEntry[], selectedId: string | null): CatalogEntry | null {
  if (!selectedId) return null;
  return entries.find((e) => e.id === selectedId) ?? null;
}

// ─── Switch state machine ─────────────────────────────────────────────────────
//
//   idle → downloading → verifying → installing → clearing → done
//                ↘ cancelled / failed (the old model is untouched)
//
// 'installing' is the point of no return: from there the new model's install
// record is written and the old files are deleted; cancel is ignored.

export type SwitchPhase = 'idle' | 'downloading' | 'verifying' | 'installing' | 'clearing' | 'done' | 'cancelled' | 'failed';
export type SwitchFailure = 'offline' | 'no-space' | 'verify' | 'unavailable' | 'busy' | 'unsupported' | 'error';

export type SwitchState = {
  phase: SwitchPhase;
  targetId: string | null;
  received: number;
  total: number;
  retrying: boolean;
  failure: SwitchFailure | null;
  /** Developer detail of a failure (logged, not shown). */
  message: string | null;
};

export const INITIAL_SWITCH_STATE: SwitchState = {
  phase: 'idle', targetId: null, received: 0, total: 0, retrying: false, failure: null, message: null,
};

export type SwitchEvent =
  | { type: 'start'; targetId: string; total: number; received?: number }
  | { type: 'progress'; received: number }
  | { type: 'retrying' }
  | { type: 'verify' }
  | { type: 'install' }
  | { type: 'clear' }
  | { type: 'done' }
  | { type: 'cancel' }
  | { type: 'fail'; failure: SwitchFailure; message: string }
  | { type: 'reset' };

/** A switch is under way (another one can't start; setup must not run). */
export function switchActive(s: Pick<SwitchState, 'phase'>): boolean {
  return s.phase === 'downloading' || s.phase === 'verifying' || s.phase === 'installing' || s.phase === 'clearing';
}

/** Cancel is offered until the new model starts replacing the old one. */
export function canCancelSwitch(s: Pick<SwitchState, 'phase'>): boolean {
  return s.phase === 'downloading' || s.phase === 'verifying';
}

/** The switch ended without touching the installed model. */
export function oldModelKept(s: Pick<SwitchState, 'phase'>): boolean {
  return s.phase === 'cancelled' || s.phase === 'failed';
}

export function reduceSwitch(s: SwitchState, e: SwitchEvent): SwitchState {
  switch (e.type) {
    case 'start':
      if (switchActive(s)) return s;
      return {
        ...INITIAL_SWITCH_STATE, phase: 'downloading', targetId: e.targetId, total: e.total,
        received: Math.min(Math.max(0, e.received ?? 0), e.total),
      };
    case 'progress':
      if (s.phase !== 'downloading') return s;
      return { ...s, received: Math.min(Math.max(s.received, e.received), s.total || e.received), retrying: false };
    case 'retrying':
      return s.phase === 'downloading' ? { ...s, retrying: true } : s;
    case 'verify':
      return s.phase === 'downloading' ? { ...s, phase: 'verifying', retrying: false, received: s.total } : s;
    case 'install':
      return s.phase === 'verifying' ? { ...s, phase: 'installing' } : s;
    case 'clear':
      return s.phase === 'installing' ? { ...s, phase: 'clearing' } : s;
    case 'done':
      return s.phase === 'clearing' || s.phase === 'installing' ? { ...s, phase: 'done' } : s;
    case 'cancel':
      return canCancelSwitch(s) ? { ...s, phase: 'cancelled', retrying: false } : s;
    case 'fail':
      // Past the point of no return a failure can't bring the old model back;
      // the install record already names the new one (setup repairs it).
      if (!canCancelSwitch(s) && s.phase !== 'idle') return s;
      return { ...s, phase: 'failed', retrying: false, failure: e.failure, message: e.message };
    case 'reset':
      return switchActive(s) ? s : INITIAL_SWITCH_STATE;
  }
}

export function switchPercent(s: Pick<SwitchState, 'phase' | 'received' | 'total'>): number {
  if (s.phase === 'verifying' || s.phase === 'installing' || s.phase === 'clearing' || s.phase === 'done') return 100;
  if (s.total <= 0) return 0;
  return Math.min(99, Math.floor((s.received / s.total) * 100));
}

/** The user-facing failure for an error thrown while downloading / verifying. */
export function classifySwitchError(err: unknown): SwitchFailure | 'cancelled' {
  const msg = errorMessage(err);
  if (/verification failed/i.test(msg)) return 'verify';
  switch (classifyError(err)) {
    case 'cancelled': return 'cancelled';
    case 'disk': return 'no-space';
    case 'network':
    case 'http-retryable': return 'offline';
    case 'http-fatal': return 'unavailable';
    default: return 'error';
  }
}

/** Retry a dropped download this many times (with backoff) before failing. */
export const SWITCH_MAX_RETRIES = 3;

export function shouldRetrySwitch(failure: SwitchFailure | 'cancelled', attempt: number): boolean {
  return failure === 'offline' && attempt < SWITCH_MAX_RETRIES;
}

// ─── What a switch clears ─────────────────────────────────────────────────────
//
// Cleared: every chat (all gurus, Krishna, past / archived conversations),
// with their titles, unread markers and model-written follow-up chips; cached
// chart readings; cached report text (regenerated on open, reading progress
// kept); daily horoscope caches; the semantic answer cache (utils/cache.ts).
// Also cleared: saved answers (they were written by the old model). Kept: profiles, journal, settings, notifications.

/** MMKV (utils/storage.ts) key prefixes of model-derived data. */
export const MODEL_DERIVED_KEY_PREFIXES: readonly string[] = ['chart_reading_', 'followups_', 'horoscope_', 'chat_seen_'];

export function isModelDerivedKey(key: string): boolean {
  return MODEL_DERIVED_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/** SQLite statements of the wipe (utils/database.ts clearChatsAndModelText); one transaction. */
export const MODEL_SWITCH_WIPE_SQL: readonly string[] = [
  'DELETE FROM messages',
  'DELETE FROM threads',
  'DELETE FROM saved_answers',
  'UPDATE reports SET payload = NULL, chart_hash = NULL, generated_at = NULL',
];

/** Tables a switch never touches. */
export const KEPT_ON_SWITCH: readonly string[] = ['profiles', 'journal_entries'];

/**
 * Persisted while a switch's wipe is owed (written before the new install
 * record, cleared after the wipe): a launch that finds it with the new model
 * installed finishes the wipe; with the old model still installed (killed
 * before the commit) it only drops the flag.
 */
export type PendingWipe = { to: string };

export function pendingWipeAction(pending: PendingWipe | null, installedVersion: string | null): 'none' | 'wipe' | 'drop' {
  if (!pending) return 'none';
  return installedVersion === pending.to ? 'wipe' : 'drop';
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Whole megabytes for the card ("482 MB"); decimal MB, as stores and phones show sizes. */
export function displayMB(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1_000_000));
}

/** Local file names of a spec (for checks / logs). */
export function localNames(spec: ModelSpec): string[] {
  return spec.files.map((f) => basename(f.path));
}
