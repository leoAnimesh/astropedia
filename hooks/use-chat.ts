import { useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useThreadStore } from '@/stores/thread-store';
import {
  deleteMessage as dbDeleteMessage,
  insertMessage,
  insertThread,
  updateMessage as dbUpdateMessage,
  updateThread,
  type Message,
  type MessagePatch,
  type Profile,
  type Thread,
} from '@/utils/database';
import { streamAI, askAI, stripMarkdown, stripThinking, stripJargon, stripChatArtifacts, dedupeRepetition, type AIMode } from '@/utils/ai';
import { ensureLocalLLM, isLLMReady } from '@/utils/local-llm';
import { classifyDeterministic } from '@/utils/deterministic';
import { consumeSimulatedSendFailure, loadConversation } from '@/utils/conversation-api';
import { useDevStore } from '@/stores/dev-store';
import { deriveRecommendations, splitRecsBlock, stripRecsForDisplay } from '@/utils/recommendations';
import type { FailureReason, MessageFeedback, ReplySnapshot } from '@/types/conversation';

const THINK_OPEN  = '<think>';
const THINK_CLOSE = '</think>';

const EMPTY_MESSAGES: Message[] = [];

/**
 * Cap on prior messages sent to the model (≈3 user/assistant exchanges).
 * On-device models have a small max_seq_len (typically 2048 tokens); the
 * system prompt + chart + RAG (2 chunks) + recs instructions eat most of it.
 */
const HISTORY_LIMIT = 6;

/** Delay before a dev-simulated send failure surfaces, so "Sending…" is visible. */
const SIMULATED_FAILURE_DELAY_MS = 900;

function generateId(prefix = 'm_'): string {
  return prefix + Math.random().toString(36).slice(2, 11);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A failure we can explain to the user (drives the Failed · Retry line). */
class GenerationFailure extends Error {
  constructor(readonly reason: FailureReason) {
    super(reason);
    this.name = 'GenerationFailure';
  }
}

export function personaName(mode: AIMode): string {
  return mode === 'krishna' ? 'Krishna' : 'Saga';
}

/** Display name for a message's author, used by reply quotes and labels. */
export function authorLabel(m: Pick<Message, 'role' | 'authorName'>, mode: AIMode): string {
  switch (m.role) {
    case 'user':      return 'You';
    case 'assistant': return personaName(mode);
    case 'human':     return m.authorName ?? 'Astrologer';
    default:          return 'Session';
  }
}

export function buildReplySnapshot(m: Message, mode: AIMode): ReplySnapshot {
  const flat = m.content.replace(/\s+/g, ' ').trim();
  return {
    id:      m.id,
    role:    m.role,
    author:  authorLabel(m, mode),
    preview: flat.length > 140 ? flat.slice(0, 138).trimEnd() + '…' : flat,
  };
}

/** Prefix the prompt with the quoted message so the model knows the context. */
function withReplyContext(text: string, reply: ReplySnapshot | null | undefined): string {
  if (!reply) return text;
  return `(Replying to ${reply.author}'s message: "${reply.preview}")\n\n${text}`;
}

function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.slice(0, 80).trim() + (flat.length > 80 ? '…' : '');
}

/**
 * Conversation history for the model: only real user/assistant turns before
 * `beforeId`, skipping user messages that never got a reply. System events
 * and human-astrologer notes are UI-only.
 */
