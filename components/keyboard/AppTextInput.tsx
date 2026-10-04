/**
 * Drop-in TextInput replacement that types with the app keyboard.
 *
 * With the app keyboard (default) the field is a non-editable display: the
 * value, a placeholder, and a blinking caret drawn after the last character
 * (the caret always sits at the end; tapping the field focuses it there).
 * Keystrokes arrive through the KeyboardProvider and are reported with
 * onChangeText exactly like a TextInput.
 *
 * After the 🌐 key, or when a screen reader is on, it renders a real
 * TextInput with the same props so the phone keyboard (dictation,
 * autocorrect, phonetic typing) is available.
 */
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type TextLayoutEvent,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useKeyboardApi, useKeyboardFocus, type FieldConfig, type FieldController } from './context';
import { displayText, graphemes, type AutoCapitalize } from './text-edit';

export type AppTextInputHandle = {
  focus:     () => void;
  blur:      () => void;
  clear:     () => void;
  isFocused: () => boolean;
};

export type AppTextInputProps = Omit<TextInputProps, 'onFocus' | 'onBlur'> & {
  /** Called without a native event when the app keyboard is in use. */
  onFocus?: (e?: unknown) => void;
  onBlur?:  (e?: unknown) => void;
  ref?:     Ref<AppTextInputHandle>;
};

const NUMERIC_TYPES = new Set(['numeric', 'number-pad', 'decimal-pad', 'phone-pad']);

/** Style keys that belong to the text rather than its box. */
const TEXT_KEYS = new Set([
  'color', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontVariant',
  'letterSpacing', 'lineHeight', 'textAlign', 'textDecorationLine',
  'textDecorationStyle', 'textDecorationColor', 'textShadowColor',
  'textShadowOffset', 'textShadowRadius', 'textTransform', 'writingDirection',
  'includeFontPadding', 'textAlignVertical', 'verticalAlign',
]);

function splitStyle(style: StyleProp<TextStyle>): { box: ViewStyle; text: TextStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const box: Record<string, unknown> = {};
  const text: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) (TEXT_KEYS.has(k) ? text : box)[k] = flat[k];
  return { box: box as ViewStyle, text: text as TextStyle };
}

