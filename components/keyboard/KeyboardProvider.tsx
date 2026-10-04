/**
 * In-app keyboard: focus tracking, show/hide animation and keyboard height.
 *
 * Every AppTextInput registers a controller here. When one is focused and
 * the user hasn't switched to the phone's keyboard (🌐), the keyboard host
 * slides the app keyboard (AppKeyboard) up from the bottom; keystrokes are
 * applied to the focused field through its controller.
 *
 * Screens reserve room for the keyboard with <KeyboardSpacer /> (it tracks
 * the app keyboard and, in system mode, the phone keyboard).
 *
 * Hosts: the provider renders the root host. On iOS it lives in a
 * FullWindowOverlay (mounted only while shown) so it also covers native
 * modal screens. React Native <Modal>s are separate windows, so a modal that
 * contains text fields renders its own <KeyboardHost /> — the most recently
 * mounted host draws the keyboard.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { FullWindowOverlay } from 'react-native-screens';
import { Storage } from '@/utils/storage';
import { getAppLanguage } from '@/utils/i18n';
import { LAYOUT_LANGS, type LayoutLang } from './layouts';
import { insertText, deleteBackward } from './text-edit';
import {
  ApiContext,
  DEFAULT_CONFIG,
  FocusContext,
  HostContext,
  ROOT_HOST,
  useKeyboardApi,
  useKeyboardHost,
  type ControllerRef,
  type FieldConfig,
  type FocusState,
  type HostState,
  type KeyboardApi,
  type KeyboardMode,
} from './context';
import { AppKeyboard } from './AppKeyboard';
import { SystemKeyboardPill } from './SystemKeyboardPill';

// One curve pair drives the keyboard frame AND the screen spacers (they read
// the same shared value), so content moves frame-by-frame with the keyboard.
const SHOW_MS = 250;
const HIDE_MS = 220;
const SHOW_EASING = Easing.out(Easing.cubic);
const HIDE_EASING = Easing.inOut(Easing.cubic);
// Approximation of the iOS keyboard curve, for system-keyboard tracking.
const IOS_KB_EASING = Easing.bezier(0.38, 0.7, 0.125, 1);

// ─── Provider ────────────────────────────────────────────────────────────────

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [storedMode, setStoredMode] = useState<KeyboardMode>(() => Storage.getKeyboardMode());
  const [screenReader, setScreenReader] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [lang, setLang] = useState<LayoutLang>('en');
  const [config, setConfig] = useState<FieldConfig>(DEFAULT_CONFIG);
  const [mounted, setMounted] = useState(false);
  const [hosts, setHosts] = useState<string[]>([]);
  const [nativeVisible, setNativeVisible] = useState(false);

  // Screen-reader users and web always get the system keyboard.
  const mode: KeyboardMode = screenReader || Platform.OS === 'web' ? 'system' : storedMode;

  const progress     = useSharedValue(0);
  const kbHeight     = useSharedValue(320);
  const nativeHeight = useSharedValue(0);
  const nativeFull   = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const controllers = useRef(new Map<string, ControllerRef>());
  const focusedRef  = useRef<string | null>(null);
  const modeRef     = useRef<KeyboardMode>(mode);
  const langByField = useRef(new Map<string, LayoutLang>());
  const claimed     = useRef(false);
  const gestureClaimed = useRef(false);
  const rootH       = useRef(0);
  const baseH       = useRef(0);
  const nativeVisibleRef = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Screen reader on/off.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (alive) setScreenReader(on); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { alive = false; sub.remove(); };
  }, []);

  const current = useCallback(
    () => (focusedRef.current ? controllers.current.get(focusedRef.current)?.current ?? null : null),
    [],
  );

  const setFocus = useCallback((id: string | null, notify = true) => {
    const prev = focusedRef.current;
    if (prev === id) return;
    focusedRef.current = id;
    if (notify && prev) controllers.current.get(prev)?.current.onFocusChange(false);
    setFocusedId(id);
    if (id) {
      const c = controllers.current.get(id)?.current;
      setConfig(c ? c.config() : DEFAULT_CONFIG);
      setLang(langByField.current.get(id) ?? getAppLanguage());
      if (notify) c?.onFocusChange(true);
    }
  }, []);

  const visibleRef = useRef(false);
  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unmount only if nothing asked for the keyboard again meanwhile.
  const finishHide = useCallback(() => {
    if (!visibleRef.current) setMounted(false);
  }, []);

  const runHide = useCallback(() => {
    progress.set(
      withTiming(0, { duration: reduceMotion ? 0 : HIDE_MS, easing: HIDE_EASING }, (finished) => {
        if (finished) scheduleOnRN(finishHide);
      }),
    );
  }, [progress, reduceMotion, finishHide]);

  // Field unmounted while focused: slide down like any other hide.
  const hideNow = useCallback(() => {
    visibleRef.current = false;
    runHide();
  }, [runHide]);

  // ─── Show / hide ───────────────────────────────────────────────────────────
  const visible = focusedId !== null && mode === 'custom';
  // Mount as soon as it should show; unmount once the hide animation ends.
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    visibleRef.current = visible;
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (visible) {
      progress.set(withTiming(1, { duration: reduceMotion ? 0 : SHOW_MS, easing: SHOW_EASING }));
    } else {
      // Tiny grace period: moving focus between fields (blur then focus) must
      // not start a down-and-up animation.
      hideTimer.current = setTimeout(() => {
        hideTimer.current = null;
        if (!visibleRef.current) runHide();
      }, 30);
    }
    return () => {
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    };
  }, [visible, progress, reduceMotion, runHide]);

  // Android hardware back closes the app keyboard first.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setFocus(null);
      return true;
    });
    return () => sub.remove();
  }, [visible, setFocus]);

  // ─── Phone keyboard height (system mode) ───────────────────────────────────
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const h = e.endCoordinates.height;
      nativeVisibleRef.current = true;
      setNativeVisible(true);
      if (ios) {
        nativeFull.set(h);
        nativeHeight.set(withTiming(h, { duration: e.duration || 250, easing: IOS_KB_EASING }));
      } else {
        // With adjustResize the window may already have shrunk; only pad
        // whatever the keyboard still covers.
        setTimeout(() => {
          const shrink = Math.max(0, baseH.current - rootH.current);
          const eff = Math.max(0, h - shrink);
          nativeFull.set(eff);
          nativeHeight.set(withTiming(eff, { duration: reduceMotion ? 0 : 180 }));
        }, 60);
      }
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      nativeVisibleRef.current = false;
      setNativeVisible(false);
      nativeHeight.set(
        withTiming(0, {
          duration: ios ? e.duration || 250 : reduceMotion ? 0 : 180,
          easing: ios ? IOS_KB_EASING : undefined,
        }),
      );
    });
    return () => { show.remove(); hide.remove(); };
  }, [nativeHeight, nativeFull, reduceMotion]);

  const onRootLayout = useCallback((e: LayoutChangeEvent) => {
    rootH.current = e.nativeEvent.layout.height;
    if (!nativeVisibleRef.current) baseH.current = rootH.current;
  }, []);

  // ─── Outside taps ──────────────────────────────────────────────────────────
  const onRootTouchStart = useCallback((e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length <= 1) gestureClaimed.current = claimed.current;
    else gestureClaimed.current = gestureClaimed.current || claimed.current;
    claimed.current = false;
  }, []);

  const dismiss = useCallback((): boolean => {
    if (!focusedRef.current) return false;
    if (modeRef.current === 'system') Keyboard.dismiss();
    setFocus(null);
    return true;
  }, [setFocus]);

  const onRootTouchEnd = useCallback((e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length > 0) return;
    if (!gestureClaimed.current) dismiss();
    gestureClaimed.current = false;
  }, [dismiss]);

  // ─── API ───────────────────────────────────────────────────────────────────
  const api = useMemo<KeyboardApi>(() => {
    const edit = (fn: (text: string) => { text: string } | null): string | null => {
      const c = current();
      if (!c) return null;
      const before = c.getValue();
      const next = fn(before);
      if (!next) return null;
      if (next.text !== before) c.setValue(next.text);
      return next.text;
    };
    return {
      register: (id, ref) => {
        controllers.current.set(id, ref);
        return () => {
          controllers.current.delete(id);
          langByField.current.delete(id);
          if (focusedRef.current === id) {
            setFocus(null, false);
            hideNow();
          }
        };
      },
      focus: (id) => setFocus(id),
      blur: (id) => {
        if (focusedRef.current !== id) return;
        if (modeRef.current === 'system') Keyboard.dismiss();
        setFocus(null);
      },
      dismiss,
      isFocused: (id) => focusedRef.current === id,
      systemBlur: (id) => {
        if (modeRef.current === 'system' && focusedRef.current === id) setFocus(null);
      },
      claimTouch: () => { claimed.current = true; },
      getValue: () => current()?.getValue() ?? '',
      insert: (text) => {
        const max = current()?.config().maxLength;
        return edit((v) => insertText({ text: v, caret: v.length }, text, max));
      },
      backspace: () => edit((v) => deleteBackward({ text: v, caret: v.length })),
      pressReturn: () => {
        const c = current();
        if (!c) return null;
        const cfg = c.config();
        const newline = cfg.submitBehavior === 'newline' || (cfg.multiline && !cfg.submitBehavior);
        if (newline) return edit((v) => insertText({ text: v, caret: v.length }, '\n', cfg.maxLength));
        c.submit();
        if (cfg.submitBehavior !== 'submit') setFocus(null);
        return null;
      },
      cycleLang: () => {
        const id = focusedRef.current;
        if (!id) return;
        setLang((l) => {
          const next = LAYOUT_LANGS[(LAYOUT_LANGS.indexOf(l) + 1) % LAYOUT_LANGS.length];
          langByField.current.set(id, next);
          return next;
        });
      },
      useSystem: () => {
        modeRef.current = 'system';
        Storage.setKeyboardMode('system');
        setStoredMode('system');
      },
      useCustom: () => {
        modeRef.current = 'custom';
        Storage.setKeyboardMode('custom');
        setStoredMode('custom');
        Keyboard.dismiss();
      },
      pushHost: (id) => {
        setHosts((h) => [...h.filter((x) => x !== id), id]);
        return () => setHosts((h) => h.filter((x) => x !== id));
      },
      progress,
      kbHeight,
      nativeHeight,
      nativeFull,
    };
  }, [current, setFocus, hideNow, dismiss, progress, kbHeight, nativeHeight, nativeFull]);

  const focusState = useMemo<FocusState>(() => ({ focusedId, mode }), [focusedId, mode]);

  const pillVisible = mode === 'system' && !screenReader && Platform.OS !== 'web' && nativeVisible && focusedId !== null;
  const hostState = useMemo<HostState>(
    () => ({
      topHost: hosts.length ? hosts[hosts.length - 1] : ROOT_HOST,
      mounted,
      pillVisible,
      lang,
      config,
      focusedId,
    }),
    [hosts, mounted, pillVisible, lang, config, focusedId],
  );

  return (
    <ApiContext.Provider value={api}>
      <FocusContext.Provider value={focusState}>
        <HostContext.Provider value={hostState}>
          <View
            style={styles.fill}
            onLayout={onRootLayout}
            onTouchStart={onRootTouchStart}
            onTouchEnd={onRootTouchEnd}
          >
            {children}
            <RootHost />
          </View>
        </HostContext.Provider>
      </FocusContext.Provider>
    </ApiContext.Provider>
  );
}

// ─── Hosts ───────────────────────────────────────────────────────────────────

function RootHost() {
  const host = useKeyboardHost();
  if (!host || host.topHost !== ROOT_HOST || !(host.mounted || host.pillVisible)) return null;
  // FullWindowOverlay puts the keyboard above native modal screens on iOS.
  // It's mounted only while needed, so it's added on top of whatever is
  // presented at that moment.
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        <HostContent />
      </FullWindowOverlay>
    );
  }
  return <HostContent />;
}

/**
 * Renders the keyboard inside a React Native <Modal> (a separate window the
 * root keyboard can't draw over). Put it last inside the modal's root view.
 */
