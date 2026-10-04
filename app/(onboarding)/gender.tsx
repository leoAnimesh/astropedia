import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS, RADIUS } from '@/constants/themes';
import OnboardingStore from './_store';
import { useIndicStyles } from '@/hooks/use-indic-styles';

type GenderKey = 'woman' | 'man' | 'non_binary' | 'unspecified';

// Stored as these codes; labels come from onboarding:gender.<key>.
const OPTIONS: GenderKey[] = ['woman', 'man', 'non_binary', 'unspecified'];

export default function GenderScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('onboarding');
  const indic = i18n.language !== 'en';   // taller line height for Devanagari/Bengali marks
  const [selected, setSelected] = useState<GenderKey | ''>(
    (OnboardingStore.gender as GenderKey) || '',
  );

  const handleContinue = () => {
    if (!selected) return;
    OnboardingStore.gender = selected;
    router.push('/(onboarding)/birth-date');
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.step, { color: theme.muted }, indic && { letterSpacing: 0 }]}>{t('gender.step')}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
          {t('gender.titleA')}{'\n'}
          <Text style={styles.italic}>{t('gender.titleB')}</Text>
        </Text>

        <Text style={[styles.hint, { color: theme.ink2 }]}>
          {t('gender.hint')}
        </Text>

        <View style={styles.list}>
          {OPTIONS.map((key) => {
            const isSelected = selected === key;
            return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.85}
                onPress={() => setSelected(key)}
                style={[
                  styles.option,
                  {
                    backgroundColor: theme.surface,
                    borderColor:    isSelected ? theme.accent : theme.hairline,
                    borderWidth:    isSelected ? 1.5 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, { color: theme.ink }]}>{t(`gender.${key}.label`)}</Text>
                  <Text style={[styles.optionSub, { color: theme.muted }]}>{t(`gender.${key}.sub`)}</Text>
                </View>
                {isSelected && <Icon name="check" size={16} color={theme.accent} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          label={t('common:continue')}
          variant="accent"
          fullWidth
          disabled={!selected}
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
  content: {
    flex:       1,
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
    marginBottom: 28,
  },
  list: { gap: 12 },
  option: {
    flexDirection:    'row',
    alignItems:       'center',
    padding:          16,
    borderRadius:     RADIUS.card,
  },
  optionLabel: {
    fontFamily: FONTS.serifRegular,
    fontSize:   17,
    lineHeight: 22,
  },
  optionSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 18,
    marginTop:  2,
  },
  footer: { padding: 32, paddingTop: 12 },
});
