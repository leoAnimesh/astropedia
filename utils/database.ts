import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { guessTimeZone } from './timezone';
import { MIGRATIONS, SYSTEM_PROFILES, isAgentId, type AgentId } from './db-schema';

import type { BackupTable, RestoreStep } from './backup';

export { SCHEMA_VERSION, AGENT_IDS, isAgentId, type AgentId } from './db-schema';

export type Profile = {
  id: string;
  name: string;
  relationship: string | null;
  birthDate: string;
  birthTime: string | null;
  birthCity: string | null;
  birthLat: number | null;
  birthLng: number | null;
  /**
   * IANA time zone of the birth place (e.g. "Asia/Kolkata"), used to turn
   * the civil birth time into UT with historical offsets and DST. Null when
   * the place's country is unknown (charts then use local mean time).
   */
  birthTz: string | null;
  /**
   * Optional gender for interpretation conventions. Stored as a stable
   * machine identifier so display strings can evolve without migrations:
   *   'woman' | 'man' | 'non_binary' | 'unspecified' | null
   */
  gender: string | null;
  isYou: boolean;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
};

export type Thread = {
  id: string;
  profileId: string;
  /** Guru this chat belongs to (one active thread per profile and agent). */
  agent: AgentId;
  title: string | null;
  lastMessagePreview: string | null;
  archived: boolean;
  archivedAt: string | null;
  pinned: boolean;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
};

export type Message = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  modelTier: 'executorch' | 'groq' | 'claude' | 'deterministic' | 'cached' | 'pending' | null;
  createdAt: string;
  syncedAt: string | null;
};

let db: SQLite.SQLiteDatabase;

