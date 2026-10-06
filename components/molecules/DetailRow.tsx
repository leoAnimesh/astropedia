import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';

type Props = {
  label: string;
  value: string;
  last?: boolean;
};

export function DetailRow({ label, value, last }: Props) {
  const { theme } = useAccent();
  const { i18n } = useTranslation();
  // Letter-spacing pulls apart Devanagari/Bengali conjuncts.
  const indic = i18n.language !== 'en';
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline },
      ]}
    >
      <Text style={[styles.label, { color: theme.muted }, indic && { letterSpacing: 0 }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.ink }]}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 12,
  },
  label: {
    width:         64,
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  value: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
  },
});
