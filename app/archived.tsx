import { StyleSheet, Text, TouchableOpacity, View, FlatList } from 'react-native';
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
import type { Thread } from '@/utils/database';
import { useIndicStyles } from '@/hooks/use-indic-styles';

/** "just now" / "5m ago" / "3h ago" / "2d ago" in the app language. */
function relativeTime(ts: number, t: TFunction): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60)    return t('time.justNow');
  if (s < 3600)  return t('time.minutes', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hours',   { n: Math.floor(s / 3600) });
  return t('time.days', { n: Math.floor(s / 86400) });
}

export default function ArchivedScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t: tr } = useTranslation('chat');
  const { archived, unarchiveThread, removeThread } = useAllArchivedThreads();
  const profiles = useProfileStore((s) => s.profiles);

  const renderItem = ({ item: t }: { item: Thread }) => {
    const profile = profiles.find((p) => p.id === t.profileId);
    if (!profile) return null;

    return (
      <SwipeRow
        actions={[
          {
            label:    tr('archived.unarchive'),
            color:    '#5E9970',
            onAction: () => unarchiveThread(t),
          },
          {
            label:    tr('archived.delete'),
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
              {t.title ?? tr('archived.fallbackTitle')}
            </Text>
            <Text style={[styles.sub, { color: theme.muted }]} numberOfLines={1}>
              {profile.name}
            </Text>
          </View>
          <Text style={[styles.time, { color: theme.faint }]}>
            {t.archivedAt ? relativeTime(new Date(t.archivedAt).getTime(), tr) : ''}
          </Text>
        </View>
      </SwipeRow>
    );
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel={tr('archived.back')}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <EyebrowLabel>{tr('archived.eyebrow')}</EyebrowLabel>
      </View>

      <Text style={[styles.pageTitle, { color: theme.ink }]}>
        <Text style={styles.italic}>{tr('archived.title')}</Text>
      </Text>

      {archived.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            {tr('archived.empty')}
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.hint, { color: theme.muted }]}>
            {tr('archived.hint')}
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

const baseStyles = StyleSheet.create({
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
