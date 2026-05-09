import { Platform } from 'react-native';
import { Storage } from './storage';

export type LLMState =
  | { status: 'idle' }
  | { status: 'downloading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

// Initialized synchronously at import time — before any component mounts.
// If the model was downloaded in a previous session, starts as 'ready'
// so the overlay never renders (getLLMState().status === 'ready' on first call).
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
 */
export async function ensureLocalLLM(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (isLLMReady()) return true;
  if (!Storage.getModelDownloaded()) {
    // Not on disk yet — start background download, don't block the caller
    initLocalLLM().catch(() => {});
    return false;
  }
  // Model is on disk — wait for it to load (typically <2s from cache)
  await initLocalLLM().catch(() => {});
  return isLLMReady();
}

let _initPromise: Promise<void> | null = null;

function loadModule(silent: boolean): Promise<void> {
  return (async () => {
    try {
      if (!silent) setState({ status: 'downloading', progress: 0 });

      const {
        initExecutorch,
        LLMModule,
        LFM2_5_1_2B_INSTRUCT,
      } = require('react-native-executorch') as typeof import('react-native-executorch');

      const { ExpoResourceFetcher } =
        require('react-native-executorch-expo-resource-fetcher') as
        typeof import('react-native-executorch-expo-resource-fetcher');

      initExecutorch({ resourceFetcher: ExpoResourceFetcher });

      _module = await LLMModule.fromModelName(
        LFM2_5_1_2B_INSTRUCT,
        (progress: number) => {
          if (!silent) setState({ status: 'downloading', progress });
        },
      );

      Storage.setModelDownloaded(true);
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

// Serialize generations — the native module handles one at a time.
let _activeGeneration: Promise<string> | null = null;

export async function runLocalLLM(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  tokenCallback: (token: string) => void,
): Promise<string> {
  if (!_module) throw new Error('LLM not initialized');
  if (_activeGeneration) {
    try { await _activeGeneration; } catch { /* ignore prior error */ }
  }
  _module.setTokenCallback({ tokenCallback });
  _activeGeneration = _module.generate(messages as any) as Promise<string>;
  try {
    return await _activeGeneration;
  } finally {
    _activeGeneration = null;
  }
}
