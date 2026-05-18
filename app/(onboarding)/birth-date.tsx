import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { FONTS, RADIUS } from '@/constants/themes';
import { getMoonSign } from '@/utils/astrology';
import { localDateIso } from '@/utils/format';
import OnboardingStore from './_store';

export default function BirthDateScreen() {
  const { theme } = useAccent();

  const initialDate = OnboardingStore.birthDate
    ? new Date(OnboardingStore.birthDate)
    : null;

  const [date, setDate] = useState<Date | null>(initialDate);

  const handleContinue = () => {
    if (!date) return;
    // Reject future dates — the DateTimePicker has maximumDate set, but a
    // wrong device clock can still let one through. Charts for unborn people
    // are nonsensical.
    if (date.getTime() > Date.now() + 60_000) {
      Alert.alert(
        'That date is in the future',
        "Pick the date you were actually born — we can't read a chart for a moment that hasn't happened yet.",
      );
      return;
    }
    OnboardingStore.birthDate = localDateIso(date);
    router.push('/(onboarding)/birth-time');
  };

  // Computed with a noon default. Moon moves ~13° per day, so this can be
  // off by one sign for births near a sign-change moment — that's why we show
  // an "approximate" hint and refine on the next (birth-time) screen.
  const moon = date ? getMoonSign(localDateIso(date)) : null;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.step, { color: theme.muted }]}>03 / 05 — Birthday</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={[styles.display, { color: theme.ink }]}>
          When were{'\n'}
          <Text style={styles.italic}>you born?</Text>
        </Text>

        <EyebrowLabel style={styles.fieldLabel}>Date of birth</EyebrowLabel>

        <View style={[styles.pickerCard, { backgroundColor: theme.surface2 }]}>
          <DateTimePicker
            value={date ?? new Date(2000, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, d) => d && setDate(d)}
            style={styles.picker}
            themeVariant={theme.bg === '#faf9f6' ? 'light' : 'dark'}
          />
        </View>

        {moon && (
          <View style={[styles.signCard, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.signGlyph, { color: theme.accent }]}>{moon.glyph}</Text>
            <View style={styles.signInfo}>
              <EyebrowLabel size={10}>Moon sign · Rashi</EyebrowLabel>
              <Text style={[styles.signName, { color: theme.ink }]}>
                <Text style={styles.italic}>{moon.name}</Text>
                {'  '}
                <Text style={[styles.signElement, { color: theme.muted }]}>{moon.element}</Text>
              </Text>
              <Text style={[styles.signNote, { color: theme.muted }]}>
                approximate — your birth time refines this next
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Continue"
          variant="accent"
          fullWidth
          disabled={!date}
          onPress={handleContinue}
        />
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingTop:        20,
    paddingBottom:     8,
  },
  backBtn: { padding: 4 },
  step: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  scroll:  { flex: 1 },
  content: {
    padding:       32,
    paddingTop:    20,
    paddingBottom: 40,
  },
  display: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     40,
    lineHeight:   44,
    marginBottom: 32,
  },
  italic:     { fontFamily: FONTS.serifItalic },
  fieldLabel: { marginBottom: 12 },
  pickerCard: {
    borderRadius: RADIUS.card,
    overflow:     'hidden',
    marginBottom: 24,
    alignItems:   'flex-start',
    padding:      8,
  },
  picker: { alignSelf: 'flex-start' },
  signCard: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           16,
    marginTop:     8,
    padding:       20,
    borderRadius:  RADIUS.card,
  },
  signGlyph: { fontSize: 30 },
  signInfo:  { flex: 1 },
  signName: {
    fontFamily: FONTS.serifRegular,
    fontSize:   26,
    lineHeight: 30,
    marginTop:  4,
  },
  signElement: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
  },
  signNote: {
    fontFamily: FONTS.sansRegular,
    fontSize:   11.5,
    lineHeight: 16,
    marginTop:  6,
    fontStyle:  'italic',
  },
  footer: {
    padding:    32,
    paddingTop: 12,
  },
});
