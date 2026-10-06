import { Platform } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import { scheduleOnRN } from 'react-native-worklets';
import type { LLMRunner, LLMGenerationConfig } from 'react-native-executorch/llm';

// react-native-executorch is loaded on first use, not at startup: importing it
// spins up its background worklet runtime, which the app doesn't need until
// the first chat or chart reading.
type ExecuTorch = {
  wrapAsync: typeof import('react-native-executorch').wrapAsync;
  createLLMRunner: typeof import('react-native-executorch/llm').createLLMRunner;
};
let _et: ExecuTorch | null = null;
function executorch(): ExecuTorch {
  if (!_et) {
    const core = require('react-native-executorch') as typeof import('react-native-executorch');
    const llm  = require('react-native-executorch/llm') as typeof import('react-native-executorch/llm');
    _et = { wrapAsync: core.wrapAsync, createLLMRunner: llm.createLLMRunner };
  }
  return _et;
}

// The one on-device model: Gemma 3 270M fine-tuned for Astropedia (ml/), shipped
// inside the app by plugins/with-bundled-model.js. Bump MODEL_VERSION whenever
// the bundled files change so Android re-copies them out of the APK.
const MODEL_VERSION = 'astro-gemma-v2';
/**
 * Chart-context format the bundled model was trained on (utils/astrology.ts
 * ContextVersion). astro-gemma-v1 knew format 1; astro-gemma-v2 (bundled) is
 * trained on ml/data/gen_profiles.ts output in format 2. Switch together with
 * the model file.
 */
export const CONTEXT_VERSION = 2 as 1 | 2;
/**
 * Generation budget that goes with CONTEXT_VERSION. astro-gemma-v1 was
 * exported with a 1024-token window and trained on short replies (160 new
 * tokens). v2 models are exported with CTX=2048 (ml/scripts/export_gemma.sh)
 * and trained on replies of up to 260 tokens (ml/data/validate_answer.py MAX_TOKENS).
 *
 * The window itself lives in the .pte (get_max_context_len = 2048); the app
 * passes no window to the runner, CONTEXT_WINDOW only budgets the prompt. The
 * v2 graph takes at most 511 tokens per forward call (get_max_seq_len = 511);
 * react-native-executorch's TextLLMRunner prefills longer prompts in 511-token
 * chunks (cpp/extensions/llm/llm_runner.cpp clamps the chunk to the graph's
 * input bound), so a ~1,400-token prompt is 3 prefill calls.
 */
export const REPLY_MAX_TOKENS = CONTEXT_VERSION === 1 ? 160 : 260;
export const CONTEXT_WINDOW = CONTEXT_VERSION === 1 ? 1024 : 2048;
const MODEL_FILE = 'astro-gemma.pte';
const TOKENIZER_FILE = 'astro-gemma-tokenizer.json';

// SmolLM2's end-of-turn markers; the runner can surface them as text.
// Prompt format and languages of the bundled model. SmolLM2 (current) was
// trained on ChatML in English only; the multilingual Gemma 3 model uses
// Gemma's turn format and also answers in Hindi and Bengali. Switch both
// together with the model files.
type ChatFormat = 'chatml' | 'gemma';
const CHAT_FORMAT = 'gemma' as ChatFormat;
export const MODEL_LANGUAGES: readonly ('en' | 'hi' | 'bn')[] = ['en', 'hi', 'bn'];

const STOP_TOKENS: Record<ChatFormat, string[]> = {
  chatml: ['<|im_end|>', '<|endoftext|>'],
  gemma:  ['<end_of_turn>', '<eos>'],
};

export type LLMState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

let _state: LLMState = { status: 'idle' };
let _runner: LLMRunner | null = null;

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

export function isLLMReady(): boolean {
  return _state.status === 'ready' && _runner !== null;
}

// ─── Model files ──────────────────────────────────────────────────────────────

/**
 * Local paths of the bundled model and tokenizer. iOS reads them straight from
 * the app bundle; Android assets live inside the APK, so they're copied to the
 * documents folder once per MODEL_VERSION.
 */
