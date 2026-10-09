'use no memo'; // renders call language helpers that the React Compiler would otherwise cache across language switches

import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { useCompatReport } from '@/hooks/use-report';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { ProfileSwitcherSheet, type ProfileSwitcherSheetRef } from '@/components/organisms/ProfileSwitcher';
import { ReportSummaryCard } from '@/components/organisms/ReportSummaryCard';
import { FONTS, RADIUS } from '@/constants/themes';
import type { Profile } from '@/utils/database';
import { localizeDigits, tAsk } from '@/utils/i18n';
import { openGuruChat } from '@/utils/guru-nav';
import { partnerAllowed, type CompatMode } from '@/utils/reports';

const TILE_BG = 'rgba(180,130,0,0.10)';

/** A sensible starting mode from the free-text relationship ("wife", "mother", "friend"). */
function guessMode(rel: string | null | undefined): CompatMode | null {
  const r = (rel ?? '').toLowerCase();
  if (/wife|husband|partner|spouse|fianc|girlfriend|boyfriend|पत्नी|पति|স্ত্রী|স্বামী/.test(r)) return 'partner';
  if (/friend|दोस्त|मित्र|বন্ধু/.test(r)) return 'friend';
  if (/mother|father|mom|dad|ma\b|papa|son|daughter|brother|sister|aunt|uncle|grand|cousin|माँ|पिता|बेटा|बेटी|भाई|बहन|মা|বাবা|ছেলে|মেয়ে|ভাই|বোন/.test(r)) return 'family';
  return null;
}

