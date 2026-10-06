import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAccent } from '@/hooks/use-accent';
import { FONTS, RADIUS } from '@/constants/themes';
import { ENTER_MS, EXIT_MS, overlayPalette } from './palette';
import { closeOverlay, dialogDismissResult, removeOverlay, type DialogAction, type DialogEntry } from './store';
import { useIndicStyles } from '@/hooks/use-indic-styles';

type Props = { entry: DialogEntry; isTop: boolean };

/** Centered alert dialog — scale + fade in over a fading backdrop. */
export function Dialog({ entry, isTop }: Props) {
  const styles = useIndicStyles(baseStyles);
  const { theme, isDark } = useAccent();
  const pal = overlayPalette(theme, isDark);
  const { title, message, actions } = entry.options;
  const progress = useSharedValue(0);
  const titleRef = useRef<View>(null);

  useEffect(() => {
    progress.value = withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) });
    // Move screen-reader focus into the dialog.
    const timer = setTimeout(() => {
      if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
    }, ENTER_MS);
    return () => clearTimeout(timer);
  }, [progress]);

  useEffect(() => {
    if (!entry.closing) return;
    const id = entry.id;
    progress.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) scheduleOnRN(removeOverlay, id);
    });
  }, [entry.closing, entry.id, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.94 + 0.06 * progress.value }],
  }));

  const dismissResult = dialogDismissResult(entry);
  const press = (a: DialogAction | null) => closeOverlay(entry.id, a);
  const stacked = actions.length > 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={entry.closing ? 'none' : 'box-none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: pal.scrim }, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissResult !== undefined ? () => press(dismissResult) : undefined}
          accessible={false}
          importantForAccessibility="no"
        />
      </Animated.View>

      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[styles.card, { backgroundColor: pal.card, borderColor: theme.hairline }, cardStyle]}
          accessibilityViewIsModal={isTop}
          importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}
          accessibilityRole="alert"
          onAccessibilityEscape={dismissResult !== undefined ? () => press(dismissResult) : undefined}
        >
          <View ref={titleRef} accessible accessibilityRole="header">
            <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
          </View>
          {message ? <Text style={[styles.message, { color: theme.ink2 }]}>{message}</Text> : null}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {actions.map((a, i) => {
              const kind = a.style ?? 'default';
              const filled = kind !== 'cancel';
              const bg = kind === 'destructive' ? pal.destructive : kind === 'default' ? theme.ink : 'transparent';
              const fg = kind === 'destructive' ? pal.destructiveFg : kind === 'default' ? theme.bg : theme.ink;
              return (
                <Pressable
                  key={`${a.label}-${i}`}
                  onPress={() => press(a)}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  style={({ pressed }) => [
                    styles.btn,
                    !stacked && styles.btnFlex,
                    {
                      backgroundColor: bg,
                      borderColor: filled ? bg : theme.hairline2,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.btnText, { color: fg }]} numberOfLines={2}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  center: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 28,
  },
  card: {
    width:        '100%',
    maxWidth:     380,
    borderRadius: RADIUS.card + 6,
    borderWidth:  StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop:   24,
    paddingBottom: 18,
    shadowColor:   '#000',
    shadowOpacity: 0.18,
    shadowRadius:  24,
    shadowOffset:  { width: 0, height: 10 },
    elevation:     12,
  },
  title: {
    fontFamily: FONTS.serifRegular,
    fontSize:   26,
    lineHeight: 34,
  },
  message: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14.5,
    lineHeight: 21,
    marginTop:  8,
  },
  actions: {
    flexDirection: 'row',
    gap:           10,
    marginTop:     22,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  btn: {
    minHeight:         48,
    borderRadius:      RADIUS.button,
    borderWidth:       1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 16,
  },
  btnFlex: { flex: 1 },
  btnText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15,
    textAlign:  'center',
  },
});
