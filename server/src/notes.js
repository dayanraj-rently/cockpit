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

export async function listNotes(userId) {
  const { rows } = await db.query(
    `SELECT id, title, content_html, created_at, updated_at
     FROM notes
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(toApiShape);
}

export async function getNote(userId, id) {
  const { rows } = await db.query(
    `SELECT id, title, content_html, created_at, updated_at
     FROM notes
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ? toApiShape(rows[0]) : null;
}

export async function createNote(userId, { title, contentHtml }) {
  const { rows } = await db.query(
    `INSERT INTO notes (user_id, title, content_html, updated_at)
     VALUES ($1, $2, $3, now())
     RETURNING id`,
    [userId, title || "", sanitizeContent(contentHtml)],
  );
  return { id: String(rows[0].id) };
}

export async function updateNote(userId, id, { title, contentHtml }) {
  const result = await db.query(
    `UPDATE notes
     SET title = $1, content_html = $2, updated_at = now()
     WHERE id = $3 AND user_id = $4`,
    [title || "", sanitizeContent(contentHtml), id, userId],
  );
  if (result.rowCount === 0) throw new Error("Note not found");
}

export async function deleteNote(userId, id) {
  const result = await db.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new Error("Note not found");
}
