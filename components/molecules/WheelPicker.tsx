/**
 * A single inertial, snapping wheel column (the iOS "spinner" look), built
 * from plain views so it looks and behaves the same on iOS and Android.
 *
 * How it works
 * - `pos` is a shared value holding the wheel position in *item units*: 0
 *   means items[0] is centred, 2.5 means half-way between items[2] and [3].
 *   In looping mode `pos` is unbounded and the item at virtual index k is
 *   items[k mod n].
 * - Each rendered item is absolutely positioned and computes its own
 *   transform from `pos` on the UI thread (cylinder projection: translateY =
 *   R·sin θ, rotateX = θ, plus fade and scale), so scrolling never touches JS.
 * - Only a window of virtual indices around the centre is mounted. The
 *   window is re-centred (a JS re-render) only when the centre drifts more
 *   than WINDOW_SHIFT items, i.e. a handful of times per fling, not per frame.
 * - Release: the decay end point is projected from the release velocity
 *   (same maths as withDecay), rounded to the nearest item, clamped, and then
 *   animated there with a velocity-matched ease-out — inertia and snapping in
 *   one animation with no visible "settle" step. Overscroll on a non-looping
 *   list rubber-bands and springs back.
 * - A haptic selection tick fires each time a new item crosses the centre;
 *   onChange fires once the wheel comes to rest.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';

export type WheelItem<T extends string | number> = {
  value: T;
  label: string;
  /** Shown faded; the wheel springs back off it (e.g. future months). */
  disabled?: boolean;
};

export type WheelPickerProps<T extends string | number> = {
  items: WheelItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Wrap around at the ends (hours, minutes). */
  loop?: boolean;
  itemHeight?: number;
  /** Odd number of rows visible at once. */
  visibleCount?: number;
  /** Spoken name of the column, e.g. "Month". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** Text alignment inside the column. */
  align?: 'left' | 'center' | 'right';
  /** Draw the centre band (off when a parent draws one band across columns). */
  showBand?: boolean;
};

const ANGLE_STEP = 18;               // degrees between neighbouring rows
const BUFFER = 4;                    // extra rows mounted beyond the visible ones
const WINDOW_SHIFT = 2;              // re-centre the window after this many rows
const DECAY_TIME = 0.42;             // s; projection of a decelerating fling
const SPRING = { damping: 22, stiffness: 220, mass: 0.8 } as const;
const HAPTIC_MIN_GAP = 40;           // ms; keep fast flings from buzzing

const mod = (a: number, n: number) => {
  'worklet';
  return ((a % n) + n) % n;
};

/** Virtual index nearest `from` that maps to item `index`. */
const nearestVirtual = (index: number, from: number, n: number) => {
  'worklet';
  const base = Math.round(from);
  const delta = mod(index - base, n);
  return delta > n / 2 ? base + delta - n : base + delta;
};

