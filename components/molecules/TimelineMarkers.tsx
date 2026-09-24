import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { FONTS } from '@/constants/themes';
import type { FailureReason, MessageStatus } from '@/types/conversation';

/** "Today" / "Yesterday" / "Mon, 22 Sep" divider between days. */
export const DateSeparator = memo(function DateSeparator({ label }: { label: string }) {
  const { theme } = useAccent();
  return (
    <View style={styles.dateRow} accessibilityRole="header">
      <View style={[styles.rule, { backgroundColor: theme.hairline }]} />
      <Text style={[styles.dateLabel, { color: theme.muted }]}>{label}</Text>
      <View style={[styles.rule, { backgroundColor: theme.hairline }]} />
    </View>
  );
});

/** Centered, non-interactive session event ("Your session has started."). */
export const SystemEventRow = memo(function SystemEventRow({ text }: { text: string }) {
  const { theme } = useAccent();
  return (
    <View style={styles.systemRow}>
      <Text style={[styles.systemText, { color: theme.muted, backgroundColor: theme.surface2 }]}>
        {text}
      </Text>
    </View>
  );
});

const FAILURE_COPY: Record<FailureReason, string> = {
  'model-unavailable': "On-device model isn't ready",
  'generation-failed': 'Reply failed',
  'empty-reply':       'No reply came back',
  'interrupted':       'Interrupted',
  'storage':           "Couldn't save",
  'simulated':         'Network error (simulated)',
};

/**
 * Delivery status under a user message: Sending… / Sent / Failed · Retry.
 * Retry is disabled while another reply is generating.
 */
export const MessageStatusLine = memo(function MessageStatusLine({
  status,
  failureReason,
  onRetry,
  retryDisabled,
}: {
  status:         MessageStatus;
  failureReason?: FailureReason | null;
  onRetry?:       () => void;
  retryDisabled?: boolean;
}) {
  const { theme } = useAccent();

  if (status === 'sending') {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator size="small" color={theme.muted} style={styles.spinner} />
        <Text style={[styles.statusText, { color: theme.muted }]}>Sending…</Text>
      </View>
    );
  }

  if (status === 'failed') {
    const danger = '#C0492F';
    return (
      <View style={styles.statusRow}>
        <Icon name="warning" size={12} color={danger} />
        <Text style={[styles.statusText, { color: danger }]} numberOfLines={1}>
          Failed{failureReason ? ` · ${FAILURE_COPY[failureReason] ?? 'Error'}` : ''}
        </Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            disabled={retryDisabled}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Retry sending message"
            style={({ pressed }) => [
              styles.retry,
              { borderColor: danger, opacity: retryDisabled ? 0.4 : pressed ? 0.6 : 1 },
            ]}
          >
            <Icon name="refresh" size={11} color={danger} />
            <Text style={[styles.retryText, { color: danger }]}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.statusRow}>
      <Icon name="check" size={11} color={theme.muted} />
      <Text style={[styles.statusText, { color: theme.muted }]}>Sent</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  dateRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    marginVertical: 14,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  dateLabel: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  systemRow: {
    alignItems:     'center',
    marginVertical: 8,
  },
  systemText: {
    fontFamily:        FONTS.sansRegular,
    fontSize:          12.5,
    textAlign:         'center',
    paddingHorizontal: 12,
    paddingVertical:   5,
    borderRadius:      999,
    overflow:          'hidden',
  },
  statusRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'flex-end',
    gap:            5,
    marginTop:      3,
    marginBottom:   4,
    paddingRight:   4,
  },
  spinner: { transform: [{ scale: 0.6 }], marginRight: -4 },
  statusText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   11.5,
  },
  retry: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    borderWidth:       1,
    borderRadius:      999,
    paddingHorizontal: 8,
    paddingVertical:   2,
    marginLeft:        4,
  },
  retryText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   11.5,
  },
});
