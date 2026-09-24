import { Alert } from 'react-native';
import { router, type Href } from 'expo-router';
import { registerRecommendation } from '../registry';

/** In-app destinations a promotion may deep-link to. Anything else → Alert. */
const ALLOWED_ROUTES = new Set(['/panchang', '/compatibility']);

registerRecommendation({
  type:  'promotion',
  label: 'Featured',
  glyph: '✺',
  tint:  '#C68B2F',
  cta:   'Open',
  onPress: (rec) => {
    const route = typeof rec.meta?.route === 'string' ? rec.meta.route : null;
    if (route && ALLOWED_ROUTES.has(route)) {
      router.push(route as Href);
      return;
    }
    Alert.alert(rec.title, rec.subtitle ?? 'More on this soon.');
  },
});
