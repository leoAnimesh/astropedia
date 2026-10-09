'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useHoroscope } from '@/hooks/use-horoscope';
import { ProfileSwitcherTrigger, ProfileSwitcherSheet, type ProfileSwitcherSheetRef } from '@/components/organisms/ProfileSwitcher';
import { DotsLoader } from '@/components/molecules/DotsLoader';
import { ModelSetupPill } from '@/components/molecules/ModelSetupPill';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';
import { GURUS, HOME_GURU_ROW } from '@/constants/gurus';
import { todayIso } from '@/utils/format';
import { getBigThree, getLifeChapters } from '@/utils/astrology';
import { formatMonthYear, intlLocale, localizeDigits, localizeTime, tNakshatra, tPlanet, tSign, tTithi, useAppLanguage } from '@/utils/i18n';
import { getPanchang } from '@/utils/panchang';
import { getRahuKaal } from '@/utils/choghadiya';
import { getLuckyForDay } from '@/utils/lucky';
import { getVerseOfDay, verseText } from '@/utils/gita-daily';
import { getSadeSati } from '@/utils/sade-sati';
import { explainTransit, getUpcomingAlerts } from '@/utils/transits';
import { ageOn, guruLocked } from '@/utils/guru-context';
import { openGuruChat } from '@/utils/guru-nav';
import { useIndicStyles } from '@/hooks/use-indic-styles';

const TILE_BG = 'rgba(180,130,0,0.10)';
const SKY_ROWS = 3;

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'lateNight';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/** First non-empty line of the daily reading, trimmed for the card. */
function teaserOf(text: string | null): string | null {
  if (!text) return null;
  const first = (text.split('\n').find((l) => l.trim()) ?? text).replace(/^[*_]+|[*_]+$/g, '').trim();
  return first.length > 130 ? first.slice(0, 128).trim() + '…' : first;
}

/** "9:57 am" in the app language. */
function clock(d: Date): string {
  return localizeTime(d.toLocaleTimeString(intlLocale(), { hour: 'numeric', minute: '2-digit' }));
}

