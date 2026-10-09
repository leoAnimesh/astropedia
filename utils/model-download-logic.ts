/**
 * Pure decision logic for the on-device model download (utils/model-download.ts
 * does the IO). Nothing here touches React Native, the file system or the
 * network, so it runs under plain Node for unit tests.
 *
 * Kept free of TypeScript-only runtime syntax (enums, parameter properties)
 * so `node --test` can load it with type stripping.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelFileRole = 'model' | 'tokenizer';

export type ModelFile = {
  /** Path inside the Hugging Face repo, e.g. "astro-gemma-v21/astro-gemma.pte". */
  path: string;
  size: number;
  /** Lowercase hex SHA-256 of the file. */
  sha256: string;
  role: ModelFileRole;
};

export type ModelSpec = {
  /** Directory name on device and the manifest key, e.g. "astro-gemma-v21". */
  version: string;
  /** Hugging Face commit (or branch) the files are fetched from. */
  revision: string;
  /** Chart-context format the model was trained on (utils/astrology.ts). */
  contextVersion: number;
  /** Trained on the "[followups]" chip task. */
  followups: boolean;
  /** Prompt format ("gemma" | "chatml"); absent = "gemma". */
  chatFormat: string;
  /** Oldest app version (expo version string) that can run this model. */
  minAppVersion?: string;
  /**
   * Answer-pipeline adapter that drives this model (utils/agent/adapters):
   * "gemma21" for astro-gemma v2 / v2.1. Absent = derived from contextVersion
   * + chatFormat. A build only installs models whose adapter it can run.
   */
  adapter?: string;
  files: ModelFile[];
};

/**
 * Adapters this build can run a downloaded model with (utils/agent/adapters/index.ts
 * isRunnableAdapter; 'instruct' joins once a build registers an LLMRuntime).
 */
export const RUNNABLE_ADAPTERS: readonly string[] = ['gemma21'];
/** The adapter of a model entry / install without an explicit `adapter` that matches this build's format. */
export const DEFAULT_ADAPTER = 'gemma21';

/**
 * The adapter that drives a model (manifest entry or install marker): its
 * explicit `adapter`, else DEFAULT_ADAPTER when its context version and chat
 * format are this build's (astro-gemma v2 / v2.1), else null (unknown).
 */
export function adapterOf(
  m: { adapter?: string; contextVersion: number; chatFormat?: string },
  caps: Pick<AppModelCaps, 'contextVersion' | 'chatFormat'>,
): string | null {
  if (m.adapter) return m.adapter;
  return m.contextVersion === caps.contextVersion && (m.chatFormat ?? 'gemma') === caps.chatFormat ? DEFAULT_ADAPTER : null;
}

/** This build can run the model's adapter. */
export function adapterRunnable(m: Parameters<typeof adapterOf>[0], caps: Parameters<typeof adapterOf>[1]): boolean {
  const id = adapterOf(m, caps);
  return id != null && RUNNABLE_ADAPTERS.includes(id);
}

export type Manifest = {
  latest: string;
  models: Record<string, ModelSpec>;
};

/** What this app build can run. */
export type AppModelCaps = {
  contextVersion: number;
  /** The app asks the model for follow-up chips (MODEL_FOLLOWUPS). */
  usesFollowups: boolean;
  chatFormat: string;
  appVersion: string;
};

// ─── Manifest ─────────────────────────────────────────────────────────────────

const SHA256_RE = /^[0-9a-f]{64}$/;
// Repo-relative path: no leading slash, no "..", no URL syntax.
const PATH_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\-/]+$/;
const NAME_RE = /^[A-Za-z0-9._-]+$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

function inferRole(path: string): ModelFileRole | null {
  const name = basename(path).toLowerCase();
  if (name.endsWith('.pte')) return 'model';
  if (name.includes('tokenizer') && name.endsWith('.json')) return 'tokenizer';
  return null;
}

function parseFile(raw: unknown): ModelFile | null {
  if (!isObj(raw)) return null;
  const { path, size, sha256 } = raw;
  if (typeof path !== 'string' || !PATH_RE.test(path)) return null;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) return null;
  if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256.toLowerCase())) return null;
  const role = raw.role === 'model' || raw.role === 'tokenizer' ? raw.role : inferRole(path);
  if (!role) return null;
  return { path, size, sha256: sha256.toLowerCase(), role };
}