function buildHistory(messages: Message[], beforeId: string) {
  const idx = messages.findIndex((m) => m.id === beforeId);
  const prior = idx === -1 ? messages : messages.slice(0, idx);
  return prior
    .filter((m) =>
      m.role === 'assistant' ||
      (m.role === 'user' && (m.status ?? 'sent') === 'sent'),
    )
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
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

/**
 * Pump the model's token stream through the <think> filter into the
 * thread's streaming buffer. Unchanged behaviour from the original hook —
 * only extracted so send and retry share it.
 */
async function pumpStream(threadId: string, stream: AsyncGenerator<string>): Promise<void> {
  const { appendToken, setStatus, clearStreaming } = useChatStore.getState();

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
  // The trailing <recs> block is kept in the buffer (it is parsed after
  // completion) and hidden at render time by stripRecsForDisplay.
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
    appendToken(threadId, chunk);
    setStatus(threadId, 'streaming');
  };

  const enterThinking = () => {
    // Wipe any text that leaked into the streaming buffer before the
    // <think> opener appeared, so the user sees a clean "thinking…"
    // bubble — not "Sure!" plus dots, then a fresh reply later.
    clearStreaming(threadId);
    seenContent = false;
    inThink = true;
    setStatus(threadId, 'thinking');
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
  const status     = useChatStore((s) => s.status[threadId]    ?? 'idle');
  const loadState  = useChatStore((s) => s.loadState[threadId] ?? 'loading');
  const replyTo    = useChatStore((s) => s.replyTo[threadId]   ?? null);

  // Synchronous re-entrancy lock. The store's isTyping flag is the
  // cross-screen truth, but a double-tap can fire twice before React
  // re-renders — this ref closes that window.
  const inFlight = useRef(false);

  // ── Loading ────────────────────────────────────────────────────────────────

  /**
   * Load (or refresh) the thread. Threads already in memory refresh silently
   * (stale-while-revalidate) so re-opening a chat never flashes a spinner;
   * `showLoading` forces the loading state (explicit reload / Retry).
   */
  const reload = useCallback(async (showLoading: boolean = false) => {
    if (!threadId) return;
    const store = useChatStore.getState();
    // A reply is still generating for this thread (user left and came back):
    // the in-memory list is newer than the DB, so keep it.
    if (store.isTyping[threadId]) {
      store.setLoadState(threadId, 'ready');
      return;
    }
    const cached = store.messages[threadId] !== undefined && store.loadState[threadId] === 'ready';
    if (showLoading || !cached || useDevStore.getState().slowConversationLoad) {
      store.setLoadState(threadId, 'loading');
    }
    try {
      const loaded = await loadConversation(threadId, isNew);
      const current = useChatStore.getState().messages[threadId];
      // Never clobber messages the user already sent into a brand-new thread.
      if (!(isNew && current && current.length > 0)) {
        useChatStore.getState().setMessages(threadId, loaded);
      }
      useChatStore.getState().setLoadState(threadId, 'ready');
    } catch (err) {
      console.warn('[useChat] load failed:', err);
      useChatStore.getState().setLoadState(threadId, 'error');
    }
  }, [threadId, isNew]);

  useEffect(() => {
    reload(false);
  }, [reload]);

  // ── Helpers bound to this thread ───────────────────────────────────────────

  const patchMessage = useCallback((id: string, patch: MessagePatch) => {
    useChatStore.getState().patchMessage(threadId, id, patch);
    dbUpdateMessage(id, patch).catch((err) => console.warn('[useChat] persist patch failed:', err));
  }, [threadId]);

  const finishTyping = useCallback(() => {
    const s = useChatStore.getState();
    s.clearStreaming(threadId);
    s.setStatus(threadId, 'idle');
    s.setTyping(threadId, false);
    inFlight.current = false;
  }, [threadId]);

  /**
   * Run one on-device generation answering `userMsg`. Shared by send and
   * retry. Maps real model states onto the message's delivery status:
   *   sending → (model accepted the prompt) sent → reply appended
   *   sending → failed(reason) on any failure; Retry calls this again.
   */
  const runGeneration = useCallback(async (userMsg: Message): Promise<void> => {
    if (!thread || !profile) { finishTyping(); return; }
    const store = useChatStore.getState();
    const text  = userMsg.content;
    const generateTitle = !(store.messages[threadId] ?? []).some((m) => m.role === 'assistant');

    store.clearStreaming(threadId);

    try {
      if (consumeSimulatedSendFailure()) {
        await delay(SIMULATED_FAILURE_DELAY_MS);
        throw new GenerationFailure('simulated');
      }

      // Instant chart lookups (sun sign, dasha, moon phase…) don't need the
      // model at all, so only block on model load for real generations.
      const needsModel = !(mode === 'saga' && classifyDeterministic(text));

      // The actual readiness check: state === 'ready' AND module loaded in RAM.
      // (getLLMState() alone can say 'ready' as soon as the model is on disk —
      // but the module may still be loading. ensureLocalLLM awaits that.)
      if (needsModel && !isLLMReady()) {
        store.setStatus(threadId, 'loading-model');
        // Wait up to 60s for the disk-cached model to fully load. If it isn't
        // downloaded yet this returns false immediately (download continues
        // in the background) and the message fails with a Retry.
        const ready = await ensureLocalLLM(60_000);
        if (!ready || !isLLMReady()) throw new GenerationFailure('model-unavailable');
      }

      store.setStatus(threadId, 'thinking');  // assumed thinking until we see real content

      const history = buildHistory(useChatStore.getState().messages[threadId] ?? [], userMsg.id);
      const { stream, tier } = await streamAI({
        profile,
        history,
        userMessage: withReplyContext(text, userMsg.replyTo),
        mode,
        userName,
        withRecommendations: mode === 'saga',
      });

      // Defensive: if streamAI returned the 'pending' offline-fallback stream,
      // the model failed to actually run. Don't display that text as a chat
      // reply — fail the message so the user can retry.
      if (tier === 'pending') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) { /* drain */ }
        throw new GenerationFailure('model-unavailable');
      }

      // The model accepted the prompt — the message is delivered.
      patchMessage(userMsg.id, { status: 'sent', failureReason: null });

      try {
        await pumpStream(threadId, stream);
      } catch (err) {
        console.error('[useChat] generation error:', err);
        throw new GenerationFailure('generation-failed');
      }

      const rawFinal = useChatStore.getState().streaming[threadId] ?? '';
      // Split off the <recs> block, then the original cleanup chain. Order
      // matters — we keep markdown in the text (the chat bubble renders it)
      // but strip everything else that's harmful or off-format.
      //  - stripThinking     : remove <think>...</think> blocks
      //  - stripJargon       : translate Sanskrit + collapse raw ISO dates
      //  - stripChatArtifacts: remove "Part 1" labels, dedupe Gita prefixes
      //  - dedupeRepetition  : trim sentence-level loops
      const { prose } = splitRecsBlock(rawFinal);
      const finalText = dedupeRepetition(
        stripChatArtifacts(
          stripJargon(stripThinking(stripRecsForDisplay(prose))),
        ),
      ).trim();

      // Model truncated mid-think or emitted only whitespace — surface it as
      // a retryable failure instead of silently dropping the turn.
      if (finalText.length === 0) throw new GenerationFailure('empty-reply');

      const aiId = generateId();
      const finalMsg: Message = {
        id:              aiId,
        threadId,
        role:            'assistant',
        content:         finalText,
        modelTier:       tier,
        createdAt:       new Date().toISOString(),
        syncedAt:        null,
        recommendations: deriveRecommendations({ profile, mode, userText: text, rawReply: rawFinal, messageId: aiId }),
        feedback:        null,
        replyTo:         null,
      };

      useChatStore.getState().appendMessage(threadId, finalMsg);
      finishTyping();

      try {
        await insertMessage(finalMsg);
        const preview = previewOf(finalText);
        await updateThread(threadId, { lastMessagePreview: preview });
        useThreadStore.getState().updateThread(threadId, thread.profileId, { lastMessagePreview: preview });
      } catch (err) {
        console.warn('[useChat] persisting reply failed:', err);
      }

      if (generateTitle) {
        generateThreadTitle(threadId, thread.profileId, profile, text, finalText);
      }
    } catch (err) {
      const reason: FailureReason = err instanceof GenerationFailure ? err.reason : 'generation-failed';
      if (!(err instanceof GenerationFailure)) console.error('[useChat] AI error:', err);
      patchMessage(userMsg.id, { status: 'failed', failureReason: reason });
    } finally {
      finishTyping();
    }
  }, [thread, profile, threadId, mode, userName, patchMessage, finishTyping]);

  // ── Public actions ─────────────────────────────────────────────────────────

  /**
   * Optimistically add the user's message and generate a reply on-device.
   * Returns false when the send was rejected (empty text, a reply already in
   * progress, conversation not loaded) so the composer can keep the draft.
   */
  const sendMessage = useCallback((text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed || !thread || !profile) return false;
    const store = useChatStore.getState();
    if (inFlight.current || store.isTyping[threadId]) return false;
    if ((store.loadState[threadId] ?? 'loading') !== 'ready') return false;

    // Take the lock synchronously, before any await.
    inFlight.current = true;
    store.setTyping(threadId, true);

    const existing       = store.messages[threadId] ?? [];
    const isFirstMessage = !existing.some((m) => m.role === 'user');
    const reply          = store.replyTo[threadId] ?? null;
    const now            = Date.now();

    const sessionMsg: Message | null =
      isNew && existing.length === 0
        ? {
            id:        generateId(),
            threadId,
            role:      'system',
            content:   `Your session with ${personaName(mode)} has started.`,
            modelTier: null,
            createdAt: new Date(now - 1).toISOString(),
            syncedAt:  null,
          }
        : null;

    const userMsg: Message = {
      id:            generateId(),
      threadId,
      role:          'user',
      content:       trimmed,
      modelTier:     null,
      createdAt:     new Date(now).toISOString(),
      syncedAt:      null,
      status:        'sending',
      failureReason: null,
      replyTo:       reply,
    };

    if (sessionMsg) store.appendMessage(threadId, sessionMsg);
    store.appendMessage(threadId, userMsg);
    store.setReplyTo(threadId, null);

    // Everything below is async; the caller only needs to know the message
    // was accepted (so the composer can clear its draft immediately).
    void (async () => {
      try {
        // Lazily persist thread on first message. Idempotent: if the user
        // deleted every message and starts over, the row already exists.
        if (isNew && isFirstMessage) {
          try {
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
          } catch (err) {
            if (!/UNIQUE|constraint/i.test(String(err))) throw err;
          }
        }
        if (sessionMsg) await insertMessage(sessionMsg);
        await insertMessage(userMsg);

        // Set a placeholder title immediately so the thread list shows something
        if (isFirstMessage) {
          const placeholder = trimmed.length > 36 ? trimmed.slice(0, 34).trim() + '…' : trimmed;
          await updateThread(threadId, { title: placeholder });
          useThreadStore.getState().updateThread(threadId, thread.profileId, { title: placeholder });
        }
      } catch (err) {
        console.error('[useChat] persisting message failed:', err);
        useChatStore.getState().patchMessage(threadId, userMsg.id, { status: 'failed', failureReason: 'storage' });
        finishTyping();
        return;
      }

      await runGeneration(userMsg);
    })();

    return true;
  }, [thread, profile, threadId, isNew, mode, runGeneration, finishTyping]);

  /** Re-run generation for a failed user message (no duplicate message). */
  const retryMessage = useCallback(async (messageId: string): Promise<void> => {
    const store = useChatStore.getState();
    const msg = (store.messages[threadId] ?? []).find((m) => m.id === messageId);
    if (!msg || msg.role !== 'user' || msg.status !== 'failed') return;
    if (inFlight.current || store.isTyping[threadId]) return;

    inFlight.current = true;
    store.setTyping(threadId, true);

    const list = store.messages[threadId] ?? [];
    const isLatest = list[list.length - 1]?.id === messageId;
    let retried: Message = { ...msg, status: 'sending', failureReason: null };
    if (isLatest) {
      patchMessage(messageId, { status: 'sending', failureReason: null });
    } else {
      // Older failed message: move it to the end (like a re-send) so the
      // reply lands next to it instead of above newer messages.
      retried = { ...retried, createdAt: new Date().toISOString() };
      store.removeMessage(threadId, messageId);
      store.appendMessage(threadId, retried);
      dbUpdateMessage(messageId, { status: 'sending', failureReason: null, createdAt: retried.createdAt })
        .catch((err) => console.warn('[useChat] persist retry failed:', err));
    }
    await runGeneration(retried);
  }, [threadId, patchMessage, runGeneration]);

  /**
   * Remove a message locally and from SQLite. The list keeps the user's
   * scroll position (see maintainVisibleContentPosition on the FlatList).
   * A user message that is still sending can't be deleted.
   */
  const deleteMessage = useCallback(async (messageId: string): Promise<void> => {
    const store = useChatStore.getState();
    const msg = (store.messages[threadId] ?? []).find((m) => m.id === messageId);
    if (!msg) return;
    if (msg.role === 'user' && msg.status === 'sending') return;

    store.removeMessage(threadId, messageId);
    try {
      await dbDeleteMessage(messageId);
      if (thread) {
        const remaining = useChatStore.getState().messages[threadId] ?? [];
        const last = [...remaining].reverse().find((m) => m.role !== 'system');
        const preview = last ? previewOf(last.content) : null;
        await updateThread(threadId, { lastMessagePreview: preview });
        useThreadStore.getState().updateThread(threadId, thread.profileId, { lastMessagePreview: preview });
      }
    } catch (err) {
      console.warn('[useChat] delete persist failed:', err);
    }
  }, [threadId, thread]);

  /** Like / dislike (+ reasons). `null` clears feedback. */
  const setFeedback = useCallback((messageId: string, feedback: MessageFeedback | null) => {
    patchMessage(messageId, { feedback });
  }, [patchMessage]);

  const setReplyTarget = useCallback((message: Message | null) => {
    useChatStore.getState().setReplyTo(threadId, message ? buildReplySnapshot(message, mode) : null);
  }, [threadId, mode]);

  return {
    messages,
    isTyping,
    status,
    streamText,
    loadState,
    replyTo,
    sendMessage,
    retryMessage,
    deleteMessage,
    setFeedback,
    setReplyTarget,
    reload,
  };
}
