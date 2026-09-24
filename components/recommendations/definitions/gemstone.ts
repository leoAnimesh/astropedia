import { Alert } from 'react-native';
import { registerRecommendation } from '../registry';

registerRecommendation({
  type:  'gemstone',
  label: 'Gemstone',
  glyph: '◆',
  tint:  '#3E6FB0',
  cta:   'Why this stone',
  onPress: (rec) => {
    const planet = rec.meta?.planet;
    const day    = rec.meta?.day;
    const theme  = rec.meta?.theme;
    const lines = [
      rec.subtitle ?? null,
      planet && theme ? `${rec.title} strengthens ${planet}, which governs ${theme}.` : null,
      day ? `Traditionally first worn on a ${day} morning.` : null,
      'Gemstones are powerful in Vedic practice — have a full chart reading before wearing one.',
    ].filter(Boolean);
    Alert.alert(rec.title, lines.join('\n\n'));
  },
});
