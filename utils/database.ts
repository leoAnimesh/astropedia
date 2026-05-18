import * as SQLite from 'expo-sqlite';

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
  return rows.map(rowToProfile);
}

export async function insertProfile(
  p: Omit<Profile, 'createdAt' | 'updatedAt' | 'syncedAt'>,
): Promise<Profile> {
  await db.runAsync(
    `INSERT INTO profiles (id, name, relationship, birth_date, birth_time, birth_city, birth_lat, birth_lng, gender, is_you)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.id, p.name, p.relationship ?? null, p.birthDate, p.birthTime ?? null,
     p.birthCity ?? null, p.birthLat ?? null, p.birthLng ?? null, p.gender ?? null, p.isYou ? 1 : 0],
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
  await db.execAsync(`DELETE FROM messages; DELETE FROM threads; DELETE FROM profiles;`);
}
