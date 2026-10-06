/**
 * Small button that floats above the phone's keyboard while it's in use
 * (after the 🌐 key), to switch back to the app keyboard.
 */
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { RADIUS } from '@/constants/themes';
import { useKeyboardApi } from './context';

export function SystemKeyboardPill() {
  const api = useKeyboardApi()!;
  const { theme } = useAccent();
  const { t } = useTranslation('keyboard');
  const { nativeHeight } = api;

  const style = useAnimatedStyle(() => ({ bottom: nativeHeight.get() + 8 }));

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      collapsable={false}
      style={[styles.wrap, style]}
      onTouchStart={api.claimTouch}
    >
      <Pressable
        onPress={api.useCustom}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.appKeyboard')}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: theme.surface, borderColor: theme.hairline2, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <MaterialIcons name="keyboard" size={20} color={theme.ink} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right:    12,
  },
  pill: {
    width:          44,
    height:         36,
    borderRadius:   RADIUS.pill,
    borderWidth:    StyleSheet.hairlineWidth,
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOpacity:  0.12,
    shadowRadius:   6,
    shadowOffset:   { width: 0, height: 2 },
    elevation:      3,
  },
});
