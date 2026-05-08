import { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { Chip } from '@/components/atoms/Chip';
import { FONTS, RADIUS } from '@/constants/themes';
import { DotsLoader } from '@/components/molecules/DotsLoader';
import type { StarterChip } from '@/constants/starters';

type Props = {
  onSend:    (text: string) => void;
  disabled?: boolean;
  starters?: StarterChip[];
};

export function ChatComposer({ onSend, disabled, starters }: Props) {
  const { theme } = useAccent();
  const [text, setText]       = useState('');
  const [recording, setRecording] = useState(false);
  const [recObj, setRecObj]   = useState<any>(null);
  const inputRef = useRef<TextInput>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const startRecording = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { Audio } = await import('expo-av');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecObj(rec);
      setRecording(true);
    } catch (e) {
      console.warn('Recording start failed:', e);
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    if (!recObj) return;
    try {
      await recObj.stopAndUnloadAsync();
      const uri = recObj.getURI() as string | null;
      setRecObj(null);
      if (uri) await transcribe(uri);
    } catch (e) {
      console.warn('Recording stop failed:', e);
      setRecObj(null);
    }
  };

  const transcribe = async (uri: string) => {
    const key = process.env.EXPO_PUBLIC_GROQ_KEY;
    if (!key || key.startsWith('your_')) return;
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en');
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method:  'POST',
        headers: { Authorization: `Bearer ${key}` },
        body:    formData,
      });
      const data = await res.json() as { text?: string };
      const transcript = data.text?.trim() ?? '';
      if (transcript) {
        setText(transcript);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (e) {
      console.warn('Transcription failed:', e);
    }
  };

  const handleMic = () => {
    if (recording) stopRecording();
    else startRecording();
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

      <View style={[styles.row, { backgroundColor: theme.surface2 }]}>
        {recording ? (
          <>
            <DotsLoader />
            <View style={{ flex: 1 }} />
          </>
        ) : (
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.ink }]}
            placeholder="Ask Saga anything…"
            placeholderTextColor={theme.faint}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline={false}
            editable={!disabled}
          />
        )}

        {!recording && text.trim() ? (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: theme.accent }]}
            onPress={handleSend}
            disabled={disabled}
          >
            <Icon name="send" size={18} color={theme.accentFg} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: recording ? theme.accent : theme.surface3 }]}
            onPress={handleMic}
            disabled={!recording && disabled}
          >
            <Icon name="mic" size={18} color={recording ? theme.accentFg : theme.ink2} />
          </TouchableOpacity>
        )}
      </View>
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
