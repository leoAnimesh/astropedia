/**
 * Backup file format: build, validate and turn into restore statements.
 *
 * Pure TypeScript with no React Native imports, so it runs under Node for
 * tests. Reading/writing files, the database transaction and refreshing app
 * state live in utils/backup-io.ts.
 *
 * File (astropedia-backup-YYYY-MM-DD.json):
 *   {
 *     app: 'astropedia',
 *     schema: <latest DB migration version>,
 *     exportedAt: ISO time, appVersion: '1.0.0' | null,
 *     data: { profiles: [...], threads: [...], messages: [...],
 *             saved_answers: [...], journal_entries: [...],
 *             reports: [...] },                                 // raw DB rows
 *     settings: { language, theme_mode, ... }                   // see SETTINGS_SPEC
 *   }
 *
 * Caches (horoscopes, chart readings, follow-up chips, the AI answer cache,
 * daily message counters, the onboarding draft) are never written: only the
 * keys in SETTINGS_SPEC are, and unknown keys in a file are ignored. Reports
 * (schema v8) keep only which report was read, how far and when: the cached
 * text (payload, chart_hash, generated_at) is dropped on export and on import
 * and is regenerated from the chart the next time the report opens.
 *
 * The file holds birth details and chats. It is only ever written to the
 * device and handed to the system share sheet; nothing is uploaded.
 */
import type { AccentKey, ThemeMode } from '../constants/themes';
import { SCHEMA_VERSION, SYSTEM_PROFILES, isAgentId } from './db-schema';

export const BACKUP_APP = 'astropedia';

// ─── Tables ──────────────────────────────────────────────────────────────────

type ColumnKind =
  | 'id'        // required non-empty string
  | 'text'      // required string (default used when missing)
  | 'textNull'  // string or null
  | 'real'      // finite number or null
  | 'number'    // required finite number (default used when missing)
  | 'bool';     // stored as 0/1, accepts true/false too

type Column = {
  name: string;
  kind: ColumnKind;
  /** Migration that added the column (older backups lack it). */
  since?: number;
  /** Value for a missing column. 'now' = the restore time, SQLite format. */
  default?: string | number | null | 'now';
};

type TableSpec = {
  name: BackupTable;
  /** Migration that created the table. */
  since: number;
  columns: Column[];
  /** Column sets that must be unique; later duplicates are dropped. */
  unique: string[][];
};

export type BackupTable = 'profiles' | 'threads' | 'messages' | 'saved_answers' | 'journal_entries' | 'reports';

