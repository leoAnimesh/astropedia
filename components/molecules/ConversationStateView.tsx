import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { FONTS } from '@/constants/themes';

type Props =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void };

/** Full-area loading / network-failure states for the conversation. */
export function ConversationStateView(props: Props) {
  const { theme } = useAccent();

  if (props.kind === 'loading') {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator color={theme.accent} />
        <Text style={[styles.title, { color: theme.muted }]}>Loading conversation...</Text>
      </View>
    );
  }

  return (
    <View style={styles.center} accessibilityLiveRegion="assertive">
      <Icon name="warning" size={28} color={theme.muted} />
      <Text style={[styles.title, { color: theme.ink }]}>Unable to load conversation.</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>
        Check your connection and try again.
      </Text>
      <Button label="Retry" onPress={props.onRetry} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15,
    textAlign:  'center',
  },
  sub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    textAlign:  'center',
  },
  button: { marginTop: 8, minWidth: 140 },
});
