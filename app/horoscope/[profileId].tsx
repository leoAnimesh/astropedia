'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useHoroscope } from '@/hooks/use-horoscope';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { ShareableHoroscopeCard } from '@/components/molecules/ShareableHoroscopeCard';
import { todayIso } from '@/utils/format';
import { askLanguage, intlLocale, localizeDigits, tAsk, tSign, useAppLanguage } from '@/utils/i18n';
import { getBigThree } from '@/utils/astrology';
import { getLuckyForDay } from '@/utils/lucky';
import {
  generateMonthHoroscope,
  generateWeekHoroscope,
  getTodayExtras,
  type PeriodHoroscope,
} from '@/utils/horoscope-period';
import { openGuruChat } from '@/utils/guru-nav';
import type { AgentId } from '@/constants/gurus';
import { captureAndShare } from '@/utils/share';
import { FONTS, RADIUS } from '@/constants/themes';

type Period = 'today' | 'week' | 'month';
type SectionKey = 'energy' | 'love' | 'career' | 'wellness' | 'guidance';

/** Sections with an "Ask …" link, and the guru each one opens. */
const ASK_AGENT: Partial<Record<SectionKey, AgentId>> = { love: 'love', career: 'career', wellness: 'health' };

function ageOf(birthDate: string, now: Date): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  return now.getFullYear() - y - ((now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) ? 1 : 0);
}

