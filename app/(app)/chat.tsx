'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { useGuruChats, type GuruChatRow } from '@/hooks/use-guru-chats';
import { useThreadStore } from '@/stores/thread-store';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { ProfileSwitcherSheet, ProfileSwitcherTrigger, type ProfileSwitcherSheetRef } from '@/components/organisms/ProfileSwitcher';
import { GuruNoticeSheet, type GuruNoticeSheetRef } from '@/components/organisms/GuruNoticeSheet';
import { FONTS, RADIUS } from '@/constants/themes';
import { GURUS } from '@/constants/gurus';
import { countSavedAnswers } from '@/utils/database';
import { intlLocale, localizeDigits } from '@/utils/i18n';
import { guruLocked } from '@/utils/guru-context';
import { openGuruChat } from '@/utils/guru-nav';
import { KRISHNA_PROFILE_ID } from '@/utils/krishna';
import { Storage } from '@/utils/storage';

const TILE_BG = 'rgba(180,130,0,0.10)';

/** "12m", "2h", "Yesterday", "Mon", "3 Oct" in the app language. */
function shortWhen(d: Date | null, t: TFunction): string {
  if (!d) return '';
  const now = new Date();
  const mins = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60000));
  if (d.toDateString() === now.toDateString()) {
    if (mins < 1) return t('tab.when.now');
    if (mins < 60) return t('tab.when.minutes', { n: mins });
    return t('tab.when.hours', { n: Math.floor(mins / 60) });
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return t('tab.when.yesterday');
  const days = (now.getTime() - d.getTime()) / 86400000;
  const opts: Intl.DateTimeFormatOptions = days < 6 ? { weekday: 'short' } : { day: 'numeric', month: 'short' };
  return localizeDigits(d.toLocaleDateString(intlLocale(), opts));
}

