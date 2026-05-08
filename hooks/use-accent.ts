import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/stores/settings-store';
import { resolveTheme, type ResolvedTheme, type AccentKey } from '@/constants/themes';

export function useAccent(): {
  theme: ResolvedTheme;
  accentKey: AccentKey;
  setAccentKey: (k: AccentKey) => void;
  isDark: boolean;
} {
  const systemScheme  = useColorScheme();
  const accentKey     = useSettingsStore((s) => s.accentKey);
  const override      = useSettingsStore((s) => s.darkModeOverride);
  const setAccentKey  = useSettingsStore((s) => s.setAccentKey);

  const scheme =
    override === 'light' ? 'light' :
    override === 'dark'  ? 'dark'  :
    systemScheme === 'dark' ? 'dark' : 'light';

  const theme = resolveTheme(scheme, accentKey);

  return { theme, accentKey, setAccentKey, isDark: scheme === 'dark' };
}
