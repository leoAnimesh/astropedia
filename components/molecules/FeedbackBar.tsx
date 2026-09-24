import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { Chip } from '@/components/atoms/Chip';
import { FONTS } from '@/constants/themes';
import { DISLIKE_REASONS, type DislikeReason, type MessageFeedback } from '@/types/conversation';

type Props = {
  messageId: string;
  feedback:  MessageFeedback | null | undefined;
  onChange:  (messageId: string, feedback: MessageFeedback | null) => void;
};

/**
 * Like / Dislike for an AI reply. Dislike expands reason chips (multi-select).
 * Tapping the active thumb again clears the rating. Switching to Like drops
 * any dislike reasons.
 */
function FeedbackBarImpl({ messageId, feedback, onChange }: Props) {
  const { theme } = useAccent();
  const rating = feedback?.rating ?? null;
  const reasons = useMemo(() => feedback?.reasons ?? [], [feedback]);

  const tap = () => Haptics.selectionAsync().catch(() => {});

  const onLike = useCallback(() => {
    tap();
    onChange(messageId, rating === 'like' ? null : { rating: 'like', reasons: [] });
  }, [messageId, rating, onChange]);

  const onDislike = useCallback(() => {
    tap();
    onChange(messageId, rating === 'dislike' ? null : { rating: 'dislike', reasons: [] });
  }, [messageId, rating, onChange]);

  const toggleReason = useCallback((reason: DislikeReason) => {
    tap();
    const next = reasons.includes(reason)
      ? reasons.filter((r) => r !== reason)
      : [...reasons, reason];
    onChange(messageId, { rating: 'dislike', reasons: next });
  }, [messageId, reasons, onChange]);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={onLike}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Helpful"
          accessibilityState={{ selected: rating === 'like' }}
          style={styles.thumb}
        >
          <Icon
            name={rating === 'like' ? 'thumbs-up-filled' : 'thumbs-up'}
            size={15}
            color={rating === 'like' ? theme.accent : theme.muted}
          />
        </Pressable>
        <Pressable
          onPress={onDislike}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Not helpful"
          accessibilityState={{ selected: rating === 'dislike' }}
          style={styles.thumb}
        >
          <Icon
            name={rating === 'dislike' ? 'thumbs-down-filled' : 'thumbs-down'}
            size={15}
            color={rating === 'dislike' ? theme.accent : theme.muted}
          />
        </Pressable>
        {rating === 'like' ? (
          <Text style={[styles.thanks, { color: theme.muted }]}>Thanks for the feedback</Text>
        ) : null}
      </View>

      {rating === 'dislike' ? (
        <View style={styles.chips}>
          <Text style={[styles.prompt, { color: theme.muted }]}>What went wrong?</Text>
          <View style={styles.chipRow}>
            {DISLIKE_REASONS.map((r) => (
              <Chip
                key={r.id}
                label={r.label}
                active={reasons.includes(r.id)}
                onPress={() => toggleReason(r.id)}
                style={styles.chip}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export const FeedbackBar = memo(FeedbackBarImpl);

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 2, paddingLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  thumb: { padding: 6 },
  thanks: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    marginLeft: 4,
  },
  chips: { marginTop: 4 },
  prompt: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     12,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
  },
  chip: { height: 30, paddingHorizontal: 12 },
});
