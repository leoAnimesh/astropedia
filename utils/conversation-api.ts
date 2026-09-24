/**
 * Conversation "API" — the boundary the chat hook talks to for history.
 *
 * Astropedia is local-first, so the source of truth is SQLite, not a server.
 * This layer wraps it with the behaviour a network-backed API would have
 * (latency, failures) so the loading / error / retry UI is real code that
 * can be exercised on demand from the dev tools, and so swapping in a remote
 * sync later only touches this file.
 */
import {
  getMessagesByThread,
  insertMessage,
  insertThread,
  updateThread,
  type Message,
  type Thread,
} from './database';
import { normalizePayload, reviveLoadedMessages } from './conversation-normalize';
import {
  ASSIGNMENT_MOCK_PAYLOAD,
  DEMO_EARLIER_SESSION,
  DEMO_HUMAN_ASTROLOGER,
} from '@/constants/demo-conversation';
import { useDevStore } from '@/stores/dev-store';
import { useThreadStore } from '@/stores/thread-store';

export class ConversationLoadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ConversationLoadError';
  }
}

const SIMULATED_LATENCY_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load a thread's history.
 * `isNew` threads aren't persisted until their first message, so there is
 * nothing to read — they resolve immediately to an empty conversation.
 */
export async function loadConversation(threadId: string, isNew: boolean): Promise<Message[]> {
  const dev = useDevStore.getState();
  if (dev.slowConversationLoad) await delay(SIMULATED_LATENCY_MS);
  if (dev.failNextConversationLoad) {
    dev.set({ failNextConversationLoad: false });
    await delay(400);
    throw new ConversationLoadError('Simulated network failure');
  }
  if (isNew) return [];
  try {
    return reviveLoadedMessages(await getMessagesByThread(threadId));
  } catch (err) {
    throw new ConversationLoadError('Could not read conversation from storage', err);
  }
}

/**
 * Consume the one-shot "fail next send" dev flag. Returns true when the
 * current send should fail.
 */
export function consumeSimulatedSendFailure(): boolean {
  const dev = useDevStore.getState();
  if (!dev.failNextMessageSend) return false;
  dev.set({ failNextMessageSend: false });
  return true;
}

function randomId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 11);
}

/**
 * Create a new persisted thread pre-filled with the assignment's mock payload
 * (plus an earlier-day session). The thread then behaves like any other:
 * new messages are answered by the on-device model.
 */
export async function seedDemoConversation(profileId: string): Promise<Thread> {
  const threadId = randomId('t_demo_');
  const thread = await insertThread({
    id:                 threadId,
    profileId,
    title:              'Career this year (demo)',
    archived:           false,
    archivedAt:         null,
    lastMessagePreview: null,
    pinned:             false,
    pinnedAt:           null,
  });

  const now = Date.now();
  const earlier = normalizePayload(DEMO_EARLIER_SESSION, {
    threadId,
    idPrefix:    `${threadId}-e`,
    startAt:     now - 26 * 60 * 60 * 1000,
    stepMs:      60_000,
    humanAuthor: DEMO_HUMAN_ASTROLOGER,
  });
  const current = normalizePayload(ASSIGNMENT_MOCK_PAYLOAD, {
    threadId,
    idPrefix:    threadId,
    startAt:     now - 4 * 60 * 1000,
    stepMs:      45_000,
    humanAuthor: DEMO_HUMAN_ASTROLOGER,
  });

  const all = [...earlier, ...current];
  for (const m of all) {
    await insertMessage(m);
  }

  const last = [...all].reverse().find((m) => m.role !== 'system');
  const preview = last ? last.content.slice(0, 80) : null;
  await updateThread(threadId, { lastMessagePreview: preview });
  const persisted: Thread = { ...thread, lastMessagePreview: preview };
  useThreadStore.getState().upsertThread(persisted);
  return persisted;
}