async function resolveModelFiles(): Promise<{ model: string; tokenizer: string }> {
  const { fs } = RNBlobUtil;
  if (Platform.OS === 'ios') {
    return {
      model:     `${fs.dirs.MainBundleDir}/${MODEL_FILE}`,
      tokenizer: `${fs.dirs.MainBundleDir}/${TOKENIZER_FILE}`,
    };
  }

  const root = `${fs.dirs.DocumentDir}/models`;
  const dir  = `${root}/${MODEL_VERSION}`;
  const files = { model: `${dir}/${MODEL_FILE}`, tokenizer: `${dir}/${TOKENIZER_FILE}` };
  if (await fs.exists(files.model) && await fs.exists(files.tokenizer)) return files;

  // Drop copies of older versions before writing the new one.
  if (await fs.exists(root)) {
    for (const name of await fs.ls(root)) {
      if (name !== MODEL_VERSION) await fs.unlink(`${root}/${name}`).catch(() => {});
    }
  }
  if (!(await fs.exists(dir))) await fs.mkdir(dir);
  // Copy the tokenizer first and the model last: a finished model file marks
  // the copy as complete for the existence check above.
  await fs.cp(fs.asset(`models/${TOKENIZER_FILE}`), files.tokenizer);
  await fs.cp(fs.asset(`models/${MODEL_FILE}`), `${files.model}.tmp`);
  await fs.mv(`${files.model}.tmp`, files.model);
  return files;
}

// ─── Loading ──────────────────────────────────────────────────────────────────

let _initPromise: Promise<void> | null = null;

/** Load the bundled model into memory (no download). Safe to call repeatedly. */
export function initLocalLLM(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (_runner) return Promise.resolve();
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      setState({ status: 'loading' });
      const { model, tokenizer } = await resolveModelFiles();
      const { wrapAsync, createLLMRunner } = executorch();
      _runner = await wrapAsync(createLLMRunner)(model, tokenizer);
      setState({ status: 'ready' });
    } catch (e) {
      _runner = null;
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      _initPromise = null;
    }
  })();
  return _initPromise;
}

/**
 * Make sure the model is loaded, waiting at most `timeoutMs`. The bundled model
 * loads in about a second, so callers normally just await this.
 */
export async function ensureLocalLLM(timeoutMs?: number): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (isLLMReady()) return true;
  const load = initLocalLLM().catch(() => {});
  if (timeoutMs == null) {
    await load;
  } else {
    await Promise.race([load, new Promise<void>(r => setTimeout(r, timeoutMs))]);
  }
  return isLLMReady();
}

/** Release the model from RAM; the next request reloads it from the bundle. */
export async function unloadLocalLLM(): Promise<void> {
  cancelIdleUnload();
  const runner = _runner;
  if (!runner) return;
  _runner = null;
  setState({ status: 'idle' });
  if (_activeGeneration) {
    try { runner.stop(); } catch {}
    try { await _activeGeneration; } catch {}
  }
  try { runner.dispose(); } catch {}
}

// ─── Idle unload ──────────────────────────────────────────────────────────────
//
// The model takes ~150 MB of RAM. If the user hasn't chatted for a few minutes
// we release it; the next request reloads it from the bundle (~1 s).

