import { create } from 'zustand';

/**
 * Developer-only switches for demoing failure paths (screen recordings, QA).
 * In-memory on purpose: a relaunch always starts with every toggle off, so a
 * forgotten switch can never break a real session.
 *
 * Only surfaced in the UI when `__DEV__` is true.
 */
type DevStore = {
  /**
   * One-shot: the next conversation load fails -> "Unable to load
   * conversation." The flag clears itself when it fires, so tapping Retry
   * demonstrates recovery.
   */
  failNextConversationLoad: boolean;
  /** One-shot: the next send fails after a short delay -> Failed / Retry. */
  failNextMessageSend:      boolean;
  /** Add ~1.2 s latency to conversation loads so the loading state is visible. */
  slowConversationLoad: boolean;

  set: (patch: Partial<Omit<DevStore, 'set'>>) => void;
};

export const useDevStore = create<DevStore>((set) => ({
  failNextConversationLoad: false,
  failNextMessageSend:      false,
  slowConversationLoad: false,
  set: (patch) => set(patch),
}));
