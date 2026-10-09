import { db } from "./db.js";

export const KEY_RESULT_KINDS = new Set(["metric", "milestone", "jira"]);

const PERIOD_PATTERN = /^\d{4}-Q[1-4]$/;
// Jira's summary field limit — every title becomes an issue summary.
const MAX_TITLE_LENGTH = 255;
const MAX_JQL_LENGTH = 2000;
// How many check-ins per key result the list endpoint returns for the
// sparkline; the full history comes from listCheckIns.
const HISTORY_POINTS = 30;

// --- OKR sync settings (which Jira project/issue types to push into) ---

export async function getOkrSettings(userId) {
  const { rows } = await db.query(
    "SELECT project_key, objective_issue_type_id, key_result_issue_type_id FROM okr_settings WHERE user_id = $1",
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    projectKey: row.project_key,
    objectiveIssueTypeId: row.objective_issue_type_id,
    keyResultIssueTypeId: row.key_result_issue_type_id,
  };
}

export async function upsertOkrSettings(userId, { projectKey, objectiveIssueTypeId, keyResultIssueTypeId }) {
  if (!projectKey?.trim()) throw new Error("Choose a Jira project");
  if (!objectiveIssueTypeId?.trim() || !keyResultIssueTypeId?.trim()) {
    throw new Error("Choose an issue type for both objectives and key results");
  }

  await db.query(
    `INSERT INTO okr_settings (user_id, project_key, objective_issue_type_id, key_result_issue_type_id, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id) DO UPDATE SET
       project_key = EXCLUDED.project_key,
       objective_issue_type_id = EXCLUDED.objective_issue_type_id,
       key_result_issue_type_id = EXCLUDED.key_result_issue_type_id,
       updated_at = EXCLUDED.updated_at`,
    [userId, projectKey.trim(), objectiveIssueTypeId.trim(), keyResultIssueTypeId.trim()],
  );
}

// --- Progress (0..1), derived on read, never stored ---

// Metric: works for decreasing targets too (e.g. latency 800 → 300) —
// progress is how far current has moved from start toward target, clamped.
// Jira query: share of matching issues that are done, from the last count.
export function keyResultProgress(kr) {
  if (kr.kind === "milestone") return kr.done ? 1 : 0;
  if (kr.kind === "jira") return kr.jiraTotal > 0 ? kr.jiraDone / kr.jiraTotal : 0;
  const span = kr.targetValue - kr.startValue;
  if (span === 0) return kr.currentValue === kr.targetValue ? 1 : 0;
  return Math.min(1, Math.max(0, (kr.currentValue - kr.startValue) / span));
}

export function objectiveProgress(keyResults) {
  if (keyResults.length === 0) return 0;
  return keyResults.reduce((sum, kr) => sum + keyResultProgress(kr), 0) / keyResults.length;
}

// The number a check-in records alongside progress.
function checkInValue(kr) {
  if (kr.kind === "metric") return kr.currentValue;
  if (kr.kind === "jira") return kr.jiraDone;
  return null;
}

// --- Shapes ---

function keyResultToApiShape(row, history = []) {
  const kr = {
    id: String(row.id),
    objectiveId: String(row.objective_id),
    title: row.title,
    kind: row.kind,
    startValue: row.start_value,
    targetValue: row.target_value,
    currentValue: row.current_value,
    unit: row.unit ?? "",
    done: row.done,
    jql: row.jql ?? "",
    jiraTotal: row.jira_total,
    jiraDone: row.jira_done,
    countError: row.count_error,
    jiraIssueKey: row.jira_issue_key,
    syncError: row.sync_error,
    history,
  };
  return { ...kr, progress: keyResultProgress(kr) };
}

function objectiveToApiShape(row, keyResults) {
  return {
    id: String(row.id),
    period: row.period,
    title: row.title,
    description: row.description,
    jiraIssueKey: row.jira_issue_key,
    syncError: row.sync_error,
    keyResults,
    progress: objectiveProgress(keyResults),
  };
}

function checkInToApiShape(row) {
  return {
    id: String(row.id),
    value: row.value,
    progress: row.progress,
    note: row.note,
    createdAt: row.created_at,
  };
}

const OBJECTIVE_COLUMNS = "id, period, title, description, jira_issue_key, sync_error";
const KEY_RESULT_COLUMNS = `id, objective_id, title, kind, start_value, target_value, current_value, unit, done,
  jql, jira_total, jira_done, count_error, jira_issue_key, sync_error`;

// --- Validation ---

