/**
 * SQLite schema: the migration list and the seed rows every database has.
 *
 * Kept free of native imports so the backup serializer (utils/backup.ts) and
 * its Node tests can share it with utils/database.ts.
 *
 * Adding a migration? Also add its tables/columns to BACKUP_TABLES in
 * utils/backup.ts (with `since` set to the new version) so backups carry them
 * and older backups get defaults for them.
 */

export type Migration = { version: number; sql: string[] };

export const MIGRATIONS: Migration[] = [
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

/** Latest migration version; written into backups as `schema`. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Synthetic profiles (e.g. the Krishna chat) that satisfy the
 * threads.profile_id foreign key. Never shown in the profile switcher.
 */
export const SYSTEM_PROFILES: readonly { id: string; name: string }[] = [
  { id: '__krishna__', name: 'Krishna' },
];
