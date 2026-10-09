import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/**
 * Old kundli-matching route, kept for links: the one compatibility screen is
 * /report/pair (partner mode shows the full traditional match).
 */
export default function CompatibilityRedirect() {
  const { a, b, mode } = useLocalSearchParams<{ a?: string; b?: string; mode?: string }>();
  const q = new URLSearchParams();
  if (a) q.set('a', a);
  if (b) q.set('b', b);
  q.set('mode', mode === 'friend' || mode === 'family' ? mode : 'partner');
  return <Redirect href={`/report/pair?${q.toString()}` as Href} />;
}
