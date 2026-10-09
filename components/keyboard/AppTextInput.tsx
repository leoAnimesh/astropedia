/**
 * Drop-in TextInput replacement that types with the app keyboard.
 *
 * With the app keyboard (default) the field is a non-editable display: the
 * value, a placeholder, and a blinking caret that can sit anywhere in the
 * text — tapping a word puts the caret at its nearer edge (like iOS), the
 * space-bar trackpad slides it, and a long-press opens a small edit menu
 * (Select all / Cut / Copy / Paste). Keystrokes arrive through the
 * KeyboardProvider and are reported with onChangeText exactly like a
 * TextInput.
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
  type RefObject,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
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
import { FONTS } from '@/constants/themes';
import {
  useKeyboardApi,
  useKeyboardFocus,
  type FieldConfig,
  type FieldController,
  type Selection,
} from './context';
import { displayText, graphemes, type AutoCapitalize } from './text-edit';
import {
  estimateWidth,
  indexFromPoint,
  locateCaret,
  pointFromIndex,
  snapToWordEdge,
  trackpadIndex,
  type Point,
  type TextLine,
} from './caret';
import { clipboardAvailable, copyText, readText } from './clipboard';

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

const clampSel = (s: Selection, len: number): Selection => ({
  start: Math.max(0, Math.min(s.start, s.end, len)),
  end:   Math.max(0, Math.min(Math.max(s.start, s.end), len)),
});

/** What the display shares with the field for caret math. */
type FieldLayout = { lines: TextLine[]; measure: (s: string) => number; caret: Point };

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
  const secure = !!rest.secureTextEntry;
  const inputRef = useRef<TextInput>(null);

  // Caret / selection (UTF-16 offsets into `value`).
  const [sel, setSelState] = useState<Selection>(() => ({ start: value.length, end: value.length }));
  const selRef = useRef(sel);
  const setSel = useCallback((next: Selection) => {
    const cur = selRef.current;
    if (cur.start === next.start && cur.end === next.end) return;
    selRef.current = next;
    setSelState(next);
  }, []);
  const [menu, setMenu] = useState(false);
  const layoutRef = useRef<FieldLayout | null>(null);
  const trackAnchor = useRef<Point | null>(null);

  // Latest props for the controller (which is created once).
  const live = useRef({ value, props, controlled: valueProp !== undefined });
  // The value this field last produced (or saw) — anything else is an
  // outside change (cleared after send, restored draft…) → caret to the end.
  const lastSet = useRef(value);
  useLayoutEffect(() => {
    live.current = { value, props, controlled: valueProp !== undefined };
    if (value !== lastSet.current) {
      lastSet.current = value;
      setSel({ start: value.length, end: value.length });
    }
  });

  const controller = useRef<FieldController>({
    getValue: () => live.current.value,
    setValue: (next, caret) => {
      // Optimistic, so two keystrokes before the next render both land.
      live.current.value = next;
      setMenu(false);
      lastSet.current = next;
      const c = Math.max(0, Math.min(caret ?? next.length, next.length));
      setSel({ start: c, end: c });
      live.current.props.onChangeText?.(next);
      if (!live.current.controlled) setInner(next);
    },
    getSelection: () => {
      const len = live.current.value.length;
      // Password dots don't map to the text: the caret stays at the end.
      if (live.current.props.secureTextEntry) return { start: len, end: len };
      return clampSel(selRef.current, len);
    },
    setSelection: (s) => setSel(clampSel(s, live.current.value.length)),
    trackpad: (phase, dx, dy) => {
      const L = layoutRef.current;
      if (phase === 'begin') {
        trackAnchor.current = L ? { ...L.caret } : null;
        return;
      }
      if (phase === 'end') {
        trackAnchor.current = null;
        return;
      }
      const v = live.current.value;
      if (!L || !trackAnchor.current || !v || live.current.props.secureTextEntry) return;
      const i = Math.min(v.length, trackpadIndex(L.lines, trackAnchor.current, dx, dy, L.measure));
      setSel({ start: i, end: i });
    },
    submit: () => {
      const text = live.current.value;
      live.current.props.onSubmitEditing?.({ nativeEvent: { text } } as never);
    },
    config: (): FieldConfig => {
      const p = live.current.props;
      const numeric = NUMERIC_TYPES.has(p.keyboardType ?? 'default');
      const isSecure = !!p.secureTextEntry;
      return {
        returnKeyType:  p.returnKeyType,
        multiline:      !!p.multiline,
        autoCapitalize: (p.autoCapitalize ?? 'sentences') as AutoCapitalize,
        submitBehavior: p.submitBehavior ?? (p.blurOnSubmit === false ? 'submit' : undefined),
        maxLength:      p.maxLength,
        numeric,
        suggestions:    !isSecure && !numeric && p.autoCorrect !== false,
        fixes:          !isSecure && p.autoCorrect !== false,
      };
    },
    onFocusChange: (f) => {
      if (f) {
        live.current.props.onFocus?.();
        return;
      }
      // Losing focus collapses a selection and closes the menu.
      setMenu(false);
      const s = selRef.current;
      if (s.start !== s.end) setSel({ start: s.end, end: s.end });
      live.current.props.onBlur?.();
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

  const shownValue = secure ? '•'.repeat(graphemes(value).length) : value;
  const shownSel = secure ? { start: shownValue.length, end: shownValue.length } : clampSel(sel, value.length);

  /** Tap / long-press at a text index (display index = value index). */
  const placeCaret = (index: number, exact: boolean) => {
    if (!api) return;
    if (!api.isFocused(id)) api.focus(id);
    if (secure) return;
    const len = live.current.value.length;
    const i = Math.min(len, exact ? index : snapToWordEdge(live.current.value, index));
    setSel({ start: i, end: i });
    api.selectionChanged(id);
  };

  const accent = (selectionColor as string | undefined) ?? theme.accent;
  // Edit menu (long-press): Select All, Cut / Copy (with a selection), Paste.
  const cur = clampSel(sel, value.length);
  const hasSel = cur.start !== cur.end;
  const clip = clipboardAvailable();
  const menuItems: MenuItem[] = [];
  if (menu && focused) {
    if (value && !(cur.start === 0 && cur.end === value.length)) menuItems.push({ key: 'selectAll', label: t('menu.selectAll') });
    if (hasSel && clip && !secure) {
      menuItems.push({ key: 'cut', label: t('menu.cut') });
      menuItems.push({ key: 'copy', label: t('menu.copy') });
    }
    if (clip) menuItems.push({ key: 'paste', label: t('menu.paste') });
  }

  const onMenu = (key: MenuItem['key']) => {
    setMenu(false);
    switch (key) {
      case 'selectAll':
        setSel({ start: 0, end: value.length });
        api?.selectionChanged(id);
        break;
      case 'cut':
        copyText(value.slice(cur.start, cur.end));
        api?.backspace();
        break;
      case 'copy':
        copyText(value.slice(cur.start, cur.end));
        setSel({ start: cur.end, end: cur.end });
        api?.selectionChanged(id);
        break;
      case 'paste':
        readText().then((txt) => {
          if (!txt || !api?.isFocused(id)) return;
          api.insert(multiline ? txt : txt.replace(/\s*\n\s*/g, ' '));
        }).catch(() => {});
        break;
    }
  };

  return (
    <CustomField
      value={shownValue}
      sel={shownSel}
      placeholder={placeholder}
      placeholderColor={(placeholderTextColor as string | undefined) ?? theme.muted}
      caretColor={(cursorColor as string | undefined) ?? theme.accent}
      selColor={withAlpha(accent, 0.28)}
      multiline={multiline}
      focused={focused}
      editable={editable}
      style={style}
      label={label}
      hint={accessibilityHint}
      testID={testID}
      layoutRef={layoutRef}
      onTapIndex={(i) => placeCaret(i, false)}
      onLongPressIndex={(i) => {
        placeCaret(i, true);
        if (!secure || clipboardAvailable()) setMenu(true);
      }}
      onTouchStart={() => api?.claimTouch()}
      menuItems={menuItems}
      onMenu={onMenu}
      menuColors={{ bg: theme.ink, fg: theme.surface, divider: withAlpha(theme.surface, 0.25) }}
    />
  );
}

/** `#rrggbb` + alpha → rgba(); other colour strings pass through. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ─── Display (app keyboard) ──────────────────────────────────────────────────

type MenuItem = { key: 'selectAll' | 'cut' | 'copy' | 'paste'; label: string };

function CustomField({
  value, sel, placeholder, placeholderColor, caretColor, selColor, multiline, focused, editable,
  style, label, hint, testID, layoutRef, onTapIndex, onLongPressIndex, onTouchStart, menuItems, onMenu, menuColors,
}: {
  value:            string;
  sel:              Selection;
  placeholder?:     string;
  placeholderColor: string;
  caretColor:       string;
  selColor:         string;
  multiline:        boolean;
  focused:          boolean;
  editable:         boolean;
  style:            StyleProp<TextStyle>;
  label:            string;
  hint?:            string;
  testID?:          string;
  layoutRef:        RefObject<FieldLayout | null>;
  onTapIndex:       (index: number) => void;
  onLongPressIndex: (index: number) => void;
  onTouchStart:     () => void;
  menuItems:        MenuItem[];
  onMenu:           (key: MenuItem['key']) => void;
  menuColors:       { bg: string; fg: string; divider: string };
}) {
  const { box, text } = useMemo(() => splitStyle(style), [style]);
  const shown = value ? displayText(value) : '';
  const fontSize = text.fontSize ?? 14;
  const lineH = text.lineHeight ?? Math.round(fontSize * 1.3);
  const measure = useCallback((s: string) => estimateWidth(s, fontSize), [fontSize]);

  const [lines, setLines] = useState<TextLine[]>([]);
  const [boxW, setBoxW] = useState(0);
  const [shift, setShift] = useState(0);
  const [measured, setMeasured] = useState<{ key: string; w: number } | null>(null);
  const textBox = useRef<View>(null);

  const caretIdx = Math.min(sel.end, value.length);
  const collapsed = sel.start === sel.end;

  // ── Caret position ──
  // Line ends come straight from the text layout; inside a line the prefix
  // is measured by a hidden copy (one layout pass later), with the width
  // estimate filling in until then.
  const loc = value && lines.length ? locateCaret(lines, caretIdx) : null;
  const line = loc ? lines[loc.line] : null;
  const drawnLen = line ? line.text.replace(/\n$/, '').length : 0;
  const atLineEnd = !!line && !!loc && loc.offset >= drawnLen;
  const prefix = line && loc && !atLineEnd && loc.offset > 0
    ? line.text.slice(0, loc.offset).replace(/ /g, ' ')
    : null;
  let caretX = 0;
  if (line && loc) {
    if (loc.offset === 0) caretX = line.x;
    else if (atLineEnd) caretX = line.x + line.width;
    else if (measured && prefix && measured.key === prefix) caretX = line.x + measured.w;
    else caretX = pointFromIndex(lines, caretIdx, measure).x;
  }
  const caretY = line ? line.y : 0;
  const caretLineH = line ? line.height : lineH;

  useLayoutEffect(() => {
    layoutRef.current = {
      lines,
      measure,
      caret: { x: caretX, y: caretY + caretLineH / 2 },
    };
  });

  // Single line: scroll horizontally so the caret stays in view.
  // (Adjusted during render from the previous offset, so the text only
  // scrolls as far as needed — like a real field.)
  const textW = !multiline && lines[0] ? lines[0].width : 0;
  const nextShift = multiline || !value || boxW <= 0 ? 0 : scrollFor(shift, caretX, boxW, textW);
  if (nextShift !== shift) setShift(nextShift);

  // Blink: solid while typing / moving, then on/off.
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
  }, [focused, value, sel.start, sel.end, blink]);
  const caretStyle = useAnimatedStyle(() => ({ opacity: blink.get() }));

  const onTextLayout = (e: TextLayoutEvent) => {
    if (!value) {
      setLines((l) => (l.length ? [] : l));
      return;
    }
    const next: TextLine[] = e.nativeEvent.lines.map((l) => ({ text: l.text, x: l.x, y: l.y, width: l.width, height: l.height }));
    setLines((prev) => (sameLines(prev, next) ? prev : next));
  };

  // ── Taps → caret ──
  const toIndex = (e: GestureResponderEvent, done: (i: number) => void) => {
    const { pageX, pageY } = e.nativeEvent;
    const node = textBox.current;
    if (!value || !node || !lines.length) {
      done(value.length);
      return;
    }
    node.measure((_x, _y, _w, _h, px, py) => {
      const lx = pageX - px - (multiline ? 0 : shift);
      const ly = multiline ? pageY - py : (lines[0]?.height ?? lineH) / 2;
      done(Math.min(value.length, indexFromPoint(lines, lx, ly, measure)));
    });
  };

  const caretH = Math.max(12, Math.min(caretLineH, lineH) - 2);
  const caretView = focused && collapsed ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.caret,
        { backgroundColor: caretColor, height: caretH },
        multiline
          ? { left: Math.max(0, caretX - 1), top: caretY + (caretLineH - caretH) / 2 }
          : { left: Math.max(0, caretX - (caretX > 0 ? 1 : 0)), top: '50%', marginTop: -caretH / 2 },
        caretStyle,
      ]}
    />
  ) : null;

  // Selected text gets a highlight (nested spans keep one layout).
  const body = !value
    ? null
    : focused && !collapsed
      ? (
        <>
          {shown.slice(0, sel.start)}
          <Text style={{ backgroundColor: selColor }}>{shown.slice(sel.start, sel.end)}</Text>
          {shown.slice(sel.end)}
        </>
      )
      : shown;

  const measurer = prefix ? (
    <View style={styles.measureBox} pointerEvents="none">
      <Text
        style={[text, styles.measureText]}
        numberOfLines={1}
        onTextLayout={(e) => {
          const w = e.nativeEvent.lines[0]?.width ?? 0;
          setMeasured((m) => (m && m.key === prefix && m.w === w ? m : { key: prefix, w }));
        }}
      >
        {prefix}
      </Text>
    </View>
  ) : null;

  const menu = menuItems.length ? (
    <View style={styles.menuWrap} pointerEvents="box-none">
      <View style={[styles.menu, { backgroundColor: menuColors.bg }]}>
        {menuItems.map((m, i) => (
          <Pressable
            key={m.key}
            onPress={() => onMenu(m.key)}
            accessibilityRole="button"
            accessibilityLabel={m.label}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [
              styles.menuItem,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: menuColors.divider },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.menuLabel, { color: menuColors.fg }]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  ) : null;

  return (
    <Pressable
      onPress={editable ? (e) => toIndex(e, onTapIndex) : undefined}
      onLongPress={editable ? (e) => toIndex(e, onLongPressIndex) : undefined}
      delayLongPress={450}
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
        <View ref={textBox}>
          <Text
            style={[text, !value && { color: placeholderColor }]}
            onTextLayout={onTextLayout}
          >
            {value ? body : placeholder || '​'}
          </Text>
          {caretView}
          {measurer}
        </View>
      ) : (
        <View
          ref={textBox}
          style={styles.single}
          onLayout={(e: LayoutChangeEvent) => setBoxW(e.nativeEvent.layout.width)}
        >
          {/* In-flow copy sets the height; the visible copy scrolls. */}
          <Text style={[text, styles.ghost]} numberOfLines={1}>
            {value ? shown : placeholder || '​'}
          </Text>
          <View style={[styles.track, { transform: [{ translateX: shift }] }]} pointerEvents="none">
            <View>
              <Text
                style={[text, !value && { color: placeholderColor }]}
                numberOfLines={1}
                onTextLayout={onTextLayout}
              >
                {value ? body : placeholder || ''}
              </Text>
              {caretView}
            </View>
            {measurer}
          </View>
        </View>
      )}
      {menu}
    </Pressable>
  );
}

