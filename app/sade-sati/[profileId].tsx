'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { getSadeSati, type SadeSatiPhase } from '@/utils/sade-sati';
import { askLanguage, formatMonthYear, intlLocale, localizeDigits, tAsk, tSign } from '@/utils/i18n';
import { openGuruChat } from '@/utils/guru-nav';
import { ZODIAC } from '@/constants/astrology';
import { FONTS, RADIUS } from '@/constants/themes';

const PHASES: SadeSatiPhase[] = ['rising', 'peak', 'setting'];
const AREA_ICONS: Record<SadeSatiPhase, IconName[]> = {
  rising:  ['moon', 'send', 'clock'],
  peak:    ['sparkle', 'person', 'people'],
  setting: ['bookmark', 'chat', 'sparkle'],
};
const YEAR_MS = 365.25 * 86400000;

export default function SadeSatiScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('sadesati');
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { profiles } = useProfiles();
  const [now] = useState(() => Date.now());
  const profile = profiles.find((p) => p.id === profileId);

  const status = useMemo(
    () => (profile?.birthDate ? getSadeSati(profile, new Date()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.birthDate, profile?.birthTime, profile?.birthLng, profile?.birthTz],
  );

  if (!profile) {
    router.back();
    return null;
  }

  const first = profile.name.split(' ')[0];
  const fullDate = (d: Date) => localizeDigits(d.toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric', year: 'numeric' }));
  const range = (a: Date, b: Date) => `${formatMonthYear(a)} – ${formatMonthYear(b)}`;
  const yearsRange = (a: Date, b: Date) =>
    localizeDigits(a.getFullYear() === b.getFullYear() ? `${a.getFullYear()}` : `${a.getFullYear()}–${String(b.getFullYear()).slice(-2)}`);

  if (!status) {
    return (
      <ScreenLayout edges={['top', 'left', 'right']}>
        <FeatureHeader title={t('title')} backLabel={t('back')} />
        <View style={styles.content}>
          <Text style={[styles.body, { color: theme.ink }]}>{t('notReady')}</Text>
        </View>
      </ScreenLayout>
    );
  }

  const period = status.periods[status.currentIndex];
  const next = status.nextIndex >= 0 ? status.periods[status.nextIndex] : null;
  const state: SadeSatiPhase | 'return' | 'none' = status.inReturn ? 'return' : status.phase ?? 'none';
  const shownPhase: SadeSatiPhase = status.phase ?? 'setting';
  const birthMs = new Date(profile.birthDate + 'T00:00:00').getTime();
  const ageAt = (d: Date) => Math.max(0, Math.floor((d.getTime() - birthMs) / YEAR_MS));

  // Marker position across three equal phase segments.
  let marker = 0;
  let phaseIdx = -1;
  if (period && status.phase && !status.inReturn) {
    phaseIdx = PHASES.indexOf(status.phase);
    const span = period.phases[status.phase];
    const within = Math.min(1, Math.max(0, (now - span.start.getTime()) / (span.end.getTime() - span.start.getTime())));
    marker = (phaseIdx + within) / 3;
  }

  const askSaga = () => {
    const lng = askLanguage();
    const q = period && status.phase
      ? tAsk(`sadesati:question.${profile.isYou ? 'you' : 'other'}`, {
          name: first,
          phase: tAsk(`sadesati:phaseWord.${status.phase}`),
          date: formatMonthYear(period.end, lng),
        })
      : tAsk(`sadesati:question.${profile.isYou ? 'youNone' : 'otherNone'}`, { name: first });
    openGuruChat('saga', profile.id, q);
  };

  // "After this": next 4th / 8th check-ins before the next sade sati, then the next sade sati.
  const afterRows: { key: string; title: string; sub: string; when: string }[] = [];
  for (const c of status.checkIns) {
    if (next && c.start > next.start) continue;
    afterRows.push({ key: c.kind, title: t(`after.${c.kind}.t`), sub: t(`after.${c.kind}.s`), when: yearsRange(c.start, c.end) });
  }
  afterRows.push(next
    ? { key: 'next', title: t('after.next.t'), sub: t('after.next.s'), when: localizeDigits(`~${next.start.getFullYear()}`) }
    : { key: 'none', title: t('after.none.t'), sub: t('after.none.s'), when: '' });

  const touches = t(`touches.${shownPhase}`, { returnObjects: true }) as { t: string; s: string }[];
  const helps = t('helps', { returnObjects: true }) as string[];

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader
        title={t('title')}
        subtitle={t('subtitle', { name: first, sign: tSign(ZODIAC[status.moonSign].name) })}
        backLabel={t('back')}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status */}
        <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.heroTop}>
            <EyebrowLabel size={11}>{t(`phaseEyebrow.${state}`)}</EyebrowLabel>
            <Text style={[styles.h1, { color: theme.ink }]} accessibilityRole="header">
              {t(`heading.${state}.before`)}
              <Text style={[styles.em, { color: theme.accent }]}>{t(`heading.${state}.em`)}</Text>
              {t(`heading.${state}.after`)}
            </Text>
            <Text style={[styles.lead, { color: theme.ink2 }]}>
              {state === 'none'
                ? next ? t('lead.noneNext', { date: formatMonthYear(next.start) }) : t('lead.noneDone')
                : t(`lead.${state}`)}
            </Text>
          </View>

          {period && (
            <View style={styles.barWrap}>
              <View
                style={styles.bar}
                accessibilityRole="progressbar"
                accessibilityLabel={t('progressA11y', { pct: Math.round(status.progress * 100) })}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(status.progress * 100) }}
              >
                {PHASES.map((p, i) => {
                  const done = status.inReturn || i < phaseIdx;
                  const cur = i === phaseIdx;
                  const fill = cur ? Math.max(0, Math.min(1, marker * 3 - i)) : 0;
                  return (
                    <View key={p} style={[styles.seg, { backgroundColor: done ? theme.accent : theme.surface3, opacity: done ? 0.45 : 1 }]}>
                      {cur && <View style={[styles.segFill, { width: `${fill * 100}%`, backgroundColor: theme.accent }]} />}
                    </View>
                  );
                })}
                {phaseIdx >= 0 && (
                  <View
                    pointerEvents="none"
                    style={[styles.marker, { left: `${marker * 100}%`, backgroundColor: theme.surface, borderColor: theme.accent }]}
                  />
                )}
              </View>
              <View style={styles.barLabels}>
                {PHASES.map((p, i) => (
                  <View key={p} style={styles.barLabel}>
                    <Text style={[styles.barLabelTitle, { color: theme.ink }, i === phaseIdx && styles.semibold]}>
                      {i === phaseIdx ? t('bar.now', { phase: t(`bar.${p}`) }) : t(`bar.${p}`)}
                    </Text>
                    <Text style={[styles.barLabelSub, { color: theme.muted }]}>{range(period.phases[p].start, period.phases[p].end)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.stats, { backgroundColor: theme.surface2, borderTopColor: theme.hairline }]}>
            {period ? (
              <>
                <View style={[styles.stat, { borderRightColor: theme.hairline, borderRightWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.statLabel, { color: theme.muted }]}>{t('ends')}</Text>
                  <Text style={[styles.statValue, { color: theme.ink }]}>{fullDate(period.end)}</Text>
                </View>
                <View style={styles.stat}>
                  {period.returns.length ? (
                    <>
                      <Text style={[styles.statLabel, { color: theme.muted }]}>{t('briefReturn')}</Text>
                      <Text style={[styles.statValue, { color: theme.ink }]}>{range(period.returns[0].start, period.returns[0].end)}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.statLabel, { color: theme.muted }]}>{t('began')}</Text>
                      <Text style={[styles.statValue, { color: theme.ink }]}>{fullDate(period.start)}</Text>
                    </>
                  )}
                </View>
              </>
            ) : next ? (
              <>
                <View style={[styles.stat, { borderRightColor: theme.hairline, borderRightWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.statLabel, { color: theme.muted }]}>{t('starts')}</Text>
                  <Text style={[styles.statValue, { color: theme.ink }]}>{fullDate(next.start)}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: theme.muted }]}>{t('ends')}</Text>
                  <Text style={[styles.statValue, { color: theme.ink }]}>{fullDate(next.end)}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* In plain words */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('plainEyebrow')}</EyebrowLabel>
          <Text style={[styles.plain, { color: theme.ink }]}>{t('plain')}</Text>
        </View>

        {/* What it touches */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{period ? t('touchesEyebrow') : t('touchesAllEyebrow')}</EyebrowLabel>
          <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {(period ? touches : PHASES.map((p) => (t(`touches.${p}`, { returnObjects: true }) as { t: string; s: string }[])[0])).map((a, i) => (
              <View key={a.t + i} style={[styles.areaRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
                <View style={[styles.areaIcon, { backgroundColor: theme.surface2 }]}>
                  <Icon name={AREA_ICONS[period ? shownPhase : PHASES[i]][period ? i : 0]} size={16} color={theme.accent} />
                </View>
                <View style={styles.areaText}>
                  <Text style={[styles.areaTitle, { color: theme.ink }]}>{a.t}</Text>
                  <Text style={[styles.areaSub, { color: theme.ink2 }]}>{a.s}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* What helps */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('helpsEyebrow')}</EyebrowLabel>
          <View style={[styles.helps, { backgroundColor: theme.surface2 }]}>
            {helps.map((h) => (
              <View key={h} style={styles.helpRow}>
                <View style={[styles.bullet, { backgroundColor: theme.accent }]} />
                <Text style={[styles.helpText, { color: theme.ink }]}>{h}</Text>
              </View>
            ))}
            <Text style={[styles.helpNote, { color: theme.muted }]}>{t('helpsNote')}</Text>
          </View>
        </View>

        {/* After this */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('afterEyebrow')}</EyebrowLabel>
          <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {afterRows.map((r, i) => (
              <View key={r.key} style={[styles.afterRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
                <View style={styles.areaText}>
                  <Text style={[styles.afterTitle, { color: theme.ink }]}>{r.title}</Text>
                  <Text style={[styles.afterSub, { color: theme.muted }]}>{r.sub}</Text>
                </View>
                <Text style={[styles.afterWhen, { color: theme.ink }]}>{r.when}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Whole life */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('lifeEyebrow')}</EyebrowLabel>
          <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {status.periods.map((p, i) => {
              const tag = i === status.currentIndex ? 'now' : p.finalEnd.getTime() < now ? 'past' : i === status.nextIndex ? 'next' : 'later';
              return (
                <View
                  key={p.start.toISOString()}
                  style={[
                    styles.lifeRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
                  ]}
                >
                  <View style={styles.areaText}>
                    <Text style={[styles.afterTitle, { color: theme.ink }, tag === 'now' && styles.semibold]}>{range(p.start, p.end)}</Text>
                    <Text style={[styles.afterSub, { color: theme.muted }]}>
                      {p.beforeBirth ? t('life.agesFromBirth', { to: ageAt(p.end) }) : t('life.ages', { from: ageAt(p.start), to: ageAt(p.end) })}
                      {p.returns.length ? ' · ' + t('life.returnNote', { range: range(p.returns[0].start, p.returns[p.returns.length - 1].end) }) : ''}
                    </Text>
                  </View>
                  <Text style={[styles.tag, { color: tag === 'now' ? theme.accent : theme.muted }]}>{t(`life.${tag}`)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.links}>
          <Pressable onPress={askSaga} accessibilityRole="button" style={({ pressed }) => [styles.linkPill, { borderColor: theme.hairline2, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.linkText, { color: theme.ink2 }]}>{t('askSaga')}</Text>
            <Icon name="chevron" size={14} color={theme.ink2} />
          </Pressable>
          <Pressable
            onPress={() => router.push(`/dasha/${profile.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.linkPill, { borderColor: theme.hairline2, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.linkText, { color: theme.ink2 }]}>{t('seeChapters')}</Text>
            <Icon name="chevron" size={14} color={theme.ink2} />
          </Pressable>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 40, gap: 22 },
  body:    { fontFamily: FONTS.sansRegular, fontSize: 15, lineHeight: 22 },
  section: { gap: 10 },
  semibold: { fontFamily: FONTS.sansSemiBold },

  hero:    { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  heroTop: { gap: 8, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 6 },
  h1:      { fontFamily: FONTS.serifRegular, fontSize: 28, lineHeight: 32 },
  em:      { fontFamily: FONTS.serifItalic },
  lead:    { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 20 },

  barWrap: { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16, gap: 10 },
  bar:     { flexDirection: 'row', gap: 4, position: 'relative' },
  seg:     { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  segFill: { height: 8 },
  marker:  { position: 'absolute', top: -5, width: 18, height: 18, marginLeft: -9, borderRadius: 9, borderWidth: 3 },
  barLabels: { flexDirection: 'row', gap: 4 },
  barLabel:  { flex: 1, gap: 1 },
  barLabelTitle: { fontFamily: FONTS.sansMedium, fontSize: 12.5, lineHeight: 17 },
  barLabelSub:   { fontFamily: FONTS.sansRegular, fontSize: 11, lineHeight: 15 },

  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  stat:  { flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 18 },
  statLabel: { fontFamily: FONTS.sansRegular, fontSize: 11, lineHeight: 15 },
  statValue: { fontFamily: FONTS.sansMedium, fontSize: 14, lineHeight: 19 },

  plain: { fontFamily: FONTS.serifRegular, fontSize: 20, lineHeight: 26 },

  listCard: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingVertical: 4 },
  areaRow:  { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 14 },
  areaIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  areaText: { flex: 1, gap: 2 },
  areaTitle: { fontFamily: FONTS.sansMedium, fontSize: 14.5, lineHeight: 19 },
  areaSub:   { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 18 },

  helps:    { gap: 8, paddingVertical: 16, paddingHorizontal: 18, borderRadius: RADIUS.card },
  helpRow:  { flexDirection: 'row', gap: 10 },
  bullet:   { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  helpText: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 20 },
  helpNote: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17, marginTop: 4 },

  afterRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  afterTitle: { fontFamily: FONTS.sansRegular, fontSize: 14.5, lineHeight: 19 },
  afterSub:   { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },
  afterWhen:  { fontFamily: FONTS.monoRegular, fontSize: 12, lineHeight: 16 },
  lifeRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  tag:        { fontFamily: FONTS.monoRegular, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' },

  links:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40,
    paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1,
  },
  linkText: { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 18 },
});