export function AppTextInput(props: AppTextInputProps) {
  const {
    ref,
    value: valueProp,
    defaultValue,
    onChangeText,
    onFocus,
    onBlur,
    placeholder,
    placeholderTextColor,
    multiline = false,
    maxLength,
    autoFocus,
    onSubmitEditing,
    returnKeyType,
    editable = true,
    style,
    autoCapitalize = 'sentences',
    submitBehavior,
    blurOnSubmit,
    cursorColor,
    selectionColor,
    accessibilityLabel,
    accessibilityHint,
    testID,
    ...rest
  } = props;

  const api = useKeyboardApi();
  const { focusedId, mode } = useKeyboardFocus();
  const { theme } = useAccent();
  const { t } = useTranslation('keyboard');
  const id = useId();

  const [inner, setInner] = useState(defaultValue ?? '');
  const value = valueProp ?? inner;
  const system = !api || mode === 'system';
  const focused = focusedId === id;
  const inputRef = useRef<TextInput>(null);

  // Latest props for the controller (which is created once).
  const live = useRef({ value, props, controlled: valueProp !== undefined });
  useLayoutEffect(() => {
    live.current = { value, props, controlled: valueProp !== undefined };
  });

  const controller = useRef<FieldController>({
    getValue: () => live.current.value,
    setValue: (next) => {
      // Optimistic, so two keystrokes before the next render both land.
      live.current.value = next;
      live.current.props.onChangeText?.(next);
      if (!live.current.controlled) setInner(next);
    },
    submit: () => {
      const text = live.current.value;
      live.current.props.onSubmitEditing?.({ nativeEvent: { text } } as never);
    },
    config: (): FieldConfig => {
      const p = live.current.props;
      return {
        returnKeyType:  p.returnKeyType,
        multiline:      !!p.multiline,
        autoCapitalize: (p.autoCapitalize ?? 'sentences') as AutoCapitalize,
        submitBehavior: p.submitBehavior ?? (p.blurOnSubmit === false ? 'submit' : undefined),
        maxLength:      p.maxLength,
        numeric:        NUMERIC_TYPES.has(p.keyboardType ?? 'default'),
      };
    },
    onFocusChange: (f) => {
      if (f) live.current.props.onFocus?.();
      else live.current.props.onBlur?.();
    },
  });

  useEffect(() => api?.register(id, controller), [api, id]);

  // Leaving the screen (push / back) hides the keyboard.
  useFocusEffect(
    useCallback(() => () => api?.blur(id), [api, id]),
  );

  // A non-editable field can't keep the app keyboard.
  useEffect(() => {
    if (!editable && api?.isFocused(id) && !system) api.blur(id);
  }, [editable, api, id, system]);

  // autoFocus (app keyboard): wait for screen / modal transitions first.
  useEffect(() => {
    if (!autoFocus || !api || system || !editable) return;
    const timer = setTimeout(() => api.focus(id), 350);
    return () => clearTimeout(timer);
    // Only on mount, like TextInput.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switched to the phone keyboard while focused → focus the real input.
  useEffect(() => {
    if (!system || !api?.isFocused(id)) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [system, api, id]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (system) inputRef.current?.focus();
      else if (editable) api?.focus(id);
    },
    blur: () => {
      if (system) inputRef.current?.blur();
      else api?.blur(id);
    },
    clear: () => {
      if (system) inputRef.current?.clear();
      controller.current.setValue('');
    },
    isFocused: () => (system ? !!inputRef.current?.isFocused() : !!api?.isFocused(id)),
  }), [system, api, id, editable]);

  const label = accessibilityLabel ?? placeholder ?? t('a11y.textField');

  if (system) {
    return (
      <TextInput
        {...rest}
        ref={inputRef}
        testID={testID}
        value={valueProp}
        defaultValue={defaultValue}
        onChangeText={(text) => {
          if (valueProp === undefined) setInner(text);
          onChangeText?.(text);
        }}
        onFocus={(e) => (api ? api.focus(id) : onFocus?.(e))}
        onBlur={(e) => (api ? api.systemBlur(id) : onBlur?.(e))}
        onTouchStart={(e) => {
          api?.claimTouch();
          rest.onTouchStart?.(e);
        }}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor ?? theme.muted}
        multiline={multiline}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        editable={editable}
        style={style}
        autoCapitalize={autoCapitalize}
        submitBehavior={submitBehavior}
        blurOnSubmit={blurOnSubmit}
        cursorColor={cursorColor ?? theme.accent}
        selectionColor={selectionColor ?? theme.accent}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
      />
    );
  }

  return (
    <CustomField
      value={rest.secureTextEntry ? '\u2022'.repeat(graphemes(value).length) : value}
      placeholder={placeholder}
      placeholderColor={(placeholderTextColor as string | undefined) ?? theme.muted}
      caretColor={(cursorColor as string | undefined) ?? theme.accent}
      multiline={multiline}
      focused={focused}
      editable={editable}
      style={style}
      label={label}
      hint={accessibilityHint}
      testID={testID}
      onPress={() => api?.focus(id)}
      onTouchStart={() => api?.claimTouch()}
    />
  );
}

// ─── Display (app keyboard) ──────────────────────────────────────────────────

type CaretPos = { x: number; y: number; h: number };

