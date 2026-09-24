import { memo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS } from '@/constants/themes';
import { registerRecommendation, type RecommendationCardProps } from '../registry';
import { cardStyles } from '../RecommendationCard';

/**
 * Tarot ships its own card component — an example of a type overriding the
 * shared shell without the chat knowing anything about it.
 */

const MAJOR_ARCANA: { name: string; meaning: string }[] = [
  { name: 'The Fool',           meaning: 'A fresh start. Take the leap, but look where you land.' },
  { name: 'The Magician',       meaning: 'You already have the tools. Use them with intent.' },
  { name: 'The High Priestess', meaning: 'Trust the quiet knowing. Not everything needs saying yet.' },
  { name: 'The Empress',        meaning: 'Growth through care. Tend what you want to flourish.' },
  { name: 'The Emperor',        meaning: 'Structure and ownership. Set the rules for your season.' },
  { name: 'The Hierophant',     meaning: 'Learn from tradition or a mentor before you break the mould.' },
  { name: 'The Lovers',         meaning: 'A meaningful choice. Align it with your values.' },
  { name: 'The Chariot',        meaning: 'Momentum through discipline. Hold the reins firmly.' },
  { name: 'Strength',           meaning: 'Gentle persistence wins over force.' },
  { name: 'The Hermit',         meaning: 'Step back to see clearly. Solitude brings the answer.' },
  { name: 'Wheel of Fortune',   meaning: 'A turning point. Ride the change rather than resist it.' },
  { name: 'Justice',            meaning: 'Fair outcomes follow honest actions.' },
  { name: 'The Hanged Man',     meaning: 'Pause. A new angle unlocks what effort cannot.' },
  { name: 'Death',              meaning: 'An ending that makes room for something truer.' },
  { name: 'Temperance',         meaning: 'Balance and patience. Blend, don\'t force.' },
  { name: 'The Devil',          meaning: 'Notice what holds you. The chain is looser than it looks.' },
  { name: 'The Tower',          meaning: 'Sudden change clears false ground. Rebuild stronger.' },
  { name: 'The Star',           meaning: 'Hope returns. Keep going — you are on the right track.' },
  { name: 'The Moon',           meaning: 'Not everything is clear yet. Move slowly, trust instinct.' },
  { name: 'The Sun',            meaning: 'Success and warmth. Let yourself be seen.' },
  { name: 'Judgement',          meaning: 'A calling. Answer it without looking back.' },
  { name: 'The World',          meaning: 'Completion. One chapter closes with something earned.' },
];

const TAROT_TINT = '#7A4FA0';

const TarotCard = memo(function TarotCard({ recommendation, onPress }: RecommendationCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Tarot: ${recommendation.title}`}
      style={({ pressed }) => [cardStyles.base, styles.card, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.frame}>
        <Text style={styles.eyebrow}>Tarot</Text>
        <Text style={styles.star}>✧ ☾ ✧</Text>
        <Text style={styles.title} numberOfLines={2}>{recommendation.title}</Text>
        {recommendation.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{recommendation.subtitle}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Text style={styles.cta}>Draw a card →</Text>
      </View>
    </Pressable>
  );
});

registerRecommendation({
  type:  'tarot',
  label: 'Tarot',
  glyph: '✧',
  tint:  TAROT_TINT,
  cta:   'Draw a card',
  Card:  TarotCard,
  onPress: (rec) => {
    const card = MAJOR_ARCANA[Math.floor(Math.random() * MAJOR_ARCANA.length)];
    Alert.alert(rec.title, `You drew ${card.name}.\n\n${card.meaning}`);
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2A1F3D',
    padding:         6,
  },
  frame: {
    flex:         1,
    borderWidth:  1,
    borderColor:  'rgba(233, 214, 255, 0.35)',
    borderRadius: 10,
    padding:      10,
    alignItems:   'center',
  },
  eyebrow: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         'rgba(233, 214, 255, 0.7)',
  },
  star: {
    color:        '#E9D6FF',
    fontSize:     14,
    marginVertical: 6,
  },
  title: {
    fontFamily: FONTS.serifRegular,
    fontSize:   17,
    lineHeight: 21,
    color:      '#FFFFFF',
    textAlign:  'center',
  },
  subtitle: {
    fontFamily: FONTS.sansRegular,
    fontSize:   11.5,
    color:      'rgba(233, 214, 255, 0.75)',
    marginTop:  3,
    textAlign:  'center',
  },
  cta: {
    fontFamily: FONTS.sansMedium,
    fontSize:   12,
    color:      '#E9D6FF',
  },
});