function WheelPickerInner<T extends string | number>({
  items,
  value,
  onChange,
  loop = false,
  itemHeight = 44,
  visibleCount = 5,
  accessibilityLabel,
  style,
  textStyle,
  align = 'center',
  showBand = true,
}: WheelPickerProps<T>) {
  const { theme } = useAccent();
  const n = items.length;
  const half = Math.floor(visibleCount / 2);
  const height = itemHeight * visibleCount;
  const radius = itemHeight / ((ANGLE_STEP * Math.PI) / 180);

  const selectedIndex = Math.max(0, items.findIndex((it) => it.value === value));

  // Worklets read these, so they live in shared values.
  const pos = useSharedValue(selectedIndex);
  const count = useSharedValue(n);
  const looping = useSharedValue(loop);
  const disabledMask = useSharedValue<boolean[]>(items.map((it) => !!it.disabled));
  const dragStart = useSharedValue(0);
  const settling = useSharedValue(false);
  const touching = useSharedValue(false);

  // Mounted window centre (JS state; changes only every WINDOW_SHIFT rows).
  const [center, setCenter] = useState(selectedIndex);
  const [commits, setCommits] = useState(0);

  // Latest props for callbacks scheduled from the UI thread.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    count.value = n;
    looping.value = loop;
    disabledMask.value = items.map((it) => !!it.disabled);
  }, [n, loop, items, count, looping, disabledMask]);

  // ── JS callbacks ───────────────────────────────────────────────────────────

  const lastHaptic = useRef(0);
  const tick = useCallback(() => {
    const now = Date.now();
    if (now - lastHaptic.current < HAPTIC_MIN_GAP) return;
    lastHaptic.current = now;
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const commit = useCallback((index: number) => {
    const list = itemsRef.current;
    const item = list[index];
    if (item && item.value !== valueRef.current) onChangeRef.current(item.value);
    // Re-run the sync effect even if the parent kept (or clamped back to)
    // its old value, so the wheel never rests on a value it doesn't hold.
    setCommits((c) => c + 1);
  }, []);

  // ── Controlled value → wheel position ──────────────────────────────────────

  useEffect(() => {
    if (settling.value || touching.value) return;   // the wheel will commit itself
    const current = pos.value;
    const target = loop ? nearestVirtual(selectedIndex, current, n) : selectedIndex;
    if (Math.abs(current - target) < 0.001) return;
    pos.value = withSpring(target, SPRING);
    setCenter(Math.round(target));
  }, [selectedIndex, n, loop, pos, settling, touching, commits]);

  // ── UI-thread reactions: haptics + window re-centring ──────────────────────

  useAnimatedReaction(
    () => Math.round(pos.value),
    (now, prev) => {
      if (prev === null || now === prev) return;
      const inRange = looping.value || (now >= 0 && now < count.value);
      if ((settling.value || touching.value) && inRange) scheduleOnRN(tick);
    },
  );
  useAnimatedReaction(
    () => Math.round(pos.value / WINDOW_SHIFT),
    (now, prev) => {
      if (prev !== null && now !== prev) scheduleOnRN(setCenter, now * WINDOW_SHIFT);
    },
  );

  // ── Animation helpers (worklets) ───────────────────────────────────────────

  const snapTo = useCallback(
    (target: number, velocity: number) => {
      'worklet';
      const dist = Math.abs(target - pos.value);
      const speed = Math.abs(velocity);
      // Ease-out cubic starts at 3·dist/duration; match the release speed.
      const duration =
        speed > 0.5 ? Math.min(1400, Math.max(220, (3 * dist * 1000) / speed)) : 240;
      settling.value = true;
      const n0 = count.value;
      const index = looping.value ? mod(target, n0) : target;
      pos.value = withTiming(
        target,
        { duration, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (!finished) return;
          settling.value = false;
          scheduleOnRN(commit, index);
        },
      );
    },
    [pos, settling, count, looping, commit],
  );

  /** Clamp to the list and step off disabled rows toward the valid side. */
  const resolveTarget = useCallback(
    (raw: number, direction: number) => {
      'worklet';
      const n0 = count.value;
      let target = Math.round(raw);
      if (!looping.value) target = Math.min(n0 - 1, Math.max(0, target));
      const mask = disabledMask.value;
      for (let step = 0; step < n0; step++) {
        const idx = looping.value ? mod(target, n0) : target;
        if (!mask[idx]) return target;
        // Walk back the way we came (disabled rows are usually at one end).
        const next = target + (direction >= 0 ? -1 : 1);
        if (!looping.value && (next < 0 || next >= n0)) break;
        target = next;
      }
      return target;
    },
    [count, looping, disabledMask],
  );

  // ── Gestures ───────────────────────────────────────────────────────────────

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-4, 4])
        .failOffsetX([-24, 24])
        .onBegin(() => {
          cancelAnimation(pos);
          touching.value = true;
          settling.value = false;
          dragStart.value = pos.value;
        })
        .onUpdate((e) => {
          let next = dragStart.value - e.translationY / itemHeight;
          if (!looping.value) {
            const maxIdx = count.value - 1;
            // Rubber band: resistance grows past the ends.
            if (next < 0) next = -(1 - 1 / (1 - next * 0.55)) / 0.55;
            else if (next > maxIdx) {
              const over = next - maxIdx;
              next = maxIdx + (1 - 1 / (1 + over * 0.55)) / 0.55;
            }
          }
          pos.value = next;
        })
        .onEnd((e) => {
          const velocity = -e.velocityY / itemHeight;      // rows per second
          const projected = pos.value + velocity * DECAY_TIME;
          const target = resolveTarget(projected, velocity);
          snapTo(target, velocity);
        })
        .onFinalize((_, success) => {
          touching.value = false;
          // Touch without a drag (or a cancelled pan): settle where we are.
          if (!success && !settling.value) {
            snapTo(resolveTarget(pos.value, 0), 0);
          }
        }),
    [pos, settling, touching, dragStart, itemHeight, looping, count, resolveTarget, snapTo],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd((e) => {
          const offset = Math.round((e.y - height / 2) / itemHeight);
          if (offset === 0) return;
          const raw = Math.round(pos.value) + offset;
          snapTo(resolveTarget(raw, offset), 0);
        }),
    [height, itemHeight, pos, resolveTarget, snapTo],
  );

  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  // ── Accessibility ──────────────────────────────────────────────────────────

  const onAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      const dir = e.nativeEvent.actionName === 'increment' ? 1 : e.nativeEvent.actionName === 'decrement' ? -1 : 0;
      if (!dir) return;
      let idx = selectedIndex;
      for (let step = 0; step < n; step++) {
        idx = loop ? mod(idx + dir, n) : Math.min(n - 1, Math.max(0, idx + dir));
        if (!items[idx]?.disabled) break;
      }
      if (idx === selectedIndex || items[idx]?.disabled) return;
      const target = loop ? nearestVirtual(idx, pos.value, n) : idx;
      pos.value = withSpring(target, SPRING);
      onChange(items[idx].value);
    },
    [selectedIndex, n, loop, items, pos, onChange],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const span = half + BUFFER;
  const virtualIndices: number[] = [];
  for (let k = center - span; k <= center + span; k++) {
    if (loop || (k >= 0 && k < n)) virtualIndices.push(k);
  }

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[{ height, overflow: 'hidden' }, style]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: items[selectedIndex]?.label ?? '' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
      >
        {showBand && (
          <View
            pointerEvents="none"
            style={[
              styles.band,
              {
                top: half * itemHeight,
                height: itemHeight,
                backgroundColor: theme.hairline,
              },
            ]}
          />
        )}
        {n > 0 &&
          virtualIndices.map((k) => {
            const item = items[mod(k, n)];
            return (
              <WheelRow
                key={k}
                index={k}
                pos={pos}
                label={item.label}
                disabled={!!item.disabled}
                top={half * itemHeight}
                itemHeight={itemHeight}
                radius={radius}
                maxDistance={half + 1}
                color={item.disabled ? theme.faint : theme.ink}
                textStyle={textStyle}
                align={align}
              />
            );
          })}
      </View>
    </GestureDetector>
  );
}

