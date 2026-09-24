import { memo, type ComponentType } from 'react';
import { ChatBubble } from '@/components/molecules/ChatBubble';
import { FeedbackBar } from '@/components/molecules/FeedbackBar';
import { DateSeparator, MessageStatusLine, SystemEventRow } from '@/components/molecules/TimelineMarkers';
import { RecommendationCarousel } from '@/components/organisms/RecommendationCarousel';
import type { MessageRow, TimelineRow } from '@/utils/chat-timeline';
import type { Message } from '@/utils/database';
import type { MessageFeedback, MessageRole } from '@/types/conversation';

/**
 * Stable callbacks shared by every row. The screen creates them once with
 * useCallback; rows never close over the message list.
 */
export type TimelineHandlers = {
  onLongPress: (message: Message) => void;
  onRetry:     (messageId: string) => void;
  onFeedback:  (messageId: string, feedback: MessageFeedback | null) => void;
};

type RendererProps = TimelineHandlers & {
  row:     MessageRow;
  persona: string;
  /** A reply is generating — Retry is disabled until it finishes. */
  busy:    boolean;
};

// ─── One renderer per message type ───────────────────────────────────────────

const UserMessage = ({ row, onLongPress, onRetry, busy }: RendererProps) => {
  const m = row.message;
  const status = m.status ?? 'sent';
  return (
    <>
      <ChatBubble
        role="user"
        content={m.content}
        replyTo={m.replyTo}
        isFirstInGroup={row.isFirstInGroup}
        isLastInGroup={row.isLastInGroup}
        muted={status === 'failed'}
        onLongPress={() => onLongPress(m)}
      />
      {row.showStatus ? (
        <MessageStatusLine
          status={status}
          failureReason={m.failureReason}
          onRetry={() => onRetry(m.id)}
          retryDisabled={busy}
        />
      ) : null}
    </>
  );
};

const AssistantMessage = ({ row, persona, onLongPress, onFeedback }: RendererProps) => {
  const m = row.message;
  return (
    <>
      <ChatBubble
        role="assistant"
        content={m.content}
        persona={persona}
        senderLabel={`${persona} · AI`}
        replyTo={m.replyTo}
        isFirstInGroup={row.isFirstInGroup}
        isLastInGroup={row.isLastInGroup}
        onLongPress={() => onLongPress(m)}
      />
      <RecommendationCarousel recommendations={m.recommendations} persona={persona} />
      <FeedbackBar messageId={m.id} feedback={m.feedback} onChange={onFeedback} />
    </>
  );
};

const HumanMessage = ({ row, onLongPress }: RendererProps) => {
  const m = row.message;
  return (
    <ChatBubble
      role="human"
      content={m.content}
      senderLabel={`${m.authorName ?? 'Astrologer'} · Human astrologer`}
      replyTo={m.replyTo}
      isFirstInGroup={row.isFirstInGroup}
      isLastInGroup={row.isLastInGroup}
      onLongPress={() => onLongPress(m)}
    />
  );
};

const SystemMessage = ({ row }: RendererProps) => <SystemEventRow text={row.message.content} />;

/**
 * Message-type → renderer registry. A new author type (e.g. 'tool') is a new
 * entry here; unknown roles degrade to a system-style row, never a crash.
 */
const MESSAGE_RENDERERS: Record<MessageRole, ComponentType<RendererProps>> = {
  user:      UserMessage,
  assistant: AssistantMessage,
  human:     HumanMessage,
  system:    SystemMessage,
};

// ─── Row ─────────────────────────────────────────────────────────────────────

type Props = TimelineHandlers & {
  row:     TimelineRow;
  persona: string;
  busy:    boolean;
};

function ChatTimelineRowImpl({ row, ...rest }: Props) {
  if (row.kind === 'date') return <DateSeparator label={row.label} />;
  const Renderer = MESSAGE_RENDERERS[row.message.role] ?? SystemMessage;
  return <Renderer row={row} {...rest} />;
}

/**
 * Rows are rebuilt whenever the message list changes, so compare by content:
 * a row only re-renders when its own message object or grouping flags
 * change. `busy` only matters to rows showing a Retry button.
 */
function areEqual(prev: Props, next: Props): boolean {
  if (prev.persona !== next.persona) return false;
  if (prev.onLongPress !== next.onLongPress || prev.onRetry !== next.onRetry || prev.onFeedback !== next.onFeedback) {
    return false;
  }
  const a = prev.row;
  const b = next.row;
  if (a.kind !== b.kind || a.key !== b.key) return false;
  if (a.kind === 'date' || b.kind === 'date') {
    return a.kind === 'date' && b.kind === 'date' && a.label === b.label;
  }
  if (
    a.message !== b.message ||
    a.isFirstInGroup !== b.isFirstInGroup ||
    a.isLastInGroup !== b.isLastInGroup ||
    a.showStatus !== b.showStatus
  ) {
    return false;
  }
  const hasRetry = b.message.role === 'user' && b.message.status === 'failed';
  return !hasRetry || prev.busy === next.busy;
}

export const ChatTimelineRow = memo(ChatTimelineRowImpl, areEqual);
