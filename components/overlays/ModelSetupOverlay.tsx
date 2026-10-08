import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Button } from '@/components/atoms/Button';
import { FONTS } from '@/constants/themes';
import { dismissModelOverlay, retryModelSetup, useModelSetup } from '@/utils/model-download';
import { isFailurePhase, percentOf, toMB } from '@/utils/model-download-logic';

const PHRASES = ['phrase1', 'phrase2', 'phrase3', 'phrase4'] as const;
const PHRASE_MS = 2800;

/**
 * Full-screen "Preparing Saga…" shown when onboarding finishes before the
 * on-device model is downloaded (utils/model-download.ts). Same look as the
 * app's earlier model loader: eyebrow, serif headline, rotating phrase,
 * breathing dots, thin progress bar. Fades out and lands on home when ready.
 */
export function ModelSetupOverlay() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation('common');
  const indic = i18n.language !== 'en';

  const phase      = useModelSetup((s) => s.phase);
  const received   = useModelSetup((s) => s.received);
  const total      = useModelSetup((s) => s.total);
  const retrying   = useModelSetup((s) => s.retrying);
  const neededBytes = useModelSetup((s) => s.neededBytes);
  const pct = percentOf({ phase, received, total, retrying, neededBytes, message: null, version: null });
  const failed = isFailurePhase(phase);

  // Rotating phrase while working.
  const [phraseIdx, setPhraseIdx] = useState(0);
  useEffect(() => {
    if (failed) return;
    const id = setInterval(() => setPhraseIdx((i) => (i + 1) % PHRASES.length), PHRASE_MS);
    return () => clearInterval(id);
  }, [failed]);

  // Progress bar width follows the percent smoothly.
  const progress = useSharedValue(pct);
  useEffect(() => {
    progress.value = withTiming(pct, { duration: 400, easing: Easing.out(Easing.quad) });
  }, [pct, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` }));

  // Fade out once ready, then drop the overlay (home is underneath).
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (phase !== 'ready') return;
    opacity.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }, (done) => {
      if (done) scheduleOnRN(dismissModelOverlay);
    });
  }, [phase, opacity]);
  const rootStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const status = (() => {
    if (phase === 'verifying') return t('modelSetup.verifying');
    if (retrying) return t('modelSetup.retrying');
    if (phase === 'downloading' && total > 0 && received > 0) {
      return t('modelSetup.downloading', { done: toMB(received), total: toMB(total) });
    }
    if (phase === 'downloading') return t('modelSetup.starting');
    return t('modelSetup.checking');
  })();

  return (
    <Animated.View
      style={[
        styles.overlay,
        { backgroundColor: theme.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        rootStyle,
      ]}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <View style={styles.inner}>
        <Text style={[styles.eyebrow, { color: theme.muted }, indic && styles.noTracking]}>{t('modelSetup.eyebrow')}</Text>
        <Text style={[styles.headline, indic && styles.headlineIndic, { color: theme.ink }]} accessibilityRole="header">
          {t('modelSetup.title')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.ink2 }]}>{t('modelSetup.subtitle')}</Text>

        {!failed && (
          <View style={styles.phraseBox}>
            <Animated.Text
              key={phraseIdx}
              entering={FadeIn.duration(450)}
              exiting={FadeOut.duration(300)}
              style={[styles.phrase, { color: theme.muted }]}
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              {t(`modelSetup.${PHRASES[phraseIdx]}`)}
            </Animated.Text>
          </View>
        )}
      </View>

      {failed ? (
        <FailurePanel phase={phase} neededBytes={neededBytes} />
      ) : (
        <View style={styles.bottom}>
          <BreathingDots color={theme.accent} />
          <View
            style={[styles.track, { backgroundColor: theme.hairline2 }]}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('modelSetup.a11yProgress')}
            accessibilityValue={{ min: 0, max: 100, now: pct }}
          >
            <Animated.View style={[styles.fill, { backgroundColor: theme.accent }, fillStyle]} />
          </View>
          <View style={styles.statusRow}>
            <Text
              style={[styles.status, { color: theme.ink2 }]}
              numberOfLines={2}
              accessibilityLiveRegion="polite"
            >
              {status}
            </Text>
            <Text style={[styles.pct, { color: theme.muted }]} importantForAccessibility="no">
              {t('modelSetup.percent', { percent: pct })}
            </Text>
          </View>
          <Text style={[styles.note, { color: theme.muted }]}>{t('modelSetup.background')}</Text>
        </View>
      )}
    </Animated.View>
  );
}

function FailurePanel({ phase, neededBytes }: { phase: string; neededBytes: number }) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('common');
  const [title, body] =
    phase === 'offline'  ? [t('modelSetup.offlineTitle'), t('modelSetup.offline')] :
    phase === 'no-space' ? [t('modelSetup.noSpaceTitle'), neededBytes > 0
      ? t('modelSetup.noSpace', { mb: toMB(neededBytes) })
      : t('modelSetup.noSpaceGeneric')] :
    [t('modelSetup.errorTitle'), t('modelSetup.error')];

  return (
    <View style={styles.bottom} accessibilityLiveRegion="assertive">
      <Text style={[styles.failTitle, { color: theme.ink }]}>{title}</Text>
      <Text style={[styles.failBody, { color: theme.ink2 }]}>{body}</Text>
      <Button label={t('modelSetup.retry')} variant="accent" fullWidth onPress={retryModelSetup} />
      {/* The rest of the app (charts, panchang, horoscope) works without Saga. */}
      <TouchableOpacity onPress={dismissModelOverlay} style={styles.laterBtn} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.laterText, { color: theme.muted }]}>{t('modelSetup.later')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function BreathingDots({ color }: { color: string }) {
  const a = useSharedValue(0.4);
  const b = useSharedValue(0.4);
  const c = useSharedValue(0.4);
  useEffect(() => {
    const pulse = (v: SharedValue<number>, delay: number) => {
      v.value = withDelay(delay, withRepeat(withSequence(
        withTiming(1,   { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      ), -1));
    };
    pulse(a, 0);
    pulse(b, 180);
    pulse(c, 360);
  }, [a, b, c]);
  const sa = useAnimatedStyle(() => ({ transform: [{ scale: a.value }], opacity: a.value }));
  const sb = useAnimatedStyle(() => ({ transform: [{ scale: b.value }], opacity: b.value }));
  const sc = useAnimatedStyle(() => ({ transform: [{ scale: c.value }], opacity: c.value }));
  return (
    <View style={baseStyles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {[sa, sb, sc].map((s, i) => (
        <Animated.View key={i} style={[baseStyles.dot, { backgroundColor: color }, s]} />
      ))}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  overlay: {
    position:          'absolute',
    top: 0, right: 0, bottom: 0, left: 0,
    zIndex:            999,
    elevation:         999,
    justifyContent:    'space-between',
    paddingHorizontal: 36,
  },
  inner: { flex: 1, justifyContent: 'center', gap: 14 },
  eyebrow: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    lineHeight:    14,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom:  6,
  },
  noTracking: { letterSpacing: 0 },
  headline: {
    fontFamily: FONTS.serifRegular,
    fontSize:   46,
    lineHeight: 50,
  },
  headlineIndic: { lineHeight: 68 },
  subtitle: {
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
    lineHeight: 22,
  },
  phraseBox: { minHeight: 28, marginTop: 6 },
  phrase: {
    fontFamily: FONTS.serifItalic,
    fontSize:   17,
    lineHeight: 24,
  },
  bottom: { gap: 12 },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  dot:  { width: 8, height: 8, borderRadius: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill:  { height: 4, borderRadius: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  status: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    lineHeight: 19,
  },
  pct: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      12,
    lineHeight:    19,
    letterSpacing: 0.5,
    fontVariant:   Platform.OS === 'ios' ? ['tabular-nums'] : undefined,
  },
  note: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 18,
  },
  failTitle: {
    fontFamily: FONTS.serifRegular,
    fontSize:   28,
    lineHeight: 34,
  },
  failBody: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     14.5,
    lineHeight:   21,
    marginBottom: 8,
  },
  laterBtn:  { alignSelf: 'center', marginTop: 4, paddingVertical: 4 },
  laterText: { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 19, textDecorationLine: 'underline' },
});