/** Every user table, in insert order (parents before children). */
export const BACKUP_TABLES: readonly TableSpec[] = [
  {
    name: 'profiles',
    since: 1,
    unique: [['id']],
    columns: [
      { name: 'id',           kind: 'id' },
      { name: 'name',         kind: 'text' },
      { name: 'relationship', kind: 'textNull', default: null },
      { name: 'birth_date',   kind: 'text',     default: '' },
      { name: 'birth_time',   kind: 'textNull', default: null },
      { name: 'birth_city',   kind: 'textNull', default: null },
      { name: 'birth_lat',    kind: 'real',     default: null },
      { name: 'birth_lng',    kind: 'real',     default: null },
      // Missing in v1-5 backups: left null, and getAllProfiles() derives it
      // from the birth place the first time profiles load (backfillBirthTz).
      { name: 'birth_tz',     kind: 'textNull', default: null, since: 6 },
      { name: 'gender',       kind: 'textNull', default: null, since: 4 },
      { name: 'is_you',       kind: 'bool',     default: 0 },
      { name: 'created_at',   kind: 'text',     default: 'now' },
      { name: 'updated_at',   kind: 'text',     default: 'now' },
      { name: 'synced_at',    kind: 'textNull', default: null },
    ],
  },
  {
    name: 'threads',
    since: 1,
    unique: [['id']],
    columns: [
      { name: 'id',                   kind: 'id' },
      { name: 'profile_id',           kind: 'id' },
      // Missing in v1-6 backups: every chat was a general Saga chat (Krishna's
      // are fixed up from profile_id in fixThreadAgents).
      { name: 'agent',                kind: 'text',     default: 'saga', since: 7 },
      { name: 'title',                kind: 'textNull', default: null },
      { name: 'last_message_preview', kind: 'textNull', default: null, since: 2 },
      { name: 'archived',             kind: 'bool',     default: 0 },
      { name: 'archived_at',          kind: 'textNull', default: null },
      { name: 'pinned',               kind: 'bool',     default: 0, since: 3 },
      { name: 'pinned_at',            kind: 'textNull', default: null, since: 3 },
      { name: 'created_at',           kind: 'text',     default: 'now' },
      { name: 'updated_at',           kind: 'text',     default: 'now' },
      { name: 'synced_at',            kind: 'textNull', default: null },
    ],
  },
  {
    name: 'messages',
    since: 1,
    unique: [['id']],
    columns: [
      { name: 'id',         kind: 'id' },
      { name: 'thread_id',  kind: 'id' },
      { name: 'role',       kind: 'text' },
      { name: 'content',    kind: 'text',     default: '' },
      { name: 'model_tier', kind: 'textNull', default: null },
      { name: 'created_at', kind: 'text',     default: 'now' },
      { name: 'synced_at',  kind: 'textNull', default: null },
    ],
  },
  {
    name: 'saved_answers',
    since: 5,
    unique: [['id'], ['message_id']],
    columns: [
      { name: 'id',         kind: 'id' },
      { name: 'message_id', kind: 'id' },
      { name: 'thread_id',  kind: 'textNull', default: null },
      { name: 'profile_id', kind: 'id' },
      { name: 'persona',    kind: 'text' },
      { name: 'question',   kind: 'text', default: '' },
      { name: 'answer',     kind: 'text' },
      { name: 'created_at', kind: 'text', default: 'now' },
    ],
  },
  {
    name: 'journal_entries',
    since: 5,
    unique: [['id'], ['profile_id', 'date']],
    columns: [
      { name: 'id',         kind: 'id' },
      { name: 'profile_id', kind: 'id' },
      { name: 'date',       kind: 'text' },
      { name: 'mood',       kind: 'text' },
      { name: 'text',       kind: 'text', default: '' },
      { name: 'created_at', kind: 'text', default: 'now' },
      { name: 'updated_at', kind: 'text', default: 'now' },
    ],
  },
  {
    // Reading progress only: the cache columns are always written as null
    // (stripReportCache) and the report regenerates when opened.
    name: 'reports',
    since: 8,
    unique: [['id']],
    columns: [
      { name: 'id',           kind: 'id' },
      { name: 'profile_id',   kind: 'id' },
      { name: 'kind',         kind: 'text' },
      { name: 'chart_hash',   kind: 'textNull', default: null },
      { name: 'generated_at', kind: 'textNull', default: null },
      { name: 'payload',      kind: 'textNull', default: null },
      { name: 'progress',     kind: 'number',   default: 0 },
      { name: 'viewed_at',    kind: 'textNull', default: null },
    ],
  },
];

/** Children first, so foreign keys never block the wipe. */
export const WIPE_ORDER: readonly BackupTable[] =
  ['reports', 'saved_answers', 'journal_entries', 'messages', 'threads', 'profiles'];

export type Row = Record<string, string | number | null>;
export type BackupData = Record<BackupTable, Row[]>;

// ─── Settings ────────────────────────────────────────────────────────────────

const LANGS = ['en', 'hi', 'bn'] as const;
const THEME_MODES = ['system', 'light', 'dark'] as const satisfies readonly ThemeMode[];
const ACCENTS = ['amber', 'sage', 'lilac', 'blush', 'ink'] as const satisfies readonly AccentKey[];
const KEYBOARD_MODES = ['custom', 'system'] as const;

export type BackupSettings = {
  language?: (typeof LANGS)[number];
  theme_mode?: ThemeMode;
  accent_key?: AccentKey;
  push_daily_horoscope?: boolean;
  push_transit_alerts?: boolean;
  push_festival_reminders?: boolean;
  push_rahu_kaal?: boolean;
  active_profile_id?: string;
  onboarding_done?: boolean;
  keyboard_mode?: (typeof KEYBOARD_MODES)[number];
};

