'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useHoroscope } from '@/hooks/use-horoscope';
import { useAstrology } from '@/hooks/use-astrology';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { ShareableHoroscopeCard } from '@/components/molecules/ShareableHoroscopeCard';
import { useTranslation } from 'react-i18next';
import { todayIso } from '@/utils/format';
import { intlLocale, tNakshatra, tPlanet, tSign } from '@/utils/i18n';
import { getLunarPhase } from '@/utils/astrology';
import { captureAndShare } from '@/utils/share';
import { FONTS, RADIUS } from '@/constants/themes';
import { useIndicStyles } from '@/hooks/use-indic-styles';

type Section = { key: keyof import('@/hooks/use-horoscope').HoroscopeSections; icon: string };

// Labels come from horoscope:sections.<key>.
const SECTIONS: Section[] = [
  { key: 'energy',   icon: '✦' },
  { key: 'love',     icon: '♡' },
  { key: 'career',   icon: '◈' },
  { key: 'wellness', icon: '◎' },
  { key: 'guidance', icon: '✧' },
];

// getLunarPhase() returns English names; these are their horoscope:phase keys.
const PHASE_KEY: Record<string, string> = {
  'New Moon':        'newMoon',
  'Waxing Crescent': 'waxingCrescent',
  'First Quarter':   'firstQuarter',
  'Waxing Gibbous':  'waxingGibbous',
  'Full Moon':       'fullMoon',
  'Waning Gibbous':  'waningGibbous',
  'Last Quarter':    'lastQuarter',
  'Waning Crescent': 'waningCrescent',
};

export default function HoroscopeDetailScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme }       = useAccent();
  const { t }           = useTranslation('horoscope');
  const { profileId }   = useLocalSearchParams<{ profileId: string }>();
  const { profiles }    = useProfiles();
  const profile         = profiles.find(p => p.id === profileId);
  const { sections, loading } = useHoroscope(profile ?? null);
  const { sunSign, nakshatra, dasha } = useAstrology(
    profile ?? { birthDate: '', birthTime: null, birthLat: null, birthLng: null, birthTz: null },
  );

  const lunarPhaseEn = getLunarPhase(todayIso());
  const lunarPhase   = PHASE_KEY[lunarPhaseEn] ? t(`phase.${PHASE_KEY[lunarPhaseEn]}`) : lunarPhaseEn;
  const now          = new Date();
  const shortDate    = now.toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' });
  const fullDate     = now.toLocaleDateString(intlLocale(), { month: 'long', day: 'numeric', year: 'numeric' });
  const firstName  = (profile?.name ?? '').split(' ')[0];

  const shareCardRef = useRef<View>(null);

  const handleShare = () => {
    captureAndShare(shareCardRef.current, `astropedia-daily-${todayIso()}.png`);
  };

  if (!profile) {
    router.back();
    return null;
  }

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={8} accessibilityLabel={t('backA11y')}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <EyebrowLabel style={{ marginBottom: 0 }}>
            {t('eyebrow', { date: shortDate, name: firstName })}
          </EyebrowLabel>
        </View>
        {sections?.energy && (
          <TouchableOpacity onPress={handleShare} hitSlop={8} style={styles.shareBtn} accessibilityLabel={t('shareA11y')}>
            <Icon name="send" size={18} color={theme.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Offscreen shareable card — kept in tree so view-shot can capture it. */}
      {sections && (
        <View pointerEvents="none" style={styles.offscreen}>
          <ShareableHoroscopeCard
            ref={shareCardRef}
            name={profile.name}
            dateIso={todayIso()}
            message={sections.energy}
            mantra={sections.mantra || undefined}
          />
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero heading */}
        <Text style={[styles.display, { color: theme.ink }]}>
          {fullDate}
        </Text>

        {/* Cosmic context row */}
        <View style={styles.contextRow}>
          {sunSign && (
            <View style={[styles.contextChip, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.contextChipText, { color: theme.ink2 }]}>
                {sunSign.glyph} {tSign(sunSign.name)}
              </Text>
            </View>
          )}
          <View style={[styles.contextChip, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.contextChipText, { color: theme.ink2 }]}>{lunarPhase}</Text>
          </View>
          {dasha && (
            <View style={[styles.contextChip, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.contextChipText, { color: theme.ink2 }]}>
                {t('dashaChip', { lord: tPlanet(dasha.lord) })}
              </Text>
            </View>
          )}
          {nakshatra && (
            <View style={[styles.contextChip, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.contextChipText, { color: theme.ink2 }]}>{tNakshatra(nakshatra.name)}</Text>
            </View>
          )}
        </View>

        {/* Loading state */}
        {loading && !sections && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.muted }]}>
              {t('loading', { name: firstName })}
            </Text>
          </View>
        )}

        {/* Horoscope sections */}
        {sections && SECTIONS.map(({ key, icon }) => {
          const text = sections[key];
          if (!text) return null;
          return (
            <View key={key} style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionIcon, { color: theme.accent }]}>{icon}</Text>
                <EyebrowLabel size={10}>{t(`sections.${key}`)}</EyebrowLabel>
              </View>
              <Text style={[styles.sectionText, { color: theme.ink }]}>{text}</Text>
            </View>
          );
        })}

        {/* Mantra */}
        {sections?.mantra ? (
          <View style={[styles.mantraCard, { backgroundColor: theme.accent }]}>
            <EyebrowLabel size={9} style={{ marginBottom: 10, color: theme.accentFg, opacity: 0.7 }}>
              {t('mantraEyebrow')}
            </EyebrowLabel>
            <Text style={[styles.mantraText, { color: theme.accentFg }]}>
              “{sections.mantra}”
            </Text>
          </View>
        ) : null}

        {/* Reading couldn't be built (e.g. missing birth details) */}
        {!loading && !sections && (
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <Text style={[styles.sectionText, { color: theme.ink }]}>
              {t('notReady')}
            </Text>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     8,
  },
  back: { padding: 4 },
  shareBtn: { padding: 6 },
  offscreen: {
    position: 'absolute',
    top:      -10000,
    left:     -10000,
    opacity:   0,
  },
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