/**
 * One manifest entry, or null when anything is missing or malformed. A model
 * needs exactly one 'model' and one 'tokenizer' file with distinct local names.
 */
export function parseModelSpec(version: string, raw: unknown, defaultRevision: string): ModelSpec | null {
  if (!NAME_RE.test(version) || !isObj(raw)) return null;
  if (!Array.isArray(raw.files)) return null;
  const files: ModelFile[] = [];
  for (const f of raw.files) {
    const parsed = parseFile(f);
    if (!parsed) return null;
    files.push(parsed);
  }
  const roles = files.map((f) => f.role);
  if (roles.filter((r) => r === 'model').length !== 1) return null;
  if (roles.filter((r) => r === 'tokenizer').length !== 1) return null;
  if (new Set(files.map((f) => basename(f.path))).size !== files.length) return null;
  if (typeof raw.contextVersion !== 'number' || !Number.isInteger(raw.contextVersion)) return null;
  if (typeof raw.followups !== 'boolean') return null;
  const revision = typeof raw.revision === 'string' && /^[A-Za-z0-9._-]+$/.test(raw.revision)
    ? raw.revision
    : defaultRevision;
  const chatFormat = typeof raw.chatFormat === 'string' ? raw.chatFormat : 'gemma';
  const minAppVersion = typeof raw.minAppVersion === 'string' ? raw.minAppVersion : undefined;
  const adapter = typeof raw.adapter === 'string' && NAME_RE.test(raw.adapter) ? raw.adapter : undefined;
  return {
    version, revision, files, chatFormat,
    contextVersion: raw.contextVersion,
    followups: raw.followups,
    ...(minAppVersion ? { minAppVersion } : {}),
    ...(adapter ? { adapter } : {}),
  };
}

/** The manifest, keeping only well-formed entries; null if unusable. */
export function parseManifest(raw: unknown, defaultRevision = 'main'): Manifest | null {
  if (!isObj(raw) || typeof raw.latest !== 'string' || !isObj(raw.models)) return null;
  const models: Record<string, ModelSpec> = {};
  for (const [version, entry] of Object.entries(raw.models)) {
    const spec = parseModelSpec(version, entry, defaultRevision);
    if (spec) models[version] = spec;
  }
  return { latest: raw.latest, models };
}

/** Numeric dotted-version compare ("1.10.0" > "1.9"); non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Why a model can't run in this build, or null when it can. */
export function incompatibility(spec: ModelSpec, caps: AppModelCaps): string | null {
  if (spec.adapter && !RUNNABLE_ADAPTERS.includes(spec.adapter)) return `adapter ${spec.adapter} not in this build`;
  if (spec.contextVersion !== caps.contextVersion) return `contextVersion ${spec.contextVersion} != ${caps.contextVersion}`;
  if (caps.usesFollowups && !spec.followups) return 'app needs followups';
  if (spec.chatFormat !== caps.chatFormat) return `chatFormat ${spec.chatFormat} != ${caps.chatFormat}`;
  if (spec.minAppVersion && compareVersions(caps.appVersion, spec.minAppVersion) < 0) {
    return `needs app >= ${spec.minAppVersion}`;
  }
  return null;
}

export type Selection = { spec: ModelSpec; source: 'manifest' | 'pinned'; reason: string };

/**
 * The model this build should run: the manifest's `latest` when it parses and
 * is compatible, else the pinned default compiled into the app. A manifest
 * entry with the pinned version but different files is ignored (the pinned
 * hashes win), so a bad manifest edit can't change what this build verifies.
 */
export function selectModel(manifest: Manifest | null, caps: AppModelCaps, pinned: ModelSpec): Selection {
  if (!manifest) return { spec: pinned, source: 'pinned', reason: 'no manifest' };
  const latest = manifest.models[manifest.latest];
  if (!latest) return { spec: pinned, source: 'pinned', reason: `latest "${manifest.latest}" missing or invalid` };
  if (latest.version === pinned.version) return { spec: pinned, source: 'pinned', reason: 'latest is the pinned model' };
  const why = incompatibility(latest, caps);
  if (why) return { spec: pinned, source: 'pinned', reason: `latest incompatible: ${why}` };
  return { spec: latest, source: 'manifest', reason: 'latest compatible' };
}

