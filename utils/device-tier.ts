/**
 * Device capability tiering for on-device LLM selection.
 *
 * Detected once via expo-device + total physical RAM, cached in MMKV so the
 * tier doesn't flip between launches. Users can still override the model
 * choice via Settings — this just provides the default.
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { Storage } from './storage';

export type DeviceTier = 'flagship' | 'mid' | 'budget' | 'floor';

const GIB = 1024 ** 3;

function classify(totalRamBytes: number, platform: 'ios' | 'android' | 'web'): DeviceTier {
  if (platform === 'web') return 'budget';
  const gb = totalRamBytes / GIB;
  // iOS gives apps less of the total RAM than Android (jetsam ~1.5–2 GB cap
  // even on 8 GB devices), but with executorch's XNNPACK build the model
  // streams from disk so the absolute RAM requirement is lower than the
  // download size. The thresholds below are conservative for both platforms.
  if (gb >= 7.5) return 'flagship';
  if (gb >= 5.5) return 'mid';
  if (gb >= 3.5) return 'budget';
  return 'floor';
}

/**
 * Detect this device's tier. Result is cached in MMKV — subsequent calls
 * return the cached value without re-reading expo-device.
 *
 * If the RAM probe returns 0 (native module not warmed up yet, web, or
 * sandboxing), we default to 'mid' and do NOT cache, so a later call after
 * native init can detect the real tier.
 */
export function detectDeviceTier(): DeviceTier {
  const cached = Storage.getDeviceTier();
  if (cached) return cached as DeviceTier;

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const ram      = Device.totalMemory ?? 0;

  // Defensive: if we couldn't read RAM, fall back to a safe middle tier
  // without caching so we can try again later.
  if (ram <= 0 && platform !== 'web') return 'mid';

  const tier = classify(ram, platform);
  Storage.setDeviceTier(tier);
  return tier;
}

/**
 * Force re-detection (e.g. after a hardware swap). Rare — exposed for the
 * "reset all data" path in Settings.
 */
export function forgetDeviceTier(): void {
  Storage.clearDeviceTier();
}

/**
 * Best-effort human-readable label for diagnostics. Don't show to users.
 */
export function describeDevice(): string {
  const ram = Device.totalMemory ? `${Math.round(Device.totalMemory / GIB)} GB` : 'unknown RAM';
  return `${Device.modelName ?? 'Unknown'} (${Platform.OS}, ${ram})`;
}
