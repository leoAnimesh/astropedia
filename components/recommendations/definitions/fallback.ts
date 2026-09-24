import { Alert } from 'react-native';
import { setFallbackRecommendation } from '../registry';

/**
 * Safe default for recommendation types this build doesn't know. Renders a
 * neutral card with the payload's own title/subtitle and a harmless tap.
 */
setFallbackRecommendation({
  type:  '__fallback__',
  label: 'Suggestion',
  glyph: '✦',
  tint:  '#8A8578',
  cta:   'Learn more',
  onPress: (rec) => {
    Alert.alert(rec.title, rec.subtitle ?? 'More details are coming soon.');
  },
});
