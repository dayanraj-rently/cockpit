import pg from "pg";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (e.g. postgres://user:password@localhost:5432/cockpit)");
  process.exit(1);
}

export const db = new pg.Pool({ connectionString: DATABASE_URL });

// Base schema. Additive column changes should use `ALTER TABLE ... ADD
// COLUMN IF NOT EXISTS ...` (native to Postgres, no PRAGMA-style existence
// check needed); a destructive rebuild is still only acceptable when old
// data is provably unusable under the new shape — see server/CLAUDE.md.
// The tenants/tenant_id migration just below is the first real example of
// an additive change against a database that already has rows in it.
await db.query(`
  CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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

// tenants/tenant_id migration. `users.tenant_id` is declared nullable above
// so this runs safely against a pre-existing `users` table with rows in
// it (CREATE TABLE IF NOT EXISTS never adds a missing column to an
// existing table). Every user without a tenant gets backfilled into their
// own new one-person tenant — this preserves every existing user's data
// exactly as isolated as it already was, rather than merging strangers'
// accounts into a single shared default tenant. Idempotent: a second run
// finds zero NULL tenant_id rows and the final ALTER COLUMN is a no-op if
// the column is already NOT NULL.
await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE");

const { rows: orphanedUsers } = await db.query("SELECT id, username FROM users WHERE tenant_id IS NULL");
for (const user of orphanedUsers) {
  const { rows: tenantRows } = await db.query(
    "INSERT INTO tenants (name) VALUES ($1) RETURNING id",
    [`${user.username}'s workspace`],
  );
  await db.query("UPDATE users SET tenant_id = $1 WHERE id = $2", [tenantRows[0].id, user.id]);
}

await db.query("ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL");

// role migration. Same nullable-then-backfill-then-NOT-NULL pattern as
// tenant_id above. Invariant: every tenant with at least one user has at
// least one admin. The natural admin is whoever was that tenant's FIRST
// user (lowest id) — this generalizes the pre-multi-tenancy rule ("the
// first user created via /install is the administrator") now that every
// tenant gets its own first user via signup or the CLI, rather than there
// being one single global install. Idempotent: a second run finds zero
// NULL role rows and the final ALTER COLUMN calls are no-ops if already
// set.
await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT");

await db.query(`
  UPDATE users SET role = 'admin'
  WHERE role IS NULL
  AND id IN (
    SELECT DISTINCT ON (tenant_id) id FROM users WHERE role IS NULL ORDER BY tenant_id, id ASC
  )
`);
await db.query("UPDATE users SET role = 'member' WHERE role IS NULL");
await db.query("ALTER TABLE users ALTER COLUMN role SET NOT NULL");
await db.query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member'");
