import { StyleSheet, Text, TouchableOpacity, View, FlatList } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useAllArchivedThreads } from '@/hooks/use-threads';
import { useProfileStore } from '@/stores/profile-store';
import { SwipeRow } from '@/components/molecules/SwipeRow';
import { Avatar } from '@/components/atoms/Avatar';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS } from '@/constants/themes';
import { formatRelativeTime } from '@/utils/format';
import type { Thread } from '@/utils/database';

export default function ArchivedScreen() {
  const { theme } = useAccent();
  const { archived, unarchiveThread, removeThread } = useAllArchivedThreads();
  const profiles = useProfileStore((s) => s.profiles);

  const renderItem = ({ item: t }: { item: Thread }) => {
    const profile = profiles.find((p) => p.id === t.profileId);
    if (!profile) return null;

    return (
      <SwipeRow
        actions={[
          {
            label:    'Unarchive',
            color:    '#5E9970',
            onAction: () => unarchiveThread(t),
          },
          {
            label:    'Delete',
            color:    '#C44444',
            onAction: () => removeThread(t),
          },
        ]}
        onPress={() => router.push(`/chat/${t.id}?profileId=${t.profileId}`)}
        rowStyle={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }}
      >
        <View style={[styles.row, { backgroundColor: theme.bg }]}>
          <Avatar name={profile.name} size={40} />
          <View style={styles.text}>
            <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
              {t.title ?? 'Conversation'}
            </Text>
            <Text style={[styles.sub, { color: theme.muted }]} numberOfLines={1}>
              {profile.name}
            </Text>
          </View>
          <Text style={[styles.time, { color: theme.faint }]}>
            {t.archivedAt ? formatRelativeTime(new Date(t.archivedAt).getTime()) : ''}
          </Text>
        </View>
      </SwipeRow>
    );
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <EyebrowLabel>Archive</EyebrowLabel>
      </View>

      <Text style={[styles.pageTitle, { color: theme.ink }]}>
        <Text style={styles.italic}>Archived</Text>
      </Text>

      {archived.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            No archived chats.{'\n'}Swipe a conversation on Home to archive it.
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Swipe a row left to unarchive or delete.
          </Text>
          <FlatList
            data={archived}
            keyExtractor={(t) => t.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    paddingHorizontal: 20,
    paddingTop:     16,
    paddingBottom:  4,
  },
  back: {
    padding: 4,
  },
  pageTitle: {
    fontFamily:       FONTS.serifRegular,
    fontSize:         36,
    paddingHorizontal: 26,
    marginTop:        8,
    marginBottom:     6,
  },
  italic: {
    fontFamily: FONTS.serifItalic,
  },
  hint: {
    fontFamily:       FONTS.sansRegular,
    fontSize:         13.5,
    lineHeight:       20,
    paddingHorizontal: 26,
    marginBottom:     14,
  },
  list: {
    paddingHorizontal: 26,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 12,
  },
  text: {
    flex:     1,
    minWidth: 0,
  },
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
    fontFamily:  FONTS.sansRegular,
    fontSize:    15,
    lineHeight:  22,
    textAlign:   'center',
  },
});
