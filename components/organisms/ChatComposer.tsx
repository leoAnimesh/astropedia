import { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { Chip } from '@/components/atoms/Chip';
import { AppTextInput, KeyboardTouchZone } from '@/components/keyboard';
import { FONTS, RADIUS } from '@/constants/themes';
import type { StarterChip } from '@/constants/starters';

type Props = {
  onSend:    (text: string) => void;
  disabled?: boolean;
  starters?: StarterChip[];
};

export function ChatComposer({ onSend, disabled, starters }: Props) {
  const { theme } = useAccent();
  const { t }     = useTranslation('chat');
  const [text, setText] = useState('');

  // The field stays editable while a reply streams (so the next question can
  // be typed and the keyboard stays up); only sending waits.
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const showChips = !!(starters && starters.length > 0);

  return (
    <View style={[styles.wrapper, { borderTopColor: theme.hairline }]}>
      {showChips && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {starters!.map((s) => (
            <Chip key={s.id} label={s.label} onPress={() => onSend(s.prompt)} />
          ))}
        </ScrollView>
      )}

      {/* Touches here (e.g. the send button) keep the keyboard up. */}
      <KeyboardTouchZone style={[styles.row, { backgroundColor: theme.surface2 }]}>
        <AppTextInput
          style={[styles.input, { color: theme.ink }]}
          placeholder={t('composer.placeholder')}
          placeholderTextColor={theme.faint}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          submitBehavior="submit"
          multiline={false}
          accessibilityLabel={t('composer.placeholder')}
        />

        {!!text.trim() && (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: theme.accent }]}
            onPress={handleSend}
            disabled={disabled}
            accessibilityLabel={t('composer.send')}
          >
            <Icon name="send" size={18} color={theme.accentFg} />
          </TouchableOpacity>
        )}
      </KeyboardTouchZone>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop:        8,
    paddingBottom:     24,
    paddingHorizontal: 16,
    borderTopWidth:    StyleSheet.hairlineWidth,
  },
  chips: {
    flexDirection: 'row',
    gap:           8,
    paddingBottom: 10,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    borderRadius:   RADIUS.pill,
    paddingVertical: 4,
    paddingLeft:    18,
    paddingRight:   4,
    minHeight:      52,
  },
  input: {
    flex:           1,
    fontFamily:     FONTS.sansRegular,
    fontSize:       15.5,
    paddingVertical: 8,
  },
  iconBtn: {
    width:          42,
    height:         42,
    borderRadius:   RADIUS.pill,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
