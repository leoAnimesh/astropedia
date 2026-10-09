/**
 * LLMRuntime for the 'instruct' adapter on react-native-executorch: the same
 * native LLM runner the gemma21 adapter uses (utils/local-llm.ts), with the
 * installed model's own chat template (its tokenizer_config.json, applied by
 * react-native-executorch's chat preprocessor) instead of astro-gemma's
 * trained format. Registered by ./index.ts on iOS / Android.
 *
 * The installed model's context window and chat-template family come from
 * its install record (utils/model-download.ts calls configureExecuTorchRuntime
 * when it activates an 'instruct' install).
 */
import { ensureLocalLLM, isLLMReady, runLocalLLM, type ChatMessage } from '../../local-llm';
import { createThinkFilter, type GenerateOptions, type LLMRuntime, type RuntimeMessage } from './instruct';
import type { Lang } from '../strings';

let contextWindow = 2048;
let languages: readonly Lang[] = ['en', 'hi', 'bn'];

/** The installed instruct model's window (tokens) and languages. */
export function configureExecuTorchRuntime(opts: { contextWindow?: number | null; languages?: readonly Lang[] }): void {
  if (opts.contextWindow && opts.contextWindow >= 512) contextWindow = opts.contextWindow;
  if (opts.languages?.length) languages = opts.languages;
}

export const executorchRuntime: LLMRuntime = {
  id: 'react-native-executorch',
  get contextWindow() { return contextWindow; },
  get languages() { return languages; },
  ready(waitMs: number) {
    return ensureLocalLLM(waitMs);
  },
  loaded() {
    return isLLMReady();
  },
  async generate(messages: RuntimeMessage[], opts: GenerateOptions): Promise<string> {
    let text = '';
    let stop = false;
    const filter = createThinkFilter((piece) => {
      text += piece;
      if (opts.onToken?.(piece) === true) stop = true;
    });
    await runLocalLLM(messages as ChatMessage[], (token) => {
      filter.push(token);
      return stop;
    }, {
      maxNewTokens: opts.maxNewTokens,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts.isCancelled ? { isCancelled: opts.isCancelled } : {}),
    });
    filter.flush();
    return text;
  },
};