export function totalBytes(spec: ModelSpec): number {
  return spec.files.reduce((n, f) => n + f.size, 0);
}

// ─── URLs ─────────────────────────────────────────────────────────────────────

/** https://huggingface.co/<repo>/resolve/<revision>/<path> */
export function resolveUrl(base: string, repo: string, revision: string, path: string): string {
  const enc = path.split('/').map(encodeURIComponent).join('/');
  return `${base.replace(/\/+$/, '')}/${repo}/resolve/${encodeURIComponent(revision)}/${enc}`;
}

// ─── Resume ───────────────────────────────────────────────────────────────────

/** Persisted (MMKV) iOS resume checkpoint for one file. */
export type SavedResume = {
  version: string;
  name: string;
  url: string;
  resumeData: string;
  /** Bytes the checkpoint covers. */
  bytes: number;
};

export type ResumePlan =
  /** The partial file is complete; go straight to verification. */
  | { kind: 'complete' }
  | { kind: 'resume'; resumeData: string; from: number }
  | { kind: 'fresh'; deletePartial: boolean; dropSaved: boolean };

/**
 * How to continue one file's download after a restart.
 *
 * Android's DownloadTask streams into the destination file and its resume
 * data is just the byte offset, so the partial file's size is the truth.
 * iOS downloads into a system temp file; only a saved checkpoint (opaque
 * NSURLSession resume data) can continue it.
 */
export function planFileResume(args: {
  platform: 'ios' | 'android';
  expectedSize: number;
  /** Size of the partial file on disk, or null when there is none. */
  partialSize: number | null;
  saved: SavedResume | null;
  url: string;
  version: string;
  name: string;
}): ResumePlan {
  const { platform, expectedSize, partialSize, saved, url, version, name } = args;
  if (partialSize === expectedSize) return { kind: 'complete' };
  const savedValid = !!saved && saved.version === version && saved.name === name
    && saved.url === url && !!saved.resumeData && saved.bytes >= 0 && saved.bytes < expectedSize;
  if (partialSize != null && partialSize > expectedSize) {
    return { kind: 'fresh', deletePartial: true, dropSaved: !!saved };
  }
  if (platform === 'android') {
    if (partialSize != null && partialSize > 0) {
      return { kind: 'resume', resumeData: String(partialSize), from: partialSize };
    }
    return { kind: 'fresh', deletePartial: partialSize != null, dropSaved: !!saved };
  }
  if (savedValid) return { kind: 'resume', resumeData: saved!.resumeData, from: saved!.bytes };
  return { kind: 'fresh', deletePartial: partialSize != null, dropSaved: !!saved };
}

/** Space to keep free beyond the download itself (tmp files, SQLite, MMKV). */
export const DISK_HEADROOM_BYTES = 64 * 1024 * 1024;

/** Bytes still to fetch, given how much of each file is already on disk. */
export function remainingBytes(files: { size: number; have: number }[]): number {
  return files.reduce((n, f) => n + Math.max(0, f.size - Math.max(0, f.have)), 0);
}

/** Free space needed to finish, or 0 when `available` is enough (or unknown). */
export function spaceShortfall(remaining: number, available: number | null): number {
  if (available == null || !Number.isFinite(available) || available < 0) return 0;
  const need = remaining + DISK_HEADROOM_BYTES;
  return available >= need ? 0 : need;
}

// ─── Verification ─────────────────────────────────────────────────────────────

export type VerifyResult = 'ok' | 'missing' | 'size-mismatch' | 'hash-mismatch';

/** Size first (cheap), then hash when one was computed. */
export function verifyFile(expected: { size: number; sha256: string }, actual: { size: number | null; sha256?: string | null }): VerifyResult {
  if (actual.size == null) return 'missing';
  if (actual.size !== expected.size) return 'size-mismatch';
  if (actual.sha256 != null && actual.sha256.toLowerCase() !== expected.sha256.toLowerCase()) return 'hash-mismatch';
  return 'ok';
}

/** Install record written (MMKV) once every file of a version is verified. */
export type InstallMarker = {
  version: string;
  files: { name: string; role: ModelFileRole; size: number; sha256: string }[];
  contextVersion: number;
  followups: boolean;
  chatFormat: string;
  installedAt: string;
  /** Adapter that drives this install (ModelSpec.adapter); absent in markers written before adapters. */
  adapter?: string;
};

