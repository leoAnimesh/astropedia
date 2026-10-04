import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useSettingsStore } from '@/stores/settings-store';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Toggle } from '@/components/atoms/Toggle';
import { Icon } from '@/components/atoms/Icon';
import { FONTS, RADIUS, ACCENT_THEMES, type AccentKey } from '@/constants/themes';
import { LANGUAGES, getAppLanguage, setAppLanguage, type AppLanguage } from '@/utils/i18n';
import { clearAllData } from '@/utils/database';
import { Storage } from '@/utils/storage';
import { Cache } from '@/utils/cache';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { todayIso } from '@/utils/format';
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
  const { t } = useTranslation('settings');
  const currentLang = getAppLanguage();
  const { profiles } = useProfiles();
  const setDark = useSettingsStore((s) => s.setDarkModeOverride);
  const darkOverride = useSettingsStore((s) => s.darkModeOverride);
  const [dailyHoroscope,  setDailyHoroscope]  = useState<boolean>(Storage.getDailyHoroscopePush());
  const [transitAlerts,   setTransitAlerts]   = useState<boolean>(Storage.getTransitAlerts());

  const handleSelectLanguage = async (code: AppLanguage) => {
    if (code === currentLang) return;
    await setAppLanguage(code);
    // Scheduled notifications carry fixed text — rebuild them in the new language.
    if (Storage.getDailyHoroscopePush()) scheduleDailyHoroscope().catch(() => {});
    if (Storage.getTransitAlerts())      scheduleTransitAlerts(null).catch(() => {});
  };

  const handleToggleDailyHoroscope = async (next: boolean) => {
    if (next) {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        Alert.alert(t('notifications.offTitle'), t('notifications.offDaily'));
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
        Alert.alert(t('notifications.offTitle'), t('notifications.offTransit'));
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
    Alert.alert(t('dev.clearedTitle'), t('dev.clearedMessage'));
  };

  const setOnboardingDone = useOnboardingStore((s) => s.setDone);

  const handleReset = () => {
    Alert.alert(
      t('reset.title'),
      t('reset.message'),
      [
        { text: t('reset.cancel'), style: 'cancel' },
        {
          text: t('reset.confirm'),
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Storage.clear();
            // Flipping the store causes the root layout's <Stack.Protected>
            // guards to swap to the onboarding stack — no router.replace needed.
            setOnboardingDone(false);
          },
        },
      ],
    );
  };

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

          <Toggle
            value={isDark}
            onValueChange={(v) => setDark(v ? 'dark' : 'light')}
            label={t('appearance.darkMode')}
            sublabel={t('appearance.darkModeSub')}
          />
        </View>

        {/* Language */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>{t('language.section')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.cardRow}>
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="chat" size={16} color={theme.ink2} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('language.label')}</Text>
            <Text style={[styles.rowValue, { color: theme.ink2 }]}>
              {LANGUAGES.find((l) => l.code === currentLang)?.native}
            </Text>
          </View>
          <View style={styles.langOptions} accessibilityRole="radiogroup">
            {LANGUAGES.map((l) => {
              const on = l.code === currentLang;
              return (
                <TouchableOpacity
                  key={l.code}
                  onPress={() => handleSelectLanguage(l.code)}
                  style={[
                    styles.langPill,
                    on
                      ? { backgroundColor: theme.ink, borderColor: theme.ink }
                      : { backgroundColor: theme.surface, borderColor: theme.hairline2 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={on ? t('language.selectedA11y', { language: l.native }) : l.native}
                >
                  <Text style={[styles.langPillText, { color: on ? theme.bg : theme.ink }]}>{l.native}</Text>
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

        <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
          <Text style={styles.resetText}>{t('reset.button')}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
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
  rowValue: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
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
  resetBtn: {
    marginTop:     24,
    paddingVertical: 10,
  },
  resetText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    color:      '#C44',
  },
});