const oneOf = (list: readonly string[]) => (v: unknown) => typeof v === 'string' && list.includes(v);
const isBool = (v: unknown) => typeof v === 'boolean';

/** The only MMKV keys a backup carries (all user choices, no caches). */
const SETTINGS_SPEC: Record<keyof BackupSettings, (v: unknown) => boolean> = {
  language:             oneOf(LANGS),
  theme_mode:           oneOf(THEME_MODES),
  accent_key:           oneOf(ACCENTS),
  push_daily_horoscope: isBool,
  push_transit_alerts:  isBool,
  push_festival_reminders: isBool,
  push_rahu_kaal:       isBool,
  active_profile_id:    (v) => typeof v === 'string' && v.length > 0,
  onboarding_done:      isBool,
  keyboard_mode:        oneOf(KEYBOARD_MODES),
};

/** Keeps the known keys with valid values; drops everything else. */
export function pickSettings(raw: unknown): BackupSettings {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  for (const [key, valid] of Object.entries(SETTINGS_SPEC)) {
    const v = (raw as Record<string, unknown>)[key];
    if (v !== undefined && v !== null && valid(v)) out[key] = v;
  }
  return out as BackupSettings;
}

// ─── File ────────────────────────────────────────────────────────────────────

export type BackupFile = {
  app: typeof BACKUP_APP;
  schema: number;
  exportedAt: string;
  appVersion: string | null;
  data: BackupData;
  settings: BackupSettings;
};

