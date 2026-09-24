import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useLocalLLM, useModelUpgrade } from '@/hooks/use-local-llm';
import { useSettingsStore } from '@/stores/settings-store';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Toggle } from '@/components/atoms/Toggle';
import { Icon } from '@/components/atoms/Icon';
import { FONTS, RADIUS, ACCENT_THEMES, ACCENT_LABEL, type AccentKey } from '@/constants/themes';
import { clearAllData } from '@/utils/database';
import { Storage } from '@/utils/storage';
import { Cache } from '@/utils/cache';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { todayIso } from '@/utils/format';
import { switchModel, getModelCatalog, getActiveModelInfo, isModelOnDisk } from '@/utils/local-llm';
import { detectDeviceTier, type DeviceTier } from '@/utils/device-tier';
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
  const { profiles } = useProfiles();
  const setDark = useSettingsStore((s) => s.setDarkModeOverride);
  const darkOverride = useSettingsStore((s) => s.darkModeOverride);
  const [modelPref,       setModelPref]       = useState<string>(Storage.getPreferredModelTier());
  const [dailyHoroscope,  setDailyHoroscope]  = useState<boolean>(Storage.getDailyHoroscopePush());
  const [transitAlerts,   setTransitAlerts]   = useState<boolean>(Storage.getTransitAlerts());

  // Subscribed so the "Running …" line follows swaps and upgrade progress.
  useLocalLLM();
  const upgrade        = useModelUpgrade();
  const catalog        = getModelCatalog();
  const currentInfo    = getActiveModelInfo();
  const detectedTier   = detectDeviceTier();
  const TIER_OPTIONS: Array<{ key: 'auto' | DeviceTier; label: string; sub: string }> = [
    { key: 'auto',     label: 'Auto-select',          sub: `Picks the best model for your phone (now: ${catalog[detectedTier].label}, ${catalog[detectedTier].size})` },
    { key: 'flagship', label: catalog.flagship.label, sub: `${catalog.flagship.size} · best quality` },
    { key: 'mid',      label: catalog.mid.label,      sub: `${catalog.mid.size} · solid quality` },
    { key: 'budget',   label: catalog.budget.label,   sub: `${catalog.budget.size} · primary for 4–6 GB phones` },
    { key: 'floor',    label: catalog.floor.label,    sub: `${catalog.floor.size} · minimum, weakest answers` },
  ];

  const handlePickModel = (preference: 'auto' | DeviceTier) => {
    if (preference === modelPref) return;
    const targetTier = preference === 'auto' ? detectedTier : preference;
    const target     = catalog[targetTier];
    const currentSize = currentInfo.def.size;
    const willDownload = !isModelOnDisk(target.version);
    const confirm = () => {
      setModelPref(preference);
      switchModel(preference);
    };
    if (willDownload) {
      Alert.alert(
        'Switch offline model?',
        `This will download ${target.label} (${target.size}) in the background. Saga keeps using ${currentInfo.def.label} (${currentSize}) until it's ready.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', onPress: confirm },
        ],
      );
    } else {
      confirm();
    }
  };

  const handleToggleDailyHoroscope = async (next: boolean) => {
    if (next) {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        Alert.alert(
          'Notifications off',
          'Enable notifications for Astropedia in your phone settings to receive daily readings.',
        );
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
        Alert.alert(
          'Notifications off',
          'Enable notifications for Astropedia in your phone settings to receive transit alerts.',
        );
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
    Alert.alert('Cache cleared', 'Horoscope, chart readings, and chat cache will regenerate on next open.');
  };

  const setOnboardingDone = useOnboardingStore((s) => s.setDone);

  const handleReset = () => {
    Alert.alert(
      'Reset all data',
      'This will delete all profiles, chats, and settings. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
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
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.ink }]}>
          <Text style={styles.titleItalic}>Settings</Text>
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Appearance */}
        <EyebrowLabel style={styles.sectionLabel}>Appearance</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Text style={[styles.cardLabel, { color: theme.ink2 }]}>Accent color</Text>
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
                  accessibilityLabel={ACCENT_LABEL[key]}
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
            label="Dark mode"
            sublabel="Easier on the eyes after dusk."
          />
        </View>

        {/* Offline AI — dev-only. Auto-tier selection runs for everyone;
            this UI is for picking a specific model variant during testing. */}
        {__DEV__ && (
          <>
            <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>Offline AI</EyebrowLabel>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              {TIER_OPTIONS.map((opt, idx) => {
                const isSelected = modelPref === opt.key;
                return (
                  <View key={opt.key}>
                    <TouchableOpacity
                      style={styles.modelRow}
                      onPress={() => handlePickModel(opt.key)}
                      activeOpacity={0.85}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modelLabel, { color: theme.ink }]}>{opt.label}</Text>
                        <Text style={[styles.modelSub, { color: theme.muted }]}>{opt.sub}</Text>
                      </View>
                      {isSelected && <Icon name="check" size={16} color={theme.accent} />}
                    </TouchableOpacity>
                    {idx < TIER_OPTIONS.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={[styles.modelSub, styles.modelStatus, { color: theme.muted }]}>
              {`Running ${currentInfo.def.label}`}
              {upgrade.status === 'downloading' && ` · downloading ${upgrade.label} ${Math.floor(upgrade.progress * 100)}%`}
              {upgrade.status === 'paused' && (upgrade.reason === 'low-storage'
                ? ` · ${upgrade.label} paused: low storage`
                : ` · ${upgrade.label} download will retry`)}
            </Text>
          </>
        )}

        {/* Notifications */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>Notifications</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Toggle
            value={dailyHoroscope}
            onValueChange={handleToggleDailyHoroscope}
            label="Daily reading"
            sublabel="A gentle 8 AM nudge so you don't forget today's reading."
          />
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <Toggle
            value={transitAlerts}
            onValueChange={handleToggleTransitAlerts}
            label="Transit alerts"
            sublabel="A day-before heads-up when Sun, Mars, Jupiter, or Saturn shifts sign."
          />
        </View>

        {/* Conversations */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>Conversations</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => router.push('/archived')}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="archive" size={16} color={theme.ink2} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>Archived chats</Text>
            <Icon name="chevron" size={14} color={theme.faint} />
          </TouchableOpacity>
        </View>

        {/* Dev tools — only visible in development builds */}
        {__DEV__ && (
          <>
            <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>Dev</EyebrowLabel>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <TouchableOpacity style={styles.cardRow} onPress={handleClearAICache}>
                <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
                  <Icon name="refresh" size={16} color={theme.ink2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: theme.ink }]}>Clear AI cache</Text>
                  <Text style={[styles.rowSub, { color: theme.muted }]}>Force regenerate horoscope &amp; chart readings</Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
          <Text style={styles.resetText}>Reset all data</Text>
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
  rowSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    marginTop:  1,
  },
  modelRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 12,
    gap:             12,
  },
  modelLabel: {
    fontFamily: FONTS.serifRegular,
    fontSize:   15,
  },
  modelStatus: {
    marginTop:        8,
    marginHorizontal: 4,
  },
  modelSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    lineHeight: 17,
    marginTop:  2,
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
