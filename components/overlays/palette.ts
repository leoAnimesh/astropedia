import type { ResolvedTheme } from '@/constants/themes';

/** Colours the overlays need beyond the shared theme tokens. */
export function overlayPalette(theme: ResolvedTheme, isDark: boolean) {
  return {
    scrim:       isDark ? 'rgba(0, 0, 0, 0.62)' : 'rgba(29, 26, 20, 0.38)',
    destructive: isDark ? '#E2796D' : '#B4473D',
    destructiveFg: '#ffffff',
    card:        isDark ? theme.surface2 : theme.surface,
  };
}

export const ENTER_MS = 220;
export const EXIT_MS  = 170;
