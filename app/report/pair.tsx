'use no memo'; // renders call language helpers that the React Compiler would otherwise cache across language switches

/**
 * The one compatibility screen (Reports "Two people", Home "Matching",
 * Family "Match with", /compatibility links).
 *
 *  - Partner (adults only): the traditional 36-point kundli match with its
 *    eight parts explained, Nadi / Bhakoot / Gana / Manglik detail, data
 *    notes, marriage windows and the report chapters.
 *  - Friend / Family: no score, plain insights and chapters.
 *
 * Params: a, b (profile ids), mode (partner | friend | family).
 */
import { useMemo, useRef, useState } from 'react';
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
import { MatchDoshas } from '@/components/organisms/MatchDoshas';
import { NAKSHATRAS } from '@/constants/astrology';
import { FONTS, RADIUS } from '@/constants/themes';
import type { Profile } from '@/utils/database';
import { matchCharts, matchNotes, SIGN_NAMES, type PersonChart } from '@/utils/ashtakoota';
import { localizeDigits, tAsk, tNakshatra, tSign } from '@/utils/i18n';
import { openGuruChat } from '@/utils/guru-nav';
import { guruLocked } from '@/utils/guru-context';
import { matchQuestion } from '@/utils/match-detail';
import { captureAndShare } from '@/utils/share';
import { orientPair, partnerAllowed, type CompatMode } from '@/utils/reports';

const TILE_BG = 'rgba(180,130,0,0.10)';

/** A sensible starting mode from the free-text relationship ("wife", "mother", "friend"). */
function guessMode(rel: string | null | undefined): CompatMode | null {
  const r = (rel ?? '').toLowerCase();
  if (/wife|husband|partner|spouse|fianc|girlfriend|boyfriend|पत्नी|पति|স্ত্রী|স্বামী/.test(r)) return 'partner';
  if (/friend|दोस्त|मित्र|বন্ধু/.test(r)) return 'friend';
  if (/mother|father|mom|dad|ma\b|papa|son|daughter|brother|sister|aunt|uncle|grand|cousin|माँ|पिता|बेटा|बेटी|भाई|बहन|মা|বাবা|ছেলে|মেয়ে|ভাই|বোন/.test(r)) return 'family';
  return null;
}

const asMode = (m?: string): CompatMode | null => (m === 'partner' || m === 'friend' || m === 'family' ? m : null);
const first = (p: Profile | null | undefined) => (p ? p.name.split(' ')[0] || p.name : '');

