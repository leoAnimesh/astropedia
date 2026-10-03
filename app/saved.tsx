import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS, RADIUS } from '@/constants/themes';
import { getAllThreads, getSavedAnswers, unsaveAnswer, type SavedAnswer } from '@/utils/database';
import { stripMarkdown } from '@/utils/ai';
import { intlLocale } from '@/utils/i18n';

type Filter = 'all' | 'saga' | 'krishna';

// Labels come from saved:filters.<id>.
const FILTERS: Filter[] = ['all', 'saga', 'krishna'];

/** SQLite `datetime('now')` is UTC without a zone marker — read it as UTC. */
function parseDbDate(s: string): Date {
  if (!s) return new Date(NaN);
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  return new Date(iso);
}

function savedWhen(s: string, t: TFunction): string {
  const d = parseDbDate(s);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return t('today');
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return t('yesterday');
  return d.toLocaleDateString(intlLocale(), {
    month: 'short',
    day:   'numeric',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

export default function SavedAnswersScreen() {
  const { theme }    = useAccent();
  const { t, i18n }  = useTranslation('saved');
  const indic        = i18n.language !== 'en';
  const { profiles } = useProfiles();

  const [items, setItems]         = useState<SavedAnswer[]>([]);
  const [threadIds, setThreadIds] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded]       = useState(false);
  const [filter, setFilter]       = useState<Filter>('all');

  // Reload on focus — answers can be saved/unsaved from a chat in between.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([getSavedAnswers(), getAllThreads()])
        .then(([saved, threads]) => {
          if (!alive) return;
          setItems(saved);
          setThreadIds(new Set(threads.map((t) => t.id)));
        })
        .catch(() => {})
        .finally(() => alive && setLoaded(true));
      return () => { alive = false; };
    }, []),
  );

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.persona === filter)),
    [items, filter],
  );

  const nameFor = (a: SavedAnswer): string => {
    const p = profiles.find((x) => x.id === a.profileId);
    return p?.name ?? '';
  };

  const handleUnsave = (a: SavedAnswer) => {
    setItems((prev) => prev.filter((i) => i.messageId !== a.messageId));
    unsaveAnswer(a.messageId).catch(() => {});
  };

  const handleShare = (a: SavedAnswer) => {
    router.push({
      pathname: '/share-answer',
      params: {
        question:    a.question,
        answer:      stripMarkdown(a.answer),
        persona:     a.persona,
        profileName: nameFor(a),
      },
    });
  };

  const handleOpen = (a: SavedAnswer) => {
    if (!a.threadId || !threadIds.has(a.threadId)) return;
    router.push(`/chat/${a.threadId}?profileId=${a.profileId}`);
  };

  const renderItem = ({ item }: { item: SavedAnswer }) => {
    const who      = item.persona === 'krishna' ? t('filters.krishna') : t('filters.saga');
    const name     = item.persona === 'saga' ? nameFor(item) : '';
    const canOpen  = !!item.threadId && threadIds.has(item.threadId);
    return (
      <TouchableOpacity
        activeOpacity={canOpen ? 0.7 : 1}
        onPress={() => handleOpen(item)}
        disabled={!canOpen}
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
        accessibilityHint={canOpen ? t('a11y.openHint') : undefined}
      >
        <View style={styles.cardTop}>
          <EyebrowLabel style={{ flex: 1 }}>
            {who}{name ? ` · ${name.split(' ')[0]}` : ''}
          </EyebrowLabel>
          <Text style={[styles.when, { color: theme.muted }]}>{savedWhen(item.createdAt, t)}</Text>
        </View>
        {item.question ? (
          <Text style={[styles.question, { color: theme.muted }]} numberOfLines={2}>
            {item.question}
          </Text>
        ) : null}
        <Text style={[styles.answer, { color: theme.ink }]} numberOfLines={6}>
          {stripMarkdown(item.answer)}
        </Text>

        <View style={[styles.cardActions, { borderTopColor: theme.hairline }]}>
          {canOpen ? (
            <Text style={[styles.openText, { color: theme.accent }]}>{t('openChat')}</Text>
          ) : (
            <Text style={[styles.openText, { color: theme.faint }]}>{t('chatDeleted')}</Text>
          )}
          <View style={styles.iconRow}>
            <TouchableOpacity
              onPress={() => handleShare(item)}
              style={styles.iconBtn}
              accessibilityLabel={t('a11y.share')}
            >
              <Icon name="share" size={17} color={theme.ink2} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleUnsave(item)}
              style={styles.iconBtn}
              accessibilityLabel={t('a11y.remove')}
            >
              <Icon name="bookmark-filled" size={17} color={theme.accent} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.back, { borderColor: theme.hairline2 }]}
          accessibilityLabel={t('back')}
        >
          <Icon name="back" size={20} color={theme.ink} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.top}>
            <EyebrowLabel size={11}>
              {t('count', { count: items.length })}
            </EyebrowLabel>
            <Text style={[styles.title, indic && styles.titleIndic, { color: theme.ink }]}>
              <Trans t={t} i18nKey="title" components={{ em: <Text style={styles.titleItalic} /> }} />
            </Text>
            <View style={styles.filters}>
              {FILTERS.map((f) => {
                const on = f === filter;
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFilter(f)}
                    style={[
                      styles.pill,
                      on
                        ? { backgroundColor: theme.ink, borderColor: theme.ink }
                        : { backgroundColor: theme.surface, borderColor: theme.hairline2 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.pillText, { color: on ? theme.bg : theme.ink }]}>{t(`filters.${f}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Icon name="bookmark" size={22} color={theme.faint} />
              <Text style={[styles.emptyTitle, { color: theme.ink }]}>
                <Trans t={t} i18nKey={`empty.${filter}`} components={{ em: <Text style={styles.titleItalic} /> }} />
              </Text>
              <Text style={[styles.emptySub, { color: theme.muted }]}>
                {t('empty.sub')}
              </Text>
            </View>
          ) : null
        }
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop:        8,
  },
  back: {
    width:          44,
    height:         44,
    borderRadius:   22,
    borderWidth:    StyleSheet.hairlineWidth,
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom:     40,
    gap:               12,
  },
  top: {
    paddingTop:    12,
    paddingBottom: 6,
  },
  title: {
    fontFamily: FONTS.serifRegular,
    fontSize:   36,
    lineHeight: 40,
    marginTop:  6,
  },
  titleIndic:  { lineHeight: 50 },
  titleItalic: { fontFamily: FONTS.serifItalic },
  filters: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginTop:     16,
  },
  pill: {
    minHeight:         38,
    paddingHorizontal: 16,
    borderRadius:      RADIUS.pill,
    borderWidth:       StyleSheet.hairlineWidth,
    justifyContent:    'center',
  },
  pillText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
  },
  card: {
    borderRadius: RADIUS.card + 2,
    borderWidth:  StyleSheet.hairlineWidth,
    paddingTop:   16,
    paddingHorizontal: 18,
    gap:          8,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  when: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
  },
  question: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
  },
  answer: {
    fontFamily: FONTS.serifRegular,
    fontSize:   19,
    lineHeight: 25,
  },
  cardActions: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop:      6,
    minHeight:      48,
  },
  openText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
  },
  iconRow: {
    flexDirection: 'row',
    marginRight:   -10,
  },
  iconBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems:      'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap:             8,
  },
  emptyTitle: {
    fontFamily: FONTS.serifRegular,
    fontSize:   24,
    textAlign:  'center',
    marginTop:  4,
  },
  emptySub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    lineHeight: 20,
    textAlign:  'center',
  },
});