/** Schema version before this launch's migrations (0 = new database). */
let _upgradedFrom = 0;
/** Version 7 ran on a database that already had chats (see chatsMovedToGurus). */
let _chatsMovedToGurus = false;

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

  // Ensure migrations table exists (always run, idempotent)
  await database.execAsync(MIGRATIONS[0].sql[0]);

  const row = await database.getFirstAsync<{ max_ver: number }>(
    `SELECT MAX(version) as max_ver FROM schema_migrations`,
  );
  const currentVersion = row?.max_ver ?? 0;
  _upgradedFrom = currentVersion;

  for (const m of MIGRATIONS) {
    if (m.version > currentVersion) {
      if (m.version === 7 && currentVersion > 0) {
        const n = await database.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM threads`);
        _chatsMovedToGurus = (n?.n ?? 0) > 0;
      }
      // Version 1: sql[0] is the schema_migrations table (already run above), skip it
      const statements = m.version === 1 ? m.sql.slice(1) : m.sql;
      // One transaction per migration: a crash mid-way leaves the previous
      // version intact instead of a half-applied one (e.g. v7's column added
      // but duplicate active chats not yet archived).
      await database.withTransactionAsync(async () => {
        for (const sql of statements) {
          await database.execAsync(sql);
        }
        await database.runAsync(
          `INSERT INTO schema_migrations (version) VALUES (?)`,
          [m.version],
        );
      });
    }
  }
}

/**
 * True once per install: this launch upgraded a database that had chats to
 * guru chats (schema v7). Drives the one-time "Chats are now organised by
 * guru" notice; fresh installs never see it.
 */
export function chatsMovedToGurus(): boolean {
  return _chatsMovedToGurus && _upgradedFrom > 0;
}

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('astropedia.db');
  await runMigrations(db);
  await ensureSystemProfiles(db);
}

// System (synthetic) profiles are filtered out of the profile switcher but
// satisfy the threads.profile_id foreign key for special chats like Krishna.
const SYSTEM_PROFILE_IDS: readonly string[] = SYSTEM_PROFILES.map((p) => p.id);

async function ensureSystemProfiles(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const p of SYSTEM_PROFILES) {
    await database.runAsync(
      `INSERT OR IGNORE INTO profiles (id, name, relationship, birth_date, is_you)
       VALUES (?, ?, ?, ?, ?)`,
      [p.id, p.name, null, '', 0],
    );
  }
}

export function isSystemProfile(id: string): boolean {
  return SYSTEM_PROFILE_IDS.includes(id);
}

// ─── Profile queries ───────────────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    id:           row.id as string,
    name:         row.name as string,
    relationship: row.relationship as string | null,
    birthDate:    row.birth_date as string,
    birthTime:    row.birth_time as string | null,
    birthCity:    row.birth_city as string | null,
    birthLat:     row.birth_lat as number | null,
    birthLng:     row.birth_lng as number | null,
    birthTz:      (row.birth_tz as string | null) ?? null,
    gender:       (row.gender as string | null) ?? null,
    isYou:        Boolean(row.is_you),
    createdAt:    row.created_at as string,
    updatedAt:    row.updated_at as string,
    syncedAt:     row.synced_at as string | null,
  };
}

export async function getAllProfiles(): Promise<Profile[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM profiles ORDER BY created_at ASC`,
  );
  return backfillBirthTz(rows.map(rowToProfile));
}

/** Birth-place time zone from the stored "City, State, Country" + coordinates. */
export function birthTzFor(p: Pick<Profile, 'birthCity' | 'birthLat' | 'birthLng'>): string | null {
  return guessTimeZone({ place: p.birthCity, lat: p.birthLat, lng: p.birthLng });
}

/**
 * Profiles saved before the birth_tz column existed: derive the zone from
 * the stored place and persist it, once. Rows whose country can't be
 * identified stay null (local-mean-time fallback) and are retried on each
 * load, which is cheap.
 */
const backfilledIds = new Set<string>();

/**
 * Ids of profiles whose zone was just backfilled (their chart moved, so
 * cached chart readings / horoscopes are stale). Clears the set.
 */
export function takeBackfilledProfileIds(): string[] {
  const ids = [...backfilledIds];
  backfilledIds.clear();
  return ids;
}

async function backfillBirthTz(profiles: Profile[]): Promise<Profile[]> {
  for (const p of profiles) {
    if (p.birthTz || !p.birthCity || isSystemProfile(p.id)) continue;
    const tz = birthTzFor(p);
    if (!tz) continue;
    p.birthTz = tz;
    backfilledIds.add(p.id);
    try {
      await db.runAsync(`UPDATE profiles SET birth_tz = ? WHERE id = ?`, [tz, p.id]);
    } catch {
      // Non-fatal: the zone is still applied in memory for this session.
    }
  }
  return profiles;
}

export async function insertProfile(
  p: Omit<Profile, 'createdAt' | 'updatedAt' | 'syncedAt' | 'birthTz'> & { birthTz?: string | null },
): Promise<Profile> {
  await db.runAsync(
    `INSERT INTO profiles (id, name, relationship, birth_date, birth_time, birth_city, birth_lat, birth_lng, birth_tz, gender, is_you)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.id, p.name, p.relationship ?? null, p.birthDate, p.birthTime ?? null,
     p.birthCity ?? null, p.birthLat ?? null, p.birthLng ?? null,
     p.birthTz ?? birthTzFor(p), p.gender ?? null, p.isYou ? 1 : 0],
  );
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM profiles WHERE id = ?`, [p.id],
  );
  if (!row) throw new Error(`insertProfile: failed to read back profile ${p.id} after insert`);
  return rowToProfile(row);
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<void> {
  const sets: string[] = [];
  const vals: SQLite.SQLiteBindValue[] = [];
  if (patch.name         !== undefined) { sets.push('name = ?');         vals.push(patch.name); }
  if (patch.relationship !== undefined) { sets.push('relationship = ?'); vals.push(patch.relationship ?? null); }
  if (patch.birthDate    !== undefined) { sets.push('birth_date = ?');   vals.push(patch.birthDate); }
  if (patch.birthTime    !== undefined) { sets.push('birth_time = ?');   vals.push(patch.birthTime ?? null); }
  if (patch.birthCity    !== undefined) { sets.push('birth_city = ?');   vals.push(patch.birthCity ?? null); }
  if (patch.birthLat     !== undefined) { sets.push('birth_lat = ?');    vals.push(patch.birthLat ?? null); }
  if (patch.birthLng     !== undefined) { sets.push('birth_lng = ?');    vals.push(patch.birthLng ?? null); }
  if (patch.birthTz      !== undefined) { sets.push('birth_tz = ?');     vals.push(patch.birthTz ?? null); }
  if (patch.gender       !== undefined) { sets.push('gender = ?');       vals.push(patch.gender ?? null); }
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  await db.runAsync(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`, vals);
}

export async function deleteProfile(id: string): Promise<void> {
  await db.runAsync(`DELETE FROM profiles WHERE id = ?`, [id]);
  // Their own reports cascade; compatibility reports naming them don't.
  await db.runAsync(`DELETE FROM reports WHERE instr(id, ?) > 0`, [`:compat:${id}:`]);
}

// ─── Thread queries ────────────────────────────────────────────────────

function rowToThread(row: Record<string, unknown>): Thread {
  return {
    id:                 row.id as string,
    profileId:          row.profile_id as string,
    agent:              isAgentId(row.agent) ? row.agent : 'saga',
    title:              row.title as string | null,
    lastMessagePreview: row.last_message_preview as string | null,
    archived:           Boolean(row.archived),
    archivedAt:         row.archived_at as string | null,
    pinned:             Boolean(row.pinned),
    pinnedAt:           (row.pinned_at as string | null) ?? null,
    createdAt:          row.created_at as string,
    updatedAt:          row.updated_at as string,
    syncedAt:           row.synced_at as string | null,
  };
}

export async function getThreadsByProfile(profileId: string): Promise<Thread[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM threads WHERE profile_id = ?
     ORDER BY pinned DESC, COALESCE(pinned_at, '') DESC, updated_at DESC`,
    [profileId],
  );
  return rows.map(rowToThread);
}

export async function getAllThreads(): Promise<Thread[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM threads
     ORDER BY pinned DESC, COALESCE(pinned_at, '') DESC, updated_at DESC`,
  );
  return rows.map(rowToThread);
}

export async function insertThread(
  t: Omit<Thread, 'createdAt' | 'updatedAt' | 'syncedAt'>,
): Promise<Thread> {
  await db.runAsync(
    `INSERT INTO threads (id, profile_id, agent, title, archived, archived_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [t.id, t.profileId, t.agent, t.title ?? null, t.archived ? 1 : 0, t.archivedAt ?? null],
  );
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM threads WHERE id = ?`, [t.id],
  );
  if (!row) throw new Error(`insertThread: failed to read back thread ${t.id} after insert`);
  return rowToThread(row);
}

/** The one active (non-archived) chat of a profile with a guru, if it has started. */
export async function getActiveAgentThread(profileId: string, agent: AgentId): Promise<Thread | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM threads WHERE profile_id = ? AND agent = ? AND archived = 0 LIMIT 1`,
    [profileId, agent],
  );
  return row ? rowToThread(row) : null;
}

export async function updateThread(id: string, patch: Partial<Thread>): Promise<void> {
  const sets: string[] = [];
  const vals: SQLite.SQLiteBindValue[] = [];
  if (patch.title              !== undefined) { sets.push('title = ?');                vals.push(patch.title ?? null); }
  if (patch.lastMessagePreview !== undefined) { sets.push('last_message_preview = ?'); vals.push(patch.lastMessagePreview ?? null); }
  if (patch.archived           !== undefined) { sets.push('archived = ?');             vals.push(patch.archived ? 1 : 0); }
  if (patch.archivedAt         !== undefined) { sets.push('archived_at = ?');          vals.push(patch.archivedAt ?? null); }
  if (patch.pinned             !== undefined) {
    sets.push('pinned = ?');     vals.push(patch.pinned ? 1 : 0);
    sets.push('pinned_at = ?');  vals.push(patch.pinned ? new Date().toISOString() : null);
  }
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  await db.runAsync(`UPDATE threads SET ${sets.join(', ')} WHERE id = ?`, vals);
}

export async function deleteThread(id: string): Promise<void> {
  await db.runAsync(`DELETE FROM threads WHERE id = ?`, [id]);
}

// ─── Message queries ───────────────────────────────────────────────────

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id:         row.id as string,
    threadId:   row.thread_id as string,
    role:       row.role as 'user' | 'assistant',
    content:    row.content as string,
    modelTier:  row.model_tier as Message['modelTier'],
    createdAt:  row.created_at as string,
    syncedAt:   row.synced_at as string | null,
  };
}

