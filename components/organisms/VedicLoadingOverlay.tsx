import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '@/hooks/use-accent';
import { useLocalLLM } from '@/hooks/use-local-llm';
import { getLLMState } from '@/utils/local-llm';
import { FONTS } from '@/constants/themes';

const PHRASES = [
  'Reading planetary alignments…',
  'Mapping your nakshatra…',
  'Consulting the Brihat Parashara…',
  'Tracing the lunar mansions…',
  'Calibrating house cusps…',
  'Aligning the dasha cycles…',
  'Invoking the grahas…',
  'Charting the rashi mandala…',
];

export function VedicLoadingOverlay() {
  const { theme }        = useAccent();
  const insets           = useSafeAreaInsets();
  const { state }        = useLocalLLM();

  const [phraseIdx, setPhraseIdx] = useState(0);
  // Start hidden if model is already ready (downloaded in a previous session)
  const [visible, setVisible]     = useState(() => getLLMState().status !== 'ready');

  const opacity   = useRef(new Animated.Value(1)).current;
  const dotScale1 = useRef(new Animated.Value(0.4)).current;
  const dotScale2 = useRef(new Animated.Value(0.4)).current;
  const dotScale3 = useRef(new Animated.Value(0.4)).current;

  // Rotating phrases
  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIdx(i => (i + 1) % PHRASES.length);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  // Breathing dot animation — stop the loops on unmount so we don't keep
  // ticking against Animated.Values whose owning component is gone.
  useEffect(() => {
    const pulse = (dot: Animated.Value, delay: number) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1,   duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.4, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return loop;
    };
    const loops = [
      pulse(dotScale1, 0),
      pulse(dotScale2, 180),
      pulse(dotScale3, 360),
    ];
    return () => {
      for (const l of loops) {
        try { l.stop(); } catch {}
      }
    };
  }, [dotScale1, dotScale2, dotScale3]);

  // Fade out when ready
  useEffect(() => {
    if (state.status === 'ready') {
      Animated.timing(opacity, {
        toValue:         0,
        duration:        500,
        easing:          Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }
  }, [state.status]);

  if (!visible) return null;

  const isDownloading = state.status === 'downloading' || state.status === 'idle';
  const isError       = state.status === 'error';
  const progress      = state.status === 'downloading' ? state.progress : 0;
  const pct           = Math.round(progress * 100);

  return (
    <Animated.View
      style={[
        styles.overlay,
        { backgroundColor: theme.bg, opacity },
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.inner}>
        {/* Top eyebrow */}
        <Text style={[styles.eyebrow, { color: theme.muted }]}>Astropedia</Text>

        {/* Main headline */}
        <Text style={[styles.headline, { color: theme.ink }]}>
          Preparing your{'\n'}
          <Text style={styles.italic}>vedic cosmos.</Text>
        </Text>

        {/* Rotating phrase */}
        <Text style={[styles.phrase, { color: theme.ink2 }]}>
          {isError
            ? 'Something went wrong. Please restart the app.'
            : PHRASES[phraseIdx]}
        </Text>
      </View>

      {/* Bottom progress section */}
      <View style={styles.bottom}>
        {isDownloading && (
          <>
            <View style={[styles.track, { backgroundColor: theme.hairline2 }]}>
              <View
                style={[
                  styles.fill,
                  { backgroundColor: theme.accent, width: `${pct}%` as any },
                ]}
              />
            </View>
            <Text style={[styles.pct, { color: theme.muted }]}>
              {pct > 0 ? `${pct}%` : 'Starting…'}
            </Text>
          </>
        )}

        {/* Breathing dots while not yet showing percentage */}
        {pct === 0 && isDownloading && (
          <View style={styles.dots}>
            {[dotScale1, dotScale2, dotScale3].map((s, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: theme.accent, transform: [{ scale: s }] },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex:         999,
    justifyContent: 'space-between',
    paddingHorizontal: 36,
  },
  inner: {
    flex:       1,
    justifyContent: 'center',
    gap:        16,
  },
  eyebrow: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom:  8,
  },
  headline: {
    fontFamily: FONTS.serifRegular,
    fontSize:   46,
    lineHeight: 50,
  },
  italic: { fontFamily: FONTS.serifItalic },
  phrase: {
    fontFamily:  FONTS.sansRegular,
    fontSize:    15,
    lineHeight:  22,
    marginTop:   8,
  },
  bottom: {
    gap: 10,
  },
  track: {
    height:       3,
    borderRadius: 2,
    overflow:     'hidden',
  },
  fill: {
    height:       3,
    borderRadius: 2,
  },
  pct: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign:     'right',
  },
  dots: {
    flexDirection: 'row',
    gap:           8,
    marginTop:     4,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
});
