/**
 * The app's own keyboard (English QWERTY, Hindi and Bengali grids), built
 * to feel like the phone's: iPhone-proportioned keys, an iOS key preview
 * balloon, a long-press alternates picker you slide across, a QuickType-
 * style suggestion strip, space-bar trackpad, and the usual typing rules.
 *
 * Keys are drawn as memoized, absolutely positioned views; touches are
 * handled once on the keyboard surface and hit-tested against the layout
 * grid (taps in the gaps go to the nearest key). Each finger is tracked by
 * its touch id, and a new key-down commits a letter still held by another
 * finger (rollover), so fast two-thumb typing keeps its order. A keystroke
 * never re-renders the keyboard — only the preview balloon, the strip and,
 * when shift changes, the keys.
 *
 * No key-click sound: the system click needs a native module (iOS
 * UIDevice.playInputClick / Android playSoundEffect) and expo-audio isn't
 * installed — the subtle haptics stand in for it.
 */
import {
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeTouchEvent,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '@/hooks/use-accent';
import { FONTS, type ResolvedTheme } from '@/constants/themes';
import { LANGUAGES } from '@/utils/i18n';
import { useKeyboardApi, useKeyboardHost } from './context';
import {
  LANG_SHORT,
  alternatesFor,
  getPage,
  glyphLabel,
  hitTest,
  isIndicLabel,
  keyboardMetrics,
  layoutPage,
  pickerIndexAt,
  pickerLayout,
  type KeyDef,
  type KeyRect,
  type KeyboardMetrics,
  type LayoutLang,
  type PageId,
  type PickerLayout,
} from './layouts';
import { shouldAutoShift, type EditState } from './text-edit';
import { applySuggestion, currentWord, doubleSpace, exactFix, suggest, type Slots } from './suggest';
import { getWordList } from './wordlists';

type Shift = 'off' | 'once' | 'lock';

const LONG_PRESS_MS       = 420;   // accent picker / Indic alternates
const TRACKPAD_HOLD_MS    = 420;   // space-bar trackpad
const TRACKPAD_SLOP       = 14;    // …or a sideways drag on the space bar
const REPEAT_DELAY_MS     = 450;   // backspace: first repeat
const REPEAT_START_MS     = 105;   //            then accelerating…
const REPEAT_MIN_MS       = 50;
const WORD_DELETE_AFTER   = 1500;  //            …and whole words after 1.5 s
const WORD_REPEAT_MS      = 200;
const DOUBLE_TAP_MS       = 320;
const DOUBLE_SPACE_MS     = 450;

// ─── Haptics ─────────────────────────────────────────────────────────────────

let hapticsOn = true;
/** Turns key haptics on / off (for a future setting). */
export function setKeyboardHaptics(on: boolean) { hapticsOn = on; }

type Feel = 'key' | 'special';
function feedback(kind: Feel) {
  if (!hapticsOn) return;
  if (Platform.OS === 'android') {
    // The system keyboard's own haptic (respects the phone's touch settings).
    Haptics.performAndroidHapticsAsync(
      kind === 'key' ? Haptics.AndroidHaptics.Keyboard_Tap : Haptics.AndroidHaptics.Virtual_Key,
    ).catch(() => {});
  } else if (kind === 'key') {
    Haptics.selectionAsync().catch(() => {});
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

// ─── Colours ─────────────────────────────────────────────────────────────────

type Palette = {
  bg:       string;
  key:      string;
  special:  string;
  ink:      string;
  muted:    string;
  shadow:   string;
  divider:  string;
  accent:   string;
  accentFg: string;
};

/** Blends two #rrggbb colours (t = 0 → a, 1 → b). */
function mix(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a);
  const pb = /^#([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const ch = (shift: number) => {
    const x = (na >> shift) & 255;
    const y = (nb >> shift) & 255;
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/**
 * The system keyboard's look in the app's own (warm) tokens: light keys on
 * a grey tray with darker grey special keys in light mode; lifted grey keys
 * on a dark tray in dark mode; a 1 pt shadow under every key.
 */
function palette(theme: ResolvedTheme, dark: boolean): Palette {
  return dark
    ? {
        bg: mix(theme.surface, theme.ink, 0.06),
        key: mix(theme.surface3, theme.ink, 0.25),
        special: mix(theme.surface3, theme.ink, 0.1),
        ink: theme.ink, muted: theme.ink2, shadow: 'rgba(0, 0, 0, 0.55)',
        divider: mix(theme.surface3, theme.ink, 0.22),
        accent: theme.accent, accentFg: theme.accentFg,
      }
    : {
        bg: mix(theme.surface3, theme.ink, 0.09),
        key: theme.surface,
        special: mix(theme.surface3, theme.ink, 0.24),
        ink: theme.ink, muted: theme.ink2, shadow: 'rgba(0, 0, 0, 0.28)',
        divider: mix(theme.surface3, theme.ink, 0.3),
        accent: theme.accent, accentFg: theme.accentFg,
      };
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

type Picker = { options: string[]; layout: PickerLayout; index: number };
type Finger = {
  rect:       KeyRect;
  startX:     number;
  startY:     number;
  downAt:     number;
  /** A letter already typed by rollover (its release does nothing). */
  committed:  boolean;
  picker:     Picker | null;
  trackpad:   { x: number; y: number } | null;
  timer?:     ReturnType<typeof setTimeout>;
};

/** Where a key is drawn inside its cell. */
const drawn = (r: KeyRect, m: KeyboardMetrics) => ({
  x: r.x + m.gapX / 2,
  y: r.y + (r.h - m.keyHeight) / 2,
  w: r.w - m.gapX,
  h: m.keyHeight,
});

export function AppKeyboard() {
  const api = useKeyboardApi()!;
  const host = useKeyboardHost()!;
  const { lang, config } = host;
  const { theme, isDark } = useAccent();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('keyboard');
  const win = useWindowDimensions();

  const [width, setWidth] = useState(win.width);
  const [pageId, setPageId] = useState<PageId>(() => (config.numeric ? 'numbers' : 'letters'));
  const [nativeDigits, setNativeDigits] = useState(false);
  const [shift, setShift] = useState<Shift>(() => {
    if (lang !== 'en') return 'off';
    const st = api.getState();
    return st && shouldAutoShift(st.text, st.caret, config.autoCapitalize) ? 'once' : 'off';
  });

  const pal = useMemo(() => palette(theme, isDark), [theme, isDark]);
  const rows = getPage(lang, 'letters').rows.length;
  const metrics = useMemo(() => keyboardMetrics(width, win.height, rows), [width, win.height, rows]);
  const showStrip = config.suggestions !== false;
  const stripH = showStrip ? metrics.stripHeight : 0;
  const areaHeight = metrics.areaHeight;
  const totalHeight = stripH + areaHeight + Math.max(insets.bottom, 8);
  const page = useMemo(() => getPage(lang, pageId, nativeDigits), [lang, pageId, nativeDigits]);
  const rects = useMemo(() => layoutPage(page, width, areaHeight, metrics), [page, width, areaHeight, metrics]);

  // Report the height for the slide animation and screen spacers: set it
  // outright while sliding in, animate it when switching language.
  useLayoutEffect(() => {
    if (api.progress.get() < 0.5) api.kbHeight.set(totalHeight);
    else api.kbHeight.set(withTiming(totalHeight, { duration: 180 }));
  }, [api, totalHeight]);

  const pressed = useSharedValue('');
  const trackpadSV = useSharedValue(0);
  const popup = useRef<PopupHandle>(null);
  const strip = useRef<StripHandle>(null);

  // Latest values for handlers that run from timers.
  const live = useRef({ shift, lang, config, rects, metrics, width });
  useEffect(() => { live.current = { shift, lang, config, rects, metrics, width }; });

  const fingers = useRef(new Map<number, Finger>());
  const lastShiftTap = useRef(0);
  const lastSpace = useRef<{ at: number; text: string } | null>(null);
  const shiftHeld = useRef<{ id: number; used: boolean } | null>(null);
  const popupOwner = useRef<number | null>(null);
  /** Last exact fix, so an immediate backspace can undo it. */
  const lastFix = useRef<{ before: EditState; afterText: string } | null>(null);
  /** Caret where a fix was undone (don't fix the same word again). */
  const noFixAt = useRef(-1);
  /** Caret right after a suggestion's automatic space. */
  const autoSpaceAt = useRef(-1);

  useEffect(() => () => {
    for (const f of fingers.current.values()) if (f.timer) clearTimeout(f.timer);
  }, []);

  // ─── Shift + suggestions follow every text / caret change ─────────────────

  const applyShift = (next: Shift) => {
    if (live.current.shift === next) return;
    live.current.shift = next;
    setShift(next);
  };

  useEffect(() => {
    const onChange = (st: EditState) => {
      const { shift: s, lang: l, config: c } = live.current;
      if (l === 'en' && s !== 'lock' && !shiftHeld.current) {
        applyShift(shouldAutoShift(st.text, st.caret, c.autoCapitalize) ? 'once' : 'off');
      }
      strip.current?.update(st);
    };
    const off = api.subscribe(onChange);
    const st = api.getState();
    if (st) strip.current?.update(st);
    return off;
  }, [api]);

  // Index the word list while the keyboard slides in.
  useEffect(() => {
    if (!showStrip) return;
    const timer = setTimeout(() => getWordList(lang), 280);
    return () => clearTimeout(timer);
  }, [lang, showStrip]);

  // ─── Editing ───────────────────────────────────────────────────────────────

  const charValue = (key: KeyDef) => {
    const v = key.value ?? '';
    return live.current.lang === 'en' && live.current.shift !== 'off' ? v.toUpperCase() : v;
  };

  /** "dont" + space → "don't " (English, safe fixes only). */
  const fixWordBeforeCaret = () => {
    const { lang: l, config: c } = live.current;
    if (l !== 'en' || c.fixes === false) return;
    const st = api.getState();
    if (!st || st.caret === noFixAt.current) return;
    const { start, word } = currentWord(st.text, st.caret);
    const fix = exactFix(word);
    if (!fix) return;
    api.edit((s) => ({ text: s.text.slice(0, start) + fix + s.text.slice(s.caret), caret: start + fix.length }));
    lastFix.current = { before: st, afterText: '' };
  };

  const noteFix = () => {
    if (lastFix.current && !lastFix.current.afterText) lastFix.current.afterText = api.getValue();
  };

  const PUNCT = /^[.,?!;:।]$/;

  const typeText = (value: string) => {
    lastFix.current = null;
    // Punctuation right after a suggestion's space replaces that space.
    if (PUNCT.test(value)) {
      const st = api.getState();
      if (st && st.caret === autoSpaceAt.current && st.text[st.caret - 1] === ' ') api.backspace();
      if (value !== '।') fixWordBeforeCaret();
    }
    autoSpaceAt.current = -1;
    api.insert(value);
    noteFix();
    if (shiftHeld.current) shiftHeld.current.used = true;
  };

  const typeSpace = () => {
    const now = Date.now();
    const v = api.getValue();
    autoSpaceAt.current = -1;
    // Double space → ". " (English) / "। " (Hindi, Bengali).
    const prev = lastSpace.current;
    if (prev && now - prev.at < DOUBLE_SPACE_MS && prev.text === v) {
      lastSpace.current = null;
      if (api.edit(doubleSpace)) return;
    }
    lastFix.current = null;
    fixWordBeforeCaret();
    api.insert(' ');
    noteFix();
    lastSpace.current = { at: now, text: api.getValue() };
  };

  const doBackspace = (word: boolean) => {
    const fix = lastFix.current;
    lastFix.current = null;
    autoSpaceAt.current = -1;
    if (!word && fix && fix.afterText === api.getValue()) {
      // Undo the fix: back to the word as typed, without the space.
      api.edit(() => fix.before);
      noFixAt.current = fix.before.caret;
      return;
    }
    api.backspace(word);
  };

  const scheduleBackspace = (id: number, delay: number) => {
    const f = fingers.current.get(id);
    if (!f) return;
    f.timer = setTimeout(() => {
      const cur = fingers.current.get(id);
      if (!cur) return;
      const held = Date.now() - cur.downAt;
      const word = held >= WORD_DELETE_AFTER;
      doBackspace(word);
      feedback('key');
      const next = word ? WORD_REPEAT_MS : Math.max(REPEAT_MIN_MS, (delay === REPEAT_DELAY_MS ? REPEAT_START_MS : delay) * 0.9);
      scheduleBackspace(id, next);
    }, delay);
  };

  const pressShift = () => {
    const now = Date.now();
    const s = live.current.shift;
    if (now - lastShiftTap.current < DOUBLE_TAP_MS && s !== 'lock') applyShift('lock');
    else applyShift(s === 'off' ? 'once' : 'off');
    lastShiftTap.current = now;
  };

  const applySlot = (word: string) => {
    lastFix.current = null;
    const st = api.edit((s) => applySuggestion(s, word));
    if (st) autoSpaceAt.current = st.caret;
  };

  // ─── Touches ───────────────────────────────────────────────────────────────

  const labelFor = (key: KeyDef) =>
    live.current.lang === 'en' ? charValue(key) : key.label ?? key.value ?? '';

  const showPreview = (id: number, r: KeyRect) => {
    popupOwner.current = id;
    popup.current?.preview(drawn(r, live.current.metrics), labelFor(r.key));
  };

  const armLongPress = (id: number, f: Finger) => {
    const key = f.rect.key;
    const options = alternatesFor(key, live.current.lang, live.current.lang === 'en' && live.current.shift !== 'off');
    if (!options.length) return;
    f.timer = setTimeout(() => {
      const { metrics: m, width: w } = live.current;
      const layout = pickerLayout({ x: f.rect.x, w: f.rect.w }, options.length, w, m.gapX);
      f.picker = { options, layout, index: 0 };
      popupOwner.current = id;
      popup.current?.picker(drawn(f.rect, m), options, layout, 0);
      feedback('key');
    }, LONG_PRESS_MS);
  };

  const startTrackpad = (f: Finger, x: number, y: number) => {
    if (f.trackpad) return;
    if (f.timer) clearTimeout(f.timer);
    f.timer = undefined;
    f.trackpad = { x, y };
    trackpadSV.set(withTiming(1, { duration: 140 }));
    pressed.set('');
    api.trackpad('begin', 0, 0);
    feedback('special');
  };

  /** Types a held letter now (another finger came down — rollover). */
  const commit = (id: number, f: Finger) => {
    if (f.committed || f.picker || f.rect.key.kind !== 'char') return;
    if (f.timer) clearTimeout(f.timer);
    f.timer = undefined;
    f.committed = true;
    if (popupOwner.current === id) {
      popupOwner.current = null;
      popup.current?.hide();
    }
    typeText(charValue(f.rect.key));
  };

  const begin = (id: number, x: number, y: number) => {
    const r = hitTest(live.current.rects, x, y);
    if (!r) return;
    // Trackpad / picker in progress: other fingers are ignored.
    for (const f of fingers.current.values()) if (f.trackpad || f.picker) return;
    for (const [oid, of] of fingers.current) commit(oid, of);

    const f: Finger = { rect: r, startX: x, startY: y, downAt: Date.now(), committed: false, picker: null, trackpad: null };
    fingers.current.set(id, f);
    const key = r.key;
    pressed.set(r.uid);
    feedback(key.kind === 'char' || key.kind === 'space' ? 'key' : 'special');
    switch (key.kind) {
      case 'char':
        showPreview(id, r);
        armLongPress(id, f);
        break;
      case 'backspace':
        doBackspace(false);
        scheduleBackspace(id, REPEAT_DELAY_MS);
        break;
      case 'shift':
        pressShift();
        shiftHeld.current = { id, used: false };
        break;
      case 'space':
        f.timer = setTimeout(() => startTrackpad(f, f.startX, f.startY), TRACKPAD_HOLD_MS);
        break;
      default:
        break;
    }
  };

  const move = (id: number, x: number, y: number) => {
    const f = fingers.current.get(id);
    if (!f) return;
    if (f.picker) {
      const i = pickerIndexAt(f.picker.layout, x);
      if (i !== f.picker.index) {
        f.picker.index = i;
        popup.current?.select(i);
        feedback('key');
      }
      return;
    }
    if (f.trackpad) {
      api.trackpad('move', x - f.trackpad.x, y - f.trackpad.y);
      return;
    }
    const key = f.rect.key;
    if (key.kind === 'space') {
      if (Math.abs(x - f.startX) > TRACKPAD_SLOP) startTrackpad(f, x, y);
      return;
    }
    if (key.kind !== 'char' || f.committed) return;
    const r = hitTest(live.current.rects, x, y);
    if (!r || r.key.kind !== 'char' || r.uid === f.rect.uid) return;
    // Sliding onto another letter: the preview follows the finger.
    if (f.timer) clearTimeout(f.timer);
    f.timer = undefined;
    f.rect = r;
    pressed.set(r.uid);
    showPreview(id, r);
    armLongPress(id, f);
  };

  const end = (id: number, x: number, y: number, cancelled: boolean) => {
    const f = fingers.current.get(id);
    if (!f) return;
    fingers.current.delete(id);
    if (f.timer) clearTimeout(f.timer);
    if (popupOwner.current === id) {
      popupOwner.current = null;
      popup.current?.hide();
    }
    if (fingers.current.size === 0) pressed.set('');
    if (f.trackpad) {
      api.trackpad('end', 0, 0);
      trackpadSV.set(withTiming(0, { duration: 160 }));
      return;
    }
    const key = f.rect.key;
    if (key.kind === 'shift') {
      const held = shiftHeld.current;
      shiftHeld.current = null;
      // Shift held while typing a letter: a one-off capital, like iOS.
      if (held?.used && live.current.shift !== 'lock') applyShift('off');
      return;
    }
    if (cancelled) return;

    if (f.picker) {
      const v = f.picker.options[f.picker.index];
      if (v) typeText(v);
      return;
    }
    if (key.kind === 'char') {
      if (!f.committed) typeText(charValue(key));
      return;
    }
    // Other keys fire on release, if the finger is still on them.
    const r = hitTest(live.current.rects, x, y);
    if (!r || r.uid !== f.rect.uid) return;
    switch (key.kind) {
      case 'space':
        typeSpace();
        break;
      case 'return':
        lastFix.current = null;
        autoSpaceAt.current = -1;
        api.pressReturn();
        break;
      case 'page':
        if (key.page) setPageId(key.page);
        break;
      case 'digits':
        setNativeDigits((n) => !n);
        break;
      case 'lang':
        api.cycleLang();
        break;
      case 'globe':
        api.useSystem();
        break;
      default:
        break;
    }
  };

  const each = (e: GestureResponderEvent, fn: (t: NativeTouchEvent) => void) => {
    const list = e.nativeEvent.changedTouches;
    if (list && list.length) list.forEach(fn);
    else fn(e.nativeEvent);
  };

  const onTouchStart = (e: GestureResponderEvent) => {
    api.claimTouch();
    each(e, (tch) => begin(Number(tch.identifier), tch.locationX, tch.locationY));
  };
  const onTouchMove = (e: GestureResponderEvent) =>
    each(e, (tch) => move(Number(tch.identifier), tch.locationX, tch.locationY));
  const onTouchEnd = (e: GestureResponderEvent) =>
    each(e, (tch) => end(Number(tch.identifier), tch.locationX, tch.locationY, false));
  const onTouchCancel = () => {
    for (const id of [...fingers.current.keys()]) end(id, 0, 0, true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const returnType = config.returnKeyType ?? 'default';
  const newline = config.submitBehavior === 'newline' || (config.multiline && !config.submitBehavior);
  const langName = LANGUAGES.find((l) => l.code === lang)?.native ?? '';

  const keys = rects.map((r) => {
    const k = r.key;
    let label: string | undefined = k.label;
    let icon: IconName | undefined;
    let variant: Variant = 'special';
    let a11y = k.label ?? k.value ?? '';
    switch (k.kind) {
      case 'char':
        variant = 'char';
        label = lang === 'en' && shift !== 'off' ? (k.label ?? '').toUpperCase() : k.label;
        a11y = label ?? '';
        break;
      case 'shift':
        // Off: outline arrow on a grey key. On: filled arrow on a light key.
        // Caps lock: arrow with a bar under it.
        icon = shift === 'lock' ? 'apple-keyboard-caps' : shift === 'once' ? 'arrow-up-bold' : 'arrow-up-bold-outline';
        if (shift !== 'off') variant = 'on';
        a11y = t(shift === 'lock' ? 'a11y.capsLock' : 'a11y.shift');
        break;
      case 'backspace':
        icon = 'backspace-outline';
        a11y = t('a11y.delete');
        break;
      case 'space':
        variant = 'space';
        label = langName;
        a11y = t('a11y.space');
        break;
      case 'return':
        a11y = t('a11y.return');
        if (newline) icon = 'keyboard-return';
        else {
          const known = ['done', 'go', 'next', 'search', 'send'].includes(returnType);
          label = t(`return.${known ? returnType : 'done'}`);
          a11y = label;
          // Like iOS: go / search / send / done are the tinted action key.
          variant = returnType === 'next' ? 'special' : 'primary';
        }
        break;
      case 'lang':
        label = LANG_SHORT[lang];
        a11y = t('a11y.nextLanguage');
        break;
      case 'globe':
        icon = 'web';
        a11y = t('a11y.systemKeyboard');
        break;
      case 'page':
        a11y = t(`a11y.page.${k.page ?? 'letters'}`);
        break;
      case 'digits':
        a11y = t('a11y.digits');
        break;
      default:
        break;
    }
    const isChar = k.kind === 'char';
    const small = !isChar || (label?.length ?? 0) > 3;
    const box = drawn(r, metrics);
    return (
      <Key
        key={r.uid}
        id={r.uid}
        bx={box.x}
        by={box.y}
        bw={box.w}
        bh={box.h}
        label={label}
        icon={icon}
        variant={variant}
        fontSize={small ? (k.kind === 'space' ? metrics.fontSmall - 1 : metrics.fontSmall) : metrics.fontLetter}
        indicSize={small ? metrics.fontSmall : metrics.fontIndic}
        small={small}
        iconSize={metrics.iconSize}
        radius={metrics.radius}
        a11yLabel={a11y}
        pal={pal}
        pressed={pressed}
        trackpad={trackpadSV}
      />
    );
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== width) setWidth(w);
  };

  return (
    <View
      style={[styles.root, { height: totalHeight, backgroundColor: pal.bg, borderTopColor: pal.divider }]}
      onLayout={onLayout}
      accessible={false}
    >
      {showStrip ? (
        <SuggestionStrip
          ref={strip}
          lang={lang}
          height={stripH}
          pal={pal}
          fixes={config.fixes !== false}
          onPick={(w) => {
            feedback('key');
            applySlot(w);
          }}
          a11yLabel={t('a11y.suggestion')}
        />
      ) : null}
      <View
        style={[styles.surface, { height: areaHeight }]}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <Animated.View
          key={`${pageId}|${nativeDigits}`}
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(80)}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          {keys}
        </Animated.View>
        <KeyPopup ref={popup} pal={pal} width={width} metrics={metrics} />
      </View>
    </View>
  );
}

// ─── Key ─────────────────────────────────────────────────────────────────────

/** char / space: light keys; special: grey; on: shift engaged; primary: accent. */
type Variant = 'char' | 'space' | 'special' | 'on' | 'primary';
type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Box = { x: number; y: number; w: number; h: number };

const Key = memo(function Key({
  id, bx, by, bw, bh, label, icon, variant, fontSize, indicSize, small, iconSize, radius, a11yLabel, pal, pressed, trackpad,
}: {
  id:        string;
  bx:        number;
  by:        number;
  bw:        number;
  bh:        number;
  label?:    string;
  icon?:     IconName;
  variant:   Variant;
  fontSize:  number;
  indicSize: number;
  small:     boolean;
  iconSize:  number;
  radius:    number;
  a11yLabel: string;
  pal:       Palette;
  pressed:   SharedValue<string>;
  trackpad:  SharedValue<number>;
}) {
  const light = variant === 'char' || variant === 'space' || variant === 'on';
  const base = variant === 'primary' ? pal.accent : light ? pal.key : pal.special;
  // Letters are covered by the preview balloon; space dims; special keys
  // light up — the way the system keyboard answers a press.
  const down = variant === 'primary' ? pal.accent : variant === 'char' ? pal.key : light ? pal.special : pal.key;
  const fg = variant === 'primary' ? pal.accentFg : variant === 'space' ? pal.muted : pal.ink;

  const anim = useAnimatedStyle(() => {
    const on = pressed.get() === id;
    return {
      backgroundColor: on ? down : base,
      opacity: variant === 'primary' && on ? 0.8 : 1,
    };
  });
  const content = useAnimatedStyle(() => ({ opacity: 1 - trackpad.get() }));

  const indic = !!label && isIndicLabel(label);
  return (
    <Animated.View
      accessible
      accessibilityRole="keyboardkey"
      accessibilityLabel={a11yLabel}
      style={[
        styles.key,
        {
          left: bx,
          top: by,
          width: bw,
          height: bh,
          borderRadius: radius,
          boxShadow: `0px 1px 0px ${pal.shadow}`,
        },
        anim,
      ]}
    >
      <Animated.View style={[styles.keyContent, content]}>
        {icon ? (
          <MaterialCommunityIcons name={icon} size={iconSize} color={fg} />
        ) : (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.label,
              { fontSize: indic ? indicSize : fontSize, color: fg },
              // Indic glyphs come from the system font.
              indic ? null : { fontFamily: FONTS.sansRegular },
            ]}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </Animated.View>
  );
});

// ─── Key preview balloon + alternates picker ─────────────────────────────────

type PopupHandle = {
  preview: (key: Box, label: string) => void;
  picker:  (key: Box, options: string[], layout: PickerLayout, index: number) => void;
  select:  (index: number) => void;
  hide:    () => void;
};

type PopupState =
  | { mode: 'preview'; key: Box; label: string }
  | { mode: 'picker'; key: Box; options: string[]; layout: PickerLayout; index: number };

/**
 * The iOS key balloon: a wide rounded head above the key joined to a stem
 * that covers the key itself. The picker reuses the shape with a wider
 * head listing the alternates, the selected one tinted.
 */
function KeyPopup({ ref, pal, width, metrics }: {
  ref: Ref<PopupHandle>; pal: Palette; width: number; metrics: KeyboardMetrics;
}) {
  const [st, setSt] = useState<PopupState | null>(null);

  useImperativeHandle(ref, () => ({
    preview: (key, label) => setSt({ mode: 'preview', key, label }),
    picker: (key, options, layout, index) => setSt({ mode: 'picker', key, options, layout, index }),
    select: (index) => setSt((s) => (s && s.mode === 'picker' ? { ...s, index } : s)),
    hide: () => setSt(null),
  }), []);

  if (!st) return null;
  const k = st.key;
  const headH = Math.round(k.h * 1.18);
  const headTop = k.y - headH - Math.round(k.h * 0.12);
  const stemTop = headTop + headH - metrics.radius * 2;
  const shadow = `0px 1px 4px ${pal.shadow}`;
  const stem = (
    <View
      style={[
        styles.stem,
        {
          left: k.x, top: stemTop, width: k.w, height: k.y + k.h - stemTop,
          backgroundColor: pal.key, borderBottomLeftRadius: metrics.radius, borderBottomRightRadius: metrics.radius,
          boxShadow: shadow,
        },
      ]}
    />
  );

  if (st.mode === 'preview') {
    const headW = Math.round(Math.max(k.w * 1.5, k.w + 18));
    const left = Math.max(0, Math.min(width - headW, k.x + k.w / 2 - headW / 2));
    const indic = isIndicLabel(st.label);
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {stem}
        <View
          style={[
            styles.head,
            { left, top: headTop, width: headW, height: headH, backgroundColor: pal.key, borderRadius: metrics.radius * 1.8, boxShadow: shadow },
          ]}
        >
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.previewLabel,
              { color: pal.ink, fontSize: Math.round((indic ? metrics.fontIndic : metrics.fontLetter) * 1.45) },
              indic ? null : { fontFamily: FONTS.sansRegular },
            ]}
          >
            {glyphLabel(st.label)}
          </Text>
        </View>
        {/* Seam cover: the head's shadow mustn't cut across the stem. */}
        <View style={[styles.seam, { left: k.x, top: headTop + headH - 1, width: k.w, height: 6, backgroundColor: pal.key }]} />
      </View>
    );
  }

  const { layout, options, index } = st;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stem}
      <View
        style={[
          styles.head,
          styles.pickerHead,
          {
            left: layout.x, top: headTop, width: layout.width, height: headH,
            paddingHorizontal: layout.pad, backgroundColor: pal.key, borderRadius: metrics.radius * 1.8, boxShadow: shadow,
          },
        ]}
      >
        {layout.order.map((oi) => {
          const sel = oi === index;
          const label = options[oi];
          const indic = isIndicLabel(label);
          return (
            <View
              key={oi}
              style={[
                styles.pickerCell,
                { width: layout.cellW, height: headH - 8, borderRadius: metrics.radius },
                sel && { backgroundColor: pal.accent },
              ]}
            >
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.previewLabel,
                  { color: sel ? pal.accentFg : pal.ink, fontSize: indic ? metrics.fontIndic : metrics.fontLetter },
                  indic ? null : { fontFamily: FONTS.sansRegular },
                ]}
              >
                {glyphLabel(label)}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={[styles.seam, { left: k.x, top: headTop + headH - 1, width: k.w, height: 6, backgroundColor: pal.key }]} />
    </View>
  );
}

// ─── Suggestion strip ────────────────────────────────────────────────────────

type StripHandle = { update: (st: EditState) => void };

/**
 * QuickType-style strip: three word slots for the word at the caret. Fixed
 * height (part of the keyboard), so suggestions coming and going never
 * shift the layout. Suggestions are computed a frame after the keystroke
 * so they never delay the key itself.
 */
function SuggestionStrip({ ref, lang, height, pal, fixes, onPick, a11yLabel }: {
  ref: Ref<StripHandle>;
  lang: LayoutLang;
  height: number;
  pal: Palette;
  fixes: boolean;
  onPick: (word: string) => void;
  a11yLabel: string;
}) {
  const [slots, setSlots] = useState<Slots>([null, null, null]);
  const pending = useRef<EditState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useImperativeHandle(ref, () => ({
    update: (st) => {
      pending.current = st;
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        const s = pending.current;
        if (!s) return;
        const next = suggest(getWordList(lang), s.text, s.caret, { fixes });
        setSlots((prev) => (sameSlots(prev, next) ? prev : next));
      }, 16);
    },
  }), [lang, fixes]);

  return (
    <View style={[styles.strip, { height }]} accessibilityLabel={a11yLabel}>
      {slots.map((s, i) => (
        <View key={i} style={styles.slotWrap}>
          {i > 0 && (slots[i - 1] || s) ? <View style={[styles.slotDivider, { backgroundColor: pal.divider }]} /> : null}
          {s ? (
            <Pressable
              onPress={() => onPick(s.text)}
              accessibilityRole="button"
              accessibilityLabel={s.text}
              style={({ pressed }) => [styles.slot, pressed && { backgroundColor: pal.key }]}
            >
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                ellipsizeMode="middle"
                style={[
                  styles.slotLabel,
                  { color: pal.ink },
                  isIndicLabel(s.text) ? null : { fontFamily: FONTS.sansRegular },
                ]}
              >
                {s.typed ? `“${s.text}”` : s.text}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function sameSlots(a: Slots, b: Slots): boolean {
  return a.every((x, i) => {
    const y = b[i];
    return x === y || (!!x && !!y && x.text === y.text && x.typed === y.typed);
  });
}

const styles = StyleSheet.create({
  root: {
    width:          '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  surface: {
    width: '100%',
  },
  key: {
    position: 'absolute',
  },
  keyContent: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 2,
  },
  label: { textAlign: 'center' },
  head: {
    position:       'absolute',
    alignItems:     'center',
    justifyContent: 'center',
  },
  stem: {
    position: 'absolute',
  },
  seam: {
    position: 'absolute',
  },
  pickerHead: {
    flexDirection:  'row',
    justifyContent: 'flex-start',
  },
  pickerCell: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  previewLabel: { textAlign: 'center' },
  strip: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 4,
  },
  slotWrap: {
    flex:           1,
    height:         '100%',
    justifyContent: 'center',
  },
  slot: {
    marginHorizontal:  3,
    marginVertical:    5,
    flex:              1,
    borderRadius:      8,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 6,
  },
  slotDivider: {
    position: 'absolute',
    left:     0,
    top:      '28%',
    bottom:   '28%',
    width:    StyleSheet.hairlineWidth * 2,
  },
  slotLabel: {
    fontSize:  16,
    textAlign: 'center',
  },
});
