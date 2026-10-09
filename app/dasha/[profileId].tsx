'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { getLifeChapters, type DashaPeriod } from '@/utils/astrology';
import { subPeriodsOf } from '@/utils/forecast';
import { phaseMeaning } from '@/utils/transits';
import { askLanguage, formatMonthYear, localizeDigits, tAsk, tPlanet } from '@/utils/i18n';
import { openGuruChat } from '@/utils/guru-nav';
import { FONTS, RADIUS } from '@/constants/themes';

const YEAR_MS = 365.25 * 86400000;
/** Vimshottari runs 120 years; show every chapter that starts before then. */
const UNTIL_AGE = 120;

export default function DashaTimelineScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('dasha');
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { profiles } = useProfiles();
  const profile = profiles.find((p) => p.id === profileId);

  const life = useMemo(
    () => (profile?.birthDate ? getLifeChapters(profile, new Date(), UNTIL_AGE) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.birthDate, profile?.birthTime, profile?.birthLng, profile?.birthTz],
  );
  const [open, setOpen] = useState<number | null>(null);
  const [now] = useState(() => Date.now());

  if (!profile) {
    router.back();
    return null;
  }
  const first = profile.name.split(' ')[0];

  if (!life) {
    return (
      <ScreenLayout edges={['top', 'left', 'right']}>
        <FeatureHeader title={t('title')} backLabel={t('back')} />
        <View style={styles.content}>
          <Text style={[styles.body, { color: theme.ink }]}>{t('notReady')}</Text>
        </View>
      </ScreenLayout>
    );
  }

  const birthMs = new Date(profile.birthDate + 'T00:00:00').getTime();
  const ageAt = (d: Date) => Math.max(0, Math.round((d.getTime() - birthMs) / YEAR_MS));
  const chapter = life.chapters[life.currentIndex];
  const sub = life.subs[life.currentSub];
  const pct = (p: DashaPeriod) =>
    Math.round(Math.min(1, Math.max(0, (now - p.start.getTime()) / (p.end.getTime() - p.start.getTime()))) * 100);
  const years = (p: DashaPeriod) => localizeDigits(`${p.start.getFullYear()} – ${p.end.getFullYear()}`);
  const range = (p: DashaPeriod) => `${formatMonthYear(p.start)} – ${formatMonthYear(p.end)}`;
  const openIdx = open ?? life.currentIndex;

  const askSaga = () => {
    const lng = askLanguage();
    const q = tAsk(`dasha:question.${profile.isYou ? 'you' : 'other'}`, {
      name: first,
      chapter: tPlanet(chapter.lord, lng),
      stretch: tPlanet(sub.lord, lng),
      date: formatMonthYear(sub.end, lng),
    });
    openGuruChat('saga', profile.id, q);
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader title={t('title')} subtitle={t('subtitle', { name: first })} backLabel={t('back')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Now */}
        <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.heroTop}>
            <EyebrowLabel size={11}>{t('nowEyebrow', { age: Math.floor(life.ageNow) })}</EyebrowLabel>
            <Text style={[styles.h1, { color: theme.ink }]} accessibilityRole="header">
              <Text style={[styles.em, { color: theme.accent }]}>{tPlanet(chapter.lord)}</Text>
              {` ${t('heading.chapter')}${t('heading.joiner')}${tPlanet(sub.lord)} ${t('heading.stretch')}`}
            </Text>
            <Text style={[styles.lead, { color: theme.ink2 }]}>
              {phaseMeaning(chapter.lord, 'chapter')} {phaseMeaning(sub.lord, 'sub')}
            </Text>
          </View>
          <View style={[styles.progress, { backgroundColor: theme.surface2, borderTopColor: theme.hairline }]}>
            {[chapter, sub].map((p, i) => (
              <View
                key={i}
                style={[styles.progressItem, i > 0 && { marginTop: 4 }]}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={t('rowA11y', { planet: tPlanet(p.lord), range: range(p), pct: pct(p) })}
                accessibilityValue={{ min: 0, max: 100, now: pct(p) }}
              >
                <View style={styles.progressLabels}>
                  <Text style={[styles.progressText, { color: theme.ink2 }]} numberOfLines={1}>{`${tPlanet(p.lord)} · ${range(p)}`}</Text>
                  <Text style={[styles.progressText, { color: theme.ink2 }]}>{localizeDigits(`${pct(p)}%`)}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: theme.hairline }]}>
                  <View style={[styles.fill, { width: `${pct(p)}%`, backgroundColor: theme.accent }]} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Whole timeline */}
        <View>
          <EyebrowLabel size={11} style={styles.timelineEyebrow}>{t('timelineEyebrow')}</EyebrowLabel>
          {life.chapters.map((c, i) => {
            const state = i < life.currentIndex ? 'past' : i === life.currentIndex ? 'now' : 'future';
            const isOpen = openIdx === i;
            const ages = c.start.getTime() <= birthMs
              ? t('agesBirth', { to: ageAt(c.end) })
              : t('ages', { from: ageAt(c.start), to: ageAt(c.end) });
            const subs = isOpen ? subPeriodsOf(c) : [];
            const nowSub = subs.findIndex((s) => now >= s.start.getTime() && now < s.end.getTime());
            const dot = state === 'now' ? 14 : 10;
            return (
              <View key={`${c.lord}-${c.start.getTime()}`} style={styles.chapterRow}>
                <View style={styles.rail}>
                  <View
                    style={{
                      marginTop: 16, width: dot, height: dot, borderRadius: dot / 2, borderWidth: 2,
                      backgroundColor: state === 'past' ? theme.faint : state === 'now' ? theme.accent : theme.bg,
                      borderColor: state === 'past' ? theme.faint : state === 'now' ? theme.accent : theme.faint,
                    }}
                  />
                  <View style={[styles.line, { backgroundColor: i === life.chapters.length - 1 ? 'transparent' : theme.hairline2 }]} />
                </View>
                <View style={styles.chapterBody}>
                  <Pressable
                    onPress={() => setOpen(isOpen ? -1 : i)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={t(isOpen ? 'collapseA11y' : 'expandA11y', { planet: tPlanet(c.lord) })}
                    style={({ pressed }) => [
                      styles.chapterCard,
                      {
                        backgroundColor: state === 'now' ? theme.surface : 'transparent',
                        borderColor: state === 'now' ? theme.hairline2 : theme.hairline,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <View style={styles.chapterHead}>
                      <Text style={[styles.lord, { color: theme.ink }]}>{tPlanet(c.lord)}</Text>
                      <Text style={[styles.years, { color: theme.muted }]}>{years(c)}</Text>
                      <Icon name={isOpen ? 'chevron-down' : 'chevron'} size={16} color={theme.muted} />
                    </View>
                    <Text style={[styles.ages, { color: state === 'now' ? theme.accent : theme.muted }]}>
                      {ages}{state === 'now' ? ` · ${t('nowTag')}` : ''}
                    </Text>
                    <Text style={[styles.theme, { color: theme.ink2 }]}>{phaseMeaning(c.lord, 'chapter')}</Text>
                  </Pressable>
                  {isOpen && (
                    <Animated.View entering={FadeIn.duration(180)} style={[styles.subs, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                      {subs.map((s, j) => {
                        const tag = j === nowSub ? 'now' : nowSub >= 0 && j === nowSub + 1 ? 'next' : '';
                        return (
                          <View
                            key={`${s.lord}-${j}`}
                            style={[
                              styles.subRow,
                              j > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
                              tag === 'now' && { backgroundColor: theme.surface2 },
                            ]}
                          >
                            <View style={styles.subLine}>
                              <Text style={[styles.subLord, { color: theme.ink }, tag === 'now' && styles.semibold]}>{tPlanet(s.lord)}</Text>
                              <Text style={[styles.subRange, { color: theme.ink2 }]}>{range(s)}</Text>
                              {tag ? <Text style={[styles.subTag, { color: tag === 'now' ? theme.accent : theme.muted }]}>{t(`tag.${tag}`)}</Text> : null}
                            </View>
                            {tag ? <Text style={[styles.subMeaning, { color: theme.ink2 }]}>{phaseMeaning(s.lord, 'sub')}</Text> : null}
                          </View>
                        );
                      })}
                    </Animated.View>
                  )}
                  {isOpen && c.start.getTime() < birthMs && (
                    <Text style={[styles.note, { color: theme.muted }]}>{t('birthNote')}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <Text style={[styles.note, { color: theme.muted }]}>{t('approxNote')}</Text>

        <Pressable
          onPress={askSaga}
          accessibilityRole="button"
          style={({ pressed }) => [styles.askPill, { borderColor: theme.hairline2, backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.askText, { color: theme.ink }]}>{t('askSaga')}</Text>
          <Icon name="chevron" size={14} color={theme.ink} />
        </Pressable>
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 40, gap: 22 },
  body:    { fontFamily: FONTS.sansRegular, fontSize: 15, lineHeight: 22 },
  semibold: { fontFamily: FONTS.sansSemiBold },

  hero:    { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  heroTop: { gap: 8, padding: 18 },
  h1:      { fontFamily: FONTS.serifRegular, fontSize: 28, lineHeight: 32 },
  em:      { fontFamily: FONTS.serifItalic },
  lead:    { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 20 },
  progress: { gap: 8, paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  progressItem: { gap: 8 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  progressText: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17, flexShrink: 1 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill:  { height: 4 },

  timelineEyebrow: { marginBottom: 12 },
  chapterRow:  { flexDirection: 'row', gap: 14 },
  rail:        { width: 18, alignItems: 'center' },
  line:        { flex: 1, width: 2 },
  chapterBody: { flex: 1, minWidth: 0, paddingBottom: 10 },
  chapterCard: { gap: 3, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 12, borderRadius: RADIUS.card, borderWidth: 1 },
  chapterHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  lord:  { flex: 1, fontFamily: FONTS.serifItalic, fontSize: 21, lineHeight: 25 },
  years: { fontFamily: FONTS.monoRegular, fontSize: 11, lineHeight: 15 },
  ages:  { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },
  theme: { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 19 },

  subs:    { marginTop: 8, marginBottom: 6, borderRadius: RADIUS.medium, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  subRow:  { minHeight: 40, paddingHorizontal: 12, paddingVertical: 9, gap: 3, justifyContent: 'center' },
  subLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subLord: { width: 72, fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 17 },
  subRange: { flex: 1, fontFamily: FONTS.monoRegular, fontSize: 11, lineHeight: 15 },
  subTag:  { fontFamily: FONTS.monoRegular, fontSize: 9.5, lineHeight: 12, letterSpacing: 0.8 },
  subMeaning: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },

  note: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
  askPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 40, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1,
  },
  askText: { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 18 },
});
