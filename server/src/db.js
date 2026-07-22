import pg from "pg";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (e.g. postgres://user:password@localhost:5432/cockpit)");
  process.exit(1);
}

export const db = new pg.Pool({ connectionString: DATABASE_URL });

// Base schema, in its current final shape — this is a fresh Postgres
// database with no legacy rows to reconcile, so (unlike the old SQLite
// db.js) there's no historical ALTER TABLE trail to replay. Future additive
// column changes should use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
// (native to Postgres, no PRAGMA-style existence check needed); a
// destructive rebuild is still only acceptable when old data is provably
// unusable under the new shape — see server/CLAUDE.md.
await db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jira_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    base_url TEXT NOT NULL,
    email TEXT NOT NULL,
    token_ciphertext TEXT NOT NULL,
    jql TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS quadrant_overrides (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issue_key TEXT NOT NULL,
    quadrant TEXT NOT NULL,
    position INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, issue_key)
  );

  -- started_at_ms/token_expiry_ms below are epoch milliseconds and MUST be
  -- BIGINT: Postgres's INTEGER is 32-bit and overflows well before any
  -- millisecond timestamp since ~1970 fits (SQLite's INTEGER is dynamically
  -- sized up to 8 bytes, so this constraint didn't exist there).
  CREATE TABLE IF NOT EXISTS time_blocks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issue_key TEXT,
    title TEXT NOT NULL,
    notes TEXT,
    started_at TEXT NOT NULL,
    started_at_ms BIGINT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS google_calendar_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token_ciphertext TEXT NOT NULL,
    refresh_token_ciphertext TEXT NOT NULL,
    token_expiry_ms BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    content_html TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
