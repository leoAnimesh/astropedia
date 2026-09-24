import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { FONTS } from '@/constants/themes';
import type { ReplySnapshot } from '@/types/conversation';

/**
 * Quoted message rendered inside a bubble that replies to it. Uses the
 * stored snapshot, so it still renders after the original is deleted.
 */
export const ReplyQuote = memo(function ReplyQuote({
  reply,
  inverted,
}: {
  reply: ReplySnapshot;
  /** True inside a dark (user) bubble. */
  inverted?: boolean;
}) {
  const { theme } = useAccent();
  const fg = inverted ? theme.bg : theme.ink2;
  return (
    <View style={[styles.quote, { borderLeftColor: inverted ? theme.bg : theme.accent }]}>
      <Text style={[styles.quoteAuthor, { color: fg }]} numberOfLines={1}>
        {reply.author}
      </Text>
      <Text style={[styles.quoteText, { color: fg }]} numberOfLines={2}>
        {reply.preview}
      </Text>
    </View>
  );
});

/** "Replying to …" bar shown above the composer, with a dismiss button. */
export function ReplyPreviewBar({
  reply,
  onCancel,
}: {
  reply: ReplySnapshot;
  onCancel: () => void;
}) {
  const { theme } = useAccent();
  return (
    <View style={[styles.bar, { backgroundColor: theme.surface2, borderLeftColor: theme.accent }]}>
      <Icon name="reply" size={14} color={theme.accent} />
      <View style={styles.barText}>
        <Text style={[styles.barLabel, { color: theme.accent }]} numberOfLines={1}>
          Replying to {reply.author}
        </Text>
        <Text style={[styles.barPreview, { color: theme.ink2 }]} numberOfLines={1}>
          {reply.preview}
        </Text>
      </View>
      <Pressable
        onPress={onCancel}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
      >
        <Icon name="close" size={16} color={theme.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  quote: {
    borderLeftWidth: 2,
    paddingLeft:     8,
    marginBottom:    8,
    opacity:         0.8,
  },
  quoteAuthor: {
    fontFamily: FONTS.sansMedium,
    fontSize:   12,
  },
  quoteText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
  },
  bar: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    borderLeftWidth:   3,
    borderRadius:      10,
    paddingVertical:   8,
    paddingHorizontal: 12,
    marginBottom:      8,
  },
  barText:    { flex: 1, minWidth: 0 },
  barLabel: {
    fontFamily: FONTS.sansMedium,
    fontSize:   12.5,
  },
  barPreview: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
  },
});
