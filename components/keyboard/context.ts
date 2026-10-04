/**
 * Keyboard contexts and types, shared by the provider, the keyboard and
 * AppTextInput (kept separate to avoid import cycles).
 */
import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { LayoutLang } from './layouts';
import type { AutoCapitalize } from './text-edit';

// ─── Types ───────────────────────────────────────────────────────────────────

export type KeyboardMode = 'custom' | 'system';

export type FieldConfig = {
  returnKeyType?:  string;
  multiline:       boolean;
  autoCapitalize:  AutoCapitalize;
  /** 'newline' (multiline default), 'blurAndSubmit' (single-line default) or 'submit'. */
  submitBehavior?: 'submit' | 'blurAndSubmit' | 'newline';
  maxLength?:      number;
  /** keyboardType asked for digits — open on the numbers page. */
  numeric?:        boolean;
};

export type FieldController = {
  getValue:      () => string;
  setValue:      (next: string) => void;
  submit:        () => void;
  config:        () => FieldConfig;
  onFocusChange: (focused: boolean) => void;
};

export type ControllerRef = { current: FieldController };

export type KeyboardApi = {
  // Fields
  register:     (id: string, ref: ControllerRef) => () => void;
  focus:        (id: string) => void;
  blur:         (id: string) => void;
  /** Hides whichever keyboard is up. Returns true if something was hidden. */
  dismiss:      () => boolean;
  isFocused:    (id: string) => boolean;
  /** Called by the system TextInput when it loses focus. */
  systemBlur:   (id: string) => void;
  /** Marks the current touch as "inside the keyboard area" (no dismiss). */
  claimTouch:   () => void;
  // Editing (used by AppKeyboard)
  getValue:     () => string;
  insert:       (text: string) => string | null;
  backspace:    () => string | null;
  /** Return key: newline in multiline fields, else submit. */
  pressReturn:  () => string | null;
  cycleLang:    () => void;
  useSystem:    () => void;
  useCustom:    () => void;
  // Hosts
  pushHost:     (id: string) => () => void;
  // Animated values
  progress:     SharedValue<number>;
  kbHeight:     SharedValue<number>;
  nativeHeight: SharedValue<number>;
  /** Target height of the phone keyboard (for scaling spacer offsets). */
  nativeFull:   SharedValue<number>;
};

export type FocusState = { focusedId: string | null; mode: KeyboardMode };

export type HostState = {
  topHost:     string;
  mounted:     boolean;
  pillVisible: boolean;
  lang:        LayoutLang;
  config:      FieldConfig;
  focusedId:   string | null;
};

export const DEFAULT_CONFIG: FieldConfig = { multiline: false, autoCapitalize: 'sentences' };
export const ROOT_HOST = 'root';

export const ApiContext   = createContext<KeyboardApi | null>(null);
export const FocusContext = createContext<FocusState>({ focusedId: null, mode: 'system' });
export const HostContext  = createContext<HostState | null>(null);

export const useKeyboardApi   = () => useContext(ApiContext);
export const useKeyboardFocus = () => useContext(FocusContext);
export const useKeyboardHost  = () => useContext(HostContext);
