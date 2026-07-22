import { db } from "./db.js";
import { encrypt, decrypt } from "./crypto.js";

function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, "");
}

// Public shape: never expose the ciphertext or decrypted token to the client.
export async function getJiraSettingsPublic(userId) {
  const { rows } = await db.query("SELECT base_url, email, jql FROM jira_settings WHERE user_id = $1", [userId]);
  const row = rows[0];
  if (!row) {
    return { baseUrl: null, email: null, hasToken: false, jql: null };
  }
  return {
    baseUrl: row.base_url,
    email: row.email,
    hasToken: true,
    jql: row.jql || null,
  };
}

// Internal shape: includes the decrypted token, for making Jira API calls.
export async function getJiraSettings(userId) {
  const { rows } = await db.query("SELECT * FROM jira_settings WHERE user_id = $1", [userId]);
  const row = rows[0];
  if (!row) return null;
  return {
    baseUrl: row.base_url,
    email: row.email,
    apiToken: decrypt(row.token_ciphertext),
    jql: row.jql || null,
  };
}

export async function upsertJiraSettings(userId, { baseUrl, email, apiToken, jql }) {
  if (!baseUrl?.trim() || !email?.trim()) {
    throw new Error("Base URL and email are required");
  }
  if (!jql?.trim()) {
    throw new Error("JQL query is required");
  }
  if (!/^https?:\/\//i.test(baseUrl.trim())) {
    throw new Error("Base URL must start with http:// or https://");
  }

  const { rows: existingRows } = await db.query(
    "SELECT token_ciphertext FROM jira_settings WHERE user_id = $1",
    [userId],
  );
  const existing = existingRows[0];

  if (!apiToken?.trim() && !existing) {
    throw new Error("API token is required");
  }

  const tokenCiphertext = apiToken?.trim() ? encrypt(apiToken.trim()) : existing.token_ciphertext;

  await db.query(
    `INSERT INTO jira_settings (user_id, base_url, email, token_ciphertext, jql, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET
       base_url = EXCLUDED.base_url,
       email = EXCLUDED.email,
       token_ciphertext = EXCLUDED.token_ciphertext,
       jql = EXCLUDED.jql,
       updated_at = EXCLUDED.updated_at`,
    [userId, normalizeBaseUrl(baseUrl), email.trim(), tokenCiphertext, jql.trim()],
  );
}
