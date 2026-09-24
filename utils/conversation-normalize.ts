/**
 * Defensive normalization of conversation payloads (the assignment's mock
 * payload today, a server response tomorrow). Anything malformed is repaired
 * or dropped here so the UI layer can trust its inputs.
 *
 * No React / RN imports (unit-tested in Node — see tests/).
 */
import type { Recommendation, MessageRole } from '../types/conversation';
import type { Message } from './database';

type RawRecord = Record<string, unknown>;

const PAYLOAD_TYPE_TO_ROLE: Record<string, MessageRole> = {
  user:      'user',
  ai:        'assistant',
  assistant: 'assistant',
  human:     'human',
  astrologer: 'human',
  system:    'system',
};

function isRecord(v: unknown): v is RawRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Keep only recommendations that have a usable id + type + title.
 * Unknown `type` values are KEPT — the renderer registry decides how to show
 * them — but structurally broken entries are dropped. Duplicate ids are
 * de-duplicated so list keys stay unique.
 */
export function normalizeRecommendations(raw: unknown): Recommendation[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  raw.forEach((item, index) => {
    if (!isRecord(item)) return;
    const title = str(item.title)?.trim();
    const type  = str(item.type)?.trim().toLowerCase();
    if (!title || !type) return;
    let id = str(item.id) ?? `idx-${index}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);

    const meta: NonNullable<Recommendation['meta']> = {};
    if (isRecord(item.meta)) {
      for (const [k, v] of Object.entries(item.meta)) {
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          meta[k] = v as string | number | boolean | null;
        }
      }
    }
    const subtitle = str(item.subtitle)?.trim();
    out.push({
      id,
      type,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(Object.keys(meta).length ? { meta } : {}),
    });
  });
  return out;
}

export type NormalizeOptions = {
  threadId:     string;
  /** Prefix for generated message ids so seeded ids never collide. */
  idPrefix:     string;
  /** Timestamp for the first message; later ones are spaced `stepMs` apart. */
  startAt:      number;
  stepMs?:      number;
  humanAuthor?: string;
};

/**
 * Convert a raw payload (`{ id, type, text, recommendations }[]`) into
 * persisted-shape Messages. Entries with an unknown `type` or no text are
 * dropped; missing timestamps are synthesised in order.
 */
export function normalizePayload(raw: unknown, opts: NormalizeOptions): Message[] {
  if (!Array.isArray(raw)) return [];
  const step = opts.stepMs ?? 60_000;
  const out: Message[] = [];
  let t = opts.startAt;

  raw.forEach((item, index) => {
    if (!isRecord(item)) return;
    const role = PAYLOAD_TYPE_TO_ROLE[String(item.type ?? '').toLowerCase()];
    const text = str(item.text)?.trim();
    if (!role || !text) return;

    const explicit = str(item.createdAt);
    const createdAt = explicit && !Number.isNaN(Date.parse(explicit))
      ? new Date(explicit).toISOString()
      : new Date(t).toISOString();
    t += step;

    const recommendations = role === 'assistant' ? normalizeRecommendations(item.recommendations) : [];
    out.push({
      id:              `${opts.idPrefix}-${str(item.id) ?? index}`,
      threadId:        opts.threadId,
      role,
      content:         text,
      modelTier:       null,
      createdAt,
      syncedAt:        null,
      status:          role === 'user' ? 'sent' : null,
      failureReason:   null,
      recommendations,
      feedback:        null,
      replyTo:         null,
      authorName:      role === 'human' ? (str(item.author) ?? opts.humanAuthor ?? 'Astrologer') : null,
    });
  });

  return out;
}

/**
 * Repair messages loaded from storage:
 *  - a user message still marked 'sending' means the app died mid-send →
 *    surface it as failed/interrupted so the user can Retry.
 */
export function reviveLoadedMessages(messages: Message[]): Message[] {
  return messages.map((m) =>
    m.role === 'user' && m.status === 'sending'
      ? { ...m, status: 'failed', failureReason: 'interrupted' }
      : m,
  );
}
