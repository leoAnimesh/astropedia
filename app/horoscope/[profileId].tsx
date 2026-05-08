import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useHoroscope } from '@/hooks/use-horoscope';
import { useAstrology } from '@/hooks/use-astrology';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { todayIso, formatFullDate, todayShort } from '@/utils/format';
import { getLunarPhase } from '@/utils/astrology';
import { FONTS, RADIUS } from '@/constants/themes';

type Section = { key: keyof import('@/hooks/use-horoscope').HoroscopeSections; label: string; icon: string };

const SECTIONS: Section[] = [
  { key: 'energy',   label: 'Overall Energy',   icon: '✦' },
  { key: 'love',     label: 'Love & Connection', icon: '♡' },
  { key: 'career',   label: 'Career & Purpose',  icon: '◈' },
  { key: 'wellness', label: 'Mind & Body',        icon: '◎' },
  { key: 'guidance', label: "Saga's Guidance",   icon: '✧' },
];

export default function HoroscopeDetailScreen() {
  const { theme }       = useAccent();
  const { profileId }   = useLocalSearchParams<{ profileId: string }>();
  const { profiles }    = useProfiles();
  const profile         = profiles.find(p => p.id === profileId);
  const { sections, loading } = useHoroscope(profile ?? null);
  const { sunSign, nakshatra, dasha } = useAstrology(
    profile ?? { birthDate: '', birthTime: null, birthLat: null, birthLng: null },
  );

  const lunarPhase = getLunarPhase(todayIso());
  const firstName  = (profile?.name ?? '').split(' ')[0];

  if (!profile) {
    router.back();
    return null;
  }

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <EyebrowLabel style={{ marginBottom: 0 }}>
            {todayShort()} · Daily for {firstName}
          </EyebrowLabel>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero heading */}
        <Text style={[styles.display, { color: theme.ink }]}>
          {formatFullDate(new Date())}
        </Text>

        {/* Cosmic context row */}
        <View style={styles.contextRow}>
          {sunSign && (
            <View style={[styles.contextChip, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.contextChipText, { color: theme.ink2 }]}>
                {sunSign.glyph} {sunSign.name}
              </Text>
            </View>
          )}
          <View style={[styles.contextChip, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.contextChipText, { color: theme.ink2 }]}>{lunarPhase}</Text>
          </View>
          {dasha && (
            <View style={[styles.contextChip, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.contextChipText, { color: theme.ink2 }]}>
                {dasha.lord} Dasha
              </Text>
            </View>
          )}
          {nakshatra && (
            <View style={[styles.contextChip, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.contextChipText, { color: theme.ink2 }]}>{nakshatra.name}</Text>
            </View>
          )}
        </View>

        {/* Loading state */}
        {loading && !sections && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.muted }]}>
              Saga is reading the stars for {firstName}…
            </Text>
          </View>
        )}

        {/* Horoscope sections */}
        {sections && SECTIONS.map(({ key, label, icon }) => {
          const text = sections[key];
          if (!text) return null;
          return (
            <View key={key} style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionIcon, { color: theme.accent }]}>{icon}</Text>
                <EyebrowLabel size={10}>{label}</EyebrowLabel>
              </View>
              <Text style={[styles.sectionText, { color: theme.ink }]}>{text}</Text>
            </View>
          );
        })}

        {/* Mantra */}
        {sections?.mantra ? (
          <View style={[styles.mantraCard, { backgroundColor: theme.accent }]}>
            <EyebrowLabel size={9} style={{ marginBottom: 10, color: theme.accentFg, opacity: 0.7 }}>
              Today's mantra
            </EyebrowLabel>
            <Text style={[styles.mantraText, { color: theme.accentFg }]}>
              "{sections.mantra}"
            </Text>
          </View>
        ) : null}

        {/* No key state */}
        {!loading && !sections && (
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <Text style={[styles.sectionText, { color: theme.ink }]}>
              Add a free Groq API key to your .env file to unlock daily readings.{'\n\n'}
              Get one free (no credit card) at console.groq.com, then set:{'\n\n'}
              EXPO_PUBLIC_GROQ_KEY=your_key_here
            </Text>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     8,
  },
  back: { padding: 4 },
  scroll:     { flex: 1 },
  content:    { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24 },

  display: {
    fontFamily:   FONTS.serifItalic,
    fontSize:     34,
    lineHeight:   40,
    marginTop:    8,
    marginBottom: 16,
  },

  contextRow: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            6,
    marginBottom:   24,
  },
  contextChip: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      RADIUS.pill,
  },
  contextChipText: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  loadingContainer: {
    alignItems:   'center',
    paddingTop:   48,
    paddingBottom: 32,
    gap:          16,
  },
  loadingText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
    textAlign:  'center',
    lineHeight: 22,
  },

  sectionCard: {
    borderRadius:  RADIUS.card,
    borderWidth:   StyleSheet.hairlineWidth,
    padding:       20,
    marginBottom:  14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  10,
  },
  sectionIcon: {
    fontSize:   16,
    lineHeight: 18,
  },
  sectionText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 26,
  },

  mantraCard: {
    borderRadius:  RADIUS.card,
    padding:       24,
    alignItems:    'center',
    marginBottom:  14,
    marginTop:     6,
  },
  mantraText: {
    fontFamily: FONTS.serifItalic,
    fontSize:   24,
    lineHeight: 32,
    textAlign:  'center',
  },
});
