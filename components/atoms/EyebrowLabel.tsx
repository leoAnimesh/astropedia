import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  size?: number;
};

export function EyebrowLabel({ children, style, size = 10.5 }: Props) {
  const { theme } = useAccent();
  const { i18n } = useTranslation();
  // Letter-spacing pulls apart Devanagari/Bengali conjuncts.
  const latin = i18n.language === 'en';
  return (
    <Text style={[styles.base, { color: theme.muted, fontSize: size }, style, !latin && styles.noTracking]}>
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
  noTracking: {
    letterSpacing: 0,
  },
});
