import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { Chip } from '@/components/atoms/Chip';
import { FONTS, RADIUS } from '@/constants/themes';
import { DotsLoader } from '@/components/molecules/DotsLoader';
import { ReplyPreviewBar } from '@/components/molecules/ReplyPreview';
import type { StarterChip } from '@/constants/starters';
import type { ReplySnapshot } from '@/types/conversation';

/** Hard cap on a single message — keeps prompts inside the model's context. */
export const MAX_MESSAGE_LENGTH = 2000;
const COUNTER_THRESHOLD = MAX_MESSAGE_LENGTH - 200;

type Props = {
  /**
   * Returns false if the message was rejected (e.g. a reply is already
   * generating); the draft is then kept instead of cleared.
   */
  onSend:    (text: string) => boolean | void;
  /** Disables sending (not typing) — e.g. while a reply is generating. */
  disabled?: boolean;
  starters?: StarterChip[];
  /** Message being replied to, shown above the input. */
  replyTo?:  ReplySnapshot | null;
  onCancelReply?: () => void;
  placeholder?: string;
  /** When this changes to a non-null value the input is focused (e.g. Reply). */
  focusKey?: string | null;
};

// WAV recording options for 16kHz mono PCM — required by on-device Whisper
const IOS_WAV_OPTIONS = {
  extension:            '.wav',
  outputFormat:         'lpcm' as any,   // Audio.IOSOutputFormat.LINEARPCM
  audioQuality:         64    as any,    // Audio.IOSAudioQuality.MEDIUM
  sampleRate:           16000,
  numberOfChannels:     1,
  bitRate:              256000,
  linearPCMBitDepth:   16,
  linearPCMIsBigEndian: false,
  linearPCMIsFloat:     false,
};

/**
 * Decode a WAV file buffer to a Float32Array waveform at the file's native sample rate.
 * Finds the "data" chunk rather than assuming a fixed 44-byte header offset.
 */
