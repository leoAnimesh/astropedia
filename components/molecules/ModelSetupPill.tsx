import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { DotsLoader } from '@/components/molecules/DotsLoader';
import { FONTS, RADIUS } from '@/constants/themes';
import { MODEL_SOURCE, retryModelSetup, useModelSetup } from '@/utils/model-download';
import { isFailurePhase, percentOf, toMB } from '@/utils/model-download-logic';

/**
 * Small inline "Preparing Saga… 42%" for home and chat while the on-device
 * model downloads and the full-screen overlay isn't up (returning users:
 * app update from a bundled build, storage cleared by the OS, a dismissed
 * overlay). On failure it becomes a Retry button. Renders nothing otherwise.
 */
export function ModelSetupPill({ style }: { style?: object }) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('common');
  const phase          = useModelSetup((s) => s.phase);
  const received       = useModelSetup((s) => s.received);
  const total          = useModelSetup((s) => s.total);
  const neededBytes    = useModelSetup((s) => s.neededBytes);
  const overlayPending = useModelSetup((s) => s.overlayPending);

  // 'idle'/'checking' last milliseconds for an installed model; don't flash.
  const visible = MODEL_SOURCE === 'remote' && !overlayPending
    && (phase === 'downloading' || phase === 'verifying' || isFailurePhase(phase));
  if (!visible) return null;

  const pct = percentOf({ phase, received, total, retrying: false, neededBytes, message: null, version: null });

  if (isFailurePhase(phase)) {
    const label =
      phase === 'offline'  ? t('modelSetup.pillOffline') :
      phase === 'no-space' ? (neededBytes > 0 ? t('modelSetup.pillNoSpace', { mb: toMB(neededBytes) }) : t('modelSetup.pillNoSpaceGeneric')) :
      t('modelSetup.pillError');
    return (
      <TouchableOpacity
        onPress={retryModelSetup}
        activeOpacity={0.8}
        style={[styles.pill, { backgroundColor: theme.surface2, borderColor: theme.hairline }, style]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('modelSetup.a11yPillRetry')}
      >
        <View style={[styles.dot, { backgroundColor: theme.accent }]} />
        <Text style={[styles.label, { color: theme.ink2 }]} numberOfLines={2}>{label}</Text>
      </TouchableOpacity>
    );
  }

  const label = phase === 'verifying' ? t('modelSetup.pillVerifying') : t('modelSetup.pill', { percent: pct });
  return (
    <View
      style={[styles.pill, { backgroundColor: theme.surface2, borderColor: theme.hairline }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('modelSetup.a11yProgress')}
      accessibilityValue={{ min: 0, max: 100, now: pct, text: label }}
    >
      <DotsLoader />
      <View style={styles.body}>
        <Text style={[styles.label, { color: theme.ink2 }]} numberOfLines={1}>{label}</Text>
        <View style={[styles.track, { backgroundColor: theme.hairline2 }]}>
          <View style={[styles.fill, { backgroundColor: theme.accent, width: `${pct}%` }]} />
        </View>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    alignSelf:         'center',
    maxWidth:          '92%',
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:      RADIUS.pill,
    borderWidth:       StyleSheet.hairlineWidth,
  },
  body:  { flexShrink: 1, gap: 5 },
  label: { fontFamily: FONTS.sansMedium, fontSize: 12.5, lineHeight: 16, flexShrink: 1 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  track: { height: 2, borderRadius: 1, overflow: 'hidden', minWidth: 120 },
  fill:  { height: 2, borderRadius: 1 },
});
