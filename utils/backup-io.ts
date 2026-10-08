/**
 * Backup export / restore: files, the database transaction and app state.
 * The format itself (build, validate, restore statements) is utils/backup.ts.
 *
 * Privacy: a backup holds birth details and chats. Export writes it to the
 * app's cache folder and opens the system share sheet; the user decides where
 * it goes. Restore reads a file the user picks. Nothing is sent anywhere.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  BACKUP_TABLES,
  backupFileName,
  buildBackup,
  restorePlan,
  serializeBackup,
  type BackupSettings,
  type ParsedBackup,
} from './backup';
import {
  getAllProfiles,
  getAllThreads,
  isSystemProfile,
  readTablesForBackup,
  replaceAllData,
  takeBackfilledProfileIds,
  type Thread,
} from './database';
import { Storage } from './storage';
import { Cache } from './cache';
import { getAppLanguage, setAppLanguage } from './i18n';
import {
  cancelDailyHoroscope,
  cancelTransitAlerts,
  ensureNotificationPermission,
  scheduleDailyHoroscope,
  scheduleTransitAlerts,
} from './notifications';
import { useProfileStore } from '@/stores/profile-store';
import { useThreadStore } from '@/stores/thread-store';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useOnboardingStore } from '@/stores/onboarding-store';

const MIME = 'application/json';

/** Backups waiting in the share sheet live here; wiped on each export and on reset. */
function backupDir(): Directory {
  return new Directory(Paths.cache, 'backups');
}

/** Removes exported backup files left in the app's cache folder. */
export function deleteBackupFiles(): void {
  if (Platform.OS === 'web') return;
  try {
    const dir = backupDir();
    if (dir.exists) dir.delete();
  } catch { /* nothing to clean */ }
}

function currentSettings(): BackupSettings {
  return {
    language:             getAppLanguage(),
    theme_mode:           Storage.getDarkModeOverride(),
    accent_key:           Storage.getAccentKey(),
    push_daily_horoscope: Storage.getDailyHoroscopePush(),
    push_transit_alerts:  Storage.getTransitAlerts(),
    active_profile_id:    Storage.getActiveProfileId() ?? undefined,
    onboarding_done:      Storage.getOnboardingDone(),
    keyboard_mode:        Storage.getKeyboardMode(),
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Writes the backup and hands it to the share sheet (native) or downloads it
 * (web). Resolves once the sheet closes; throws if the file can't be made.
 */
export async function exportBackup(shareTitle: string): Promise<void> {
  const tables = await readTablesForBackup(BACKUP_TABLES.map((t) => t.name));
  const file = buildBackup({
    tables,
    settings:   currentSettings(),
    appVersion: Constants.expoConfig?.version ?? null,
  });
  const json = serializeBackup(file);
  const name = backupFileName();

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: MIME }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  deleteBackupFiles();
  const dir = backupDir();
  dir.create({ intermediates: true, idempotent: true });
  const out = new File(dir, name);
  out.create({ overwrite: true });
  out.write(json);
  await Sharing.shareAsync(out.uri, { mimeType: MIME, UTI: 'public.json', dialogTitle: shareTitle });
  // iOS resolves once the sheet has closed and the target has its copy, so
  // the personal data needn't stay behind. Android may still be reading the
  // file, so there it is removed on the next export or reset instead.
  if (Platform.OS === 'ios') deleteBackupFiles();
}

// ─── Restore ─────────────────────────────────────────────────────────────────

/** Opens the system file picker; the chosen file's text, or null if cancelled. */
export async function pickBackupText(): Promise<string | null> {
  if (Platform.OS === 'web') return pickTextOnWeb();
  // Any file: saved .json files often come back typed as text/plain or
  // application/octet-stream, and parseBackup() explains a wrong pick anyway.
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  return picked.result.text();
}

function pickTextOnWeb(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) { resolve(null); return; }
      f.text().then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export type RestoreOutcome = {
  /** A notification the backup had on couldn't be enabled (no permission). */
  notificationsBlocked: boolean;
};

/**
 * Replaces all data with the backup. The database part is one transaction:
 * if it fails, this throws and nothing has changed. Settings, caches and
 * in-memory stores are only touched after it commits.
 */
export async function restoreBackup(backup: ParsedBackup): Promise<RestoreOutcome> {
  await replaceAllData(restorePlan(backup));

  const s = backup.settings;

  // Caches describe the old charts / messages.
  Cache.clear();
  Storage.clearDerivedCaches();
  Storage.clearOnboardingDraft();

  // Appearance and input.
  if (s.theme_mode) useSettingsStore.getState().setDarkModeOverride(s.theme_mode);
  if (s.accent_key) useSettingsStore.getState().setAccentKey(s.accent_key);
  if (s.keyboard_mode) Storage.setKeyboardMode(s.keyboard_mode);

  // In-memory stores: reload from the restored database.
  await reloadStores(s.active_profile_id ?? null);

  if (s.language && s.language !== getAppLanguage()) {
    await setAppLanguage(s.language);
  }

  const outcome = await applyNotificationPrefs(
    s.push_daily_horoscope ?? Storage.getDailyHoroscopePush(),
    s.push_transit_alerts ?? Storage.getTransitAlerts(),
  );

  // The backup has profiles (parseBackup rejects empty ones), so the app is
  // set up whatever the backup's own onboarding flag says.
  useOnboardingStore.getState().setDone(true);
  return outcome;
}

async function reloadStores(preferredActiveId: string | null): Promise<void> {
  const all = await getAllProfiles();
  takeBackfilledProfileIds(); // caches are already cleared
  const profiles = all.filter((p) => !isSystemProfile(p.id));

  const active =
    profiles.find((p) => p.id === preferredActiveId) ??
    profiles.find((p) => p.isYou) ??
    profiles[0] ??
    null;

  const threads = await getAllThreads();
  const byProfile: Record<string, Thread[]> = {};
  for (const p of all) byProfile[p.id] = [];
  for (const t of threads) (byProfile[t.profileId] ??= []).push(t);

  useChatStore.setState({ messages: {}, isTyping: {}, status: {}, streaming: {} });
  useThreadStore.setState({ threads: byProfile });
  useProfileStore.getState().setProfiles(profiles);
  useProfileStore.getState().setActiveProfileId(active?.id ?? null);
  if (active) Storage.setActiveProfileId(active.id);
}

async function applyNotificationPrefs(daily: boolean, transit: boolean): Promise<RestoreOutcome> {
  let blocked = false;
  try {
    const granted = daily || transit ? await ensureNotificationPermission() : false;
    if ((daily || transit) && !granted) blocked = true;

    const dailyOn = daily && granted;
    const transitOn = transit && granted;
    Storage.setDailyHoroscopePush(dailyOn);
    Storage.setTransitAlerts(transitOn);

    if (dailyOn) await scheduleDailyHoroscope();
    else await cancelDailyHoroscope();
    if (transitOn) await scheduleTransitAlerts(null);
    else await cancelTransitAlerts();
  } catch {
    // Scheduling is best-effort; app start re-schedules from the stored prefs.
  }
  return { notificationsBlocked: blocked };
}
