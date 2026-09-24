import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useThreads } from '@/hooks/use-threads';
import { useHoroscope } from '@/hooks/use-horoscope';
import { ProfileSwitcherTrigger, ProfileSwitcherSheet, type ProfileSwitcherSheetRef } from '@/components/organisms/ProfileSwitcher';
import { ProfileBlock } from '@/components/organisms/ProfileBlock';
import { DailyTeaser } from '@/components/molecules/DailyTeaser';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';
import { greeting, todayShort } from '@/utils/format';
import { Storage } from '@/utils/storage';
import type { Thread } from '@/utils/database';
import { KRISHNA_PROFILE_ID } from '@/utils/krishna';

const STARTER_BY_INTENT: Record<string, { title: string; sub: string }> = {
  love:    { title: 'Start with love & connection', sub: 'A first read on your relationships, in plain English.' },
  career:  { title: 'Start with career & purpose',  sub: 'What your chart hints at for the work ahead.' },
  self:    { title: 'Start with knowing yourself',  sub: 'The one thing about you Saga would say first.' },
  curious: { title: 'Take a quick look around',     sub: 'Ask anything — Saga can meet you where you are.' },
};

export default function HomeScreen() {
  const { theme } = useAccent();
  const switcherRef = useRef<ProfileSwitcherSheetRef>(null);

  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const { activeThreads, archiveThread } = useThreads(activeProfile?.id ?? null);
  const { text: horoscopeText, loading: horoscopeLoading } = useHoroscope(activeProfile);
  const [starterIntent, setStarterIntent] = useState<string | null>(Storage.getStarterIntent());

  const starterCopy = starterIntent ? STARTER_BY_INTENT[starterIntent] : null;

  const handleNewChat = () => {
    if (!activeProfile) return;
    if (starterIntent) {
      Storage.clearStarterIntent();
      setStarterIntent(null);
    }
    const tempId = 't_' + Math.random().toString(36).slice(2, 11);
    router.push(`/chat/${tempId}?profileId=${activeProfile.id}&isNew=true`);
  };

  const handleDismissStarter = () => {
    Storage.clearStarterIntent();
    setStarterIntent(null);
  };

  const handleOpenThread = (t: Thread) => {
    if (!activeProfile) return;
    router.push(`/chat/${t.id}?profileId=${activeProfile.id}`);
  };

  const handleOpenKundli = () => {
    if (!activeProfile) return;
    router.push(`/profile/${activeProfile.id}`);
  };

  const handleOpenHoroscope = () => {
    if (!activeProfile) return;
    router.push(`/horoscope/${activeProfile.id}`);
  };

  const { activeThreads: krishnaThreads } = useThreads(KRISHNA_PROFILE_ID);

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

  const handleOpenPanchang = () => {
    router.push('/panchang');
  };

  const handleOpenCompatibility = () => {
    router.push('/compatibility');
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <ProfileSwitcherTrigger
          profile={activeProfile}
          onPress={() => switcherRef.current?.present()}
        />
        <View style={styles.headerSpacer} />
        <TouchableOpacity onPress={() => router.push('/(app)/settings')}>
          <Icon name="settings" size={20} color={theme.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <Text style={[styles.greeting, { color: theme.ink }]}>
          {greeting()},{'\n'}
          <Text style={styles.greetingItalic}>
            {(activeProfile?.name ?? 'friend').split(' ')[0]}.
          </Text>
        </Text>

        {/* Empty-state when no profiles exist (post-reset or corrupted DB). */}
        {profiles.length === 0 && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/profile/new')}
            style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
          >
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>
              Add a <Text style={styles.greetingItalic}>chart</Text> to begin
            </Text>
            <Text style={[styles.emptySub, { color: theme.muted }]}>
              Your daily reading, conversations with Saga, and compatibility readings all start here.
            </Text>
          </TouchableOpacity>
        )}

        {/* Onboarding starter — shown until first chat is opened or dismissed */}
        {starterCopy && activeProfile && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleNewChat}
            style={[styles.starterCard, { backgroundColor: theme.accent }]}
          >
            <View style={{ flex: 1 }}>
              <EyebrowLabel size={9} style={{ color: theme.accentFg, opacity: 0.7, marginBottom: 6 }}>
                Saga&apos;s been waiting
              </EyebrowLabel>
              <Text style={[styles.starterTitle, { color: theme.accentFg }]}>{starterCopy.title}</Text>
              <Text style={[styles.starterSub, { color: theme.accentFg, opacity: 0.78 }]}>{starterCopy.sub}</Text>
            </View>
            <TouchableOpacity onPress={handleDismissStarter} hitSlop={12} style={{ marginLeft: 8 }}>
              <Icon name="close" size={16} color={theme.accentFg} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* Daily horoscope teaser */}
        {activeProfile?.birthDate && (
          <TouchableOpacity activeOpacity={0.85} onPress={handleOpenHoroscope}>
            <DailyTeaser
              text={horoscopeText}
              loading={horoscopeLoading}
              label={`${todayShort()} · Daily for ${activeProfile.name.split(' ')[0]}`}
            />
          </TouchableOpacity>
        )}

        {/* Talk to Krishna tile */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleTalkToKrishna}
          style={[
            styles.krishnaCard,
            { backgroundColor: theme.surface, borderColor: theme.hairline },
          ]}
        >
          <View style={[styles.krishnaIcon, { backgroundColor: 'rgba(180,130,0,0.10)' }]}>
            <Icon name="lotus" size={20} color={theme.accent} />
          </View>
          <View style={styles.krishnaText}>
            <Text style={[styles.krishnaTitle, { color: theme.ink }]}>
              Talk to <Text style={styles.krishnaTitleItalic}>Krishna</Text>
            </Text>
            <Text style={[styles.krishnaSub, { color: theme.muted }]}>
              A quiet conversation with a friend who&apos;s heard everything before.
            </Text>
          </View>
          <Icon name="chevron" size={16} color={theme.muted} />
        </TouchableOpacity>

        {/* Panchang tile */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOpenPanchang}
          style={[
            styles.krishnaCard,
            { backgroundColor: theme.surface, borderColor: theme.hairline },
          ]}
        >
          <View style={[styles.krishnaIcon, { backgroundColor: 'rgba(180,130,0,0.10)' }]}>
            <Icon name="sparkle" size={20} color={theme.accent} />
          </View>
          <View style={styles.krishnaText}>
            <Text style={[styles.krishnaTitle, { color: theme.ink }]}>
              Today&apos;s <Text style={styles.krishnaTitleItalic}>Panchang</Text>
            </Text>
            <Text style={[styles.krishnaSub, { color: theme.muted }]}>
              Tithi, nakshatra, sunrise, and the right times to begin or pause.
            </Text>
          </View>
          <Icon name="chevron" size={16} color={theme.muted} />
        </TouchableOpacity>

        {/* Compatibility tile — only when there are at least two profiles */}
        {profiles.length >= 2 && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOpenCompatibility}
            style={[
              styles.krishnaCard,
              { backgroundColor: theme.surface, borderColor: theme.hairline },
            ]}
          >
            <View style={[styles.krishnaIcon, { backgroundColor: 'rgba(180,130,0,0.10)' }]}>
              <Icon name="person" size={20} color={theme.accent} />
            </View>
            <View style={styles.krishnaText}>
              <Text style={[styles.krishnaTitle, { color: theme.ink }]}>
                <Text style={styles.krishnaTitleItalic}>Compatibility</Text> reading
              </Text>
              <Text style={[styles.krishnaSub, { color: theme.muted }]}>
                See how two charts meet — partner, family, friend.
              </Text>
            </View>
            <Icon name="chevron" size={16} color={theme.muted} />
          </TouchableOpacity>
        )}

        {/* Conversations section */}
        <View style={styles.sectionHeader}>
          <EyebrowLabel>Conversations</EyebrowLabel>
          <TouchableOpacity onPress={() => router.push('/profile/new')}>
            <Text style={[styles.addLink, { color: theme.muted }]}>+ Add profile</Text>
          </TouchableOpacity>
        </View>

        {activeProfile && (
          <ProfileBlock
            profile={activeProfile}
            threads={activeThreads}
            onOpenKundli={handleOpenKundli}
            onOpenThread={handleOpenThread}
            onArchiveThread={(t) => archiveThread(t.id)}
          />
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating chat button */}
      {activeProfile && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.accent }]}
          onPress={handleNewChat}
          activeOpacity={0.85}
        >
          <Icon name="chat" size={22} color={theme.accentFg} />
        </TouchableOpacity>
      )}

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
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingHorizontal: 26,
    paddingTop:     16,
    paddingBottom:  14,
  },
  headerSpacer: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 26,
    paddingTop:        6,
  },
  greeting: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     40,
    lineHeight:   44,
    marginTop:    14,
    marginBottom: 22,
  },
  greetingItalic: {
    fontFamily: FONTS.serifItalic,
  },
  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'baseline',
    justifyContent: 'space-between',
    marginBottom:   10,
  },
  addLink: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  krishnaCard: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              14,
    padding:          16,
    borderRadius:     RADIUS.card,
    borderWidth:      StyleSheet.hairlineWidth,
    marginBottom:     22,
  },
  krishnaIcon: {
    width:           40,
    height:          40,
    borderRadius:    20,
    alignItems:      'center',
    justifyContent:  'center',
  },
  krishnaText: { flex: 1, minWidth: 0 },
  krishnaTitle: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     19,
    lineHeight:   23,
    marginBottom: 2,
  },
  krishnaTitleItalic: { fontFamily: FONTS.serifItalic },
  krishnaSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
  },
  starterCard: {
    flexDirection:    'row',
    alignItems:       'center',
    padding:          18,
    borderRadius:     RADIUS.card,
    marginBottom:     18,
  },
  emptyCard: {
    padding:      20,
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    marginBottom: 18,
  },
  emptyTitle: {
    fontFamily: FONTS.serifRegular,
    fontSize:   22,
    lineHeight: 28,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    lineHeight: 19,
  },
  starterTitle: {
    fontFamily: FONTS.serifRegular,
    fontSize:   20,
    lineHeight: 24,
    marginBottom: 4,
  },
  starterSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
  },
  fab: {
    position:       'absolute',
    right:          22,
    bottom:         32,
    width:          60,
    height:         60,
    borderRadius:   30,
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.18,
    shadowRadius:   12,
    elevation:      8,
  },
});
