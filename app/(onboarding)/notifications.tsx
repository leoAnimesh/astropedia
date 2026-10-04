'use no memo'; // language-dependent renders must not be cached across language switches

import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Button } from '@/components/atoms/Button';
import { Toggle } from '@/components/atoms/Toggle';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { showDialog } from '@/components/overlays';
import { FONTS, RADIUS } from '@/constants/themes';
import { Storage } from '@/utils/storage';
import {
  ensureNotificationPermission,
  scheduleDailyHoroscope,
  scheduleTransitAlerts,
} from '@/utils/notifications';
import { resetOnboardingDraft } from './_store';
import { useOnboardingStore } from '@/stores/onboarding-store';

export default function NotificationsScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('onboarding');
  const indic = i18n.language !== 'en';
  const setOnboardingDone = useOnboardingStore((s) => s.setDone);

  const [daily,   setDaily]   = useState(true);
  const [transit, setTransit] = useState(true);
  const [busy,    setBusy]    = useState(false);

  // The profile is already saved; hardware back must not return to birth-place.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Flipping the store makes the <Stack.Protected> guards in the root layout
  // swap into the app stack — no imperative navigation needed.
  const finish = () => {
    resetOnboardingDraft();
    setOnboardingDone(true);
  };

  const handleEnable = async () => {
    if (busy || (!daily && !transit)) return;
    setBusy(true);
    try {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        showDialog({ title: t('notifications.deniedTitle'), message: t('notifications.deniedBody') });
        return finish();
      }
      // Same storage flags + schedulers the Settings toggles use.
      try {
        if (daily) {
          Storage.setDailyHoroscopePush(true);
          await scheduleDailyHoroscope();
        }
        if (transit) {
          Storage.setTransitAlerts(true);
          await scheduleTransitAlerts(null);
        }
      } catch { /* app/_layout re-schedules on next launch/foreground */ }
      finish();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View />
        <Text style={[styles.step, { color: theme.muted }, indic && { letterSpacing: 0 }]}>{t('notifications.step')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
          {t('notifications.titleA')}{'\n'}
          <Text style={styles.italic}>{t('notifications.titleB')}</Text>
        </Text>

        <Text style={[styles.hint, { color: theme.ink2 }]}>{t('notifications.hint')}</Text>

        {/* Notification mock-up */}
        <EyebrowLabel style={styles.fieldLabel}>{t('notifications.preview')}</EyebrowLabel>
        <View style={[styles.notif, { backgroundColor: theme.surface2 }]}>
          <View style={[styles.notifIcon, { backgroundColor: theme.accent }]}>
            <Text style={[styles.notifGlyph, { color: theme.bg }]}>✦</Text>
          </View>
          <View style={styles.notifBody}>
            <View style={styles.notifTop}>
              <Text style={[styles.notifApp, { color: theme.muted }]}>Astropedia</Text>
              <Text style={[styles.notifApp, { color: theme.muted }]}>{t('notifications.previewNow')}</Text>
            </View>
            <Text style={[styles.notifTitle, { color: theme.ink }]}>{t('notifications.previewTitle')}</Text>
            <Text style={[styles.notifText, { color: theme.ink2 }]}>{t('notifications.previewBody')}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Toggle
            value={daily}
            onValueChange={setDaily}
            label={t('notifications.daily')}
            sublabel={t('notifications.dailySub')}
          />
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <Toggle
            value={transit}
            onValueChange={setTransit}
            label={t('notifications.transit')}
            sublabel={t('notifications.transitSub')}
          />
        </View>

        <Text style={[styles.privacy, { color: theme.muted }]}>{t('notifications.privacy')}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={t('notifications.cta')}
          variant="accent"
          fullWidth
          disabled={!daily && !transit}
          loading={busy}
          onPress={handleEnable}
        />
        <TouchableOpacity onPress={finish} disabled={busy} style={styles.skipBtn} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.skipText, { color: theme.muted }]}>{t('notifications.skip')}</Text>
        </TouchableOpacity>
      </View>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingTop:        20,
    paddingBottom:     8,
  },
  step: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  scroll:  { flex: 1 },
  content: { padding: 32, paddingTop: 20 },
  display: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     40,
    lineHeight:   44,
    marginBottom: 16,
  },
  displayIndic: { lineHeight: 56 },
  italic: { fontFamily: FONTS.serifItalic },
  hint: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     14.5,
    lineHeight:   22,
    marginBottom: 28,
  },
  fieldLabel: { marginBottom: 12 },
  notif: {
    flexDirection: 'row',
    gap:           12,
    padding:       14,
    borderRadius:  RADIUS.card,
    marginBottom:  20,
  },
  notifIcon: {
    width:          38,
    height:         38,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  notifGlyph: { fontSize: 18 },
  notifBody:  { flex: 1, gap: 2 },
  notifTop:   { flexDirection: 'row', justifyContent: 'space-between' },
  notifApp: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  notifTitle: { fontFamily: FONTS.sansMedium ?? FONTS.sansRegular, fontSize: 14 },
  notifText:  { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 19 },
  card: {
    borderRadius:      RADIUS.card,
    borderWidth:       StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  divider: { height: StyleSheet.hairlineWidth },
  privacy: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 19,
    marginTop:  20,
  },
  footer:   { padding: 32, paddingTop: 12 },
  skipBtn:  { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  skipText: { fontFamily: FONTS.sansRegular, fontSize: 13.5, textDecorationLine: 'underline' },
});
