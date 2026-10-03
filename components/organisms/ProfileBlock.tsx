import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useAstrology } from '@/hooks/use-astrology';
import { SwipeRow } from '@/components/molecules/SwipeRow';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { FONTS } from '@/constants/themes';
import { formatRelativeTime } from '@/utils/format';
import { tSign } from '@/utils/i18n';
import type { Profile, Thread } from '@/utils/database';

type Props = {
  profile: Profile;
  threads: Thread[];
  onOpenKundli: () => void;
  onOpenThread: (thread: Thread) => void;
  onArchiveThread: (thread: Thread) => void;
};

export function ProfileBlock({
  profile,
  threads,
  onOpenKundli,
  onOpenThread,
  onArchiveThread,
}: Props) {
  const { theme } = useAccent();
  const { t: tr } = useTranslation('profile');
  const { sunSign } = useAstrology(profile);
  const active = threads.filter((t) => !t.archived);

  const lastMsg = (t: Thread) =>
    t.lastMessagePreview ?? tr('block.tapToStart');

  return (
    <View style={styles.container}>
      {/* Kundli pinned row */}
      <TouchableOpacity
        style={styles.kundliRow}
        onPress={onOpenKundli}
        activeOpacity={0.75}
      >
        <View style={[styles.kundliIcon, { backgroundColor: theme.accent }]}>
          <Text style={[styles.kundliGlyph, { color: theme.accentFg }]}>
            {sunSign?.glyph ?? '✦'}
          </Text>
        </View>
        <View style={styles.kundliText}>
          <Text style={[styles.kundliTitle, { color: theme.ink }]}>{tr('block.kundliTitle')}</Text>
          <Text style={[styles.kundliSub, { color: theme.muted }]}>
            {sunSign
              ? `${tSign(sunSign.name)} · ${tr(`common:element.${sunSign.element}`)}`
              : tr('detail.noBirthDate')}
          </Text>
        </View>
        <EyebrowLabel>{tr('block.pinned')}</EyebrowLabel>
      </TouchableOpacity>

      {/* Conversation rows */}
      {active.map((t) => (
        <SwipeRow
          key={t.id}
          actions={[
            {
              label:    tr('common:archive'),
              color:    '#7B9B6B',
              onAction: () => onArchiveThread(t),
            },
          ]}
          onPress={() => onOpenThread(t)}
          rowStyle={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }}
        >
          <View style={[styles.threadRow, { backgroundColor: theme.bg }]}>
            <View style={[styles.threadIcon, { backgroundColor: theme.surface2 }]}>
              <Text style={{ fontSize: 14, color: theme.accent }}>✦</Text>
            </View>
            <View style={styles.threadText}>
              <Text
                style={[styles.threadTitle, { color: theme.ink }]}
                numberOfLines={1}
              >
                {t.title ?? tr('block.conversation')}
              </Text>
              <Text
                style={[styles.threadSub, { color: theme.muted }]}
                numberOfLines={1}
              >
                {lastMsg(t)}
              </Text>
            </View>
            <Text style={[styles.threadTime, { color: theme.faint }]}>
              {formatRelativeTime(new Date(t.createdAt).getTime())}
            </Text>
          </View>
        </SwipeRow>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  kundliRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 10,
  },
  kundliIcon: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  kundliGlyph: {
    fontSize: 18,
  },
  kundliText: {
    flex: 1,
    minWidth: 0,
  },
  kundliTitle: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      15,
    letterSpacing: -0.1,
  },
  kundliSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    marginTop:  1,
  },
  threadRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 10,
  },
  threadIcon: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  threadText: {
    flex:     1,
    minWidth: 0,
  },
  threadTitle: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      15,
    letterSpacing: -0.1,
  },
  threadSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    marginTop:  1,
  },
  threadTime: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.3,
    flexShrink:    0,
  },
});
