import { create } from 'zustand';
import type { Message, MessagePatch } from '@/utils/database';
import type { ReplySnapshot } from '@/types/conversation';

/**
 * Visible status of a chat thread's in-flight AI reply.
 *  - 'idle'          : no reply in progress
 *  - 'loading-model' : waiting for the on-device model to load into RAM
 *  - 'thinking'      : the model is in its <think> reasoning phase
 *  - 'streaming'     : the model is emitting the actual reply (post-think)
 */
export type ChatStatus = 'idle' | 'loading-model' | 'thinking' | 'streaming';

/**
 * Lifecycle of loading a thread's history.
 *  - 'loading' : "Loading conversation..."
 *  - 'error'   : "Unable to load conversation." + Retry
 *  - 'ready'   : timeline (or the "Start your conversation." empty state)
 */
export type LoadState = 'loading' | 'ready' | 'error';

type ChatStore = {
  // messages keyed by threadId
  messages:  Record<string, Message[]>;
  isTyping:  Record<string, boolean>;
  status:    Record<string, ChatStatus>;
  // streaming: partial text of the in-progress AI message (after <think> strip)
  streaming: Record<string, string>;
  loadState: Record<string, LoadState>;
  /** Message the composer is currently replying to, per thread. */
  replyTo:   Record<string, ReplySnapshot | null>;

  setMessages:    (threadId: string, messages: Message[]) => void;
  appendMessage:  (threadId: string, message: Message) => void;
  updateMessage:  (threadId: string, messageId: string, content: string) => void;
  setTyping:      (threadId: string, v: boolean) => void;
  setStatus:      (threadId: string, status: ChatStatus) => void;
  appendToken:    (threadId: string, token: string) => void;
  commitStreaming: (threadId: string, messageId: string) => void;
  clearStreaming:  (threadId: string) => void;
  /** Shallow-merge fields into one message. No-op if the id is gone. */
  patchMessage:   (threadId: string, messageId: string, patch: MessagePatch) => void;
  /** Remove a message; also clears the reply target if it pointed at it. */
  removeMessage:  (threadId: string, messageId: string) => void;
  setLoadState:   (threadId: string, state: LoadState) => void;
  setReplyTo:     (threadId: string, reply: ReplySnapshot | null) => void;
};

export const useChatStore = create<ChatStore>((set, get) => ({
  messages:  {},
  isTyping:  {},
  status:    {},
  streaming: {},
  loadState: {},
  replyTo:   {},

  setMessages: (threadId, messages) =>
    set((s) => ({ messages: { ...s.messages, [threadId]: messages } })),

  appendMessage: (threadId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: [...(s.messages[threadId] ?? []), message],
      },
    })),

  updateMessage: (threadId, messageId, content) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: (s.messages[threadId] ?? []).map((m) =>
          m.id === messageId ? { ...m, content } : m,
        ),
      },
    })),

  setTyping: (threadId, v) =>
    set((s) => ({ isTyping: { ...s.isTyping, [threadId]: v } })),

  setStatus: (threadId, status) =>
    set((s) => ({ status: { ...s.status, [threadId]: status } })),

  appendToken: (threadId, token) =>
    set((s) => ({
      streaming: {
        ...s.streaming,
        [threadId]: (s.streaming[threadId] ?? '') + token,
      },
    })),

  commitStreaming: (threadId, messageId) => {
    const text = get().streaming[threadId] ?? '';
    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: (s.messages[threadId] ?? []).map((m) =>
          m.id === messageId ? { ...m, content: text } : m,
        ),
      },
      streaming: { ...s.streaming, [threadId]: '' },
    }));
  },

  clearStreaming: (threadId) =>
    set((s) => ({ streaming: { ...s.streaming, [threadId]: '' } })),

  patchMessage: (threadId, messageId, patch) =>
    set((s) => {
      const list = s.messages[threadId];
      if (!list || !list.some((m) => m.id === messageId)) return s;
      return {
        messages: {
          ...s.messages,
          [threadId]: list.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
        },
      };
    }),

  removeMessage: (threadId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: (s.messages[threadId] ?? []).filter((m) => m.id !== messageId),
      },
      replyTo:
        s.replyTo[threadId]?.id === messageId
          ? { ...s.replyTo, [threadId]: null }
          : s.replyTo,
    })),

  setLoadState: (threadId, state) =>
    set((s) => ({ loadState: { ...s.loadState, [threadId]: state } })),

  setReplyTo: (threadId, reply) =>
    set((s) => ({ replyTo: { ...s.replyTo, [threadId]: reply } })),
}));
