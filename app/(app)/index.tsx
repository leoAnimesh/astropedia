import { useMemo, useRef, useState } from 'react';
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
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';
import { todayIso } from '@/utils/format';
import { getLifeChapters } from '@/utils/astrology';
import { formatMonthYear, intlLocale, tAsk, tNakshatra, tPlanet, tTithi } from '@/utils/i18n';
import { getPanchang } from '@/utils/panchang';
import { Storage } from '@/utils/storage';
import type { Thread } from '@/utils/database';
import { KRISHNA_PROFILE_ID } from '@/utils/krishna';

// Starter-card copy lives in home:starter.<intent>.
const STARTER_INTENTS = ['love', 'career', 'self', 'curious'];

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
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('home');
  // Devanagari / Bengali glyphs are taller than Latin; loosen the tightest
  // display line heights so the top marks don't clip.
  const indic = i18n.language !== 'en';
  const switcherRef = useRef<ProfileSwitcherSheetRef>(null);

  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const { activeThreads, archiveThread } = useThreads(activeProfile?.id ?? null);
  const { text: horoscopeText, loading: horoscopeLoading } = useHoroscope(activeProfile);
  const [starterIntent, setStarterIntent] = useState<string | null>(Storage.getStarterIntent());
  const { activeThreads: krishnaThreads } = useThreads(KRISHNA_PROFILE_ID);

  const starterKey  = starterIntent && STARTER_INTENTS.includes(starterIntent) ? starterIntent : null;
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

  const clearStarter = () => {
    if (!starterIntent) return;
    Storage.clearStarterIntent();
    setStarterIntent(null);
  };

  const openNewChat = (ask?: string) => {
    if (!activeProfile) return;
    clearStarter();
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.greeting, indic && styles.greetingIndic, { color: theme.ink }]}>
          {t('greeting.line', { greeting: t(`greeting.${greetingKey()}`) })}{'\n'}
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

        {/* Onboarding starter — shown until first chat is opened or dismissed */}
        {starterKey && activeProfile && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openNewChat()}
            style={[styles.starterCard, { backgroundColor: theme.accent }]}
          >
            <View style={{ flex: 1 }}>
              <EyebrowLabel size={9} style={{ color: theme.accentFg, opacity: 0.7, marginBottom: 6 }}>
                {t('starter.eyebrow')}
              </EyebrowLabel>
              <Text style={[styles.starterTitle, { color: theme.accentFg }]}>{t(`starter.${starterKey}.title`)}</Text>
              <Text style={[styles.starterSub, { color: theme.accentFg, opacity: 0.78 }]}>{t(`starter.${starterKey}.sub`)}</Text>
            </View>
            <TouchableOpacity onPress={clearStarter} hitSlop={12} style={{ marginLeft: 8 }}>
              <Icon name="close" size={16} color={theme.accentFg} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* Today: daily line, sky, life phase */}
        {activeProfile?.birthDate && (
          <View style={[styles.todayCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/horoscope/${activeProfile.id}`)}
              style={styles.todayTop}
            >
              <EyebrowLabel size={11}>{t('today.eyebrow', { date: todayLabel, name: firstName })}</EyebrowLabel>
              {horoscopeLoading || teaser === null ? (
                <DotsLoader />
              ) : (
                <>
                  <Text style={[styles.todayQuote, indic && styles.todayQuoteIndic, { color: theme.ink }]}>“{teaser}”</Text>
                  <Text style={[styles.link, { color: theme.accent }]}>{t('today.readLink')}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={[styles.skyRow, { borderTopColor: theme.hairline }]}>
              <View style={[styles.skyCell, { borderRightColor: theme.hairline }]}>
                <Text style={[styles.skyLabel, { color: theme.muted }]}>{t('today.moonIn')}</Text>
                <Text style={[styles.skyValue, { color: theme.ink }]}>{tNakshatra(panchang.nakshatra.name)}</Text>
              </View>
              <View style={[styles.skyCell, styles.skyCellLast]}>
                <Text style={[styles.skyLabel, { color: theme.muted }]}>{t('today.tithi')}</Text>
                <Text style={[styles.skyValue, { color: theme.ink }]}>{tTithi(panchang.tithi.name)}</Text>
              </View>
            </View>

            {life && chapter && sub && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push(`/phase/${activeProfile.id}`)}
                style={[styles.phase, { borderTopColor: theme.hairline, backgroundColor: theme.surface2 }]}
                accessibilityLabel={t('a11y.phase', { lord: tPlanet(chapter.lord), pct })}
              >
                <View style={styles.phaseHead}>
                  <EyebrowLabel size={11}>{t('phase.eyebrow')}</EyebrowLabel>
                  <Text style={[styles.phaseMeta, { color: theme.ink2 }]}>{t('phase.through', { pct })}</Text>
                </View>
                <Text style={[styles.phaseTitle, indic && styles.phaseTitleIndic, { color: theme.ink }]}>
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
            <View style={styles.chips}>
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
            </View>
          </View>
        )}

        {/* Explore */}
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

const styles = StyleSheet.create({
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
    gap:               26,
  },
  greeting: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      42,
    lineHeight:    44,
    letterSpacing: -0.5,
    marginTop:     8,
  },
  greetingIndic: { lineHeight: 58 },
  italic: { fontFamily: FONTS.serifItalic },

  todayCard: {
    borderRadius: RADIUS.card + 4,
    borderWidth:  StyleSheet.hairlineWidth,
    overflow:     'hidden',
  },
  todayTop: {
    padding: 20,
    gap:     10,
  },
  todayQuote: {
    fontFamily: FONTS.serifRegular,
    fontSize:   25,
    lineHeight: 30,
  },
  todayQuoteIndic: { lineHeight: 36 },
  link: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14,
  },
  skyRow: {
    flexDirection:  'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  skyCell: {
    flex:             1,
    paddingVertical:  14,
    paddingHorizontal: 20,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  skyCellLast: { borderRightWidth: 0 },
  skyLabel: {
    fontFamily: FONTS.sansRegular,
    fontSize:   11,
  },
  skyValue: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
    marginTop:  2,
  },
  phase: {
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     20,
    gap:               10,
    borderTopWidth:    StyleSheet.hairlineWidth,
  },
  phaseHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'baseline',
  },
  phaseMeta: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
  },
  phaseTitle: {
    fontFamily: FONTS.serifRegular,
    fontSize:   22,
    lineHeight: 26,
  },
  phaseTitleIndic: { lineHeight: 32 },
  phaseUntil: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
  },
  track: {
    height:       6,
    borderRadius: 3,
    overflow:     'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
  phaseSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
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
  chips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
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
    marginTop:     -16, // sits 10pt under the grid, like the tile gap
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
  starterCard: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       18,
    borderRadius:  RADIUS.card,
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
  starterTitle: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     20,
    lineHeight:   24,
    marginBottom: 4,
  },
  starterSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
  },
});
