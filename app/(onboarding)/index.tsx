import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS, RADIUS } from '@/constants/themes';
import { LANGUAGES, deviceLanguage, setAppLanguage, storedLanguage, type AppLanguage } from '@/utils/i18n';

// First onboarding step. Nothing has been chosen yet, so the heading is shown
// in all three languages and each option is written in its own script.
const CONTINUE: Record<AppLanguage, string> = {
  en: 'Continue',
  hi: 'आगे बढ़ें',
  bn: 'এগিয়ে যান',
};

export default function LanguageScreen() {
  const { theme } = useAccent();
  const [picked, setPicked] = useState<AppLanguage>(storedLanguage() ?? deviceLanguage());

  const handleContinue = async () => {
    await setAppLanguage(picked);
    router.push('/(onboarding)/welcome');
  };

  return (
    <ScreenLayout>
      <View style={styles.content}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Astropedia</Text>
          <Text style={[styles.display, { color: theme.ink }]}>
            Choose your <Text style={styles.italic}>language</Text>
          </Text>
          <Text style={[styles.alt, { color: theme.ink2 }]}>अपनी भाषा चुनें · আপনার ভাষা বেছে নিন</Text>
        </View>

        <View style={styles.options} accessibilityRole="radiogroup">
          {LANGUAGES.map((l) => {
            const selected = l.code === picked;
            return (
              <TouchableOpacity
                key={l.code}
                activeOpacity={0.85}
                onPress={() => setPicked(l.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${l.native}, ${l.label}`}
                style={[
                  styles.option,
                  {
                    backgroundColor: theme.surface,
                    borderColor:     selected ? theme.accent : theme.hairline2,
                    borderWidth:     selected ? 2 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.native, { color: theme.ink }]}>{l.native}</Text>
                  {l.code !== 'en' && (
                    <Text style={[styles.label, { color: theme.muted }]}>{l.label}</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: selected ? theme.accent : theme.hairline2, backgroundColor: selected ? theme.accent : 'transparent' },
                  ]}
                >
                  {selected && <Icon name="check" size={14} color={theme.accentFg} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Button label={CONTINUE[picked]} variant="accent" fullWidth onPress={handleContinue} />
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    flex:           1,
    padding:        32,
    paddingTop:     90,
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom:  18,
  },
  display: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      44,
    lineHeight:    48,
    letterSpacing: -0.5,
  },
  italic: { fontFamily: FONTS.serifItalic },
  alt: {
    fontSize:   17,
    lineHeight: 26,
    marginTop:  14,
  },
  options: { gap: 12 },
  option: {
    flexDirection:     'row',
    alignItems:        'center',
    minHeight:         72,
    paddingHorizontal: 20,
    paddingVertical:   14,
    borderRadius:      RADIUS.card,
  },
  native: {
    fontSize:   22,
    lineHeight: 30,
  },
  label: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    marginTop:  2,
  },
  radio: {
    width:          26,
    height:         26,
    borderRadius:   13,
    borderWidth:    2,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
