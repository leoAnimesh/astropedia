import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useThreadStore } from '@/stores/thread-store';
import {
  getThreadsByProfile,
  getAllThreads,
  insertThread,
  updateThread as dbUpdateThread,
  deleteThread as dbDeleteThread,
  type Thread,
} from '@/utils/database';

// Stable fallback — must be module-level so the reference never changes
const EMPTY_THREADS: Thread[] = [];

function generateId(): string {
  return 't_' + Math.random().toString(36).slice(2, 11);
}

export function useThreads(profileId: string | null) {
  const threads        = useThreadStore((s) => (profileId ? (s.threads[profileId] ?? EMPTY_THREADS) : EMPTY_THREADS));
  const storeSetThreads  = useThreadStore((s) => s.setThreads);
  const storeUpsert      = useThreadStore((s) => s.upsertThread);
  const storeRemove      = useThreadStore((s) => s.removeThread);
  const storeUpdate      = useThreadStore((s) => s.updateThread);

  useEffect(() => {
    if (!profileId) return;
    getThreadsByProfile(profileId).then((loaded) => {
      storeSetThreads(profileId, loaded);
    });
  }, [profileId]);

  const activeThreads   = threads.filter((t) => !t.archived);
  const archivedThreads = threads.filter((t) => t.archived);

  const createThread = useCallback(async (): Promise<Thread> => {
    if (!profileId) throw new Error('No active profile');
    const thread = await insertThread({
      id:                 generateId(),
      profileId,
      title:              null,
      archived:           false,
      archivedAt:         null,
      lastMessagePreview: null,
    });
    storeUpsert(thread);
    return thread;
  }, [profileId, storeUpsert]);

  const renameThread = useCallback(async (threadId: string, title: string): Promise<void> => {
    if (!profileId) return;
    await dbUpdateThread(threadId, { title });
    storeUpdate(threadId, profileId, { title });
  }, [profileId, storeUpdate]);

  const archiveThread = useCallback(async (threadId: string): Promise<void> => {
    if (!profileId) return;
    const now = new Date().toISOString();
    await dbUpdateThread(threadId, { archived: true, archivedAt: now });
    storeUpdate(threadId, profileId, { archived: true, archivedAt: now });
  }, [profileId, storeUpdate]);

  const unarchiveThread = useCallback(async (threadId: string): Promise<void> => {
    if (!profileId) return;
    await dbUpdateThread(threadId, { archived: false, archivedAt: null });
    storeUpdate(threadId, profileId, { archived: false, archivedAt: null });
  }, [profileId, storeUpdate]);

  const removeThread = useCallback(async (threadId: string): Promise<void> => {
    if (!profileId) return;
    await dbDeleteThread(threadId);
    storeRemove(threadId, profileId);
  }, [profileId, storeRemove]);

  return {
    threads,
    activeThreads,
    archivedThreads,
    createThread,
    renameThread,
    archiveThread,
    unarchiveThread,
    removeThread,
  };
}

// For the archived screen — fetches all archived threads across profiles
export function useAllArchivedThreads() {
  // useShallow does a shallow array comparison so a new flat array doesn't re-render unless content changed
  const allThreads = useThreadStore(useShallow((s) => Object.values(s.threads).flat()));
  const storeSetThreads = useThreadStore((s) => s.setThreads);
  const storeUpdate = useThreadStore((s) => s.updateThread);
  const storeRemove = useThreadStore((s) => s.removeThread);

  useEffect(() => {
    getAllThreads().then((all) => {
      const byProfile: Record<string, Thread[]> = {};
      for (const t of all) {
        (byProfile[t.profileId] ??= []).push(t);
      }
      for (const [pid, ts] of Object.entries(byProfile)) {
        storeSetThreads(pid, ts);
      }
    });
  }, []);

  const archived = allThreads.filter((t) => t.archived);

  const unarchiveThread = useCallback(async (thread: Thread): Promise<void> => {
    await dbUpdateThread(thread.id, { archived: false, archivedAt: null });
    storeUpdate(thread.id, thread.profileId, { archived: false, archivedAt: null });
  }, [storeUpdate]);

  const removeThread = useCallback(async (thread: Thread): Promise<void> => {
    await dbDeleteThread(thread.id);
    storeRemove(thread.id, thread.profileId);
  }, [storeRemove]);

  return { archived, unarchiveThread, removeThread };
}