export async function getMessagesByThread(threadId: string): Promise<Message[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC`,
    [threadId],
  );
  return rows.map(rowToMessage);
}

export async function insertMessage(
  m: Omit<Message, 'createdAt' | 'syncedAt'>,
): Promise<Message> {
  await db.runAsync(
    `INSERT INTO messages (id, thread_id, role, content, model_tier) VALUES (?, ?, ?, ?, ?)`,
    [m.id, m.threadId, m.role, m.content, m.modelTier ?? null],
  );
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM messages WHERE id = ?`, [m.id],
  );
  if (!row) throw new Error(`insertMessage: failed to read back message ${m.id} after insert`);
  return rowToMessage(row);
}

export async function updateMessageContent(id: string, content: string, modelTier?: Message['modelTier']): Promise<void> {
  await db.runAsync(
    `UPDATE messages SET content = ?, model_tier = ? WHERE id = ?`,
    [content, modelTier ?? null, id],
  );
}

export async function clearAllData(): Promise<void> {
  await db.execAsync(
    `DELETE FROM reports; DELETE FROM saved_answers; DELETE FROM journal_entries; DELETE FROM messages; DELETE FROM threads; DELETE FROM profiles;`,
  );
}

/**
 * A model switch (utils/model-switch.ts): deletes every chat thread and
 * message (all gurus, Krishna, archived ones) and the cached report text, in
 * one transaction. Profiles, journal, saved answers and report reading
 * progress stay. `statements` = utils/model-catalog.ts MODEL_SWITCH_WIPE_SQL.
 */
