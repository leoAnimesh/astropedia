/**
 * Keyboard contexts and types, shared by the provider, the keyboard and
 * AppTextInput (kept separate to avoid import cycles).
 */
import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { LayoutLang } from './layouts';
import type { AutoCapitalize, EditState } from './text-edit';

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
  /** Show the suggestion strip (off for passwords, numbers, autoCorrect={false}). */
  suggestions?:    boolean;
  /** Apply the exact English fixes ("i" → "I", "dont" → "don't") on space. */
  fixes?:          boolean;
};

export type Selection = { start: number; end: number };

export type TrackpadPhase = 'begin' | 'move' | 'end';

export type FieldController = {
  getValue:      () => string;
  /** Sets the text; `caret` (default: end of text) collapses the selection there. */
  setValue:      (next: string, caret?: number) => void;
  getSelection:  () => Selection;
  setSelection:  (sel: Selection) => void;
  /** Space-bar trackpad: the field maps finger travel to a caret index. */
  trackpad:      (phase: TrackpadPhase, dx: number, dy: number) => void;
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
  // Editing (used by AppKeyboard and the field's edit menu)
  getValue:     () => string;
  /** Text + caret of the focused field (caret = selection end). */
  getState:     () => EditState | null;
  /** Inserts at the caret (replacing a selection). */
  insert:       (text: string) => EditState | null;
  /** Deletes the selection, else one character (or a word with `word`). */
  backspace:    (word?: boolean) => EditState | null;
  /** Applies an arbitrary edit to the collapsed caret state. */
  edit:         (fn: (s: EditState) => EditState | null) => EditState | null;
  /** Return key: newline in multiline fields, else submit. */
  pressReturn:  () => EditState | null;
  trackpad:     (phase: TrackpadPhase, dx: number, dy: number) => void;
  /** Fields call this when the caret / selection moved without an edit. */
  selectionChanged: (id: string) => void;
  /** AppKeyboard listens for text / caret changes (suggestions, auto-shift). */
  subscribe:    (fn: (s: EditState) => void) => () => void;
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
