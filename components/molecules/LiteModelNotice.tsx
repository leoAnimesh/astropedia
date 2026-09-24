import { StyleSheet, Text } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { useModelUpgrade } from '@/hooks/use-local-llm';
import { FONTS } from '@/constants/themes';

/**
 * One quiet line above the composer while the small starter model stands in
 * for the tier's model (an upgrade only exists while a lighter model is the
 * one answering — see planModels). Sets expectations for rougher replies
 * instead of letting them look like the app's normal quality.
 */
export function LiteModelNotice({ persona }: { persona: string }) {
  const { theme } = useAccent();
  const upgrade = useModelUpgrade();
  if (upgrade.status === 'none') return null;
  return (
    <Text style={[styles.text, { color: theme.muted }]} accessibilityRole="text">
      {persona} is using a lighter model while the full one downloads, so replies may be simpler for now.
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily:        FONTS.sansRegular,
    fontSize:          11.5,
    fontStyle:         'italic',
    textAlign:         'center',
    paddingHorizontal: 24,
    paddingVertical:   6,
  },
});
