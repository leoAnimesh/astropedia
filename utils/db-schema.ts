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

/**
 * Chat agents (gurus). Stored in threads.agent and saved_answers.persona.
 * Display copy and per-guru rules live in constants/gurus.ts.
 */
export const AGENT_IDS = ['saga', 'love', 'career', 'health', 'family', 'study', 'krishna'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export function isAgentId(v: unknown): v is AgentId {
  return typeof v === 'string' && (AGENT_IDS as readonly string[]).includes(v);
}

/**
 * Archives every active thread except the newest per (profile_id, agent):
 * pinned first, then the most recently pinned, then the latest update.
 * archived_at uses the app's ISO format (hooks/use-threads.ts).
 */
const ARCHIVE_EXTRA_ACTIVE_THREADS_SQL = `
  UPDATE threads
     SET archived = 1,
         archived_at = COALESCE(archived_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   WHERE archived = 0
     AND id NOT IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
                  PARTITION BY profile_id, agent
                  ORDER BY pinned DESC, COALESCE(pinned_at, '') DESC, updated_at DESC,
                           created_at DESC, rowid DESC
                ) AS rn
           FROM threads
          WHERE archived = 0
       ) WHERE rn = 1
     )`;

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
  {
    version: 7,
    sql: [
      // Guru chats: every thread belongs to one agent (constants/gurus.ts).
      // Existing chats are general Saga chats; Krishna's hang off __krishna__.
      `ALTER TABLE threads ADD COLUMN agent TEXT NOT NULL DEFAULT 'saga'`,
      `UPDATE threads SET agent = 'krishna' WHERE profile_id = '__krishna__'`,
      // One active (non-archived) chat per (profile, agent): the newest one
      // stays (a pinned one wins), older active ones go to Past conversations.
      ARCHIVE_EXTRA_ACTIVE_THREADS_SQL,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_active_agent
         ON threads(profile_id, agent) WHERE archived = 0`,
    ],
  },
  {
    version: 8,
    sql: [
      // Reports (utils/reports): one row per person and report kind
      // (id "<profile>:<kind>"; compatibility "<a>:compat:<b>:<mode>").
      // `payload` is a cache of the generated report (JSON, utils/reports/
      // types.ts), valid while chart_hash, the report version, the language
      // and the day match; backups drop it and keep only the reading
      // progress (0..1) and when the report was last opened.
      `CREATE TABLE IF NOT EXISTS reports (
        id           TEXT PRIMARY KEY,
        profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        kind         TEXT NOT NULL,
        chart_hash   TEXT,
        generated_at TEXT,
        payload      TEXT,
        progress     REAL NOT NULL DEFAULT 0,
        viewed_at    TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_reports_viewed ON reports(profile_id, viewed_at)`,
    ],
  },
  {
    version: 9,
    sql: [
      // Per-thread facts memory (utils/agent/thread-facts.ts, JSON): what the
      // user told the chat about themselves ("I'm already married", "I meant
      // my sister"), so later turns are planned with it after the message
      // has left the history window. Null until something is stated.
      `ALTER TABLE threads ADD COLUMN facts TEXT`,
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
