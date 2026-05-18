import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { Input } from '@/components/atoms/Input';
import { Avatar } from '@/components/atoms/Avatar';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS } from '@/constants/themes';
import OnboardingStore from './_store';

export default function NameScreen() {
  const { theme } = useAccent();
  const [name, setName] = useState(OnboardingStore.name ?? '');

  const handleContinue = () => {
    OnboardingStore.name = name.trim();
    router.push('/(onboarding)/gender');
  };

  return (
    <ScreenLayout>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.step, { color: theme.muted }]}>01 / 05 — You</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.display, { color: theme.ink }]}>
          What should I{'\n'}
          <Text style={styles.italic}>call you?</Text>
        </Text>

        {name.trim().length > 0 && (
          <View style={styles.avatarPreview}>
            <Avatar name={name.trim()} size={64} />
          </View>
        )}

        <Input
          label="First name"
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleContinue}
          containerStyle={styles.input}
        />
      </View>

      <View style={styles.footer}>
        <Button
          label="Continue"
          variant="accent"
          fullWidth
          disabled={!name.trim()}
          onPress={handleContinue}
        />
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop:     20,
    paddingBottom:  8,
  },
  backBtn: {
    padding: 4,
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
    fontFamily: FONTS.serifRegular,
    fontSize:   40,
    lineHeight: 44,
    marginBottom: 32,
  },
  italic: {
    fontFamily: FONTS.serifItalic,
  },
  avatarPreview: {
    marginBottom: 24,
  },
  input: {
    marginTop: 8,
  },
  footer: {
    padding: 32,
    paddingTop: 0,
  },
});
