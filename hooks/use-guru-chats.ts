import { useThreadStore } from '@/stores/thread-store';
import { useSeenStore } from '@/stores/seen-store';
import { PROFILE_GURUS, type AgentId } from '@/constants/gurus';
import { KRISHNA_PROFILE_ID } from '@/utils/krishna';
import type { Thread } from '@/utils/database';

export type GuruChatRow = {
  agent: AgentId;
  /** The guru's ongoing chat, or null before the first message. */
  thread: Thread | null;
  preview: string | null;
  /** Last activity (null for a chat not started). */
  when: Date | null;
  /** A reply the user hasn't opened yet. */
  unread: boolean;
};

/** SQLite `datetime('now')` is UTC without a zone marker; ISO strings pass through. */
export function parseDbDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowFor(agent: AgentId, threads: Thread[] | undefined, seen: (id: string) => string | null): GuruChatRow {
  const thread = threads?.find((t) => !t.archived && t.agent === agent) ?? null;
  const preview = thread?.lastMessagePreview ?? null;
  return {
    agent,
    thread,
    preview,
    when: parseDbDate(thread?.updatedAt),
    unread: !!thread && !!preview && seen(thread.id) !== preview,
  };
}

/** The Chat tab's rows: the profile's chart gurus, plus Krishna (one chat for everyone). */
export function useGuruChats(profileId: string | null): { gurus: GuruChatRow[]; krishna: GuruChatRow; anyUnread: boolean } {
  const mine    = useThreadStore((s) => (profileId ? s.threads[profileId] : undefined));
  const krishna = useThreadStore((s) => s.threads[KRISHNA_PROFILE_ID]);
  // The map is an input (re-renders and recomputes when a chat is read);
  // ids not in it yet are read through from MMKV.
  const seenMap = useSeenStore((s) => s.seen);
  const seen = (id: string) => (seenMap[id] !== undefined ? seenMap[id] : useSeenStore.getState().get(id));
  const gurus = PROFILE_GURUS.map((a) => rowFor(a, mine, seen));
  const k = rowFor('krishna', krishna, seen);
  return { gurus, krishna: k, anyUnread: k.unread || gurus.some((g) => g.unread) };
}
