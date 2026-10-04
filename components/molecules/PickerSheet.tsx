/**
 * Bottom sheet for pickers: slides up over a fading backdrop, closes on a
 * backdrop tap, the Done button, Android back, or a swipe down on its header.
 *
 * The content is wrapped in its own GestureHandlerRootView because an RN
 * <Modal> is a separate native root on Android and gestures inside it (the
 * wheels) wouldn't otherwise be recognised.
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { FONTS, RADIUS } from '@/constants/themes';
import { useIndicStyles } from '@/hooks/use-indic-styles';

export type PickerSheetProps = {
  visible: boolean;
  title?: string;
  /** Called after the sheet has animated out (backdrop, swipe, back, Done). */
  onClose: () => void;
  /** Shows a Done button; called before closing. */
  onDone?: () => void;
  doneLabel?: string;
  /** Optional secondary text action at the bottom (e.g. "I don't know"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  children: React.ReactNode;
};

const OFFSCREEN = 600;
const OPEN_SPRING = { damping: 26, stiffness: 260, mass: 0.9 } as const;

export function PickerSheet({
  visible, title, onClose, onDone, doneLabel, secondaryLabel, onSecondary, children,
}: PickerSheetProps) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(OFFSCREEN);
  const sheetHeight = useSharedValue(OFFSCREEN);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = OFFSCREEN;
      translateY.value = withSpring(0, OPEN_SPRING);
    } else if (mounted) {
      translateY.value = withTiming(sheetHeight.value, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** Animate out, then tell the parent. */
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const dismiss = (after?: () => void) => {
    afterClose.current = after;
    translateY.value = withTiming(sheetHeight.value, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
      if (!done) return;
      scheduleOnRN(setMounted, false);
      scheduleOnRN(finish);
    });
  };
  const finish = () => {
    const after = afterClose.current;
    afterClose.current = undefined;
    after?.();
    onClose();
  };

  const swipe = Gesture.Pan()
    .activeOffsetY(6)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 900) {
        translateY.value = withTiming(sheetHeight.value, { duration: 180 }, (done) => {
          if (!done) return;
          scheduleOnRN(setMounted, false);
          scheduleOnRN(onClose);
        });
      } else {
        translateY.value = withSpring(0, OPEN_SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, sheetHeight.value], [1, 0], 'clamp'),
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => dismiss()}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={styles.fill}
            onPress={() => dismiss()}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16, borderColor: theme.hairline },
            sheetStyle,
          ]}
          onLayout={(e) => { sheetHeight.value = e.nativeEvent.layout.height + 40; }}
          accessibilityViewIsModal
        >
          <GestureDetector gesture={swipe}>
            <View style={styles.header}>
              <View style={[styles.grabber, { backgroundColor: theme.hairline2 }]} />
              {title ? (
                <Text style={[styles.title, { color: theme.ink }]} accessibilityRole="header">
                  {title}
                </Text>
              ) : null}
            </View>
          </GestureDetector>

          <View style={styles.body}>{children}</View>

          {onDone ? (
            <Button
              label={doneLabel ?? t('done')}
              variant="accent"
              fullWidth
              onPress={() => dismiss(onDone)}
              style={styles.done}
            />
          ) : null}
          {secondaryLabel && onSecondary ? (
            <Pressable
              onPress={() => dismiss(onSecondary)}
              style={styles.secondary}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={[styles.secondaryText, { color: theme.muted }]}>{secondaryLabel}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  fill:     { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: {
    position:             'absolute',
    left:                 0,
    right:                0,
    bottom:               0,
    borderTopLeftRadius:  RADIUS.card + 6,
    borderTopRightRadius: RADIUS.card + 6,
    borderTopWidth:       StyleSheet.hairlineWidth,
    paddingHorizontal:    20,
  },
  header:  { alignItems: 'center', paddingTop: 10, paddingBottom: 12 },
  grabber: { width: 38, height: 5, borderRadius: 3, marginBottom: 14 },
  title: {
    fontFamily: FONTS.serifRegular,
    fontSize:   26,
    lineHeight: 34,
    alignSelf:  'flex-start',
  },
  body:      { paddingVertical: 8 },
  done:      { marginTop: 16 },
  secondary: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  secondaryText: { fontFamily: FONTS.sansRegular, fontSize: 13.5 },
});
