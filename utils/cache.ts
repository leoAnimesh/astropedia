/**
 * Generic MMKV-backed cache with TTL.
 *
 * Used by:
 *  - daily horoscope (TTL: 1 day)
 *  - semantic Q&A cache (TTL: 7 days)
 *  - any future read-through caches
 *
 * Keys are prefixed `cache:` so they don't collide with the app-state keys
 * managed by utils/storage.ts. Values are JSON-encoded along with their expiry
 * timestamp; expired entries are treated as misses and lazily cleaned up.
 */

import { Platform } from 'react-native';

type Envelope<T> = { v: T; exp: number };

let _backend: {
  get:    (key: string) => string | undefined;
  set:    (key: string, value: string) => void;
  delete: (key: string) => void;
  keys:   () => string[];
} | null = null;

function backend() {
  if (_backend) return _backend;

  if (Platform.OS === 'web') {
    _backend = {
      get:    (k) => localStorage.getItem(k) ?? undefined,
      set:    (k, v) => localStorage.setItem(k, v),
      delete: (k) => localStorage.removeItem(k),
      keys:   () => Object.keys(localStorage),
    };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const mmkv = createMMKV({ id: 'astropedia-cache' });
    _backend = {
      get:    (k) => mmkv.getString(k),
      set:    (k, v) => mmkv.set(k, v),
      delete: (k) => { mmkv.remove(k); },
      keys:   () => mmkv.getAllKeys(),
    };
  }
  return _backend;
}

const PREFIX = 'cache:';

export const Cache = {
  /**
   * Read a cached value. Returns null on cache miss or expired entry.
   * Expired entries are deleted on read.
   */
  get<T>(key: string): T | null {
    const raw = backend().get(PREFIX + key);
    if (!raw) return null;
    try {
      const env = JSON.parse(raw) as Envelope<T>;
      if (env.exp < Date.now()) {
        backend().delete(PREFIX + key);
        return null;
      }
      return env.v;
    } catch {
      backend().delete(PREFIX + key);
      return null;
    }
  },

  /**
   * Store a value with a TTL in milliseconds.
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    const env: Envelope<T> = { v: value, exp: Date.now() + ttlMs };
    backend().set(PREFIX + key, JSON.stringify(env));
  },

  /**
   * Delete one key.
   */
  invalidate(key: string): void {
    backend().delete(PREFIX + key);
  },

  /**
   * Delete every key under this cache. Used for explicit reset / sign-out.
   */
  clear(): void {
    const b = backend();
    for (const k of b.keys()) {
      if (k.startsWith(PREFIX)) b.delete(k);
    }
  },

  /**
   * Convenience read-through: returns cached value, or computes-and-stores
   * via the loader, returning the loaded value.
   */
  async getOrSet<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = Cache.get<T>(key);
    if (hit !== null) return hit;
    const value = await loader();
    Cache.set(key, value, ttlMs);
    return value;
  },
};

// ─── TTL presets ──────────────────────────────────────────────────────────────

export const TTL = {
  ONE_HOUR:  60 * 60 * 1000,
  ONE_DAY:   24 * 60 * 60 * 1000,
  ONE_WEEK:  7 * 24 * 60 * 60 * 1000,
};
