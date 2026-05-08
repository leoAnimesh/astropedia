import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useThreads } from '@/hooks/use-threads';
import { useHoroscope } from '@/hooks/use-horoscope';
import { ProfileSwitcherTrigger, ProfileSwitcherSheet } from '@/components/organisms/ProfileSwitcher';
import { ProfileBlock } from '@/components/organisms/ProfileBlock';
import { VedicLoadingOverlay } from '@/components/organisms/VedicLoadingOverlay';
import { DailyTeaser } from '@/components/molecules/DailyTeaser';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon } from '@/components/atoms/Icon';
import { FONTS } from '@/constants/themes';
import { greeting, todayShort } from '@/utils/format';
import type { Thread } from '@/utils/database';

export default function HomeScreen() {
  const { theme } = useAccent();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const { activeThreads, archiveThread } = useThreads(activeProfile?.id ?? null);
  const { text: horoscopeText, loading: horoscopeLoading } = useHoroscope(activeProfile);

  const handleNewChat = () => {
    if (!activeProfile) return;
    const tempId = 't_' + Math.random().toString(36).slice(2, 11);
    router.push(`/chat/${tempId}?profileId=${activeProfile.id}&isNew=true`);
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

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <ProfileSwitcherTrigger
          profile={activeProfile}
          onPress={() => setSwitcherOpen(true)}
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
        visible={switcherOpen}
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        onSelect={(p) => setActiveProfile(p.id)}
        onCreateNew={() => router.push('/profile/new')}
        onClose={() => setSwitcherOpen(false)}
      />

      {/* Full-screen vedic loading overlay — covers everything until model is ready */}
      <VedicLoadingOverlay />
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
