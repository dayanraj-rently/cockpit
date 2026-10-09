import { db } from "./db.js";

// Six color slots, matching the client's --chart-1..6 tokens.
const COLOR_COUNT = 6;
const MAX_CONTENT_LENGTH = 5000;
// Generous upper bound on board coordinates — just keeps a bad request from
// storing a note somewhere nobody could ever scroll to.
const MAX_COORD = 20000;

function validate({ content, color, x, y }) {
  const text = content ?? "";
  if (typeof text !== "string") throw new Error("content must be a string");
  if (text.length > MAX_CONTENT_LENGTH) throw new Error(`content must be at most ${MAX_CONTENT_LENGTH} characters`);
  const colorSlot = color ?? 0;
  if (!Number.isInteger(colorSlot) || colorSlot < 0 || colorSlot >= COLOR_COUNT) {
    throw new Error(`color must be an integer from 0 to ${COLOR_COUNT - 1}`);
  }
  for (const [name, value] of [["x", x], ["y", y]]) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_COORD) {
      throw new Error(`${name} must be an integer from 0 to ${MAX_COORD}`);
    }
  }
  return { content: text, color: colorSlot, x, y };
}

function toApiShape(row) {
  return {
    id: String(row.id),
    content: row.content,
    color: row.color,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listStickyNotes(userId) {
  const { rows } = await db.query(
    `SELECT id, content, color, x, y, created_at, updated_at
     FROM sticky_notes
     WHERE user_id = $1
     ORDER BY updated_at ASC, id ASC`,
    [userId],
  );
  return rows.map(toApiShape);
}

export async function createStickyNote(userId, input) {
  const { content, color, x, y } = validate(input);
  const { rows } = await db.query(
    `INSERT INTO sticky_notes (user_id, content, color, x, y, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id`,
    [userId, content, color, x, y],
  );
  return { id: String(rows[0].id) };
}

export async function updateStickyNote(userId, id, input) {
  const { content, color, x, y } = validate(input);
  const result = await db.query(
    `UPDATE sticky_notes
     SET content = $1, color = $2, x = $3, y = $4, updated_at = now()
     WHERE id = $5 AND user_id = $6`,
    [content, color, x, y, id, userId],
  );
  if (result.rowCount === 0) throw new Error("Sticky note not found");
}

export async function deleteStickyNote(userId, id) {
  const result = await db.query("DELETE FROM sticky_notes WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new Error("Sticky note not found");
}
