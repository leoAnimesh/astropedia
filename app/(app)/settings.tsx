'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useSettingsStore } from '@/stores/settings-store';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Toggle } from '@/components/atoms/Toggle';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { showDialog } from '@/components/overlays';
import { overlayPalette } from '@/components/overlays/palette';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { FONTS, LIGHT_TOKENS, RADIUS, ACCENT_THEMES, type AccentKey } from '@/constants/themes';
import { clearAllData, type Profile } from '@/utils/database';
import { Storage } from '@/utils/storage';
import { Cache } from '@/utils/cache';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { todayIso } from '@/utils/format';
import { intlLocale, localizeDigits, tSign } from '@/utils/i18n';
import { getBigThree } from '@/utils/astrology';
import { parseBackup, type ParsedBackup } from '@/utils/backup';
import { deleteBackupFiles, exportBackup, pickBackupText, restoreBackup } from '@/utils/backup-io';
import { getInstallMarker, getModelInfo, redownloadModel, useModelSetup } from '@/utils/model-download';
import { useModelSwitch } from '@/utils/model-switch';
import { FALLBACK_CATALOG, currentEntryId, switchActive, switchPercent } from '@/utils/model-catalog';
import {
  ensureNotificationPermission,
  scheduleDailyHoroscope,
  cancelDailyHoroscope,
  scheduleTransitAlerts,
  cancelTransitAlerts,
  scheduleFestivalReminders,
  cancelFestivalReminders,
  scheduleRahuKaalHeadsUp,
  cancelRahuKaalHeadsUp,
} from '@/utils/notifications';

const ACCENT_KEYS: AccentKey[] = ['amber', 'sage', 'lilac', 'blush', 'ink'];
const READY_DOT = ACCENT_THEMES.sage.accent;

type NotifyKey = 'daily' | 'transit' | 'festival' | 'rahu';

const NOTIFY: Record<NotifyKey, {
  get: () => boolean;
  set: (v: boolean) => void;
  schedule: () => Promise<void>;
  cancel: () => Promise<void>;
  isNew?: boolean;
}> = {
  daily:    { get: Storage.getDailyHoroscopePush, set: Storage.setDailyHoroscopePush, schedule: () => scheduleDailyHoroscope(), cancel: cancelDailyHoroscope },
  transit:  { get: Storage.getTransitAlerts, set: Storage.setTransitAlerts, schedule: () => scheduleTransitAlerts(null), cancel: cancelTransitAlerts },
  festival: { get: Storage.getFestivalReminders, set: Storage.setFestivalReminders, schedule: scheduleFestivalReminders, cancel: cancelFestivalReminders, isNew: true },
  rahu:     { get: Storage.getRahuKaalPush, set: Storage.setRahuKaalPush, schedule: scheduleRahuKaalHeadsUp, cancel: cancelRahuKaalHeadsUp, isNew: true },
};
const NOTIFY_KEYS: NotifyKey[] = ['daily', 'transit', 'festival', 'rahu'];

/** "astro-gemma-v21" → "v2.1". */
function modelVersionLabel(version: string | null): string {
  const m = /v(\d)(\d*)$/.exec(version ?? '');
  return m ? `v${m[1]}${m[2] ? '.' + m[2] : ''}` : version ?? '';
}

