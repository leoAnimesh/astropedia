'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { todayIso } from '@/utils/format';
import { getPanchang, formatHourLocal, formatWindowLocal, tYoga, tKarana, tVara } from '@/utils/panchang';
import { localizePlace } from '@/utils/place-names';
import { intlLocale, tNakshatra, tPlanet, tTithi, tWeekday } from '@/utils/i18n';
import { FONTS, RADIUS } from '@/constants/themes';
import { useIndicStyles } from '@/hooks/use-indic-styles';

export default function PanchangScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme }     = useAccent();
  const { t, i18n }   = useTranslation('panchang');
  // Devanagari/Bengali need more line height for vowel marks above/below.
  const tallScript    = i18n.language !== 'en';
  const { profiles, activeProfile } = useProfiles();
  const profile       = activeProfile ?? profiles[0] ?? null;

  const today = todayIso();
  const panchang = getPanchang(
    today,
    profile?.birthLat ?? null,
    profile?.birthLng ?? null,
  );

  const rows: Array<{ key: string; label: string; value: string; sub?: string }> = [
    {
      key:   'tithi',
      label: t('row.tithi'),
      value: tTithi(panchang.tithi.name),
      sub:   t('tithiSub', {
        paksha: i18n.t(`astro:paksha.${panchang.tithi.paksha}`, { defaultValue: panchang.tithi.paksha }),
        index:  panchang.tithi.index,
      }),
    },
    {
      key:   'vara',
      label: t('row.vara'),
      value: tVara(panchang.vara.name),
      sub:   t('varaSub', { weekday: tWeekday(panchang.vara.english), lord: tPlanet(panchang.vara.lord) }),
    },
    {
      key:   'nakshatra',
      label: t('row.nakshatra'),
      value: tNakshatra(panchang.nakshatra.name),
      sub:   t('nakshatraSub', { lord: tPlanet(panchang.nakshatra.lord) }),
    },
    { key: 'yoga',   label: t('row.yoga'),   value: tYoga(panchang.yoga.name), sub: t('yogaSub', { index: panchang.yoga.index }) },
    { key: 'karana', label: t('row.karana'), value: tKarana(panchang.karana.name) },
  ];

  const locationNote = profile?.birthCity
    ? t('timesFor', { city: localizePlace(profile.birthCity, i18n.language) })
    : t('timesApprox');

  const todayDate  = new Date(today + 'T12:00:00');
  const shortDate  = todayDate.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' });
  const fullDate   = todayDate.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('back')}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <EyebrowLabel style={{ marginBottom: 0 }}>{t('eyebrow', { date: shortDate })}</EyebrowLabel>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.display, { color: theme.ink }, tallScript && { lineHeight: 48 }]}>
          {fullDate}
        </Text>
        <EyebrowLabel size={10} style={{ marginTop: 6, marginBottom: 24 }}>{locationNote}</EyebrowLabel>

        {/* Five limbs */}
        <EyebrowLabel size={10.5} style={styles.sectionLabel}>{t('section.limbs')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {rows.map((r, idx) => (
            <View key={r.key}>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.ink2 }]}>{r.label}</Text>
                <View style={{ alignItems: 'flex-end', flex: 1 }}>
                  <Text style={[styles.rowValue, { color: theme.ink, textAlign: 'right' }]}>{r.value}</Text>
                  {r.sub && <Text style={[styles.rowSub, { color: theme.muted, textAlign: 'right' }]}>{r.sub}</Text>}
                </View>
              </View>
              {idx < rows.length - 1 && <View style={[styles.divider, { backgroundColor: theme.hairline }]} />}
            </View>
          ))}
        </View>

        {/* Daylight */}
        <EyebrowLabel size={10.5} style={[styles.sectionLabel, { marginTop: 26 }]}>{t('section.sun')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.ink2 }]}>{t('sunrise')}</Text>
            <Text style={[styles.rowValue, { color: theme.ink }]}>{formatHourLocal(panchang.sunrise)}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.ink2 }]}>{t('sunset')}</Text>
            <Text style={[styles.rowValue, { color: theme.ink }]}>{formatHourLocal(panchang.sunset)}</Text>
          </View>
        </View>

        {/* Muhurat windows */}
        <EyebrowLabel size={10.5} style={[styles.sectionLabel, { marginTop: 26 }]}>{t('section.muhurat')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.ink2 }]}>{t('abhijit.label')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted, marginTop: 2 }]}>
                {t('abhijit.desc')}
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.ink, marginLeft: 12 }]}>
              {formatWindowLocal(panchang.abhijit)}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.ink2 }]}>{t('rahuKaal.label')}</Text>
              <Text style={[styles.rowSub, { color: theme.muted, marginTop: 2 }]}>
                {t('rahuKaal.desc')}
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.ink, marginLeft: 12 }]}>
              {formatWindowLocal(panchang.rahuKaal)}
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
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
  back:    { padding: 4 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24 },

  display: {
    fontFamily: FONTS.serifRegular,
    fontSize:   34,
    lineHeight: 40,
  },

  sectionLabel: { marginBottom: 10 },

  card: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical:   6,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 14,
    gap: 12,
  },
  rowLabel: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
  },
  rowValue: {
    fontFamily: FONTS.serifRegular,
    fontSize:   16,
  },
  rowSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    marginTop:  1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
