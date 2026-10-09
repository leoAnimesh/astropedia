/**
 * App logging. In development it forwards to the console (and so to LogBox /
 * Metro). In production builds it prints nothing; warnings and errors are kept
 * only in a small in-memory ring buffer so the crash screen can offer them to
 * the user ("Share error details" opens the system share sheet; nothing is
 * ever sent anywhere by the app).
 *
 * installGlobalErrorHandlers() also routes uncaught JS errors and unhandled
 * promise rejections here. Rejections are logged only, never fatal.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
export type LogEntry = { at: string; level: Level; message: string };

const MAX_ENTRIES = 40;
const MAX_MESSAGE = 600;
const entries: LogEntry[] = [];

function describe(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function remember(level: Level, args: unknown[]): void {
  const message = args.map(describe).join(' ').slice(0, MAX_MESSAGE);
  entries.push({ at: new Date().toISOString(), level, message });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

/* eslint-disable no-console */
export const logger = {
  debug(...args: unknown[]): void {
    if (__DEV__) console.log(...args);
  },
  info(...args: unknown[]): void {
    if (__DEV__) console.info(...args);
  },
  warn(...args: unknown[]): void {
    remember('warn', args);
    if (__DEV__) console.warn(...args);
  },
  error(...args: unknown[]): void {
    remember('error', args);
    if (__DEV__) console.error(...args);
  },
};
/* eslint-enable no-console */

/** The recent warnings and errors, oldest first (for the crash screen's report). */
export function recentLogs(): readonly LogEntry[] {
  return entries.slice();
}

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler(): ErrorHandler; setGlobalHandler(h: ErrorHandler): void };
type RejectionTracker = (opts: {
  allRejections: boolean;
  onUnhandled: (id: number, error: unknown) => void;
  onHandled: (id: number) => void;
}) => void;

let installed = false;

/**
 * Records uncaught errors before React Native's own handler runs (which still
 * decides what a fatal error does), and logs unhandled promise rejections in
 * production too (RN only tracks them in development, where LogBox shows them).
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as {
    ErrorUtils?: ErrorUtilsLike;
    HermesInternal?: { enablePromiseRejectionTracker?: RejectionTracker };
  };

  const eu = g.ErrorUtils;
  if (eu) {
    const previous = eu.getGlobalHandler();
    eu.setGlobalHandler((error, isFatal) => {
      remember('error', [isFatal ? '[fatal]' : '[uncaught]', error]);
      previous(error, isFatal);
    });
  }

  if (!__DEV__) {
    g.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, error) => logger.warn('[unhandled rejection]', error),
      onHandled: () => {},
    });
  }
}
