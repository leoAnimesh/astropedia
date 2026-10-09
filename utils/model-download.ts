/**
 * Downloads, verifies and installs the on-device model (Saga) from the
 * Hugging Face Hub instead of shipping it inside the app.
 *
 *   startModelSetup()  app launch (app/_layout.tsx): finds a verified install,
 *                      adopts a copy already on disk (Android builds that
 *                      bundled the model, stale dev builds), or downloads it.
 *   useModelSetup      zustand store with the phase + byte progress for the
 *                      overlay (components/overlays/ModelSetupOverlay.tsx) and
 *                      the inline pill (components/molecules/ModelSetupPill.tsx).
 *   getInstalledModelFiles()  paths for utils/local-llm.ts once 'ready'.
 *
 * Files land in Documents/models/<version>/ (excluded from iCloud backup).
 * They download as "<name>.part", are checked against the size and SHA-256
 * from the manifest (or the pinned default below), then renamed; an MMKV
 * install marker written after the renames is the commit point. Later
 * launches trust the marker plus a size check, no re-hash.
 *
 * Resume: Android's DownloadTask writes straight into the .part file and
 * resumes with an HTTP Range from its size, so even a killed app continues.
 * iOS downloads through a background URLSession (keeps going while the app is
 * suspended); for kills, it checkpoints NSURLSession resume data to MMKV every
 * CHECKPOINT_BYTES while in the foreground. Pure decisions live in
 * ./model-download-logic.ts (unit-tested).
 *
 * Model choice: Settings → Change model (utils/model-switch.ts) installs a
 * model from the catalog (utils/model-catalog.ts; the manifest's `catalog`,
 * files possibly in other Hugging Face repos, pinned by commit) through
 * downloadForSwitch / commitSwitchedModel below. A switch download resumes
 * the same way (its own MMKV resume record, model_switch_resume_v1), and its
 * folder survives launch cleanups while the switch is pending
 * (model_switch_pending_v1), so a killed or offline switch continues. The choice is persisted
 * (Storage model_selected_v1) and launches keep that model instead of
 * following `latest`; setup never runs while a switch owns the models folder.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import { File, Paths, DownloadTask } from 'expo-file-system';
import Constants from 'expo-constants';
import { create } from 'zustand';
import { Storage } from './storage';
import { CHAT_FORMAT, CONTEXT_VERSION, MODEL_FOLLOWUPS } from './local-llm';
import { configureExecuTorchRuntime, setActiveAdapter } from './agent/adapters';
import {
  INITIAL_SETUP_STATE, adapterOf, adapterRunnable, basename, classifyError, decideAfterError, errorMessage, fileUrl, isFailurePhase,
  markerFor, markerMatchesSpec, markerUsable, parseManifest, parsePendingSwitch, planFileResume, reduceSetup,
  remainingBytes, resolveUrl, selectModel, spaceShortfall, switchKeep, totalBytes, verifyFile,
  type AppModelCaps, type InstallMarker, type ModelFile, type ModelFileRole,
  type ModelSpec, type ResumePlan, type SavedResume, type Selection, type SetupEvent, type SetupState,
} from './model-download-logic';
import { resolveCatalog, selectedEntry, type CatalogEntry } from './model-catalog';

// ─── Configuration (the one place to change hosting) ─────────────────────────

/**
 * 'remote' (default): download from Hugging Face. 'bundled': rollback to the
 * model shipped inside the app; also re-add "./plugins/with-bundled-model"
 * to app.json plugins and prebuild, or the files won't be in the binary.
 */
export const MODEL_SOURCE = 'remote' as 'remote' | 'bundled';

export const HF_BASE = 'https://huggingface.co';
export const HF_REPO = 'leoanimesh/astropedia-models';
/**
 * Immutable commit the pinned files are fetched from. Replace 'main' with the
 * commit hash of the upload (ml/scripts/publish_model.py prints the steps);
 * the SHA-256 check protects integrity either way, the hash protects against
 * the files moving under a released build.
 */
export const HF_REVISION = '795af230c4d4199eea1ca5830b1aa08c9473d0f1';
/** Mutable on purpose: the manifest is how later model updates are announced. */
export const MANIFEST_URL = resolveUrl(HF_BASE, HF_REPO, 'main', 'manifest.json');

/**
 * The model this build was made for. Used when the manifest can't be fetched
 * or offers nothing compatible, so setup never depends on the manifest.
 * Must match CONTEXT_VERSION / MODEL_FOLLOWUPS / CHAT_FORMAT in local-llm.ts.
 */
