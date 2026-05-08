import { StyleSheet, Text, Pressable, type ViewStyle } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';

type Props = {
  label: string;
  onPress: () => void;
  active?: boolean;
  style?: ViewStyle;
};

export function Chip({ label, onPress, active, style }: Props) {
  const { theme } = useAccent();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: active ? theme.accentMuted : 'transparent',
          borderColor:     active ? theme.accent : theme.hairline2,
          opacity:         pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: active ? theme.accent : theme.ink2 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height:          34,
    paddingHorizontal: 14,
    borderRadius:    999,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  label: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      13.5,
    letterSpacing: -0.1,
  },
});
