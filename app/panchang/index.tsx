import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { todayIso, formatFullDate, todayShort } from '@/utils/format';
import { getPanchang, formatHour, formatWindow } from '@/utils/panchang';
import { FONTS, RADIUS } from '@/constants/themes';

export default function PanchangScreen() {
  const { theme }     = useAccent();
  const { profiles, activeProfile } = useProfiles();
  const profile       = activeProfile ?? profiles[0] ?? null;

  const today = todayIso();
  const panchang = getPanchang(
    today,
    profile?.birthLat ?? null,
    profile?.birthLng ?? null,
  );

  const rows: Array<{ label: string; value: string; sub?: string }> = [
    { label: 'Tithi',     value: panchang.tithi.name, sub: `${panchang.tithi.paksha} paksha · day ${panchang.tithi.index}` },
    { label: 'Vara',      value: panchang.vara.name, sub: `${panchang.vara.english} · ruled by ${panchang.vara.lord}` },
    { label: 'Nakshatra', value: panchang.nakshatra.name, sub: `lord: ${panchang.nakshatra.lord}` },
    { label: 'Yoga',      value: panchang.yoga.name, sub: `yoga ${panchang.yoga.index} of 27` },
    { label: 'Karana',    value: panchang.karana.name },
  ];

  const locationNote = profile?.birthCity
    ? `Times for ${profile.birthCity}`
    : 'Times approximated for your timezone';

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <EyebrowLabel style={{ marginBottom: 0 }}>{todayShort()} · Panchang</EyebrowLabel>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.display, { color: theme.ink }]}>
          {formatFullDate(new Date(today + 'T12:00:00'))}
        </Text>
        <EyebrowLabel size={10} style={{ marginTop: 6, marginBottom: 24 }}>{locationNote}</EyebrowLabel>

        {/* Five limbs */}
        <EyebrowLabel size={10.5} style={styles.sectionLabel}>Five limbs</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {rows.map((r, idx) => (
            <View key={r.label}>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.ink2 }]}>{r.label}</Text>
                <View style={{ alignItems: 'flex-end', flex: 1 }}>
                  <Text style={[styles.rowValue, { color: theme.ink }]}>{r.value}</Text>
                  {r.sub && <Text style={[styles.rowSub, { color: theme.muted }]}>{r.sub}</Text>}
                </View>
              </View>
              {idx < rows.length - 1 && <View style={[styles.divider, { backgroundColor: theme.hairline }]} />}
            </View>
          ))}
        </View>

        {/* Daylight */}
        <EyebrowLabel size={10.5} style={[styles.sectionLabel, { marginTop: 26 }]}>Sun</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.ink2 }]}>Sunrise</Text>
            <Text style={[styles.rowValue, { color: theme.ink }]}>{formatHour(panchang.sunrise)}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.ink2 }]}>Sunset</Text>
            <Text style={[styles.rowValue, { color: theme.ink }]}>{formatHour(panchang.sunset)}</Text>
          </View>
        </View>

        {/* Muhurat windows */}
        <EyebrowLabel size={10.5} style={[styles.sectionLabel, { marginTop: 26 }]}>Muhurat</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.ink2 }]}>Abhijit (auspicious)</Text>
              <Text style={[styles.rowSub, { color: theme.muted, marginTop: 2 }]}>
                A short window of clear, favorable energy around midday.
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.ink, marginLeft: 12 }]}>
              {formatWindow(panchang.abhijit)}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.ink2 }]}>Rahu Kaal (avoid)</Text>
              <Text style={[styles.rowSub, { color: theme.muted, marginTop: 2 }]}>
                Best avoided for starting anything new — sign offs, journeys, big decisions.
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.ink, marginLeft: 12 }]}>
              {formatWindow(panchang.rahuKaal)}
            </Text>
          </View>
        </View>

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