export const PINNED_MODEL: ModelSpec = {
  version: 'astro-gemma-v21',
  revision: HF_REVISION,
  contextVersion: 2,
  followups: true,
  chatFormat: 'gemma',
  files: [
    {
      path: 'astro-gemma-v21/astro-gemma-tokenizer.json',
      size: 3_704_810,
      sha256: '9d972da479ac5de28b69039c3c32c991568c9f0bf9d44d0a62295a55fdc282a8',
      role: 'tokenizer',
    },
    {
      path: 'astro-gemma-v21/astro-gemma.pte',
      size: 195_659_264,
      sha256: '82e842eb92ebdb8be2e90e111ba2a2f502334d504c2538b15a6b647fe3085e16',
      role: 'model',
    },
  ],
};

const MANIFEST_TIMEOUT_MS = 6_000;
/** iOS: save resume data this often (foreground only); a kill loses at most this much. */
const CHECKPOINT_BYTES = 24 * 1024 * 1024;
/** While 'offline' and in the foreground, try again this often. */
const OFFLINE_RETRY_MS = 30_000;
const MODELS_DIR = 'models';

// ─── Store ────────────────────────────────────────────────────────────────────

export type ModelSetupStore = SetupState & {
  /** Full-screen overlay owed after onboarding (persisted until ready). */
  overlayPending: boolean;
};

const remoteEnabled = Platform.OS !== 'web' && MODEL_SOURCE === 'remote';

export const useModelSetup = create<ModelSetupStore>(() => ({
  ...INITIAL_SETUP_STATE,
  // Web has no model; bundled builds have it from the start.
  ...(remoteEnabled ? {} : { phase: 'ready' as const }),
  overlayPending: remoteEnabled && Storage.getModelOverlayPending(),
}));

function dispatch(e: SetupEvent) {
  useModelSetup.setState((s) => reduceSetup(s, e));
}

function log(...args: unknown[]) {
  if (__DEV__) console.log('[model-download]', ...args);
}

export function isModelReady(): boolean {
  return useModelSetup.getState().phase === 'ready';
}

/**
 * Called when onboarding finishes: show the full-screen overlay unless the
 * model is already ready.
 */
export function requestModelOverlay(): void {
  if (!remoteEnabled || isModelReady()) return;
  Storage.setModelOverlayPending(true);
  useModelSetup.setState({ overlayPending: true });
  // Make sure something is running (e.g. it failed while onboarding).
  if (isFailurePhase(useModelSetup.getState().phase)) startModelSetup();
}

export function dismissModelOverlay(): void {
  Storage.setModelOverlayPending(false);
  useModelSetup.setState({ overlayPending: false });
}

/**
 * Resolves true once the model is installed, false if setup stops in a
 * failure state ('offline', 'no-space', 'error'). Kicks off a retry when
 * called while failed.
 */
export function waitForModelReady(): Promise<boolean> {
  if (isModelReady()) return Promise.resolve(true);
  if (isFailurePhase(useModelSetup.getState().phase)) startModelSetup();
  const now = useModelSetup.getState().phase;
  if (now === 'ready') return Promise.resolve(true);
  if (isFailurePhase(now)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const unsub = useModelSetup.subscribe((s) => {
      if (s.phase === 'ready') { unsub(); resolve(true); }
      else if (isFailurePhase(s.phase)) { unsub(); resolve(false); }
    });
  });
}

// ─── Paths and file helpers ───────────────────────────────────────────────────

const { fs } = RNBlobUtil;

/** Plain path (native runner, blob-util) of a Documents-relative path. */
function docPath(rel: string): string {
  return `${fs.dirs.DocumentDir}/${rel}`;
}

/** file:// URI (expo-file-system) of a Documents-relative path. */
function docUri(rel: string): string {
  const base = Paths.document.uri;
  return `${base}${base.endsWith('/') ? '' : '/'}${rel.split('/').map(encodeURIComponent).join('/')}`;
}

const versionDir = (version: string) => `${MODELS_DIR}/${version}`;

