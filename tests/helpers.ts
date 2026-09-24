import type { Message } from '../utils/database';

let seq = 0;

/** Minimal Message factory for pure-logic tests. */
export function msg(partial: Partial<Message> & Pick<Message, 'role'>): Message {
  seq += 1;
  return {
    id:        partial.id ?? `m${seq}`,
    threadId:  't1',
    content:   partial.content ?? `message ${seq}`,
    modelTier: null,
    createdAt: partial.createdAt ?? new Date(2026, 8, 24, 10, 0, 0).toISOString(),
    syncedAt:  null,
    ...partial,
  };
}
