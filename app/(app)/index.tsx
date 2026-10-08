'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useThreads } from '@/hooks/use-threads';
import { useHoroscope } from '@/hooks/use-horoscope';
import { ProfileSwitcherTrigger, ProfileSwitcherSheet, type ProfileSwitcherSheetRef } from '@/components/organisms/ProfileSwitcher';
import { ProfileBlock } from '@/components/organisms/ProfileBlock';
import { DotsLoader } from '@/components/molecules/DotsLoader';
import { ModelSetupPill } from '@/components/molecules/ModelSetupPill';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';
import { todayIso } from '@/utils/format';
import { getLifeChapters } from '@/utils/astrology';
import { formatMonthYear, intlLocale, tAsk, tNakshatra, tPlanet, tTithi } from '@/utils/i18n';
import { getPanchang } from '@/utils/panchang';
import type { Thread } from '@/utils/database';
import { KRISHNA_PROFILE_ID } from '@/utils/krishna';
import { useIndicStyles } from '@/hooks/use-indic-styles';

// Short questions the on-device model answers well (timing questions get real
// dates from the chart). Phrased for the profile owner; `them` for others.
// The chip shows home:ask.<you|other>.<key>; `prompt` is the same question
// via tAsk() (app language when the model speaks it, else English).
function askChips(isYou: boolean, first: string): { key: string; prompt: string }[] {
  const who = isYou ? 'you' : 'other';
  return ['job', 'love', 'phase', 'strength'].map((key) => ({
    key,
    prompt: tAsk(`home:ask.${who}.${key}`, { name: first }),
  }));
}

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

