import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';
import { Icon } from '@/components/atoms/Icon';
import { DotsLoader } from './DotsLoader';
import type { ChatStatus } from '@/stores/chat-store';
import { indicLineHeight, useIndicStyles, useIsIndic } from '@/hooks/use-indic-styles';

type Props = {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  streamText?: string;
  status?: ChatStatus;
  /** Display name for the assistant — used in the loading/thinking labels. */
  persona?: string;
  /** Save / Share / Report row under a finished assistant reply. Omit to hide it. */
  actions?: {
    saved:        boolean;
    onToggleSave: () => void;
    onShare:      () => void;
    /** Report this answer (utils/report-answer.ts); omit to hide the button. */
    onReport?:    () => void;
    reported?:    boolean;
  };
  /** Long-press on the bubble (assistant replies open a save/share menu). */
  onLongPress?: () => void;
  /**
   * A reported answer: shown as a one-line notice with a Show button instead
   * of the reply (onShow reveals it).
   */
  hiddenAsReported?: { onShow: () => void };
};


export function ChatBubble({
  role, content, isStreaming, streamText, status, persona = 'Saga', actions, onLongPress, hiddenAsReported,
}: Props) {
  const styles = useIndicStyles(baseStyles);
  const indic  = useIsIndic();
  const { theme } = useAccent();
  const { t }     = useTranslation('chat');
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
  const mdStyles  = useMemo(() => buildMarkdownStyles(textColor, linkColor, indic), [textColor, linkColor, indic]);

  if (hiddenAsReported) {
    return (
      <View style={[styles.wrapper, styles.wrapperAI]}>
        <View style={[styles.reportedNote, { borderColor: theme.hairline }]}>
          <Icon name="flag" size={14} color={theme.muted} />
          <Text style={[styles.reportedText, { color: theme.muted }]}>{t('report.hidden')}</Text>
          <TouchableOpacity
            onPress={hiddenAsReported.onShow}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('report.a11yShow')}
          >
            <Text style={[styles.actionLabel, { color: theme.accent }]}>{t('report.show')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAI]}>
      <Pressable
        onLongPress={onLongPress}
        disabled={!onLongPress}
        delayLongPress={350}
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
              {status === 'loading-model'
                ? t('bubble.waking', { persona })
                : t('bubble.thinking', { persona })}
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
      </Pressable>

      {actions && !isStreaming ? (
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={actions.onToggleSave}
            style={styles.actionBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={actions.saved ? t('bubble.a11yRemove') : t('bubble.a11ySave')}
            accessibilityState={{ selected: actions.saved }}
          >
            <Icon
              name={actions.saved ? 'bookmark-filled' : 'bookmark'}
              size={14}
              color={actions.saved ? theme.accent : theme.muted}
            />
            <Text style={[styles.actionLabel, { color: actions.saved ? theme.accent : theme.muted }]}>
              {actions.saved ? t('bubble.saved') : t('bubble.save')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={actions.onShare}
            style={styles.actionBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('bubble.a11yShare')}
          >
            <Icon name="share" size={14} color={theme.muted} />
            <Text style={[styles.actionLabel, { color: theme.muted }]}>{t('bubble.share')}</Text>
          </TouchableOpacity>
          {actions.onReport ? (
            <TouchableOpacity
              onPress={actions.onReport}
              disabled={actions.reported}
              style={styles.actionBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={actions.reported ? t('bubble.reported') : t('bubble.a11yReport')}
              accessibilityState={{ disabled: !!actions.reported }}
            >
              <Icon name="flag" size={14} color={theme.muted} />
              <Text style={[styles.actionLabel, { color: theme.muted }]}>
                {actions.reported ? t('bubble.reported') : t('bubble.report')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Markdown style overrides — kept inline since they're tied to bubble theming.
// Line heights and paragraph margins tuned for readability inside a chat
// bubble (~1.55 line-height ratio, ~14px between paragraphs).
// In hi/bn, headings get room for Indic vowel marks (see use-indic-styles).
function buildMarkdownStyles(textColor: string, linkColor: string, indic = false) {
  const lh = (fontSize: number, lineHeight: number) => (indic ? indicLineHeight(fontSize, lineHeight) : lineHeight);
  const base = {
    fontFamily:  FONTS.sansRegular,
    fontSize:    15.5,
    lineHeight:  lh(15.5, 24),
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
    heading1:   { ...base, fontFamily: FONTS.serifRegular, fontSize: 21, lineHeight: lh(21, 28), marginTop: 10, marginBottom: 6 },
    heading2:   { ...base, fontFamily: FONTS.serifRegular, fontSize: 19, lineHeight: lh(19, 26), marginTop: 10, marginBottom: 6 },
    heading3:   { ...base, fontFamily: FONTS.serifRegular, fontSize: 17, lineHeight: lh(17, 24), marginTop: 8, marginBottom: 4 },
    hr:         { marginVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: textColor, opacity: 0.2 },
  };
}

const baseStyles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
  },
  wrapperUser: { alignItems: 'flex-end' },
  wrapperAI:   { alignItems: 'flex-start' },
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
  actions: {
    flexDirection: 'row',
    gap:           4,
    marginTop:     2,
    marginLeft:    2,
  },
  actionBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    minHeight:         36,
    paddingHorizontal: 8,
  },
  actionLabel: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  reportedNote: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingVertical:   10,
    paddingHorizontal: 14,
    borderRadius:      18,
    borderWidth:       StyleSheet.hairlineWidth,
    borderStyle:       'dashed',
  },
  reportedText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    fontStyle:  'italic',
    flexShrink: 1,
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
