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

export function listTimeBlocks(userId, startMs, endMs) {
  const rows = db
    .prepare(
      `SELECT id, issue_key, title, notes, started_at, duration_seconds
       FROM time_blocks
       WHERE user_id = ? AND started_at_ms >= ? AND started_at_ms < ?
       ORDER BY started_at_ms ASC`,
    )
    .all(userId, startMs, endMs);
  return rows.map(toApiShape);
}

export function createTimeBlock(userId, { issueKey, title, notes, started, timeSpentSeconds }) {
  const startedMs = Date.parse(started);
  if (Number.isNaN(startedMs)) throw new Error("started must be a valid timestamp");

  const result = db
    .prepare(
      `INSERT INTO time_blocks (user_id, issue_key, title, notes, started_at, started_at_ms, duration_seconds, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(userId, issueKey || null, title, notes || null, started, startedMs, timeSpentSeconds);
  return { id: String(result.lastInsertRowid) };
}

export function updateTimeBlock(userId, id, { issueKey, title, notes, started, timeSpentSeconds }) {
  const startedMs = Date.parse(started);
  if (Number.isNaN(startedMs)) throw new Error("started must be a valid timestamp");

  const result = db
    .prepare(
      `UPDATE time_blocks
       SET issue_key = ?, title = ?, notes = ?, started_at = ?, started_at_ms = ?, duration_seconds = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
    .run(issueKey || null, title, notes || null, started, startedMs, timeSpentSeconds, id, userId);
  if (result.changes === 0) throw new Error("Time block not found");
}

export function deleteTimeBlock(userId, id) {
  const result = db.prepare(`DELETE FROM time_blocks WHERE id = ? AND user_id = ?`).run(id, userId);
  if (result.changes === 0) throw new Error("Time block not found");
}