export default function HomeScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('home');
  const lang = useAppLanguage();
  // Devanagari / Bengali glyphs are taller than Latin; loosen the tightest
  // display line heights so the top marks don't clip.
  const indic = i18n.language !== 'en';
  const switcherRef = useRef<ProfileSwitcherSheetRef>(null);

  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const { text: horoscopeText, loading: horoscopeLoading } = useHoroscope(activeProfile);

  const pid        = activeProfile?.id;
  const firstName  = activeProfile?.name ? activeProfile.name.split(' ')[0] : t('friend');
  const today      = todayIso();
  const now        = new Date();
  const todayLabel = now.toLocaleDateString(intlLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
  const teaser     = teaserOf(horoscopeText);
  const lat        = activeProfile?.birthLat ?? null;
  const lng        = activeProfile?.birthLng ?? null;

  // ─── Today's sky strip ─────────────────────────────────────────────────────
  const panchang = useMemo(() => getPanchang(today, lat, lng), [today, lat, lng]);
  const rahu     = useMemo(() => getRahuKaal(new Date(today + 'T12:00:00'), lat, lng), [today, lat, lng]);
  const lucky    = useMemo(
    () => (activeProfile ? getLuckyForDay(activeProfile, new Date(today + 'T12:00:00')) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, activeProfile?.id, activeProfile?.birthDate, activeProfile?.birthTime, lat, lng],
  );
  const luckyColor = lucky
    ? (lucky.color.includes(':') ? t(lucky.color) : t(`common:lucky.color.${lucky.color}`, {
        defaultValue: lucky.color.charAt(0).toUpperCase() + lucky.color.slice(1),
      }))
    : '';

  // ─── Life phase ────────────────────────────────────────────────────────────
  const life = useMemo(
    () => (activeProfile?.birthDate ? getLifeChapters(activeProfile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile?.birthDate, activeProfile?.birthTime, activeProfile?.birthLng, activeProfile?.birthTz],
  );
  const chapter = life ? life.chapters[life.currentIndex] : null;
  const sub     = life ? life.subs[life.currentSub] : null;
  const nextSub = life?.upcoming.find((u) => u.kind === 'sub')?.period ?? null;
  const pct     = life ? Math.round(life.progress * 100) : 0;

  // ─── Your sky · next few weeks ─────────────────────────────────────────────
  const sky = useMemo(
    () => (activeProfile ? getUpcomingAlerts(activeProfile).slice(0, SKY_ROWS) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, activeProfile?.id, activeProfile?.birthDate, activeProfile?.birthTime, lang],
  );

  // ─── Your life ─────────────────────────────────────────────────────────────
  const bigThree = useMemo(
    () => (activeProfile?.birthDate ? getBigThree(activeProfile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile?.id, activeProfile?.birthDate, activeProfile?.birthTime, lat, lng],
  );
  const kundliSub = bigThree?.rising && bigThree.moon
    ? t('life.kundliSub', { rising: tSign(bigThree.rising.name), moon: tSign(bigThree.moon.name) })
    : bigThree?.moon ? t('life.kundliMoon', { moon: tSign(bigThree.moon.name) }) : t('life.kundliEmpty');
  const yearEnd = new Date(now.getFullYear(), now.getMonth() + 11, 1);
  const yearSub = `${formatMonthYear(now)} – ${formatMonthYear(yearEnd)}`;

  // Sade sati is the costliest Home computation (a few ephemeris sweeps per
  // person), so it runs after first render / interactions; its row is already
  // laid out meanwhile (same height), then fills in without a layout shift.
  const sadeKey = activeProfile?.birthDate
    ? `${today}|${activeProfile.id}|${activeProfile.birthDate}|${activeProfile.birthTime}|${activeProfile.birthTz}`
    : null;
  const [sadeResult, setSadeResult] = useState<{ key: string; value: ReturnType<typeof getSadeSati> | null } | null>(null);
  useEffect(() => {
    if (!sadeKey || !activeProfile?.birthDate) return;
    const profile = activeProfile;
    const task = InteractionManager.runAfterInteractions(() => {
      let value: ReturnType<typeof getSadeSati> | null = null;
      try {
        const age = ageOn(profile.birthDate) ?? 0;
        value = getSadeSati(profile, new Date(), Math.max(1, age + 12));
      } catch { /* leave the row on its quiet "none" state */ }
      setSadeResult({ key: sadeKey, value });
    });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sadeKey]);
  const sadeReady = !!sadeKey && sadeResult?.key === sadeKey;
  const sadeSati = sadeReady ? sadeResult!.value : null;
  const sadePeriod = sadeSati && sadeSati.currentIndex >= 0 ? sadeSati.periods[sadeSati.currentIndex] : null;
  const sadeNext   = sadeSati && sadeSati.nextIndex >= 0 ? sadeSati.periods[sadeSati.nextIndex] : null;
  const sadeState  = sadeSati?.inReturn ? 'return' : sadeSati?.phase ?? 'none';
  const sadeRight  = sadePeriod
    ? t('life.sadeEases', { date: formatMonthYear(sadeSati?.inReturn ? sadePeriod.finalEnd : sadePeriod.end) })
    : sadeNext ? t('life.sadeNext', { date: formatMonthYear(sadeNext.start) }) : '';
  /** Fill of each of the three phase bars, 0..1. */
  const sadeBars = (['rising', 'peak', 'setting'] as const).map((ph) => {
    if (!sadePeriod) return 0;
    if (sadeSati?.inReturn) return 1;
    const span = sadePeriod.phases[ph];
    const t0 = span.start.getTime(), t1 = span.end.getTime(), n = now.getTime();
    if (n >= t1) return 1;
    if (n <= t0 || t1 <= t0) return 0;
    return (n - t0) / (t1 - t0);
  });

  // ─── Explore & Gita ────────────────────────────────────────────────────────
  const verse = useMemo(() => getVerseOfDay(new Date(today + 'T12:00:00')), [today]);

  const go = (href: string) => router.push(href as Href);
  const tiles: { key: string; icon: IconName; sub: string; onPress: () => void }[] = [
    { key: 'panchang',  icon: 'sun',     sub: t('tiles.panchang.sub', { time: clock(rahu.start) }), onPress: () => go('/panchang') },
    { key: 'muhurat',   icon: 'clock',   sub: t('tiles.muhurat.sub'),   onPress: () => go('/muhurat') },
    { key: 'matching',  icon: 'match',   sub: t('tiles.matching.sub'),  onPress: () => go('/report/pair?mode=partner') },
    { key: 'family',    icon: 'people',  sub: t('tiles.family.sub', { count: profiles.length }), onPress: () => go('/family') },
    { key: 'journal',   icon: 'book',    sub: t('tiles.journal.sub'),   onPress: () => pid && go(`/journal/${pid}`) },
    { key: 'festivals', icon: 'diya',    sub: t('tiles.festivals.sub'), onPress: () => go('/festivals') },
  ];

  const askGuru = (agent: (typeof HOME_GURU_ROW)[number]) =>
    openGuruChat(agent, agent === 'krishna' ? null : pid);

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      {/* Header: person switcher · alerts */}
      <View style={styles.header}>
        <ProfileSwitcherTrigger profile={activeProfile} onPress={() => switcherRef.current?.present()} />
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          onPress={() => go('/alerts')}
          style={styles.headerIcon}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.alerts')}
        >
          <Icon name="bell" size={20} color={theme.ink2} />
        </TouchableOpacity>
      </View>

      {/* Saga's model still downloading (returning users; renders nothing once ready). */}
      <ModelSetupPill style={styles.setupPill} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.greeting, indic && styles.greetingIndic, { color: theme.ink }]} accessibilityRole="header">
          {t('greeting.line', { greeting: t(`greeting.${greetingKey()}`) })}{' '}
          <Text style={styles.italic}>{t('greeting.name', { name: firstName })}</Text>
        </Text>

        {/* Empty state when no profiles exist (post-reset or corrupted DB). */}
        {profiles.length === 0 && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => go('/profile/new')}
            style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
            accessibilityRole="button"
          >
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>
              <Trans t={t} i18nKey="empty.title" components={{ em: <Text style={styles.italic} /> }} />
            </Text>
            <Text style={[styles.emptySub, { color: theme.muted }]}>{t('empty.sub')}</Text>
          </TouchableOpacity>
        )}

        {/* Today: reading teaser, sky strip, life phase */}
        {activeProfile?.birthDate && (
          <View style={[styles.todayCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => go(`/horoscope/${activeProfile.id}`)}
              style={styles.todayTop}
              accessibilityRole="button"
              accessibilityLabel={`${t('today.eyebrow', { date: todayLabel, name: firstName })}. ${teaser ?? ''} ${t('today.openA11y')}`}
            >
              <EyebrowLabel size={11}>{t('today.eyebrow', { date: todayLabel, name: firstName })}</EyebrowLabel>
              {horoscopeLoading || teaser === null ? (
                <DotsLoader />
              ) : (
                <>
                  <Text style={[styles.todayQuote, indic && styles.todayQuoteIndic, { color: theme.ink }]} numberOfLines={3}>“{teaser}”</Text>
                  <View style={styles.todayMeta}>
                    <Text style={[styles.todayPeriods, { color: theme.muted }]} numberOfLines={1}>{t('today.periods')}</Text>
                    <Icon name="chevron" size={16} color={theme.accent} />
                  </View>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => go('/panchang')}
              style={[styles.sky, { borderTopColor: theme.hairline }]}
              accessibilityRole="button"
              accessibilityLabel={t('today.skyA11y', {
                nakshatra: tNakshatra(panchang.nakshatra.name),
                tithi: tTithi(panchang.tithi.name),
                start: clock(rahu.start),
                end: clock(rahu.end),
                color: luckyColor,
                number: lucky?.number ?? '',
              })}
            >
              <View style={[styles.skyCell, styles.skyLeft, { borderRightColor: theme.hairline, borderBottomColor: theme.hairline }]}>
                <Text style={[styles.skyLabel, { color: theme.muted }]}>{t('today.moonIn')}</Text>
                <Text style={[styles.skyValue, { color: theme.ink }]} numberOfLines={1}>{tNakshatra(panchang.nakshatra.name)}</Text>
              </View>
              <View style={[styles.skyCell, styles.skyRight, { borderBottomColor: theme.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.skyLabel, { color: theme.muted }]}>{t('today.tithi')}</Text>
                <Text style={[styles.skyValue, { color: theme.ink }]} numberOfLines={1}>{tTithi(panchang.tithi.name)}</Text>
              </View>
              <View style={[styles.skyCell, styles.skyLeft, styles.skyNoBottom, { borderRightColor: theme.hairline }]}>
                <Text style={[styles.skyLabel, { color: theme.muted }]}>{t('today.rahuKaal')}</Text>
                <Text style={[styles.skyValue, { color: theme.ink }]} numberOfLines={1}>{`${clock(rahu.start)} – ${clock(rahu.end)}`}</Text>
              </View>
              <View style={[styles.skyCell, styles.skyRight]}>
                <Text style={[styles.skyLabel, { color: theme.muted }]}>{t('today.lucky')}</Text>
                {lucky && (
                  <View style={styles.luckyRow}>
                    <View style={[styles.swatch, { backgroundColor: lucky.colorHex ?? theme.surface3, borderColor: theme.hairline2 }]} />
                    <Text style={[styles.skyValue, { color: theme.ink }]} numberOfLines={1}>
                      {`${luckyColor} · ${localizeDigits(String(lucky.number))}`}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {life && chapter && sub && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => go(`/dasha/${activeProfile.id}`)}
                style={[styles.phase, { borderTopColor: theme.hairline, backgroundColor: theme.surface2 }]}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.phase', { lord: tPlanet(chapter.lord), pct })}
              >
                <View style={styles.phaseHead}>
                  <Text style={[styles.phaseTitle, indic && styles.phaseTitleIndic, { color: theme.ink }]} numberOfLines={1}>
                    <Trans
                      t={t}
                      i18nKey="phase.title"
                      values={{ lord: tPlanet(chapter.lord), date: formatMonthYear(chapter.end) }}
                      components={{
                        em:    <Text style={styles.italic} />,
                        until: <Text style={[styles.phaseUntil, { color: theme.ink2 }]} />,
                      }}
                    />
                  </Text>
                  <Text style={[styles.phaseMeta, { color: theme.ink2 }]}>{t('phase.through', { pct })}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: theme.hairline }]}>
                  <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.accent }]} />
                </View>
                <Text style={[styles.phaseSub, { color: theme.ink2 }]}>
                  <Trans
                    t={t}
                    i18nKey="phase.subEnds"
                    values={{ lord: tPlanet(sub.lord), date: formatMonthYear(sub.end) }}
                    components={{ b: <Text style={{ fontFamily: FONTS.sansSemiBold, color: theme.ink }} /> }}
                  />
                  {nextSub ? t('phase.nextAfter', { lord: tPlanet(nextSub.lord) }) : ''}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Ask a guru */}
        {activeProfile && (
          <View style={styles.block}>
            <View style={styles.sectionHead}>
              <EyebrowLabel size={11}>{t('gurus.eyebrow')}</EyebrowLabel>
              <TouchableOpacity onPress={() => router.navigate('/chat')} hitSlop={12} accessibilityRole="button">
                <Text style={[styles.link, indic && styles.noTracking, { color: theme.ink2 }]}>{t('gurus.all')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bleed}
              contentContainerStyle={styles.guruRow}
            >
              {HOME_GURU_ROW.map((agent) => {
                const locked = agent !== 'krishna' && guruLocked(agent, activeProfile.birthDate);
                const name = t(`chat:gurus.${agent}.short`);
                const subLabel = locked ? t('chat:tab.forAdults') : t(`chat:gurus.${agent}.sub`);
                return (
                  <TouchableOpacity
                    key={agent}
                    activeOpacity={0.85}
                    onPress={() => askGuru(agent)}
                    style={[styles.guruCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(`chat:gurus.${agent}.name`)}, ${subLabel}`}
                  >
                    <View style={[styles.tileIcon, { backgroundColor: TILE_BG }, locked && styles.dim]}>
                      <Icon name={GURUS[agent].icon} size={19} color={theme.accent} />
                    </View>
                    <Text style={[styles.guruName, { color: theme.ink }]} numberOfLines={1}>{name}</Text>
                    <Text style={[styles.tileSub, { color: theme.ink2 }]} numberOfLines={1}>{subLabel}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => askGuru('saga')}
              style={[styles.askField, { backgroundColor: theme.surface, borderColor: theme.hairline2 }]}
              accessibilityRole="button"
              accessibilityLabel={t('gurus.askSaga')}
            >
              <Text style={[styles.askPlaceholder, { color: theme.muted }]}>{t('gurus.askSaga')}</Text>
              <View style={[styles.askSend, { backgroundColor: theme.accent }]}>
                <Icon name="send" size={18} color={theme.accentFg} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Your sky · next few weeks */}
        {sky.length > 0 && (
          <View style={styles.block10}>
            <View style={[styles.sectionHead, styles.tightHead]}>
              <EyebrowLabel size={11}>{t('sky.eyebrow')}</EyebrowLabel>
              <TouchableOpacity onPress={() => go('/alerts')} hitSlop={12} accessibilityRole="button">
                <Text style={[styles.link, indic && styles.noTracking, { color: theme.ink2 }]}>{t('sky.all')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              {sky.map((a, i) => {
                const info = explainTransit(a, activeProfile);
                const mon = a.date.toLocaleDateString(intlLocale(), { month: 'short' });
                const day = localizeDigits(String(a.date.getDate()));
                return (
                  <TouchableOpacity
                    key={a.id}
                    activeOpacity={0.85}
                    onPress={() => go(`/alerts/${a.id}`)}
                    style={[styles.skyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${mon} ${day}. ${info.title}. ${info.lines[0]}`}
                  >
                    <View style={styles.skyDate}>
                      <Text style={[styles.skyMon, indic && styles.noTracking, { color: theme.muted }]}>{mon}</Text>
                      <Text style={[styles.skyDay, { color: theme.ink }]}>{day}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.skyTitle, { color: theme.ink }]}>{info.title}</Text>
                      <Text style={[styles.skySub, { color: theme.ink2 }]} numberOfLines={2}>{info.lines[0]}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Your life: kundli, year, sade sati */}
        {activeProfile?.birthDate && (
          <View style={styles.block10}>
            <EyebrowLabel size={11}>{t('life.eyebrow')}</EyebrowLabel>
            <View style={styles.pair}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => go(`/profile/${activeProfile.id}`)}
                style={[styles.tile, styles.pairTile, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
                accessibilityRole="button"
                accessibilityLabel={`${t('life.kundli')}, ${kundliSub}`}
              >
                <View style={[styles.tileIcon, { backgroundColor: TILE_BG }]}>
                  <Icon name="kundli" size={19} color={theme.accent} />
                </View>
                <Text style={[styles.tileTitle, { color: theme.ink }]}>{t('life.kundli')}</Text>
                <Text style={[styles.tileSub, { color: theme.ink2 }]} numberOfLines={1}>{kundliSub}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                // "Your year" opens the Reports tab (Year ahead, Life chapters, life-area reports).
                onPress={() => router.navigate('/reports' as Href)}
                style={[styles.tile, styles.pairTile, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
                accessibilityRole="button"
                accessibilityLabel={`${t('life.year')}, ${yearSub}`}
              >
                <View style={[styles.tileIcon, { backgroundColor: TILE_BG }]}>
                  <Icon name="calendar" size={19} color={theme.accent} />
                </View>
                <Text style={[styles.tileTitle, { color: theme.ink }]}>{t('life.year')}</Text>
                <Text style={[styles.tileSub, { color: theme.ink2 }]} numberOfLines={1}>{yearSub}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => go(`/sade-sati/${activeProfile.id}`)}
              style={[styles.sadeRow, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
              accessibilityRole="button"
              accessibilityLabel={`${t('life.sadeA11y', { state: t(`life.sade.${sadeState}`) })}${sadeRight ? `, ${sadeRight}` : ''}`}
            >
              <View style={[styles.tileIcon, styles.noMargin, { backgroundColor: TILE_BG }]}>
                <Icon name="saturn" size={20} color={theme.accent} />
              </View>
              <View style={styles.sadeBody}>
                <View style={styles.sadeHead}>
                  <Text style={[styles.sadeTitle, indic && styles.phaseTitleIndic, { color: theme.ink }]} numberOfLines={1}>
                    {sadeReady ? (
                      <Trans
                        t={t}
                        i18nKey="life.sadeTitle"
                        values={{ state: t(`life.sade.${sadeState}`) }}
                        components={{ em: <Text style={styles.italic} /> }}
                      />
                    ) : ' '}
                  </Text>
                  {!!sadeRight && <Text style={[styles.phaseMeta, { color: theme.ink2 }]}>{sadeRight}</Text>}
                </View>
                <View style={styles.sadeBars}>
                  {sadeBars.map((f, i) => (
                    <View key={i} style={[styles.sadeBar, { backgroundColor: theme.hairline2 }]}>
                      <View style={[styles.fill, { width: `${Math.round(f * 100)}%`, backgroundColor: theme.accent }]} />
                    </View>
                  ))}
                </View>
              </View>
              <Icon name="chevron" size={16} color={theme.faint} />
            </TouchableOpacity>
          </View>
        )}

        {/* Explore */}
        <View style={styles.block10}>
          <EyebrowLabel size={11}>{t('explore.eyebrow')}</EyebrowLabel>
          <View style={styles.tiles}>
            {tiles.map((tile) => (
              <TouchableOpacity
                key={tile.key}
                activeOpacity={0.85}
                onPress={tile.onPress}
                style={[styles.tile, styles.gridTile, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
                accessibilityRole="button"
                accessibilityLabel={`${t(`tiles.${tile.key}.title`)}, ${tile.sub}`}
              >
                <View style={[styles.tileIcon, { backgroundColor: TILE_BG }]}>
                  <Icon name={tile.icon} size={19} color={theme.accent} />
                </View>
                <Text style={[styles.tileTitle, { color: theme.ink }]} numberOfLines={1}>{t(`tiles.${tile.key}.title`)}</Text>
                <Text style={[styles.tileSub, { color: theme.ink2 }]} numberOfLines={1}>{tile.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Gita verse of the day */}
        <View style={[styles.gita, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => go('/gita')}
            style={styles.gitaMain}
            accessibilityRole="button"
            accessibilityLabel={t('gita.a11y', { ref: verse.ref })}
          >
            <View style={styles.sectionHead}>
              <EyebrowLabel size={11}>{t('gita.eyebrow')}</EyebrowLabel>
              <Text style={[styles.gitaRef, { color: theme.muted }]}>{localizeDigits(verse.ref)}</Text>
            </View>
            {!!verse.sanskrit && (
              <Text style={[styles.gitaSanskrit, { color: theme.ink2 }]} numberOfLines={2}>
                {verse.sanskrit.split('\n')[0]}
              </Text>
            )}
            <Text style={[styles.gitaText, indic && styles.todayQuoteIndic, { color: theme.ink }]} numberOfLines={4}>
              “{verseText(verse, lang)}”
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => askGuru('krishna')}
            style={[styles.gitaFoot, { borderTopColor: theme.hairline }]}
            accessibilityRole="button"
          >
            <Icon name="lotus" size={17} color={theme.accent} />
            <Text style={[styles.gitaFootText, { color: theme.ink2 }]}>{t('gita.talk')}</Text>
            <Icon name="chevron" size={16} color={theme.faint} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <ProfileSwitcherSheet
        ref={switcherRef}
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        onSelect={(p) => setActiveProfile(p.id)}
        onCreateNew={() => go('/profile/new')}
        onEdit={(p) => go(`/profile/edit/${p.id}`)}
      />
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  setupPill: { marginTop: 2, marginBottom: 6 },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 22,
    paddingTop:        16,
    paddingBottom:     8,
  },
  headerSpacer: { flex: 1 },
  headerIcon: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop:        8,
    gap:               20,
  },
  greeting: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      30,
    lineHeight:    36,
    letterSpacing: -0.3,
    marginTop:     4,
  },
  greetingIndic: { fontSize: 26, lineHeight: 40 },
  italic: { fontFamily: FONTS.serifItalic },
  noTracking: { letterSpacing: 0 },

  todayCard: {
    borderRadius: RADIUS.card + 4,
    borderWidth:  StyleSheet.hairlineWidth,
    overflow:     'hidden',
  },
  todayTop: {
    paddingHorizontal: 18,
    paddingTop:        16,
    paddingBottom:     14,
    gap:               8,
  },
  todayQuote: {
    fontFamily: FONTS.serifRegular,
    fontSize:   20,
    lineHeight: 25,
  },
  todayQuoteIndic: { fontSize: 18, lineHeight: 28 },
  todayMeta: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            10,
  },
  todayPeriods: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
  },
  sky: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  skyCell: {
    width:         '50%',
    gap:           2,
    paddingVertical: 12,
  },
  skyLeft: {
    paddingLeft:       18,
    paddingRight:      14,
    borderRightWidth:  StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skyNoBottom: { borderBottomWidth: 0 },
  skyRight: {
    paddingLeft:  14,
    paddingRight: 18,
  },
  skyLabel: {
    fontFamily: FONTS.sansRegular,
    fontSize:   11,
  },
  skyValue: {
    flexShrink: 1,
    fontFamily: FONTS.sansMedium,
    fontSize:   14,
  },
  luckyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: {
    width:        12,
    height:       12,
    borderRadius: 6,
    borderWidth:  1,
  },
  phase: {
    paddingHorizontal: 18,
    paddingTop:        14,
    paddingBottom:     14,
    gap:               8,
    borderTopWidth:    StyleSheet.hairlineWidth,
  },
  phaseHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    gap:            10,
  },
  phaseMeta: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
  },
  phaseTitle: {
    flexShrink: 1,
    fontFamily: FONTS.serifRegular,
    fontSize:   18,
    lineHeight: 22,
  },
  phaseTitleIndic: { fontSize: 17, lineHeight: 27 },
  phaseUntil: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
  },
  track: {
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },
  fill: { height: 4, borderRadius: 2 },
  phaseSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 17,
  },

  block: { gap: 12 },
  block10: { gap: 10 },
  sectionHead: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            10,
  },
  tightHead: { marginBottom: -4 },
  link: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bleed: { marginHorizontal: -22 },
  guruRow: {
    flexDirection:     'row',
    gap:               10,
    paddingHorizontal: 22,
    paddingBottom:     2,
  },
  guruCard: {
    width:             96,
    gap:               4,
    paddingVertical:   14,
    paddingHorizontal: 12,
    borderRadius:      RADIUS.card,
    borderWidth:       StyleSheet.hairlineWidth,
  },
  guruName: {
    fontFamily: FONTS.serifItalic,
    fontSize:   17,
    lineHeight: 20,
  },
  dim: { opacity: 0.5 },
  askField: {
    flexDirection: 'row',
    alignItems:    'center',
    height:        52,
    paddingLeft:   18,
    paddingRight:  7,
    borderRadius:  RADIUS.pill,
    borderWidth:   1,
  },
  askPlaceholder: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
  },
  askSend: {
    width:          38,
    height:         38,
    borderRadius:   19,
    alignItems:     'center',
    justifyContent: 'center',
  },

  listCard: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    overflow:     'hidden',
  },
  skyRow: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               14,
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  skyDate: { width: 44, alignItems: 'center', paddingTop: 1 },
  skyMon: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  skyDay: {
    fontFamily: FONTS.serifRegular,
    fontSize:   24,
    lineHeight: 26,
  },
  skyTitle: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
    lineHeight: 19,
  },
  skySub: {
    marginTop:  3,
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 17,
  },

  pair: { flexDirection: 'row', gap: 10 },
  pairTile: { flex: 1 },
  tiles: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },
  tile: {
    padding:      14,
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    gap:          4,
    minWidth:     0,
  },
  gridTile: {
    flexGrow:  1,
    flexBasis: '30%',
  },
  tileIcon: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   8,
  },
  noMargin: { marginBottom: 0 },
  tileTitle: {
    fontFamily: FONTS.serifItalic,
    fontSize:   18,
    lineHeight: 21,
  },
  tileSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   11.5,
  },
  sadeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    padding:       14,
    borderRadius:  RADIUS.card,
    borderWidth:   StyleSheet.hairlineWidth,
  },
  sadeBody: { flex: 1, minWidth: 0, gap: 6 },
  sadeHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    gap:            8,
  },
  sadeTitle: {
    flexShrink: 1,
    fontFamily: FONTS.serifRegular,
    fontSize:   18,
    lineHeight: 21,
  },
  sadeBars: { flexDirection: 'row', gap: 3 },
  sadeBar: {
    flex:         1,
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },

  gita: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    overflow:     'hidden',
  },
  gitaMain: {
    gap:               10,
    paddingHorizontal: 18,
    paddingTop:        18,
    paddingBottom:     12,
  },
  gitaRef: {
    fontFamily: FONTS.monoRegular,
    fontSize:   11,
  },
  gitaSanskrit: {
    fontSize:   15,
    lineHeight: 26,
  },
  gitaText: {
    fontFamily: FONTS.serifRegular,
    fontSize:   20,
    lineHeight: 25,
  },
  gitaFoot: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    minHeight:         44,
    marginHorizontal:  18,
    marginBottom:      6,
    borderTopWidth:    StyleSheet.hairlineWidth,
  },
  gitaFootText: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
  },
  emptyCard: {
    padding:      20,
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
  },
  emptyTitle: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     22,
    lineHeight:   28,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    lineHeight: 19,
  },
});
