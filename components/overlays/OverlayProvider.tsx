import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Modal, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { ActionSheet } from './ActionSheet';
import { dismissTopOverlay, overlayStore, setDefaultOkLabel } from './store';

/**
 * Renders the dialog / action-sheet stack. Mount once near the app root.
 *
 * The host is a transparent, un-animated RN <Modal> so overlays sit above
 * everything — including native-stack modal screens — on both platforms;
 * all visuals and motion are our own (Reanimated). The Modal's
 * onRequestClose is the Android back button: it closes the top overlay.
 */
export function OverlayProvider({ children }: { children: ReactNode }) {
  const entries = useSyncExternalStore(overlayStore.subscribe, overlayStore.getSnapshot, overlayStore.getSnapshot);
  const { t, i18n } = useTranslation('common');

  useEffect(() => {
    setDefaultOkLabel(t('ok'));
  }, [t, i18n.language]);

  const topOpenId = [...entries].reverse().find((e) => !e.closing)?.id;

  return (
    <>
      {children}
      <Modal
        visible={entries.length > 0}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={dismissTopOverlay}
      >
        {/* Gesture Handler needs its own root inside a Modal (Android). */}
        <GestureHandlerRootView style={styles.fill}>
          {entries.map((e) =>
            e.kind === 'dialog' ? (
              <Dialog key={e.id} entry={e} isTop={e.id === topOpenId} />
            ) : (
              <ActionSheet key={e.id} entry={e} isTop={e.id === topOpenId} />
            ),
          )}
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
