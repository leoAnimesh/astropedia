import { Platform } from 'react-native';
import { Storage } from './storage';
import { detectDeviceTier, type DeviceTier } from './device-tier';

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
  version:  string;
  constant: string;   // exported name in 'react-native-executorch'
  size:     string;   // human-readable for the UI
  label:    string;
  family:   ModelFamily;
};

const MODELS: Record<DeviceTier, ModelDef> = {
  flagship: { version: 'qwen3_1_7b_q',    constant: 'QWEN3_1_7B_QUANTIZED',           size: '~900 MB', label: 'Qwen 3 1.7B', family: 'qwen3' },
  mid:      { version: 'lfm2_5_1_2b_q',   constant: 'LFM2_5_1_2B_INSTRUCT_QUANTIZED', size: '~700 MB', label: 'LFM2.5 1.2B', family: 'lfm2'  },
  // LFM2.5 1.2B is the primary model for 4–6 GB devices (was Llama 3.2 1B
  // SpinQuant): better instruction following at similar size, faster decode.
  budget:   { version: 'lfm2_5_1_2b_q',   constant: 'LFM2_5_1_2B_INSTRUCT_QUANTIZED', size: '~700 MB', label: 'LFM2.5 1.2B', family: 'lfm2'  },
  floor:    { version: 'lfm2_5_350m_q',   constant: 'LFM2_5_350M_QUANTIZED',          size: '~200 MB', label: 'LFM2.5 350M', family: 'lfm2'  },
};

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

// Family of the model that is actually loaded in RAM (may lag the preference
// during a switch). Falls back to the desired model before first load.
let _loadedFamily: ModelFamily | null = null;

