import { AppState, Platform } from 'react-native';
import { Storage } from './storage';
import { detectDeviceTier, type DeviceTier } from './device-tier';
import { hasRoomForDownload, planModels, upgradeRetryDelayMs, type ModelPlan } from './model-plan';

// Each tier maps to the best executorch-supported model that fits that
// device class without crowding out the rest of the app. Keep these stable —
// the `version` strings are persisted on disk and used as cache keys.
//
// ── MODEL SELECTION ──────────────────────────────────────────────────────────
// This table (plus SAMPLING below) is the ONLY place that decides which model
// runs. Swapping a model is a one-line change here; see README "Model
// selection" for the reasoning behind each tier.
type ModelFamily = 'qwen3' | 'lfm2' | 'llama';

type ModelDef = {
  version:    string;
  constant:   string;   // exported name in 'react-native-executorch'
  size:       string;   // human-readable for the UI
  bytes:      number;   // approximate download size — disk check + model ordering
  label:      string;
  family:     ModelFamily;
  writesRecs: boolean;  // asked for a `<recs>` block (see utils/recommendations.ts)
};

const MB = 1024 ** 2;

const MODELS: Record<DeviceTier, ModelDef> = {
  flagship: { version: 'qwen3_1_7b_q',    constant: 'QWEN3_1_7B_QUANTIZED',           size: '~900 MB', bytes: 900 * MB, label: 'Qwen 3 1.7B', family: 'qwen3', writesRecs: true  },
  mid:      { version: 'lfm2_5_1_2b_q',   constant: 'LFM2_5_1_2B_INSTRUCT_QUANTIZED', size: '~700 MB', bytes: 740 * MB, label: 'LFM2.5 1.2B', family: 'lfm2',  writesRecs: true  },
  // LFM2.5 1.2B is the primary model for 4–6 GB devices (was Llama 3.2 1B
  // SpinQuant): better instruction following at similar size, faster decode.
  budget:   { version: 'lfm2_5_1_2b_q',   constant: 'LFM2_5_1_2B_INSTRUCT_QUANTIZED', size: '~700 MB', bytes: 740 * MB, label: 'LFM2.5 1.2B', family: 'lfm2',  writesRecs: true  },
  // The 350M model is too small for reliable structured output — the keyword
  // mapper builds its recommendation cards instead.
  floor:    { version: 'lfm2_5_350m_q',   constant: 'LFM2_5_350M_QUANTIZED',          size: '~200 MB', bytes: 200 * MB, label: 'LFM2.5 350M', family: 'lfm2',  writesRecs: false },
};

/**
 * Progressive loading: a fresh install downloads this small model first (with
 * the blocking overlay) so chat works quickly, then fetches the tier's model
 * in the background and hot-swaps to it. See utils/model-plan.ts.
 */
const STARTER: ModelDef = MODELS.floor;

type SamplingConfig = {
  temperature:       number;
  topP:              number;
  minP?:             number;
  repetitionPenalty: number;
};

/**
 * Sampling per model family — applied both at load time and before every
 * generation, so there is a single source of truth.
 *  - qwen3 : Qwen 3 Instruct's published non-thinking settings. Lower temp +
 *            minP + high repetition penalty pushed the 1.7B model into
 *            "thesaurus walk" loops, so these stay canonical.
 *  - lfm2  : Liquid recommends low temperature for LFM2.5; a light repetition
 *            penalty keeps the 350M/1.2B models from looping.
 *  - llama : kept for anyone who pins it manually in future.
 */
const SAMPLING: Record<ModelFamily, SamplingConfig> = {
  qwen3: { temperature: 0.7, topP: 0.8, minP: 0, repetitionPenalty: 1.0 },
  lfm2:  { temperature: 0.3, topP: 0.9,          repetitionPenalty: 1.05 },
  llama: { temperature: 0.6, topP: 0.9,          repetitionPenalty: 1.1 },
};

// The model that is actually loaded in RAM (differs from the preference while
// a starter model runs or during a swap). null when nothing is loaded.
let _loadedFamily:  ModelFamily | null = null;
let _loadedVersion: string | null      = null;