function validateTitle(title) {
  if (!title?.trim()) throw new Error("Title is required");
  if (title.trim().length > MAX_TITLE_LENGTH) throw new Error(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  return title.trim();
}

function validateObjectiveInput({ period, title, description }) {
  if (!PERIOD_PATTERN.test(period ?? "")) throw new Error("period must look like 2026-Q4");
  return { period, title: validateTitle(title), description: (description ?? "").trim() };
}

export function validateKeyResultInput({ title, kind, startValue, targetValue, currentValue, unit, done, jql }) {
  if (!KEY_RESULT_KINDS.has(kind)) throw new Error("kind must be metric, milestone, or jira");
  const base = {
    title: validateTitle(title),
    kind,
    startValue: null,
    targetValue: null,
    currentValue: null,
    unit: null,
    done: false,
    jql: null,
  };

  if (kind === "milestone") return { ...base, done: Boolean(done) };

  if (kind === "jira") {
    if (!jql?.trim()) throw new Error("A JQL query is required");
    if (jql.trim().length > MAX_JQL_LENGTH) throw new Error(`JQL must be at most ${MAX_JQL_LENGTH} characters`);
    return { ...base, jql: jql.trim() };
  }

  for (const [name, value] of [
    ["Start value", startValue],
    ["Target value", targetValue],
    ["Current value", currentValue],
  ]) {
    if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  }
  if (startValue === targetValue) throw new Error("Target value must differ from start value");
  return { ...base, startValue, targetValue, currentValue, unit: unit?.trim() || null };
}

// --- Reads ---

async function listHistory(userId, keyResultIds) {
  const { rows } = await db.query(
    `SELECT key_result_id, progress, created_at FROM (
       SELECT key_result_id, progress, created_at, id,
         ROW_NUMBER() OVER (PARTITION BY key_result_id ORDER BY created_at DESC, id DESC) AS rn
       FROM key_result_checkins
       WHERE user_id = $1 AND key_result_id = ANY($2::int[])
     ) recent
     WHERE rn <= $3
     ORDER BY created_at ASC, id ASC`,
    [userId, keyResultIds, HISTORY_POINTS],
  );
  const byKeyResult = new Map();
  for (const row of rows) {
    const key = String(row.key_result_id);
    if (!byKeyResult.has(key)) byKeyResult.set(key, []);
    byKeyResult.get(key).push({ progress: row.progress, at: row.created_at });
  }
  return byKeyResult;
}

async function listKeyResultsForObjectives(userId, objectiveIds) {
  if (objectiveIds.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT ${KEY_RESULT_COLUMNS} FROM key_results
     WHERE user_id = $1 AND objective_id = ANY($2::int[])
     ORDER BY position ASC, id ASC`,
    [userId, objectiveIds],
  );
  const history = await listHistory(
    userId,
    rows.map((r) => r.id),
  );
  const byObjective = new Map(objectiveIds.map((id) => [String(id), []]));
  for (const row of rows) {
    byObjective.get(String(row.objective_id)).push(keyResultToApiShape(row, history.get(String(row.id)) ?? []));
  }
  return byObjective;
}

export async function listObjectives(userId, period) {
  const { rows } = await db.query(
    `SELECT ${OBJECTIVE_COLUMNS} FROM objectives
     WHERE user_id = $1 AND period = $2
     ORDER BY position ASC, id ASC`,
    [userId, period],
  );
  const keyResults = await listKeyResultsForObjectives(userId, rows.map((r) => r.id));
  return rows.map((row) => objectiveToApiShape(row, keyResults.get(String(row.id))));
}

export async function getObjective(userId, id) {
  const { rows } = await db.query(`SELECT ${OBJECTIVE_COLUMNS} FROM objectives WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  if (!rows[0]) return null;
  const keyResults = await listKeyResultsForObjectives(userId, [rows[0].id]);
  return objectiveToApiShape(rows[0], keyResults.get(String(rows[0].id)));
}

export async function getKeyResult(userId, id) {
  const { rows } = await db.query(`SELECT ${KEY_RESULT_COLUMNS} FROM key_results WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  return rows[0] ? keyResultToApiShape(rows[0]) : null;
}

export async function listCheckIns(userId, keyResultId) {
  const { rows } = await db.query(
    `SELECT id, value, progress, note, created_at FROM key_result_checkins
     WHERE key_result_id = $1 AND user_id = $2
     ORDER BY created_at DESC, id DESC`,
    [keyResultId, userId],
  );
  return rows.map(checkInToApiShape);
}

// --- Writes ---

export async function createObjective(userId, input) {
  const { period, title, description } = validateObjectiveInput(input);
  const { rows } = await db.query(
    `INSERT INTO objectives (user_id, period, title, description, position, updated_at)
     VALUES ($1, $2, $3, $4,
       (SELECT COALESCE(MAX(position) + 1, 0) FROM objectives WHERE user_id = $1 AND period = $2),
       now())
     RETURNING id`,
    [userId, period, title, description],
  );
  return { id: String(rows[0].id) };
}

export async function updateObjective(userId, id, input) {
  const { period, title, description } = validateObjectiveInput(input);
  const result = await db.query(
    `UPDATE objectives SET period = $1, title = $2, description = $3, updated_at = now()
     WHERE id = $4 AND user_id = $5`,
    [period, title, description, id, userId],
  );
  if (result.rowCount === 0) throw new Error("Objective not found");
}

// Key results (and their check-ins) go with it via ON DELETE CASCADE.
export async function deleteObjective(userId, id) {
  const result = await db.query("DELETE FROM objectives WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new Error("Objective not found");
}

// `input` is already validated (validateKeyResultInput) and, for a Jira
// query, already counted (jiraTotal/jiraDone) by okrSync.js.
export async function createKeyResult(userId, objectiveId, input) {
  const { rows: owner } = await db.query("SELECT 1 FROM objectives WHERE id = $1 AND user_id = $2", [
    objectiveId,
    userId,
  ]);
  if (owner.length === 0) throw new Error("Objective not found");

  const { rows } = await db.query(
    `INSERT INTO key_results
       (objective_id, user_id, title, kind, start_value, target_value, current_value, unit, done, jql,
        jira_total, jira_done, position, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       (SELECT COALESCE(MAX(position) + 1, 0) FROM key_results WHERE objective_id = $1),
       now())
     RETURNING id`,
    [
      objectiveId,
      userId,
      input.title,
      input.kind,
      input.startValue,
      input.targetValue,
      input.currentValue,
      input.unit,
      input.done,
      input.jql,
      input.jiraTotal ?? null,
      input.jiraDone ?? null,
    ],
  );
  const id = String(rows[0].id);
  await recordCheckIn(userId, id);
  return { id };
}

export async function updateKeyResult(userId, id, input) {
  const result = await db.query(
    `UPDATE key_results
     SET title = $1, kind = $2, start_value = $3, target_value = $4, current_value = $5, unit = $6, done = $7,
         jql = $8, jira_total = $9, jira_done = $10, count_error = NULL, updated_at = now()
     WHERE id = $11 AND user_id = $12`,
    [
      input.title,
      input.kind,
      input.startValue,
      input.targetValue,
      input.currentValue,
      input.unit,
      input.done,
      input.jql,
      input.jiraTotal ?? null,
      input.jiraDone ?? null,
      id,
      userId,
    ],
  );
  if (result.rowCount === 0) throw new Error("Key result not found");
  await recordCheckIn(userId, id, { onlyIfChanged: true });
}

// The check-in's own value change: a new current value (metric) or done
// state (milestone). A Jira-query key result's value comes from its count.
export async function applyCheckInValue(userId, id, { currentValue, done }) {
  const kr = await getKeyResult(userId, id);
  if (!kr) throw new Error("Key result not found");
  if (kr.kind === "metric") {
    if (!Number.isFinite(currentValue)) throw new Error("Current value must be a number");
    await db.query("UPDATE key_results SET current_value = $1, updated_at = now() WHERE id = $2 AND user_id = $3", [
      currentValue,
      id,
      userId,
    ]);
  } else if (kr.kind === "milestone") {
    await db.query("UPDATE key_results SET done = $1, updated_at = now() WHERE id = $2 AND user_id = $3", [
      Boolean(done),
      id,
      userId,
    ]);
  }
}

export async function setKeyResultCounts(userId, id, { total, done, countError }) {
  if (countError) {
    await db.query("UPDATE key_results SET count_error = $1 WHERE id = $2 AND user_id = $3", [countError, id, userId]);
    return;
  }
  await db.query(
    "UPDATE key_results SET jira_total = $1, jira_done = $2, count_error = NULL WHERE id = $3 AND user_id = $4",
    [total, done, id, userId],
  );
}

// Snapshots the key result's current value/progress into its history. With
// onlyIfChanged, skips the write when the latest point already matches —
// that's the automatic path (edits, count refreshes); an explicit check-in
// always records, since its note is the point.
export async function recordCheckIn(userId, id, { note = "", onlyIfChanged = false } = {}) {
  const kr = await getKeyResult(userId, id);
  if (!kr) throw new Error("Key result not found");
  const value = checkInValue(kr);

  if (onlyIfChanged) {
    const { rows } = await db.query(
      `SELECT value, progress FROM key_result_checkins
       WHERE key_result_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [id],
    );
    if (rows[0] && rows[0].value === value && rows[0].progress === kr.progress) return false;
  }

  await db.query(
    "INSERT INTO key_result_checkins (key_result_id, user_id, value, progress, note) VALUES ($1, $2, $3, $4, $5)",
    [id, userId, value, kr.progress, note.trim()],
  );
  return true;
}

export async function deleteKeyResult(userId, id) {
  const result = await db.query("DELETE FROM key_results WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new Error("Key result not found");
}

// Records the outcome of a push to Jira. A failed push keeps any key already
// stored (the issue still exists, it's just stale) and records the error.
export async function setObjectiveSyncState(userId, id, { jiraIssueKey, syncError }) {
  await db.query(
    `UPDATE objectives
     SET jira_issue_key = COALESCE($1, jira_issue_key), sync_error = $2,
         synced_at = CASE WHEN $2::text IS NULL THEN now() ELSE synced_at END
     WHERE id = $3 AND user_id = $4`,
    [jiraIssueKey ?? null, syncError ?? null, id, userId],
  );
}

export async function setKeyResultSyncState(userId, id, { jiraIssueKey, syncError }) {
  await db.query(
    `UPDATE key_results
     SET jira_issue_key = COALESCE($1, jira_issue_key), sync_error = $2,
         synced_at = CASE WHEN $2::text IS NULL THEN now() ELSE synced_at END
     WHERE id = $3 AND user_id = $4`,
    [jiraIssueKey ?? null, syncError ?? null, id, userId],
  );
}
