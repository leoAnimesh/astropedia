import { StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';

type Props = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label?: string;
  sublabel?: string;
  style?: ViewStyle;
};

export function Toggle({ value, onValueChange, label, sublabel, style }: Props) {
  const { theme } = useAccent();
  return (
    <View style={[styles.row, style]}>
      {(label || sublabel) && (
        <View style={styles.text}>
          {label && <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>}
          {sublabel && <Text style={[styles.sub, { color: theme.muted }]}>{sublabel}</Text>}
        </View>
      )}
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.surface3, true: theme.accent }}
        thumbColor="#ffffff"
        ios_backgroundColor={theme.surface3}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
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
});
