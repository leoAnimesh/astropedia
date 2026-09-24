/**
 * Conversation domain types.
 *
 * Kept free of React / React Native imports so the pure helpers that use them
 * (timeline builder, recommendation rules, payload normalizer) can be unit
 * tested in plain Node.
 */

/**
 * Who authored a timeline entry.
 *  - 'user'      : the person using the app
 *  - 'assistant' : the on-device AI astrologer (Saga / Krishna)
 *  - 'human'     : a human astrologer joining the conversation
 *  - 'system'    : session events ("Your session has started.")
 */
export type MessageRole = 'user' | 'assistant' | 'human' | 'system';

/**
 * Delivery state of a user message. "Sent" means the on-device model accepted
 * the prompt and started generating; "failed" means it never got a reply
 * (model not ready, generation error, interrupted, or a simulated failure).
 */
export type MessageStatus = 'sending' | 'sent' | 'failed';

export type FailureReason =
  | 'model-unavailable'   // model still downloading / failed to load / web
  | 'generation-failed'   // native generate() threw
  | 'empty-reply'         // model produced nothing usable
  | 'interrupted'         // app was killed / backgrounded mid-send
  | 'storage'             // SQLite write failed
  | 'simulated';          // dev toggle, for demos

export const DISLIKE_REASONS = [
  { id: 'inaccurate',   label: 'Inaccurate' },
  { id: 'too-generic',  label: 'Too Generic' },
  { id: 'didnt-help',   label: "Didn't Help" },
  { id: 'too-long',     label: 'Too Long' },
] as const;

export type DislikeReason = (typeof DISLIKE_REASONS)[number]['id'];

export type MessageFeedback = {
  rating:  'like' | 'dislike';
  reasons: DislikeReason[];   // only meaningful when rating === 'dislike'
};

/**
 * Snapshot of the message being replied to. Stored by value (not just the id)
 * so the quote still renders if the original is later deleted.
 */
export type ReplySnapshot = {
  id:      string;
  role:    MessageRole;
  author:  string;
  preview: string;
};

/**
 * Built-in recommendation types. The union is open (`string & {}`) on
 * purpose: payloads may carry types this build doesn't know yet, and the
 * renderer registry falls back to a generic card for them.
 */
export type KnownRecommendationType =
  | 'gemstone'
  | 'tarot'
  | 'consultation'
  | 'article'
  | 'promotion'
  | 'remedy';

export type RecommendationType = KnownRecommendationType | (string & {});

export type Recommendation = {
  id:        string;
  type:      RecommendationType;
  title:     string;
  subtitle?: string;
  /** Free-form, type-specific data (planet, corpus id, route, etc.). */
  meta?:     Record<string, string | number | boolean | null>;
};