/** Horizontal offset keeping the caret visible, moving as little as possible. */
function scrollFor(prev: number, caretX: number, boxW: number, textW: number): number {
  const pad = 3;
  let n = prev;
  if (caretX + n > boxW - pad) n = boxW - pad - caretX;
  if (caretX + n < 0) n = -caretX;
  return Math.min(0, Math.max(n, boxW - pad - textW));
}

function sameLines(a: TextLine[], b: TextLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.text !== y.text || x.x !== y.x || x.y !== y.y || x.width !== y.width || x.height !== y.height) return false;
  }
  return true;
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
  measureBox: {
    position:      'absolute',
    left:          0,
    top:           0,
    width:         10000,
    flexDirection: 'row',
    opacity:       0,
  },
  measureText: {
    flexShrink: 0,
  },
  menuWrap: {
    position:       'absolute',
    left:           0,
    right:          0,
    bottom:         '100%',
    marginBottom:   8,
    alignItems:     'center',
    zIndex:         10,
    elevation:      10,
  },
  menu: {
    flexDirection: 'row',
    borderRadius:  9,
    overflow:      'hidden',
    boxShadow:     '0px 4px 14px rgba(0, 0, 0, 0.22)',
  },
  menuItem: {
    paddingHorizontal: 13,
    height:            36,
    justifyContent:    'center',
  },
  menuLabel: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14,
  },
});
