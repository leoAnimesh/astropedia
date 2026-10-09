import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { FONTS } from '@/constants/themes';

type Option<K extends string> = { key: K; label: string };

type Props<K extends string> = {
  options: Option<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
  /** 'large' (40pt, screen-level tabs) or 'small' (32pt, inside a card). */
  size?: 'large' | 'small';
  style?: StyleProp<ViewStyle>;
};

/** Pill segmented control: surface2 track, the selected segment raised on surface. */
export function SegmentedControl<K extends string>({ options, value, onChange, accessibilityLabel, size = 'large', style }: Props<K>) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const small = size === 'small';
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, small && styles.trackSmall, { backgroundColor: theme.surface2 }, style]}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              styles.segment,
              small && styles.segmentSmall,
              {
                backgroundColor: on ? theme.surface : 'transparent',
                borderColor:     on ? theme.hairline : 'transparent',
                opacity:         pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[small ? styles.labelSmall : styles.label, { color: on ? theme.ink : theme.ink2 }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap:           4,
    padding:       4,
    borderRadius:  999,
  },
  trackSmall: { padding: 3, gap: 2 },
  segment: {
    flex:           1,
    minHeight:      40,
    borderRadius:   999,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentSmall: { flex: 0, minHeight: 30, paddingHorizontal: 12 },
  label: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14,
    lineHeight: 18,
  },
  labelSmall: {
    fontFamily: FONTS.sansMedium,
    fontSize:   12.5,
    lineHeight: 16,
  },
});
