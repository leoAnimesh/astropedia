/**
 * Recommendation engine entry point used by the chat hook.
 *
 * Order of preference (single generation — no extra generate() call):
 *   1. The model's own `<recs>` block, parsed with react-native-executorch's
 *      fixAndValidateStructuredOutput (jsonrepair + JSON schema), then
 *      sanitised to the fixed category list.
 *   2. Deterministic keyword → category mapper over the real reply text,
 *      personalised with the profile's current life-period ruler. Always used
 *      while the 350M model is loaded (it isn't asked for a block at all) —
 *      including while it stands in for a bigger model still downloading.
 */
import { Platform } from 'react-native';
import type { Profile } from './database';
import type { AIMode } from './ai';
import type { Recommendation } from '@/types/conversation';
import { getFullKundli } from './astrology';
import { getActiveModelInfo } from './local-llm';
import {
  PLANETS,
  RECS_JSON_SCHEMA,
  buildRecommendations,
  looseParseRecs,
  sanitizeModelRecommendations,
  splitRecsBlock,
  type Planet,
} from './recommendation-rules';

export { splitRecsBlock, stripRecsForDisplay } from './recommendation-rules';

/**
 * The 350M model is too small for reliable structured output. Follows the
 * model actually loaded (progressive loading may run the 350M starter while
 * the tier's model downloads), never the desired one.
 */
export function modelWritesRecsBlock(): boolean {
  try {
    return getActiveModelInfo().def.writesRecs;
  } catch {
    return false;
  }
}

function currentDashaLord(profile: Profile | null): Planet | null {
  if (!profile?.birthDate) return null;
  try {
    const lord = getFullKundli(profile).dasha.lord;
    return (PLANETS as readonly string[]).includes(lord) ? (lord as Planet) : null;
  } catch {
    return null;
  }
}

type StructuredParser = (output: string, schema: object) => unknown;

function libraryParser(): StructuredParser | null {
  if (Platform.OS === 'web') return null;
  try {
    // Lazy: the executorch package is already loaded by the time a reply
    // finishes, and a top-level import would pull it onto the home screen.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('react-native-executorch') as {
      fixAndValidateStructuredOutput?: StructuredParser;
    };
    return lib.fixAndValidateStructuredOutput ?? null;
  } catch {
    return null;
  }
}

/** Parse a raw `<recs>` payload. Returns null when it can't be trusted. */
export function parseModelRecommendations(raw: string, idSeed: string): Recommendation[] | null {
  if (!raw.trim()) return null;
  let parsed: unknown = null;
  const parser = libraryParser();
  if (parser) {
    try {
      parsed = parser(raw, RECS_JSON_SCHEMA);
    } catch {
      parsed = null;
    }
  }
  if (parsed == null) {
    try {
      parsed = looseParseRecs(raw);
    } catch {
      return null;
    }
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const recs = sanitizeModelRecommendations(parsed, idSeed);
  // Items were present but none survived sanitising (wrong categories,
  // empty titles) — treat as malformed so the keyword mapper takes over.
  if (items.length > 0 && recs.length === 0) return null;
  return recs;
}

export function deriveRecommendations(args: {
  profile:   Profile | null;
  mode:      AIMode;
  userText:  string;
  /** Raw model output (may still contain the `<recs>` block). */
  rawReply:  string;
  messageId: string;
}): Recommendation[] {
  // Krishna mode is a quiet, reflective space — no product cards there.
  if (args.mode === 'krishna') return [];
  try {
    const { prose, raw, hasBlock } = splitRecsBlock(args.rawReply);

    if (hasBlock && modelWritesRecsBlock()) {
      const fromModel = parseModelRecommendations(raw, args.messageId);
      // A valid block wins — including a valid EMPTY block (the model judged
      // that nothing fits, e.g. small talk). Only malformed output falls back.
      if (fromModel) return fromModel;
    }

    return buildRecommendations({
      userText:  args.userText,
      replyText: prose,
      dashaLord: currentDashaLord(args.profile),
      idSeed:    args.messageId,
      max:       3,
    });
  } catch (err) {
    // Recommendations are an enhancement; never let them break a reply.
    console.warn('[recommendations] derive failed:', err);
    return [];
  }
}
