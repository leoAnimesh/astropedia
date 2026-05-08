import { create } from 'zustand';
import type { Thread } from '@/utils/database';

type ThreadStore = {
  // keyed by profileId
  threads: Record<string, Thread[]>;
  setThreads: (profileId: string, threads: Thread[]) => void;
  upsertThread: (thread: Thread) => void;
  removeThread: (threadId: string, profileId: string) => void;
  updateThread: (threadId: string, profileId: string, patch: Partial<Thread>) => void;
};

export const useThreadStore = create<ThreadStore>((set) => ({
  threads: {},

  setThreads: (profileId, threads) =>
    set((s) => ({ threads: { ...s.threads, [profileId]: threads } })),

  upsertThread: (thread) =>
    set((s) => {
      const existing = s.threads[thread.profileId] ?? [];
      const found = existing.some((t) => t.id === thread.id);
      return {
        threads: {
          ...s.threads,
          [thread.profileId]: found
            ? existing.map((t) => (t.id === thread.id ? thread : t))
            : [thread, ...existing],
        },
      };
    }),

  removeThread: (threadId, profileId) =>
    set((s) => ({
      threads: {
        ...s.threads,
        [profileId]: (s.threads[profileId] ?? []).filter((t) => t.id !== threadId),
      },
    })),

  updateThread: (threadId, profileId, patch) =>
    set((s) => ({
      threads: {
        ...s.threads,
        [profileId]: (s.threads[profileId] ?? []).map((t) =>
          t.id === threadId ? { ...t, ...patch } : t,
        ),
      },
    })),
}));
