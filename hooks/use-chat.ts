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
import { streamAI, askAI, stripMarkdown, stripThinking, stripJargon, stripChatArtifacts, dedupeRepetition, type AIMode } from '@/utils/ai';
import { ensureLocalLLM, isLLMReady } from '@/utils/local-llm';

const THINK_OPEN  = '<think>';
const THINK_CLOSE = '</think>';

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
      systemOverride: 'You output ONLY a 2–4 word title. No quotes, no period, no explanation, no markdown, no thinking, no preamble. Just the title.',
    });

    // Clean the title against everything models tend to leak:
    //  - <think>...</think> reasoning blocks (Qwen 3)
    //  - markdown (bold, italic, headers, bullets)
    //  - wrapping quotes
    //  - trailing punctuation
    //  - common preamble phrases ("Title:", "Here's a title:", etc.)
    let title = stripThinking(text);
    title = stripMarkdown(title);
    title = title
      .replace(/^["'`*_]+/, '')              // leading quotes / markdown
      .replace(/["'`*_]+$/, '')               // trailing quotes / markdown
      .replace(/^(title|here'?s? (a )?title)\s*[:\-—]\s*/i, '') // common preambles
      .trim()
      // Keep just the first line — titles should be one short phrase
      .split('\n')[0]
      .trim()
      // Drop trailing punctuation
      .replace(/[.!?,;:]+$/, '')
      .slice(0, 40);

    if (title) {
      await updateThread(threadId, { title });
      useThreadStore.getState().updateThread(threadId, profileId, { title });
    }
  } catch {
    // Non-critical — title stays as placeholder
  }
}

export function useChat(
  thread:    Thread | null,
  profile:   Profile | null,
  isNew:     boolean = false,
  mode:      AIMode  = 'saga',
  userName?: string,
) {
  const threadId = thread?.id ?? '';

  const messages   = useChatStore((s) => s.messages[threadId]  ?? EMPTY_MESSAGES);
  const isTyping   = useChatStore((s) => s.isTyping[threadId]  ?? false);
  const streamText = useChatStore((s) => s.streaming[threadId] ?? '');

  const storeSetMessages   = useChatStore((s) => s.setMessages);
  const storeAppend        = useChatStore((s) => s.appendMessage);
  const storeSetTyping     = useChatStore((s) => s.setTyping);
  const storeSetStatus     = useChatStore((s) => s.setStatus);
  const storeAppendToken   = useChatStore((s) => s.appendToken);
  const storeClearStreaming = useChatStore((s) => s.clearStreaming);
  const status     = useChatStore((s) => s.status[threadId]  ?? 'idle');

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
        id:                 thread.id,
        profileId:          thread.profileId,
        title:              null,
        archived:           false,
        archivedAt:         null,
        lastMessagePreview: null,
        pinned:             false,
        pinnedAt:           null,
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

    // The actual readiness check: state === 'ready' AND module loaded in RAM.
    // (getLLMState() alone can say 'ready' as soon as the model is on disk —
    // but the module may still be loading. ensureLocalLLM awaits that.)
    if (!isLLMReady()) {
      storeSetStatus(threadId, 'loading-model');
      // Wait up to 60s for the disk-cached model to fully load. ensureLocalLLM
      // resolves once isLLMReady() will return true.
      const ready = await ensureLocalLLM(60_000);
      if (!ready || !isLLMReady()) {
        const errorMsg = {
          ...buildAiMsgBase(threadId),
          content: "I couldn't load the on-device model right now. Try again in a moment.",
        };
        storeAppend(threadId, errorMsg);
        storeClearStreaming(threadId);
        storeSetStatus(threadId, 'idle');
        storeSetTyping(threadId, false);
        await insertMessage(errorMsg);
        return;
      }
    }

    storeSetStatus(threadId, 'thinking');  // assumed thinking until we see real content

    const aiMsgBase: Message = buildAiMsgBase(threadId);

    try {
      // Cap history to the last few turns so the prompt fits in the model's
      // context window. On-device models have a small max_seq_len (typically
      // 2048 tokens); the system prompt + chart + RAG eat most of it, so we
      // can only carry a short tail of the conversation forward.
      const recentHistory = messages.slice(-6).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      const { stream, tier } = await streamAI({ profile, history: recentHistory, userMessage: text.trim(), mode, userName });

      // Defensive: if streamAI returned the 'pending' offline-fallback stream,
      // the model failed to actually run. Don't display that text as a chat
      // reply — show a proper error instead.
      if (tier === 'pending') {
        for await (const _ of stream) { /* drain */ }
        throw new Error('local LLM not ready');
      }

      // Streaming filter: hide <think>...</think> from the visible buffer,
      // flip the status to 'streaming' the first time we leave the think block
      // AND emit real content. Token boundaries can split tags, so we work
      // off an accumulating buffer.
      //
      // Edge cases handled:
      //  - <think> arrives after some pre-amble was already streamed
      //    (e.g. "Sure! <think>...") → wipe the pre-amble so the user
      //    doesn't see hello-text-then-thinking-dots flickering.
      //  - </think> appears WITHOUT a preceding <think> (orphan close,
      //    common when the model truncates the opener) → treat everything
      //    before the </think> as thinking, hide it.
      let buf       = '';
      let inThink   = false;
      let seenContent = false;

      const flushSafe = (textToShow: string) => {
        if (!textToShow) return;
        let chunk = textToShow;
        if (!seenContent) {
          chunk = chunk.replace(/^\s+/, '');
          if (chunk.length === 0) return;
          seenContent = true;
        }
        storeAppendToken(threadId, chunk);
        storeSetStatus(threadId, 'streaming');
      };

      const enterThinking = () => {
        // Wipe any text that leaked into the streaming buffer before the
        // <think> opener appeared, so the user sees a clean "thinking…"
        // bubble — not "Sure!" plus dots, then a fresh reply later.
        storeClearStreaming(threadId);
        seenContent = false;
        inThink = true;
        storeSetStatus(threadId, 'thinking');
      };

      for await (const token of stream) {
        buf += token;

        // Pump the buffer through the think-tag state machine until no more
        // boundaries are visible this iteration.
        while (true) {
          if (!inThink) {
            const openIdx  = buf.indexOf(THINK_OPEN);
            const closeIdx = buf.indexOf(THINK_CLOSE);

            // Orphan </think> with no preceding <think> — model truncated
            // the opener. Treat everything up to and including the closer
            // as thinking content and drop it.
            if (closeIdx !== -1 && (openIdx === -1 || closeIdx < openIdx)) {
              enterThinking();
              buf = buf.slice(closeIdx + THINK_CLOSE.length);
              inThink = false;
              continue;
            }

            if (openIdx === -1) {
              // No tag in buffer — yield safe prefix, keep tail in case of
              // a partial tag bridging the next chunk.
              const tail = THINK_OPEN.length - 1;
              const safeEnd = Math.max(0, buf.length - tail);
              if (safeEnd > 0) {
                flushSafe(buf.slice(0, safeEnd));
                buf = buf.slice(safeEnd);
              }
              break;
            } else {
              buf = buf.slice(openIdx + THINK_OPEN.length);
              enterThinking();
            }
          } else {
            const end = buf.indexOf(THINK_CLOSE);
            if (end === -1) {
              // Still in thinking — discard most of buffer keeping tail for partial close tag.
              const tail = THINK_CLOSE.length - 1;
              const safeEnd = Math.max(0, buf.length - tail);
              buf = buf.slice(safeEnd);
              break;
            } else {
              buf = buf.slice(end + THINK_CLOSE.length);
              inThink = false;
              // Keep status='thinking' until flushSafe actually emits real
              // content — otherwise we'd show an empty 'streaming' bubble
              // when the model emits whitespace (or nothing) after </think>.
            }
          }
        }
      }
      // Flush any trailing safe content (only if we're not stuck in think).
      if (!inThink && buf.length > 0) flushSafe(buf);

      const rawFinal  = useChatStore.getState().streaming[threadId] ?? '';
      // Final cleanup chain. Order matters — we keep markdown in the text
      // (the chat bubble renders it) but strip everything else that's
      // harmful or off-format.
      //  - stripThinking     : remove <think>...</think> blocks
      //  - stripJargon       : translate Sanskrit + collapse raw ISO dates
      //  - stripChatArtifacts: remove "Part 1" labels, dedupe Gita prefixes
      //  - dedupeRepetition  : trim sentence-level loops
      const finalText = dedupeRepetition(
        stripChatArtifacts(
          stripJargon(stripThinking(rawFinal)),
        ),
      ).trim();

      // If the reply is empty (model truncated mid-think, emitted only
      // whitespace, or hit an edge case), drop the typing state silently
      // instead of saving an empty message or a frustrating retry-blame
      // string. The user can re-send naturally.
      if (finalText.length === 0) {
        storeClearStreaming(threadId);
        storeSetStatus(threadId, 'idle');
        storeSetTyping(threadId, false);
        return;
      }

      const finalMsg  = { ...aiMsgBase, content: finalText, modelTier: tier };

      storeAppend(threadId, finalMsg);
      storeClearStreaming(threadId);
      storeSetStatus(threadId, 'idle');
      storeSetTyping(threadId, false);

      await insertMessage(finalMsg);

      const preview = finalText.slice(0, 80).trim() + (finalText.length > 80 ? '…' : '');
      await updateThread(threadId, { lastMessagePreview: preview });
      useThreadStore.getState().updateThread(threadId, thread.profileId, { lastMessagePreview: preview });

      if (isFirstMessage) {
        generateThreadTitle(threadId, thread.profileId, profile, text.trim(), finalText);
      }
    } catch (err) {
      console.error('[useChat] AI error:', err);
      const errorMsg = { ...aiMsgBase, content: "Something went wrong — please try again." };
      storeAppend(threadId, errorMsg);
      storeClearStreaming(threadId);
      storeSetStatus(threadId, 'idle');
      storeSetTyping(threadId, false);
    }
  }, [thread, profile, messages, threadId, isNew, mode, userName, status]);

  return { messages, isTyping, status, streamText, sendMessage };
}

function buildAiMsgBase(threadId: string): Message {
  return {
    id:        'm_' + Math.random().toString(36).slice(2, 11),
    threadId,
    role:      'assistant',
    content:   '',
    modelTier: null,
    createdAt: new Date().toISOString(),
    syncedAt:  null,
  };
}