function applySampling(mod: import('react-native-executorch').LLMModule): void {
  const cfg = SAMPLING[_loadedFamily ?? getActiveModelInfo().def.family];
  try {
    mod.configure({ generationConfig: { ...cfg } });
  } catch {
    // non-fatal; model falls back to its own defaults
  }
}

function selectedTier(): DeviceTier {
  const explicit = Storage.getPreferredModelTier();
  if (explicit && explicit !== 'auto') {
    if (explicit in MODELS) return explicit as DeviceTier;
  }
  return detectDeviceTier();
}

function desiredModel(): ModelDef {
  return MODELS[selectedTier()];
}

function defOf(version: string): ModelDef | null {
  return Object.values(MODELS).find((d) => d.version === version) ?? null;
}

export function getModelCatalog(): Record<DeviceTier, ModelDef> {
  return MODELS;
}

/** The model the user/device tier WANTS (may not be downloaded yet). */
export function getCurrentModelInfo(): { tier: DeviceTier; def: ModelDef; auto: boolean } {
  const tier = selectedTier();
  return { tier, def: MODELS[tier], auto: Storage.getPreferredModelTier() === 'auto' };
}

/**
 * The model prompts must be written for: the one in RAM, or — when nothing is
 * loaded — the one the next load will pick. Recs prompting, `/no_think` and
 * UI labels follow this, never the desired model.
 */
export function getActiveModelInfo(): { def: ModelDef; isTarget: boolean } {
  const plan    = currentPlan();
  const version = _loadedVersion ?? plan.load ?? plan.foreground;
  const def     = (version && defOf(version)) || desiredModel();
  return { def, isTarget: def.version === desiredModel().version };
}

// ─── What's on disk ───────────────────────────────────────────────────────────

// Versions that failed to load this session (e.g. out of memory) — skipped
// by the planner until next launch so we don't loop on a bad swap.
const _loadFailed = new Set<string>();

function modelsOnDisk(): string[] {
  return Storage.getModelsOnDisk().filter((v) => defOf(v) !== null);
}

function markOnDisk(version: string, present: boolean): void {
  const all  = Storage.getModelsOnDisk().filter((v) => v !== version);
  Storage.setModelsOnDisk(present ? [...all, version] : all);
}

export function isModelOnDisk(version: string): boolean {
  return modelsOnDisk().includes(version);
}

function currentPlan(): ModelPlan {
  return planModels({
    target:  desiredModel().version,
    starter: STARTER.version,
    onDisk:  modelsOnDisk().filter((v) => !_loadFailed.has(v)),
    sizeOf:  (v) => defOf(v)?.bytes ?? Number.MAX_SAFE_INTEGER,
  });
}

// ─── Library access (lazy — keeps executorch off the home screen) ────────────

type Executorch = typeof import('react-native-executorch');
type Fetcher    = typeof import('react-native-executorch-expo-resource-fetcher').ExpoResourceFetcher;
type NamedLLM   = { modelSource: string; tokenizerSource: string; tokenizerConfigSource: string };

function lib(): { executorch: Executorch; fetcher: Fetcher } {
  const executorch = require('react-native-executorch') as Executorch;
  const { ExpoResourceFetcher } =
    require('react-native-executorch-expo-resource-fetcher') as
    typeof import('react-native-executorch-expo-resource-fetcher');
  executorch.initExecutorch({ resourceFetcher: ExpoResourceFetcher });
  return { executorch, fetcher: ExpoResourceFetcher };
}

function namedSources(executorch: Executorch, def: ModelDef): NamedLLM {
  const named = (executorch as unknown as Record<string, unknown>)[def.constant] as NamedLLM | undefined;
  if (!named) throw new Error(`Model constant missing in react-native-executorch: ${def.constant}`);
  return named;
}

function sourcesOf(executorch: Executorch, def: ModelDef): string[] {
  const n = namedSources(executorch, def);
  return [n.modelSource, n.tokenizerSource, n.tokenizerConfigSource];
}

