import { create } from 'zustand';
import type { Message } from '@/utils/database';

type ChatStore = {
  // messages keyed by threadId
  messages:  Record<string, Message[]>;
  isTyping:  Record<string, boolean>;
  // streaming: partial text of the in-progress AI message
  streaming: Record<string, string>;

  setMessages:    (threadId: string, messages: Message[]) => void;
  appendMessage:  (threadId: string, message: Message) => void;
  updateMessage:  (threadId: string, messageId: string, content: string) => void;
  setTyping:      (threadId: string, v: boolean) => void;
  appendToken:    (threadId: string, token: string) => void;
  commitStreaming: (threadId: string, messageId: string) => void;
  clearStreaming:  (threadId: string) => void;
};

export const useChatStore = create<ChatStore>((set, get) => ({
  messages:  {},
  isTyping:  {},
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
