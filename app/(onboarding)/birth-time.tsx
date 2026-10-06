'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
// GH's ScrollView lets the wheel's vertical pan win over page scrolling.
import { ScrollView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { TimePicker } from '@/components/molecules/TimePicker';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { FONTS, RADIUS } from '@/constants/themes';
import { getMoonSign } from '@/utils/astrology';
import { intlLocale, localizeTime, tSign } from '@/utils/i18n';
import OnboardingStore from './_store';
import { useIndicStyles } from '@/hooks/use-indic-styles';

export default function BirthTimeScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('onboarding');
  const indic = i18n.language !== 'en';   // taller line height for Devanagari/Bengali marks

  // "HH:mm" (24h) once the user has set it; null until then.
  const [time, setTime] = useState<string | null>(OnboardingStore.birthTime || null);

  const handleContinue = () => {
    if (!time) return;
    OnboardingStore.birthTime = time;
    router.push('/(onboarding)/birth-place');
  };

  // No birth time: the chart is cast without houses/rising (birth-place saves
  // an empty time as null).
  const handleUnknown = () => {
    OnboardingStore.birthTime = '';
    router.push('/(onboarding)/birth-place');
  };

  const timeLabel = time
    ? (() => {
        const [h, m] = time.split(':').map(Number);
        const formatted = new Date(2000, 0, 1, h, m).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' });
        return localizeTime(formatted);
      })()
    : null;

  // Refined moon sign using the user's actual birth time. This is the same
  // sign we showed on the previous screen — confirmed when the time given
  // doesn't cross a sign boundary, otherwise corrected.
  const refinedMoon = time && OnboardingStore.birthDate
    ? getMoonSign(OnboardingStore.birthDate, time)
    : null;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.step, { color: theme.muted }, indic && { letterSpacing: 0 }]}>{t('birthTime.step')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
          {t('birthTime.titleA')}{'\n'}
          <Text style={styles.italic}>{t('birthTime.titleB')}</Text>
        </Text>

        <Text style={[styles.hint, { color: theme.ink2 }]}>
          {t('birthTime.hint')}
        </Text>

        <EyebrowLabel style={styles.fieldLabel}>{t('birthTime.fieldLabel')}</EyebrowLabel>

        <View style={[styles.pickerCard, { backgroundColor: theme.surface2 }]}>
          <TimePicker value={time ?? '12:00'} onChange={setTime} />
        </View>

        {timeLabel && (
          <View style={[styles.preview, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.previewLabel, { color: theme.muted }, indic && { letterSpacing: 0 }]}>{t('birthTime.selected')}</Text>
            <Text style={[styles.previewValue, { color: theme.ink }]}>{timeLabel}</Text>
          </View>
        )}

        {refinedMoon && (
          <View style={[styles.signCard, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.signGlyph, { color: theme.accent }]}>{refinedMoon.glyph}</Text>
            <View style={styles.signInfo}>
              <EyebrowLabel size={10}>{t('birthTime.moonLabel')}</EyebrowLabel>
              <Text style={[styles.signName, { color: theme.ink }]}>
                <Text style={styles.italic}>{tSign(refinedMoon.name)}</Text>
                {'  '}
                <Text style={[styles.signElement, { color: theme.muted }]}>{t(`common:element.${refinedMoon.element}`)}</Text>
              </Text>
              <Text style={[styles.signNote, { color: theme.muted }]}>
                {t('birthTime.exactNote')}
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
          disabled={!time}
          onPress={handleContinue}
        />
        <TouchableOpacity onPress={handleUnknown} style={styles.unknownBtn} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.unknownText, { color: theme.muted }]}>{t('birthTime.unknown')}</Text>
        </TouchableOpacity>
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
  scroll: { flex: 1 },
  content: {
    padding:    32,
    paddingTop: 20,
  },
  display: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     40,
    lineHeight:   44,
    marginBottom: 16,
  },
  displayIndic: { lineHeight: 56 },
  italic: { fontFamily: FONTS.serifItalic },
  hint: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     14.5,
    lineHeight:   22,
    marginBottom: 32,
  },
  fieldLabel:  { marginBottom: 12 },
  pickerCard: {
    borderRadius: RADIUS.card,
    overflow:     'hidden',
    marginBottom: 20,
    paddingVertical: 8,
  },
  preview: {
    borderRadius: RADIUS.card,
    padding:      16,
    gap:          4,
  },
  previewLabel: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  previewValue: {
    fontFamily: FONTS.serifItalic,
    fontSize:   22,
  },
  signCard: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           16,
    marginTop:     16,
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
  unknownBtn:  { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  unknownText: { fontFamily: FONTS.sansRegular, fontSize: 13.5, textDecorationLine: 'underline' },
});