const IDLE_UNLOAD_MS = 3 * 60 * 1000;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleUnload() {
  cancelIdleUnload();
  _idleTimer = setTimeout(() => {
    _idleTimer = null;
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

// ─── Generation ───────────────────────────────────────────────────────────────

/** ChatML, exactly as SmolLM2's chat template renders it (the model was trained on it). */
function formatChatML(messages: ChatMessage[]): string {
  return messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('')
    + '<|im_start|>assistant\n';
}

/**
 * Gemma 3's chat template, matching ml/data/build_sft.py gemma_prompt():
 * no system role, so the system text goes at the start of the first user
 * turn; user/model turns are trimmed. The runner adds no BOS, so it's here.
 */
function formatGemma(messages: ChatMessage[]): string {
  let system = '';
  let turns = messages;
  if (turns[0]?.role === 'system') {
    system = turns[0].content + '\n\n';
    turns = turns.slice(1);
  }
  let s = '<bos>';
  turns.forEach((m, i) => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    s += `<start_of_turn>${role}\n${i === 0 ? system : ''}${m.content.trim()}<end_of_turn>\n`;
  });
  return s + '<start_of_turn>model\n';
}

const formatPrompt = (messages: ChatMessage[]) =>
  (CHAT_FORMAT === 'gemma' ? formatGemma : formatChatML)(messages);

type GenerateOptions = {
  genConfig: LLMGenerationConfig;
  stopTokens: string[];
  onToken: (token: string) => void;
};

export type RunOptions = LLMGenerationConfig & {
  /**
   * Text that opens the model's turn (e.g. "SUN: স্বভাবে " to steer a Bengali
   * reading). It is part of the prompt, not streamed; the caller prepends it
   * to the reply if it wants it there.
   */
  replyPrefix?: string;
};

// Runs on ExecuTorch's background worklet runtime so generation never blocks
// the JS thread; tokens hop back to the RN thread through scheduleOnRN.
function generateWorklet(runner: LLMRunner, prompt: string, options: GenerateOptions): string {
  'worklet';
  const { genConfig, stopTokens, onToken } = options;
  let response = '';
  runner.reset();
  runner.generate(prompt, genConfig, (token: string) => {
    if (stopTokens.includes(token)) return;
    response += token;
    scheduleOnRN(onToken, token);
  });
  return response;
}

let _generateAsync: ((runner: LLMRunner, prompt: string, options: GenerateOptions) => Promise<string>) | null = null;
function generateAsync(runner: LLMRunner, prompt: string, options: GenerateOptions): Promise<string> {
  _generateAsync ??= executorch().wrapAsync(generateWorklet);
  return _generateAsync(runner, prompt, options);
}

// The native runner handles one generation at a time.
let _activeGeneration: Promise<string> | null = null;

/**
 * Generate a reply. `tokenCallback` may return true to stop generation early
 * (the reply so far is returned).
 */
export async function runLocalLLM(
  messages: ChatMessage[],
  tokenCallback: (token: string) => boolean | void,
  { replyPrefix = '', ...genConfig }: RunOptions = {},
): Promise<string> {
  cancelIdleUnload();
  if (!_runner) await initLocalLLM().catch(() => {});
  const runner = _runner;
  if (!runner) throw new Error('LLM not initialized');
  if (_activeGeneration) {
    try { await _activeGeneration; } catch { /* ignore prior error */ }
  }

  // Interrupt runaway "thesaurus walk" loops instead of letting them fill
  // the whole token budget.
  const detector = createDegenerateDetector();
  let stopped = false;
  const onToken = (token: string) => {
    if (stopped) return;
    const stop = tokenCallback(token) === true;
    if (stop || detector.feed(token)) {
      stopped = true;
      try { runner.stop(); } catch {}
    }
  };

  _activeGeneration = generateAsync(runner, formatPrompt(messages) + replyPrefix, {
    genConfig: { temperature: 0.3, maxNewTokens: 200, ...genConfig },
    stopTokens: STOP_TOKENS[CHAT_FORMAT],
    onToken,
  });
  try {
    return await _activeGeneration;
  } finally {
    _activeGeneration = null;
    scheduleIdleUnload();
  }
}

// ─── Degenerate-output detector ───────────────────────────────────────────────
//
// Small LLMs occasionally collapse into loops where each next token is a
// near-synonym of the previous one, with no sentence-ending punctuation.

function createDegenerateDetector() {
  const TAIL_WINDOW = 40;
  const REPEAT_THRESHOLD = 5;
  const NO_PUNCT_MAX = 60;
  const tail: string[] = [];
  let tokensSincePunct = 0;
  let triggered = false;

  return {
    feed(token: string): boolean {
      if (triggered) return true;
      tail.push(token);
      if (tail.length > TAIL_WINDOW) tail.shift();
      if (/[.!?।\n]/.test(token)) tokensSincePunct = 0;
      else tokensSincePunct++;
      if (tail.length < TAIL_WINDOW) return false;

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
