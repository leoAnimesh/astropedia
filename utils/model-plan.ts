/**
 * Progressive model loading — pure decision logic (no React Native imports,
 * so it runs under `node --test`).
 *
 * A fresh install downloads the small "starter" model first so chat works
 * within a minute, then fetches the device's target model in the background
 * and hot-swaps to it once it's on disk. These helpers decide *what* to do;
 * `utils/local-llm.ts` does it.
 */

export type ModelPlanInput = {
  /** Version the tier table (or the Settings override) wants to run. */
  target:  string;
  /** Small model that makes chat usable quickly (LFM2.5 350M). */
  starter: string;
  /** Versions whose files are fully on disk and loadable this session. */
  onDisk:  readonly string[];
  /** Approximate download size in bytes. Bigger = stronger and heavier. */
  sizeOf:  (version: string) => number;
};

export type ModelPlan = {
  /** Load this from disk now (no download). null → nothing usable on disk. */
  load:       string | null;
  /** Download this with the blocking overlay before chat can work. */
  foreground: string | null;
  /** Fetch this quietly in the background, then hot-swap to it. */
  background: string | null;
  /** On-disk models that can be deleted once `target` has loaded. */
  removable:  string[];
};

export function planModels({ target, starter, onDisk, sizeOf }: ModelPlanInput): ModelPlan {
  const has = new Set(onDisk);

  if (has.has(target)) {
    return {
      load:       target,
      foreground: null,
      background: null,
      removable:  starter !== target && has.has(starter) ? [starter] : [],
    };
  }

  // Best model already on disk that is no heavier than the target — never
  // load something bigger than the device tier (or the user) asked for.
  const limit    = sizeOf(target);
  const fallback = [...has]
    .filter((v) => sizeOf(v) <= limit)
    .sort((a, b) => sizeOf(b) - sizeOf(a))[0] ?? null;

  if (fallback) {
    return { load: fallback, foreground: null, background: target, removable: [] };
  }

  // Nothing usable yet: the starter first (if it's actually smaller), then
  // the target in the background.
  const first = sizeOf(starter) < limit ? starter : target;
  return {
    load:       null,
    foreground: first,
    background: first === target ? null : target,
    removable:  [],
  };
}

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS  = 60 * 60_000;

/** Background-upgrade retry backoff: 30 s, 2 min, 8 min, 32 min, then hourly. */
export function upgradeRetryDelayMs(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 4 ** n);
}

/** Free space to leave for the OS and the rest of the app after a download. */
export const DISK_HEADROOM_BYTES = 500 * 1024 ** 2;

/**
 * Whether a download of `downloadBytes` fits. Unknown free space (null) is
 * treated as "fits" — a failed download is retried with backoff anyway.
 */
export function hasRoomForDownload(freeBytes: number | null, downloadBytes: number): boolean {
  if (freeBytes == null || !Number.isFinite(freeBytes)) return true;
  return freeBytes >= downloadBytes + DISK_HEADROOM_BYTES;
}
