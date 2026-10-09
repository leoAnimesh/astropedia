import { useCallback, useEffect, useState } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useThreadStore } from '@/stores/thread-store';
import { useProfileStore } from '@/stores/profile-store';
import {
  getMessagesByThread,
  insertMessage,
  insertThread,
  updateThread,
  type Message,
  type Profile,
  type Thread,
} from '@/utils/database';
import { questionTitle } from '@/utils/agent/strings';
import { streamAI, askThreadTitle, stripMarkdown, stripThinking, stripJargon, stripChatArtifacts, dedupeRepetition, type AIMode } from '@/utils/ai';
import { ensureLocalLLM, isLLMReady } from '@/utils/local-llm';
import { isModelReady, waitForModelReady } from '@/utils/model-download';
import { GITA_QUOTE_START } from '@/utils/gita';
import i18n from '@/utils/i18n';
import type { AgentId } from '@/constants/gurus';

const THINK_OPEN  = '<think>';
const THINK_CLOSE = '</think>';

// Typewriter pacing for streamed replies. The on-device model produces text
// faster than it reads comfortably, so tokens are queued and revealed at a
// steady ~50 chars/s; a long backlog speeds up gently so the bubble never
// lags far behind the model.
const TYPE_TICK_MS         = 40;
const TYPE_CHARS_PER_TICK  = 2;
const TYPE_CATCHUP_DIVISOR = 150;

function createTypewriter(emit: (text: string) => void) {
  let queue = '';
  let timer: ReturnType<typeof setInterval> | null = null;
  let onDrained: (() => void) | null = null;

  const finish = () => {
    if (timer) clearInterval(timer);
    timer = null;
    onDrained?.();
    onDrained = null;
  };

  const tick = () => {
    if (!queue) return finish();
    let n = Math.max(TYPE_CHARS_PER_TICK, Math.ceil(queue.length / TYPE_CATCHUP_DIVISOR));
    // Don't split a surrogate pair (emoji) across ticks.
    const code = queue.charCodeAt(n - 1);
    if (code >= 0xd800 && code <= 0xdbff) n++;
    emit(queue.slice(0, n));
    queue = queue.slice(n);
  };

  return {
    push(text: string) {
      queue += text;
      if (!timer) timer = setInterval(tick, TYPE_TICK_MS);
    },
    /** Resolves once everything queued so far has been shown. */
    drain(): Promise<void> {
      if (!timer) return Promise.resolve();
      return new Promise((resolve) => { onDrained = resolve; });
    },
    /** Drop anything not yet shown. */
    stop() {
      queue = '';
      finish();
    },
  };
}

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
    // Leave out Krishna's appended verse; titles describe the exchange itself.
    const result = await askThreadTitle(userMsg, aiReply.split(GITA_QUOTE_START)[0].trim());
    // No model: the placeholder (the first question, cut short) already is the title.
    if (!result || result.source !== 'model') return;
    const text = result.text;

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

/** True for the error bubbles sendMessage adds (any app language). */
export function isChatErrorMessage(m: Pick<Message, 'role' | 'content'>): boolean {
  if (m.role !== 'assistant') return false;
  return ['chat:errors.generic', 'chat:errors.modelLoad', 'chat:errors.modelPreparing'].some((key) =>
    (['en', 'hi', 'bn'] as const).some((lng) => i18n.t(key, { lng, postProcess: [] }) === m.content || i18n.t(key, { lng }) === m.content),
  ) || m.content === "I couldn't load the on-device model right now. Try again in a moment.";
}

