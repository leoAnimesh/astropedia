'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useSettingsStore } from '@/stores/settings-store';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Toggle } from '@/components/atoms/Toggle';
import { Icon } from '@/components/atoms/Icon';
import { showDialog } from '@/components/overlays';
import { overlayPalette } from '@/components/overlays/palette';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { FONTS, RADIUS, ACCENT_THEMES, type AccentKey } from '@/constants/themes';
import { clearAllData } from '@/utils/database';
import { Storage } from '@/utils/storage';
import { Cache } from '@/utils/cache';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { todayIso } from '@/utils/format';
import { intlLocale, localizeDigits } from '@/utils/i18n';
import { parseBackup, type ParsedBackup } from '@/utils/backup';
import { deleteBackupFiles, exportBackup, pickBackupText, restoreBackup } from '@/utils/backup-io';
import {
  ensureNotificationPermission,
  scheduleDailyHoroscope,
  cancelDailyHoroscope,
  scheduleTransitAlerts,
  cancelTransitAlerts,
} from '@/utils/notifications';

const ACCENT_KEYS: AccentKey[] = ['amber', 'sage', 'lilac', 'blush', 'ink'];

export default function SettingsScreen() {
  const { theme, accentKey, setAccentKey, isDark } = useAccent();
  const styles = useIndicStyles(baseStyles);
  const danger = overlayPalette(theme, isDark).destructive;
  const { t } = useTranslation('settings');
  const { profiles } = useProfiles();
  const setDark = useSettingsStore((s) => s.setDarkModeOverride);
  const darkOverride = useSettingsStore((s) => s.darkModeOverride);
  const [dailyHoroscope,  setDailyHoroscope]  = useState<boolean>(Storage.getDailyHoroscopePush());
  const [transitAlerts,   setTransitAlerts]   = useState<boolean>(Storage.getTransitAlerts());
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);

  const handleToggleDailyHoroscope = async (next: boolean) => {
    if (next) {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        showDialog({ title: t('notifications.offTitle'), message: t('notifications.offDaily') });
        return;
      }
      Storage.setDailyHoroscopePush(true);
      setDailyHoroscope(true);
      scheduleDailyHoroscope();
    } else {
      Storage.setDailyHoroscopePush(false);
      setDailyHoroscope(false);
      cancelDailyHoroscope();
    }
  };

  const handleToggleTransitAlerts = async (next: boolean) => {
    if (next) {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        showDialog({ title: t('notifications.offTitle'), message: t('notifications.offTransit') });
        return;
      }
      Storage.setTransitAlerts(true);
      setTransitAlerts(true);
      scheduleTransitAlerts(null);
    } else {
      Storage.setTransitAlerts(false);
      setTransitAlerts(false);
      cancelTransitAlerts();
    }
  };

  const handleClearAICache = () => {
    const today = todayIso();
    profiles.forEach((p) => {
      Storage.deleteHoroscopeCache(p.id, today);
      Storage.deleteChartReading(p.id);
    });
    // Also wipe semantic Q&A cache so chat replies regenerate with the
    // current system prompt instead of returning stale entries.
    Cache.clear();
    showDialog({ title: t('dev.clearedTitle'), message: t('dev.clearedMessage') });
  };

  const setOnboardingDone = useOnboardingStore((s) => s.setDone);

  const handleReset = () => {
    showDialog({
      title:   t('reset.title'),
      message: t('reset.message'),
      actions: [
        { label: t('reset.cancel'), style: 'cancel' },
        {
          label: t('reset.confirm'),
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Storage.clear();
            deleteBackupFiles();
            // Flipping the store causes the root layout's <Stack.Protected>
            // guards to swap to the onboarding stack — no router.replace needed.
            setOnboardingDone(false);
          },
        },
      ],
    });
  };

  const handleExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      await exportBackup(t('backup.shareTitle'));
      setBusy(null);
      showDialog({ title: t('backup.doneTitle'), message: t('backup.doneMessage') });
    } catch {
      setBusy(null);
      showDialog({ title: t('backup.failedTitle'), message: t('backup.failedMessage') });
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    let text: string | null;
    try {
      text = await pickBackupText();
    } catch {
      showDialog({ title: t('restore.errorTitle'), message: t('restore.errors.readFailed') });
      return;
    }
    if (text === null) return; // picker cancelled

    const parsed = parseBackup(text);
    if (!parsed.ok) {
      showDialog({ title: t('restore.errorTitle'), message: t(`restore.errors.${parsed.error}`) });
      return;
    }
    const backup = parsed.backup;
    const made = backup.exportedAt ? new Date(backup.exportedAt) : null;
    const lines = [
      made && !Number.isNaN(made.getTime())
        ? t('restore.madeOn', {
            date: localizeDigits(made.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })),
          })
        : null,
      t('restore.counts', {
        profiles: backup.counts.profiles,
        chats:    backup.counts.chats,
        journal:  backup.counts.journal,
      }),
      t('restore.replaceWarning'),
    ].filter(Boolean);

    showDialog({
      title:   t('restore.confirmTitle'),
      message: lines.join('\n\n'),
      actions: [
        { label: t('restore.cancel'), style: 'cancel' },
        { label: t('restore.confirm'), style: 'destructive', onPress: () => runRestore(backup) },
      ],
    });
  };

  const runRestore = async (backup: ParsedBackup) => {
    setBusy('restore');
    try {
      const outcome = await restoreBackup(backup);
      setDailyHoroscope(Storage.getDailyHoroscopePush());
      setTransitAlerts(Storage.getTransitAlerts());
      setBusy(null);
      await showDialog({
        title:   t('restore.doneTitle'),
        message: outcome.notificationsBlocked
          ? `${t('restore.doneMessage')}\n\n${t('restore.notificationsBlocked')}`
          : t('restore.doneMessage'),
      });
      router.dismissTo('/');
    } catch {
      setBusy(null);
      showDialog({ title: t('restore.errorTitle'), message: t('restore.errors.failed') });
    }
  };

  const busyOrChevron = (which: 'export' | 'restore') =>
    busy === which
      ? <ActivityIndicator size="small" color={theme.muted} />
      : <Icon name="chevron" size={14} color={theme.faint} />;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel={t('back')}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.ink }]}>
          <Text style={styles.titleItalic}>{t('title')}</Text>
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Appearance */}
        <EyebrowLabel style={styles.sectionLabel}>{t('appearance.section')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Text style={[styles.cardLabel, { color: theme.ink2 }]}>{t('appearance.accentColor')}</Text>
          <View style={styles.swatchRow}>
            {ACCENT_KEYS.map((key) => {
              const isActive = key === accentKey;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: ACCENT_THEMES[key].accent,
                      borderWidth:     isActive ? 2 : 1,
                      borderColor:     isActive ? theme.ink : theme.hairline2,
                    },
                  ]}
                  onPress={() => setAccentKey(key)}
                  accessibilityLabel={t(`accent.${key}`)}
                >
                  {isActive && (
                    <Text style={styles.swatchCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />

          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('appearance.theme')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>{t('appearance.themeSub')}</Text>
            </View>
          </View>
          <View style={styles.langOptions} accessibilityRole="radiogroup">
            {(['light', 'dark', 'system'] as const).map((m) => {
              const on = m === darkOverride;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setDark(m)}
                  style={[
                    styles.langPill,
                    on
                      ? { backgroundColor: theme.ink, borderColor: theme.ink }
                      : { backgroundColor: theme.surface, borderColor: theme.hairline2 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t(`appearance.${m}`)}
                >
                  <Text style={[styles.langPillText, { color: on ? theme.bg : theme.ink }]}>{t(`appearance.${m}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Notifications */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>{t('notifications.section')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Toggle
            value={dailyHoroscope}
            onValueChange={handleToggleDailyHoroscope}
            label={t('notifications.daily')}
            sublabel={t('notifications.dailySub')}
          />
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <Toggle
            value={transitAlerts}
            onValueChange={handleToggleTransitAlerts}
            label={t('notifications.transit')}
            sublabel={t('notifications.transitSub')}
          />
        </View>

        {/* Conversations */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>{t('conversations.section')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => router.push('/archived')}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="archive" size={16} color={theme.ink2} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('conversations.archived')}</Text>
            <Icon name="chevron" size={14} color={theme.faint} />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => router.push('/saved')}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="bookmark" size={16} color={theme.ink2} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('conversations.saved')}</Text>
            <Icon name="chevron" size={14} color={theme.faint} />
          </TouchableOpacity>
        </View>

        {/* Your data — backup, restore, reset */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>{t('data.section')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <TouchableOpacity
            style={[styles.cardRow, busy !== null && styles.rowDisabled]}
            onPress={handleExport}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={t('data.export')}
            accessibilityHint={t('data.exportSub')}
            accessibilityState={{ disabled: busy !== null, busy: busy === 'export' }}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="share" size={16} color={theme.ink2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('data.export')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>{t('data.exportSub')}</Text>
            </View>
            {busyOrChevron('export')}
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <TouchableOpacity
            style={[styles.cardRow, busy !== null && styles.rowDisabled]}
            onPress={handleRestore}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={t('data.restore')}
            accessibilityHint={t('data.restoreSub')}
            accessibilityState={{ disabled: busy !== null, busy: busy === 'restore' }}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="download" size={16} color={theme.ink2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('data.restore')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>{t('data.restoreSub')}</Text>
            </View>
            {busyOrChevron('restore')}
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <TouchableOpacity
            style={[styles.cardRow, busy !== null && styles.rowDisabled]}
            onPress={handleReset}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={t('data.reset')}
            accessibilityHint={t('data.resetSub')}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="trash" size={16} color={danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: danger }]}>{t('data.reset')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>{t('data.resetSub')}</Text>
            </View>
            <Icon name="chevron" size={14} color={theme.faint} />
          </TouchableOpacity>
        </View>

        {/* Dev tools — only visible in development builds */}
        {__DEV__ && (
          <>
            <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>{t('dev.section')}</EyebrowLabel>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <TouchableOpacity style={styles.cardRow} onPress={handleClearAICache}>
                <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
                  <Icon name="refresh" size={16} color={theme.ink2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('dev.clearCache')}</Text>
                  <Text style={[styles.rowSub, { color: theme.muted }]}>{t('dev.clearCacheSub')}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 20,
    paddingVertical:   16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back:  { padding: 4 },
  title: {
    fontFamily: FONTS.serifRegular,
    fontSize:   36,
  },
  titleItalic: {
    fontFamily: FONTS.serifItalic,
  },
  scroll: { flex: 1 },
  content: {
    padding: 26,
  },
  sectionLabel: {
    marginBottom: 10,
  },
  card: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      18,
    overflow:     'hidden',
  },
  cardLabel: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     14,
    marginBottom: 14,
  },
  swatchRow: {
    flexDirection: 'row',
    gap:           10,
    marginBottom:  22,
  },
  swatch: {
    flex:         1,
    aspectRatio:  1,
    borderRadius: 12,
    alignItems:   'center',
    justifyContent: 'center',
  },
  swatchCheck: {
    color:     '#ffffff',
    fontSize:  14,
    fontWeight: '700',
  },
  divider: {
    height:         StyleSheet.hairlineWidth,
    marginVertical: 16,
    alignSelf:      'stretch',
  },
  cardRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 4,
  },
  rowIcon: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex:          1,
    fontFamily:    FONTS.sansRegular,
    fontSize:      14.5,
    letterSpacing: -0.1,
  },
  langOptions: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginTop:     14,
  },
  langPill: {
    minHeight:         40,
    paddingHorizontal: 16,
    borderRadius:      RADIUS.pill,
    borderWidth:       StyleSheet.hairlineWidth,
    justifyContent:    'center',
  },
  langPillText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14.5,
  },
  rowSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    marginTop:  1,
  },
  rowDisabled: {
    opacity: 0.5,
  },
});
