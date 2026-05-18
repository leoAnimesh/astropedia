import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS, RADIUS } from '@/constants/themes';
import OnboardingStore from './_store';

type GenderKey = 'woman' | 'man' | 'non_binary' | 'unspecified';

const OPTIONS: Array<{ key: GenderKey; label: string; sub: string }> = [
  { key: 'woman',       label: 'Woman',          sub: 'She / her' },
  { key: 'man',         label: 'Man',            sub: 'He / him' },
  { key: 'non_binary',  label: 'Non-binary',     sub: 'Or another identity' },
  { key: 'unspecified', label: 'Prefer not to say', sub: "I'll skip this for now" },
];

export default function GenderScreen() {
  const { theme } = useAccent();
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
        <Text style={[styles.step, { color: theme.muted }]}>02 / 05 — You</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.display, { color: theme.ink }]}>
          How should I{'\n'}
          <Text style={styles.italic}>refer to you?</Text>
        </Text>

        <Text style={[styles.hint, { color: theme.ink2 }]}>
          Helps Saga pick the right pronouns and (when relevant) the traditional Vedic conventions around partner readings.
        </Text>

        <View style={styles.list}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                activeOpacity={0.85}
                onPress={() => setSelected(opt.key)}
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
                  <Text style={[styles.optionLabel, { color: theme.ink }]}>{opt.label}</Text>
                  <Text style={[styles.optionSub, { color: theme.muted }]}>{opt.sub}</Text>
                </View>
                {isSelected && <Icon name="check" size={16} color={theme.accent} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          label="Continue"
          variant="accent"
          fullWidth
          disabled={!selected}
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