export async function clearChatsAndModelText(statements: readonly string[]): Promise<void> {
  const run = async (conn: SQLite.SQLiteDatabase) => {
    for (const sql of statements) await conn.execAsync(sql);
  };
  if (Platform.OS === 'web') await db.withTransactionAsync(() => run(db));
  else await db.withExclusiveTransactionAsync((txn) => run(txn));
}

// ─── Backup / restore ─────────────────────────────────────────────────────────

/** Raw rows of the given tables, for utils/backup.ts to serialize. */
export async function readTablesForBackup(
  tables: readonly BackupTable[],
): Promise<Record<BackupTable, Record<string, unknown>[]>> {
  const out = {} as Record<BackupTable, Record<string, unknown>[]>;
  for (const t of tables) {
    out[t] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${t} ORDER BY rowid ASC`);
  }
  return out;
}

/**
 * Runs a restore plan (wipe + inserts) in a single transaction. If any
 * statement fails the transaction rolls back and the existing data is kept.
 */
export async function replaceAllData(steps: RestoreStep[]): Promise<void> {
  const run = async (conn: SQLite.SQLiteDatabase) => {
    for (const step of steps) {
      if (step.kind === 'exec') {
        await conn.execAsync(step.sql);
        continue;
      }
      if (step.rows.length === 0) continue;
      const stmt = await conn.prepareAsync(step.sql);
      try {
        for (const params of step.rows) await stmt.executeAsync(params);
      } finally {
        await stmt.finalizeAsync();
      }
    }
  };
  // Exclusive transactions keep other async writes out of the restore; they
  // aren't available on web, where a plain transaction does the same job.
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => run(db));
  } else {
    await db.withExclusiveTransactionAsync((txn) => run(txn));
  }
}

// ─── Saved answers ───────────────────────────────────────────────────────────

export type SavedAnswer = {
  id:        string;
  messageId: string;
  threadId:  string | null;
  profileId: string;
  /** Guru that wrote the answer (older rows: 'saga' | 'krishna'). */
  persona:   AgentId;
  question:  string;
  answer:    string;
  createdAt: string;
};

function rowToSaved(row: Record<string, unknown>): SavedAnswer {
  return {
    id:        row.id as string,
    messageId: row.message_id as string,
    threadId:  row.thread_id as string | null,
    profileId: row.profile_id as string,
    persona:   isAgentId(row.persona) ? row.persona : 'saga',
    question:  row.question as string,
    answer:    row.answer as string,
    createdAt: row.created_at as string,
  };
}

export async function getSavedAnswers(): Promise<SavedAnswer[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM saved_answers ORDER BY created_at DESC`,
  );
  return rows.map(rowToSaved);
}

export async function countSavedAnswers(): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM saved_answers`);
  return row?.n ?? 0;
}

export async function getSavedMessageIds(): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ message_id: string }>(`SELECT message_id FROM saved_answers`);
  return new Set(rows.map((r) => r.message_id));
}

export async function saveAnswer(a: Omit<SavedAnswer, 'id' | 'createdAt'>): Promise<void> {
  const id = 's_' + Math.random().toString(36).slice(2, 11);
  await db.runAsync(
    `INSERT OR IGNORE INTO saved_answers (id, message_id, thread_id, profile_id, persona, question, answer)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, a.messageId, a.threadId, a.profileId, a.persona, a.question, a.answer],
  );
}

export async function unsaveAnswer(messageId: string): Promise<void> {
  await db.runAsync(`DELETE FROM saved_answers WHERE message_id = ?`, [messageId]);
}

// ─── Journal ─────────────────────────────────────────────────────────────────

