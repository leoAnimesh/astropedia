import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { Input } from '@/components/atoms/Input';
import { Avatar } from '@/components/atoms/Avatar';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { KeyboardSpacer } from '@/components/keyboard';
import { FONTS } from '@/constants/themes';
import OnboardingStore from './_store';
import { useIndicStyles } from '@/hooks/use-indic-styles';

export default function NameScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('onboarding');
  const indic = i18n.language !== 'en';   // taller line height for Devanagari/Bengali marks
  const [name, setName] = useState(OnboardingStore.name ?? '');
  const insets = useSafeAreaInsets();

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
        <Text style={[styles.step, { color: theme.muted }, indic && { letterSpacing: 0 }]}>{t('name.step')}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
          {t('name.titleA')}{'\n'}
          <Text style={styles.italic}>{t('name.titleB')}</Text>
        </Text>

        {name.trim().length > 0 && (
          <View style={styles.avatarPreview}>
            <Avatar name={name.trim()} size={64} />
          </View>
        )}

        <Input
          label={t('name.label')}
          placeholder={t('name.placeholder')}
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
          label={t('common:continue')}
          variant="accent"
          fullWidth
          disabled={!name.trim()}
          onPress={handleContinue}
        />
      </View>
      {/* Keeps Continue above the keyboard (ScreenLayout already pads the bottom inset). */}
      <KeyboardSpacer offset={insets.bottom} />
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
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
  displayIndic: { lineHeight: 56 },
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
