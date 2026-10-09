/**
 * Overlay store — a tiny module-level stack of dialogs and action sheets.
 *
 * The imperative API (showDialog / showActionSheet) works from anywhere,
 * including non-React code; <OverlayProvider> subscribes and renders the
 * stack. Entries stay in the stack while their exit animation runs
 * (`closing: true`) and are removed by the rendering component once it has
 * animated out. Action callbacks and promise resolution run after removal so
 * that navigation triggered by an action never races the overlay.
 */
import type { IconName } from '@/components/atoms/Icon';
import { logger } from '@/utils/logger';

export type DialogActionStyle = 'default' | 'cancel' | 'destructive';

export type DialogAction = {
  label: string;
  style?: DialogActionStyle;
  onPress?: () => void | Promise<void>;
};

export type DialogOptions = {
  title: string;
  message?: string;
  /** Defaults to a single "OK" button. */
  actions?: DialogAction[];
  /**
   * Whether the backdrop / Android back button dismiss the dialog. Defaults to
   * true when there is a `cancel` action or exactly one action (dismissing
   * then counts as pressing that action, like the native Alert).
   */
  dismissable?: boolean;
};

export type ActionSheetOption = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress?: () => void | Promise<void>;
};

export type ActionSheetOptions = {
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  /** Label of the trailing cancel row. Defaults to common:cancel. */
  cancelLabel?: string;
};

type Base = { id: number; closing: boolean };

export type DialogEntry = Base & {
  kind: 'dialog';
  options: DialogOptions & { actions: DialogAction[] };
  resolve: (a: DialogAction | null) => void;
  result?: DialogAction | null;
};

export type SheetEntry = Base & {
  kind: 'sheet';
  options: ActionSheetOptions;
  resolve: (o: ActionSheetOption | null) => void;
  result?: ActionSheetOption | null;
};

export type OverlayEntry = DialogEntry | SheetEntry;

let entries: OverlayEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: OverlayEntry[]) {
  entries = next;
  listeners.forEach((l) => l());
}

export const overlayStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot(): OverlayEntry[] {
    return entries;
  },
};

/** Default OK label; set by the provider from i18n so this module stays React-free. */
let defaultOkLabel = 'OK';
export function setDefaultOkLabel(label: string) {
  defaultOkLabel = label;
}

export function showDialog(options: DialogOptions): Promise<DialogAction | null> {
  return new Promise((resolve) => {
    const actions = options.actions?.length
      ? options.actions
      : [{ label: defaultOkLabel, style: 'default' as const }];
    emit([
      ...entries,
      { id: nextId++, kind: 'dialog', closing: false, options: { ...options, actions }, resolve },
    ]);
  });
}

export function showActionSheet(options: ActionSheetOptions): Promise<ActionSheetOption | null> {
  return new Promise((resolve) => {
    emit([...entries, { id: nextId++, kind: 'sheet', closing: false, options, resolve }]);
  });
}

/** Start closing an overlay with the given result (the action pressed, or null). */
export function closeOverlay(id: number, result: DialogAction | ActionSheetOption | null) {
  const entry = entries.find((e) => e.id === id);
  if (!entry || entry.closing) return;
  emit(entries.map((e) => (e.id === id ? ({ ...e, closing: true, result } as OverlayEntry) : e)));
}

/** Called by the rendering component once its exit animation has finished. */
export function removeOverlay(id: number) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  emit(entries.filter((e) => e.id !== id));
  const result = entry.result ?? null;
  // Give the host Modal a beat to unmount before running the action, so an
  // action that navigates (or presents a native screen) isn't blocked by it.
  setTimeout(() => {
    try {
      const r = result?.onPress?.();
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch((e) => logger.warn('[overlay] action failed', e));
      }
    } catch (e) {
      logger.warn('[overlay] action failed', e);
    }
    (entry.resolve as (v: unknown) => void)(result);
  }, 60);
}

/** What dismissing a dialog (backdrop / back button) counts as, or undefined if it can't be dismissed. */
export function dialogDismissResult(entry: DialogEntry): DialogAction | null | undefined {
  const { actions, dismissable } = entry.options;
  const cancel = actions.find((a) => a.style === 'cancel');
  if (dismissable === false) return undefined;
  if (cancel) return cancel;
  if (actions.length === 1) return actions[0];
  return dismissable ? null : undefined;
}

/** Dismiss the top-most overlay (Android back button). Returns true if something handled it. */
export function dismissTopOverlay(): boolean {
  const top = [...entries].reverse().find((e) => !e.closing);
  if (!top) return entries.length > 0;
  if (top.kind === 'sheet') {
    closeOverlay(top.id, null);
    return true;
  }
  const result = dialogDismissResult(top);
  if (result !== undefined) closeOverlay(top.id, result);
  return true;
}