function applySampling(mod: import('react-native-executorch').LLMModule): void {
  const cfg = SAMPLING[_loadedFamily ?? desiredModel().family];
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

export function getModelCatalog(): Record<DeviceTier, ModelDef> {
  return MODELS;
}

export function getCurrentModelInfo(): { tier: DeviceTier; def: ModelDef; auto: boolean } {
  const tier = selectedTier();
  return { tier, def: MODELS[tier], auto: Storage.getPreferredModelTier() === 'auto' };
}

export type LLMState =
  | { status: 'idle' }
  | { status: 'downloading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

// On a version mismatch (build upgrade, tier change, manual override), clear
// the downloaded flag so the overlay renders during the first load.
if (Platform.OS !== 'web' && Storage.getModelVersion() !== desiredModel().version) {
  Storage.setModelDownloaded(false);
}

// Initialized synchronously at import time — before any component mounts.
// If the (correct version of the) model was downloaded in a previous session,
// starts as 'ready' so the overlay never renders.
let _state: LLMState =
  Platform.OS !== 'web' && Storage.getModelDownloaded()
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

export function getLLMModule() { return _module; }

export function isLLMReady(): boolean {
  return _state.status === 'ready' && _module !== null;
}

/**
 * If the model was previously downloaded, waits for it to load into memory
 * before returning. Falls back gracefully if load fails.
 * If not downloaded, kicks off background download and returns false immediately.
 *
 * `timeoutMs` caps how long the caller will wait for a disk-cached load to
 * finish. If the load takes longer, returns `false` so the caller can fall
 * through to a cloud provider — the local load continues in the background and
 * will be ready for the next message.
 */
export async function ensureLocalLLM(timeoutMs?: number): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (isLLMReady()) return true;
  if (!Storage.getModelDownloaded()) {
    // Not on disk yet — start background download, don't block the caller
    initLocalLLM().catch(() => {});
    return false;
  }
  // Model is on disk — wait for it to load (typically <2s from cache)
  const loadPromise = initLocalLLM().catch(() => {});
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

function loadModule(silent: boolean): Promise<void> {
  return (async () => {
    try {
      if (!silent) setState({ status: 'downloading', progress: 0 });

      const executorch = require('react-native-executorch') as typeof import('react-native-executorch');
      const { initExecutorch, LLMModule } = executorch;

      const { ExpoResourceFetcher } =
        require('react-native-executorch-expo-resource-fetcher') as
        typeof import('react-native-executorch-expo-resource-fetcher');

      initExecutorch({ resourceFetcher: ExpoResourceFetcher });

      const target = desiredModel();
      const def    = (executorch as unknown as Record<string, unknown>)[target.constant];
      if (!def) throw new Error(`Model constant missing in react-native-executorch: ${target.constant}`);

      _module = await LLMModule.fromModelName(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        def as any,
        (progress: number) => {
          if (!silent) setState({ status: 'downloading', progress });
        },
      );

      // Per-family sampling (see SAMPLING). Same values runLocalLLM applies
      // before each generation, so load-time and run-time never disagree.
      _loadedFamily = target.family;
      applySampling(_module);

      Storage.setModelDownloaded(true);
      Storage.setModelVersion(target.version);
      setState({ status: 'ready' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // If silent load failed the cache may be corrupt — force fresh download next time
      Storage.setModelDownloaded(false);
      setState({ status: 'error', message });
      _initPromise = null;
      throw e;
    }
  })();
}

export function initLocalLLM(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (_initPromise) return _initPromise;

  // Model was already downloaded — _state is already 'ready' from module init.
  // Load the module silently from disk cache without touching state.
  if (Storage.getModelDownloaded()) {
    _initPromise = loadModule(/* silent */ true);
  } else {
    _initPromise = loadModule(/* silent */ false);
  }

  return _initPromise;
}

/**
 * Release the model from RAM without touching disk.
 * _state stays 'ready' so the overlay never re-appears.
 * ensureLocalLLM() will reload from disk cache (~2–5 s) on next chat.
 */
export async function unloadLocalLLM(): Promise<void> {
  cancelIdleUnload();
  if (!_module) return;
  const mod = _module;
  _module      = null;
  _initPromise = null;
  // Interrupt any in-progress generation before deleting
  if (_activeGeneration) {
    try { mod.interrupt(); } catch {}
    try { await _activeGeneration; } catch {}
  }
  try { mod.delete(); } catch {}
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
 * Switch the active on-device model by tier (or 'auto' to follow detected
 * device tier). Unloads any currently-loaded module, clears the disk-cache
 * flag, persists the new preference, and kicks off a fresh download with the
 * existing progress overlay.
 */
export async function switchModel(preference: 'auto' | DeviceTier): Promise<void> {
  if (Platform.OS === 'web') return;

  const before = selectedTier();
  Storage.setPreferredModelTier(preference);
  const after  = selectedTier();

  if (before === after && isLLMReady()) return;

  // If a chat is mid-generation, let it finish before we yank the model out
  // from under it. Switching mid-stream would interrupt the reply with no
  // way for the UI to recover gracefully.
  if (_activeGeneration) {
    try { await _activeGeneration; } catch {}
  }

  await unloadLocalLLM();
  Storage.setModelDownloaded(false);
  setState({ status: 'idle' });
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
  // If the module was unloaded (idle timer, AppState backgrounding, model
  // swap), re-init it instead of throwing. The user just sees a slightly
  // longer "Saga is waking up" indicator on the next chat.
  if (!_module) {
    await initLocalLLM().catch(() => {});
  }
  if (!_module) throw new Error('LLM not initialized');
  if (_activeGeneration) {
    try { await _activeGeneration; } catch { /* ignore prior error */ }
  }
  // Re-apply the loaded model family's sampling (see SAMPLING) — other
  // callers may have reconfigured the shared module.
  applySampling(_module);
  // Wrap the token callback with degenerate-output detection. Small models
  // can fall into "thesaurus walks" where every next token is a synonym of
  // the previous one — the output looks like a thesaurus dump with no
  // sentence structure. When detected, interrupt the runner so the user
  // doesn't have to wait for the entire context window to fill with garbage.
  const detector = createDegenerateDetector();
  const mod = _module;
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
