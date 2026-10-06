import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';
import { ENTER_MS, EXIT_MS, overlayPalette } from './palette';
import { closeOverlay, removeOverlay, type ActionSheetOption, type SheetEntry } from './store';
import { useIndicStyles } from '@/hooks/use-indic-styles';

type Props = { entry: SheetEntry; isTop: boolean };

const SPRING = { damping: 26, stiffness: 260, mass: 0.9 } as const;

/** Bottom sheet menu — slides up, drag the handle (or sheet) down to dismiss. */
export function ActionSheet({ entry, isTop }: Props) {
  const styles = useIndicStyles(baseStyles);
  const { theme, isDark } = useAccent();
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const pal = overlayPalette(theme, isDark);
  const { title, message, options, cancelLabel } = entry.options;

  // translateY of the sheet; `height` is the measured sheet height.
  const height = useSharedValue(screenH);
  const translateY = useSharedValue(screenH);
  const opened = useRef(false);
  const headRef = useRef<View>(null);

  const id = entry.id;
  const close = (result: ActionSheetOption | null) => closeOverlay(id, result);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    height.value = h;
    if (!opened.current) {
      opened.current = true;
      translateY.value = h;
      translateY.value = withTiming(0, { duration: ENTER_MS + 60, easing: Easing.out(Easing.cubic) });
      setTimeout(() => {
        if (headRef.current) AccessibilityInfo.sendAccessibilityEvent(headRef.current, 'focus');
      }, ENTER_MS);
    }
  };

  useEffect(() => {
    if (!entry.closing) return;
    translateY.value = withTiming(height.value, { duration: EXIT_MS + 30, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) scheduleOnRN(removeOverlay, id);
    });
  }, [entry.closing, id, height, translateY]);

  const pan = Gesture.Pan()
    .enabled(!entry.closing)
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      // Follow the finger downwards; resist a little when pulled up.
      translateY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.15;
    })
    .onEnd((e) => {
      const shouldClose = e.translationY > height.value * 0.3 || e.velocityY > 900;
      if (shouldClose) {
        scheduleOnRN(closeOverlay, id, null);
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, Math.max(height.value, 1)], [1, 0], 'clamp'),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={entry.closing ? 'none' : 'box-none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: pal.scrim }, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => close(null)}
          accessibilityRole="button"
          accessibilityLabel={t('overlay.dismiss')}
        />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={onLayout}
          style={[
            styles.sheet,
            {
              backgroundColor: pal.card,
              borderColor:     theme.hairline,
              paddingBottom:   Math.max(insets.bottom, 12) + 8,
              maxHeight:       screenH * 0.85,
            },
            sheetStyle,
          ]}
          accessibilityViewIsModal={isTop}
          importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}
          onAccessibilityEscape={() => close(null)}
        >
          <View
            ref={headRef}
            style={styles.handleWrap}
            accessible
            accessibilityRole={title ? 'header' : undefined}
            accessibilityLabel={title ?? t('overlay.menu')}
            accessibilityHint={t('overlay.swipeHint')}
          >
            <View style={[styles.handle, { backgroundColor: theme.hairline2 }]} />
            {title ? <Text style={[styles.title, { color: theme.ink }]}>{title}</Text> : null}
            {message ? <Text style={[styles.message, { color: theme.muted }]}>{message}</Text> : null}
          </View>

          <View style={[styles.group, { backgroundColor: theme.bg, borderColor: theme.hairline }]}>
            {options.map((o, i) => {
              const color = o.destructive ? pal.destructive : theme.ink;
              return (
                <Pressable
                  key={`${o.label}-${i}`}
                  onPress={() => close(o)}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
                    pressed && { backgroundColor: theme.surface2 },
                  ]}
                >
                  {o.icon ? <Icon name={o.icon} size={20} color={o.destructive ? color : theme.ink2} /> : null}
                  <Text style={[styles.rowText, { color }]} numberOfLines={2}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => close(null)}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel ?? t('cancel')}
            style={({ pressed }) => [
              styles.cancel,
              { borderColor: theme.hairline2, backgroundColor: pressed ? theme.surface2 : 'transparent' },
            ]}
          >
            <Text style={[styles.cancelText, { color: theme.ink }]}>{cancelLabel ?? t('cancel')}</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  sheet: {
    position:             'absolute',
    left:                 0,
    right:                0,
    bottom:               0,
    borderTopLeftRadius:  RADIUS.card + 8,
    borderTopRightRadius: RADIUS.card + 8,
    borderWidth:          StyleSheet.hairlineWidth,
    borderBottomWidth:    0,
    paddingHorizontal:    16,
    shadowColor:          '#000',
    shadowOpacity:        0.14,
    shadowRadius:         20,
    shadowOffset:         { width: 0, height: -6 },
    elevation:            16,
  },
  handleWrap: {
    alignItems:    'center',
    paddingTop:    10,
    paddingBottom: 14,
  },
  handle: {
    width:        38,
    height:       5,
    borderRadius: 3,
  },
  title: {
    fontFamily: FONTS.serifRegular,
    fontSize:   22,
    lineHeight: 30,
    marginTop:  12,
    textAlign:  'center',
  },
  message: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 19,
    marginTop:  4,
    textAlign:  'center',
  },
  group: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    overflow:     'hidden',
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               14,
    minHeight:         54,
    paddingHorizontal: 18,
    paddingVertical:   12,
  },
  rowText: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   15.5,
  },
  cancel: {
    marginTop:      10,
    minHeight:      52,
    borderRadius:   RADIUS.button,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15,
  },
});
