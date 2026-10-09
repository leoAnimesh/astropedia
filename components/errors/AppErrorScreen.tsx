'use no memo'; // reads i18n directly; keep the fallback free of compiler caching

import { useEffect } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { reloadAppAsync } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import i18n from '@/utils/i18n';
import { useAccent } from '@/hooks/use-accent';
import { FONTS, RADIUS } from '@/constants/themes';
import { logger, recentLogs } from '@/utils/logger';

type Props = { error: Error; retry: () => Promise<void> };

const t = (key: string, fallback: string) => i18n.t(`about:crash.${key}`, { defaultValue: fallback });

/** Plain-text details the user can choose to share; no birth data, only the error and recent warnings. */
function report(error: Error): string {
  const lines = [
    `Astropedia ${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${String(Platform.Version)} · ${i18n.language}`,
    `${error.name}: ${error.message}`,
    (error.stack ?? '').split('\n').slice(0, 12).join('\n'),
  ];
  const logs = recentLogs().slice(-12);
  if (logs.length) lines.push('', 'Recent warnings:', ...logs.map((l) => `${l.at} ${l.level} ${l.message}`));
  return lines.join('\n');
}

/**
 * Root error boundary fallback (exported as ErrorBoundary from app/_layout.tsx).
 * Rendered outside the app's providers, so it only uses module stores (theme)
 * and i18n directly. "Share error details" opens the system share sheet; the
 * app itself never sends anything.
 */
export function AppErrorScreen({ error, retry }: Props) {
  const { theme, isDark } = useAccent();
  useEffect(() => {
    logger.error('[boundary]', error);
    // A crash during start-up happens under the splash screen; show this instead.
    SplashScreen.hideAsync().catch(() => {});
  }, [error]);

  const restart = () => {
    reloadAppAsync('error boundary').catch(() => { retry().catch(() => {}); });
  };
  const share = () => {
    Share.share({ title: t('shareTitle', 'Astropedia error report'), message: report(error) }).catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.ink }]} accessibilityRole="header">
          {t('title', 'Something went wrong')}
        </Text>
        <Text style={[styles.body, { color: theme.ink2 }]}>
          {t('body', 'Astropedia hit an unexpected problem. Your data is safe on this phone.')}
        </Text>

        <TouchableOpacity
          onPress={restart}
          style={[styles.primary, { backgroundColor: theme.ink }]}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: theme.bg }]}>{t('restart', 'Restart the app')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { retry().catch(() => {}); }}
          style={[styles.secondary, { borderColor: theme.hairline2 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryText, { color: theme.ink }]}>{t('retry', 'Try again')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={share}
          style={[styles.secondary, { borderColor: theme.hairline2 }]}
          accessibilityRole="button"
          accessibilityHint={t('shareNote', 'Opens the share sheet so you can send the details yourself.')}
        >
          <Text style={[styles.secondaryText, { color: theme.ink }]}>{t('share', 'Share error details')}</Text>
        </TouchableOpacity>
        <Text style={[styles.note, { color: theme.muted }]}>
          {t('shareNote', 'Opens the share sheet so you can send the details yourself. Nothing is sent automatically.')}
        </Text>

        {__DEV__ ? (
          <Text style={[styles.dev, { color: theme.muted, backgroundColor: isDark ? '#00000055' : '#0000000a' }]} selectable>
            {report(error)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 28, paddingTop: 72, paddingBottom: 40, gap: 12 },
  title: { fontFamily: FONTS.serifItalic, fontSize: 34, lineHeight: 52 },
  body: { fontFamily: FONTS.sansRegular, fontSize: 15, lineHeight: 24, marginBottom: 16 },
  primary: { minHeight: 50, borderRadius: RADIUS.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { fontFamily: FONTS.sansMedium, fontSize: 15.5 },
  secondary: {
    minHeight: 48, borderRadius: RADIUS.button, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  secondaryText: { fontFamily: FONTS.sansRegular, fontSize: 15 },
  note: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 19, marginTop: 4, textAlign: 'center' },
  dev: { fontFamily: FONTS.monoRegular, fontSize: 11, lineHeight: 16, marginTop: 24, padding: 12, borderRadius: 10 },
});
