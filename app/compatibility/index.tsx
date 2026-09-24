import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { Avatar } from '@/components/atoms/Avatar';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { computeCompatibility } from '@/utils/compatibility';
import { FONTS, RADIUS } from '@/constants/themes';
import type { Profile } from '@/utils/database';

export default function CompatibilityScreen() {
  const { theme } = useAccent();
  const { profiles, activeProfile } = useProfiles();

  // Default: active profile on the left, first other profile on the right.
  const others = profiles.filter((p) => p.id !== activeProfile?.id);
  const [a, setA] = useState<Profile | null>(activeProfile ?? profiles[0] ?? null);
  const [b, setB] = useState<Profile | null>(others[0] ?? null);

  const result = a && b && a.id !== b.id ? computeCompatibility(a, b) : null;

  const cycle = (current: Profile | null, exclude: Profile | null): Profile | null => {
    const eligible = profiles.filter((p) => p.id !== exclude?.id);
    if (eligible.length === 0) return null;
    const idx = current ? eligible.findIndex((p) => p.id === current.id) : -1;
    return eligible[(idx + 1) % eligible.length];
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <EyebrowLabel style={{ marginBottom: 0 }}>Compatibility</EyebrowLabel>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.display, { color: theme.ink }]}>
          How do your{'\n'}
          <Text style={styles.italic}>charts meet?</Text>
        </Text>

        {/* Pair pickers */}
        <View style={styles.pairRow}>
          <TouchableOpacity
            style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
            onPress={() => setA(cycle(a, b))}
            activeOpacity={0.85}
          >
            {a ? (
              <>
                <Avatar name={a.name} size={48} />
                <Text style={[styles.profileName, { color: theme.ink }]}>{a.name.split(' ')[0]}</Text>
                <Text style={[styles.profileSub, { color: theme.muted }]}>tap to change</Text>
              </>
            ) : (
              <Text style={[styles.profileSub, { color: theme.muted }]}>add a profile</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.amp, { color: theme.muted }]}>+</Text>

          <TouchableOpacity
            style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
            onPress={() => setB(cycle(b, a))}
            activeOpacity={0.85}
          >
            {b ? (
              <>
                <Avatar name={b.name} size={48} />
                <Text style={[styles.profileName, { color: theme.ink }]}>{b.name.split(' ')[0]}</Text>
                <Text style={[styles.profileSub, { color: theme.muted }]}>tap to change</Text>
              </>
            ) : (
              <TouchableOpacity onPress={() => router.push('/profile/new')}>
                <Text style={[styles.profileSub, { color: theme.accent }]}>+ add profile</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        {!result && a && b && a.id === b.id && (
          <Text style={[styles.hint, { color: theme.muted }]}>
            Pick two different profiles to see how their charts meet.
          </Text>
        )}

        {!result && (!a || !b) && (
          <Text style={[styles.hint, { color: theme.muted }]}>
            You&apos;ll need at least two profiles to compare. Add a partner, family member, or friend from the home screen.
          </Text>
        )}

        {result && (
          <>
            {/* Score */}
            <View style={[styles.scoreCard, { backgroundColor: theme.accent }]}>
              <EyebrowLabel size={9} style={{ color: theme.accentFg, opacity: 0.7, marginBottom: 6 }}>
                {result.verdict}
              </EyebrowLabel>
              <Text style={[styles.scoreNumber, { color: theme.accentFg }]}>
                {result.outOfTen.toFixed(1)}
                <Text style={[styles.scoreDenom, { color: theme.accentFg, opacity: 0.6 }]}> / 10</Text>
              </Text>
            </View>

            {/* Narrative */}
            <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <Text style={[styles.summaryText, { color: theme.ink }]}>{result.summary}</Text>
            </View>

            {/* Dimensions */}
            <EyebrowLabel size={10.5} style={[styles.sectionLabel, { marginTop: 24 }]}>The pieces</EyebrowLabel>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              {result.dimensions.map((dim, idx) => (
                <View key={dim.name}>
                  <View style={styles.dimRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dimName, { color: theme.ink }]}>{dim.name}</Text>
                      <Text style={[styles.dimFlavor, { color: theme.muted }]}>{dim.flavor}</Text>
                    </View>
                    <Text style={[styles.dimScore, { color: theme.ink2 }]}>
                      {dim.score}<Text style={{ color: theme.muted }}>/{dim.max}</Text>
                    </Text>
                  </View>
                  {idx < result.dimensions.length - 1 && <View style={[styles.divider, { backgroundColor: theme.hairline }]} />}
                </View>
              ))}
            </View>

            <Text style={[styles.footer, { color: theme.muted }]}>
              Vedic charts hint at patterns, not destinies. The way two people show up for each other day after day matters more than any score.
            </Text>
          </>
        )}

        <View style={{ height: 40 }} />
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
  back:    { padding: 4 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24 },

  display: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     34,
    lineHeight:   40,
    marginBottom: 24,
  },
  italic: { fontFamily: FONTS.serifItalic },

  pairRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    marginBottom:   20,
  },
  profileCard: {
    flex:          1,
    alignItems:    'center',
    padding:       20,
    borderRadius:  RADIUS.card,
    borderWidth:   StyleSheet.hairlineWidth,
    gap:           8,
  },
  profileName: {
    fontFamily: FONTS.serifRegular,
    fontSize:   17,
  },
  profileSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   11,
    marginTop:  -2,
  },
  amp: {
    fontFamily: FONTS.serifItalic,
    fontSize:   28,
    width:      24,
    textAlign:  'center',
  },

  hint: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    lineHeight: 21,
    marginTop:  8,
  },

  scoreCard: {
    borderRadius: RADIUS.card,
    padding:      24,
    alignItems:   'center',
    marginTop:    12,
  },
  scoreNumber: {
    fontFamily: FONTS.serifRegular,
    fontSize:   48,
    lineHeight: 56,
  },
  scoreDenom: {
    fontFamily: FONTS.serifRegular,
    fontSize:   20,
  },

  summaryCard: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      18,
    marginTop:    16,
  },
  summaryText: {
    fontFamily: FONTS.serifRegular,
    fontSize:   16,
    lineHeight: 23,
  },

  sectionLabel: { marginBottom: 10 },
  card: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical:   6,
  },
  dimRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 14,
    gap:             12,
  },
  dimName: {
    fontFamily: FONTS.serifRegular,
    fontSize:   15,
  },
  dimFlavor: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 18,
    marginTop:  3,
  },
  dimScore: {
    fontFamily: FONTS.monoRegular,
    fontSize:   14,
  },
  divider: { height: StyleSheet.hairlineWidth },

  footer: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 19,
    marginTop:  24,
    fontStyle:  'italic',
  },
});
