'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { useReport } from '@/hooks/use-report';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { Avatar } from '@/components/atoms/Avatar';
import { ProfileSwitcherSheet, ProfileSwitcherTrigger, type ProfileSwitcherSheetRef } from '@/components/organisms/ProfileSwitcher';
import { EmText } from '@/components/organisms/ReportSummaryCard';
import { FONTS, RADIUS } from '@/constants/themes';
import { getRecentReports, type Profile, type ReportRow } from '@/utils/database';
import { formatMonthYear, intlLocale, localizeDigits, tPlanet, useAppLanguage } from '@/utils/i18n';
import { todayIso } from '@/utils/format';
import { getLifeChapters } from '@/utils/astrology';
import {
  areaGlance,
  getChartFacts,
  parseCompatRowId,
  parsePayload,
  plain,
  whereFrom,
  type AreaGlance,
  type ReportKind,
} from '@/utils/reports';
import { guruLocked } from '@/utils/guru-context';
import { logger } from '@/utils/logger';

const TILE_BG = 'rgba(180,130,0,0.10)';

const AREA_TILES: { kind: Exclude<ReportKind, 'life'>; icon: IconName }[] = [
  { kind: 'career', icon: 'briefcase' },
  { kind: 'love', icon: 'heart' },
  { kind: 'health', icon: 'sprout' },
  { kind: 'study', icon: 'study' },
  { kind: 'family', icon: 'house' },
  { kind: 'wealth', icon: 'money' },
];

type TabFacts = {
  key: string;
  areas: Partial<Record<ReportKind, AreaGlance>>;
  dasha: { chapter: string; stretch: string; end: Date } | null;
  sade: { state: 'rising' | 'peak' | 'setting' | 'return' | 'next' | 'none'; date: Date | null };
};

