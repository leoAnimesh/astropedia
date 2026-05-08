import { StyleSheet, Text, Pressable, ActivityIndicator, type ViewStyle } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { FONTS, RADIUS } from '@/constants/themes';

type Variant = 'primary' | 'accent' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  fullWidth,
}: Props) {
  const { theme } = useAccent();

  const variantStyles: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: theme.ink,    fg: theme.bg },
    accent:  { bg: theme.accent, fg: theme.accentFg },
    ghost:   { bg: 'transparent', fg: theme.ink, border: theme.hairline2 },
  };

  const { bg, fg, border } = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderWidth:     border ? 1 : 0,
          borderColor:     border,
          opacity:         (disabled || loading) ? 0.45 : pressed ? 0.82 : 1,
          width:           fullWidth ? '100%' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height:          52,
    paddingHorizontal: 22,
    borderRadius:    RADIUS.pill,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
  },
  label: {
    fontFamily:    FONTS.sansMedium,
    fontSize:      15.5,
    letterSpacing: -0.2,
  },
});
