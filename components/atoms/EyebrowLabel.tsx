import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  size?: number;
};

export function EyebrowLabel({ children, style, size = 10.5 }: Props) {
  const { theme } = useAccent();
  return (
    <Text style={[styles.base, { color: theme.muted, fontSize: size }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily:    FONTS.monoRegular,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    fontWeight:    '500',
  },
});
