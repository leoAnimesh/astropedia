/**
 * Adapter registry. The INSTALLED model decides the adapter: once
 * utils/model-download.ts has verified an install (or trusts its marker at
 * launch) it calls setActiveAdapter with the install's adapter
 * (InstallMarker.adapter / ModelSpec.adapter; absent = derived from
 * contextVersion + chatFormat, i.e. 'gemma21' for the v2 / v2.1 models).
 *
 *  - before anything is known (first launch, setup still checking) the
 *    build's default adapter is active: gemma21, whose ready() waits for the
 *    install like before;
 *  - an installed model whose adapter this build can't run activates the
 *    template adapter until a supported model is installed (model-download
 *    re-downloads one; Settings → Re-download does the same);
 *  - web has no model: template.
 * App code asks the active adapter for its capabilities (utils/agent/pipeline.ts
 * canRun / runReading / runTitle / runFollowUps) instead of checking
 * MODEL_VERSION / CONTEXT_VERSION / MODEL_FOLLOWUPS itself.
 */
import { Platform } from 'react-native';
import { renderTemplate } from './template';
import { gemma21Adapter } from './gemma21';
import { createInstructAdapter, type LLMRuntime, type InstructOptions } from './instruct';
import { executorchRuntime } from './executorch-runtime';
import type { AdapterId, AdapterTask, ModelAdapter } from './types';

export { configureExecuTorchRuntime } from './executorch-runtime';

/** No model at all: answers only what the plan can say by itself; ready() is false so the pipeline never waits on it. */
export const templateAdapter: ModelAdapter = {
  caps: {
    id: 'template', tasks: ['saga', 'krishna', 'reading', 'title'], contextFormat: 'none', followups: false,
    maxTokens: 0, contextWindow: 0, languages: ['en', 'hi', 'bn'], timingInPrompt: false, model: false,
  },
  async ready() { return false; },
  loaded() { return false; },
  async *render(plan) {
    const text = renderTemplate(plan);
    if (text) yield text;
  },
};

export const ADAPTERS: Record<AdapterId, ModelAdapter> = {
  gemma21: gemma21Adapter,
  template: templateAdapter,
  instruct: createInstructAdapter(null),
};

/**
 * Plug an inference engine in for the 'instruct' adapter (see ./instruct.ts).
 * iOS / Android register react-native-executorch (./executorch-runtime.ts)
 * below, so a downloaded general instruct model (Settings → Change model)
 * runs through the same native runner as Saga.
 */
export function registerRuntime(runtime: LLMRuntime | null, options?: InstructOptions): void {
  ADAPTERS.instruct = createInstructAdapter(runtime, options);
  runtimeRegistered = !!runtime;
}
let runtimeRegistered = false;

// Web has no on-device model.
if (Platform.OS !== 'web') registerRuntime(executorchRuntime);

/** Adapters with a working implementation in this build (keep RUNNABLE_ADAPTERS in model-download-logic.ts in step). */
export function isRunnableAdapter(id: string | null | undefined): id is AdapterId {
  if (id === 'gemma21') return true;
  if (id === 'instruct') return runtimeRegistered;
  return false;
}

/** The adapter this build pairs with its bundled / downloaded model before an install is known. */
export function defaultAdapterId(): AdapterId {
  return Platform.OS === 'web' ? 'template' : 'gemma21';
}

let active: AdapterId | null = null;

/**
 * Activate the adapter of the INSTALLED model (utils/model-download.ts, after
 * verification / at launch from the install marker). An id this build can't
 * run activates the template adapter; null goes back to the default (setup
 * not settled yet).
 */
export function setActiveAdapter(id: string | null | undefined): AdapterId {
  if (id == null) active = null;
  else active = isRunnableAdapter(id) ? id : 'template';
  return activeAdapterId();
}

export function activeAdapterId(): AdapterId {
  return active ?? defaultAdapterId();
}

export function activeAdapter(): ModelAdapter {
  return ADAPTERS[activeAdapterId()];
}

/** The active adapter declares `task` (template included: it has fallbacks for saga / krishna / reading / title). */
export function adapterSupports(task: AdapterTask, adapter: ModelAdapter = activeAdapter()): boolean {
  return adapter.caps.tasks.includes(task);
}
