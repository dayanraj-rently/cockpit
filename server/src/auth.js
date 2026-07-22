import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db.js";

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createUser(username, password) {
  const passwordHash = bcrypt.hashSync(password, 12);
  await db.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", [username, passwordHash]);
}

export async function hasAnyUsers() {
  const { rows } = await db.query("SELECT COUNT(*) AS count FROM users");
  return Number(rows[0].count) > 0;
}

export async function verifyCredentials(username, password) {
  const { rows } = await db.query("SELECT * FROM users WHERE username = $1", [username]);
  const user = rows[0];
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return { id: user.id, username: user.username };
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
    `SELECT users.id as id, users.username as username, sessions.expires_at as expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await deleteSession(sessionId);
    return null;
  }
  return { id: row.id, username: row.username };
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
