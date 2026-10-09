'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { todayIso } from '@/utils/format';
import { localizePlace } from '@/utils/place-names';
import { askLanguage, formatDayDate, intlLocale, tAsk, tTithi } from '@/utils/i18n';
import { ACTIVITIES, findMuhurats, getTodayTimings, shortDay, type Activity } from '@/utils/muhurat';
import { FONTS, RADIUS } from '@/constants/themes';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { openGuruChat } from '@/utils/guru-nav';

/** "3 Oct" in the app language. */
function shortDate(dateIso: string): string {
  return new Date(dateIso + 'T12:00:00').toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' });
}

export default function MuhuratScreen() {
  const styles = useIndicStyles(baseStyles);
  const { t, i18n } = useTranslation('muhurat');
  const { theme } = useAccent();
  const { profiles, activeProfile } = useProfiles();
  const profile = activeProfile ?? profiles[0] ?? null;
  const [activity, setActivity] = useState<Activity>('work');

  const lat   = profile?.birthLat ?? null;
  const lng   = profile?.birthLng ?? null;
  const today = todayIso();

  const timings = useMemo(() => getTodayTimings(today, lat, lng), [today, lat, lng]);
  // Day labels and reasons are translated inside findMuhurats.
  const days    = useMemo(
    () => findMuhurats(activity, lat, lng, 7),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, lat, lng, i18n.language],
  );

  const act   = ACTIVITIES.find((a) => a.id === activity)!;
  const range = `${shortDate(days[0].date)} – ${shortDate(days[days.length - 1].date)}`;
  const city  = profile?.birthCity ? localizePlace(profile.birthCity, i18n.language).split(',')[0] : undefined;

  // Sent in the app language when the model speaks it (tAsk), else English.
  const askSaga = () => {
    if (!profile) return;
    const en   = askLanguage() === 'en';
    const good = days
      .filter((d) => d.window && !d.passed)
      .map((d) => en
        ? `${shortDay(d.date)} ${d.timeLabel}`
        : `${formatDayDate(new Date(d.date + 'T12:00:00'))} ${d.displayTime}`);
    const verb = tAsk(`muhurat:question.verb.${activity}`);
    const q = good.length
      ? tAsk('muhurat:question.windows', { verb, windows: good.join('; ') })
      : tAsk('muhurat:question.none', { verb });
    openGuruChat('saga', profile.id, q);
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.back, { borderColor: theme.hairline2 }]}
          accessibilityLabel={t('back')}
        >
          <Icon name="back" size={20} color={theme.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title + activity */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{city ? t('eyebrowCity', { city }) : t('eyebrow')}</EyebrowLabel>
          <Text style={[styles.title, { color: theme.ink }]}>
            {t('title.before')}
            <Text style={[styles.italic, { color: theme.accent }]}>{t('title.em')}</Text>
            {t('title.after')}
          </Text>
          <Text style={[styles.lead, { color: theme.ink2 }]}>{t('planning')}</Text>
          <View style={styles.pills}>
            {ACTIVITIES.map((a) => {
              const on = a.id === activity;
              return (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => setActivity(a.id)}
                  style={[
                    styles.pill,
                    on
                      ? { backgroundColor: theme.ink, borderColor: theme.ink }
                      : { backgroundColor: theme.surface, borderColor: theme.hairline2 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.pillText, { color: on ? theme.bg : theme.ink }]}>
                    {t(`activity.${a.id}.label`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Today */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <EyebrowLabel size={10.5}>
            {t('todayCard', { day: formatDayDate(new Date(today + 'T12:00:00')), tithi: tTithi(timings.tithi) })}
          </EyebrowLabel>
          <View style={styles.sunRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.small, { color: theme.muted }]}>{t('sunrise')}</Text>
              <Text style={[styles.sunValue, { color: theme.ink }]}>{timings.sunrise}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.small, { color: theme.muted }]}>{t('sunset')}</Text>
              <Text style={[styles.sunValue, { color: theme.ink }]}>{timings.sunset}</Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <View style={styles.timeRow}>
            <Text style={[styles.timeLabel, { color: theme.ink2 }]}>{t('abhijit')}</Text>
            <Text style={[styles.timeValue, { color: theme.ink }]}>{timings.abhijit}</Text>
          </View>
          <View style={styles.timeRow}>
            <Text style={[styles.timeLabel, { color: theme.ink2 }]}>{t('avoidRahu')}</Text>
            <Text style={[styles.timeValue, { color: theme.ink }]}>{timings.rahuKaal}</Text>
          </View>
        </View>

        {/* Windows */}
        <View style={{ gap: 12 }}>
          <View style={styles.listHead}>
            <View style={styles.listHeadMain}>
              <EyebrowLabel size={11}>{t(`activity.${act.id}.windows`)}</EyebrowLabel>
            </View>
            <EyebrowLabel size={11}>{range}</EyebrowLabel>
          </View>

          {days.map((d) =>
            d.window ? (
              <View
                key={d.date}
                style={[
                  styles.windowCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor:     d.isToday && !d.passed ? theme.accent : theme.hairline,
                    borderWidth:     d.isToday && !d.passed ? 1.5 : StyleSheet.hairlineWidth,
                    opacity:         d.passed ? 0.6 : 1,
                  },
                ]}
              >
                <View style={styles.windowTop}>
                  <Text style={[styles.day, { color: d.isToday ? theme.accent : theme.ink2 }]}>{d.dayLabel}</Text>
                  {d.favoured && !d.passed && <Icon name="sparkle" size={15} color={theme.accent} />}
                </View>
                <Text style={[styles.windowTime, { color: theme.ink }]}>{d.displayTime}</Text>
                <Text style={[styles.reasons, { color: theme.muted }]}>
                  {d.passed ? t('passed') : d.reasons.join(' · ')}
                </Text>
              </View>
            ) : (
              <View key={d.date} style={[styles.noneRow, { borderColor: theme.hairline }]}>
                <Text style={[styles.noneDay, { color: theme.muted }]}>{d.dayLabel}</Text>
                <Text style={[styles.noneText, { color: theme.muted }]}>{t('noWindow', { reason: d.reasons[0] })}</Text>
              </View>
            ),
          )}

          <Text style={[styles.note, { color: theme.muted }]}>
            {t('note')} {city ? t('timesFor', { city }) : t('timesApprox')}
          </Text>

          {profile && (
            <TouchableOpacity onPress={askSaga} style={styles.askLink} hitSlop={6}>
              <Text style={[styles.askText, { color: theme.accent }]}>{t('ask')}</Text>
            </TouchableOpacity>
          )}
        </View>
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
    gap:               36,
  },
  section: { gap: 14 },
  title: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      44,
    lineHeight:    46,
    letterSpacing: -0.5,
  },
  italic: { fontFamily: FONTS.serifItalic },
  lead: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 24,
  },
  pills: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  pill: {
    minHeight:         44,
    paddingHorizontal: 18,
    borderRadius:      RADIUS.pill,
    borderWidth:       1,
    alignItems:        'center',
    justifyContent:    'center',
  },
  pillText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
  },
  card: {
    borderRadius: RADIUS.card + 4,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      22,
    gap:          12,
  },
  sunRow: { flexDirection: 'row', gap: 16, marginTop: 2 },
  small: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
  },
  sunValue: {
    fontFamily: FONTS.serifRegular,
    fontSize:   26,
    lineHeight: 32,
  },
  divider: { height: StyleSheet.hairlineWidth },
  timeRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    gap:            12,
  },
  timeLabel: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14.5,
  },
  timeValue: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
  },
  listHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    gap:            12,
    marginBottom:   2,
  },
  listHeadMain: { flexShrink: 1 },
  windowCard: {
    borderRadius: RADIUS.card,
    padding:      18,
    gap:          4,
  },
  windowTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  day: {
    fontFamily: FONTS.sansMedium,
    fontSize:   13,
  },
  windowTime: {
    fontFamily: FONTS.serifRegular,
    fontSize:   24,
    lineHeight: 30,
  },
  reasons: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 19,
  },
  noneRow: {
    borderRadius:      RADIUS.card,
    borderWidth:       StyleSheet.hairlineWidth,
    borderStyle:       'dashed',
    paddingHorizontal: 18,
    paddingVertical:   14,
    gap:               2,
  },
  noneDay: {
    fontFamily: FONTS.sansMedium,
    fontSize:   13,
  },
  noneText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 19,
  },
  note: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 18,
    marginTop:  6,
  },
  askLink: {
    minHeight:      44,
    justifyContent: 'center',
  },
  askText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
  },
});
