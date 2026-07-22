import { db } from "./db.js";
import { encrypt, decrypt } from "./crypto.js";
import { refreshAccessToken } from "./googleAuth.js";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
// Refresh a little before actual expiry so a slow request never straddles it.
const REFRESH_MARGIN_MS = 60 * 1000;

export function getGoogleCalendarSettingsPublic(userId) {
  const row = db.prepare("SELECT user_id FROM google_calendar_settings WHERE user_id = ?").get(userId);
  return { connected: Boolean(row) };
}

export function saveGoogleTokens(userId, { accessToken, refreshToken, expiresInSeconds }) {
  const expiryMs = Date.now() + expiresInSeconds * 1000;
  db.prepare(
    `INSERT INTO google_calendar_settings (user_id, access_token_ciphertext, refresh_token_ciphertext, token_expiry_ms, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       access_token_ciphertext = excluded.access_token_ciphertext,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       token_expiry_ms = excluded.token_expiry_ms,
       updated_at = excluded.updated_at`,
  ).run(userId, encrypt(accessToken), encrypt(refreshToken), expiryMs);
}

export function disconnectGoogleCalendar(userId) {
  db.prepare("DELETE FROM google_calendar_settings WHERE user_id = ?").run(userId);
}

async function ensureValidAccessToken(userId) {
  const row = db
    .prepare(
      "SELECT access_token_ciphertext, refresh_token_ciphertext, token_expiry_ms FROM google_calendar_settings WHERE user_id = ?",
    )
    .get(userId);
  if (!row) return null;

  if (row.token_expiry_ms - REFRESH_MARGIN_MS > Date.now()) {
    return decrypt(row.access_token_ciphertext);
  }

  const refreshToken = decrypt(row.refresh_token_ciphertext);
  const { accessToken, expiresInSeconds } = await refreshAccessToken(refreshToken);
  db.prepare(
    `UPDATE google_calendar_settings
     SET access_token_ciphertext = ?, token_expiry_ms = ?, updated_at = datetime('now')
     WHERE user_id = ?`,
  ).run(encrypt(accessToken), Date.now() + expiresInSeconds * 1000, userId);
  return accessToken;
}

// All-day events carry a plain "YYYY-MM-DD" meant as a calendar date, not a
// UTC instant — build it from local parts so it can't shift a day depending
// on timezone, the way `new Date("2026-07-16")` (parsed as UTC midnight) can.
function parseEventDate(dateInfo) {
  if (dateInfo.dateTime) return new Date(dateInfo.dateTime);
  const [year, month, day] = dateInfo.date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Returns null when no calendar is connected (distinct from an empty array,
// which means "connected, no events in range") so the route can tell the
// client to prompt for setup.
export async function fetchCalendarEvents(userId, startMs, endMs) {
  const accessToken = await ensureValidAccessToken(userId);
  if (!accessToken) return null;

  const events = [];
  let pageToken;

  do {
    const params = new URLSearchParams({
      timeMin: new Date(startMs).toISOString(),
      timeMax: new Date(endMs).toISOString(),
      singleEvents: "true", // expands recurring events into instances for us
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${EVENTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Calendar events fetch failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    for (const item of data.items ?? []) {
      if (item.status === "cancelled") continue;
      events.push({
        id: item.id,
        title: item.summary ?? "(no title)",
        start: parseEventDate(item.start).toISOString(),
        end: parseEventDate(item.end).toISOString(),
        location: item.location,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}