export function KeyboardHost() {
  const api = useKeyboardApi();
  const host = useKeyboardHost();
  const id = useId();
  useLayoutEffect(() => api?.pushHost(id), [api, id]);
  if (!host || host.topHost !== id || !(host.mounted || host.pillVisible)) return null;
  return <HostContent />;
}

function HostContent() {
  const api = useKeyboardApi()!;
  const host = useKeyboardHost()!;
  const { progress, kbHeight } = api;

  const dockStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * kbHeight.get() }],
  }));

  return (
    <>
      {host.mounted ? (
        <Animated.View
          collapsable={false}
          style={[styles.dock, dockStyle]}
          onTouchStart={api.claimTouch}
        >
          <AppKeyboard key={`${host.focusedId}|${host.lang}`} />
        </Animated.View>
      ) : null}
      {host.pillVisible ? <SystemKeyboardPill /> : null}
    </>
  );
}

// ─── Layout helpers for screens ──────────────────────────────────────────────

/**
 * Reserves space at the bottom of a screen for the keyboard (app keyboard,
 * and the phone keyboard unless `system={false}`). Replaces
 * KeyboardAvoidingView: put it after the content that should stay visible.
 */
export function KeyboardSpacer({ offset = 0, system = true }: { offset?: number; system?: boolean }) {
  const api = useKeyboardApi();
  const fallback = useSharedValue(0);
  const progress = api?.progress ?? fallback;
  const kb = api?.kbHeight ?? fallback;
  const native = api?.nativeHeight ?? fallback;
  const nativeFull = api?.nativeFull ?? fallback;
  // The offset (e.g. bottom inset already padded by the screen) is scaled by
  // progress rather than subtracted outright, so the layout starts moving on
  // the very first frame and stays in step with the keyboard.
  const style = useAnimatedStyle(() => {
    const custom = progress.get() * Math.max(0, kb.get() - offset);
    let h = custom;
    if (system) {
      const full = nativeFull.get();
      const n = full > 0 ? (native.get() / full) * Math.max(0, full - offset) : 0;
      h = Math.max(custom, n);
    }
    return { height: h };
  });
  return <Animated.View style={style} pointerEvents="none" />;
}

/**
 * A view whose touches don't dismiss the keyboard (e.g. a chat composer's
 * send button sitting next to the field).
 */
export function KeyboardTouchZone(props: ViewProps) {
  const api = useKeyboardApi();
  const { onTouchStart } = props;
  return (
    <View
      {...props}
      onTouchStart={(e) => {
        api?.claimTouch();
        onTouchStart?.(e);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dock: {
    position: 'absolute',
    left:     0,
    right:    0,
    bottom:   0,
  },
});
