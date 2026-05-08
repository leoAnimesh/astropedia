import { useCallback, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useThreadStore } from '@/stores/thread-store';
import {
  getMessagesByThread,
  insertMessage,
  insertThread,
  updateThread,
  type Message,
  type Profile,
  type Thread,
} from '@/utils/database';
import { streamAI, askAI } from '@/utils/ai';

const EMPTY_MESSAGES: Message[] = [];

function generateId(): string {
  return 'm_' + Math.random().toString(36).slice(2, 11);
}

async function generateThreadTitle(
  threadId:   string,
  profileId:  string,
  profile:    Profile,
  userMsg:    string,
  aiReply:    string,
): Promise<void> {
  try {
    const { text } = await askAI({
      profile,
      history:        [{ role: 'user', content: userMsg }, { role: 'assistant', content: aiReply }],
      userMessage:    'Give this conversation a title.',
      systemOverride: 'You are a title generator. Reply with ONLY 2–3 words as a title — no quotes, no period, no explanation.',
    });
    const title = text.trim().replace(/^["']+|["']+$/g, '').slice(0, 40);
    if (title) {
      await updateThread(threadId, { title });
      useThreadStore.getState().updateThread(threadId, profileId, { title });
    }
  } catch {
    // Non-critical — title stays as placeholder
  }
}

export function useChat(thread: Thread | null, profile: Profile | null, isNew = false) {
  const threadId = thread?.id ?? '';

  const messages   = useChatStore((s) => s.messages[threadId]  ?? EMPTY_MESSAGES);
  const isTyping   = useChatStore((s) => s.isTyping[threadId]  ?? false);
  const streamText = useChatStore((s) => s.streaming[threadId] ?? '');

  const storeSetMessages   = useChatStore((s) => s.setMessages);
  const storeAppend        = useChatStore((s) => s.appendMessage);
  const storeSetTyping     = useChatStore((s) => s.setTyping);
  const storeAppendToken   = useChatStore((s) => s.appendToken);
  const storeClearStreaming = useChatStore((s) => s.clearStreaming);

  useEffect(() => {
    if (!threadId) return;
    getMessagesByThread(threadId).then((loaded) => {
      storeSetMessages(threadId, loaded);
    });
  }, [threadId]);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || !thread || !profile) return;

    const isFirstMessage = messages.length === 0;

    // Lazily persist thread on first message
    if (isNew && isFirstMessage) {
      const persisted = await insertThread({
        id:         thread.id,
        profileId:  thread.profileId,
        title:      null,
        archived:   false,
        archivedAt: null,
      });
      useThreadStore.getState().upsertThread(persisted);
    }

    const userMsg: Message = {
      id:        generateId(),
      threadId,
      role:      'user',
      content:   text.trim(),
      modelTier: null,
      createdAt: new Date().toISOString(),
      syncedAt:  null,
    };

    storeAppend(threadId, userMsg);
    await insertMessage(userMsg);

    // Set a placeholder title immediately so the thread list shows something
    if (isFirstMessage) {
      const placeholder = text.length > 36 ? text.slice(0, 34).trim() + '…' : text;
      await updateThread(threadId, { title: placeholder });
      useThreadStore.getState().updateThread(threadId, thread.profileId, { title: placeholder });
    }

    storeSetTyping(threadId, true);
    storeClearStreaming(threadId);

    const aiMsgId = generateId();
    const aiMsgBase: Message = {
      id:        aiMsgId,
      threadId,
      role:      'assistant',
      content:   '',
      modelTier: null,
      createdAt: new Date().toISOString(),
      syncedAt:  null,
    };

    try {
      // history = prior messages only; userMessage is appended separately in the API call
      const history = messages
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const { stream, tier } = await streamAI({ profile, history, userMessage: text.trim() });

      for await (const token of stream) {
        storeAppendToken(threadId, token);
      }

      const finalText = useChatStore.getState().streaming[threadId] ?? '';
      const finalMsg  = { ...aiMsgBase, content: finalText, modelTier: tier };

      storeAppend(threadId, finalMsg);
      storeClearStreaming(threadId);
      storeSetTyping(threadId, false);

      await insertMessage(finalMsg);

      // Store last message preview (first 80 chars of AI reply) for home screen subtitle
      const preview = finalText.slice(0, 80).trim() + (finalText.length > 80 ? '…' : '');
      await updateThread(threadId, { lastMessagePreview: preview });
      useThreadStore.getState().updateThread(threadId, thread.profileId, { lastMessagePreview: preview });

      // Replace placeholder title with AI-generated one after first exchange
      if (isFirstMessage) {
        generateThreadTitle(threadId, thread.profileId, profile, text.trim(), finalText);
      }
    } catch (err) {
      console.error('[useChat] AI error:', err);
      const errorMsg = { ...aiMsgBase, content: "Something went wrong — please try again." };
      storeAppend(threadId, errorMsg);
      storeClearStreaming(threadId);
      storeSetTyping(threadId, false);
    }
  }, [thread, profile, messages, threadId, isNew]);

  return { messages, isTyping, streamText, sendMessage };
}
