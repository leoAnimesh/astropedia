import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Storage } from '@/utils/storage';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { resetOnboardingDraft } from './_store';
import { FONTS, RADIUS } from '@/constants/themes';

type Intent = {
  key:      'love' | 'career' | 'self' | 'curious';
  title:    string;
  subtitle: string;
};

const INTENTS: Intent[] = [
  { key: 'love',    title: 'Love & connection',  subtitle: 'Relationships, intimacy, the heart.' },
  { key: 'career',  title: 'Career & purpose',   subtitle: 'Work, direction, what to build.' },
  { key: 'self',    title: 'Understand myself',  subtitle: 'Your patterns, your inner weather.' },
  { key: 'curious', title: "Just curious",       subtitle: 'No agenda — show me around.' },
];

export default function IntentScreen() {
  const { theme } = useAccent();

  const setOnboardingDone = useOnboardingStore((s) => s.setDone);

  // No imperative navigation needed — flipping the store causes the
  // <Stack.Protected> guards in the root layout to swap stacks automatically.
  const handlePick = (key: Intent['key']) => {
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
        <Text style={[styles.step, { color: theme.muted }]}>One more · what brought you here</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.display, { color: theme.ink }]}>
          What&apos;s on{'\n'}
          <Text style={styles.italic}>your mind?</Text>
        </Text>

        <Text style={[styles.hint, { color: theme.ink2 }]}>
          Pick one to give Saga a starting point. You can ask about anything else, anytime.
        </Text>

        <View style={styles.list}>
          {INTENTS.map((intent) => (
            <TouchableOpacity
              key={intent.key}
              activeOpacity={0.85}
              onPress={() => handlePick(intent.key)}
              style={[styles.option, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: theme.ink }]}>{intent.title}</Text>
                <Text style={[styles.optionSub, { color: theme.muted }]}>{intent.subtitle}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={handleSkip} style={styles.skip}>
          <EyebrowLabel size={11}>Skip for now</EyebrowLabel>
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