export function markerFor(spec: ModelSpec, now: Date): InstallMarker {
  return {
    version: spec.version,
    files: spec.files.map((f) => ({ name: basename(f.path), role: f.role, size: f.size, sha256: f.sha256 })),
    contextVersion: spec.contextVersion,
    followups: spec.followups,
    chatFormat: spec.chatFormat,
    installedAt: now.toISOString(),
    ...(spec.adapter ? { adapter: spec.adapter } : {}),
  };
}

/**
 * Whether an install marker can be trusted at launch without re-hashing: the
 * same files are still there with the recorded sizes and the model is still
 * compatible with this build (an app update may change CONTEXT_VERSION, an
 * older build may not have the install's adapter).
 */
export function markerUsable(
  marker: InstallMarker | null,
  sizesOnDisk: Record<string, number | null>,
  caps: AppModelCaps,
): boolean {
  if (!marker || !Array.isArray(marker.files) || marker.files.length === 0) return false;
  // An install this build has no adapter for (an app downgrade, a newer model
  // family) is not used: setup installs a supported model instead.
  if (marker.adapter && !RUNNABLE_ADAPTERS.includes(marker.adapter)) return false;
  if (marker.contextVersion !== caps.contextVersion) return false;
  if (caps.usesFollowups && !marker.followups) return false;
  if ((marker.chatFormat ?? 'gemma') !== caps.chatFormat) return false;
  if (!marker.files.some((f) => f.role === 'model') || !marker.files.some((f) => f.role === 'tokenizer')) return false;
  return marker.files.every((f) => sizesOnDisk[f.name] === f.size);
}

/** Does an install marker describe exactly this spec's files? */
export function markerMatchesSpec(marker: InstallMarker | null, spec: ModelSpec): boolean {
  if (!marker || marker.version !== spec.version) return false;
  if (marker.files.length !== spec.files.length) return false;
  return spec.files.every((f) =>
    marker.files.some((m) => m.name === basename(f.path) && m.size === f.size && m.sha256 === f.sha256));
}

// ─── Errors and retries ───────────────────────────────────────────────────────

export type ErrorKind = 'network' | 'http-retryable' | 'http-fatal' | 'disk' | 'cancelled' | 'unknown';

const NETWORK_RE = new RegExp([
  'offline', 'not connected', 'internet connection', 'network', 'could not be found', 'hostname',
  'unable to resolve host', 'unknownhost', 'failed to connect', 'connection (was )?(lost|reset|refused|abort)',
  'timed? ?out', 'socket', 'ssl', 'eof', 'software caused connection abort', 'econn', 'enetunreach',
].join('|'), 'i');

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export function classifyError(err: unknown): ErrorKind {
  const msg = errorMessage(err);
  if ((err as { name?: string } | null)?.name === 'AbortError' || /cancel/i.test(msg)) return 'cancelled';
  if (/ENOSPC|no space|not enough (free )?space|disk (is )?full|storage full/i.test(msg)) return 'disk';
  const http = /HTTP\s+(\d{3})/i.exec(msg);
  if (http) {
    const code = Number(http[1]);
    return code >= 500 || code === 408 || code === 429 ? 'http-retryable' : 'http-fatal';
  }
  if (NETWORK_RE.test(msg)) return 'network';
  return 'unknown';
}

export const MAX_AUTO_RETRIES = 5;

/** 1 s, 2 s, 4 s, ... capped at 30 s; `jitter` in [0, 1) adds up to 25%. */
export function backoffDelayMs(attempt: number, jitter = 0): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (1 + 0.25 * Math.min(Math.max(jitter, 0), 0.999)));
}

export type ErrorDecision =
  | { action: 'retry'; delayMs: number }
  /** The app is in the background: try again once it is foregrounded. */
  | { action: 'wait-foreground' }
  /** The selected (manifest) model is unavailable; fall back to the pinned one. */
  | { action: 'fallback-pinned' }
  | { action: 'fail'; phase: 'offline' | 'error' | 'no-space' };