type RowProps = {
  index: number;
  pos: SharedValue<number>;
  label: string;
  disabled: boolean;
  top: number;
  itemHeight: number;
  radius: number;
  maxDistance: number;
  color: string;
  textStyle?: StyleProp<TextStyle>;
  align: 'left' | 'center' | 'right';
};

const WheelRow = memo(function WheelRow({
  index, pos, label, top, itemHeight, radius, maxDistance, color, textStyle, align,
}: RowProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const d = index - pos.value;
    const ad = Math.abs(d);
    const theta = Math.max(-80, Math.min(80, d * ANGLE_STEP));
    const rad = (theta * Math.PI) / 180;
    return {
      opacity: ad > maxDistance + 0.5 ? 0 : Math.max(0, 1 - ad * 0.3),
      transform: [
        { perspective: 600 },
        { translateY: radius * Math.sin(rad) },
        { rotateX: `${-theta}deg` },
        { scale: 1 - Math.min(ad, 3) * 0.04 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.row, { top, height: itemHeight }, animatedStyle]}
    >
      <Text
        numberOfLines={1}
        style={[styles.label, { color, textAlign: align, lineHeight: itemHeight - 8 }, textStyle]}
      >
        {label}
      </Text>
    </Animated.View>
  );
});

export const WheelPicker = memo(WheelPickerInner) as typeof WheelPickerInner;

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 10,
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  label: {
    fontFamily: FONTS.sansRegular,
    fontSize: 19,
    includeFontPadding: false,
  },
});