export default function SettingsScreen() {
  const { theme, accentKey, setAccentKey, isDark } = useAccent();
  const styles = useIndicStyles(baseStyles);
  const danger = overlayPalette(theme, isDark).destructive;
  const { t } = useTranslation('settings');
  const { profiles } = useProfiles();
  const setDark = useSettingsStore((s) => s.setDarkModeOverride);
  const darkOverride = useSettingsStore((s) => s.darkModeOverride);
  const [notify, setNotify] = useState<Record<NotifyKey, boolean>>(() => ({
    daily: NOTIFY.daily.get(), transit: NOTIFY.transit.get(), festival: NOTIFY.festival.get(), rahu: NOTIFY.rahu.get(),
  }));
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);

  const modelPhase    = useModelSetup((s) => s.phase);
  const modelReceived = useModelSetup((s) => s.received);
  const modelTotal    = useModelSetup((s) => s.total);
  const modelInfo     = getModelInfo();
  const switchPhase    = useModelSwitch((s) => s.phase);
  const switchReceived = useModelSwitch((s) => s.received);
  const switchTotal    = useModelSwitch((s) => s.total);
  const switching      = switchActive({ phase: switchPhase });
  // A general model from the catalog shows its own name; Saga keeps "Saga v2.1".
  const installedEntry = FALLBACK_CATALOG.find((e) => e.id === currentEntryId(FALLBACK_CATALOG, getInstallMarker()));
  const modelName = installedEntry && installedEntry.adapter !== 'gemma21'
    ? installedEntry.name
    : t('model.name', { version: modelVersionLabel(modelInfo.version) });

  const toggleNotify = async (key: NotifyKey, next: boolean) => {
    const n = NOTIFY[key];
    if (next) {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        showDialog({ title: t('notifications.offTitle'), message: t('notifications.offMessage') });
        return;
      }
      n.set(true);
      setNotify((s) => ({ ...s, [key]: true }));
      n.schedule().catch(() => {});
    } else {
      n.set(false);
      setNotify((s) => ({ ...s, [key]: false }));
      n.cancel().catch(() => {});
    }
  };

  const handleClearAICache = () => {
    const today = todayIso();
    profiles.forEach((p) => {
      Storage.deleteHoroscopeCache(p.id, today);
      Storage.deleteChartReading(p.id);
    });
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
            // Flipping the store swaps the root layout's <Stack.Protected> guards to onboarding.
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
    if (text === null) return;

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
      t('restore.counts', { profiles: backup.counts.profiles, chats: backup.counts.chats, journal: backup.counts.journal }),
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
      setNotify({
        daily: NOTIFY.daily.get(), transit: NOTIFY.transit.get(), festival: NOTIFY.festival.get(), rahu: NOTIFY.rahu.get(),
      });
      setBusy(null);
      await showDialog({
        title:   t('restore.doneTitle'),
        message: outcome.notificationsBlocked
          ? `${t('restore.doneMessage')}\n\n${t('restore.notificationsBlocked')}`
          : t('restore.doneMessage'),
      });
      router.navigate('/');
    } catch {
      setBusy(null);
      showDialog({ title: t('restore.errorTitle'), message: t('restore.errors.failed') });
    }
  };

  const handleRedownload = () => {
    showDialog({
      title:   t('model.redownloadTitle'),
      message: t('model.redownloadMessage', { mb: localizeDigits(String(Math.round(modelInfo.bytes / 1_000_000))) }),
      actions: [
        { label: t('model.cancel'), style: 'cancel' },
        { label: t('model.redownload'), onPress: () => { redownloadModel().catch(() => {}); } },
      ],
    });
  };

  const busyOrChevron = (which: 'export' | 'restore') =>
    busy === which
      ? <ActivityIndicator size="small" color={theme.muted} />
      : <Icon name="chevron" size={14} color={theme.faint} />;

  // ─── People ────────────────────────────────────────────────────────────────
  const people = [...profiles].sort((a, b) => Number(b.isYou) - Number(a.isYou));
  const personSub = (p: Profile): string => {
    const who = p.isYou ? t('people.you') : p.relationship?.trim() || '';
    let signs = '';
    if (p.birthDate) {
      try {
        const { moon, rising } = getBigThree(p);
        signs = rising
          ? t('people.rising', { sign: tSign(rising.name) })
          : moon ? t('people.moon', { sign: tSign(moon.name) }) : '';
        if (rising && moon) signs = `${signs} · ${t('people.moon', { sign: tSign(moon.name) })}`;
      } catch { /* incomplete birth details */ }
    }
    return [who, signs].filter(Boolean).join(' · ');
  };

  // ─── Model ─────────────────────────────────────────────────────────────────
  const modelReady = modelPhase === 'ready';
  const modelStatus =
    switching ? t('model.downloading', { pct: switchPercent({ phase: switchPhase, received: switchReceived, total: switchTotal }) }) :
    modelReady ? t('model.ready') :
    modelPhase === 'downloading' ? t('model.downloading', { pct: modelTotal ? Math.floor((modelReceived / modelTotal) * 100) : 0 }) :
    modelPhase === 'offline' ? t('model.offline') :
    modelPhase === 'no-space' ? t('model.noSpace') :
    modelPhase === 'error' ? t('model.error') :
    t('model.checking');
  const modelMb = Math.round(modelInfo.bytes / 1_000_000);
  const appVersion = Constants.expoConfig?.version ?? '';

  const navRow = (icon: IconName, label: string, onPress: () => void, sub?: string) => (
    <TouchableOpacity style={styles.cardRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={sub}>
      <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
        <Icon name={icon} size={16} color={theme.ink2} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: theme.ink }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: theme.muted }]}>{sub}</Text> : null}
      </View>
      <Icon name="chevron" size={14} color={theme.faint} />
    </TouchableOpacity>
  );

  const divider = <View style={[styles.divider, { backgroundColor: theme.hairline }]} />;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.ink }]} accessibilityRole="header">{t('title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* People */}
        <EyebrowLabel style={styles.sectionLabel}>{t('people.section')}</EyebrowLabel>
        <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {people.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.personRow, { borderBottomColor: theme.hairline }]}
              onPress={() => router.push(`/profile/edit/${p.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${personSub(p)}`}
              accessibilityHint={t('people.editHint')}
            >
              <Avatar name={p.name} size={36} />
              <View style={styles.flex}>
                <Text style={[styles.rowLabel, { color: theme.ink }]} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.rowSub, { color: theme.muted }]} numberOfLines={1}>{personSub(p)}</Text>
              </View>
              <Icon name="chevron" size={14} color={theme.faint} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.addRow}
            onPress={() => router.push('/profile/new')}
            accessibilityRole="button"
            accessibilityLabel={t('people.add')}
          >
            <View style={[styles.addIcon, { borderColor: theme.hairline2 }]}>
              <Icon name="plus" size={16} color={theme.ink2} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('people.add')}</Text>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('appearance.section')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Text style={[styles.cardLabel, { color: theme.ink2 }]}>{t('appearance.accentColor')}</Text>
          <View style={styles.swatchRow} accessibilityRole="radiogroup">
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
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={t(`accent.${key}`)}
                >
                  {isActive && <Text style={styles.swatchCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {divider}

          <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('appearance.theme')}</Text>
          <Text style={[styles.rowSub, { color: theme.muted }]}>{t('appearance.themeSub')}</Text>
          <View style={styles.pillRow} accessibilityRole="radiogroup">
            {(['light', 'dark', 'system'] as const).map((m) => {
              const on = m === darkOverride;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setDark(m)}
                  style={[
                    styles.pill,
                    on
                      ? { backgroundColor: theme.ink, borderColor: theme.ink }
                      : { backgroundColor: theme.surface, borderColor: theme.hairline2 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t(`appearance.${m}`)}
                >
                  <Text style={[styles.pillText, { color: on ? theme.bg : theme.ink }]}>{t(`appearance.${m}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Notifications */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('notifications.section')}</EyebrowLabel>
        <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {NOTIFY_KEYS.map((key, i) => (
            <View
              key={key}
              style={[styles.toggleRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}
            >
              <View style={styles.flex}>
                <View style={styles.toggleLabelRow}>
                  <Text style={[styles.toggleLabel, { color: theme.ink }]}>{t(`notifications.${key}`)}</Text>
                  {NOTIFY[key].isNew && (
                    <Text style={[styles.newBadge, { backgroundColor: theme.accentMuted, color: LIGHT_TOKENS.ink2 }]}>{t('notifications.new')}</Text>
                  )}
                </View>
                <Text style={[styles.toggleSub, { color: theme.muted }]}>{t(`notifications.${key}Sub`)}</Text>
              </View>
              <Toggle
                value={notify[key]}
                onValueChange={(v) => toggleNotify(key, v)}
                accessibilityLabel={t(`notifications.${key}`)}
              />
            </View>
          ))}
        </View>

        {/* Conversations */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('conversations.section')}</EyebrowLabel>
        <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {navRow('bookmark', t('conversations.saved'), () => router.push('/saved'))}
          {divider}
          {navRow('history', t('conversations.past'), () => router.push('/archived'))}
        </View>

        {/* On-device model */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('model.section')}</EyebrowLabel>
        <View style={[styles.card, styles.modelCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.cardRow}>
            <View style={[styles.rowIcon, { backgroundColor: 'rgba(180,130,0,0.10)' }]}>
              <Icon name="sparkle" size={16} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{modelName}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>
                {t('model.sub', { mb: localizeDigits(String(modelMb)) })}
              </Text>
            </View>
            <View style={styles.status} accessibilityLabel={modelStatus}>
              <View style={[styles.statusDot, { backgroundColor: modelReady ? READY_DOT : theme.faint }]} />
              <Text style={[styles.statusText, { color: theme.ink2 }]}>{modelStatus}</Text>
            </View>
          </View>
          {Platform.OS !== 'web' && (
            <View style={styles.pillRow}>
              <TouchableOpacity
                onPress={() => router.push('/settings/model')}
                style={[styles.pill, { borderColor: theme.hairline2 }]}
                accessibilityRole="button"
                accessibilityHint={t('model.changeSub')}
              >
                <Text style={[styles.pillText, { color: theme.ink }]}>{t('model.change')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRedownload}
                disabled={switching || (!modelReady && modelPhase !== 'error' && modelPhase !== 'offline' && modelPhase !== 'no-space')}
                style={[styles.pill, { borderColor: theme.hairline2 }, switching && styles.rowDisabled]}
                accessibilityRole="button"
                accessibilityHint={t('model.redownloadTitle')}
              >
                <Text style={[styles.pillText, { color: theme.ink }]}>{t('model.redownload')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Your data — backup, restore, reset */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('data.section')}</EyebrowLabel>
        <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <TouchableOpacity
            style={[styles.cardRow, styles.tallRow, busy !== null && styles.rowDisabled]}
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
            <View style={styles.flex}>
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('data.export')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>{t('data.exportSub')}</Text>
            </View>
            {busyOrChevron('export')}
          </TouchableOpacity>
          {divider}
          <TouchableOpacity
            style={[styles.cardRow, styles.tallRow, busy !== null && styles.rowDisabled]}
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
            <View style={styles.flex}>
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('data.restore')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>{t('data.restoreSub')}</Text>
            </View>
            {busyOrChevron('restore')}
          </TouchableOpacity>
          {divider}
          <TouchableOpacity
            style={[styles.cardRow, styles.tallRow, busy !== null && styles.rowDisabled]}
            onPress={handleReset}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={t('data.reset')}
            accessibilityHint={t('data.resetSub')}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="trash" size={16} color={danger} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.rowLabel, { color: danger }]}>{t('data.reset')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>{t('data.resetSub')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* About */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('about.section')}</EyebrowLabel>
        <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {([
            ['methods', t('about.methods'), t('about.methodsSub')],
            ['privacy', t('about.privacy'), t('about.privacySub')],
            ['version', t('about.version'), localizeDigits(appVersion)],
          ] as const).map(([key, label, sub], i) => (
            <View key={key}>
              {i > 0 && divider}
              <View style={[styles.cardRow, styles.infoRow]} accessible accessibilityLabel={`${label}, ${sub}`}>
                <View style={styles.flex}>
                  <Text style={[styles.rowLabel, { color: theme.ink }]}>{label}</Text>
                  <Text style={[styles.rowSub, { color: theme.muted }]}>{sub}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
        <Text style={[styles.disclaimer, { color: theme.muted }]}>{t('about.disclaimer')}</Text>

        {/* Dev tools — development builds only */}
        {__DEV__ && (
          <>
            <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('dev.section')}</EyebrowLabel>
            <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              {navRow('refresh', t('dev.clearCache'), handleClearAICache, t('dev.clearCacheSub'))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 22,
    paddingTop:        16,
    paddingBottom:     4,
  },
  title: {
    fontFamily: FONTS.serifItalic,
    fontSize:   36,
    lineHeight: 40,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop:        18,
  },
  sectionLabel: { marginBottom: 10 },
  sectionGap: { marginTop: 24 },
  card: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      18,
    overflow:     'hidden',
  },
  listCard: {
    borderRadius:      RADIUS.card,
    borderWidth:       StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical:   6,
    overflow:          'hidden',
  },
  modelCard: { gap: 14 },
  cardLabel: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     14,
    marginBottom: 14,
  },
  swatchRow: {
    flexDirection: 'row',
    gap:           10,
  },
  swatch: {
    flex:           1,
    aspectRatio:    1,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  swatchCheck: {
    color:      '#ffffff',
    fontSize:   14,
    fontWeight: '700',
  },
  divider: {
    height:    StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    minHeight:     52,
  },
  tallRow: { minHeight: 60 },
  infoRow: { minHeight: 56 },
  personRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    minHeight:         58,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    minHeight:     52,
  },
  addIcon: {
    width:          36,
    height:         36,
    borderRadius:   18,
    borderWidth:    1,
    borderStyle:    'dashed',
    alignItems:     'center',
    justifyContent: 'center',
  },
  rowIcon: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      14.5,
    letterSpacing: -0.1,
  },
  rowSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    marginTop:  1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginTop:     14,
  },
  pill: {
    minHeight:         40,
    paddingHorizontal: 16,
    borderRadius:      RADIUS.pill,
    borderWidth:       StyleSheet.hairlineWidth,
    justifyContent:    'center',
  },
  pillText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14.5,
  },
  toggleRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    paddingVertical: 14,
  },
  toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  toggleLabel: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
  },
  toggleSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 17,
    marginTop:  2,
  },
  newBadge: {
    fontFamily:        FONTS.monoRegular,
    fontSize:          9.5,
    letterSpacing:     0.9,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      RADIUS.pill,
    overflow:          'hidden',
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
  },
  disclaimer: {
    marginTop:        14,
    marginHorizontal: 4,
    fontFamily:       FONTS.sansRegular,
    fontSize:         12,
    lineHeight:       17,
  },
  rowDisabled: { opacity: 0.5 },
});
