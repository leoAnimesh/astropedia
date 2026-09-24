import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '@/hooks/use-accent';
import { Toggle } from '@/components/atoms/Toggle';
import { Button } from '@/components/atoms/Button';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { FONTS } from '@/constants/themes';
import { useDevStore } from '@/stores/dev-store';

type Props = {
  visible:     boolean;
  onClose:     () => void;
  /** Re-run the conversation load (to demo loading / error states). */
  onReload:    () => void;
  /** Create a thread pre-filled with the assignment's mock payload. */
  onSeedDemo?: () => void;
  modelLabel:  string;
};

/**
 * Dev-only panel (rendered only when __DEV__) for demoing failure paths:
 * one-shot load/send failures, slow loads, and seeding the mock payload.
 * Nothing here ships to production users.
 */
export function DevToolsSheet({ visible, onClose, onReload, onSeedDemo, modelLabel }: Props) {
  const { theme } = useAccent();
  const insets = useSafeAreaInsets();
  const dev = useDevStore();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
        >
          <EyebrowLabel>Developer tools</EyebrowLabel>
          <Text style={[styles.model, { color: theme.muted }]}>On-device model: {modelLabel}</Text>

          <Toggle
            value={dev.failNextMessageSend}
            onValueChange={(v) => dev.set({ failNextMessageSend: v })}
            label="Fail next send"
            sublabel="Next message shows Failed → tap Retry to recover."
            style={styles.toggle}
          />
          <Toggle
            value={dev.failNextConversationLoad}
            onValueChange={(v) => dev.set({ failNextConversationLoad: v })}
            label="Fail next conversation load"
            sublabel="Then tap Reload below → error state → Retry."
            style={styles.toggle}
          />
          <Toggle
            value={dev.slowConversationLoad}
            onValueChange={(v) => dev.set({ slowConversationLoad: v })}
            label="Slow conversation load"
            sublabel="Adds ~1.2 s so the loading state is visible."
            style={styles.toggle}
          />

          <View style={styles.buttons}>
            <Button
              label="Reload conversation"
              variant="ghost"
              onPress={() => { onClose(); onReload(); }}
              fullWidth
            />
            {onSeedDemo ? (
              <Button
                label="Open demo conversation (mock payload)"
                variant="accent"
                onPress={() => { onClose(); onSeedDemo(); }}
                fullWidth
              />
            ) : null}
          </View>
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
    paddingTop:           18,
    paddingHorizontal:    20,
    gap:                  6,
  },
  model: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     12.5,
    marginBottom: 6,
  },
  toggle:  { paddingVertical: 8 },
  buttons: { gap: 10, marginTop: 12 },
});
