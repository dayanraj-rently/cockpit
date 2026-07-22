import sanitizeHtml from "sanitize-html";
import { db } from "./db.js";

// Notes are authored via a contentEditable editor on the client, so the HTML
// arriving here is untrusted input, not trusted markup — sanitize before it
// ever touches the DB (and again, implicitly, since we always re-serve what
// we stored: sanitizing on write means every read is safe by construction).
const SANITIZE_OPTIONS = {
  allowedTags: ["p", "div", "br", "b", "strong", "i", "em", "u", "h1", "h2", "h3", "ul", "ol", "li", "a"],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["http", "https", "mailto"],
};

function sanitizeContent(html) {
  return sanitizeHtml(html || "", SANITIZE_OPTIONS);
}

function toApiShape(row) {
  return {
    id: String(row.id),
    title: row.title,
    contentHtml: row.content_html,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listNotes(userId) {
  const rows = db
    .prepare(
      `SELECT id, title, content_html, created_at, updated_at
       FROM notes
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(userId);
  return rows.map(toApiShape);
}

export function getNote(userId, id) {
  const row = db
    .prepare(
      `SELECT id, title, content_html, created_at, updated_at
       FROM notes
       WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId);
  return row ? toApiShape(row) : null;
}

export function createNote(userId, { title, contentHtml }) {
  const result = db
    .prepare(
      `INSERT INTO notes (user_id, title, content_html, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
    )
    .run(userId, title || "", sanitizeContent(contentHtml));
  return { id: String(result.lastInsertRowid) };
}

export function updateNote(userId, id, { title, contentHtml }) {
  const result = db
    .prepare(
      `UPDATE notes
       SET title = ?, content_html = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
    .run(title || "", sanitizeContent(contentHtml), id, userId);
  if (result.changes === 0) throw new Error("Note not found");
}

export function deleteNote(userId, id) {
  const result = db.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`).run(id, userId);
  if (result.changes === 0) throw new Error("Note not found");
}