export default function ChatTabScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('chat');
  const switcherRef = useRef<ProfileSwitcherSheetRef>(null);
  const noticeRef = useRef<GuruNoticeSheetRef>(null);

  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const { gurus, krishna } = useGuruChats(activeProfile?.id ?? null);
  const firstName = activeProfile?.name.split(' ')[0] ?? '';

  // Past conversations: archived chats of people who still exist, and Krishna's.
  const pastCount = useThreadStore((s) =>
    Object.entries(s.threads).reduce((n, [pid, list]) =>
      n + (pid === KRISHNA_PROFILE_ID || profiles.some((p) => p.id === pid) ? list.filter((x) => x.archived).length : 0), 0),
  );
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      countSavedAnswers().then(setSavedCount).catch(() => {});
      // The one-time "organised by guru" notice (upgrades that moved chats only).
      if (Storage.getGuruNoticePending() && !Storage.getGuruNoticeSeen()) {
        const timer = setTimeout(() => noticeRef.current?.present(), 350);
        return () => clearTimeout(timer);
      }
    }, []),
  );

  const closeNotice = () => {
    Storage.setGuruNoticePending(false);
    Storage.setGuruNoticeSeen(true);
  };

  const renderRow = (row: GuruChatRow, i: number, last: boolean, standalone = false) => {
    const spec = GURUS[row.agent];
    const name = t(`gurus.${row.agent}.name`);
    const locked = row.agent !== 'krishna' && guruLocked(row.agent, activeProfile?.birthDate);
    const empty = !row.preview;
    const when = locked ? '' : empty ? t('tab.newChat') : shortWhen(row.when, t);
    const preview = locked ? t('tab.forAdults') : row.preview ?? t(`gurus.${row.agent}.line`);
    const open = () => openGuruChat(row.agent, row.agent === 'krishna' ? null : activeProfile?.id);
    return (
      <TouchableOpacity
        key={row.agent}
        activeOpacity={0.7}
        onPress={open}
        style={[
          styles.row,
          standalone
            ? [styles.standalone, { backgroundColor: theme.surface, borderColor: theme.hairline }]
            : i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
        ]}
        accessibilityRole="button"
        accessibilityLabel={[name, row.unread ? t('tab.a11yUnread') : '', when, preview].filter(Boolean).join(', ')}
      >
        <View style={[styles.rowIcon, { backgroundColor: TILE_BG }, locked && styles.dim]}>
          <Icon name={spec.icon as IconName} size={20} color={theme.accent} />
        </View>
        <View style={styles.rowText}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowName, { color: theme.ink }]} numberOfLines={1}>{name}</Text>
            {!!when && <Text style={[styles.rowWhen, { color: theme.muted }]}>{when}</Text>}
          </View>
          <View style={styles.rowBottom}>
            <Text
              style={[styles.rowPreview, { color: empty || locked ? theme.muted : theme.ink2 }]}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {row.unread && <View style={[styles.unread, { backgroundColor: theme.accent }]} />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.ink }]} accessibilityRole="header">{t('tab.title')}</Text>
        <ProfileSwitcherTrigger profile={activeProfile} onPress={() => switcherRef.current?.present()} />
        <TouchableOpacity
          onPress={() => router.push('/saved')}
          style={styles.headerIcon}
          accessibilityRole="button"
          accessibilityLabel={t('tab.savedAnswers')}
        >
          <Icon name="bookmark" size={20} color={theme.ink2} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeProfile && (
          <>
            <EyebrowLabel size={11}>{t('tab.eyebrow', { name: firstName })}</EyebrowLabel>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              {gurus.map((g, i) => renderRow(g, i, i === gurus.length - 1))}
            </View>
          </>
        )}

        <EyebrowLabel size={11} style={styles.gap}>{t('tab.guidance')}</EyebrowLabel>
        {renderRow(krishna, 0, true, true)}

        <View style={[styles.card, styles.gap, styles.links, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {([
            { key: 'saved', icon: 'bookmark', label: t('tab.savedAnswers'), count: savedCount, go: () => router.push('/saved') },
            { key: 'past', icon: 'history', label: t('tab.past'), count: pastCount, go: () => router.push('/archived') },
          ] as const).map((l, i) => (
            <View key={l.key}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: theme.hairline }]} />}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={l.go}
                accessibilityRole="button"
                accessibilityLabel={l.count ? `${l.label}, ${l.count}` : l.label}
              >
                <View style={[styles.linkIcon, { backgroundColor: theme.surface2 }]}>
                  <Icon name={l.icon} size={16} color={theme.ink2} />
                </View>
                <Text style={[styles.linkLabel, { color: theme.ink }]}>{l.label}</Text>
                {!!l.count && <Text style={[styles.linkCount, { color: theme.muted }]}>{localizeDigits(String(l.count))}</Text>}
                <Icon name="chevron" size={14} color={theme.faint} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {activeProfile && (
          <Text style={[styles.footnote, { color: theme.muted }]}>{t('tab.footnote', { name: firstName })}</Text>
        )}
      </ScrollView>

      <ProfileSwitcherSheet
        ref={switcherRef}
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        onSelect={(p) => setActiveProfile(p.id)}
        onCreateNew={() => router.push('/profile/new')}
        onEdit={(p) => router.push(`/profile/edit/${p.id}`)}
      />
      <GuruNoticeSheet ref={noticeRef} onClose={closeNotice} />
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 22,
    paddingTop:        16,
    paddingBottom:     4,
  },
  title: {
    flex:       1,
    fontFamily: FONTS.serifItalic,
    fontSize:   36,
    lineHeight: 40,
  },
  headerIcon: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop:        14,
    paddingBottom:     32,
    gap:               10,
  },
  gap: { marginTop: 14 },
  card: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    overflow:     'hidden',
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               14,
    minHeight:         76,
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  standalone: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width:          44,
    height:         44,
    borderRadius:   22,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowName: {
    flex:       1,
    fontFamily: FONTS.serifItalic,
    fontSize:   19,
    lineHeight: 22,
  },
  rowWhen: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowPreview: {
    flex:       1,
    minWidth:   0,
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
  },
  unread: { width: 8, height: 8, borderRadius: 4 },
  links: { paddingHorizontal: 16, paddingVertical: 6 },
  linkRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    minHeight:     52,
  },
  linkIcon: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  linkLabel: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   14.5,
  },
  linkCount: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
  },
  divider: { height: StyleSheet.hairlineWidth },
  footnote: {
    marginTop:         6,
    marginHorizontal:  4,
    fontFamily:        FONTS.sansRegular,
    fontSize:          12,
    lineHeight:        17,
  },
});
