'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { Avatar } from '@/components/atoms/Avatar';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { getLifeChapters, getMoonLongitudeExact } from '@/utils/astrology';
import { getPanchang } from '@/utils/panchang';
import { todayIso } from '@/utils/format';
import { formatDayDate, formatMonthYear, tNakshatra, tPlanet } from '@/utils/i18n';
import { FONTS, RADIUS } from '@/constants/themes';
import type { Profile } from '@/utils/database';
import { useIndicStyles } from '@/hooks/use-indic-styles';

/** Key suffix for "Nth from your/her/his/their Moon" (pronoun differs in English only). */
function moonOwner(p: Profile): 'you' | 'woman' | 'man' | 'other' {
  if (p.isYou) return 'you';
  if (p.gender === 'woman') return 'woman';
  if (p.gender === 'man') return 'man';
  return 'other';
}

type Row = {
  profile: Profile;
  chapter: string | null;
  sub:     string | null;
  subEnd:  string | null;
  /** 1..12: which sign today's Moon is in, counted from the natal Moon sign. */
  fromMoon: number | null;
};

function buildRow(profile: Profile, todayMoonSign: number): Row {
  if (!profile.birthDate) return { profile, chapter: null, sub: null, subEnd: null, fromMoon: null };
  try {
    const life = getLifeChapters(profile);
    const sub  = life.subs[life.currentSub];
    const natalMoonSign = Math.floor(
      getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz) / 30,
    );
    return {
      profile,
      chapter:  life.chapters[life.currentIndex].lord,
      sub:      sub.lord,
      subEnd:   formatMonthYear(sub.end),
      fromMoon: ((todayMoonSign - natalMoonSign + 12) % 12) + 1,
    };
  } catch {
    return { profile, chapter: null, sub: null, subEnd: null, fromMoon: null };
  }
}

