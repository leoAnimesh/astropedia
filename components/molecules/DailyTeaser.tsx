import { StyleSheet, Text, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { DotsLoader } from './DotsLoader';
import { FONTS, RADIUS } from '@/constants/themes';

type Props = {
  text: string | null;
  loading: boolean;
  label: string;
};

export function DailyTeaser({ text, loading, label }: Props) {
  const { theme } = useAccent();

  const teaser = text
    ? (() => {
        const first = (text.split('\n').find((l) => l.trim()) ?? text)
          .replace(/^[*_]+|[*_]+$/g, '')
          .trim();
        return first.length > 130 ? first.slice(0, 128).trim() + '…' : first;
      })()
    : null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.hairline },
      ]}
    >
      <EyebrowLabel style={styles.eyebrow}>{label}</EyebrowLabel>
      {loading || teaser === null ? (
        <DotsLoader />
      ) : (
        <>
          <Text style={[styles.quote, { color: theme.ink }]}>
            &quot;{teaser}&quot;
          </Text>
          <Text style={[styles.cta, { color: theme.accent }]}>
            Read today&apos;s reading →
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding:      18,
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    marginBottom: 28,
  },
  eyebrow: {
    marginBottom: 10,
  },
  quote: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 25,
  },
  cta: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    marginTop:  14,
  },
});