export default function HomeScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('home');
  // Devanagari / Bengali glyphs are taller than Latin; loosen the tightest
  // display line heights so the top marks don't clip.
  const indic = i18n.language !== 'en';
  const switcherRef = useRef<ProfileSwitcherSheetRef>(null);

  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const { activeThreads, archiveThread } = useThreads(activeProfile?.id ?? null);
  const { text: horoscopeText, loading: horoscopeLoading } = useHoroscope(activeProfile);
  const { activeThreads: krishnaThreads } = useThreads(KRISHNA_PROFILE_ID);

  const firstName   = activeProfile?.name ? activeProfile.name.split(' ')[0] : t('friend');
  const todayLabel  = new Date().toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' });
  const teaser      = teaserOf(horoscopeText);

  const panchang = useMemo(
    () => getPanchang(todayIso(), activeProfile?.birthLat ?? null, activeProfile?.birthLng ?? null),
    [activeProfile?.birthLat, activeProfile?.birthLng],
  );

  const life = useMemo(
    () => (activeProfile?.birthDate ? getLifeChapters(activeProfile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile?.birthDate, activeProfile?.birthTime, activeProfile?.birthLng, activeProfile?.birthTz],
  );
  const chapter = life ? life.chapters[life.currentIndex] : null;
  const sub     = life ? life.subs[life.currentSub] : null;
  const nextSub = life?.upcoming.find((u) => u.kind === 'sub')?.period ?? null;
  const pct     = life ? Math.round(life.progress * 100) : 0;

  const openNewChat = (ask?: string) => {
    if (!activeProfile) return;
    const tempId = 't_' + Math.random().toString(36).slice(2, 11);
    const askParam = ask ? `&ask=${encodeURIComponent(ask)}` : '';
    router.push(`/chat/${tempId}?profileId=${activeProfile.id}&isNew=true${askParam}`);
  };

  const handleOpenThread = (t: Thread) => {
    if (!activeProfile) return;
    router.push(`/chat/${t.id}?profileId=${activeProfile.id}`);
  };

  const handleTalkToKrishna = () => {
    // Reuse the most recent non-archived Krishna conversation if one exists,
    // otherwise start fresh. Without this, every tap creates a new thread.
    const existing = krishnaThreads[0];
    if (existing) {
      router.push(`/chat/${existing.id}?profileId=${KRISHNA_PROFILE_ID}`);
      return;
    }
    const tempId = 't_' + Math.random().toString(36).slice(2, 11);
    router.push(`/chat/${tempId}?profileId=${KRISHNA_PROFILE_ID}&isNew=true`);
  };

  const pid = activeProfile?.id;
  const tiles: { key: string; icon: IconName; title: string; sub: string; onPress: () => void }[] = [
    { key: 'krishna',  icon: 'lotus',    title: t('tiles.krishna.title'),  sub: t('tiles.krishna.sub'),  onPress: handleTalkToKrishna },
    { key: 'muhurat',  icon: 'clock',    title: t('tiles.muhurat.title'),  sub: t('tiles.muhurat.sub'),  onPress: () => router.push('/muhurat') },
    { key: 'family',   icon: 'people',   title: t('tiles.family.title'),   sub: t('tiles.family.sub'),   onPress: () => router.push('/family') },
    { key: 'forecast', icon: 'calendar', title: t('tiles.forecast.title'), sub: t('tiles.forecast.sub'), onPress: () => pid && router.push(`/forecast/${pid}`) },
    { key: 'journal',  icon: 'book',     title: t('tiles.journal.title'),  sub: t('tiles.journal.sub'),  onPress: () => pid && router.push(`/journal/${pid}`) },
    { key: 'panchang', icon: 'sparkle',  title: t('tiles.panchang.title'), sub: tTithi(panchang.tithi.short), onPress: () => router.push('/panchang') },
  ];

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <ProfileSwitcherTrigger
          profile={activeProfile}
          onPress={() => switcherRef.current?.present()}
        />
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          onPress={() => router.push('/alerts')}
          style={styles.headerIcon}
          accessibilityLabel={t('a11y.alerts')}
        >
          <Icon name="bell" size={20} color={theme.ink2} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/(app)/settings')}
          style={styles.headerIcon}
          accessibilityLabel={t('a11y.settings')}
        >
          <Icon name="settings" size={20} color={theme.ink2} />
        </TouchableOpacity>
      </View>

      {/* Saga's model still downloading (returning users; renders nothing once ready). */}
      <ModelSetupPill style={styles.setupPill} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.greeting, indic && styles.greetingIndic, { color: theme.ink }]}>
          {t('greeting.line', { greeting: t(`greeting.${greetingKey()}`) })}{' '}
          <Text style={styles.italic}>{t('greeting.name', { name: firstName })}</Text>
        </Text>

        {/* Empty-state when no profiles exist (post-reset or corrupted DB). */}
        {profiles.length === 0 && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/profile/new')}
            style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
          >
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>
              <Trans t={t} i18nKey="empty.title" components={{ em: <Text style={styles.italic} /> }} />
            </Text>
            <Text style={[styles.emptySub, { color: theme.muted }]}>
              {t('empty.sub')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Today: daily line, sky, life phase */}
        {activeProfile?.birthDate && (
          <View style={[styles.todayCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/horoscope/${activeProfile.id}`)}
              style={styles.todayTop}
              accessibilityRole="button"
              accessibilityLabel={`${t('today.readLink')} ${t('today.moonIn')} ${tNakshatra(panchang.nakshatra.name)}, ${t('today.tithi')} ${tTithi(panchang.tithi.name)}`}
            >
              <EyebrowLabel size={11}>{t('today.eyebrow', { date: todayLabel, name: firstName })}</EyebrowLabel>
              {horoscopeLoading || teaser === null ? (
                <DotsLoader />
              ) : (
                <>
                  <Text style={[styles.todayQuote, indic && styles.todayQuoteIndic, { color: theme.ink }]} numberOfLines={3}>“{teaser}”</Text>
                  <View style={styles.todayMeta}>
                    <Text style={[styles.todaySky, { color: theme.muted }]} numberOfLines={1}>
                      ☾ {tNakshatra(panchang.nakshatra.name)}{'  ·  '}{tTithi(panchang.tithi.name)}
                    </Text>
                    <Icon name="chevron" size={16} color={theme.accent} />
                  </View>
                </>
              )}
            </TouchableOpacity>

            {life && chapter && sub && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push(`/phase/${activeProfile.id}`)}
                style={[styles.phase, { borderTopColor: theme.hairline, backgroundColor: theme.surface2 }]}
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

        {/* Ask Saga */}
        {activeProfile && (
          <View style={styles.block}>
            <EyebrowLabel size={11}>{t('ask.eyebrow')}</EyebrowLabel>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => openNewChat()}
              style={[styles.askField, { backgroundColor: theme.surface, borderColor: theme.hairline2 }]}
            >
              <Text style={[styles.askPlaceholder, { color: theme.muted }]}>{t('ask.placeholder')}</Text>
              <View style={[styles.askSend, { backgroundColor: theme.accent }]}>
                <Icon name="send" size={18} color={theme.accentFg} />
              </View>
            </TouchableOpacity>
            {/* One swipeable row, edge to edge: chips stay one line in any language. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
            >
              {askChips(activeProfile.isYou, firstName).map((q) => (
                <TouchableOpacity
                  key={q.key}
                  activeOpacity={0.8}
                  onPress={() => openNewChat(q.prompt)}
                  style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.hairline2 }]}
                >
                  <Text style={[styles.chipText, { color: theme.ink }]}>
                    {t(`ask.${activeProfile.isYou ? 'you' : 'other'}.${q.key}`, { name: firstName })}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Explore */}
        {/* Explore tiles + Kundli matching share one 10pt gap */}
        <View style={styles.explore}>
        <View style={styles.tiles}>
          {tiles.map((t) => (
            <TouchableOpacity
              key={t.key}
              activeOpacity={0.85}
              onPress={t.onPress}
              style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
            >
              <View style={[styles.tileIcon, { backgroundColor: 'rgba(180,130,0,0.10)' }]}>
                <Icon name={t.icon} size={19} color={theme.accent} />
              </View>
              <Text style={[styles.tileTitle, { color: theme.ink }]}>{t.title}</Text>
              <Text style={[styles.tileSub, { color: theme.ink2 }]} numberOfLines={1}>{t.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Kundli matching */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/compatibility')}
          style={[styles.matchCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
          accessibilityRole="button"
        >
          <View style={[styles.tileIcon, { backgroundColor: 'rgba(180,130,0,0.10)', marginBottom: 0 }]}>
            <Icon name="people" size={19} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.tileTitle, { color: theme.ink }]}>{t('matchCard.title')}</Text>
            <Text style={[styles.tileSub, { color: theme.ink2 }]} numberOfLines={1}>{t('matchCard.sub')}</Text>
          </View>
          <Icon name="chevron" size={16} color={theme.faint} />
        </TouchableOpacity>
        </View>

        {/* Recent */}
        <View style={styles.sectionHeader}>
          <EyebrowLabel size={11}>{t('recent.eyebrow')}</EyebrowLabel>
          <View style={styles.recentLinks}>
            <TouchableOpacity onPress={() => router.push('/saved')} hitSlop={10}>
              <Text style={[styles.addLink, { color: theme.ink2 }]}>{t('recent.saved')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/profile/new')} hitSlop={10}>
              <Text style={[styles.addLink, { color: theme.ink2 }]}>{t('recent.addProfile')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {activeProfile && (
          <ProfileBlock
            profile={activeProfile}
            threads={activeThreads}
            onOpenKundli={() => router.push(`/profile/${activeProfile.id}`)}
            onOpenThread={handleOpenThread}
            onArchiveThread={(t) => archiveThread(t.id)}
          />
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* Profile switcher sheet */}
      <ProfileSwitcherSheet
        ref={switcherRef}
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        onSelect={(p) => setActiveProfile(p.id)}
        onCreateNew={() => router.push('/profile/new')}
        onEdit={(p) => router.push(`/profile/edit/${p.id}`)}
      />
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
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
    marginTop:      2,
  },
  todaySky: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
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
  chipsScroll: {
    marginHorizontal: -22,   // bleed past the content padding to the screen edges
  },
  chips: {
    flexDirection:     'row',
    gap:               8,
    paddingHorizontal: 22,
  },
  chip: {
    minHeight:         38,
    paddingHorizontal: 14,
    borderRadius:      RADIUS.pill,
    borderWidth:       1,
    justifyContent:    'center',
  },
  chipText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
  },

  explore: { gap: 10 },
  tiles: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },
  tile: {
    flexGrow:     1,
    flexBasis:    '30%',
    padding:      14,
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    gap:          4,
  },
  tileIcon: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   8,
  },
  matchCard: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    padding:       14,
    borderRadius:  RADIUS.card,
    borderWidth:   StyleSheet.hairlineWidth,
  },
  tileTitle: {
    fontFamily: FONTS.serifItalic,
    fontSize:   18,
    lineHeight: 21,
  },
  tileSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   11.5,
  },

  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   -14,
  },
  recentLinks: {
    flexDirection: 'row',
    gap:           18,
  },
  addLink: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
