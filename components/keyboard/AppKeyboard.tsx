/**
 * The app's own keyboard (English QWERTY, Hindi and Bengali grids).
 *
 * Keys are drawn as memoized, absolutely positioned views; touches are
 * handled once on the keyboard surface and hit-tested against the layout
 * grid, so fast two-thumb typing works (each finger is tracked by its touch
 * id) and a keystroke never re-renders the whole keyboard — only the key
 * preview bubble and, when shift changes, the letter keys.
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
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '@/hooks/use-accent';
import { FONTS, RADIUS, type ResolvedTheme } from '@/constants/themes';
import { LANGUAGES } from '@/utils/i18n';
import { useKeyboardApi, useKeyboardHost } from './context';
import {
  LANG_SHORT,
  getPage,
  hitTest,
  isIndicLabel,
  keyAreaHeight,
  layoutPage,
  glyphLabel,
  type KeyDef,
  type KeyRect,
  type PageId,
} from './layouts';
import { shouldAutoShift } from './text-edit';

type Shift = 'off' | 'once' | 'lock';

const LONG_PRESS_MS       = 380;
const REPEAT_DELAY_MS     = 420;
const REPEAT_MIN_MS       = 35;
const DOUBLE_TAP_MS       = 320;
const DOUBLE_SPACE_MS     = 450;

const tick = () => { Haptics.selectionAsync().catch(() => {}); };

type Palette = {
  bg:       string;
  key:      string;
  special:  string;
  pressed:  string;
  pressedSpecial: string;
  ink:      string;
  muted:    string;
  edge:     string;
  accent:   string;
  accentFg: string;
};

function palette(theme: ResolvedTheme, dark: boolean): Palette {
  return dark
    ? {
        bg: theme.surface, key: theme.surface3, special: theme.surface2,
        pressed: theme.surface2, pressedSpecial: theme.surface3,
        ink: theme.ink, muted: theme.muted, edge: 'rgba(0,0,0,0.35)',
        accent: theme.accent, accentFg: theme.accentFg,
      }
    : {
        bg: theme.surface3, key: theme.surface, special: theme.surface2,
        pressed: theme.surface2, pressedSpecial: theme.surface,
        ink: theme.ink, muted: theme.muted, edge: theme.hairline2,
        accent: theme.accent, accentFg: theme.accentFg,
      };
}

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
    const v = api.getValue();
    return shouldAutoShift(v, v.length, config.autoCapitalize) ? 'once' : 'off';
  });

  const pal = useMemo(() => palette(theme, isDark), [theme, isDark]);
  const areaHeight = keyAreaHeight(lang);
  const totalHeight = areaHeight + Math.max(insets.bottom, 8);
  const page = useMemo(() => getPage(lang, pageId, nativeDigits), [lang, pageId, nativeDigits]);
  const rects = useMemo(() => layoutPage(page, width, areaHeight), [page, width, areaHeight]);

  // Report the height for the slide animation and screen spacers: set it
  // outright while sliding in, animate it when switching language.
  useLayoutEffect(() => {
    if (api.progress.get() < 0.5) api.kbHeight.set(totalHeight);
    else api.kbHeight.set(withTiming(totalHeight, { duration: 180 }));
  }, [api, totalHeight]);

  const pressed = useSharedValue('');
  const preview = useRef<PreviewHandle>(null);

  // Latest values for handlers that run from timers.
  const live = useRef({ shift, lang, config, rects, page });
  useEffect(() => { live.current = { shift, lang, config, rects, page }; });

  const active = useRef(new Map<number, { rect: KeyRect; alt: boolean; timer?: ReturnType<typeof setTimeout> }>());
  const lastShiftTap = useRef(0);
  const lastSpace = useRef(0);
  const previewOwner = useRef<number | null>(null);

  useEffect(() => () => {
    for (const a of active.current.values()) if (a.timer) clearTimeout(a.timer);
  }, []);

  // ─── Editing ───────────────────────────────────────────────────────────────

  // Updates the ref too, so a second keystroke before the re-render sees it.
  const applyShift = (next: Shift) => {
    if (live.current.shift === next) return;
    live.current.shift = next;
    setShift(next);
  };

  const afterEdit = (text: string | null) => {
    const { shift: s, lang: l, config: c } = live.current;
    if (text === null || l !== 'en' || s === 'lock') return;
    applyShift(shouldAutoShift(text, text.length, c.autoCapitalize) ? 'once' : 'off');
  };

  const charValue = (key: KeyDef, alt: boolean) => {
    if (alt && key.alt) return key.alt;
    const v = key.value ?? '';
    const s = live.current.shift;
    return live.current.lang === 'en' && s !== 'off' ? v.toUpperCase() : v;
  };

  const typeChar = (key: KeyDef, alt: boolean) => {
    afterEdit(api.insert(charValue(key, alt)));
  };

  const typeSpace = () => {
    const now = Date.now();
    const v = api.getValue();
    // Double space → ". " (English), like phone keyboards.
    if (live.current.lang === 'en' && now - lastSpace.current < DOUBLE_SPACE_MS && /[A-Za-z0-9] $/.test(v)) {
      api.backspace();
      lastSpace.current = 0;
      afterEdit(api.insert('. '));
      return;
    }
    lastSpace.current = now;
    afterEdit(api.insert(' '));
  };

  const repeatBackspace = (touchId: number, delay: number) => {
    const a = active.current.get(touchId);
    if (!a) return;
    a.timer = setTimeout(() => {
      if (!active.current.has(touchId)) return;
      afterEdit(api.backspace());
      repeatBackspace(touchId, Math.max(REPEAT_MIN_MS, delay * 0.88));
    }, delay);
  };

  const pressShift = () => {
    const now = Date.now();
    const s = live.current.shift;
    if (now - lastShiftTap.current < DOUBLE_TAP_MS && s !== 'lock') applyShift('lock');
    else applyShift(s === 'off' ? 'once' : 'off');
    lastShiftTap.current = now;
  };

  // ─── Touches ───────────────────────────────────────────────────────────────

  const labelFor = (key: KeyDef, alt: boolean) => {
    if (alt && key.alt) return glyphLabel(key.alt);
    return live.current.lang === 'en' ? charValue(key, false) : key.label ?? key.value ?? '';
  };

  const begin = (touchId: number, rect: KeyRect) => {
    const key = rect.key;
    const a: { rect: KeyRect; alt: boolean; timer?: ReturnType<typeof setTimeout> } = { rect, alt: false };
    active.current.set(touchId, a);
    pressed.set(rect.uid);
    tick();
    switch (key.kind) {
      case 'char':
        previewOwner.current = touchId;
        preview.current?.show(rect, labelFor(key, false));
        if (key.alt) {
          a.timer = setTimeout(() => {
            a.alt = true;
            tick();
            if (previewOwner.current === touchId) preview.current?.show(a.rect, labelFor(key, true));
          }, LONG_PRESS_MS);
        }
        break;
      case 'backspace':
        afterEdit(api.backspace());
        repeatBackspace(touchId, REPEAT_DELAY_MS);
        break;
      case 'shift':
        pressShift();
        break;
      default:
        break;
    }
  };

  const move = (touchId: number, x: number, y: number) => {
    const a = active.current.get(touchId);
    if (!a || a.rect.key.kind !== 'char') return;
    const r = hitTest(live.current.rects, x, y);
    if (!r || r.key.kind !== 'char' || r.uid === a.rect.uid) return;
    // Sliding onto another letter: the preview follows the finger.
    if (a.timer) clearTimeout(a.timer);
    a.timer = undefined;
    a.rect = r;
    a.alt = false;
    pressed.set(r.uid);
    previewOwner.current = touchId;
    preview.current?.show(r, labelFor(r.key, false));
    if (r.key.alt) {
      a.timer = setTimeout(() => {
        a.alt = true;
        tick();
        if (previewOwner.current === touchId) preview.current?.show(r, labelFor(r.key, true));
      }, LONG_PRESS_MS);
    }
  };

  const end = (touchId: number, x: number, y: number, cancelled: boolean) => {
    const a = active.current.get(touchId);
    if (!a) return;
    active.current.delete(touchId);
    if (a.timer) clearTimeout(a.timer);
    if (previewOwner.current === touchId) {
      previewOwner.current = null;
      preview.current?.hide();
    }
    if (active.current.size === 0) pressed.set('');
    if (cancelled) return;

    const key = a.rect.key;
    if (key.kind === 'char') {
      // afterEdit re-evaluates shift, so a one-shot shift ends here.
      typeChar(key, a.alt);
      return;
    }
    // Other keys fire on release, if the finger is still on them.
    const r = hitTest(live.current.rects, x, y);
    if (!r || r.uid !== a.rect.uid) return;
    switch (key.kind) {
      case 'space':
        typeSpace();
        break;
      case 'return':
        afterEdit(api.pressReturn());
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
    each(e, (tch) => {
      const r = hitTest(live.current.rects, tch.locationX, tch.locationY);
      if (r) begin(Number(tch.identifier), r);
    });
  };
  const onTouchMove = (e: GestureResponderEvent) =>
    each(e, (tch) => move(Number(tch.identifier), tch.locationX, tch.locationY));
  const onTouchEnd = (e: GestureResponderEvent) =>
    each(e, (tch) => end(Number(tch.identifier), tch.locationX, tch.locationY, false));
  const onTouchCancel = () => {
    for (const id of [...active.current.keys()]) end(id, 0, 0, true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const returnType = config.returnKeyType ?? 'default';
  const newline = config.submitBehavior === 'newline' || (config.multiline && !config.submitBehavior);
  const langName = LANGUAGES.find((l) => l.code === lang)?.native ?? '';

  const keys = rects.map((r) => {
    const k = r.key;
    let label: string | undefined = k.label;
    let icon: IconSpec | undefined;
    let variant: Variant = 'special';
    switch (k.kind) {
      case 'char':
        variant = 'char';
        label = lang === 'en' && shift !== 'off' ? (k.label ?? '').toUpperCase() : k.label;
        break;
      case 'shift':
        icon = { name: shift === 'lock' ? 'keyboard-capslock' : 'north', accent: shift !== 'off' };
        break;
      case 'backspace':
        icon = { name: 'backspace' };
        break;
      case 'space':
        variant = 'char';
        label = langName;
        break;
      case 'return':
        if (newline) icon = { name: 'keyboard-return' };
        else if (returnType === 'send') { variant = 'primary'; icon = { name: 'arrow-upward' }; }
        else {
          variant = 'primary';
          const known = ['done', 'go', 'next', 'search', 'send'].includes(returnType);
          label = t(`return.${known ? returnType : 'done'}`);
        }
        break;
      case 'lang':
        label = LANG_SHORT[lang];
        break;
      case 'globe':
        icon = { name: 'language' };
        break;
      default:
        break;
    }
    return (
      <Key
        key={r.uid}
        id={r.uid}
        rect={r}
        label={label}
        icon={icon?.name}
        iconAccent={!!icon?.accent}
        variant={variant}
        small={k.kind !== 'char' || (label?.length ?? 0) > 3}
        muted={k.kind === 'space'}
        pal={pal}
        pressed={pressed}
      />
    );
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== width) setWidth(w);
  };

  return (
    <View
      style={[styles.root, { height: totalHeight, backgroundColor: pal.bg, borderTopColor: pal.edge }]}
      onLayout={onLayout}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
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
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(90)}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          {keys}
        </Animated.View>
        <KeyPreview ref={preview} pal={pal} width={width} />
      </View>
    </View>
  );
}

// ─── Key ─────────────────────────────────────────────────────────────────────

type Variant = 'char' | 'special' | 'primary';
type IconSpec = { name: ComponentProps<typeof MaterialIcons>['name']; accent?: boolean };

const GAP_X = 2.5;
const GAP_Y = 4;

const Key = memo(function Key({
  id, rect, label, icon, iconAccent, variant, small, muted, pal, pressed,
}: {
  id:      string;
  rect:    KeyRect;
  label?:  string;
  icon?:   IconSpec['name'];
  iconAccent: boolean;
  variant: Variant;
  small:   boolean;
  muted:   boolean;
  pal:     Palette;
  pressed: SharedValue<string>;
}) {
  const base = variant === 'char' ? pal.key : variant === 'primary' ? pal.accent : pal.special;
  const down = variant === 'char' ? pal.pressed : variant === 'primary' ? pal.accent : pal.pressedSpecial;
  const fg = variant === 'primary' ? pal.accentFg : muted ? pal.muted : pal.ink;

  const anim = useAnimatedStyle(() => {
    const on = pressed.get() === id;
    return {
      backgroundColor: on ? down : base,
      opacity: variant === 'primary' && on ? 0.85 : 1,
    };
  });

  const indic = !!label && isIndicLabel(label);
  return (
    <Animated.View
      style={[
        styles.key,
        {
          left:   rect.x + GAP_X,
          top:    rect.y + GAP_Y / 2,
          width:  rect.w - GAP_X * 2,
          height: rect.h - GAP_Y,
          borderBottomColor: pal.edge,
        },
        anim,
      ]}
    >
      {icon ? (
        <MaterialIcons name={icon} size={21} color={iconAccent ? pal.accent : fg} />
      ) : (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[
            styles.label,
            small ? styles.labelSmall : indic ? styles.labelIndic : styles.labelLatin,
            // Indic glyphs come from the system font.
            indic ? null : { fontFamily: small ? FONTS.sansMedium : FONTS.sansRegular },
            { color: fg },
          ]}
        >
          {label}
        </Text>
      )}
    </Animated.View>
  );
});

// ─── Key preview bubble ──────────────────────────────────────────────────────

type PreviewHandle = { show: (rect: KeyRect, label: string) => void; hide: () => void };

function KeyPreview({ ref, pal, width }: { ref: Ref<PreviewHandle>; pal: Palette; width: number }) {
  const [content, setContent] = useState<{ label: string; x: number; y: number; w: number; h: number } | null>(null);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);

  useImperativeHandle(ref, () => ({
    show: (rect, label) => {
      const w = Math.max(rect.w + 14, 46);
      const h = Math.min(rect.h + 18, 64);
      const x = Math.max(2, Math.min(width - w - 2, rect.x + rect.w / 2 - w / 2));
      const y = rect.y - h + GAP_Y;
      setContent({ label, x, y, w, h });
      opacity.set(withTiming(1, { duration: 60 }));
      scale.set(0.7);
      scale.set(withSpring(1, { damping: 14, stiffness: 420, mass: 0.6 }));
    },
    hide: () => {
      opacity.set(withTiming(0, { duration: 90 }));
    },
  }), [opacity, scale, width]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  if (!content) return null;
  const indic = isIndicLabel(content.label);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.preview,
        { left: content.x, top: content.y, width: content.w, height: content.h, backgroundColor: pal.key },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.previewLabel, indic ? null : { fontFamily: FONTS.sansRegular }, { color: pal.ink }]}
      >
        {content.label}
      </Text>
    </Animated.View>
  );
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
    position:          'absolute',
    borderRadius:      RADIUS.small - 3,
    borderBottomWidth: 1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 2,
  },
  label:      { textAlign: 'center' },
  labelLatin: { fontSize: 22 },
  labelIndic: { fontSize: 20 },
  labelSmall: { fontSize: 14 },
  preview: {
    position:       'absolute',
    borderRadius:   RADIUS.small,
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOpacity:  0.18,
    shadowRadius:   8,
    shadowOffset:   { width: 0, height: 3 },
    elevation:      6,
  },
  previewLabel: { fontSize: 30, textAlign: 'center' },
});
