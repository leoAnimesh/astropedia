'use no memo'; // renders language-dependent text

import { forwardRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon } from '@/components/atoms/Icon';
import { FONTS } from '@/constants/themes';
import { localizeDigits } from '@/utils/i18n';
import type { ReportPayload } from '@/utils/reports';

const TILE_BG = 'rgba(180,130,0,0.10)';

/** Text with the report's one allowed markup, <em>…</em>, set in the serif italic. */
export function EmText({ text, style, emStyle, numberOfLines }: {
  text: string; style?: StyleProp<TextStyle>; emStyle?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const parts = text.split(/(<em>.*?<\/em>)/g).filter(Boolean);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, i) => {
        const m = /^<em>(.*)<\/em>$/.exec(p);
        return m ? <Text key={i} style={[{ fontFamily: FONTS.serifItalic }, emStyle]}>{m[1]}</Text> : p;
      })}
    </Text>
  );
}

type Props = {
  report: ReportPayload;
  /** Adds a small brand line at the bottom (the shared image). */
  branded?: boolean;
  /** Partner match: a plain sentence under each of the eight parts, by koota key. */
  kootaNotes?: Partial<Record<string, string>>;
};

/**
 * The report summary card (ReportCareer / ReportCompat boards): "In one line",
 * the at-a-glance rows and the focus meter, or for a partner match the
 * traditional 36-point count, its eight parts and the Mars check.
 */
export const ReportSummaryCard = forwardRef<View, Props>(function ReportSummaryCard({ report, branded, kootaNotes }, ref) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('reports');
  const s = report.summary;
  const score = report.compat?.score;
  const n = (x: number | string) => localizeDigits(String(x));

  return (
    <View
      ref={ref}
      collapsable={false}
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
    >
      <View style={styles.top}>
        <EyebrowLabel size={11}>{s.eyebrow}</EyebrowLabel>
        {score && (
          <>
            <View style={styles.scoreRow}>
              <Text style={[styles.score, { color: theme.ink }]}>{n(score.total)}</Text>
              <Text style={[styles.ofPoints, { color: theme.ink2 }]}>{t('pair.ofPoints')}</Text>
              <View style={[styles.band, { backgroundColor: TILE_BG }]}>
                <Text style={[styles.bandText, { color: theme.ink }]}>{score.band}</Text>
              </View>
            </View>
            <Text style={[styles.scoreNote, { color: theme.muted }]}>{t('pair.scoreNote')}</Text>
          </>
        )}
        <EmText
          text={s.line}
          style={[score ? styles.lineCompat : styles.line, { color: theme.ink }]}
          emStyle={{ color: theme.ink }}
        />
      </View>

      {s.glance.length > 0 && (
        <View style={[styles.glance, { borderTopColor: theme.hairline }]}>
          {s.glance.map((g, i) => (
            <View key={g.k} style={[styles.gRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
              <Text style={[styles.gk, { color: theme.muted }]}>{g.k}</Text>
              <Text style={[styles.gv, { color: theme.ink }]}>{g.v}</Text>
            </View>
          ))}
        </View>
      )}

      {s.focus && (
        <View style={[styles.focus, { backgroundColor: theme.surface2, borderTopColor: theme.hairline }]}>
          <View style={styles.focusHead}>
            <Text style={[styles.focusLabel, { color: theme.ink }]}>{s.focus.label}</Text>
            <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[1, 2, 3].map((i) => (
                <View key={i} style={[styles.bar, { backgroundColor: i <= s.focus!.dots ? theme.accent : theme.hairline2 }]} />
              ))}
            </View>
          </View>
          <Text style={[styles.focusReason, { color: theme.ink2 }]}>{s.focus.reason}</Text>
        </View>
      )}

      {score && (
        <>
          <View style={[styles.kootas, { borderTopColor: theme.hairline }]}>
            {score.kootas.map((k) => {
              const noted = !!kootaNotes?.[k.key];
              return (
                <View key={k.key} style={[styles.kRow, noted && styles.kRowNoted]} accessible accessibilityLabel={`${k.name}, ${n(k.score)} / ${n(k.max)}${kootaNotes?.[k.key] ? `. ${kootaNotes[k.key]}` : ''}`}>
                  <View style={styles.kText}>
                    <Text style={[styles.kName, { color: theme.ink }]}>{k.name}</Text>
                    <Text style={[styles.kTrad, { color: theme.muted }]}>{k.trad}</Text>
                    {kootaNotes?.[k.key] ? <Text style={[styles.kNote, { color: theme.ink2 }]}>{kootaNotes[k.key]}</Text> : null}
                  </View>
                  <View style={[styles.kTrack, noted && styles.kTrackNoted, { backgroundColor: theme.hairline }]}>
                    <View style={[styles.kFill, { width: `${Math.round((k.score / k.max) * 100)}%`, backgroundColor: theme.accent }]} />
                  </View>
                  <Text style={[styles.kScore, noted && styles.kScoreNoted, { color: theme.ink2 }]}>{n(`${k.score}/${k.max}`)}</Text>
                </View>
              );
            })}
          </View>
          <View style={[styles.mars, { backgroundColor: theme.surface2, borderTopColor: theme.hairline }]}>
            <Icon name="check" size={16} color={theme.accent} />
            <Text style={[styles.marsText, { color: theme.ink2 }]}>
              <Text style={[styles.marsLabel, { color: theme.ink }]}>{t('pair.marsCheck')} </Text>
              {score.mars}
            </Text>
          </View>
        </>
      )}

      {branded && (
        <View style={[styles.brand, { borderTopColor: theme.hairline }]}>
          <Text style={[styles.brandText, { color: theme.muted }]}>{`${report.title} · ${t('detail.shareCardFooter')}`}</Text>
        </View>
      )}
    </View>
  );
});

