import { Alert } from 'react-native';
import { registerRecommendation } from '../registry';

registerRecommendation({
  type:  'consultation',
  label: 'Consultation',
  glyph: '☉',
  tint:  '#5E9970',
  cta:   'Book a session',
  onPress: (rec, ctx) => {
    Alert.alert(
      rec.title,
      `${rec.subtitle ? rec.subtitle + '.\n\n' : ''}Live sessions with human astrologers are coming soon. Until then, ${ctx.persona} can go deeper on this question right here in the chat.`,
    );
  },
});
