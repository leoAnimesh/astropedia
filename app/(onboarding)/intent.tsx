import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Storage } from '@/utils/storage';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { resetOnboardingDraft } from './_store';
import { FONTS, RADIUS } from '@/constants/themes';

type IntentKey = 'love' | 'career' | 'self' | 'curious';

// Stored as these codes; labels come from onboarding:intent.<key>.
const INTENTS: IntentKey[] = ['love', 'career', 'self', 'curious'];

export default function IntentScreen() {
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('onboarding');
  const indic = i18n.language !== 'en';   // taller line height for Devanagari/Bengali marks

  const setOnboardingDone = useOnboardingStore((s) => s.setDone);

  // No imperative navigation needed — flipping the store causes the
  // <Stack.Protected> guards in the root layout to swap stacks automatically.
  const handlePick = (key: IntentKey) => {
    Storage.setStarterIntent(key);
    resetOnboardingDraft();
    setOnboardingDone(true);
  };

  const handleSkip = () => {
    resetOnboardingDraft();
    setOnboardingDone(true);
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={[styles.step, { color: theme.muted }, indic && { letterSpacing: 0 }]}>{t('intent.step')}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
          {t('intent.titleA')}{'\n'}
          <Text style={styles.italic}>{t('intent.titleB')}</Text>
        </Text>

        <Text style={[styles.hint, { color: theme.ink2 }]}>
          {t('intent.hint')}
        </Text>

        <View style={styles.list}>
          {INTENTS.map((key) => (
            <TouchableOpacity
              key={key}
              activeOpacity={0.85}
              onPress={() => handlePick(key)}
              style={[styles.option, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: theme.ink }]}>{t(`intent.${key}.title`)}</Text>
                <Text style={[styles.optionSub, { color: theme.muted }]}>{t(`intent.${key}.sub`)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={handleSkip} style={styles.skip}>
          <EyebrowLabel size={11}>{t('common:skipForNow')}</EyebrowLabel>
        </TouchableOpacity>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop:        20,
    paddingBottom:     8,
  },
  step: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  content: {
    flex:    1,
    padding: 32,
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
  list: {
    gap: 12,
  },
  option: {
    flexDirection:    'row',
    alignItems:       'center',
    padding:          18,
    borderRadius:     RADIUS.card,
    borderWidth:      StyleSheet.hairlineWidth,
  },
  optionTitle: {
    fontFamily: FONTS.serifRegular,
    fontSize:   19,
    lineHeight: 23,
  },
  optionSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
    marginTop:  3,
  },
  skip: {
    marginTop: 24,
    alignSelf: 'center',
  },
});
