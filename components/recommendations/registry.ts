import type { ComponentType } from 'react';
import type { Recommendation, RecommendationType } from '@/types/conversation';

/**
 * Recommendation renderer registry.
 *
 * The chat never switches on `recommendation.type`. Each type registers a
 * definition (label, glyph, tint, optional custom card, press handler) once;
 * the carousel resolves definitions at render time. Adding a new experience
 * (e.g. 'panchang', 'course') is one `registerRecommendation(...)` call in a
 * new file — no changes to the chat, the list, or the message schema.
 *
 * Unknown types resolve to FALLBACK_DEFINITION, so a payload from a newer
 * backend can never crash or blank an older app.
 */

export type RecommendationPressContext = {
  /** Name of the AI persona that surfaced the card ("Saga"). */
  persona: string;
};

export type RecommendationCardProps = {
  recommendation: Recommendation;
  definition:     RecommendationDefinition;
  onPress:        () => void;
};

export type RecommendationDefinition = {
  type:     RecommendationType;
  /** Small eyebrow label on the card ("Gemstone"). */
  label:    string;
  /** Single glyph shown in the card's badge. */
  glyph:    string;
  /** Badge tint (hex). */
  tint:     string;
  /** Call-to-action text at the bottom of the default card. */
  cta:      string;
  /** Optional fully custom card. Defaults to the shared RecommendationCard. */
  Card?:    ComponentType<RecommendationCardProps>;
  /** What happens on tap. */
  onPress:  (rec: Recommendation, ctx: RecommendationPressContext) => void;
};

const registry = new Map<string, RecommendationDefinition>();
let fallback: RecommendationDefinition | null = null;

export function registerRecommendation(def: RecommendationDefinition): void {
  if (__DEV__ && registry.has(def.type)) {
    console.warn(`[recommendations] "${def.type}" registered twice — last one wins.`);
  }
  registry.set(def.type, def);
}

export function setFallbackRecommendation(def: RecommendationDefinition): void {
  fallback = def;
}

/** Definition for a type, or the fallback for unknown types. */
export function resolveRecommendation(type: RecommendationType): RecommendationDefinition {
  const def = registry.get(type);
  if (def) return def;
  if (!fallback) throw new Error('[recommendations] no fallback registered');
  return fallback;
}

export function isKnownRecommendationType(type: RecommendationType): boolean {
  return registry.has(type);
}

export function registeredRecommendationTypes(): string[] {
  return Array.from(registry.keys());
}