async function sizeOf(path: string): Promise<number | null> {
  try {
    if (!(await fs.exists(path))) return null;
    const st = await fs.stat(path);
    if (st.type === 'directory') return null;
    const n = Number(st.size);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function unlinkQuiet(path: string) {
  try { if (await fs.exists(path)) await fs.unlink(path); } catch { /* ignore */ }
}

async function ensureDir(rel: string) {
  const parts = rel.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const p = docPath(parts.slice(0, i).join('/'));
    if (!(await fs.exists(p))) await fs.mkdir(p).catch(() => {});
  }
}

/** Keep the models out of iCloud backups (re-downloadable, ~200 MB). */
async function excludeFromBackup(rel: string) {
  if (Platform.OS !== 'ios') return;
  try { await RNBlobUtil.ios.excludeFromBackupKey(docUri(rel)); } catch { /* best effort */ }
}

function availableSpace(): number | null {
  try {
    const n = Paths.availableDiskSpace;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Delete every models/ entry except the given versions. */
async function cleanupVersions(keepVersions: string[]) {
  const root = docPath(MODELS_DIR);
  // An interrupted Settings switch keeps its partial download for the resume.
  const keep = [...keepVersions, ...switchKeep(parsePendingSwitch(Storage.getModelSwitchPending()), readMarker()?.version ?? null)];
  try {
    if (!(await fs.exists(root))) return;
    for (const name of await fs.ls(root)) {
      if (!keep.includes(name)) {
        log('removing old model', name);
        await fs.unlink(`${root}/${name}`).catch(() => {});
      }
    }
  } catch { /* ignore */ }
}

// ─── Persisted records ────────────────────────────────────────────────────────

function readMarker(): InstallMarker | null {
  const raw = Storage.getModelInstall();
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as InstallMarker;
    return m && typeof m.version === 'string' && Array.isArray(m.files) ? m : null;
  } catch {
    return null;
  }
}

function parseResume(raw: string | null): SavedResume | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SavedResume; } catch { return null; }
}

/** Where a download keeps its iOS resume checkpoint (setup and a Settings switch each have one). */
type ResumeStore = { read: () => SavedResume | null; write: (r: SavedResume) => void; clear: () => void };

const SETUP_RESUME: ResumeStore = {
  read: () => parseResume(Storage.getModelResume()),
  write: (r) => Storage.setModelResume(JSON.stringify(r)),
  clear: () => Storage.clearModelResume(),
};

const SWITCH_RESUME: ResumeStore = {
  read: () => parseResume(Storage.getModelSwitchResume()),
  write: (r) => Storage.setModelSwitchResume(JSON.stringify(r)),
  clear: () => Storage.clearModelSwitchResume(),
};

function appCaps(): AppModelCaps {
  return {
    contextVersion: CONTEXT_VERSION,
    usesFollowups: MODEL_FOLLOWUPS,
    chatFormat: CHAT_FORMAT,
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
  };
}

/**
 * Activate the answer-pipeline adapter of an install (utils/agent/adapters):
 * the installed model decides it, not the manifest's selection. An adapter
 * this build can't run activates the template adapter (setup then installs a
 * supported model; Settings → Re-download does the same).
 */
function activateInstalledAdapter(marker: InstallMarker): void {
  const id = adapterOf(marker, appCaps());
  if (id === 'instruct') configureExecuTorchRuntime({ contextWindow: marker.contextWindow ?? null });
  const active = setActiveAdapter(id ?? 'unsupported');
  log('adapter', id ?? '(unknown)', '->', active);
}

export type InstalledModelFiles = {
  model: string;
  tokenizer: string;
  /** tokenizer_config.json ('instruct' models: chat template + stop tokens). */
  tokenizerConfig: string | null;
  version: string;
  adapter: string | null;
  chatTemplate: string | null;
  contextWindow: number | null;
};

/** Local file paths of the installed model, or null when not ready. */
export async function getInstalledModelFiles(): Promise<InstalledModelFiles | null> {
  if (!remoteEnabled || !isModelReady()) return null;
  const marker = readMarker();
  if (!marker) return null;
  const byRole = (role: ModelFileRole) => marker.files.find((f) => f.role === role)?.name;
  const model = byRole('model');
  const tokenizer = byRole('tokenizer');
  const config = byRole('tokenizer_config');
  if (!model || !tokenizer) return null;
  const dir = docPath(versionDir(marker.version));
  return {
    model: `${dir}/${model}`,
    tokenizer: `${dir}/${tokenizer}`,
    tokenizerConfig: config ? `${dir}/${config}` : null,
    version: marker.version,
    adapter: adapterOf(marker, appCaps()),
    chatTemplate: marker.chatTemplate ?? null,
    contextWindow: marker.contextWindow ?? null,
  };
}

/** The install record (Settings → model picker: which catalog entry is current). */
export function getInstallMarker(): InstallMarker | null {
  return readMarker();
}

/**
 * For utils/local-llm.ts: the installed files, waiting out a launch-time
 * check in progress (a few ms with an install marker; up to the manifest
 * timeout without one). Null while downloading or failed.
 */
export async function awaitInstalledModelFiles(timeoutMs = 10_000): Promise<Awaited<ReturnType<typeof getInstalledModelFiles>>> {
  const settling = (p: string) => p === 'idle' || p === 'checking';
  if (remoteEnabled && settling(useModelSetup.getState().phase)) {
    if (useModelSetup.getState().phase === 'idle') startModelSetup();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { unsub(); resolve(); }, timeoutMs);
      const unsub = useModelSetup.subscribe((s) => {
        if (!settling(s.phase)) { clearTimeout(timer); unsub(); resolve(); }
      });
    });
  }
  const files = await getInstalledModelFiles();
  // The files about to be loaded decide the adapter (a background update
  // installed earlier in the session takes effect here, with its model).
  const marker = files ? readMarker() : null;
  if (marker) activateInstalledAdapter(marker);
  return files;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

