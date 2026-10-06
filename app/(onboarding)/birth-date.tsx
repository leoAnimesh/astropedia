'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// GH's ScrollView lets the wheel's vertical pan win over page scrolling.
import { ScrollView } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { DatePicker } from '@/components/molecules/DatePicker';
import { showDialog } from '@/components/overlays';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { FONTS, RADIUS } from '@/constants/themes';
import { getMoonSign } from '@/utils/astrology';
import { localDateIso } from '@/utils/format';
import { tSign } from '@/utils/i18n';
import OnboardingStore from './_store';
import { useIndicStyles } from '@/hooks/use-indic-styles';

const DEFAULT_DATE = new Date(2000, 0, 1);

export default function BirthDateScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('onboarding');
  const indic = i18n.language !== 'en';   // taller line height for Devanagari/Bengali marks

  const initialDate = OnboardingStore.birthDate
    ? new Date(OnboardingStore.birthDate + 'T00:00:00')   // local, not UTC
    : null;

  const [date, setDate] = useState<Date | null>(initialDate);
  const [today] = useState(() => new Date());

  const handleContinue = () => {
    if (!date) return;
    // Reject future dates — the DatePicker has maximumDate set, but a
    // wrong device clock can still let one through. Charts for unborn people
    // are nonsensical.
    if (date.getTime() > Date.now() + 60_000) {
      showDialog({ title: t('birthDate.futureTitle'), message: t('birthDate.futureBody') });
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
        <Text style={[styles.step, { color: theme.muted }, indic && { letterSpacing: 0 }]}>{t('birthDate.step')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
          {t('birthDate.titleA')}{'\n'}
          <Text style={styles.italic}>{t('birthDate.titleB')}</Text>
        </Text>

        <EyebrowLabel style={styles.fieldLabel}>{t('birthDate.fieldLabel')}</EyebrowLabel>

        <View style={[styles.pickerCard, { backgroundColor: theme.surface2 }]}>
          <DatePicker
            value={date ?? DEFAULT_DATE}
            maximumDate={today}
            onChange={setDate}
          />
        </View>

        {moon && (
          <View style={[styles.signCard, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.signGlyph, { color: theme.accent }]}>{moon.glyph}</Text>
            <View style={styles.signInfo}>
              <EyebrowLabel size={10}>{t('birthDate.moonLabel')}</EyebrowLabel>
              <Text style={[styles.signName, { color: theme.ink }]}>
                <Text style={styles.italic}>{tSign(moon.name)}</Text>
                {'  '}
                <Text style={[styles.signElement, { color: theme.muted }]}>{t(`common:element.${moon.element}`)}</Text>
              </Text>
              <Text style={[styles.signNote, { color: theme.muted }]}>
                {t('birthDate.approxNote')}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={t('common:continue')}
          variant="accent"
          fullWidth
          disabled={!date}
          onPress={handleContinue}
        />
      </View>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
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
  displayIndic: { lineHeight: 56 },
  italic:     { fontFamily: FONTS.serifItalic },
  fieldLabel: { marginBottom: 12 },
  pickerCard: {
    borderRadius: RADIUS.card,
    overflow:     'hidden',
    marginBottom: 24,
    paddingVertical: 8,
  },
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
