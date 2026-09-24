import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { FONTS, RADIUS } from '@/constants/themes';
import type { RecommendationCardProps } from './registry';

export const CARD_WIDTH = 196;

/**
 * Shared card shell used by every recommendation type that doesn't ship its
 * own `Card`. Layout: glyph badge + type eyebrow, title, subtitle, CTA.
 */
export const RecommendationCard = memo(function RecommendationCard({
  recommendation,
  definition,
  onPress,
}: RecommendationCardProps) {
  const { theme } = useAccent();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${definition.label}: ${recommendation.title}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.hairline2, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: definition.tint + '26' }]}>
          <Text style={[styles.glyph, { color: definition.tint }]}>{definition.glyph}</Text>
        </View>
        <Text style={[styles.eyebrow, { color: theme.muted }]} numberOfLines={1}>
          {definition.label}
        </Text>
      </View>
      <Text style={[styles.title, { color: theme.ink }]} numberOfLines={2}>
        {recommendation.title}
      </Text>
      {recommendation.subtitle ? (
        <Text style={[styles.subtitle, { color: theme.muted }]} numberOfLines={2}>
          {recommendation.subtitle}
        </Text>
      ) : null}
      <View style={styles.spacer} />
      <Text style={[styles.cta, { color: definition.tint }]} numberOfLines={1}>
        {definition.cta} →
      </Text>
    </Pressable>
  );
});

export const cardStyles = StyleSheet.create({
  base: {
    width:        CARD_WIDTH,
    minHeight:    132,
    borderRadius: RADIUS.medium,
    padding:      14,
  },
});

const styles = StyleSheet.create({
  card: {
    ...cardStyles.base,
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  10,
  },
  badge: {
    width:          26,
    height:         26,
    borderRadius:   13,
    alignItems:     'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 13 },
  eyebrow: {
    flex:          1,
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15,
    lineHeight: 20,
  },
  subtitle: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 17,
    marginTop:  3,
  },
  spacer: { flex: 1, minHeight: 10 },
  cta: {
    fontFamily: FONTS.sansMedium,
    fontSize:   12.5,
  },
});
