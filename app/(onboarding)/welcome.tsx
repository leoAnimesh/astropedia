import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS } from '@/constants/themes';

export default function WelcomeScreen() {
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('onboarding');
  // Devanagari/Bengali marks need more line height than the Latin serif.
  const indic = i18n.language !== 'en';
  return (
    <ScreenLayout>
      <View style={[styles.horizon, { backgroundColor: theme.accentMuted }]} />
      <View style={styles.content}>
        <View style={styles.top}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Astropedia</Text>
          <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
            {t('welcome.titleA')}{'\n'}
            <Text style={styles.italic}>{t('welcome.titleB')}</Text>
          </Text>
          <Text style={[styles.body, { color: theme.ink2 }]}>
            {t('welcome.body')}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            label={t('welcome.begin')}
            variant="accent"
            fullWidth
            onPress={() => router.push('/(onboarding)/name')}
          />
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  horizon: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    height:   '45%',
    opacity:  0.5,
  },
  content: {
    flex:    1,
    padding: 32,
    paddingTop: 90,
    justifyContent: 'space-between',
  },
  top: {
    flex: 1,
  },
  eyebrow: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom:  18,
  },
  display: {
    fontFamily: FONTS.serifRegular,
    fontSize:   60,
    lineHeight: 60,
  },
  displayIndic: {
    fontSize:   52,
    lineHeight: 74,
  },
  italic: {
    fontFamily: FONTS.serifItalic,
  },
  body: {
    fontFamily:  FONTS.sansRegular,
    fontSize:    16.5,
    lineHeight:  25,
    marginTop:   28,
    maxWidth:    320,
  },
  actions: {
    gap: 10,
  },
});