export function useChat(
  thread:    Thread | null,
  profile:   Profile | null,
  isNew:     boolean = false,
  mode:      AIMode  = 'saga',
  userName?: string,
  /** Guru of this chat; stored on the thread and picks the app-side rules. */
  agent:     AgentId = mode,
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

  // Which thread's saved messages have been read from SQLite. Until then a
  // send would race the load (and the load would drop the new bubble).
  const [loadedId, setLoadedId] = useState<string | null>(null);
  useEffect(() => {
    if (!threadId) return;
    let alive = true;
    getMessagesByThread(threadId)
      .then((loaded) => {
        if (!alive) return;
        // A thread not saved yet has nothing in SQLite: keep any bubble sent
        // while this read was in flight instead of wiping it.
        const current = useChatStore.getState().messages[threadId] ?? [];
        storeSetMessages(threadId, loaded.length > 0 || current.length === 0 ? loaded : current);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoadedId(threadId); });
    return () => { alive = false; };
  }, [threadId]);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || !thread || !profile) return;

    const isFirstMessage = messages.length === 0;

    // Lazily persist thread on first message
    if (isNew && isFirstMessage) {
      const persisted = await insertThread({
        id:                 thread.id,
        profileId:          thread.profileId,
        agent,
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
      const placeholder = questionTitle(text);
      await updateThread(threadId, { title: placeholder });
      useThreadStore.getState().updateThread(threadId, thread.profileId, { title: placeholder });
    }

    storeSetTyping(threadId, true);
    storeClearStreaming(threadId);

    // The actual readiness check: state === 'ready' AND module loaded in RAM.
    // (getLLMState() alone can say 'ready' as soon as the model is on disk —
    // but the module may still be loading. ensureLocalLLM awaits that.)
    // While the model is still downloading this is skipped: deterministic
    // replies don't need it, and a model reply waits for the download below.
    if (!isLLMReady() && isModelReady()) {
      storeSetStatus(threadId, 'loading-model');
      // Wait up to 60s for the disk-cached model to fully load. ensureLocalLLM
      // resolves once isLLMReady() will return true.
      const ready = await ensureLocalLLM(60_000);
      if (!ready || !isLLMReady()) {
        // Saved in English (stored messages are fed back to the model as
        // history); the bubble shown now uses the app language.
        const errorMsg = {
          ...buildAiMsgBase(threadId),
          content: "I couldn't load the on-device model right now. Try again in a moment.",
        };
        storeAppend(threadId, { ...errorMsg, content: i18n.t('chat:errors.modelLoad') });
        storeClearStreaming(threadId);
        storeSetStatus(threadId, 'idle');
        storeSetTyping(threadId, false);
        await insertMessage(errorMsg);
        return;
      }
    }

    storeSetStatus(threadId, 'thinking');  // assumed thinking until we see real content

    const aiMsgBase: Message = buildAiMsgBase(threadId);
    let activeTyper: ReturnType<typeof createTypewriter> | null = null;

    try {
      // Cap history to the last few turns so the prompt fits in the model's
      // context window. On-device models have a small max_seq_len (typically
      // 2048 tokens); the system prompt + chart + RAG eat most of it, so we
      // can only carry a short tail of the conversation forward.
      // Translated error bubbles go back to the model in English.
      const toEnglish: Record<string, string> = {
        [i18n.t('chat:errors.modelLoad')]: i18n.t('chat:errors.modelLoad', { lng: 'en' }),
        [i18n.t('chat:errors.generic')]:   i18n.t('chat:errors.generic', { lng: 'en' }),
      };
      // 12 messages: the prompts still keep only what fits (gemma: the last 4), but the verify
      // layer checks a new reply against every earlier answer in this tail (no repeats).
      const recentHistory = messages.slice(-12).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: toEnglish[m.content] ?? m.content,
      }));
      const people = useProfileStore.getState().profiles;
      const request = { profile, people, history: recentHistory, userMessage: text.trim(), mode, userName, agent };
      let { stream, tier } = await streamAI(request);

      // The model is still downloading (utils/model-download.ts): wait for
      // it with the "waking" status; the inline pill shows the progress.
      if (tier === 'pending' && !isModelReady()) {
        for await (const _ of stream) { /* drain */ }
        storeSetStatus(threadId, 'loading-model');
        const ready = (await waitForModelReady()) && (await ensureLocalLLM(60_000));
        if (!ready) {
          // Shown only (not saved), like the generic error.
          storeAppend(threadId, { ...buildAiMsgBase(threadId), content: i18n.t('chat:errors.modelPreparing') });
          storeClearStreaming(threadId);
          storeSetStatus(threadId, 'idle');
          storeSetTyping(threadId, false);
          return;
        }
        storeSetStatus(threadId, 'thinking');
        ({ stream, tier } = await streamAI(request));
      }

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
      const typer = createTypewriter((chunk) => storeAppendToken(threadId, chunk));
      activeTyper = typer;

      const flushSafe = (textToShow: string) => {
        if (!textToShow) return;
        let chunk = textToShow;
        if (!seenContent) {
          chunk = chunk.replace(/^\s+/, '');
          if (chunk.length === 0) return;
          seenContent = true;
        }
        typer.push(chunk);
        storeSetStatus(threadId, 'streaming');
      };

      const enterThinking = () => {
        typer.stop();
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
      // Let the typewriter finish revealing before the final cleanup reads
      // the streamed text.
      await typer.drain();

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
      activeTyper = null;

      // The reply is already on screen. A failure while saving it must not
      // add a "Something went wrong" bubble under a good answer — log it.
      try {
        await insertMessage(finalMsg);

        const preview = finalText.slice(0, 80).trim() + (finalText.length > 80 ? '…' : '');
        await updateThread(threadId, { lastMessagePreview: preview });
        // updated_at moves in SQLite too; the Chat tab shows it as "2h".
        useThreadStore.getState().updateThread(threadId, thread.profileId, {
          lastMessagePreview: preview, updatedAt: new Date().toISOString(),
        });

        if (isFirstMessage) {
          generateThreadTitle(threadId, thread.profileId, profile, text.trim(), finalText);
        }
      } catch (err) {
        console.error('[useChat] saving reply failed:', err);
      }
    } catch (err) {
      activeTyper?.stop();
      console.error('[useChat] AI error:', err);
      // Shown only (not saved), so it can be in the app language. Own id, so
      // it can never collide with a reply bubble.
      const errorMsg = { ...buildAiMsgBase(threadId), content: i18n.t('chat:errors.generic') };
      storeAppend(threadId, errorMsg);
      storeClearStreaming(threadId);
      storeSetStatus(threadId, 'idle');
      storeSetTyping(threadId, false);
    }
  }, [thread, profile, messages, threadId, isNew, mode, userName, status, agent]);

  return { messages, isTyping, status, streamText, sendMessage, loaded: !!threadId && loadedId === threadId };
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
