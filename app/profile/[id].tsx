import { Alert, ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

  const handleNewChat = () => {
    const tempId = 't_' + Math.random().toString(36).slice(2, 11);
    router.push(`/chat/${tempId}?profileId=${profile.id}&isNew=true`);
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
        {!profile.isYou && (
          <TouchableOpacity onPress={handleDelete}>
            <Text style={[styles.removeBtn, { color: theme.muted }]}>Remove</Text>
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

        {/* Big Three */}
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
                <EyebrowLabel size={9.5}>{label}</EyebrowLabel>
                <Text style={[styles.bigOneGlyph, { color: theme.accent }]}>{sign?.glyph ?? '—'}</Text>
                <Text style={[styles.bigOneName, { color: theme.ink }]}>
                  {sign?.name ?? (dim ? 'Need time' : '—')}
                </Text>
                {readingLoading && !reading && !dim && (
                  <ActivityIndicator size="small" color={theme.muted} style={{ marginTop: 6 }} />
                )}
                {desc && !dim && (
                  <Text style={[styles.bigOneDesc, { color: theme.muted }]} numberOfLines={3}>
                    {desc}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Saga's reading overview */}
        {(reading?.overview || readingLoading) && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <EyebrowLabel style={{ marginBottom: 10 }}>Saga's reading</EyebrowLabel>
            {readingLoading && !reading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.muted} />
                <Text style={[styles.loadingText, { color: theme.muted }]}>Reading your chart…</Text>
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
            {reading?.nakshatra && (
              <Text style={[styles.nakshatraDesc, { color: theme.ink2 }]}>{reading.nakshatra}</Text>
            )}
            {readingLoading && !reading && (
              <ActivityIndicator size="small" color={theme.muted} style={{ marginTop: 8 }} />
            )}
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
            {reading?.dasha && (
              <Text style={[styles.nakshatraDesc, { color: theme.ink2 }]}>{reading.dasha}</Text>
            )}
            {readingLoading && !reading && (
              <ActivityIndicator size="small" color={theme.muted} style={{ marginTop: 8 }} />
            )}
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

      {/* New chat button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.chatBtn, { backgroundColor: theme.accent }]}
          onPress={handleNewChat}
          activeOpacity={0.85}
        >
          <Icon name="chat" size={18} color={theme.accentFg} />
          <Text style={[styles.chatBtnLabel, { color: theme.accentFg }]}>New conversation</Text>
        </TouchableOpacity>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  back:           { padding: 4 },
  removeBtn:      { fontFamily: FONTS.monoRegular, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  scroll:         { flex: 1 },
  content:        { paddingHorizontal: 26, paddingTop: 8, paddingBottom: 20 },
  profileHeader:  { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  name:           { fontFamily: FONTS.serifItalic, fontSize: 28, lineHeight: 32 },
  nameSub:        { fontFamily: FONTS.sansRegular, fontSize: 14, marginTop: 4 },
  italic:         { fontFamily: FONTS.serifItalic },

  bigThree:    { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 14 },
  bigOneCard:  {
    flex: 1, borderRadius: RADIUS.medium, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, alignItems: 'center', gap: 4,
  },
  bigOneGlyph:  { fontSize: 22 },
  bigOneName:   { fontFamily: FONTS.serifItalic, fontSize: 15, textAlign: 'center' },
  bigOneDesc:   {
    fontFamily: FONTS.sansRegular, fontSize: 11, lineHeight: 15,
    textAlign: 'center', marginTop: 4,
  },

  card: {
    borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth,
    padding: 16, marginBottom: 14,
  },
  loadingRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  loadingText:   { fontFamily: FONTS.sansRegular, fontSize: 13 },
  overviewText:  { fontFamily: FONTS.sansRegular, fontSize: 15, lineHeight: 24 },

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
  footer:    { padding: 20 },
  chatBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: RADIUS.pill },
  chatBtnLabel: { fontFamily: FONTS.sansMedium, fontSize: 15.5, letterSpacing: -0.2 },
});