export default function PairScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('reports');
  const params = useLocalSearchParams<{ a?: string; b?: string; mode?: string }>();
  const { profiles, activeProfile } = useProfiles();
  const sheetRef = useRef<ProfileSwitcherSheetRef>(null);
  const [picking, setPicking] = useState<'a' | 'b'>('b');

  const [aId, setAId] = useState<string | null>(params.a ?? null);
  const [bId, setBId] = useState<string | null>(params.b ?? null);
  const a: Profile | null = profiles.find((p) => p.id === aId) ?? activeProfile ?? null;
  const b: Profile | null = profiles.find((p) => p.id === bId && p.id !== a?.id)
    ?? profiles.find((p) => p.id !== a?.id && !!p.birthDate)
    ?? null;

  const adultsOk = !!a && !!b && partnerAllowed(a, b);
  const [chosenMode, setChosenMode] = useState<CompatMode | null>(
    params.mode === 'partner' || params.mode === 'friend' || params.mode === 'family' ? params.mode : null,
  );
  let mode: CompatMode = chosenMode ?? guessMode(b?.relationship) ?? 'partner';
  if (mode === 'partner' && !adultsOk) mode = 'family';

  const { report, loading } = useCompatReport(a, b, mode);
  const A = a?.name.split(' ')[0] ?? '';
  const B = b?.name.split(' ')[0] ?? '';

  const pick = (who: 'a' | 'b') => { setPicking(who); sheetRef.current?.present(); };
  const onPick = (p: Profile) => {
    if (picking === 'a') {
      if (p.id === b?.id) setBId(a?.id ?? null);
      setAId(p.id);
    } else if (p.id === a?.id) {
      setAId(b?.id ?? null);
      setBId(p.id);
    } else setBId(p.id);
  };

  const openFull = (ch?: string) => a && b && router.push(
    `/report/compat?profileId=${a.id}&b=${b.id}&mode=${mode}${ch ? `&ch=${ch}` : ''}` as Href,
  );

  const guru = mode === 'partner' ? 'love' : mode === 'family' ? 'family' : 'saga';
  const guruLabel = mode === 'partner'
    ? (a?.isYou || b?.isYou ? t('pair.askLove') : t('pair.askLoveOther', { a: A, b: B }))
    : mode === 'family' ? t('pair.askFamily') : t('pair.askSaga');
  const askGuru = () => a && b && openGuruChat(guru, a.id, tAsk(`reports:e.ask.compat.${mode}.q1`, { a: A, b: B }));

  const modes = (['partner', 'friend', 'family'] as const)
    .filter((m) => m !== 'partner' || adultsOk)
    .map((m) => ({ key: m, label: t(`pair.mode.${m}`) }));

  const person = (p: Profile | null, who: 'a' | 'b') => (
    <TouchableOpacity
      onPress={() => pick(who)}
      style={[styles.person, { backgroundColor: theme.surface, borderColor: who === 'b' ? theme.hairline2 : theme.hairline }]}
      accessibilityRole="button"
      accessibilityLabel={p ? t(who === 'a' ? 'pair.firstA11y' : 'pair.changeA11y', { name: p.name }) : t('pair.pick')}
    >
      {p ? <Avatar name={p.name} size={48} /> : <View style={[styles.empty, { backgroundColor: theme.surface3 }]}><Icon name="plus" size={18} color={theme.muted} /></View>}
      <Text style={[styles.personName, { color: theme.ink }]} numberOfLines={1}>{p ? p.name.split(' ')[0] : t('pair.pick')}</Text>
      {who === 'a'
        ? <Text style={[styles.personRel, { color: theme.muted }]} numberOfLines={1}>{p?.isYou ? t('pair.you') : p?.relationship ?? ' '}</Text>
        : (
          <View style={styles.changeRow}>
            <Text style={[styles.change, { color: theme.accent }]}>{t('pair.change')}</Text>
            <Icon name="chevron-down" size={11} color={theme.accent} />
          </View>
        )}
    </TouchableOpacity>
  );

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader title={t('pair.title')} subtitle={t('pair.subtitle')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('pair.who')}</EyebrowLabel>
          <View style={styles.pairRow}>
            {person(a, 'a')}
            <View style={[styles.link, { backgroundColor: TILE_BG }]} accessibilityElementsHidden importantForAccessibility="no">
              <Icon name="match" size={20} color={theme.accent} />
            </View>
            {person(b, 'b')}
          </View>
          {a && b && (
            <SegmentedControl
              options={modes}
              value={mode}
              onChange={(m) => setChosenMode(m)}
              accessibilityLabel={t('pair.kindA11y')}
            />
          )}
          {a && b && !adultsOk && <Text style={[styles.note, { color: theme.muted }]}>{t('pair.minorNote')}</Text>}
        </View>

        {!b ? (
          <View style={[styles.card, styles.pad, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <Text style={[styles.body, { color: theme.ink2 }]}>{t('pair.needTwo')}</Text>
            <TouchableOpacity onPress={() => router.push('/profile/new')} style={[styles.outlinePill, { borderColor: theme.hairline2 }]} accessibilityRole="button">
              <Icon name="plus" size={14} color={theme.ink} />
              <Text style={[styles.outlineText, { color: theme.ink }]}>{t('pair.addPerson')}</Text>
            </TouchableOpacity>
          </View>
        ) : !a?.birthDate || !b.birthDate ? (
          <Text style={[styles.body, { color: theme.ink2 }]}>{t('pair.needBirth', { name: !a?.birthDate ? A : B })}</Text>
        ) : !report ? (
          <View style={styles.loading}>{loading && <ActivityIndicator color={theme.muted} />}</View>
        ) : (
          <>
            <ReportSummaryCard report={report} />

            <View style={styles.section}>
              <EyebrowLabel size={11}>{t('pair.inReport')}</EyebrowLabel>
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                {report.chapters.map((c, i) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => openFull(c.id)}
                    style={[styles.chRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.title}. ${t(`e.compat.chipSub.${mode}.${c.id.replace('ch-', '')}`, { defaultValue: '' })}`}
                  >
                    <Text style={[styles.chN, { color: theme.accent }]}>{localizeDigits(String(i + 1).padStart(2, '0'))}</Text>
                    <View style={styles.chText}>
                      <Text style={[styles.chTitle, { color: theme.ink }]}>{c.title}</Text>
                      <Text style={[styles.chSub, { color: theme.ink2 }]}>{t(`e.compat.chipSub.${mode}.${c.id.replace('ch-', '')}`, { defaultValue: '' })}</Text>
                    </View>
                    <Icon name="chevron" size={14} color={theme.faint} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity onPress={() => openFull()} style={[styles.primary, { backgroundColor: theme.accent }]} accessibilityRole="button">
              <Text style={[styles.primaryText, { color: theme.accentFg }]}>{t('pair.readFull')}</Text>
              <Icon name="chevron" size={15} color={theme.accentFg} />
            </TouchableOpacity>
            <TouchableOpacity onPress={askGuru} style={[styles.secondary, { borderColor: theme.hairline2, backgroundColor: theme.surface }]} accessibilityRole="button">
              <Text style={[styles.secondaryText, { color: theme.ink }]}>{guruLabel}</Text>
            </TouchableOpacity>
            {mode === 'partner' && (
              <TouchableOpacity
                onPress={() => router.push(`/compatibility?a=${a.id}&b=${b.id}` as Href)}
                style={[styles.outlinePill, styles.center, { borderColor: theme.hairline2 }]}
                accessibilityRole="button"
              >
                <Text style={[styles.outlineText, { color: theme.ink2 }]}>{t('pair.fullMatch')}</Text>
                <Icon name="chevron" size={12} color={theme.ink2} />
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={[styles.footnote, { color: theme.muted }]}>{t('pair.footnote')}</Text>
      </ScrollView>

      <ProfileSwitcherSheet
        ref={sheetRef}
        profiles={profiles}
        activeProfileId={picking === 'a' ? a?.id ?? null : b?.id ?? null}
        onSelect={onPick}
        onCreateNew={() => router.push('/profile/new')}
      />
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 40, gap: 22 },
  section: { gap: 10 },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  person: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 8,
    borderRadius: RADIUS.card, borderWidth: 1,
  },
  empty: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  personName: { fontFamily: FONTS.sansMedium, fontSize: 14.5, lineHeight: 19 },
  personRel: { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 15 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  change: { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 15 },
  link: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  note: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
  card: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  pad: { padding: 16, gap: 12 },
  body: { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 20 },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  chRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 16 },
  chN: { fontFamily: FONTS.monoRegular, fontSize: 11, lineHeight: 14 },
  chText: { flex: 1, minWidth: 0, gap: 2 },
  chTitle: { fontFamily: FONTS.sansMedium, fontSize: 14.5, lineHeight: 19 },
  chSub: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: RADIUS.pill },
  primaryText: { fontFamily: FONTS.sansMedium, fontSize: 15, lineHeight: 20 },
  secondary: { marginTop: -10, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: 16 },
  secondaryText: { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 18 },
  outlinePill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 40, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1,
  },
  center: { alignSelf: 'center', marginTop: -10 },
  outlineText: { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 18 },
  footnote: { marginHorizontal: 4, fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
});
