import { Text } from 'react-native';
import { useModelUpgrade } from '@/hooks/use-local-llm';

/**
 * Quiet, non-blocking progress for the background model upgrade (the tier's
 * model downloading while the small starter model already answers). Renders
 * inline — nest it inside a header subtitle `<Text>` so it inherits its style.
 * Hidden when idle, paused or retrying: failures never surface as errors.
 */
export function ModelUpgradeHint() {
  const upgrade = useModelUpgrade();
  if (upgrade.status !== 'downloading') return null;
  const pct = Math.floor(upgrade.progress * 100);
  return (
    <Text accessibilityLabel={`Upgrading Saga to ${upgrade.label}, ${pct} percent`}>
      {` · upgrading ${pct}%`}
    </Text>
  );
}
