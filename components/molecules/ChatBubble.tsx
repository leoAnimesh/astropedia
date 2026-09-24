import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';
import { DotsLoader } from './DotsLoader';
import { ReplyQuote } from './ReplyPreview';
import type { ChatStatus } from '@/stores/chat-store';
import type { ReplySnapshot } from '@/types/conversation';
import { stripRecsForDisplay } from '@/utils/recommendation-rules';

export type BubbleRole = 'user' | 'assistant' | 'human';

type Props = {
  role: BubbleRole;
  content: string;
  isStreaming?: boolean;
  streamText?: string;
  status?: ChatStatus;
  /** Display name for the assistant — used in the loading/thinking labels. */
  persona?: string;
  /** Sender line above the bubble (first message of a group only). */
  senderLabel?: string | null;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  /** Quoted message this one replies to. */
  replyTo?: ReplySnapshot | null;
  /** Dim the bubble (e.g. a failed user message). */
  muted?: boolean;
  onLongPress?: () => void;
};

function statusLabel(status: Exclude<ChatStatus, 'idle' | 'streaming'>, persona: string): string {
  if (status === 'loading-model') return `${persona} is waking up…`;
  return `${persona} is thinking…`;
}

/**
 * Defensive scrub — drop any <think>...</think> blocks, orphan tags, raw
 * `<think` fragments and the trailing <recs> block before they reach the
 * markdown renderer. useChat already filters these from stored text, but a
 * streaming race could briefly leak a partial tag into the buffer.
 */
function cleanForDisplay(raw: string): string {
  return stripRecsForDisplay(
    raw
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*$/g, '')
      .replace(/^[\s\S]*?<\/think>/, '')
      .replace(/<\/?think[^>]*>?/g, ''),
  ).trim();
}

function ChatBubbleImpl({
  role,
  content,
  isStreaming,
  streamText,
  status,
  persona = 'Saga',
  senderLabel,
  isFirstInGroup = true,
  isLastInGroup = true,
  replyTo,
  muted,
  onLongPress,
}: Props) {
  const { theme } = useAccent();
  const isUser  = role === 'user';
  const isHuman = role === 'human';

  const rawText = isStreaming ? streamText ?? '' : content;
  const displayText = useMemo(() => cleanForDisplay(rawText), [rawText]);

  const noTextYet   = !displayText && isStreaming;
  const showStatus  = isStreaming && status && status !== 'idle' && status !== 'streaming';

  // Themed markdown styles. Memoized so style references stay stable across
  // streaming token updates (the markdown lib re-mounts subtrees on style change).
  const textColor = isUser ? theme.bg : theme.ink;
  const linkColor = isUser ? theme.bg : theme.accent;
  const mdStyles  = useMemo(() => buildMarkdownStyles(textColor, linkColor), [textColor, linkColor]);

  // Grouped bubbles share a flat edge on the sender's side; only the last in
  // a run gets the "tail" corner.
  const shape = isUser
    ? {
        borderTopRightRadius:    isFirstInGroup ? 18 : 6,
        borderBottomRightRadius: isLastInGroup ? 5 : 6,
      }
    : {
        borderTopLeftRadius:    isFirstInGroup ? 18 : 6,
        borderBottomLeftRadius: isLastInGroup ? 5 : 6,
      };

  const bubbleColors = isUser
    ? { backgroundColor: theme.ink }
    : isHuman
      ? { backgroundColor: theme.surface, borderColor: theme.accent, borderWidth: 1 }
      : { backgroundColor: theme.surface2 };

  const bubble = (
    <View style={[styles.bubble, bubbleColors, shape, muted && styles.muted]}>
      {replyTo ? <ReplyQuote reply={replyTo} inverted={isUser} /> : null}
      {showStatus ? (
        <View style={styles.statusRow}>
          <DotsLoader />
          <Text style={[styles.statusText, { color: theme.muted }]}>
            {statusLabel(status as Exclude<ChatStatus, 'idle' | 'streaming'>, persona)}
          </Text>
        </View>
      ) : noTextYet ? (
        <DotsLoader />
      ) : isUser || isHuman ? (
        // User and human-astrologer bubbles stay plain text — no markdown.
        <Text style={[styles.text, { color: textColor }]} selectable={false}>{displayText}</Text>
      ) : (
        <Markdown style={mdStyles}>{displayText}</Markdown>
      )}
    </View>
  );

  return (
    <View
      style={[
        styles.wrapper,
        isUser ? styles.wrapperUser : styles.wrapperAI,
        { marginTop: isFirstInGroup ? 6 : 1.5, marginBottom: isLastInGroup ? 2 : 1.5 },
      ]}
    >
      <View style={[styles.column, isUser ? styles.columnUser : styles.columnAI]}>
        {senderLabel && isFirstInGroup ? (
          <Text
            style={[styles.sender, { color: isHuman ? theme.accent : theme.muted }]}
            numberOfLines={1}
          >
            {senderLabel}
          </Text>
        ) : null}
        {onLongPress ? (
          <Pressable
            onLongPress={onLongPress}
            delayLongPress={320}
            accessibilityRole="button"
            accessibilityHint="Long-press for message actions"
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            {bubble}
          </Pressable>
        ) : bubble}
      </View>
    </View>
  );
}

export const ChatBubble = memo(ChatBubbleImpl);

// Markdown style overrides — kept inline since they're tied to bubble theming.
// Line heights and paragraph margins tuned for readability inside a chat
// bubble (~1.55 line-height ratio, ~14px between paragraphs).
function buildMarkdownStyles(textColor: string, linkColor: string) {
  const base = {
    fontFamily:  FONTS.sansRegular,
    fontSize:    15.5,
    lineHeight:  24,
    color:       textColor,
  };
  return {
    body:       base,
    paragraph:  { ...base, marginTop: 0, marginBottom: 14 },
    text:       base,
    strong:     { ...base, fontFamily: FONTS.sansSemiBold, fontWeight: '600' as const },
    em:         { ...base, fontStyle: 'italic' as const },
    bullet_list:  { marginTop: 6, marginBottom: 10 },
    ordered_list: { marginTop: 6, marginBottom: 10 },
    list_item:   { ...base, marginVertical: 4 },
    bullet_list_icon: { ...base, marginRight: 8 },
    code_inline: { ...base, fontFamily: FONTS.monoRegular, fontSize: 14 },
    link:        { ...base, color: linkColor, textDecorationLine: 'underline' as const },
    heading1:   { ...base, fontFamily: FONTS.serifRegular, fontSize: 21, lineHeight: 28, marginTop: 10, marginBottom: 6 },
    heading2:   { ...base, fontFamily: FONTS.serifRegular, fontSize: 19, lineHeight: 26, marginTop: 10, marginBottom: 6 },
    heading3:   { ...base, fontFamily: FONTS.serifRegular, fontSize: 17, lineHeight: 24, marginTop: 8, marginBottom: 4 },
    hr:         { marginVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: textColor, opacity: 0.2 },
  };
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
  },
  wrapperUser: { justifyContent: 'flex-end' },
  wrapperAI:   { justifyContent: 'flex-start' },
  column: {
    maxWidth: '84%',
  },
  columnUser: { alignItems: 'flex-end' },
  columnAI:   { alignItems: 'flex-start' },
  sender: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom:  4,
    marginHorizontal: 4,
  },
  bubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius:    18,
  },
  muted:   { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  text: {
    fontFamily:  FONTS.sansRegular,
    fontSize:    15.5,
    lineHeight:  24,
    letterSpacing: -0.1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  statusText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    fontStyle:  'italic',
  },
});