/** Focus dots, "Now" lines and the timing subtitles, computed after the tab has rendered. */
function useTabFacts(profile: Profile | null): TabFacts | null {
  const lang = useAppLanguage();
  const day = todayIso();
  const key = profile?.birthDate
    ? `${profile.id}|${profile.birthDate}|${profile.birthTime}|${profile.birthLat}|${profile.birthLng}|${profile.birthTz}|${lang}|${day}`
    : null;
  const [state, setState] = useState<TabFacts | null>(null);
  useEffect(() => {
    if (!key || !profile) return;
    const task = InteractionManager.runAfterInteractions(() => {
      try {
        const areas: TabFacts['areas'] = {};
        for (const { kind: k } of AREA_TILES) {
          const g = areaGlance(profile, k);
          if (g) areas[k] = g;
        }
        const life = getLifeChapters(profile);
        const f = getChartFacts(profile);
        const sade: TabFacts['sade'] = f.sade.active && f.sade.end
          ? { state: f.sade.phase ?? 'setting', date: f.sade.end }
          : f.sade.nextStart ? { state: 'next', date: f.sade.nextStart } : { state: 'none', date: null };
        setState({
          key,
          areas,
          dasha: { chapter: life.chapters[life.currentIndex].lord, stretch: life.subs[life.currentSub].lord, end: life.subs[life.currentSub].end },
          sade,
        });
      } catch (e) {
        logger.warn('[reports] tab facts failed', e);
        setState({ key, areas: {}, dasha: null, sade: { state: 'none', date: null } });
      }
    });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key && state?.key === key ? state : null;
}

/** "TODAY", "2 DAYS AGO", "LAST WEEK", "SEP 28". */
function whenLabel(iso: string | null, t: (k: string, v?: Record<string, unknown>) => string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return t('tab.when.today');
  if (days === 1) return t('tab.when.yesterday');
  if (days < 7) return t('tab.when.days', { n: days });
  if (days < 14) return t('tab.when.lastWeek');
  return localizeDigits(d.toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' })).toUpperCase();
}

export default function ReportsTabScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('reports');
  const lang = useAppLanguage();
  const switcherRef = useRef<ProfileSwitcherSheetRef>(null);
  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const p = activeProfile;
  const first = p?.name.split(' ')[0] ?? '';

  const facts = useTabFacts(p?.birthDate ? p : null);
  const life = useReport('life', p);
  const [recent, setRecent] = useState<ReportRow[]>([]);

  const pid = p?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!pid) { setRecent([]); return; }
      getRecentReports(pid, 8).then(setRecent).catch(() => setRecent([]));
    }, [pid]),
  );

  const go = (href: string) => router.push(href as Href);
  const now = new Date();
  const loveLocked = !!p && guruLocked('love', p.birthDate);
  const byId = (id: string) => profiles.find((x) => x.id === id) ?? null;

  // Recently viewed cards (compatibility rows whose second person is gone are skipped).
  const cards = recent.flatMap((row) => {
    const payload = parsePayload(row.payload);
    const compat = parseCompatRowId(row.id);
    const total = payload?.chapters.length ?? 0;
    const w = whereFrom(row.progress, total);
    let name: string;
    let where: string;
    let href: string;
    if (compat) {
      const b = byId(compat.b);
      if (!b) return [];
      name = `${first} + ${b.name.split(' ')[0]}`;
      where = t('tab.recentCompat', { mode: t(`pair.mode.${compat.mode}`) });
      href = `/report/compat?profileId=${compat.a}&b=${compat.b}&mode=${compat.mode}`;
    } else {
      const kind = row.kind as ReportKind;
      if (kind === 'love' && loveLocked) return [];
      name = t(`kind.${kind}.title`);
      const sameLang = payload?.lang === lang;
      const chip = sameLang && total ? (payload!.chapters[w.chapter - 1]?.chip ?? '') : '';
      where = w.state === 'done' ? t('tab.recentDone')
        : total ? (chip ? t('tab.recentWhere', { n: w.chapter, total, chapter: chip }) : t('tab.recentWhereShort', { n: w.chapter, total }))
        : t('tab.recentStart');
      href = `/report/${kind}?profileId=${row.profileId}`;
    }
    return [{ id: row.id, name, where, pct: Math.round(row.progress * 100), when: whenLabel(row.viewedAt, t), href }];
  }).slice(0, 6);

  const lastCompat = recent.map((r) => ({ r, c: parseCompatRowId(r.id) })).find((x) => x.c && byId(x.c.b));
  const lastCompatLine = (() => {
    if (!lastCompat?.c) return null;
    const b = byId(lastCompat.c.b)!;
    const pair = `${first} + ${b.name.split(' ')[0]}`;
    const payload = parsePayload(lastCompat.r.payload);
    const score = payload?.compat?.score?.total;
    return {
      text: score != null ? t('tab.lastReadScore', { pair, score }) : t('tab.lastRead', { pair }),
      when: whenLabel(lastCompat.r.viewedAt, t),
      href: `/report/pair?b=${b.id}&mode=${lastCompat.c.mode}`,
    };
  })();

  const timing = facts ? [
    {
      key: 'year', icon: 'calendar' as IconName, name: t('kind.year.title'),
      sub: t('tab.yearSub', { from: formatMonthYear(now), to: formatMonthYear(new Date(now.getFullYear(), now.getMonth() + 11, 1)) }),
      href: `/forecast/${p!.id}`,
    },
    {
      key: 'dasha', icon: 'timeline' as IconName, name: t('kind.dasha.title'),
      sub: facts.dasha ? t('tab.dashaSub', { chapter: tPlanet(facts.dasha.chapter), stretch: tPlanet(facts.dasha.stretch), date: formatMonthYear(facts.dasha.end) }) : '',
      href: `/dasha/${p!.id}`,
    },
    {
      key: 'sade', icon: 'saturn' as IconName, name: t('kind.sade.title'),
      sub: t(`tab.sadeSub.${facts.sade.state}`, { date: facts.sade.date ? formatMonthYear(facts.sade.date) : '' }),
      href: `/sade-sati/${p!.id}`,
    },
  ] : [];

  const lifeReport = life.report;
  const lifeCount = lifeReport?.chapters.length ?? 5;
  const lifeMin = lifeReport?.minutes ?? 3;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.ink }]} accessibilityRole="header">{t('tab.title')}</Text>
        <ProfileSwitcherTrigger profile={p} onPress={() => switcherRef.current?.present()} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!p ? (
          <Text style={[styles.lead, { color: theme.ink2 }]}>{t('tab.noProfile')}</Text>
        ) : !p.birthDate ? (
          <View style={[styles.card, styles.pad, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <Text style={[styles.lead, { color: theme.ink2 }]}>{t('tab.noBirth', { name: first })}</Text>
            <TouchableOpacity onPress={() => go(`/profile/edit/${p.id}`)} style={[styles.pill, { borderColor: theme.hairline2 }]} accessibilityRole="button">
              <Text style={[styles.pillText, { color: theme.ink }]}>{t('tab.addDetails')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.lead, { color: theme.ink2 }]}>{t('tab.lead', { name: first })}</Text>

            {/* Featured: Life report */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => go(`/report/life?profileId=${p.id}`)}
              style={[styles.featured, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
              accessibilityRole="button"
              accessibilityLabel={t('tab.featuredA11y', { name: first, count: lifeCount, min: lifeMin })}
            >
              <View style={styles.featuredTop}>
                <View style={styles.featuredHead}>
                  <View style={[styles.icon40, { backgroundColor: TILE_BG }]}>
                    <Icon name="sun" size={21} color={theme.accent} />
                  </View>
                  <EyebrowLabel size={11} style={styles.flex}>{t('tab.featuredEyebrow')}</EyebrowLabel>
                </View>
                <EmText text={t('tab.featuredTitle')} style={[styles.featuredTitle, { color: theme.ink }]} />
                <Text style={[styles.featuredQuote, { color: theme.ink2 }]}>
                  {lifeReport ? `“${plain(lifeReport.summary.line)}”` : t('tab.loading')}
                </Text>
              </View>
              <View style={[styles.featuredBar, { backgroundColor: theme.surface2, borderTopColor: theme.hairline }]}>
                <Text style={[styles.featuredMeta, { color: theme.ink2 }]}>{t('tab.featuredMeta', { count: lifeCount, min: lifeMin })}</Text>
                <View style={[styles.readBtn, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.readText, { color: theme.accentFg }]}>{t('tab.read')}</Text>
                  <Icon name="chevron" size={14} color={theme.accentFg} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Recently viewed */}
            {cards.length > 0 && (
              <View style={styles.section}>
                <EyebrowLabel size={11}>{t('tab.recent')}</EyebrowLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.recentRow}>
                  {cards.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      activeOpacity={0.85}
                      onPress={() => go(c.href)}
                      style={[styles.recentCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.name}, ${c.where}, ${c.when}`}
                    >
                      <Text style={[styles.recentName, { color: theme.ink }]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[styles.recentWhere, { color: theme.ink2 }]} numberOfLines={1}>{c.where}</Text>
                      <View style={[styles.progressTrack, { backgroundColor: theme.hairline }]}>
                        <View style={[styles.progressFill, { width: `${c.pct}%`, backgroundColor: theme.accent }]} />
                      </View>
                      <Text style={[styles.recentWhen, { color: theme.muted }]}>{c.when}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Life areas */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <EyebrowLabel size={11}>{t('tab.areas')}</EyebrowLabel>
                <Text style={[styles.hint, { color: theme.muted }]}>{t('tab.dotsHint')}</Text>
              </View>
              <View style={styles.grid}>
                {AREA_TILES.map(({ kind, icon }) => {
                  const locked = kind === 'love' && loveLocked;
                  const g = !locked ? facts?.areas[kind] : undefined;
                  const dim = locked;
                  const now = locked ? t('tab.lockedLine') : g?.now ?? ' ';
                  return (
                    <TouchableOpacity
                      key={kind}
                      activeOpacity={0.85}
                      disabled={dim}
                      onPress={() => go(`/report/${kind}?profileId=${p.id}`)}
                      style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.hairline }, dim && styles.dim]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: dim }}
                      accessibilityLabel={[t(`kind.${kind}.title`), t(`kind.${kind}.sub`), g ? t('tab.focusA11y', { word: g.word }) : '', now].filter(Boolean).join(', ')}
                    >
                      <View style={styles.tileTop}>
                        <View style={[styles.icon36, { backgroundColor: TILE_BG }]}>
                          <Icon name={locked ? 'lock' : icon} size={19} color={theme.accent} />
                        </View>
                        {!dim && (
                          <View style={styles.dots}>
                            {[1, 2, 3].map((i) => (
                              <View key={i} style={[styles.dot, { backgroundColor: g && i <= g.dots ? theme.accent : theme.hairline2 }]} />
                            ))}
                          </View>
                        )}
                      </View>
                      <Text style={[styles.tileName, { color: theme.ink }]}>{t(`kind.${kind}.title`)}</Text>
                      <Text style={[styles.tileSub, { color: theme.ink2 }]}>{t(`kind.${kind}.sub`)}</Text>
                      <Text style={[styles.tileNow, { color: theme.muted }]}>{now}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Timing */}
            <View style={styles.section}>
              <EyebrowLabel size={11}>{t('tab.timing')}</EyebrowLabel>
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                {(timing.length ? timing : (['year', 'dasha', 'sade'] as const).map((k) => ({ key: k, icon: (k === 'year' ? 'calendar' : k === 'dasha' ? 'timeline' : 'saturn') as IconName, name: t(`kind.${k}.title`), sub: ' ', href: '' }))).map((r, i) => (
                  <TouchableOpacity
                    key={r.key}
                    activeOpacity={0.7}
                    disabled={!r.href}
                    onPress={() => go(r.href)}
                    style={[styles.timingRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.name}, ${r.sub}`}
                  >
                    <View style={[styles.icon40, { backgroundColor: TILE_BG }]}>
                      <Icon name={r.icon} size={19} color={theme.accent} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowName, { color: theme.ink }]}>{r.name}</Text>
                      <Text style={[styles.rowSub, { color: theme.ink2 }]} numberOfLines={2}>{r.sub}</Text>
                    </View>
                    <Icon name="chevron" size={14} color={theme.faint} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Two people */}
            <View style={styles.section}>
              <EyebrowLabel size={11}>{t('tab.twoPeople')}</EyebrowLabel>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => go('/report/pair')}
                style={[styles.card, styles.compatRow, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
                accessibilityRole="button"
                accessibilityLabel={`${t('tab.compatTitle')}. ${t('tab.compatSub')}`}
              >
                <View style={styles.avatars}>
                  <Avatar name={p.name} size={36} style={{ borderWidth: 2, borderColor: theme.surface }} />
                  <View style={[styles.plusAvatar, { backgroundColor: theme.surface, borderColor: theme.surface }]}>
                    <View style={[styles.plusInner, { backgroundColor: TILE_BG }]}>
                      <Icon name="plus" size={16} color={theme.accent} />
                    </View>
                  </View>
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: theme.ink }]}>{t('tab.compatTitle')}</Text>
                  <Text style={[styles.rowSub, { color: theme.ink2 }]}>{t('tab.compatSub')}</Text>
                </View>
                <Icon name="chevron" size={14} color={theme.faint} />
              </TouchableOpacity>
              {lastCompatLine && (
                <TouchableOpacity onPress={() => go(lastCompatLine.href)} style={styles.lastRead} accessibilityRole="button">
                  <EmText
                    text={lastCompatLine.text.replace(/<b>/g, '<em>').replace(/<\/b>/g, '</em>')}
                    style={[styles.lastReadText, { color: theme.ink2 }]}
                    emStyle={[styles.bold, { color: theme.ink }]}
                    numberOfLines={1}
                  />
                  <Text style={[styles.lastReadWhen, { color: theme.muted }]}>{lastCompatLine.when}</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.footnote, { color: theme.muted }]}>{t('tab.footnote')}</Text>
          </>
        )}
      </ScrollView>

      <ProfileSwitcherSheet
        ref={switcherRef}
        profiles={profiles}
        activeProfileId={p?.id ?? null}
        onSelect={(x) => setActiveProfile(x.id)}
        onCreateNew={() => router.push('/profile/new')}
        onEdit={(x) => router.push(`/profile/edit/${x.id}`)}
      />
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 4 },
  title: { flex: 1, fontFamily: FONTS.serifItalic, fontSize: 36, lineHeight: 40 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 40, gap: 22 },
  flex: { flex: 1 },
  lead: { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 19 },
  card: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  pad: { padding: 16, gap: 12 },
  pill: { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1, justifyContent: 'center' },
  pillText: { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 18 },

  featured: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  featuredTop: { gap: 10, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16 },
  featuredHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featuredTitle: { fontFamily: FONTS.serifRegular, fontSize: 27, lineHeight: 31, letterSpacing: -0.2 },
  featuredQuote: { fontFamily: FONTS.serifRegular, fontSize: 18, lineHeight: 24 },
  featuredBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 18, paddingRight: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  featuredMeta: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },
  readBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: RADIUS.pill },
  readText: { fontFamily: FONTS.sansMedium, fontSize: 14, lineHeight: 18 },
  icon40: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  icon36: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  hint: { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 15 },
  bleed: { marginHorizontal: -22, flexGrow: 0 },
  recentRow: { gap: 10, paddingHorizontal: 22, paddingBottom: 2 },
  recentCard: { width: 168, gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth },
  recentName: { fontFamily: FONTS.serifItalic, fontSize: 18, lineHeight: 21 },
  recentWhere: { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 15 },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3 },
  recentWhen: { fontFamily: FONTS.monoRegular, fontSize: 10, lineHeight: 13, letterSpacing: 0.6 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1, flexBasis: '45%', gap: 4, padding: 14,
    borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth,
  },
  dim: { opacity: 0.55 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  dots: { flexDirection: 'row', gap: 3, paddingTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tileName: { fontFamily: FONTS.serifItalic, fontSize: 19, lineHeight: 22 },
  tileSub: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },
  tileNow: { marginTop: 4, fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 15 },

  timingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingVertical: 12, paddingHorizontal: 16 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontFamily: FONTS.serifItalic, fontSize: 19, lineHeight: 22 },
  rowSub: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },

  compatRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  avatars: { flexDirection: 'row' },
  plusAvatar: { marginLeft: -10, width: 40, height: 40, borderRadius: 20, borderWidth: 2, overflow: 'hidden' },
  plusInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lastRead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 4 },
  lastReadText: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 18 },
  bold: { fontFamily: FONTS.sansSemiBold, fontStyle: 'normal' },
  lastReadWhen: { fontFamily: FONTS.monoRegular, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.4 },

  footnote: { marginHorizontal: 4, fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
});