export default function FamilyScreen() {
  const styles = useIndicStyles(baseStyles);
  const { t, i18n }  = useTranslation('family');
  const { theme }    = useAccent();
  const { profiles } = useProfiles();

  const today = todayIso();
  const todayNak = useMemo(() => getPanchang(today).nakshatra.name, [today]);
  const todayMoonSign = useMemo(() => Math.floor(getMoonLongitudeExact(today, '12:00') / 30), [today]);

  const rows = useMemo(() => {
    // You first, then everyone else in their existing order.
    const sorted = [...profiles].sort((a, b) => Number(b.isYou) - Number(a.isYou));
    return sorted.map((p) => buildRow(p, todayMoonSign));
    // subEnd is a display date in the app language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, todayMoonSign, i18n.language]);

  const you = profiles.find((p) => p.isYou);
  const youFirst = you?.name.split(' ')[0] ?? null;

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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <EyebrowLabel size={11}>
            {t('eyebrow', { date: formatDayDate(new Date()), nakshatra: tNakshatra(todayNak) })}
          </EyebrowLabel>
          <Text style={[styles.title, { color: theme.ink }]}>
            {t('title.before')}
            <Text style={[styles.titleItalic, { color: theme.accent }]}>{t('title.em')}</Text>
          </Text>
          <Text style={[styles.lead, { color: theme.ink2 }]}>{t('lead')}</Text>
        </View>

        <View style={styles.list}>
          {rows.map((row) => (
            <PersonCard
              key={row.profile.id}
              row={row}
              todayNak={todayNak}
              matchWith={you && !row.profile.isYou && row.chapter ? youFirst : null}
              youId={you?.id ?? null}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={() => router.push('/profile/new')}
          style={[styles.addBtn, { borderColor: theme.hairline2 }]}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Icon name="plus" size={16} color={theme.ink} />
          <Text style={[styles.addText, { color: theme.ink }]}>{t('addSomeone')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenLayout>
  );
}

function PersonCard({ row, todayNak, matchWith, youId }: { row: Row; todayNak: string; matchWith: string | null; youId: string | null }) {
  const styles = useIndicStyles(baseStyles);
  const { t } = useTranslation('family');
  const { theme } = useAccent();
  const { profile } = row;
  const hasChart = !!row.chapter;
  // relationship is free text the user typed, shown as entered.
  const relation = profile.isYou ? t('you') : profile.relationship;

  const open = () => {
    if (hasChart) router.push(`/phase/${profile.id}`);
    else router.push(`/profile/edit/${profile.id}`);
  };

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor:     profile.isYou ? theme.accent : theme.hairline,
          borderWidth:     profile.isYou ? 1.5 : StyleSheet.hairlineWidth,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={t(hasChart ? 'a11y.openPhase' : 'a11y.addDetails', { name: profile.name })}
    >
      <View style={styles.cardTop}>
        <Avatar name={profile.name} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: theme.ink }]} numberOfLines={1}>{profile.name}</Text>
          {relation ? <Text style={[styles.relation, { color: theme.muted }]}>{relation}</Text> : null}
        </View>
        {hasChart ? <Icon name="chevron" size={16} color={theme.faint} /> : null}
      </View>

      {hasChart ? (
        <View style={[styles.facts, { borderTopColor: theme.hairline }]}>
          <View style={styles.fact}>
            <EyebrowLabel>{t('lifePhase')}</EyebrowLabel>
            <Text style={[styles.factValue, { color: theme.ink }]}>
              {tPlanet(row.chapter!)} <Text style={styles.titleItalic}>{t('chapter')}</Text>
            </Text>
            <Text style={[styles.factSub, { color: theme.ink2 }]}>
              {t('subUntil', { planet: tPlanet(row.sub ?? ''), date: row.subEnd })}
            </Text>
          </View>
          <View style={styles.fact}>
            <EyebrowLabel>{t('todaysMoon')}</EyebrowLabel>
            <Text style={[styles.factSub, { color: theme.ink2 }]}>
              {row.fromMoon
                ? t(`fromMoon.${moonOwner(profile)}`, {
                    nakshatra: tNakshatra(todayNak),
                    ord:       t(`ordinal.${row.fromMoon}`),
                  })
                : tNakshatra(todayNak)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.facts, { borderTopColor: theme.hairline }]}>
          <Text style={[styles.factSub, { color: theme.ink2 }]}>
            {t(profile.isYou ? 'noChart.you' : 'noChart.other')}
          </Text>
          <Text style={[styles.link, { color: theme.accent }]}>{t('addDetails')}</Text>
        </View>
      )}

      {matchWith ? (
        <TouchableOpacity
          onPress={() => router.push(youId ? `/compatibility?a=${youId}&b=${profile.id}` : `/compatibility?b=${profile.id}`)}
          style={styles.matchLink}
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={[styles.link, { color: theme.accent }]}>{t('matchWith', { name: matchWith })}</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    paddingTop:        12,
    paddingBottom:     6,
  },
  back: {
    width:          44,
    height:         44,
    borderRadius:   22,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 22,
    paddingTop:        24,
    paddingBottom:     60,
    gap:               32,
  },
  section: { gap: 14, paddingHorizontal: 4 },
  title: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      44,
    lineHeight:    46,
    letterSpacing: -0.5,
  },
  titleItalic: { fontFamily: FONTS.serifItalic },
  lead: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 24,
  },
  list: { gap: 14 },
  card: {
    borderRadius: RADIUS.card + 2,
    padding:      20,
    gap:          16,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
  },
  name: {
    fontFamily: FONTS.serifRegular,
    fontSize:   24,
    lineHeight: 28,
  },
  relation: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      13.5,
    marginTop:     1,
    textTransform: 'capitalize',
  },
  facts: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop:     16,
    gap:            14,
  },
  fact: { gap: 4 },
  factValue: {
    fontFamily: FONTS.serifRegular,
    fontSize:   20,
    lineHeight: 24,
  },
  factSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14.5,
    lineHeight: 21,
  },
  link: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
  },
  matchLink: {
    minHeight:      44,
    justifyContent: 'center',
    marginTop:      -8,
    marginBottom:   -8,
    alignSelf:      'flex-start',
  },
  addBtn: {
    minHeight:      52,
    borderRadius:   RADIUS.pill,
    borderWidth:    1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
  },
  addText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15,
  },
});
