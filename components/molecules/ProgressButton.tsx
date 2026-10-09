import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAccent } from '@/hooks/use-accent';
import { FONTS, RADIUS } from '@/constants/themes';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  /** When set the pill becomes a progress bar: 0-100 fill, `progressLabel` inside. */
  progress?: number | null;
  progressLabel?: string;
  style?: ViewStyle;
};

/**
 * Pill button that turns into a left-to-right fill while work is running. The
 * label is drawn twice: ink over the empty part, accent-foreground over the
 * fill (a clipped copy), so it stays readable across the edge.
 */
export function ProgressButton({ label, onPress, variant = 'ghost', disabled, progress = null, progressLabel = '', style }: Props) {
  const { theme } = useAccent();
  const [width, setWidth] = useState(0);
  const busy = progress != null;
  const pct = useSharedValue(0);

  useEffect(() => {
    pct.value = withTiming(busy ? Math.max(0, Math.min(100, progress ?? 0)) : 0, { duration: 350, easing: Easing.out(Easing.cubic) });
  }, [busy, progress, pct]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${pct.value}%` }));

  const idleBg = variant === 'primary' ? theme.ink : 'transparent';
  const idleFg = variant === 'primary' ? theme.bg : theme.ink;

  if (!busy) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [
          styles.base,
          { backgroundColor: idleBg, borderColor: theme.hairline2, borderWidth: variant === 'ghost' ? 1 : 0, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
          style,
        ]}
      >
        <Text style={[styles.label, { color: idleFg }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={progressLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress ?? 0) }}
      accessibilityLiveRegion="polite"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.base, styles.busy, { backgroundColor: theme.surface2, borderColor: theme.hairline2 }, style]}
    >
      <Text style={[styles.label, { color: theme.ink }]} numberOfLines={1}>{progressLabel}</Text>
      <Animated.View style={[styles.fill, { backgroundColor: theme.accent }, fillStyle]}>
        <View style={[styles.fillInner, { width }]}>
          <Text style={[styles.label, { color: theme.accentFg }]} numberOfLines={1}>{progressLabel}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: { overflow: 'hidden', borderWidth: 1 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  fillInner: { height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  label: { fontFamily: FONTS.sansMedium, fontSize: 14.5, letterSpacing: -0.2 },
});
