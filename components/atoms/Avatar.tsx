import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { pickPalette, getMonogram } from '@/utils/avatar';
import { FONTS } from '@/constants/themes';

type Props = {
  name: string;
  size?: number;
  style?: ViewStyle;
};

export function Avatar({ name, size = 44, style }: Props) {
  const palette = pickPalette(name);
  const monogram = getMonogram(name);
  const fontSize = size * 0.4;

  return (
    <View
      style={[
        styles.container,
        {
          width:           size,
          height:          size,
          borderRadius:    size / 2,
          backgroundColor: palette.bg,
        },
        style,
      ]}
    >
      <Text style={[styles.monogram, { color: palette.fg, fontSize }]}>
        {monogram}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  monogram: {
    fontFamily:  FONTS.serifItalic,
    letterSpacing: -0.5,
  },
});