export default function PairScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('reports');
  const { t: tc } = useTranslation('compatibility');
  const params = useLocalSearchParams<{ a?: string; b?: string; mode?: string }>();
  const { profiles, activeProfile } = useProfiles();
  const sheetRef = useRef<ProfileSwitcherSheetRef>(null);
  const cardRef = useRef<View>(null);
  const [picking, setPicking] = useState<'a' | 'b'>('b');
  const asked = asMode(params.mode);

  const [aId, setAId] = useState<string | null>(params.a ?? null);
  const [bId, setBId] = useState<string | null>(params.b ?? null);
  const a: Profile | null = profiles.find((p) => p.id === aId) ?? activeProfile ?? null;
  // Second person: the one asked for, else someone who fits the asked-for kind
  // (a partner for "Matching"), else anyone else with a birth date.
  const others = profiles.filter((p) => p.id !== a?.id && !!p.birthDate);
  const b: Profile | null = profiles.find((p) => p.id === bId && p.id !== a?.id)
    ?? (asked ? others.find((p) => guessMode(p.relationship) === asked && (asked !== 'partner' || !a || partnerAllowed(a, p))) : undefined)
    ?? (asked === 'partner' && a ? others.find((p) => partnerAllowed(a, p)) : undefined)
    ?? others[0]
    ?? profiles.find((p) => p.id !== a?.id)
    ?? null;

  const adultsOk = !!a?.birthDate && !!b?.birthDate && partnerAllowed(a, b);
  const [chosenMode, setChosenMode] = useState<CompatMode | null>(asked);
  let mode: CompatMode = chosenMode ?? guessMode(b?.relationship) ?? 'partner';
  if (mode === 'partner' && !adultsOk) mode = 'family';
  const partner = mode === 'partner';

  const { report, loading } = useCompatReport(a, b, mode);
  const A = first(a);
  const B = first(b);

  // Partner: the traditional match, bride first (same orientation as the report).
  const [bride, groom] = a && b ? orientPair(a, b) : [null, null];
  const match = useMemo(
    () => (partner && bride?.birthDate && groom?.birthDate ? matchCharts(bride, groom) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partner, bride?.id, groom?.id, bride?.birthDate, bride?.birthTime, bride?.birthLat, bride?.birthLng, groom?.birthDate, groom?.birthTime, groom?.birthLat, groom?.birthLng],
  );
  // Swapping the two people changes who counts as the bride only when gender doesn't decide it.
  const canSwap = !!a && !!b && orientPair(b, a)[0].id !== bride?.id;
  const notes = matchNotes(bride, groom);
  const byRole = { bride, groom };
  const noTime = notes.noTime.map((r) => byRole[r]).filter((p): p is Profile => !!p);
  const noPlace = notes.noPlace.map((r) => byRole[r]).filter((p): p is Profile => !!p);

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
  const swap = () => { if (a && b) { setAId(b.id); setBId(a.id); } };

  const openFull = (ch?: string) => a && b && router.push(
    `/report/compat?profileId=${a.id}&b=${b.id}&mode=${mode}${ch ? `&ch=${ch}` : ''}` as Href,
  );

  const guru = partner ? 'love' : mode === 'family' ? 'family' : 'saga';
  const guruLabel = partner
    ? (a?.isYou || b?.isYou ? t('pair.askLove') : t('pair.askLoveOther', { a: A, b: B }))
    : mode === 'family' ? t('pair.askFamily') : t('pair.askSaga');
  const askGuru = () => {
    if (!a || !b) return;
    if (partner && match && bride && groom) {
      // The full matching detail goes with the question; the Love guru is for adults only.
      const lockedOut = guruLocked('love', a.birthDate) || guruLocked('love', b.birthDate);
      openGuruChat(lockedOut ? 'saga' : 'love', a.id, matchQuestion(match, bride, groom));
      return;
    }
    openGuruChat(guru, a.id, tAsk(`reports:e.ask.compat.${mode}.q1`, { a: A, b: B }));
  };

  const share = () => captureAndShare(cardRef.current, `astropedia-compat-${A}-${B}`.toLowerCase());

  const modes = (['partner', 'friend', 'family'] as const)
    .filter((m) => m !== 'partner' || adultsOk)
    .map((m) => ({ key: m, label: t(`pair.mode.${m}`) }));

  const moonLine = (c: PersonChart) => tc('match.moonLine', {
    sign: tSign(SIGN_NAMES[c.moon.sign]),
    nakshatra: tNakshatra(NAKSHATRAS[c.moon.nak].name),
    pada: localizeDigits(String(c.moon.pada)),
  });

  const person = (p: Profile | null, who: 'a' | 'b') => {
    const role = partner && p && bride ? (p.id === bride.id ? 'bride' : 'groom') : null;
    const chart = match && role ? (role === 'bride' ? match.brideChart : match.groomChart) : null;
    return (
      <TouchableOpacity
        onPress={() => pick(who)}
        style={[styles.person, { backgroundColor: theme.surface, borderColor: who === 'b' ? theme.hairline2 : theme.hairline }]}
        accessibilityRole="button"
        accessibilityLabel={p ? t(who === 'a' ? 'pair.firstA11y' : 'pair.changeA11y', { name: p.name }) : t('pair.pick')}
      >
        {role && <EyebrowLabel size={10}>{tc(`match.${role}`)}</EyebrowLabel>}
        {p ? <Avatar name={p.name} size={48} /> : <View style={[styles.empty, { backgroundColor: theme.surface3 }]}><Icon name="plus" size={18} color={theme.muted} /></View>}
        <Text style={[styles.personName, { color: theme.ink }]} numberOfLines={1}>{p ? first(p) : t('pair.pick')}</Text>
        {chart && <Text style={[styles.moon, { color: theme.muted }]} numberOfLines={2}>{moonLine(chart)}</Text>}
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
  };

  const note = (text: string, key: string) => <Text key={key} style={[styles.note, { color: theme.muted }]}>{text}</Text>;
  const editLink = (p: Profile, label: string, key: string) => (
    <TouchableOpacity key={key} onPress={() => router.push(`/profile/edit/${p.id}` as Href)} hitSlop={6} style={styles.inlineLink} accessibilityRole="button">
      <Text style={[styles.link, { color: theme.accent }]}>{label}</Text>
    </TouchableOpacity>
  );

  // Gentle notes about the data (none of them block the match).
  const dataNotes = a && b && a.birthDate && b.birthDate ? [
    notes.identicalBirth ? note(tc('match.notes.identical'), 'same') : null,
    noTime.length === 2 ? note(tc('match.notes.noTimeBoth'), 'notime') : null,
    ...noTime.flatMap((p) => [
      noTime.length === 1 ? note(tc('match.noTimeNote', { name: first(p) }), `nt-${p.id}`) : null,
      editLink(p, noTime.length === 2 ? `${first(p)} · ${tc('match.addTime')}` : tc('match.addTime'), `ntl-${p.id}`),
    ]),
    ...(partner ? noPlace.flatMap((p) => [
      note(tc('match.notes.noPlace', { name: first(p) }), `np-${p.id}`),
      editLink(p, tc('match.notes.addPlace'), `npl-${p.id}`),
    ]) : []),
    partner && canSwap && notes.rolesManual ? note(tc('match.notes.roles'), 'roles') : null,
    partner && notes.ageGap != null ? note(tc('match.notes.ageGap', { years: localizeDigits(String(notes.ageGap)) }), 'gap') : null,
  ].filter(Boolean) : [];

  const kootaNotes = match ? Object.fromEntries(match.kootas.map((k) => {
    const level = k.score === k.max ? 'full' : k.score === 0 ? 'none' : 'some';
    return [k.key, tc(`match.koota.${k.key}.${level}`, { defaultValue: tc(`match.koota.${k.key}.full`) })];
  })) : undefined;

  const missing = [a, b].find((p) => p && !p.birthDate) ?? null;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader
        title={t('pair.title')}
        subtitle={t('pair.subtitle')}
        right={report ? { icon: 'share', onPress: share, label: t('detail.share') } : undefined}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('pair.who')}</EyebrowLabel>
          <View style={styles.pairRow}>
            {person(a, 'a')}
            {partner && canSwap ? (
              <TouchableOpacity
                onPress={swap}
                style={[styles.link, { backgroundColor: TILE_BG }]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={tc('match.swap')}
              >
                <Text style={[styles.swapGlyph, { color: theme.accent }]}>⇄</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.link, { backgroundColor: TILE_BG }]} accessibilityElementsHidden importantForAccessibility="no">
                <Icon name="match" size={20} color={theme.accent} />
              </View>
            )}
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
          {a?.birthDate && b?.birthDate && !adultsOk && note(t('pair.minorNote'), 'minor')}
          {dataNotes}
        </View>

        {!b ? (
          <View style={[styles.card, styles.pad, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <Text style={[styles.body, { color: theme.ink2 }]}>{t('pair.needTwo')}</Text>
            <TouchableOpacity onPress={() => router.push('/profile/new')} style={[styles.outlinePill, { borderColor: theme.hairline2 }]} accessibilityRole="button">
              <Icon name="plus" size={14} color={theme.ink} />
              <Text style={[styles.outlineText, { color: theme.ink }]}>{t('pair.addPerson')}</Text>
            </TouchableOpacity>
          </View>
        ) : missing ? (
          <View style={styles.section}>
            <Text style={[styles.body, { color: theme.ink2 }]}>{t('pair.needBirth', { name: first(missing) })}</Text>
            {editLink(missing, tc('match.addDetails', { name: first(missing) }), 'add')}
          </View>
        ) : !report ? (
          <View style={styles.loading}>{loading && <ActivityIndicator color={theme.muted} />}</View>
        ) : (
          <>
            <ReportSummaryCard ref={cardRef} report={report} kootaNotes={kootaNotes} />

            {match && bride && groom && (
              <View style={styles.section}>
                <EyebrowLabel size={11}>{tc('match.doshas')}</EyebrowLabel>
                <MatchDoshas match={match} bride={bride} groom={groom} />
              </View>
            )}

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
  moon: { fontFamily: FONTS.sansRegular, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  change: { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 15 },
  link: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swapGlyph: { fontSize: 18, lineHeight: 22 },
  note: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
  inlineLink: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
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
  outlineText: { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 18 },
  footnote: { marginHorizontal: 4, fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
});