export type JournalEntry = {
  id:        string;
  profileId: string;
  date:      string;   // YYYY-MM-DD, local
  mood:      string;
  text:      string;
  createdAt: string;
  updatedAt: string;
};

function rowToJournal(row: Record<string, unknown>): JournalEntry {
  return {
    id:        row.id as string,
    profileId: row.profile_id as string,
    date:      row.date as string,
    mood:      row.mood as string,
    text:      row.text as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getJournalEntries(profileId: string): Promise<JournalEntry[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM journal_entries WHERE profile_id = ? ORDER BY date DESC`,
    [profileId],
  );
  return rows.map(rowToJournal);
}

/** Insert or replace the entry for that profile and day. */
export async function upsertJournalEntry(profileId: string, date: string, mood: string, text: string): Promise<void> {
  const id = 'j_' + Math.random().toString(36).slice(2, 11);
  await db.runAsync(
    `INSERT INTO journal_entries (id, profile_id, date, mood, text) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, date) DO UPDATE SET mood = excluded.mood, text = excluded.text, updated_at = datetime('now')`,
    [id, profileId, date, mood, text],
  );
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await db.runAsync(`DELETE FROM journal_entries WHERE id = ?`, [id]);
}

// ─── Reports (schema v8) ─────────────────────────────────────────────────────
// A cache of generated reports plus reading progress. Row ids:
//   "<profileId>:<kind>"                 life, career, love, health, study, family
//   "<a>:compat:<b>:<mode>"              compatibility (a = whose Reports tab)

export type ReportRow = {
  id: string;
  profileId: string;
  kind: string;
  chartHash: string | null;
  generatedAt: string | null;
  /** JSON of utils/reports/types.ts ReportPayload, or null (not cached). */
  payload: string | null;
  /** Furthest point read, 0..1. */
  progress: number;
  /** ISO time last opened, or null. */
  viewedAt: string | null;
};

type ReportDbRow = {
  id: string; profile_id: string; kind: string; chart_hash: string | null; generated_at: string | null;
  payload: string | null; progress: number; viewed_at: string | null;
};

function toReportRow(r: ReportDbRow): ReportRow {
  return {
    id: r.id, profileId: r.profile_id, kind: r.kind, chartHash: r.chart_hash, generatedAt: r.generated_at,
    payload: r.payload, progress: r.progress ?? 0, viewedAt: r.viewed_at,
  };
}

export async function getReportRow(id: string): Promise<ReportRow | null> {
  const r = await db.getFirstAsync<ReportDbRow>(`SELECT * FROM reports WHERE id = ?`, [id]);
  return r ? toReportRow(r) : null;
}

/** Stores a freshly generated report; reading progress and last-viewed are kept. */
export async function saveReportPayload(
  id: string, profileId: string, kind: string, chartHash: string, generatedAt: string, payload: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reports (id, profile_id, kind, chart_hash, generated_at, payload) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET chart_hash = excluded.chart_hash, generated_at = excluded.generated_at,
                                   payload = excluded.payload`,
    [id, profileId, kind, chartHash, generatedAt, payload],
  );
}

/** Marks a report opened now and records how far it has been read (keeps the furthest). */
export async function saveReportProgress(id: string, profileId: string, kind: string, progress: number): Promise<void> {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  await db.runAsync(
    `INSERT INTO reports (id, profile_id, kind, progress, viewed_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET progress = MAX(progress, excluded.progress), viewed_at = excluded.viewed_at`,
    [id, profileId, kind, p, new Date().toISOString()],
  );
}

/** Reports opened for a person, newest first (compatibility rows where they are the first person). */
export async function getRecentReports(profileId: string, limit = 6): Promise<ReportRow[]> {
  const rows = await db.getAllAsync<ReportDbRow>(
    `SELECT * FROM reports WHERE profile_id = ? AND viewed_at IS NOT NULL ORDER BY viewed_at DESC LIMIT ?`,
    [profileId, limit],
  );
  return rows.map(toReportRow);
}

/**
 * Drops cached report text that involves a person (their own reports and
 * any compatibility report with them), after their birth details or name
 * change. Reading progress stays.
 */
export async function clearReportPayloads(profileId: string): Promise<void> {
  await db.runAsync(
    `UPDATE reports SET payload = NULL, chart_hash = NULL, generated_at = NULL
      WHERE profile_id = ? OR instr(id, ?) > 0`,
    [profileId, `:compat:${profileId}:`],
  );
}