/** astropedia-backup-YYYY-MM-DD.json, in local time. */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `astropedia-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** SQLite datetime('now') format: 'YYYY-MM-DD HH:MM:SS' in UTC. */
function sqliteNow(now: Date): string {
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

class BackupFormatError extends Error {}

/**
 * Coerces one row to the current columns of `spec`. Missing columns get their
 * default (that is how older backups map onto the current schema); columns
 * the app doesn't know are dropped. Throws BackupFormatError on bad values.
 */
function normalizeRow(spec: TableSpec, raw: unknown, now: string): Row {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BackupFormatError(`${spec.name}: row is not an object`);
  }
  const src = raw as Record<string, unknown>;
  const row: Row = {};
  for (const col of spec.columns) {
    let v = src[col.name];
    if (v === undefined) {
      if (col.default === undefined) {
        throw new BackupFormatError(`${spec.name}.${col.name}: missing`);
      }
      v = col.default === 'now' ? now : col.default;
    }
    switch (col.kind) {
      case 'id':
        if (typeof v !== 'string' || v.length === 0) throw new BackupFormatError(`${spec.name}.${col.name}: bad id`);
        break;
      case 'text':
        if (typeof v !== 'string') throw new BackupFormatError(`${spec.name}.${col.name}: not text`);
        break;
      case 'textNull':
        if (v !== null && typeof v !== 'string') throw new BackupFormatError(`${spec.name}.${col.name}: not text`);
        break;
      case 'real':
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
          throw new BackupFormatError(`${spec.name}.${col.name}: not a number`);
        }
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          throw new BackupFormatError(`${spec.name}.${col.name}: not a number`);
        }
        break;
      case 'bool':
        if (v === true || v === 1) v = 1;
        else if (v === false || v === 0) v = 0;
        else throw new BackupFormatError(`${spec.name}.${col.name}: not a boolean`);
        break;
    }
    row[col.name] = v as string | number | null;
  }
  return row;
}

function normalizeTable(spec: TableSpec, rows: unknown[], now: string): Row[] {
  const seen = spec.unique.map(() => new Set<string>());
  const out: Row[] = [];
  for (const raw of rows) {
    const row = normalizeRow(spec, raw, now);
    const keys = spec.unique.map((cols) => JSON.stringify(cols.map((c) => row[c])));
    if (keys.some((k, i) => seen[i].has(k))) continue;
    keys.forEach((k, i) => seen[i].add(k));
    out.push(row);
  }
  return out;
}

/**
 * Drops rows whose parent isn't in the backup (a thread of a missing profile,
 * a message of a missing thread), which would otherwise fail the foreign keys
 * and abort the whole restore. System profiles always exist after a restore.
 */
function dropOrphans(data: BackupData): BackupData {
  const profileIds = new Set<string>([
    ...data.profiles.map((p) => p.id as string),
    ...SYSTEM_PROFILES.map((p) => p.id),
  ]);
  const threads = data.threads.filter((t) => profileIds.has(t.profile_id as string));
  const threadIds = new Set(threads.map((t) => t.id as string));
  return {
    profiles:        data.profiles,
    threads,
    messages:        data.messages.filter((m) => threadIds.has(m.thread_id as string)),
    saved_answers:   data.saved_answers,
    journal_entries: data.journal_entries.filter((j) => profileIds.has(j.profile_id as string)),
    reports:         data.reports.filter((r) => profileIds.has(r.profile_id as string)),
  };
}

/**
 * Reports keep reading progress only: the cached text and what it was made
 * from are dropped (regenerated on open), progress is clamped to 0..1.
 */
function stripReportCache(rows: Row[]): Row[] {
  return rows.map((r): Row => ({
    ...r,
    chart_hash:   null,
    generated_at: null,
    payload:      null,
    progress:     Math.min(1, Math.max(0, Number(r.progress) || 0)),
  }));
}

const isSystemId = (id: unknown) => SYSTEM_PROFILES.some((p) => p.id === id);

const KRISHNA_PROFILE_ID = '__krishna__';

/**
 * Guru chats (schema v7): Krishna's threads are always agent 'krishna', an
 * unknown agent becomes 'saga', and only the newest active thread per
 * (profile, agent) stays active (pinned wins, as in migration 7); the others
 * are archived. Without this, a pre-v7 backup with several open chats would
 * break the one-active-chat index and abort the restore.
 */
function fixThreadAgents(threads: Row[], now: Date): Row[] {
  const out: Row[] = threads.map((t): Row => ({
    ...t,
    agent: t.profile_id === KRISHNA_PROFILE_ID ? 'krishna' : isAgentId(t.agent) ? t.agent : 'saga',
  }));
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const keep = new Map<string, number>();
  out.forEach((t, i) => {
    if (t.archived) return;
    const key = `${t.profile_id}\u0000${t.agent}`;
    const j = keep.get(key);
    if (j === undefined) { keep.set(key, i); return; }
    const a = out[j];
    // Same order as the migration: pinned, pinned_at, updated_at, created_at, later row.
    const cmp =
      (Number(t.pinned) - Number(a.pinned)) ||
      str(t.pinned_at).localeCompare(str(a.pinned_at)) ||
      str(t.updated_at).localeCompare(str(a.updated_at)) ||
      str(t.created_at).localeCompare(str(a.created_at)) ||
      1;
    if (cmp > 0) keep.set(key, i);
  });
  const active = new Set(keep.values());
  const stamp = now.toISOString();
  return out.map((t, i): Row =>
    t.archived || active.has(i) ? t : { ...t, archived: 1, archived_at: t.archived_at ?? stamp },
  );
}

/**
 * Builds the backup object from raw `SELECT *` rows and the current settings.
 * Rows go through the same normalizer as a restore, so a file this function
 * writes always restores.
 */
export function buildBackup(input: {
  tables: Partial<Record<BackupTable, unknown[]>>;
  settings: Record<string, unknown>;
  appVersion: string | null;
  now?: Date;
}): BackupFile {
  const now = input.now ?? new Date();
  const stamp = sqliteNow(now);
  const data = {} as BackupData;
  for (const spec of BACKUP_TABLES) {
    data[spec.name] = normalizeTable(spec, input.tables[spec.name] ?? [], stamp);
  }
  data.threads = fixThreadAgents(data.threads, now);
  data.reports = stripReportCache(data.reports);
  return {
    app:        BACKUP_APP,
    schema:     SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    appVersion: input.appVersion,
    data,
    settings:   pickSettings(input.settings),
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

// ─── Parse / validate ────────────────────────────────────────────────────────

export type BackupError =
  | 'notJson'       // not JSON at all
  | 'notAstropedia' // JSON, but not an Astropedia backup
  | 'newerSchema'   // made by a newer app version
  | 'invalid'       // an Astropedia backup with a missing table or bad row
  | 'empty';        // valid, but has no (non-system) profiles

export type ParsedBackup = {
  schema: number;
  exportedAt: string | null;
  appVersion: string | null;
  /** Rows in the current schema, orphans and duplicates dropped. */
  data: BackupData;
  settings: BackupSettings;
  counts: { profiles: number; chats: number; messages: number; saved: number; journal: number };
};

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: BackupError; detail?: string };

export function parseBackup(text: string, now: Date = new Date()): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'notJson' };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, error: 'notAstropedia' };
  const file = json as Record<string, unknown>;
  if (file.app !== BACKUP_APP) return { ok: false, error: 'notAstropedia' };

  const schema = file.schema;
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) {
    return { ok: false, error: 'invalid', detail: 'schema' };
  }
  if (schema > SCHEMA_VERSION) return { ok: false, error: 'newerSchema' };

  const rawData = file.data;
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return { ok: false, error: 'invalid', detail: 'data' };
  }
  const stamp = sqliteNow(now);
  let data = {} as BackupData;
  try {
    for (const spec of BACKUP_TABLES) {
      const rows = (rawData as Record<string, unknown>)[spec.name];
      if (rows === undefined && spec.since > schema) {
        data[spec.name] = [];            // table didn't exist when the backup was made
        continue;
      }
      if (!Array.isArray(rows)) throw new BackupFormatError(`${spec.name}: missing`);
      data[spec.name] = normalizeTable(spec, rows, stamp);
    }
  } catch (e) {
    return { ok: false, error: 'invalid', detail: e instanceof Error ? e.message : String(e) };
  }
  data = dropOrphans(data);
  data.threads = fixThreadAgents(data.threads, now);
  data.reports = stripReportCache(data.reports);

  const userProfiles = data.profiles.filter((p) => !isSystemId(p.id));
  if (userProfiles.length === 0) return { ok: false, error: 'empty' };

  const settings = pickSettings(file.settings);
  if (settings.active_profile_id && !userProfiles.some((p) => p.id === settings.active_profile_id)) {
    delete settings.active_profile_id;
  }

  return {
    ok: true,
    backup: {
      schema,
      exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null,
      appVersion: typeof file.appVersion === 'string' ? file.appVersion : null,
      data,
      settings,
      counts: {
        profiles: userProfiles.length,
        chats:    data.threads.length,
        messages: data.messages.length,
        saved:    data.saved_answers.length,
        journal:  data.journal_entries.length,
      },
    },
  };
}

// ─── Restore plan ────────────────────────────────────────────────────────────

export type RestoreStep =
  | { kind: 'exec'; sql: string }
  | { kind: 'insert'; table: BackupTable; sql: string; rows: (string | number | null)[][] };

/**
 * The statements that replace every user table with the backup's rows. The
 * caller runs them in ONE transaction, so a failure leaves the old data.
 */
export function restorePlan(backup: Pick<ParsedBackup, 'data'>): RestoreStep[] {
  const steps: RestoreStep[] = WIPE_ORDER.map((t) => ({ kind: 'exec', sql: `DELETE FROM ${t}` }));
  for (const spec of BACKUP_TABLES) {
    const cols = spec.columns.map((c) => c.name);
    steps.push({
      kind:  'insert',
      table: spec.name,
      sql:   `INSERT INTO ${spec.name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      rows:  backup.data[spec.name].map((r) => cols.map((c) => r[c] ?? null)),
    });
    if (spec.name === 'profiles') {
      // Backups normally include them; re-seed in case one doesn't.
      for (const p of SYSTEM_PROFILES) {
        steps.push({
          kind:  'insert',
          table: 'profiles',
          sql:   `INSERT OR IGNORE INTO profiles (id, name, relationship, birth_date, is_you) VALUES (?, ?, NULL, '', 0)`,
          rows:  [[p.id, p.name]],
        });
      }
    }
  }
  return steps;
}
