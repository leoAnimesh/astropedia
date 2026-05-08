// All design tokens — oklch values from prototype converted to hex for RN compatibility

export type AccentKey = 'amber' | 'sage' | 'lilac' | 'blush' | 'ink';
export type ColorScheme = 'light' | 'dark';

export type ColorTokens = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  ink: string;
  ink2: string;
  muted: string;
  faint: string;
  hairline: string;
  hairline2: string;
};

export type AccentTokens = {
  accent: string;
  accentFg: string;
  accentMuted: string;
};

export type ResolvedTheme = ColorTokens & AccentTokens;

export const LIGHT_TOKENS: ColorTokens = {
  bg:        '#faf9f6',
  surface:   '#ffffff',
  surface2:  '#f3f1ec',
  surface3:  '#ebe8e1',
  ink:       '#1d1a14',
  ink2:      '#4a463c',
  muted:     '#8a8578',
  faint:     '#b6b1a3',
  hairline:  'rgba(29, 26, 20, 0.08)',
  hairline2: 'rgba(29, 26, 20, 0.16)',
};

export const DARK_TOKENS: ColorTokens = {
  bg:        '#131210',
  surface:   '#1c1a16',
  surface2:  '#24221d',
  surface3:  '#2d2a23',
  ink:       '#f1ede2',
  ink2:      '#c5c0b1',
  muted:     '#807a6c',
  faint:     '#4d4940',
  hairline:  'rgba(241, 237, 226, 0.10)',
  hairline2: 'rgba(241, 237, 226, 0.20)',
};

export const ACCENT_THEMES: Record<AccentKey, AccentTokens> = {
  // oklch(68% 0.12 60) ≈ warm amber
  amber: { accent: '#C68B2F', accentFg: '#ffffff', accentMuted: '#F5E9C8' },
  // oklch(68% 0.07 145) ≈ sage green
  sage:  { accent: '#5E9970', accentFg: '#ffffff', accentMuted: '#D4E8DA' },
  // oklch(68% 0.10 305) ≈ soft lilac
  lilac: { accent: '#8B6EC4', accentFg: '#ffffff', accentMuted: '#E0D4F5' },
  // oklch(74% 0.10 20) ≈ blush rose
  blush: { accent: '#C47A7A', accentFg: '#ffffff', accentMuted: '#F5DADA' },
  // oklch(40% 0.02 260) ≈ dark slate
  ink:   { accent: '#4A4742', accentFg: '#ffffff', accentMuted: '#D5D3CE' },
};

export const ACCENT_LABEL: Record<AccentKey, string> = {
  amber: 'Amber',
  sage:  'Sage',
  lilac: 'Lilac',
  blush: 'Blush',
  ink:   'Ink',
};

// Cache by `scheme:accentKey` so the same object reference is returned each time.
// This prevents Tabs / useSyncExternalStore from seeing a new reference every render.
const _themeCache = new Map<string, ResolvedTheme>();

export function resolveTheme(scheme: ColorScheme, accentKey: AccentKey): ResolvedTheme {
  const key = `${scheme}:${accentKey}`;
  let cached = _themeCache.get(key);
  if (!cached) {
    const tokens = scheme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
    const accent = ACCENT_THEMES[accentKey] ?? ACCENT_THEMES.amber;
    cached = { ...tokens, ...accent };
    _themeCache.set(key, cached);
  }
  return cached;
}

export const FONTS = {
  serifRegular:  'InstrumentSerif-Regular',
  serifItalic:   'InstrumentSerif-Italic',
  sansRegular:   'Geist-Regular',
  sansMedium:    'Geist-Medium',
  sansSemiBold:  'Geist-SemiBold',
  monoRegular:   'GeistMono-Regular',
} as const;

export const RADIUS = {
  card:   18,
  pill:   999,
  button: 999,
  small:  10,
  medium: 14,
} as const;

// Legacy Colors export so existing haptic-tab.tsx / icon-symbol.tsx continue to work
export const Colors = {
  light: {
    text:            LIGHT_TOKENS.ink,
    background:      LIGHT_TOKENS.bg,
    tint:            ACCENT_THEMES.amber.accent,
    icon:            LIGHT_TOKENS.muted,
    tabIconDefault:  LIGHT_TOKENS.muted,
    tabIconSelected: ACCENT_THEMES.amber.accent,
  },
  dark: {
    text:            DARK_TOKENS.ink,
    background:      DARK_TOKENS.bg,
    tint:            ACCENT_THEMES.amber.accent,
    icon:            DARK_TOKENS.muted,
    tabIconDefault:  DARK_TOKENS.muted,
    tabIconSelected: ACCENT_THEMES.amber.accent,
  },
};