export function decideAfterError(args: {
  kind: ErrorKind;
  /** Retries already made in this run. */
  attempt: number;
  appActive: boolean;
  usingPinned: boolean;
  jitter?: number;
}): ErrorDecision {
  const { kind, attempt, appActive, usingPinned, jitter = 0 } = args;
  if (kind === 'disk') return { action: 'fail', phase: 'no-space' };
  if (kind === 'http-fatal') return usingPinned ? { action: 'fail', phase: 'error' } : { action: 'fallback-pinned' };
  // Downloads die when iOS suspends the app or Android restricts background
  // network; that isn't a failure, and retries made there would be wasted.
  if (!appActive && kind !== 'unknown') return { action: 'wait-foreground' };
  if (attempt >= MAX_AUTO_RETRIES) {
    return { action: 'fail', phase: kind === 'network' || kind === 'cancelled' ? 'offline' : 'error' };
  }
  return { action: 'retry', delayMs: backoffDelayMs(attempt, jitter) };
}

// ─── State machine ────────────────────────────────────────────────────────────

export type SetupPhase =
  | 'idle' | 'checking' | 'downloading' | 'verifying' | 'ready'
  | 'offline' | 'no-space' | 'error';

export type SetupState = {
  phase: SetupPhase;
  /** Bytes on disk / to download, across all files of the version. */
  received: number;
  total: number;
  /** Auto-retry in progress after a dropped connection. */
  retrying: boolean;
  /** Free bytes the download needs ('no-space'). */
  neededBytes: number;
  /** Developer detail of the last failure (logged, not shown). */
  message: string | null;
  /** Version being set up or ready. */
  version: string | null;
};

export const INITIAL_SETUP_STATE: SetupState = {
  phase: 'idle', received: 0, total: 0, retrying: false, neededBytes: 0, message: null, version: null,
};

export type SetupEvent =
  | { type: 'check' }
  | { type: 'ready'; version: string }
  | { type: 'download-start'; version: string; received: number; total: number }
  | { type: 'progress'; received: number }
  | { type: 'retrying' }
  | { type: 'verify' }
  | { type: 'no-space'; neededBytes: number }
  | { type: 'failed'; phase: 'offline' | 'error'; message: string };

export function reduceSetup(s: SetupState, e: SetupEvent): SetupState {
  switch (e.type) {
    case 'check':
      // A retry from a failure (or a re-check) restarts; 'ready' stays ready.
      if (s.phase === 'ready') return s;
      return { ...s, phase: 'checking', retrying: false, message: null, neededBytes: 0 };
    case 'ready':
      return { ...INITIAL_SETUP_STATE, phase: 'ready', version: e.version, received: s.total || s.received, total: s.total };
    case 'download-start':
      if (s.phase === 'ready') return s;
      return {
        ...s, phase: 'downloading', version: e.version, total: e.total,
        received: Math.min(Math.max(0, e.received), e.total), retrying: false, message: null, neededBytes: 0,
      };
    case 'progress':
      if (s.phase !== 'downloading') return s;
      return { ...s, received: Math.min(Math.max(s.received, e.received), s.total || e.received), retrying: false };
    case 'retrying':
      if (s.phase !== 'downloading' && s.phase !== 'checking') return s;
      return { ...s, retrying: true };
    case 'verify':
      if (s.phase === 'ready') return s;
      return { ...s, phase: 'verifying', retrying: false, received: s.total || s.received };
    case 'no-space':
      if (s.phase === 'ready') return s;
      return { ...s, phase: 'no-space', retrying: false, neededBytes: e.neededBytes };
    case 'failed':
      if (s.phase === 'ready') return s;
      return { ...s, phase: e.phase, retrying: false, message: e.message };
  }
}

/** Whole percent for the UI; 100 only once verification starts. */
export function percentOf(s: SetupState): number {
  if (s.phase === 'ready' || s.phase === 'verifying') return 100;
  if (s.total <= 0) return 0;
  return Math.min(99, Math.floor((s.received / s.total) * 100));
}

export function isFailurePhase(p: SetupPhase): boolean {
  return p === 'offline' || p === 'no-space' || p === 'error';
}

export const MB = 1024 * 1024;
/** Megabytes for display, rounded up so "needs 0 MB" never appears. */
export function toMB(bytes: number): number {
  return Math.max(0, Math.ceil(bytes / MB));
}
