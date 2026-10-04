import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/stores/settings-store';
import { resolveTheme, type ResolvedTheme, type AccentKey, type ThemeMode } from '@/constants/themes';

export function useAccent(): {
  theme: ResolvedTheme;
  accentKey: AccentKey;
  setAccentKey: (k: AccentKey) => void;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
} {
  const systemScheme  = useColorScheme();
  const accentKey     = useSettingsStore((s) => s.accentKey);
  const override      = useSettingsStore((s) => s.darkModeOverride);
  const setMode       = useSettingsStore((s) => s.setDarkModeOverride);
  const setAccentKey  = useSettingsStore((s) => s.setAccentKey);

  // 'system' follows the live OS scheme (useColorScheme re-renders on change).
  const scheme: 'light' | 'dark' =
    override === 'light' ? 'light' :
    override === 'dark'  ? 'dark'  :
    systemScheme === 'dark' ? 'dark' : 'light';

  const theme = resolveTheme(scheme, accentKey);

  return { theme, accentKey, setAccentKey, isDark: scheme === 'dark', mode: override, setMode };
}