async function freeDiskBytes(): Promise<number | null> {
  try {
    const fs = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    return await fs.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

/**
 * Sync the persisted on-disk list with the files the fetcher actually has.
 * The fetcher only moves a file into its directory after a complete download,
 * so "all three files present" means the model is usable. Catches models from
 * earlier builds/picker switches and files the OS or user removed.
 */
async function reconcileModelsOnDisk(): Promise<void> {
  try {
    const { executorch, fetcher } = lib();
    const files = new Set((await fetcher.listDownloadedFiles()).map((f) => f.split('/').pop()));
    const getName = executorch.ResourceFetcherUtils.getFilenameFromUri;
    const seen = new Set<string>();
    for (const def of Object.values(MODELS)) {
      if (seen.has(def.version)) continue;
      seen.add(def.version);
      const complete = sourcesOf(executorch, def).every((src) => files.has(getName(src)));
      if (complete !== isModelOnDisk(def.version)) markOnDisk(def.version, complete);
    }
  } catch {
    // Directory missing or unreadable — keep the persisted list as-is.
  }
}

// ─── Foreground state (drives the blocking overlay) ───────────────────────────

export type LLMState =
  | { status: 'idle' }
  | { status: 'downloading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string; reason?: 'low-storage' };

// Initialized synchronously at import time — before any component mounts.
// If a usable model is on disk from a previous session, starts as 'ready' so
// the overlay never renders.
let _state: LLMState =
  Platform.OS !== 'web' && currentPlan().load
    ? { status: 'ready' }
    : { status: 'idle' };
let _module: import('react-native-executorch').LLMModule | null = null;

type Listener = (state: LLMState) => void;
const _listeners = new Set<Listener>();

function setState(next: LLMState) {
  _state = next;
  _listeners.forEach(fn => fn(next));
}

export function getLLMState(): LLMState { return _state; }

export function subscribeToLLMState(fn: Listener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// ─── Background upgrade state (drives the quiet "Upgrading Saga…" hint) ──────

export type UpgradeState =
  | { status: 'none' }
  | { status: 'downloading'; progress: number; label: string }
  | { status: 'paused'; reason: 'retry' | 'low-storage'; label: string };

let _upgrade: UpgradeState = { status: 'none' };
const _upgradeListeners = new Set<(s: UpgradeState) => void>();

function setUpgrade(next: UpgradeState) {
  _upgrade = next;
  _upgradeListeners.forEach(fn => fn(next));
}

export function getUpgradeState(): UpgradeState { return _upgrade; }

export function subscribeToUpgradeState(fn: (s: UpgradeState) => void): () => void {
  _upgradeListeners.add(fn);
  return () => { _upgradeListeners.delete(fn); };
}

export function getLLMModule() { return _module; }

export function isLLMReady(): boolean {
  return _state.status === 'ready' && _module !== null;
}

/**
 * If a usable model is on disk, waits for it to load into memory before
 * returning. Falls back gracefully if load fails.
 * If nothing is on disk, kicks off the starter download and returns false
 * immediately.
 *
 * `timeoutMs` caps how long the caller will wait for a disk-cached load to
 * finish. If the load takes longer, returns `false`; the load continues in the
 * background and will be ready for the next message.
 */
export async function ensureLocalLLM(timeoutMs?: number): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (isLLMReady()) return true;
  if (!currentPlan().load) {
    // Not on disk yet — start the download, don't block the caller
    initLocalLLM().catch(() => {});
    return false;
  }
  // Model is on disk — wait for any hot swap, then for the load (typically <2s)
  const loadPromise = (async () => {
    if (_swapPromise) await _swapPromise.catch(() => {});
    await initLocalLLM();
  })().catch(() => {});
  if (timeoutMs == null) {
    await loadPromise;
  } else {
    await Promise.race([
      loadPromise,
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  }
  return isLLMReady();
}

let _initPromise: Promise<void> | null = null;

/**
 * Load one model into RAM. `silent` = it's already on disk, so no overlay;
 * otherwise the fetcher downloads it with overlay progress first.
 */
async function loadModel(target: ModelDef, silent: boolean): Promise<void> {
  if (!silent) {
    setState({ status: 'downloading', progress: 0 });
    if (!hasRoomForDownload(await freeDiskBytes(), target.bytes)) {
      setState({
        status:  'error',
        reason:  'low-storage',
        message: `Saga needs about ${target.size} of free space to download. Free up some storage and reopen the app.`,
      });
      throw new Error('low-storage');
    }
  }

  try {
    const { executorch } = lib();
    const mod = await executorch.LLMModule.fromModelName(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      namedSources(executorch, target) as any,
      (progress: number) => {
        if (!silent) setState({ status: 'downloading', progress });
      },
    );
    _module        = mod;
    _loadedVersion = target.version;
    // Per-family sampling (see SAMPLING). Same values runLocalLLM applies
    // before each generation, so load-time and run-time never disagree.
    _loadedFamily  = target.family;
    applySampling(mod);

    markOnDisk(target.version, true);
    setState({ status: 'ready' });
  } catch (e) {
    if (silent) {
      // On disk but won't load (usually memory pressure on a swap). Skip it
      // for this session; the caller falls back to the next-best model.
      _loadFailed.add(target.version);
    } else {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
    throw e;
  }
}

export function initLocalLLM(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (_initPromise) return _initPromise;
  if (_module) return Promise.resolve();   // never load a second LLM

  _initPromise = (async () => {
    // Load the best model already on disk. If it fails, the planner drops it
    // and offers the next one; with nothing left, download the starter.
    for (;;) {
      const plan = currentPlan();
      if (plan.load) {
        const def = defOf(plan.load)!;
        try {
          await loadModel(def, /* silent */ true);
          break;
        } catch {
          continue;
        }
      }
      if (!plan.foreground) throw new Error('No model available');
      await loadModel(defOf(plan.foreground)!, /* silent */ false);
      break;
    }
    afterLoad();
  })().catch((e) => {
    _initPromise = null;
    throw e;
  });

  return _initPromise;
}

/** Post-load housekeeping: resume/start the upgrade, free the starter. */
function afterLoad(): void {
  const plan = currentPlan();
  if (plan.background) {
    maybeStartUpgrade();
  } else if (_loadedVersion === desiredModel().version && plan.removable.length > 0) {
    removeModels(plan.removable).catch(() => {});
  }
}

/**
 * Delete models that are no longer needed (the starter, once the target has
 * loaded successfully). Uses the fetcher's own `deleteResources`, which only
 * removes files inside its download directory. Never touches the model in RAM.
 */
async function removeModels(versions: string[]): Promise<void> {
  const { executorch, fetcher } = lib();
  for (const version of versions) {
    const def = defOf(version);
    if (!def || version === _loadedVersion) continue;
    // Forget it first: a crash mid-delete must not leave a half-deleted model
    // marked as loadable (boot-time reconciliation re-checks the files).
    markOnDisk(version, false);
    await fetcher.deleteResources(...sourcesOf(executorch, def));
  }
}

/**
 * Entry point from app start. First run → download the starter with the
 * overlay. Later runs → nothing loads into RAM until a chat needs it, but an
 * unfinished upgrade (app killed/backgrounded mid-download) restarts.
 */
export function bootLocalLLM(): void {
  if (Platform.OS === 'web') return;
  reconcileModelsOnDisk().finally(() => {
    if (!currentPlan().load) {
      if (_state.status === 'ready') setState({ status: 'idle' });
      initLocalLLM().catch(() => {});
      return;
    }
    maybeStartUpgrade(UPGRADE_START_DELAY_MS);
  });
}

// ─── Background upgrade ───────────────────────────────────────────────────────
//
// Downloads the target model's files WITHOUT loading them (only the fetcher
// runs, so RAM holds at most one LLM), then hot-swaps when chat is idle.
// Failures back off quietly (see upgradeRetryDelayMs) — no error UI.

const UPGRADE_START_DELAY_MS = 5_000;   // let app start-up settle first

let _upgradeRun: { version: string; epoch: number } | null = null;
let _upgradeEpoch    = 0;
let _upgradeAttempts = 0;
let _upgradeTimer: ReturnType<typeof setTimeout> | null = null;

/** Start (or resume) the background upgrade if one is due. Idempotent. */
export function resumeModelUpgrade(): void {
  maybeStartUpgrade(UPGRADE_START_DELAY_MS);
}

function maybeStartUpgrade(delayMs = 0): void {
  if (Platform.OS === 'web') return;
  if (_upgradeRun || _upgradeTimer) return;
  const plan = currentPlan();
  if (!plan.background) {
    if (_upgrade.status !== 'none') setUpgrade({ status: 'none' });
    return;
  }
  // Nothing usable yet → the blocking starter download owns the network.
  if (!plan.load) return;
  if (delayMs > 0) {
    _upgradeTimer = setTimeout(() => { _upgradeTimer = null; maybeStartUpgrade(); }, delayMs);
    return;
  }
  const def = defOf(plan.background);
  if (def) runUpgrade(def).catch(() => {});
}

function scheduleUpgradeRetry(label: string, reason: 'retry' | 'low-storage'): void {
  if (_upgradeTimer) clearTimeout(_upgradeTimer);
  setUpgrade({ status: 'paused', reason, label });
  const delay = upgradeRetryDelayMs(_upgradeAttempts++);
  _upgradeTimer = setTimeout(() => { _upgradeTimer = null; maybeStartUpgrade(); }, delay);
}

async function runUpgrade(target: ModelDef): Promise<void> {
  const epoch = ++_upgradeEpoch;
  _upgradeRun = { version: target.version, epoch };
  const live  = () => epoch === _upgradeEpoch;
  try {
    if (!hasRoomForDownload(await freeDiskBytes(), target.bytes)) {
      if (live()) scheduleUpgradeRetry(target.label, 'low-storage');
      return;
    }

    // Sequence downloads: the small embeddings model (RAG) first, so a chat
    // during the upgrade finds it on disk instead of racing the big download.
    await prefetchEmbeddings();
    if (!live()) return;

    const { executorch } = lib();
    let shown = -1;
    setUpgrade({ status: 'downloading', progress: 0, label: target.label });
    const paths = await executorch.ResourceFetcher.fetch(
      (progress: number) => {
        const pct = Math.floor(progress * 100);
        if (!live() || pct === shown) return;   // re-render at most once per %
        shown = pct;
        setUpgrade({ status: 'downloading', progress, label: target.label });
      },
      ...sourcesOf(executorch, target),
    );

    if (paths) markOnDisk(target.version, true);
    if (!live()) return;                         // cancelled by a model switch
    if (!paths) {                                // interrupted — try again later
      scheduleUpgradeRetry(target.label, 'retry');
      return;
    }

    _upgradeAttempts = 0;
    setUpgrade({ status: 'none' });
    await swapToBestModel();
  } catch {
    if (live()) scheduleUpgradeRetry(target.label, 'retry');
  } finally {
    if (_upgradeRun?.epoch === epoch) _upgradeRun = null;
  }
}

/** Stop an in-flight or scheduled upgrade (e.g. the user picked another model). */
async function cancelUpgrade(): Promise<void> {
  if (_upgradeTimer) { clearTimeout(_upgradeTimer); _upgradeTimer = null; }
  _upgradeAttempts = 0;
  const run = _upgradeRun;
  _upgradeEpoch++;                 // invalidates the running download's callbacks
  _upgradeRun = null;
  setUpgrade({ status: 'none' });
  if (!run) return;
  const def = defOf(run.version);
  if (!def) return;
  try {
    const { executorch, fetcher } = lib();
    await fetcher.cancelFetching(...sourcesOf(executorch, def));
  } catch {
    // Between files or already finished — the stale run is ignored anyway.
  }
}

async function prefetchEmbeddings(): Promise<void> {
  try {
    const rag = require('./rag') as typeof import('./rag');
    await rag.prefetchEmbeddingModel();
  } catch {
    // RAG falls back to hash embeddings; never blocks the upgrade.
  }
}

// ─── Hot swap ─────────────────────────────────────────────────────────────────

let _swapPromise: Promise<void> | null = null;

/**
 * Replace the model in RAM with the best one on disk. Never mid-reply: waits
 * for any load and generation to finish, releases the old module first (never
 * two LLMs in RAM), then loads the new one. runLocalLLM waits on the swap, so
 * a message sent meanwhile just sees "Saga is waking up" a little longer.
 */
function swapToBestModel(): Promise<void> {
  if (_swapPromise) return _swapPromise;
  _swapPromise = (async () => {
    if (_initPromise) await _initPromise.catch(() => {});
    while (_activeGeneration) {
      try { await _activeGeneration; } catch {}
    }
    // Nothing in RAM → the next load picks the best model on its own.
    if (!_module) return;
    if (currentPlan().load === _loadedVersion) { afterLoad(); return; }
    releaseModule();
    // In the background, just free the old model — the next chat loads the
    // new one. In the foreground, load it now so the next reply is instant.
    if (AppState.currentState !== 'active') return;
    await initLocalLLM().catch(() => {});
    scheduleIdleUnload();
  })().finally(() => { _swapPromise = null; });
  return _swapPromise;
}

function releaseModule(): void {
  const mod = _module;
  _module        = null;
  _initPromise   = null;
  _loadedVersion = null;
  _loadedFamily  = null;
  if (mod) {
    try { mod.delete(); } catch {}
  }
}

/**
 * Release the model from RAM without touching disk.
 * _state stays 'ready' so the overlay never re-appears.
 * ensureLocalLLM() reloads the best model on disk (~2–5 s) on next chat.
 */
export async function unloadLocalLLM(): Promise<void> {
  cancelIdleUnload();
  if (!_module) {
    // A swap may be loading the next model right now; if the app went to the
    // background meanwhile, release that model as soon as it's in.
    _swapPromise?.then(() => {
      if (AppState.currentState !== 'active') unloadLocalLLM().catch(() => {});
    });
    return;
  }
  const mod = _module;
  // Interrupt any in-progress generation before deleting
  if (_activeGeneration) {
    try { mod.interrupt(); } catch {}
    try { await _activeGeneration; } catch {}
  }
  if (_module === mod) releaseModule();
}

// ─── Idle-unload timer ────────────────────────────────────────────────────────
//
// The on-device model uses 0.5–2 GB of RAM depending on tier. If the user
// hasn't sent a chat message for a few minutes, we release that memory; the
// next chat triggers a fresh load from disk (~2–5 s) automatically.

const IDLE_UNLOAD_MS = 3 * 60 * 1000;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleUnload() {
  cancelIdleUnload();
  if (Platform.OS === 'web') return;
  _idleTimer = setTimeout(() => {
    _idleTimer = null;
    // Re-check active generation right before unloading — by the time the
    // timer fires, a new chat may have started. Defer instead of bailing
    // outright so we don't leave the model loaded indefinitely.
    if (_activeGeneration) {
      scheduleIdleUnload();
      return;
    }
    unloadLocalLLM().catch(() => {});
  }, IDLE_UNLOAD_MS);
}

function cancelIdleUnload() {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
}

/**
 * Switch the on-device model by tier (or 'auto' to follow the detected device
 * tier). If a usable model is on disk, chat keeps working on it: the new
 * choice downloads in the background and swaps in when idle. Only when
 * nothing usable is on disk does the blocking overlay download the starter.
 */
export async function switchModel(preference: 'auto' | DeviceTier): Promise<void> {
  if (Platform.OS === 'web') return;

  Storage.setPreferredModelTier(preference);
  const target = desiredModel();

  // An upgrade fetching a model we no longer want stops; a matching one
  // keeps going. Either way the new choice gets a fresh retry budget.
  if (_upgradeRun && _upgradeRun.version !== target.version) {
    await cancelUpgrade();
  } else if (_upgradeTimer) {
    clearTimeout(_upgradeTimer);
    _upgradeTimer    = null;
    _upgradeAttempts = 0;
  }

  if (currentPlan().load) {
    await swapToBestModel();
    maybeStartUpgrade();
    return;
  }

  // Nothing usable on disk. If a chat is mid-generation, let it finish before
  // we yank the model out from under it, then go through the first-run path.
  await unloadLocalLLM();
  if (_state.status !== 'downloading') setState({ status: 'idle' });
  initLocalLLM().catch(() => {});
}

// Serialize generations — the native module handles one at a time.
let _activeGeneration: Promise<string> | null = null;

export async function runLocalLLM(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  tokenCallback: (token: string) => void,
): Promise<string> {
  // Synchronously cancel any pending idle-unload BEFORE awaiting anything,
  // so a timer that fires in the same tick can't unload mid-init.
  cancelIdleUnload();
  // Wait until the module is loaded, no swap is pending and no other
  // generation is running. Re-check after every await: a swap or unload may
  // have replaced the module meanwhile. If the module was unloaded (idle
  // timer, backgrounding, swap), re-init it — the user just sees a slightly
  // longer "Saga is waking up" indicator.
  for (;;) {
    if (_swapPromise) { await _swapPromise.catch(() => {}); continue; }
    if (!_module) {
      await initLocalLLM().catch(() => {});
      if (!_module) throw new Error('LLM not initialized');
      continue;
    }
    if (_activeGeneration) {
      try { await _activeGeneration; } catch { /* ignore prior error */ }
      continue;
    }
    break;
  }
  const mod = _module;
  // Re-apply the loaded model family's sampling (see SAMPLING) — other
  // callers may have reconfigured the shared module.
  applySampling(mod);
  // Wrap the token callback with degenerate-output detection. Small models
  // can fall into "thesaurus walks" where every next token is a synonym of
  // the previous one — the output looks like a thesaurus dump with no
  // sentence structure. When detected, interrupt the runner so the user
  // doesn't have to wait for the entire context window to fill with garbage.
  const detector = createDegenerateDetector();
  const wrappedCallback = (token: string) => {
    tokenCallback(token);
    if (detector.feed(token)) {
      try { mod.interrupt(); } catch {}
    }
  };
  mod.setTokenCallback({ tokenCallback: wrappedCallback });
  _activeGeneration = mod.generate(messages as any) as Promise<string>;
  try {
    return await _activeGeneration;
  } finally {
    _activeGeneration = null;
    // Schedule unload now that we're idle again. Reset on every call so a
    // back-and-forth chat keeps the model warm.
    scheduleIdleUnload();
  }
}

// ─── Degenerate-output detector ───────────────────────────────────────────────
//
// Small LLMs occasionally collapse into self-reinforcing loops where each
// next token is a near-synonym of the previous one. Output looks like:
//
//   "assessment assessment assessments assertions assertions assertive..."
//
// Visible signals: no sentence-ending punctuation for a long stretch, and
// the same word stems repeating within a small window. When both fire, we
// interrupt the native runner via the wrapped token callback.

function createDegenerateDetector() {
  const TAIL_WINDOW = 40;            // last N tokens
  const REPEAT_THRESHOLD = 5;        // word stems that show up this often → flag
  const NO_PUNCT_MAX = 60;           // tokens of no sentence-ending punctuation → flag
  const tail: string[] = [];
  let tokensSincePunct = 0;
  let triggered = false;

  return {
    feed(token: string): boolean {
      if (triggered) return true;
      tail.push(token);
      if (tail.length > TAIL_WINDOW) tail.shift();
      // Track distance since last sentence break.
      if (/[.!?\n]/.test(token)) tokensSincePunct = 0;
      else tokensSincePunct++;

      // Bail fast if we haven't accumulated enough signal yet.
      if (tail.length < TAIL_WINDOW) return false;

      // Stem (very crude): lowercase, drop trailing s/ed/ing.
      const stems = tail
        .join('')
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter(w => w.length > 3)
        .map(w => w.replace(/(s|ed|ing|ment|tion|ness)$/, ''));

      const counts = new Map<string, number>();
      for (const s of stems) counts.set(s, (counts.get(s) ?? 0) + 1);
      const maxCount = Math.max(0, ...counts.values());

      if (maxCount >= REPEAT_THRESHOLD && tokensSincePunct >= NO_PUNCT_MAX) {
        triggered = true;
        return true;
      }
      return false;
    },
  };
}