export default function HoroscopeDetailScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('horoscope');
  const lang = useAppLanguage();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { profiles } = useProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  const { sections: daily, loading } = useHoroscope(profile ?? null);
  const [period, setPeriod] = useState<Period>('today');
  const shareCardRef = useRef<View>(null);

  const now = new Date();
  const dayKey = todayIso();
  const isWeek = period === 'week';
  const isMonth = period === 'month';
  const pKey = profile ? `${profile.id}|${profile.birthDate}|${profile.birthTime}|${profile.birthLat}|${profile.birthLng}|${profile.birthTz}` : '';

  const big = useMemo(
    () => (profile?.birthDate ? getBigThree(profile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pKey],
  );
  const today = useMemo(
    () => (profile ? getTodayExtras(profile, new Date()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pKey, dayKey, lang],
  );
  const lucky = useMemo(
    () => (profile ? getLuckyForDay(profile, new Date()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pKey, dayKey, lang],
  );
  const week = useMemo<PeriodHoroscope | null>(
    () => (profile && isWeek ? generateWeekHoroscope(profile, new Date()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pKey, dayKey, lang, isWeek],
  );
  const month = useMemo<PeriodHoroscope | null>(
    () => (profile && isMonth ? generateMonthHoroscope(profile, new Date()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pKey, dayKey, lang, isMonth],
  );

  if (!profile) {
    router.back();
    return null;
  }

  const firstName = profile.name.split(' ')[0];
  const isMinor = !!profile.birthDate && ageOf(profile.birthDate, now) < 18;
  const subtitle = [
    firstName,
    big?.rising ? t('risingPart', { sign: tSign(big.rising.name) }) : null,
    big?.moon ? t('moonPart', { sign: tSign(big.moon.name) }) : null,
  ].filter(Boolean).join(' · ');

  // What the selected tab shows.
  let label = '';
  let quote = '';
  let sections: { key: SectionKey; text: string }[] = [];
  let mantra: { text: string; note: string } | null = null;
  if (period === 'today') {
    label = localizeDigits(now.toLocaleDateString(intlLocale(), { weekday: 'long', month: 'short', day: 'numeric' }));
    if (daily) {
      quote = daily.energy;
      sections = [
        ...(today ? [{ key: 'energy' as const, text: today.energy }] : []),
        { key: 'love', text: daily.love },
        { key: 'career', text: daily.career },
        { key: 'wellness', text: daily.wellness },
        { key: 'guidance', text: daily.guidance },
      ];
    }
    mantra = today?.mantra ?? null;
  } else {
    const h = period === 'week' ? week : month;
    if (h) {
      label = h.label;
      quote = h.quote;
      sections = (['love', 'career', 'wellness', 'guidance'] as const).map((key) => ({ key, text: h.sections[key] }));
      mantra = h.mantra;
    }
  }

  const ask = (key: SectionKey) => {
    const agent = ASK_AGENT[key];
    if (!agent) return;
    const who = profile.isYou ? 'you' : 'other';
    const q = tAsk(`horoscope:question.${period}.${who}.${key}`, { name: firstName, lng: askLanguage() });
    openGuruChat(agent, profile.id, q);
  };

  const handleShare = () => captureAndShare(shareCardRef.current, `astropedia-daily-${todayIso()}.png`);
  const notReady = !profile.birthDate || (period === 'today' ? !daily && !loading : period === 'week' ? !week : !month);

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader
        title={t('screenTitle')}
        subtitle={subtitle}
        backLabel={t('backA11y')}
        right={period === 'today' && daily?.energy ? { icon: 'share', onPress: handleShare, label: t('shareA11y') } : undefined}
      />

      {/* Offscreen shareable card, kept in the tree so view-shot can capture it. */}
      {daily && (
        <View pointerEvents="none" style={styles.offscreen}>
          <ShareableHoroscopeCard
            ref={shareCardRef}
            name={profile.name}
            dateIso={todayIso()}
            message={daily.energy}
            mantra={daily.mantra || undefined}
          />
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SegmentedControl<Period>
          accessibilityLabel={t('tabs.a11y')}
          value={period}
          onChange={setPeriod}
          options={[
            { key: 'today', label: t('tabs.today') },
            { key: 'week', label: t('tabs.week') },
            { key: 'month', label: t('tabs.month') },
          ]}
        />

        {notReady ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <Text style={[styles.body, { color: theme.ink }]}>{t('notReady')}</Text>
          </View>
        ) : (
          <>
            {quote ? (
              <View style={styles.hero}>
                <EyebrowLabel size={11}>{label}</EyebrowLabel>
                <Text style={[styles.quote, { color: theme.ink }]}>“{quote}”</Text>
              </View>
            ) : null}

            {period === 'today' && lucky && (
              <Pressable
                onPress={() => router.push('/panchang')}
                accessibilityRole="button"
                accessibilityLabel={t('luckyA11y', {
                  color: t(`common:lucky.color.${lucky.color}`),
                  number: localizeDigits(String(lucky.number)),
                  time: lucky.time ?? '',
                })}
                style={({ pressed }) => [styles.lucky, { backgroundColor: theme.surface, borderColor: theme.hairline, opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={[styles.luckyCell, { borderRightColor: theme.hairline, borderRightWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.luckyLabel, { color: theme.muted }]}>{t('panchang:lucky.color')}</Text>
                  <View style={styles.luckyValueRow}>
                    <View style={[styles.swatch, { backgroundColor: lucky.colorHex, borderColor: theme.hairline2 }]} />
                    <Text style={[styles.luckyValue, { color: theme.ink }]} numberOfLines={1}>{t(`common:lucky.color.${lucky.color}`)}</Text>
                  </View>
                </View>
                <View style={[styles.luckyCell, { borderRightColor: theme.hairline, borderRightWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.luckyLabel, { color: theme.muted }]}>{t('panchang:lucky.number')}</Text>
                  <Text style={[styles.luckyValue, { color: theme.ink }]}>{localizeDigits(String(lucky.number))}</Text>
                </View>
                <View style={styles.luckyCell}>
                  <Text style={[styles.luckyLabel, { color: theme.muted }]}>{t('luckyTime')}</Text>
                  <Text style={[styles.luckyValue, { color: theme.ink }]} numberOfLines={1}>{lucky.time ?? '—'}</Text>
                </View>
              </Pressable>
            )}

            {period === 'week' && week?.days && (
              <View style={[styles.card, styles.weekCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                <View style={styles.weekRow}>
                  {week.days.map((d) => (
                    <View
                      key={d.date.toISOString()}
                      accessible
                      accessibilityLabel={`${d.weekday} ${d.day}${d.tone === 'good' ? ', ' + t('goodDays') : d.tone === 'gentle' ? ', ' + t('goGently') : ''}`}
                      style={[
                        styles.weekDay,
                        d.isToday && { backgroundColor: theme.surface2, borderColor: theme.hairline2 },
                      ]}
                    >
                      <Text style={[styles.weekDayName, { color: theme.muted }]} numberOfLines={1}>{d.weekday}</Text>
                      <Text style={[styles.weekDayNum, { color: theme.ink }]}>{d.day}</Text>
                      <View
                        style={[
                          styles.dot,
                          d.tone === 'good' && { backgroundColor: theme.accent },
                          d.tone === 'gentle' && { borderWidth: 1.5, borderColor: theme.ink2 },
                        ]}
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: theme.accent }]} />
                    <Text style={[styles.legendText, { color: theme.ink2 }]}>{t('goodDays')}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.dot, { borderWidth: 1.5, borderColor: theme.ink2 }]} />
                    <Text style={[styles.legendText, { color: theme.ink2 }]}>{t('goGently')}</Text>
                  </View>
                </View>
              </View>
            )}

            {period === 'month' && month?.keyDates && month.keyDates.length > 0 && (
              <View style={[styles.keyCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                {month.keyDates.map((k, i) => (
                  <View
                    key={`${k.date.toISOString()}-${i}`}
                    style={[styles.keyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}
                  >
                    <View style={styles.keyDate}>
                      <EyebrowLabel size={10.5}>{k.month}</EyebrowLabel>
                      <Text style={[styles.keyDay, { color: theme.ink }]}>{k.day}</Text>
                    </View>
                    <View style={styles.keyText}>
                      <Text style={[styles.keyTitle, { color: theme.ink }]}>{k.title}</Text>
                      {k.sub ? <Text style={[styles.keySub, { color: theme.ink2 }]}>{k.sub}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.sections}>
              {sections.map(({ key, text }) => {
                const agent = ASK_AGENT[key];
                const showAsk = !!agent && !(agent === 'love' && isMinor);
                return (
                  <View key={key} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                    <EyebrowLabel size={10.5}>{t(`sectionTitle.${key}`)}</EyebrowLabel>
                    <Text style={[styles.body, { color: theme.ink }]}>{text}</Text>
                    {showAsk && (
                      <Pressable
                        onPress={() => ask(key)}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.askPill, { borderColor: theme.hairline2, opacity: pressed ? 0.7 : 1 }]}
                      >
                        <Text style={[styles.askText, { color: theme.ink2 }]}>{t(`ask.${key}`)}</Text>
                        <Icon name="chevron" size={14} color={theme.ink2} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>

            {mantra && (
              <View style={[styles.mantra, { backgroundColor: theme.surface2 }]}>
                <EyebrowLabel size={10.5}>{t('mantraTitle')}</EyebrowLabel>
                <Text style={[styles.mantraText, { color: theme.ink }]}>{mantra.text}</Text>
                <Text style={[styles.mantraNote, { color: theme.ink2 }]}>{mantra.note}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  offscreen: { position: 'absolute', top: -10000, left: -10000, opacity: 0 },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 48, gap: 18 },

  hero:  { gap: 8 },
  quote: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      27,
    lineHeight:    32,
    letterSpacing: -0.2,
  },

  card: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    paddingVertical:   16,
    paddingHorizontal: 18,
    gap: 6,
  },
  body: {
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
    lineHeight: 22,
  },
  sections: { gap: 10 },
  askPill: {
    alignSelf:      'flex-start',
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    minHeight:      36,
    marginTop:      2,
    paddingHorizontal: 12,
    borderRadius:   RADIUS.pill,
    borderWidth:    1,
  },
  askText: { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 17 },

  lucky: {
    flexDirection: 'row',
    borderRadius:  RADIUS.card,
    borderWidth:   StyleSheet.hairlineWidth,
    overflow:      'hidden',
  },
  luckyCell: { flex: 1, gap: 4, paddingVertical: 12, paddingHorizontal: 14 },
  luckyLabel: { fontFamily: FONTS.sansRegular, fontSize: 11, lineHeight: 14 },
  luckyValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  luckyValue: { fontFamily: FONTS.sansMedium, fontSize: 14, lineHeight: 18, flexShrink: 1 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },

  weekCard: { padding: 14, gap: 10 },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekDay: {
    flex:           1,
    alignItems:     'center',
    gap:            4,
    paddingVertical: 8,
    borderRadius:   12,
    borderWidth:    1,
    borderColor:    'transparent',
  },
  weekDayName: { fontFamily: FONTS.monoRegular, fontSize: 10, lineHeight: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  weekDayNum:  { fontFamily: FONTS.sansMedium, fontSize: 15, lineHeight: 19 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },

  keyCard: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  keyRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 16 },
  keyDate: { width: 44, alignItems: 'center' },
  keyDay: { fontFamily: FONTS.serifRegular, fontSize: 24, lineHeight: 26 },
  keyText: { flex: 1, gap: 2, paddingTop: 2 },
  keyTitle: { fontFamily: FONTS.sansMedium, fontSize: 14, lineHeight: 19 },
  keySub: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },

  mantra: { gap: 6, paddingVertical: 16, paddingHorizontal: 18, borderRadius: RADIUS.card },
  mantraText: { fontFamily: FONTS.serifItalic, fontSize: 22, lineHeight: 27 },
  mantraNote: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },
});