function CustomField({
  value, placeholder, placeholderColor, caretColor, multiline, focused, editable,
  style, label, hint, testID, onPress, onTouchStart,
}: {
  value:            string;
  placeholder?:     string;
  placeholderColor: string;
  caretColor:       string;
  multiline:        boolean;
  focused:          boolean;
  editable:         boolean;
  style:            StyleProp<TextStyle>;
  label:            string;
  hint?:            string;
  testID?:          string;
  onPress:          () => void;
  onTouchStart:     () => void;
}) {
  const { box, text } = useMemo(() => splitStyle(style), [style]);
  const shown = value ? displayText(value) : '';
  const fontSize = text.fontSize ?? 14;
  const lineH = text.lineHeight ?? Math.round(fontSize * 1.3);

  const [caret, setCaret] = useState<CaretPos>({ x: 0, y: 0, h: lineH });
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);

  // Blink: solid while typing, then on/off.
  const blink = useSharedValue(1);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(blink);
      return;
    }
    blink.set(1);
    blink.set(
      withDelay(
        500,
        withRepeat(withSequence(withTiming(0, { duration: 90 }), withDelay(420, withTiming(1, { duration: 90 })), withDelay(420, withTiming(1, { duration: 0 }))), -1),
      ),
    );
    return () => cancelAnimation(blink);
  }, [focused, value, blink]);
  const caretStyle = useAnimatedStyle(() => ({ opacity: blink.get() }));

  // Multiline: caret after the last laid-out line.
  const onTextLayout = (e: TextLayoutEvent) => {
    const lines = e.nativeEvent.lines;
    if (!value || !lines.length) {
      setCaret({ x: 0, y: 0, h: lines[0]?.height ?? lineH });
      return;
    }
    const last = lines[lines.length - 1];
    const next = { x: last.x + last.width, y: last.y, h: last.height };
    setCaret((c) => (c.x === next.x && c.y === next.y && c.h === next.h ? c : next));
  };

  const caretH = Math.max(12, Math.min(caret.h, lineH) - 2);
  const caretView = focused ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.caret,
        { backgroundColor: caretColor, height: caretH },
        multiline
          ? { left: Math.max(0, caret.x - 1), top: caret.y + (caret.h - caretH) / 2 }
          : { left: value ? textW : 0, top: '50%', marginTop: -caretH / 2 },
        caretStyle,
      ]}
    />
  ) : null;

  // Single line: scroll horizontally so the caret stays in view.
  const shiftX = !multiline && value ? Math.min(0, boxW - textW - 3) : 0;

  return (
    <Pressable
      onPress={editable ? onPress : undefined}
      onTouchStart={editable ? onTouchStart : undefined}
      disabled={!editable}
      style={box}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityValue={{ text: value }}
      accessibilityState={{ disabled: !editable, selected: focused }}
    >
      {multiline ? (
        <View>
          <Text
            style={[text, !value && { color: placeholderColor }]}
            onTextLayout={onTextLayout}
          >
            {value ? shown : placeholder || '​'}
          </Text>
          {caretView}
        </View>
      ) : (
        <View style={styles.single} onLayout={(e: LayoutChangeEvent) => setBoxW(e.nativeEvent.layout.width)}>
          {/* In-flow copy sets the height; the visible copy scrolls. */}
          <Text style={[text, styles.ghost]} numberOfLines={1}>
            {value ? shown : placeholder || '​'}
          </Text>
          <View style={[styles.track, { transform: [{ translateX: shiftX }] }]} pointerEvents="none">
            <Text
              style={[text, !value && { color: placeholderColor }]}
              numberOfLines={1}
              onLayout={(e: LayoutChangeEvent) => setTextW(e.nativeEvent.layout.width)}
            >
              {value ? shown : placeholder || ''}
            </Text>
            {caretView}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caret: {
    position:     'absolute',
    width:        2,
    borderRadius: 1,
  },
  single: {
    overflow: 'hidden',
  },
  ghost: {
    opacity: 0,
  },
  track: {
    position:      'absolute',
    left:          0,
    top:           0,
    bottom:        0,
    width:         10000,
    flexDirection: 'row',
    alignItems:    'center',
  },
});
