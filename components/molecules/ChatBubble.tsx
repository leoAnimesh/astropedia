import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';
import { DotsLoader } from './DotsLoader';
import type { ChatStatus } from '@/stores/chat-store';

type Props = {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  streamText?: string;
  status?: ChatStatus;
  /** Display name for the assistant — used in the loading/thinking labels. */
  persona?: string;
};

function statusLabel(status: Exclude<ChatStatus, 'idle' | 'streaming'>, persona: string): string {
  if (status === 'loading-model') return `${persona} is waking up…`;
  return `${persona} is thinking…`;
}

export function ChatBubble({ role, content, isStreaming, streamText, status, persona = 'Saga' }: Props) {
  const { theme } = useAccent();
  const isUser = role === 'user';

  // Defensive scrub — drop any <think>...</think> blocks, orphan tags, or
  // raw `<think` fragments before they reach the markdown renderer. The
  // streaming filter in useChat already prevents these from being stored,
  // but a streaming race could briefly leak a partial tag into the buffer.
  const rawText = isStreaming ? streamText ?? '' : content;
  const displayText = rawText
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .replace(/^[\s\S]*?<\/think>/, '')
    .replace(/<\/?think[^>]*>?/g, '')
    .trim();

  const noTextYet   = !displayText && isStreaming;
  const showStatus  = isStreaming && status && status !== 'idle' && status !== 'streaming';

  // Themed markdown styles. Memoized so style references stay stable across
  // streaming token updates (the markdown lib re-mounts subtrees on style change).
  const textColor = isUser ? theme.bg : theme.ink;
  const linkColor = isUser ? theme.bg : theme.accent;
  const mdStyles  = useMemo(() => buildMarkdownStyles(textColor, linkColor), [textColor, linkColor]);

  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAI]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: theme.ink }]
            : [styles.bubbleAI,   { backgroundColor: theme.surface2 }],
        ]}
      >
        {showStatus ? (
          <View style={styles.statusRow}>
            <DotsLoader />
            <Text style={[styles.statusText, { color: theme.muted }]}>
              {statusLabel(status as Exclude<ChatStatus, 'idle' | 'streaming'>, persona)}
            </Text>
          </View>
        ) : noTextYet ? (
          <DotsLoader />
        ) : isUser ? (
          // User bubbles stay plain text — no markdown rendering on the user side.
          <Text style={[styles.text, { color: textColor }]}>{displayText}</Text>
        ) : (
          <Markdown style={mdStyles}>{displayText}</Markdown>
        )}
      </View>
    </View>
  );
}

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
    marginVertical: 4,
  },
  wrapperUser: { justifyContent: 'flex-end' },
  wrapperAI:   { justifyContent: 'flex-start' },
  bubble: {
    maxWidth:        '84%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius:    18,
  },
  bubbleUser: {
    borderBottomRightRadius: 5,
  },
  bubbleAI: {
    borderBottomLeftRadius: 5,
  },
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