/** The manifest JSON as fetched (null offline / on errors); parsed by the callers. */
async function fetchManifestRaw(): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const res = await fetch(MANIFEST_URL, { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The selectable models: the manifest's `catalog`, else the compiled-in one
 * (utils/model-catalog.ts FALLBACK_CATALOG).
 */
export async function fetchCatalog(): Promise<{ entries: CatalogEntry[]; source: 'manifest' | 'fallback' }> {
  return resolveCatalog(await fetchManifestRaw());
}

/**
 * What setup should install / keep. A model the user chose in Settings
 * (Storage model_selected_v1) wins while the catalog still lists it and this
 * build can run it; otherwise the manifest's `latest` Saga (or the pinned one).
 */
async function selectTarget(): Promise<Selection> {
  const raw = await fetchManifestRaw();
  const chosen = selectedEntry(resolveCatalog(raw).entries, Storage.getSelectedModel());
  if (chosen && adapterRunnable(chosen.spec, appCaps())) {
    log('selected', chosen.id, '(user choice)');
    return { spec: chosen.spec, source: 'manifest', reason: 'user choice' };
  }
  const sel = selectModel(parseManifest(raw, 'main'), appCaps(), PINNED_MODEL);
  log('selected', sel.spec.version, `(${sel.source}: ${sel.reason})`);
  return sel;
}

// ─── App state ────────────────────────────────────────────────────────────────

let _foregroundWaiters: (() => void)[] = [];
let _offlineTimer: ReturnType<typeof setTimeout> | null = null;

function waitForForeground(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((r) => { _foregroundWaiters.push(r); });
}

/** Forwarded from the root layout's AppState listener. */
export function handleModelAppState(next: AppStateStatus): void {
  if (!remoteEnabled || next !== 'active') return;
  const waiters = _foregroundWaiters;
  _foregroundWaiters = [];
  waiters.forEach((w) => w());
  // Back in the app after a failure: the network or storage may be fine now.
  if (isFailurePhase(useModelSetup.getState().phase)) startModelSetup();
}

function scheduleOfflineRetry() {
  if (_offlineTimer) clearTimeout(_offlineTimer);
  _offlineTimer = setTimeout(() => {
    _offlineTimer = null;
    if (useModelSetup.getState().phase === 'offline' && AppState.currentState === 'active') startModelSetup();
  }, OFFLINE_RETRY_MS);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Setup ────────────────────────────────────────────────────────────────────

let _running: Promise<void> | null = null;
/** A Settings model switch owns the models folder (utils/model-switch.ts). */
let _switching = false;

/**
 * Called by utils/model-switch.ts around a switch: waits out a setup run in
 * progress, and keeps setup from starting until the switch ends.
 */
export async function beginModelSwitch(): Promise<void> {
  _switching = true;
  if (_running) await _running.catch(() => {});
}

export function endModelSwitch(): void {
  _switching = false;
}

/** Idempotent: starts setup unless it is running; resolves when it stops. */
export function startModelSetup(): Promise<void> {
  if (!remoteEnabled || _switching) return Promise.resolve();
  if (_running) return _running;
  _running = run()
    .catch((e) => {
      log('setup crashed', errorMessage(e));
      dispatch({ type: 'failed', phase: 'error', message: errorMessage(e) });
    })
    .finally(() => { _running = null; });
  return _running;
}

/** Retry button. */
export function retryModelSetup(): void {
  startModelSetup();
}

/** What Settings → On-device model shows: the installed version and its size on disk. */
export type ModelInfo = { version: string | null; bytes: number; installedAt: string | null };

export function getModelInfo(): ModelInfo {
  const marker = readMarker();
  if (marker) {
    return {
      version: marker.version,
      bytes: marker.files.reduce((n, f) => n + (f.size || 0), 0),
      installedAt: marker.installedAt ?? null,
    };
  }
  return { version: useModelSetup.getState().version, bytes: totalBytes(PINNED_MODEL), installedAt: null };
}

/**
 * Settings → "Re-download": unloads the model, deletes every installed copy
 * and its install record, then runs setup again (the pill / chat show the
 * progress). For a damaged install; chats keep working on deterministic
 * answers and wait for the model meanwhile.
 */
export async function redownloadModel(): Promise<void> {
  if (!remoteEnabled || _switching) return;
  if (_running) await _running.catch(() => {});
  try {
    await (require('./local-llm') as typeof import('./local-llm')).unloadLocalLLM();
  } catch { /* not loaded */ }
  Storage.clearModelInstall();
  Storage.clearModelResume();
  await cleanupVersions([]);
  // Nothing installed now: back to the build's default adapter, which waits for the download.
  setActiveAdapter(null);
  useModelSetup.setState({ ...INITIAL_SETUP_STATE });
  startModelSetup();
}

async function run(): Promise<void> {
  dispatch({ type: 'check' });
  const caps = appCaps();

  // 1. A verified install (size check only).
  const marker = readMarker();
  if (marker) {
    const sizes: Record<string, number | null> = {};
    for (const f of marker.files) sizes[f.name] = await sizeOf(docPath(`${versionDir(marker.version)}/${f.name}`));
    if (markerUsable(marker, sizes, caps)) {
      activateInstalledAdapter(marker);
      dispatch({ type: 'ready', version: marker.version });
      if (isModelReady()) dismissModelOverlay();
      // Over-the-air update: fetch a newer compatible model in the background.
      // It takes effect the next time the model loads; the old files go at
      // the next launch (they may be open in the runner now).
      const sel = await selectTarget();
      // Only a newer build of the same kind of model updates silently: a
      // different model (a user's switch) goes through Settings, which
      // clears the chats the old model wrote.
      const sameKind = adapterOf(sel.spec, caps) === adapterOf(marker, caps);
      if (sameKind && sel.spec.version !== marker.version && !markerMatchesSpec(marker, sel.spec)) {
        await cleanupVersions([marker.version, sel.spec.version]);
        await installWithRetries(sel, true);
      } else {
        await cleanupVersions([marker.version]);
      }
      return;
    }
    log('install marker unusable; re-checking', marker.version);
    // Installed with an adapter this build can't run: answer from templates
    // until the supported model below is installed.
    if (!adapterRunnable(marker, caps)) activateInstalledAdapter(marker);
    Storage.clearModelInstall();
  }

  // 2. Not installed. A complete pinned copy already on disk (an Android
  //    build that bundled the model copied it to models/<version>) is
  //    verified and used without a download; anything newer follows silently.
  const sel = await selectTarget();
  const primary: Selection = sel.spec.version !== PINNED_MODEL.version && (await hasCompleteCopy(PINNED_MODEL))
    ? { spec: PINNED_MODEL, source: 'pinned', reason: 'complete copy on disk' }
    : sel;
  await cleanupVersions([primary.spec.version, sel.spec.version]);
  if (primary.spec.version === PINNED_MODEL.version) await seedFromBundle(PINNED_MODEL);

  const ok = await installWithRetries(primary, false);
  if (ok && primary.spec.version !== sel.spec.version) await installWithRetries(sel, true);
}

class NoSpaceError extends Error {
  constructor(readonly neededBytes: number) { super(`not enough space: need ${neededBytes} bytes`); }
}

/**
 * Download + verify + install `initial`, retrying per decideAfterError.
 * `silent` (background update) never touches the visible state.
 */
async function installWithRetries(initial: Selection, silent: boolean): Promise<boolean> {
  let sel = initial;
  let attempt = 0;
  for (;;) {
    try {
      await downloadAndInstall(sel.spec, silent);
      return true;
    } catch (e) {
      if (e instanceof NoSpaceError) {
        log('no space', e.neededBytes);
        if (!silent) dispatch({ type: 'no-space', neededBytes: e.neededBytes });
        return false;
      }
      const kind = classifyError(e);
      const decision = decideAfterError({
        kind, attempt, appActive: AppState.currentState === 'active',
        usingPinned: sel.source === 'pinned', jitter: Math.random(),
      });
      log(`${sel.spec.version}: ${errorMessage(e)} [${kind}] -> ${decision.action}`);
      switch (decision.action) {
        case 'retry':
          if (!silent) dispatch({ type: 'retrying' });
          attempt++;
          await sleep(decision.delayMs);
          continue;
        case 'wait-foreground':
          if (!silent) dispatch({ type: 'retrying' });
          await waitForForeground();
          continue;
        case 'fallback-pinned':
          if (silent) return false; // the installed model keeps working
          sel = { spec: PINNED_MODEL, source: 'pinned', reason: 'manifest model unavailable' };
          // A chosen model that can't be fetched any more: back to Saga for good.
          Storage.clearSelectedModel();
          attempt = 0;
          await cleanupVersions([PINNED_MODEL.version]);
          continue;
        case 'fail':
          if (silent) return false;
          if (decision.phase === 'no-space') {
            dispatch({ type: 'no-space', neededBytes: 0 });
          } else {
            dispatch({ type: 'failed', phase: decision.phase, message: errorMessage(e) });
            if (decision.phase === 'offline') scheduleOfflineRetry();
          }
          return false;
      }
    }
  }
}

/** All files of `spec` present at their final names with the right sizes. */
async function hasCompleteCopy(spec: ModelSpec): Promise<boolean> {
  for (const f of spec.files) {
    if ((await sizeOf(docPath(`${versionDir(spec.version)}/${basename(f.path)}`))) !== f.size) return false;
  }
  return true;
}

/**
 * Builds made before the switch (or a native project not re-prebuilt) still
 * carry the pinned files in the app bundle / APK assets. Copy them in; the
 * normal verification decides whether they're used.
 */
async function seedFromBundle(spec: ModelSpec): Promise<void> {
  const dir = versionDir(spec.version);
  for (const f of spec.files) {
    const name = basename(f.path);
    const dest = docPath(`${dir}/${name}`);
    if ((await sizeOf(dest)) === f.size) continue;
    const src = Platform.OS === 'ios' ? `${fs.dirs.MainBundleDir}/${name}` : fs.asset(`models/${name}`);
    try {
      if (!(await fs.exists(src))) return;
      if (Platform.OS === 'ios' && (await sizeOf(src)) !== f.size) return;
      await ensureDir(dir);
      log('seeding from app bundle', name);
      await unlinkQuiet(dest);
      await fs.cp(src, `${dest}.part`);
      await fs.mv(`${dest}.part`, dest);
    } catch (e) {
      log('bundle seed failed', name, errorMessage(e));
      await unlinkQuiet(`${dest}.part`);
      await unlinkQuiet(dest);
      return;
    }
  }
}

type FileJob = {
  file: ModelFile;
  name: string;
  url: string;
  finalPath: string;
  partRel: string;
  partPath: string;
  /** Already at its final name with the right size (needs only hashing). */
  atFinal: boolean;
  plan: ResumePlan;
  have: number;
  /** Its iOS resume checkpoint record. */
  store: ResumeStore;
};

/**
 * Cancels a download from outside (Settings model switch). The running
 * DownloadTask is cancelled; the download rejects with a "cancelled" error.
 */
export type DownloadControl = {
  cancelled: boolean;
  task: DownloadTask | null;
  /** iOS: checkpoint resume data every CHECKPOINT_BYTES (to model_switch_resume_v1) so a kill loses little. */
  checkpoints: boolean;
};

export class DownloadCancelledError extends Error {
  constructor() { super('download cancelled'); this.name = 'AbortError'; }
}

/** Plan each file of `spec`: what is already on disk, and how to resume the rest. */
async function prepareJobs(spec: ModelSpec, store: ResumeStore): Promise<FileJob[]> {
  const dir = versionDir(spec.version);
  await ensureDir(dir);
  await excludeFromBackup(MODELS_DIR);
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  // Leftovers in the version folder that aren't ours (old ".tmp" copies).
  const expected = new Set(spec.files.flatMap((f) => [basename(f.path), `${basename(f.path)}.part`]));
  try {
    for (const name of await fs.ls(docPath(dir))) {
      if (!expected.has(name)) await unlinkQuiet(docPath(`${dir}/${name}`));
    }
  } catch { /* ignore */ }

  // Small files first so the big one's progress dominates the bar.
  const files = [...spec.files].sort((a, b) => a.size - b.size);
  const jobs: FileJob[] = [];
  for (const file of files) {
    const name = basename(file.path);
    const url = fileUrl(HF_BASE, HF_REPO, spec, file);
    const finalPath = docPath(`${dir}/${name}`);
    const partRel = `${dir}/${name}.part`;
    const partPath = docPath(partRel);
    const finalSize = await sizeOf(finalPath);
    if (finalSize === file.size) {
      jobs.push({ file, name, url, finalPath, partRel, partPath, atFinal: true, plan: { kind: 'complete' }, have: file.size, store });
      continue;
    }
    if (finalSize != null) await unlinkQuiet(finalPath);
    const plan = planFileResume({
      platform, expectedSize: file.size, partialSize: await sizeOf(partPath),
      saved: store.read(), url, version: spec.version, name,
    });
    if (plan.kind === 'fresh') {
      if (plan.deletePartial) await unlinkQuiet(partPath);
      if (plan.dropSaved) store.clear();
    }
    const have = plan.kind === 'complete' ? file.size : plan.kind === 'resume' ? plan.from : 0;
    if (plan.kind === 'resume') log('resuming', name, 'from', have, 'bytes');
    jobs.push({ file, name, url, finalPath, partRel, partPath, atFinal: false, plan, have, store });
  }
  return jobs;
}

/** Throws NoSpaceError unless the rest of the download fits (with headroom). */
function checkSpace(jobs: FileJob[]): void {
  const shortfall = spaceShortfall(
    remainingBytes(jobs.map((j) => ({ size: j.file.size, have: j.have }))),
    availableSpace(),
  );
  if (shortfall > 0) throw new NoSpaceError(shortfall);
}

/** Download every job not yet complete; `onReceived` gets bytes across all files. */
async function fetchJobs(version: string, jobs: FileJob[], onReceived: (bytes: number) => void, ctl?: DownloadControl): Promise<void> {
  let done = 0;
  for (const job of jobs) {
    if (ctl?.cancelled) throw new DownloadCancelledError();
    if (job.plan.kind !== 'complete') {
      const base = done;
      await downloadOne(version, job, (bytes) => onReceived(base + bytes), ctl);
    }
    done += job.file.size;
    onReceived(done);
  }
}

/** Size + SHA-256 of every file; a bad one is deleted and the whole set rejected. */
async function verifyJobs(jobs: FileJob[], ctl?: DownloadControl): Promise<void> {
  for (const job of jobs) {
    if (ctl?.cancelled) throw new DownloadCancelledError();
    const path = job.atFinal ? job.finalPath : job.partPath;
    const size = await sizeOf(path);
    const sha256 = size === job.file.size ? await fs.hash(path, 'sha256') : null;
    const result = verifyFile(job.file, { size, sha256 });
    if (result !== 'ok') {
      // A bad file never resumes: delete it and its checkpoint.
      await unlinkQuiet(path);
      job.store.clear();
      throw new Error(`verification failed for ${job.name}: ${result}`);
    }
  }
}

/** Verified .part files to their final names. */
async function promoteJobs(jobs: FileJob[]): Promise<void> {
  for (const job of jobs) {
    if (job.atFinal) continue;
    await unlinkQuiet(job.finalPath);
    await fs.mv(job.partPath, job.finalPath);
  }
}

async function downloadAndInstall(spec: ModelSpec, silent: boolean): Promise<void> {
  const jobs = await prepareJobs(spec, SETUP_RESUME);
  checkSpace(jobs);

  const total = totalBytes(spec);
  if (!silent) dispatch({ type: 'download-start', version: spec.version, received: jobs.reduce((n, j) => n + j.have, 0), total });
  await fetchJobs(spec.version, jobs, (received) => {
    if (!silent) dispatch({ type: 'progress', received });
  });

  // Verify everything before anything is committed.
  if (!silent) dispatch({ type: 'verify' });
  await verifyJobs(jobs);
  await promoteJobs(jobs);

  const marker = markerFor(spec, new Date());
  Storage.setModelInstall(JSON.stringify(marker));
  Storage.clearModelResume();
  log('installed', spec.version, silent ? '(background update, used on next load)' : '');
  // A background update switches the adapter when its model is next loaded
  // (awaitInstalledModelFiles); a first install is used right away.
  if (silent) return;
  activateInstalledAdapter(marker);

  dispatch({ type: 'ready', version: spec.version });
  // Old versions are deleted now on first install (nothing has them open).
  await cleanupVersions([spec.version]);
  warmModel();
}

/**
 * Warm the model so the first chart reading / chat doesn't wait on it (and
 * so screens waiting on the LLM state re-run). Finished in the background:
 * warm it when the app comes back, not while suspended.
 */
function warmModel(): void {
  waitForForeground().then(() => {
    (require('./local-llm') as typeof import('./local-llm')).initLocalLLM().catch(() => {});
  });
}

// ─── Settings model switch (utils/model-switch.ts drives these) ──────────────

export { NoSpaceError };

/**
 * Download and verify `spec` into models/<version>/ next to the installed
 * model, without touching it or its install record. Throws NoSpaceError,
 * DownloadCancelledError (ctl.cancelled), network / HTTP errors or
 * "verification failed"; partial files (and the iOS checkpoint) are kept for
 * a retry or a later resume, so a second call continues where this one
 * stopped (Android: HTTP Range from the .part size; iOS: resume data).
 */
export async function downloadForSwitch(
  spec: ModelSpec,
  ctl: DownloadControl,
  on: { start: (received: number, total: number) => void; progress: (received: number) => void; verify: () => void },
): Promise<void> {
  if (!remoteEnabled) throw new Error('on-device models are not available here');
  const jobs = await prepareJobs(spec, SWITCH_RESUME);
  checkSpace(jobs);
  on.start(jobs.reduce((n, j) => n + j.have, 0), totalBytes(spec));
  await fetchJobs(spec.version, jobs, on.progress, ctl);
  if (ctl.cancelled) throw new DownloadCancelledError();
  on.verify();
  await verifyJobs(jobs, ctl);
  if (ctl.cancelled) throw new DownloadCancelledError();
  await promoteJobs(jobs);
}

/**
 * The commit of a switch: unloads the running model, writes the new install
 * record (from here on the new model is the installed one), activates its
 * adapter, deletes every other version's files and warms the new model.
 * `spec` must have been through downloadForSwitch.
 */
export async function commitSwitchedModel(spec: ModelSpec): Promise<void> {
  try {
    await (require('./local-llm') as typeof import('./local-llm')).unloadLocalLLM();
  } catch { /* not loaded */ }
  const marker = markerFor(spec, new Date());
  Storage.setModelInstall(JSON.stringify(marker));
  Storage.clearModelResume();
  SWITCH_RESUME.clear();
  activateInstalledAdapter(marker);
  useModelSetup.setState({ ...INITIAL_SETUP_STATE, phase: 'ready', version: spec.version, received: totalBytes(spec), total: totalBytes(spec) });
  dismissModelOverlay();
  await cleanupVersions([spec.version]);
  log('switched to', spec.version);
}

/** Warm the switched-to model (after the switch's wipe, so screens re-run on fresh caches). */
export function warmSwitchedModel(): void {
  warmModel();
}

/** Remove a cancelled / failed switch's partial files and checkpoint (the installed model's folder is kept). */
export async function discardSwitchDownload(version: string): Promise<void> {
  SWITCH_RESUME.clear();
  const installed = readMarker()?.version;
  if (version === installed) return;
  await unlinkQuiet(docPath(versionDir(version)));
}

/** Free bytes on the data partition, or null when unknown. */
export function freeDiskBytes(): number | null {
  return availableSpace();
}

/** One file into its .part path, resuming per job.plan. Resolves when complete. */
async function downloadOne(version: string, job: FileJob, onBytes: (bytes: number) => void, ctl?: DownloadControl): Promise<void> {
  const dest = new File(docUri(job.partRel));
  const isIOS = Platform.OS === 'ios';
  let lastCheckpoint = job.plan.kind === 'resume' ? job.plan.from : 0;
  let checkpointing = false;
  let checkpointsWork = ctl ? ctl.checkpoints : true;
  let task: DownloadTask;
  // Register each task with the controller; a cancel requested meanwhile stops it at once.
  const track = (t: DownloadTask): DownloadTask => {
    if (ctl) {
      ctl.task = t;
      if (ctl.cancelled) { try { t.cancel(); } catch { /* not started */ } }
    }
    return t;
  };
  const guard = async (p: Promise<File | null>): Promise<File | null> => {
    try {
      const r = await p;
      if (ctl?.cancelled) throw new DownloadCancelledError();
      return r;
    } catch (e) {
      if (ctl?.cancelled) throw new DownloadCancelledError();
      throw e;
    }
  };

  const options = {
    sessionType: 'background' as const,
    onProgress: ({ bytesWritten }: { bytesWritten: number; totalBytes: number }) => {
      onBytes(bytesWritten);
      // iOS: periodically pause -> save resume data -> resume, so a killed
      // app continues from here instead of from zero.
      if (isIOS && checkpointsWork && !checkpointing && AppState.currentState === 'active'
          && bytesWritten - lastCheckpoint >= CHECKPOINT_BYTES && bytesWritten < job.file.size
          && task.state === 'active') {
        checkpointing = true;
        lastCheckpoint = bytesWritten;
        try { task.pause(); } catch { checkpointing = false; }
      }
    },
  };

  const fresh = () => track(File.createDownloadTask(job.url, dest, options));
  let result: File | null;
  if (job.plan.kind === 'resume') {
    task = track(DownloadTask.fromSavable(
      { url: job.url, fileUri: dest.uri, isDirectory: false, resumeData: job.plan.resumeData },
      options,
    ));
    try {
      result = await guard(task.resumeAsync());
    } catch (e) {
      // Stale iOS resume data (expired redirect, purged temp file) would fail
      // the same way forever; drop it so the retry starts over. Keep it when
      // the network was simply down.
      if (isIOS && !ctl?.cancelled && classifyError(e) !== 'network') job.store.clear();
      throw e;
    }
  } else {
    task = fresh();
    result = await guard(task.downloadAsync());
  }

  // null = paused for a checkpoint.
  while (result === null) {
    checkpointing = false;
    let saved: string | undefined;
    try { saved = task.savable().resumeData; } catch { saved = undefined; }
    if (saved) {
      job.store.write({ version, name: job.name, url: job.url, resumeData: saved, bytes: lastCheckpoint });
      result = await guard(task.resumeAsync());
    } else {
      // The server gave no resume data: stop checkpointing and start over
      // (only the bytes since the start are lost, once).
      log('no resume data; checkpoints disabled for', job.name);
      checkpointsWork = false;
      job.store.clear();
      task = fresh();
      result = await guard(task.downloadAsync());
    }
  }
  if (isIOS) job.store.clear();
  if (ctl) ctl.task = null;
}
