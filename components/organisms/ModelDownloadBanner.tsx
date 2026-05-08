import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { useLocalLLM } from '@/hooks/use-local-llm';
import { FONTS, RADIUS } from '@/constants/themes';

export function ModelDownloadBanner() {
  const { theme } = useAccent();
  const { state, download } = useLocalLLM();

  if (state.status === 'ready' || state.status === 'idle') return null;

  const isDownloading = state.status === 'downloading';
  const isError       = state.status === 'error';
  const progress      = isDownloading ? Math.round(state.progress * 100) : 0;

  return (
    <View style={[styles.banner, { backgroundColor: theme.surface2, borderColor: theme.hairline }]}>
      <View style={styles.row}>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: theme.ink }]}>
            {isError ? 'Download failed' : 'Downloading Saga AI'}
          </Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            {isError
              ? (state as { status: 'error'; message: string }).message
              : `Llama 3.2 1B · ${progress}% — on-device, private`}
          </Text>
        </View>

        {isError && (
          <TouchableOpacity
            onPress={download}
            style={[styles.retryBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={[styles.retryLabel, { color: theme.accentFg }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>

      {isDownloading && (
        <View style={[styles.track, { backgroundColor: theme.hairline2 }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: theme.accent, width: `${progress}%` },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom:     12,
    padding:          14,
    borderRadius:     RADIUS.card,
    borderWidth:      1,
    gap:              10,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  textBlock: { flex: 1, gap: 2 },
  title: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14,
  },
  sub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    lineHeight: 17,
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      RADIUS.pill,
  },
  retryLabel: {
    fontFamily: FONTS.sansMedium,
    fontSize:   13,
  },
  track: {
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },
  fill: {
    height:       4,
    borderRadius: 2,
  },
});
