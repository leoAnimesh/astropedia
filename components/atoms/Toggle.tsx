import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';

type Props = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label?: string;
  sublabel?: string;
  style?: ViewStyle;
  /** Screen-reader label when there is no visible `label`. */
  accessibilityLabel?: string;
  disabled?: boolean;
};

const TRACK_W = 48;
const TRACK_H = 28;
const THUMB   = 22;
const PAD     = (TRACK_H - THUMB) / 2;
const TRAVEL  = TRACK_W - THUMB - PAD * 2;
const SPRING  = { damping: 18, stiffness: 260, mass: 0.7 } as const;

/**
 * Animated on/off switch — identical on iOS and Android. When a label is
 * given the whole row is the touch target.
 */
export function Toggle({ value, onValueChange, label, sublabel, style, accessibilityLabel, disabled }: Props) {
  const { theme } = useAccent();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, SPRING);
  }, [value, progress]);

  const off = theme.surface3;
  const on  = theme.accent;
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [off, on]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }));

  const toggle = () => {
    if (!disabled) onValueChange(!value);
  };

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      style={[styles.row, disabled && styles.disabled, style]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={label ? sublabel : undefined}
      hitSlop={label ? undefined : 8}
    >
      {(label || sublabel) && (
        <View style={styles.text}>
          {label && <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>}
          {sublabel && <Text style={[styles.sub, { color: theme.muted }]}>{sublabel}</Text>}
        </View>
      )}
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  disabled: { opacity: 0.5 },
  text: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
  },
  sub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    marginTop:  2,
  },
  track: {
    width:        TRACK_W,
    height:       TRACK_H,
    borderRadius: TRACK_H / 2,
    padding:      PAD,
  },
  thumb: {
    width:           THUMB,
    height:          THUMB,
    borderRadius:    THUMB / 2,
    backgroundColor: '#ffffff',
    shadowColor:     '#000',
    shadowOpacity:   0.18,
    shadowRadius:    3,
    shadowOffset:    { width: 0, height: 1 },
    elevation:       2,
  },
});
