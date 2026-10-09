import { StyleSheet, Text, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { FONTS, RADIUS } from '@/constants/themes';
import type { CheckItem } from '@/utils/reports';

/**
 * "Things to consider" for a partner match: Nadi, Bhakoot and Gana with their
 * traditional cancellations, and each person's Manglik reading (references,
 * exemptions, level). Items come from utils/match-detail.ts matchChecks via
 * the compatibility report, so the pair screen, the full report and the PDF
 * say the same thing: a plain sentence first, the traditional detail under it.
 *
 * Layout: one card, full-bleed hairlines between blocks (like every other
 * list card on the Reports screens), 16 inside each block, 8 between lines.
 */
export function MatchDoshas({ items }: { items: CheckItem[] }) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
      {items.map((it, i) => (
        <View
          key={it.key}
          style={[styles.block, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}
        >
          <View style={styles.head}>
            <Text style={[styles.title, { color: theme.ink }]}>{it.name}</Text>
            <Text style={[styles.trad, { color: theme.muted }]}>{it.trad}</Text>
            {it.state === 'note' && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
          </View>
          <Text style={[styles.body, { color: theme.ink2 }]}>{it.text}</Text>
          {it.people.map((p) => (
            <View key={p.name} style={styles.person}>
              <Text style={[styles.personText, { color: theme.ink }]}>{p.text}</Text>
              {p.detail.map((d) => (
                <Text key={d} style={[styles.small, { color: theme.muted }]}>{d}</Text>
              ))}
            </View>
          ))}
          {it.detail ? <Text style={[styles.small, { color: theme.muted }]}>{it.detail}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  block: { paddingVertical: 16, paddingHorizontal: 16, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontFamily: FONTS.serifRegular, fontSize: 19, lineHeight: 24 },
  trad: { fontFamily: FONTS.monoRegular, fontSize: 9.5, lineHeight: 12, letterSpacing: 0.5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  body: { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 20 },
  person: { gap: 4 },
  personText: { fontFamily: FONTS.sansMedium, fontSize: 13.5, lineHeight: 19 },
  small: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
});