const baseStyles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  top: { gap: 10, padding: 18 },
  line: { fontFamily: FONTS.serifRegular, fontSize: 25, lineHeight: 30 },
  lineCompat: { fontFamily: FONTS.serifRegular, fontSize: 23, lineHeight: 28 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  score: { fontFamily: FONTS.serifRegular, fontSize: 52, lineHeight: 56 },
  ofPoints: { fontFamily: FONTS.sansRegular, fontSize: 15, lineHeight: 20 },
  band: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'center' },
  bandText: { fontFamily: FONTS.monoRegular, fontSize: 10, lineHeight: 13, letterSpacing: 0.8 },
  scoreNote: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
  glance: { borderTopWidth: StyleSheet.hairlineWidth },
  gRow: { flexDirection: 'row', gap: 12, paddingVertical: 11, paddingHorizontal: 18 },
  gk: { width: 92, fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 18 },
  gv: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 18 },
  focus: { gap: 8, paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  focusHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  focusLabel: { flex: 1, fontFamily: FONTS.sansMedium, fontSize: 13, lineHeight: 17 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { width: 22, height: 6, borderRadius: 3 },
  focusReason: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
  // Even space under the divider above and over the Mars row below (was 4 / 10, and 4 / 16 with notes).
  kootas: { paddingVertical: 8, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  kRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 },
  // Pair screen: rows with a plain note grow; keep them off the hairlines and apart from each other.
  kRowNoted: { alignItems: 'flex-start', paddingVertical: 6 },
  // Bar and score line up with the name (17px line) when the row is top-aligned.
  kTrackNoted: { marginTop: 7 },
  kScoreNoted: { marginTop: 2 },
  kNote: { marginTop: 2, fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },
  kText: { flex: 1 },
  kName: { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 17 },
  kTrad: { fontFamily: FONTS.monoRegular, fontSize: 9.5, lineHeight: 12, letterSpacing: 0.5 },
  kTrack: { width: 84, height: 4, borderRadius: 2, overflow: 'hidden' },
  kFill: { height: 4 },
  kScore: { width: 34, textAlign: 'right', fontFamily: FONTS.monoRegular, fontSize: 11, lineHeight: 14 },
  mars: { flexDirection: 'row', gap: 10, paddingVertical: 12, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  marsText: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },
  marsLabel: { fontFamily: FONTS.sansSemiBold },
  brand: { paddingVertical: 10, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  brandText: { fontFamily: FONTS.monoRegular, fontSize: 10, lineHeight: 14, letterSpacing: 0.4 },
});
