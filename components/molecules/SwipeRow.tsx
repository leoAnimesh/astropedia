import { Platform, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

export type SwipeAction = {
  label: string;
  color: string;
  onAction: () => void;
};

type Props = {
  children: React.ReactNode;
  actions: SwipeAction[];
  onPress?: () => void;
  rowStyle?: ViewStyle;
};

const ACTION_WIDTH = 84;
const SPRING = { damping: 20, stiffness: 200 };

// Web fallback — no horizontal swipe, just tap
function WebSwipeRow({ children, onPress, rowStyle }: Props) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={rowStyle}>
      {children}
    </TouchableOpacity>
  );
}

function NativeSwipeRow({ children, actions, onPress, rowStyle }: Props) {
  const W = actions.length * ACTION_WIDTH;
  const translateX = useSharedValue(0);
  const isOpen = useSharedValue(false);

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      const base = isOpen.value ? -W : 0;
      const next = base + e.translationX;
      translateX.value = Math.max(-W - 12, Math.min(0, next));
    })
    .onEnd((e) => {
      const threshold = W * 0.4;
      const velocity  = e.velocityX;
      if (velocity < -200 || translateX.value < -threshold) {
        translateX.value = withSpring(-W, SPRING);
        isOpen.value = true;
      } else {
        translateX.value = withSpring(0, SPRING);
        isOpen.value = false;
      }
    });

  const tap = Gesture.Tap().onEnd(() => {
    if (isOpen.value) {
      translateX.value = withSpring(0, SPRING);
      isOpen.value = false;
    } else if (onPress) {
      runOnJS(onPress)();
    }
  });

  const gesture = Gesture.Race(pan, tap);

  const rowStyle2 = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const close = () => {
    translateX.value = withSpring(0, SPRING);
    isOpen.value = false;
  };

  return (
    <View style={[styles.container, rowStyle]}>
      {/* Actions revealed underneath */}
      <View style={[styles.actionsBar, { width: W }]}>
        {actions.map((a, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.actionBtn, { backgroundColor: a.color, width: ACTION_WIDTH }]}
            onPress={() => { close(); a.onAction(); }}
            activeOpacity={0.8}
          >
            <Text style={styles.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Swipeable row content */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={rowStyle2}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export function SwipeRow(props: Props) {
  if (Platform.OS === 'web') return <WebSwipeRow {...props} />;
  return <NativeSwipeRow {...props} />;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  actionsBar: {
    position:       'absolute',
    top:            0,
    bottom:         0,
    right:          0,
    flexDirection:  'row',
  },
  actionBtn: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color:      '#ffffff',
    fontSize:   13,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});
