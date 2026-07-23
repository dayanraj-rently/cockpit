import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db.js";

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createTenant(name) {
  const { rows } = await db.query("INSERT INTO tenants (name) VALUES ($1) RETURNING id", [name]);
  return rows[0].id;
}

// CLI-only helper (see scripts/createUser.js) for an admin adding another
// user to an existing organization by name, rather than always spinning up
// a new tenant. Exact, case-sensitive name match — there's no unique
// constraint on tenants.name, so an admin who typos a new name gets a
// second, separate tenant rather than an error; that's an acceptable
// tradeoff for a one-off CLI tool with a human reading its output.
export async function findOrCreateTenantByName(name) {
  const { rows } = await db.query("SELECT id FROM tenants WHERE name = $1", [name]);
  if (rows[0]) return { id: rows[0].id, created: false };
  const id = await createTenant(name);
  return { id, created: true };
}

export async function createUser(username, password, tenantId) {
  const passwordHash = bcrypt.hashSync(password, 12);
  await db.query(
    "INSERT INTO users (tenant_id, username, password_hash) VALUES ($1, $2, $3)",
    [tenantId, username, passwordHash],
  );
}

// Signup entry point: creates a brand-new tenant and its first user together.
// The tenant is never user-named — signup is just username/password, same
// as before multi-tenancy existed — so its name is auto-generated from the
// username, exactly matching the convention db.js's backfill migration uses
// for pre-existing users. Wrapped in one transaction (checked-out client,
// not the shared pool — see setQuadrantOrder in overrides.js for the same
// pattern) so a username collision on the second INSERT can never leave an
// orphaned, user-less tenant behind.
export async function createTenantWithFirstUser(username, password) {
  const tenantName = `${username}'s workspace`;
  const passwordHash = bcrypt.hashSync(password, 12);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows: tenantRows } = await client.query(
      "INSERT INTO tenants (name) VALUES ($1) RETURNING id",
      [tenantName],
    );
    const tenantId = tenantRows[0].id;
    const { rows: userRows } = await client.query(
      "INSERT INTO users (tenant_id, username, password_hash) VALUES ($1, $2, $3) RETURNING id",
      [tenantId, username, passwordHash],
    );
    await client.query("COMMIT");
    return { userId: userRows[0].id, tenantId, tenantName };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// username is unique across the whole database, not just within a tenant —
// deliberately simpler than per-tenant uniqueness, which would require a
// tenant-selector step (subdomain, org slug, ...) at login. See
// server/CLAUDE.md for the tradeoff this accepts.
export async function verifyCredentials(username, password) {
  const { rows } = await db.query(
    `SELECT users.*, tenants.name AS tenant_name
     FROM users JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.username = $1`,
    [username],
  );
  const user = rows[0];
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return { id: user.id, username: user.username, tenantId: user.tenant_id, tenantName: user.tenant_name };
}

export async function createSession(userId) {
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [id, userId, expiresAt]);
  return { id, expiresAt };
}

export async function getSessionUser(sessionId) {
  if (!sessionId) return null;
  const { rows } = await db.query(
    `SELECT users.id AS id, users.username AS username, users.tenant_id AS tenant_id,
            tenants.name AS tenant_name, sessions.expires_at AS expires_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     JOIN tenants ON tenants.id = users.tenant_id
     WHERE sessions.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await deleteSession(sessionId);
    return null;
  }
  return { id: row.id, username: row.username, tenantId: row.tenant_id, tenantName: row.tenant_name };
}

export async function deleteSession(sessionId) {
  await db.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  };
}

export async function requireAuth(req, res, next) {
  try {
    const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    req.user = user;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
}
