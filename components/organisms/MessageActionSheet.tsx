import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '@/hooks/use-accent';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { FONTS } from '@/constants/themes';

export type MessageAction = {
  key:          string;
  label:        string;
  icon:         IconName;
  destructive?: boolean;
  onPress:      () => void;
};

type Props = {
  visible:  boolean;
  /** Short excerpt of the message the actions apply to. */
  preview?: string;
  actions:  MessageAction[];
  onClose:  () => void;
};

/**
 * Cross-platform bottom action sheet for long-pressed messages. Actions are
 * data, so which ones appear per message type is decided by the caller.
 */
export function MessageActionSheet({ visible, preview, actions, onClose }: Props) {
  const { theme } = useAccent();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable
          // Swallow taps on the sheet itself so they don't close it.
          onPress={() => {}}
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.hairline2 }]} />
          {preview ? (
            <Text style={[styles.preview, { color: theme.muted }]} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
          {actions.map((a, i) => (
            <Pressable
              key={a.key}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
                pressed && { backgroundColor: theme.surface2 },
              ]}
            >
              <Icon name={a.icon} size={18} color={a.destructive ? '#C0492F' : theme.ink} />
              <Text style={[styles.label, { color: a.destructive ? '#C0492F' : theme.ink }]}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingTop:           8,
    paddingHorizontal:    8,
  },
  handle: {
    alignSelf:    'center',
    width:        36,
    height:       4,
    borderRadius: 2,
    marginBottom: 10,
  },
  preview: {
    fontFamily:        FONTS.sansRegular,
    fontSize:          13,
    lineHeight:        18,
    paddingHorizontal: 14,
    paddingBottom:     10,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               14,
    paddingVertical:   15,
    paddingHorizontal: 14,
    borderRadius:      10,
  },
  label: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
  },
});
