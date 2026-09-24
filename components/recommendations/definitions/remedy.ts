import { Alert } from 'react-native';
import { registerRecommendation } from '../registry';

/**
 * 'remedy' is NOT one of the assignment's five types — it was added to show
 * that a new experience is a single self-registering file.
 */
registerRecommendation({
  type:  'remedy',
  label: 'Remedy',
  glyph: 'ॐ',
  tint:  '#B0662E',
  cta:   'How to practise',
  onPress: (rec) => {
    const mantra = rec.meta?.mantra ?? rec.subtitle ?? rec.title;
    const day    = rec.meta?.day;
    Alert.alert(
      rec.title,
      `Chant "${mantra}" 108 times${day ? ` on ${day}s` : ''}, ideally at sunrise, with a calm, steady breath.`,
    );
  },
});
