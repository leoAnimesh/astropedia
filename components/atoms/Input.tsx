import { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';

type Props = Omit<TextInputProps, 'style'> & {
  label?: string;
  containerStyle?: ViewStyle;
};

export function Input({ label, containerStyle, onFocus, onBlur, ...rest }: Props) {
  const { theme } = useAccent();
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const handleFocus = (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
    setFocused(true);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
    onFocus?.(e);
  };

  const handleBlur = (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
    setFocused(false);
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    onBlur?.(e);
  };

  const underlineColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.hairline2, theme.accent],
  });

  return (
    <View style={containerStyle}>
      {label && (
        <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      )}
      <TextInput
        {...rest}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholderTextColor={theme.faint}
        style={[styles.input, { color: theme.ink }]}
      />
      <Animated.View style={[styles.underline, { backgroundColor: underlineColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom:  4,
  },
  input: {
    fontFamily: FONTS.sansRegular,
    fontSize:   18,
    paddingVertical: 12,
  },
  underline: {
    height: 1,
  },
});
