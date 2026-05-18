import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { FONTS, RADIUS } from '@/constants/themes';
import { formatFullDate } from '@/utils/format';

type Props = {
  name:     string;
  dateIso:  string;
  message:  string;
  mantra?:  string;
};

/**
 * Square-ish branded card sized for social sharing (1080x1350 5:4 portrait).
 * Rendered offscreen by callers (negative position) and captured via
 * react-native-view-shot.
 */
export const ShareableHoroscopeCard = forwardRef<View, Props>(
  function ShareableHoroscopeCard({ name, dateIso, message, mantra }, ref) {
    const { theme } = useAccent();
    const firstName = name.split(' ')[0];

    return (
      <View
        ref={ref}
        collapsable={false}
        style={[styles.card, { backgroundColor: theme.accent }]}
      >
        <View style={styles.top}>
          <Text style={[styles.brand, { color: theme.accentFg, opacity: 0.7 }]}>ASTROPEDIA</Text>
          <Text style={[styles.subhead, { color: theme.accentFg, opacity: 0.8 }]}>
            Daily reading for {firstName}
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={[styles.date, { color: theme.accentFg }]}>
            {formatFullDate(new Date(dateIso + 'T12:00:00'))}
          </Text>
          <Text style={[styles.message, { color: theme.accentFg }]}>
            {message}
          </Text>
        </View>

        {mantra ? (
          <View style={[styles.mantraBlock, { borderColor: theme.accentFg }]}>
            <Text style={[styles.mantraEyebrow, { color: theme.accentFg, opacity: 0.6 }]}>
              TODAY'S MANTRA
            </Text>
            <Text style={[styles.mantra, { color: theme.accentFg }]}>"{mantra}"</Text>
          </View>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    width:    1080,
    height:   1350,
    padding:  90,
    borderRadius: RADIUS.card,
    justifyContent: 'space-between',
  },
  top: {},
  brand: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      26,
    letterSpacing: 4,
  },
  subhead: {
    fontFamily: FONTS.sansRegular,
    fontSize:   34,
    marginTop:  20,
  },
  body: {
    marginVertical: 40,
  },
  date: {
    fontFamily: FONTS.serifRegular,
    fontSize:   78,
    lineHeight: 88,
    marginBottom: 36,
  },
  message: {
    fontFamily: FONTS.serifRegular,
    fontSize:   46,
    lineHeight: 62,
  },
  mantraBlock: {
    borderTopWidth: 2,
    paddingTop:     40,
    opacity:        0.95,
  },
  mantraEyebrow: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      22,
    letterSpacing: 4,
    marginBottom:  16,
  },
  mantra: {
    fontFamily: FONTS.serifItalic,
    fontSize:   42,
    lineHeight: 52,
  },
});
