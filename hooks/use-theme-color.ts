// Backward-compatible hook — new code should use useAccent() from hooks/use-accent.ts instead
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark,
): string {
  const scheme = useColorScheme() ?? 'light';
  return props[scheme] ?? Colors[scheme][colorName];
}
