/**
 * The ModelAdapter contract (layer 3 of the answer pipeline). An adapter
 * turns an AnswerPlan into text. All model-specific prompt formatting lives in
 * the adapter; the plan, the verifier and the app never see prompt strings.
 *
 * Adapters:
 *  - 'gemma21'  astro-gemma v2 / v2.1 on device (ExecuTorch), trained [saga] /
 *               [krishna] prompts with the v2 chart context (./gemma21.ts);
 *  - 'template' no model: the TemplateRenderer (./template.ts);
 *  - 'instruct' a future general instruction-following model: system prompt
 *               written from the plan (./instruct.ts, a documented stub).
 * The model manifest names the adapter (ModelSpec.adapter in
 * utils/model-download-logic.ts); capability flags replace scattered
 * CONTEXT_VERSION / MODEL_FOLLOWUPS checks in app code.
 */
import type { AnswerPlan } from '../plan';
import type { Lang } from '../strings';

export type AdapterId = 'gemma21' | 'template' | 'instruct';
export type AdapterTask = 'saga' | 'krishna' | 'reading' | 'title' | 'followups';

export type AdapterCaps = {
  id: AdapterId;
  /** Tasks the model was trained on / can do. */
  tasks: readonly AdapterTask[];
  /** How chart facts reach the model. */
  contextFormat: 'gemma-v2' | 'instruct' | 'none';
  /** Writes its own follow-up chips. */
  followups: boolean;
  /** New tokens per reply. */
  maxTokens: number;
  /** Prompt + reply budget in tokens. */
  contextWindow: number;
  languages: readonly Lang[];
  /**
   * Takes the engine's best window inside its prompt (the gemma21 "Best
   * window for …" Timing line). Timing is still verified after rendering.
   */
  timingInPrompt: boolean;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type RenderRequest = {
  /** Earlier turns of the thread, oldest first. */
  history: ChatTurn[];
  /** The user's own name (Krishna greets by first name). */
  userName?: string;
};

export interface ModelAdapter {
  caps: AdapterCaps;
  /** Loads the model if needed; false when it can't answer now (not downloaded, web, failed). */
  ready(waitMs: number): Promise<boolean>;
  /** The reply as a token stream, already verified/repaired against the plan. */
  render(plan: AnswerPlan, req: RenderRequest): AsyncGenerator<string>;
}
