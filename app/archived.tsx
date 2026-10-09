'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAccent } from '@/hooks/use-accent';
import { useAllArchivedThreads } from '@/hooks/use-threads';
import { useProfileStore } from '@/stores/profile-store';
import { SwipeRow } from '@/components/molecules/SwipeRow';
import { Avatar } from '@/components/atoms/Avatar';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS } from '@/constants/themes';
import { GURUS, PROFILE_GURUS, type AgentId } from '@/constants/gurus';
import type { Thread } from '@/utils/database';
import { KRISHNA_PROFILE_ID } from '@/utils/krishna';
import { useIndicStyles } from '@/hooks/use-indic-styles';

/** "just now" / "5m ago" / "3h ago" / "2d ago" in the app language. */
function relativeTime(ts: number, t: TFunction): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60)    return t('time.justNow');
  if (s < 3600)  return t('time.minutes', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hours',   { n: Math.floor(s / 3600) });
  return t('time.days', { n: Math.floor(s / 86400) });
}

const SECTION_ORDER: AgentId[] = [...PROFILE_GURUS, 'krishna'];

/**
 * Past conversations (formerly "Archived"): chats moved out by "Start over"
 * and the older chats from before guru chats, grouped by guru. Read-only;
 * each opens with "Continue in <guru>". Swipe to delete.
 */
export default function PastConversationsScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t: tr } = useTranslation('chat');
  const { archived, removeThread } = useAllArchivedThreads();
  const profiles = useProfileStore((s) => s.profiles);

  const visible = archived.filter((x) => x.profileId === KRISHNA_PROFILE_ID || profiles.some((p) => p.id === x.profileId));
  const sections = SECTION_ORDER
    .map((agent) => ({
      agent,
      data: visible
        .filter((x) => x.agent === agent)
        .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')),
    }))
    .filter((s) => s.data.length > 0);

  const renderItem = ({ item: th }: { item: Thread }) => {
    const isKrishna = th.profileId === KRISHNA_PROFILE_ID;
    const profile = profiles.find((p) => p.id === th.profileId);
    const who = isKrishna ? tr('gurus.krishna.name') : profile?.name ?? '';
    const title = th.title ?? tr('archived.fallbackTitle');
    const when = th.archivedAt ? relativeTime(new Date(th.archivedAt).getTime(), tr) : '';
    return (
      <SwipeRow
        actions={[
          { label: tr('archived.delete'), color: '#C44444', onAction: () => removeThread(th) },
        ]}
        onPress={() => router.push(`/chat/${th.id}?profileId=${th.profileId}`)}
        rowStyle={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }}
      >
        <View
          style={[styles.row, { backgroundColor: theme.bg }]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={[title, who, when].filter(Boolean).join(', ')}
          accessibilityHint={tr('archived.a11yHint')}
        >
          {isKrishna ? (
            <View style={[styles.krishna, { backgroundColor: 'rgba(180,130,0,0.10)' }]}>
              <Icon name="lotus" size={18} color={theme.accent} />
            </View>
          ) : (
            <Avatar name={who || '?'} size={40} />
          )}
          <View style={styles.text}>
            <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>{title}</Text>
            <Text style={[styles.sub, { color: theme.muted }]} numberOfLines={1}>
              {th.lastMessagePreview ?? who}
            </Text>
          </View>
          <Text style={[styles.time, { color: theme.faint }]}>{when}</Text>
        </View>
      </SwipeRow>
    );
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel={tr('archived.back')}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <EyebrowLabel>{tr('archived.eyebrow')}</EyebrowLabel>
      </View>

      <Text style={[styles.pageTitle, { color: theme.ink }]} accessibilityRole="header">
        <Text style={styles.italic}>{tr('archived.title')}</Text>
      </Text>

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.muted }]}>{tr('archived.empty')}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={<Text style={[styles.hint, { color: theme.muted }]}>{tr('archived.hint')}</Text>}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <Icon name={GURUS[section.agent].icon} size={14} color={theme.accent} />
              <EyebrowLabel>{tr(`gurus.${section.agent}.name`)}</EyebrowLabel>
            </View>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     4,
  },
  back: { padding: 4 },
  pageTitle: {
    fontFamily:        FONTS.serifRegular,
    fontSize:          36,
    paddingHorizontal: 26,
    marginTop:         8,
    marginBottom:      6,
  },
  italic: { fontFamily: FONTS.serifItalic },
  hint: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     13.5,
    lineHeight:   20,
    marginBottom: 4,
  },
  list: {
    paddingHorizontal: 26,
    paddingBottom:     40,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    paddingTop:    18,
    paddingBottom: 8,
  },
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    paddingVertical: 12,
  },
  krishna: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  title: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      15,
    letterSpacing: -0.1,
  },
  sub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    marginTop:  1,
  },
  time: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.3,
    flexShrink:    0,
  },
  empty: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        40,
  },
  emptyText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
    lineHeight: 22,
    textAlign:  'center',
  },
});
