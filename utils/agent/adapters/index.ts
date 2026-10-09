/**
 * Adapter registry. The installed model's manifest entry names its adapter
 * (ModelSpec.adapter, utils/model-download-logic.ts; absent = derived from
 * contextVersion + chatFormat, i.e. 'gemma21' for the v2 / v2.1 models).
 * App code asks the active adapter for its capabilities instead of checking
 * CONTEXT_VERSION / MODEL_FOLLOWUPS itself.
 */
import { CHAT_FORMAT, CONTEXT_VERSION } from '../../local-llm';
import { renderTemplate } from './template';
import { gemma21Adapter } from './gemma21';
import { instructAdapter } from './instruct';
import type { AdapterId, ModelAdapter } from './types';

/** No model at all: answers only what the plan can say by itself. */
export const templateAdapter: ModelAdapter = {
  caps: {
    id: 'template', tasks: ['saga'], contextFormat: 'none', followups: false,
    maxTokens: 0, contextWindow: 0, languages: ['en', 'hi', 'bn'], timingInPrompt: false,
  },
  async ready() { return true; },
  async *render(plan) {
    const text = renderTemplate(plan);
    if (text) yield text;
  },
};

export const ADAPTERS: Record<AdapterId, ModelAdapter> = {
  gemma21: gemma21Adapter,
  template: templateAdapter,
  instruct: instructAdapter,
};

/**
 * The adapter this build pairs with its bundled / downloaded model: the
 * on-device ExecuTorch model (astro-gemma; gemma21 also keeps the v1
 * context path for CONTEXT_VERSION 1 builds).
 */
export function defaultAdapterId(): AdapterId {
  return 'gemma21';
}

/** Adapter for a manifest entry without an explicit `adapter`. */
export function adapterForSpec(spec: { adapter?: string; contextVersion: number; chatFormat: string }): AdapterId | null {
  if (spec.adapter) return spec.adapter in ADAPTERS ? (spec.adapter as AdapterId) : null;
  return spec.contextVersion === CONTEXT_VERSION && spec.chatFormat === CHAT_FORMAT ? 'gemma21' : null;
}

let override: AdapterId | null = null;
/** Select an adapter by id (from the model manifest); unknown ids keep the default. */
export function setActiveAdapter(id: string | null | undefined): void {
  override = id && id in ADAPTERS ? (id as AdapterId) : null;
}

export function activeAdapter(): ModelAdapter {
  return ADAPTERS[override ?? defaultAdapterId()];
}
