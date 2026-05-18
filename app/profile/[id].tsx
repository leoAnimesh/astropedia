import { useRef, useEffect } from 'react';
import { Alert, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useThreads } from '@/hooks/use-threads';
import { useHoroscope } from '@/hooks/use-horoscope';
import { useAstrology } from '@/hooks/use-astrology';
import { useChartReading } from '@/hooks/use-chart-reading';
import { BirthChart } from '@/components/organisms/BirthChart';
import { Avatar } from '@/components/atoms/Avatar';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { DetailRow } from '@/components/molecules/DetailRow';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS, RADIUS } from '@/constants/themes';
import { formatBirthDate, formatBirthTime, formatFullDate } from '@/utils/format';
import { ZODIAC } from '@/constants/astrology';
import type { ZodiacSign } from '@/constants/astrology';

const DIGNITY_COLOR: Record<string, string> = {
  exalted:    '#6B9B7A',
  debilitated:'#C87B7B',
  own:        '#C68B2F',
  neutral:    'transparent',
};

// Animated shimmer skeleton line
function SkeletonLine({ color, width, style }: { color: string; width: number | `${number}%`; style?: object }) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,    duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ height: 11, borderRadius: 6, backgroundColor: color, opacity }, style, { width }]}
    />
  );
}

export default function ProfileDetailScreen() {
  const { theme } = useAccent();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profiles, removeProfile } = useProfiles();
  const profile = profiles.find((p) => p.id === id);

  const { sunSign, moonSign, risingSign, chartPositions, nakshatra, dasha } = useAstrology(
    profile ?? { birthDate: '', birthTime: null, birthLat: null, birthLng: null },
  );
  useThreads(id ?? null);
  const { text: horoscopeText } = useHoroscope(profile ?? null);
  const { reading, loading: readingLoading } = useChartReading(profile ?? null);

  if (!profile) {
    router.back();
    return null;
  }

  const handleDelete = () => {
    Alert.alert(
      'Remove chart',
      'This will delete all conversations with this profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeProfile(profile.id);
            router.back();
          },
        },
      ],
    );
  };

  const bigThree: Array<{ label: string; sign: ZodiacSign | null; dim: boolean; aiKey: 'sun' | 'moon' | 'rising' }> = [
    { label: 'Sun',    sign: sunSign,    dim: false,               aiKey: 'sun' },
    { label: 'Moon',   sign: moonSign,   dim: false,               aiKey: 'moon' },
    { label: 'Rising', sign: risingSign, dim: !profile.birthTime,  aiKey: 'rising' },
  ];

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <EyebrowLabel>
          {profile.isYou ? 'Your chart' : `${profile.name.split(' ')[0]}'s chart`}
        </EyebrowLabel>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.push(`/profile/edit/${profile.id}`)} style={styles.headerAction}>
          <Text style={[styles.headerActionText, { color: theme.muted }]}>Edit</Text>
        </TouchableOpacity>
        {!profile.isYou && (
          <TouchableOpacity onPress={handleDelete} style={styles.headerAction}>
            <Text style={[styles.headerActionText, { color: theme.muted }]}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Profile header */}
        <View style={styles.profileHeader}>
          <Avatar name={profile.name} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.name, { color: theme.ink }]}>{profile.name}</Text>
            <Text style={[styles.nameSub, { color: theme.muted }]}>
              {sunSign ? `${sunSign.glyph} ${sunSign.name}` : 'No birth date'}
              {profile.relationship ? ` · ${profile.relationship}` : ''}
            </Text>
          </View>
        </View>

        {/* Birth chart */}
        <BirthChart profile={profile} size={290} />

        {/* Big Three — desc is always available (sign description fallback); spinner omitted */}
        <View style={styles.bigThree}>
          {bigThree.map(({ label, sign, dim, aiKey }) => {
            const desc = reading?.[aiKey] ?? sign?.description ?? null;
            return (
              <View
                key={label}
                style={[
                  styles.bigOneCard,
                  { backgroundColor: theme.surface, borderColor: theme.hairline, opacity: dim ? 0.5 : 1 },
                ]}
              >
                {/* Left: label + glyph + name */}
                <View style={styles.bigOneLeft}>
                  <EyebrowLabel size={9.5}>{label}</EyebrowLabel>
                  <Text style={[styles.bigOneGlyph, { color: theme.accent }]}>{sign?.glyph ?? '—'}</Text>
                  <Text style={[styles.bigOneName, { color: theme.ink }]}>
                    {sign?.name ?? (dim ? 'No time' : '—')}
                  </Text>
                </View>
                {/* Right: description — AI text replaces static when ready, no spinner */}
                <View style={styles.bigOneRight}>
                  {desc && !dim ? (
                    <Text style={[styles.bigOneDesc, { color: theme.ink2 }]}>{desc}</Text>
                  ) : (!dim && (
                    <Text style={[styles.bigOneDesc, { color: theme.faint }]}>—</Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        {/* Saga's reading overview */}
        {(reading?.overview || readingLoading) && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <EyebrowLabel style={{ marginBottom: 12 }}>Saga's reading</EyebrowLabel>
            {readingLoading && !reading ? (
              <View style={styles.skeletonBlock}>
                <SkeletonLine color={theme.hairline2} width="92%" />
                <SkeletonLine color={theme.hairline2} width="78%" style={{ marginTop: 9 }} />
                <SkeletonLine color={theme.hairline2} width="55%" style={{ marginTop: 9 }} />
              </View>
            ) : (
              <Text style={[styles.overviewText, { color: theme.ink }]}>{reading?.overview}</Text>
            )}
          </View>
        )}

        {/* Planet positions table */}
        {chartPositions.length > 0 && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <EyebrowLabel style={{ marginBottom: 12 }}>Planetary positions</EyebrowLabel>
            {chartPositions.map((p, i) => {
              const sign = ZODIAC[p.signIndex];
              const isLast = i === chartPositions.length - 1;
              return (
                <View
                  key={p.name}
                  style={[
                    styles.planetRow,
                    !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline },
                  ]}
                >
                  <Text style={[styles.planetGlyph, { color: theme.ink }]}>{p.glyph}</Text>
                  <Text style={[styles.planetName, { color: theme.ink2 }]}>{p.name}</Text>
                  <Text style={[styles.planetSign, { color: theme.ink }]}>
                    {sign?.glyph} {sign?.name}
                  </Text>
                  <Text style={[styles.planetDeg, { color: theme.muted }]}>{p.degInSign}°</Text>
                  {p.dignity !== 'neutral' && (
                    <View style={[styles.dignityBadge, { borderColor: DIGNITY_COLOR[p.dignity] }]}>
                      <Text style={[styles.dignityText, { color: DIGNITY_COLOR[p.dignity] }]}>
                        {p.dignity}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Nakshatra card */}
        {nakshatra && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <EyebrowLabel style={{ marginBottom: 8 }}>Moon nakshatra</EyebrowLabel>
            <View style={styles.nakshatraRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.nakshatraName, { color: theme.ink }]}>
                  <Text style={styles.italic}>{nakshatra.name}</Text>
                </Text>
                <Text style={[styles.nakshatraLord, { color: theme.muted }]}>
                  Ruled by {nakshatra.lord}
                </Text>
              </View>
            </View>
            {reading?.nakshatra ? (
              <Text style={[styles.nakshatraDesc, { color: theme.ink2 }]}>{reading.nakshatra}</Text>
            ) : readingLoading ? (
              <View style={styles.skeletonInline}>
                <SkeletonLine color={theme.hairline2} width="88%" />
                <SkeletonLine color={theme.hairline2} width="65%" style={{ marginTop: 8 }} />
              </View>
            ) : null}
          </View>
        )}

        {/* Mahadasha card */}
        {dasha && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <EyebrowLabel style={{ marginBottom: 8 }}>Current Mahadasha</EyebrowLabel>
            <View style={styles.dashaHeader}>
              <Text style={[styles.dashaLord, { color: theme.ink }]}>
                <Text style={styles.italic}>{dasha.lord}</Text>
                <Text style={[styles.dashaYears, { color: theme.muted }]}>  {dasha.yearsTotal} yr period</Text>
              </Text>
            </View>
            <View style={styles.dashaDateRow}>
              <Text style={[styles.dashaDate, { color: theme.muted }]}>{dasha.startDate}</Text>
              <View style={[styles.dashaBar, { backgroundColor: theme.hairline2 }]} />
              <Text style={[styles.dashaDate, { color: theme.accent }]}>{dasha.endDate}</Text>
            </View>
            {reading?.dasha ? (
              <Text style={[styles.nakshatraDesc, { color: theme.ink2 }]}>{reading.dasha}</Text>
            ) : readingLoading ? (
              <View style={styles.skeletonInline}>
                <SkeletonLine color={theme.hairline2} width="88%" />
                <SkeletonLine color={theme.hairline2} width="60%" style={{ marginTop: 8 }} />
              </View>
            ) : null}
          </View>
        )}

        {/* Birth info */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <DetailRow label="Born"  value={formatBirthDate(profile.birthDate)} />
          <DetailRow label="Time"  value={profile.birthTime ? formatBirthTime(profile.birthTime) : 'Unknown'} />
          <DetailRow label="Place" value={profile.birthCity ?? 'Unknown'} last />
        </View>

        {/* Daily horoscope preview */}
        {horoscopeText && (
          <>
            <EyebrowLabel style={{ marginTop: 24, marginBottom: 12 }}>
              {formatFullDate(new Date())} · Daily reading
            </EyebrowLabel>
            <Text style={[styles.horoscope, { color: theme.ink }]}>
              {horoscopeText.split('\n')[0]}
            </Text>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  back:           { padding: 4 },
  removeBtn:      { fontFamily: FONTS.monoRegular, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  headerAction:   { paddingHorizontal: 6, paddingVertical: 4 },
  headerActionText: { fontFamily: FONTS.monoRegular, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  scroll:         { flex: 1 },
  content:        { paddingHorizontal: 26, paddingTop: 8, paddingBottom: 20 },
  profileHeader:  { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  name:           { fontFamily: FONTS.serifItalic, fontSize: 28, lineHeight: 32 },
  nameSub:        { fontFamily: FONTS.sansRegular, fontSize: 14, marginTop: 4 },
  italic:         { fontFamily: FONTS.serifItalic },

  bigThree:    { flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 14 },
  bigOneCard:  {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderRadius: RADIUS.medium, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  bigOneLeft:  { alignItems: 'center', width: 70, gap: 3 },
  bigOneRight: { flex: 1 },
  bigOneGlyph:  { fontSize: 26 },
  bigOneName:   { fontFamily: FONTS.serifItalic, fontSize: 14, textAlign: 'center' },
  bigOneDesc:   { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 20 },

  card: {
    borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth,
    padding: 16, marginBottom: 14,
  },
  overviewText:  { fontFamily: FONTS.sansRegular, fontSize: 15, lineHeight: 24 },

  skeletonBlock:  { paddingVertical: 4 },
  skeletonInline: { marginTop: 10 },

  planetRow:   {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 6,
  },
  planetGlyph: { fontSize: 15, width: 20, textAlign: 'center' },
  planetName:  { fontFamily: FONTS.sansRegular, fontSize: 13, width: 64 },
  planetSign:  { fontFamily: FONTS.sansRegular, fontSize: 13, flex: 1 },
  planetDeg:   { fontFamily: FONTS.monoRegular, fontSize: 11, width: 28, textAlign: 'right' },
  dignityBadge: {
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1, marginLeft: 4,
  },
  dignityText: { fontFamily: FONTS.monoRegular, fontSize: 9, textTransform: 'lowercase' },

  nakshatraRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  nakshatraName: { fontFamily: FONTS.serifRegular, fontSize: 20, lineHeight: 24 },
  nakshatraLord: { fontFamily: FONTS.sansRegular, fontSize: 12, marginTop: 2 },
  nakshatraDesc: { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 20, marginTop: 8 },

  dashaHeader:  { marginBottom: 6 },
  dashaLord:    { fontFamily: FONTS.serifRegular, fontSize: 20, lineHeight: 24 },
  dashaYears:   { fontFamily: FONTS.sansRegular, fontSize: 13 },
  dashaDateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dashaDate:    { fontFamily: FONTS.monoRegular, fontSize: 11, letterSpacing: 0.3 },
  dashaBar:     { flex: 1, height: 1, marginHorizontal: 8, alignSelf: 'center' },

  horoscope: { fontFamily: FONTS.sansRegular, fontSize: 16, lineHeight: 26 },
});
