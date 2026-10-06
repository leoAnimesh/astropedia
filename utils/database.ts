import * as SQLite from 'expo-sqlite';
import { guessTimeZone } from './timezone';

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

const MIGRATIONS = [
  {
    version: 1,
    sql: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS profiles (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        relationship TEXT,
        birth_date   TEXT NOT NULL DEFAULT '',
        birth_time   TEXT,
        birth_city   TEXT,
        birth_lat    REAL,
        birth_lng    REAL,
        is_you       INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at    TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS threads (
        id          TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        title       TEXT,
        archived    INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at   TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        role        TEXT NOT NULL,
        content     TEXT NOT NULL DEFAULT '',
        model_tier  TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at   TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_threads_profile  ON threads(profile_id)`,
      `CREATE INDEX IF NOT EXISTS idx_threads_archived ON threads(archived)`,
      `CREATE INDEX IF NOT EXISTS idx_messages_thread  ON messages(thread_id)`,
      `CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)`,
    ],
  },
  {
    version: 2,
    sql: [
      `ALTER TABLE threads ADD COLUMN last_message_preview TEXT`,
    ],
  },
  {
    version: 3,
    sql: [
      `ALTER TABLE threads ADD COLUMN pinned    INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE threads ADD COLUMN pinned_at TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_threads_pinned ON threads(pinned)`,
    ],
  },
  {
    version: 4,
    sql: [
      `ALTER TABLE profiles ADD COLUMN gender TEXT`,
    ],
  },
  {
    version: 5,
    sql: [
      // Answers the user bookmarked from a chat. Question and answer are
      // copied so a saved answer survives its thread being deleted.
      `CREATE TABLE IF NOT EXISTS saved_answers (
        id          TEXT PRIMARY KEY,
        message_id  TEXT NOT NULL UNIQUE,
        thread_id   TEXT,
        profile_id  TEXT NOT NULL,
        persona     TEXT NOT NULL,
        question    TEXT NOT NULL DEFAULT '',
        answer      TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_saved_created ON saved_answers(created_at)`,
      // One journal entry per profile per local day.
      `CREATE TABLE IF NOT EXISTS journal_entries (
        id          TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        date        TEXT NOT NULL,
        mood        TEXT NOT NULL,
        text        TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (profile_id, date)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_journal_profile ON journal_entries(profile_id, date)`,
    ],
  },
  {
    version: 6,
    sql: [
      // IANA zone of the birth place. Existing rows are backfilled lazily
      // from city/lat/lng the first time profiles load (backfillBirthTz).
      `ALTER TABLE profiles ADD COLUMN birth_tz TEXT`,
    ],
  },
];

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

  // Ensure migrations table exists (always run, idempotent)
  await database.execAsync(MIGRATIONS[0].sql[0]);

  const row = await database.getFirstAsync<{ max_ver: number }>(
    `SELECT MAX(version) as max_ver FROM schema_migrations`,
  );
  const currentVersion = row?.max_ver ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version > currentVersion) {
      // Version 1: sql[0] is the schema_migrations table (already run above), skip it
      const statements = m.version === 1 ? m.sql.slice(1) : m.sql;
      for (const sql of statements) {
        await database.execAsync(sql);
      }
      await database.runAsync(
        `INSERT INTO schema_migrations (version) VALUES (?)`,
        [m.version],
      );
    }
  }
}

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('astropedia.db');
  await runMigrations(db);
  await ensureSystemProfiles(db);
}

// System (synthetic) profiles are filtered out of the profile switcher but
// satisfy the threads.profile_id foreign key for special chats like Krishna.
const SYSTEM_PROFILE_IDS = ['__krishna__'] as const;

async function ensureSystemProfiles(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.runAsync(
    `INSERT OR IGNORE INTO profiles (id, name, relationship, birth_date, is_you)
     VALUES (?, ?, ?, ?, ?)`,
    ['__krishna__', 'Krishna', null, '', 0],
  );
}

export function isSystemProfile(id: string): boolean {
  return (SYSTEM_PROFILE_IDS as readonly string[]).includes(id);
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
}

// ─── Thread queries ────────────────────────────────────────────────────

function rowToThread(row: Record<string, unknown>): Thread {
  return {
    id:                 row.id as string,
    profileId:          row.profile_id as string,
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
    `INSERT INTO threads (id, profile_id, title, archived, archived_at) VALUES (?, ?, ?, ?, ?)`,
    [t.id, t.profileId, t.title ?? null, t.archived ? 1 : 0, t.archivedAt ?? null],
  );
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM threads WHERE id = ?`, [t.id],
  );
  if (!row) throw new Error(`insertThread: failed to read back thread ${t.id} after insert`);
  return rowToThread(row);
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
    `DELETE FROM saved_answers; DELETE FROM journal_entries; DELETE FROM messages; DELETE FROM threads; DELETE FROM profiles;`,
  );
}

// ─── Saved answers ───────────────────────────────────────────────────────────

export type SavedAnswer = {
  id:        string;
  messageId: string;
  threadId:  string | null;
  profileId: string;
  persona:   'saga' | 'krishna';
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
    persona:   row.persona as SavedAnswer['persona'],
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
