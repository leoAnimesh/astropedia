'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS, RADIUS } from '@/constants/themes';
import { Storage } from '@/utils/storage';
import { localDateIso } from '@/utils/format';
import { formatDayDate, tPlanet } from '@/utils/i18n';
import { alertQuestion, explainTransit, findAlert } from '@/utils/transits';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { openGuruChat } from '@/utils/guru-nav';

const fmtDay = formatDayDate;

/** Split a translated title around the planet name so it can be set in italics. */
function splitTitle(title: string, planet: string): [string, string, string] {
  const i = title.indexOf(planet);
  if (i < 0) return ['', '', title];
  return [title.slice(0, i), planet, title.slice(i + planet.length)];
}

export default function AlertDetailScreen() {
  const styles = useIndicStyles(baseStyles);
  const { t }             = useTranslation('alerts');
  const { theme }         = useAccent();
  const { alertId, profileId } = useLocalSearchParams<{ alertId: string; profileId?: string }>();
  const { profiles, activeProfile: active } = useProfiles();
  // The alert belongs to the profile it was created for (notification taps and
  // list links pass profileId); fall back to the active one.
  const activeProfile = (profileId ? profiles.find((p) => p.id === String(profileId)) : null) ?? active;

  const today = localDateIso(new Date());
  const alert = useMemo(
    () => (alertId ? findAlert(String(alertId), activeProfile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alertId, today, activeProfile?.birthDate, activeProfile?.birthTime, activeProfile?.birthLng, activeProfile?.birthTz],
  );

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={[styles.back, { borderColor: theme.hairline2 }]}
        accessibilityLabel={t('back')}
      >
        <Icon name="back" size={20} color={theme.ink} />
      </TouchableOpacity>
    </View>
  );

  if (!alert) {
    return (
      <ScreenLayout edges={['top', 'left', 'right']}>
        {header}
        <View style={[styles.content, styles.section]}>
          <EyebrowLabel size={11}>{t('eyebrow')}</EyebrowLabel>
          <Text style={[styles.title, { color: theme.ink }]}>
            {t('passed.titleBefore')}
            <Text style={[styles.titleItalic, { color: theme.accent }]}>{t('passed.titleEm')}</Text>
          </Text>
          <Text style={[styles.lead, { color: theme.ink2 }]}>{t('passed.lead')}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.secondary, { borderColor: theme.hairline2 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: theme.ink }]}>{t('passed.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </ScreenLayout>
    );
  }

  const info    = explainTransit(alert, activeProfile);
  const first   = activeProfile?.name.split(' ')[0];
  const isPhase = alert.kind === 'phase';
  const [before, planetName, after] = splitTitle(info.title, tPlanet(alert.planet));
  const remindOn = !isPhase && Storage.getTransitAlerts();
  const remindAt = new Date(alert.date.getTime() - 864e5);

  // alertQuestion() is in the app language when the model speaks it.
  const askSaga = () => {
    if (!activeProfile) return;
    const q = alertQuestion(alert);
    openGuruChat('saga', activeProfile.id, q);
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      {header}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <EyebrowLabel size={11}>
            {t(isPhase ? 'detail.yourPhase' : 'detail.transit')} · {fmtDay(alert.date)}
            {alert.date.getFullYear() !== new Date().getFullYear() ? `, ${alert.date.getFullYear()}` : ''}
          </EyebrowLabel>
          <Text style={[styles.title, { color: theme.ink }]}>
            {before}
            <Text style={[styles.titleItalic, { color: theme.accent }]}>{planetName}</Text>
            {after}
            {t('detail.titleEnd')}
          </Text>
        </View>

        <View style={[styles.stats, { borderColor: theme.hairline }]}>
          <View style={styles.stat}>
            <EyebrowLabel size={10.5}>{t('detail.starts')}</EyebrowLabel>
            <Text style={[styles.statValue, { color: theme.ink }]}>{fmtDay(alert.date)}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.hairline }]} />
          <View style={styles.stat}>
            <EyebrowLabel size={10.5}>{t('detail.lasts')}</EyebrowLabel>
            <Text style={[styles.statValue, { color: theme.ink }]}>{info.lasts}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <EyebrowLabel size={11}>{first ? t('detail.forYouName', { name: first }) : t('detail.forYou')}</EyebrowLabel>
          <Text style={[styles.body, { color: theme.ink }]}>{info.lines[0]}</Text>
          <Text style={[styles.body, { color: theme.ink2 }]}>{info.lines[1]}</Text>
        </View>

        <View style={styles.actions}>
          {activeProfile && (
            <TouchableOpacity
              onPress={askSaga}
              style={[styles.primary, { backgroundColor: theme.accent }]}
              accessibilityRole="button"
            >
              <Icon name="sparkle" size={16} color={theme.accentFg} />
              <Text style={[styles.primaryText, styles.shrink, { color: theme.accentFg }]}>{t('detail.ask')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push('/muhurat')}
            style={[styles.secondary, { borderColor: theme.hairline2 }]}
            accessibilityRole="button"
          >
            <Icon name="calendar" size={16} color={theme.ink} />
            <Text style={[styles.secondaryText, styles.shrink, { color: theme.ink }]}>{t('detail.findTime')}</Text>
          </TouchableOpacity>
        </View>

        {remindOn && remindAt.getTime() > Date.now() && (
          <View style={styles.remind}>
            <Icon name="bell" size={16} color={theme.muted} />
            <Text style={[styles.remindText, { color: theme.muted }]}>
              {t('detail.remind', { date: fmtDay(remindAt) })}
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    paddingTop:        12,
    paddingBottom:     6,
  },
  back: {
    width:          44,
    height:         44,
    borderRadius:   22,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 26,
    paddingTop:        24,
    paddingBottom:     60,
    gap:               32,
  },
  section: { gap: 14 },
  title: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      44,
    lineHeight:    48,
    letterSpacing: -0.5,
  },
  titleItalic: { fontFamily: FONTS.serifItalic },
  lead: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 24,
  },
  stats: {
    flexDirection:     'row',
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical:   16,
  },
  stat: { flex: 1, gap: 6 },
  statDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 18 },
  statValue: {
    fontFamily: FONTS.sansMedium,
    fontSize:   16,
  },
  card: {
    borderRadius: RADIUS.card + 4,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      22,
    gap:          10,
  },
  body: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 24,
  },
  actions: { gap: 12 },
  primary: {
    minHeight:      52,
    borderRadius:   RADIUS.button,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingHorizontal: 20,
  },
  primaryText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15.5,
  },
  secondary: {
    minHeight:      52,
    borderRadius:   RADIUS.button,
    borderWidth:    1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingHorizontal: 20,
  },
  secondaryText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15.5,
  },
  shrink: { flexShrink: 1, textAlign: 'center' },
  remind: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  remindText: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
  },
});
