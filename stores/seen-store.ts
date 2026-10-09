import { create } from 'zustand';
import { Storage } from '@/utils/storage';

/**
 * Last reply preview the user has seen per thread, mirrored to MMKV, so the
 * Chat tab's unread dots (and the tab bar's) update as soon as a chat is read.
 */
type SeenStore = {
  seen: Record<string, string | null>;
  /** The seen preview for a thread (read through to MMKV once). */
  get: (threadId: string) => string | null;
  markSeen: (threadId: string, preview: string) => void;
  /**
   * Every thread's current reply counts as read. For chats that arrive all at
   * once (the guru-chat upgrade, a backup restore), which the user has seen.
   */
  markAllSeen: (threads: { id: string; lastMessagePreview: string | null }[]) => void;
};

export const useSeenStore = create<SeenStore>((set, getState) => ({
  seen: {},
  get: (threadId) => {
    const cached = getState().seen[threadId];
    if (cached !== undefined) return cached;
    const stored = Storage.getChatSeen(threadId);
    getState().seen[threadId] = stored; // cache without a re-render
    return stored;
  },
  markSeen: (threadId, preview) => {
    if (getState().seen[threadId] === preview) return;
    Storage.setChatSeen(threadId, preview);
    set((s) => ({ seen: { ...s.seen, [threadId]: preview } }));
  },
  markAllSeen: (threads) => {
    const seen: Record<string, string | null> = {};
    for (const t of threads) {
      if (!t.lastMessagePreview) continue;
      Storage.setChatSeen(t.id, t.lastMessagePreview);
      seen[t.id] = t.lastMessagePreview;
    }
    set((s) => ({ seen: { ...s.seen, ...seen } }));
  },
}));
