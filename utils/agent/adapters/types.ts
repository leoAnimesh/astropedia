/**
 * The ModelAdapter contract (layer 3 of the answer pipeline). An adapter
 * turns an AnswerPlan (or a small task request) into text. All model-specific
 * prompt formatting lives in the adapter; the plan, the verifier and the app
 * never see prompt strings, and app code asks the active adapter's
 * capabilities instead of checking MODEL_VERSION / CONTEXT_VERSION /
 * MODEL_FOLLOWUPS itself (utils/agent/pipeline.ts runs every task).
 *
 * Adapters:
 *  - 'gemma21'  astro-gemma v2 / v2.1 on device (ExecuTorch), trained [saga] /
 *               [krishna] / [reading] / [title] / [followups] prompts with
 *               the v2 chart context (./gemma21.ts);
 *  - 'template' no model: the TemplateRenderer (./template.ts and
 *               ./template-reading.ts);
 *  - 'instruct' a general instruction-following model behind a pluggable
 *               LLMRuntime (./instruct.ts; react-native-executorch on device,
 *               ./executorch-runtime.ts, with the model's own chat template).
 * The installed model's manifest entry names its adapter (ModelSpec.adapter,
 * utils/model-download-logic.ts); utils/model-download.ts activates it once
 * the install is verified.
 */
import type { AnswerPlan, PlanProfile } from '../plan';
import type { Lang } from '../strings';

export type AdapterId = 'gemma21' | 'template' | 'instruct';
/**
 * - saga / krishna  chat answers (render)
 * - reading         the chart card's personality reading (reading)
 * - title           a 2–4 word thread title (title)
 * - followups       model-written follow-up chips (followups)
 */
export type AdapterTask = 'saga' | 'krishna' | 'reading' | 'title' | 'followups';

export type AdapterCaps = {
  id: AdapterId;
  /** Tasks the model was trained on / can do. The template adapter lists what it can answer without one. */
  tasks: readonly AdapterTask[];
  /** How chart facts reach the model. */
  contextFormat: 'gemma-v2' | 'gemma-v1' | 'instruct' | 'none';
  /** Writes its own follow-up chips (= tasks includes 'followups'). */
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
  /** A real model (false for the template adapter: nothing to load or wait for). */
  model: boolean;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type RenderRequest = {
  /** Earlier turns of the thread, oldest first. */
  history: ChatTurn[];
  /** The user's own name (Krishna greets by first name). */
  userName?: string;
};

export type ReadingRequest = {
  profile: PlanProfile & { name: string };
  lang: Lang;
  /** hi/bn: return text null instead of writing an English reading when the script check fails twice. */
  skipEnglishFallback?: boolean;
};

/** "SUN: …\nMOON: …" lines (hooks/use-chart-reading.ts parseReading). */
export type ReadingResult = {
  /** null: hi/bn failed and `skipEnglishFallback` was set (use a cached English reading). */
  text: string | null;
  /** Language the text is in: the requested one, or 'en' after the fallback. */
  lang: Lang;
};

export type TitleRequest = { question: string; reply: string; lang: Lang };

export type FollowUpsRequest = {
  /** The thread before the reply, ending with the question it answers. */
  history: ChatTurn[];
  lastAnswer: string;
  lang: Lang;
  /** Polled while generating; true stops and returns []. */
  isCancelled?: () => boolean;
};

export interface ModelAdapter {
  caps: AdapterCaps;
  /** Loads the model if needed; false when it can't answer now (not downloaded, web, failed, no model). */
  ready(waitMs: number): Promise<boolean>;
  /** Already loaded (never starts a load): chips only use a model that is up. */
  loaded(): boolean;
  /** The reply as a token stream (the pipeline verifies it against the plan). */
  render(plan: AnswerPlan, req: RenderRequest): AsyncGenerator<string>;
  /** caps.tasks 'reading'. */
  reading?(req: ReadingRequest): Promise<ReadingResult>;
  /** caps.tasks 'title': raw title text (the chat cleans it). */
  title?(req: TitleRequest): Promise<string | null>;
  /** caps.tasks 'followups': 0–3 checked chip questions (model-bound: Western digits). */
  followups?(req: FollowUpsRequest): Promise<string[]>;
}