function wavToFloat32(bytes: Uint8Array): Float32Array {
  // Find the "data" chunk marker
  let dataStart = 44; // standard fallback
  for (let i = 12; i < bytes.length - 8; i++) {
    if (bytes[i] === 0x64 && bytes[i+1] === 0x61 && bytes[i+2] === 0x74 && bytes[i+3] === 0x61) {
      dataStart = i + 8; // skip "data" (4) + chunk size (4)
      break;
    }
  }
  const int16 = new Int16Array(bytes.buffer, dataStart);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

export function ChatComposer({
  onSend,
  disabled,
  starters,
  replyTo,
  onCancelReply,
  placeholder = 'Ask Saga anything…',
  focusKey,
}: Props) {
  const { theme } = useAccent();
  const [text, setText]             = useState('');
  const [recording, setRecording]   = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recObj, setRecObj]         = useState<any>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (focusKey) inputRef.current?.focus();
  }, [focusKey]);

  // On-device Whisper STT (lazy-loaded from react-native-executorch)
  type STTModule = import('react-native-executorch').SpeechToTextModule;
  const sttRef = useRef<STTModule | null>(null);
  const sttInitRef = useRef(false);

  const initSTT = async () => {
    if (sttInitRef.current || Platform.OS === 'web') return;
    sttInitRef.current = true;
    try {
      const {
        SpeechToTextModule,
        WHISPER_TINY_EN,
        initExecutorch,
      } = require('react-native-executorch') as typeof import('react-native-executorch');
      const { ExpoResourceFetcher } =
        require('react-native-executorch-expo-resource-fetcher') as
        typeof import('react-native-executorch-expo-resource-fetcher');

      initExecutorch({ resourceFetcher: ExpoResourceFetcher });
      const mod = await SpeechToTextModule.fromModelName(WHISPER_TINY_EN);
      sttRef.current = mod;
    } catch {
      // STT unavailable — voice input stays hidden/no-op (no cloud fallback)
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    // Whitespace-only and busy states never reach the hook.
    if (!trimmed || disabled) return;
    const accepted = onSend(trimmed);
    if (accepted !== false) setText('');
  };

  const handleStarter = (prompt: string) => {
    if (disabled) return;
    onSend(prompt);
  };

  const startRecording = async () => {
    if (Platform.OS === 'web') return;
    // Kick off STT model init in background (downloads once, cached after)
    initSTT().catch(() => {});
    try {
      const { Audio } = await import('expo-av');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const options = Platform.OS === 'ios'
        ? {
            android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
            ios:     IOS_WAV_OPTIONS,
            web:     {},
          }
        : Audio.RecordingOptionsPresets.HIGH_QUALITY;

      const { recording: rec } = await Audio.Recording.createAsync(options);
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
      if (uri) {
        setTranscribing(true);
        try {
          await transcribeAudio(uri);
        } finally {
          setTranscribing(false);
        }
      }
    } catch (e) {
      console.warn('Recording stop failed:', e);
      setRecObj(null);
    }
  };

  /**
   * On iOS: decode WAV → on-device Whisper → setText. Fully offline.
   * On Android: voice input isn't supported in this version — the recording
   * format differs and we don't ship a cloud STT fallback.
   */
  const transcribeAudio = async (uri: string) => {
    if (Platform.OS !== 'ios' || !sttRef.current) return;
    try {
      const { readAsStringAsync } = await import('expo-file-system');
      const b64 = await readAsStringAsync(uri, { encoding: 'base64' as any });
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const waveform = wavToFloat32(bytes);
      const result = await sttRef.current.transcribe(waveform, { language: 'en' });
      const transcript = result.text.trim();
      if (transcript) {
        setText(transcript);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (e) {
      console.warn('On-device STT failed:', e);
    }
  };

  const handleMic = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const showChips = !!(starters && starters.length > 0);
  const isBusy = recording || transcribing;

  return (
    <View style={[styles.wrapper, { borderTopColor: theme.hairline }]}>
      {replyTo && onCancelReply ? (
        <ReplyPreviewBar reply={replyTo} onCancel={onCancelReply} />
      ) : null}
      {showChips && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {starters!.map((s) => (
            <Chip key={s.id} label={s.label} onPress={() => handleStarter(s.prompt)} />
          ))}
        </ScrollView>
      )}

      <View style={[styles.row, { backgroundColor: theme.surface2 }]}>
        {isBusy ? (
          <>
            <DotsLoader />
            <View style={{ flex: 1 }} />
          </>
        ) : (
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.ink }]}
            placeholder={placeholder}
            placeholderTextColor={theme.faint}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            // Grows up to ~5 lines for long questions; Return still sends.
            multiline
            submitBehavior="submit"
            maxLength={MAX_MESSAGE_LENGTH}
            // Typing stays enabled while a reply generates — only Send waits.
            accessibilityLabel="Message"
          />
        )}

        {!isBusy && text.trim() ? (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: theme.accent, opacity: disabled ? 0.4 : 1 }]}
            onPress={handleSend}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !!disabled }}
          >
            <Icon name="send" size={18} color={theme.accentFg} />
          </TouchableOpacity>
        ) : Platform.OS === 'ios' ? (
          // Voice input is iOS-only — the on-device Whisper build only ships
          // with the iOS WAV recording pipeline. Hide the mic on Android so
          // tapping it doesn't silently no-op.
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: recording ? theme.accent : theme.surface3 }]}
            onPress={handleMic}
            disabled={!recording && (disabled || transcribing)}
          >
            <Icon name="mic" size={18} color={recording ? theme.accentFg : theme.ink2} />
          </TouchableOpacity>
        ) : null}
      </View>
      {text.length >= COUNTER_THRESHOLD ? (
        <Text style={[styles.counter, { color: text.length >= MAX_MESSAGE_LENGTH ? '#C0492F' : theme.muted }]}>
          {text.length} / {MAX_MESSAGE_LENGTH}
        </Text>
      ) : null}
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
    alignItems:     'flex-end',
    gap:            8,
    // Fixed radius (not a pill) so the field still looks right when it
    // grows to several lines.
    borderRadius:   26,
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
    maxHeight:      120,
  },
  counter: {
    fontFamily: FONTS.monoRegular,
    fontSize:   10.5,
    textAlign:  'right',
    marginTop:  4,
    marginRight: 8,
  },
  iconBtn: {
    width:          42,
    height:         42,
    marginBottom:   1,
    borderRadius:   RADIUS.pill,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
