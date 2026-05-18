import { create } from 'zustand';
import type { Message } from '@/utils/database';

/**
 * Visible status of a chat thread's in-flight AI reply.
 *  - 'idle'          : no reply in progress
 *  - 'loading-model' : waiting for the on-device model to load into RAM
 *  - 'thinking'      : the model is in its <think> reasoning phase
 *  - 'streaming'     : the model is emitting the actual reply (post-think)
 */
export type ChatStatus = 'idle' | 'loading-model' | 'thinking' | 'streaming';

type ChatStore = {
  // messages keyed by threadId
  messages:  Record<string, Message[]>;
  isTyping:  Record<string, boolean>;
  status:    Record<string, ChatStatus>;
  // streaming: partial text of the in-progress AI message (after <think> strip)
  streaming: Record<string, string>;

  setMessages:    (threadId: string, messages: Message[]) => void;
  appendMessage:  (threadId: string, message: Message) => void;
  updateMessage:  (threadId: string, messageId: string, content: string) => void;
  setTyping:      (threadId: string, v: boolean) => void;
  setStatus:      (threadId: string, status: ChatStatus) => void;
  appendToken:    (threadId: string, token: string) => void;
  commitStreaming: (threadId: string, messageId: string) => void;
  clearStreaming:  (threadId: string) => void;
};

export const useChatStore = create<ChatStore>((set, get) => ({
  messages:  {},
  isTyping:  {},
  status:    {},
  streaming: {},

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
}));
