import { db } from "./db.js";

function toApiShape(row) {
  return {
    id: String(row.id),
    issueKey: row.issue_key,
    title: row.title,
    notes: row.notes,
    started: row.started_at,
    timeSpentSeconds: row.duration_seconds,
  };
}

export async function listTimeBlocks(userId, startMs, endMs) {
  const { rows } = await db.query(
    `SELECT id, issue_key, title, notes, started_at, duration_seconds
     FROM time_blocks
     WHERE user_id = $1 AND started_at_ms >= $2 AND started_at_ms < $3
     ORDER BY started_at_ms ASC`,
    [userId, startMs, endMs],
  );
  return rows.map(toApiShape);
}

export async function createTimeBlock(userId, { issueKey, title, notes, started, timeSpentSeconds }) {
  const startedMs = Date.parse(started);
  if (Number.isNaN(startedMs)) throw new Error("started must be a valid timestamp");

  const { rows } = await db.query(
    `INSERT INTO time_blocks (user_id, issue_key, title, notes, started_at, started_at_ms, duration_seconds, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     RETURNING id`,
    [userId, issueKey || null, title, notes || null, started, startedMs, timeSpentSeconds],
  );
  return { id: String(rows[0].id) };
}

export async function updateTimeBlock(userId, id, { issueKey, title, notes, started, timeSpentSeconds }) {
  const startedMs = Date.parse(started);
  if (Number.isNaN(startedMs)) throw new Error("started must be a valid timestamp");

  const result = await db.query(
    `UPDATE time_blocks
     SET issue_key = $1, title = $2, notes = $3, started_at = $4, started_at_ms = $5, duration_seconds = $6, updated_at = now()
     WHERE id = $7 AND user_id = $8`,
    [issueKey || null, title, notes || null, started, startedMs, timeSpentSeconds, id, userId],
  );
  if (result.rowCount === 0) throw new Error("Time block not found");
}

export async function deleteTimeBlock(userId, id) {
  const result = await db.query("DELETE FROM time_blocks WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new Error("Time block not found");
}
