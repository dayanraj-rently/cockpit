import { getJiraSettings } from "./settings.js";
import {
  getOkrSettings,
  getObjective,
  getKeyResult,
  listObjectives,
  deleteObjective,
  deleteKeyResult,
  setObjectiveSyncState,
  setKeyResultSyncState,
  validateKeyResultInput,
  applyCheckInValue,
  setKeyResultCounts,
  recordCheckIn,
} from "./okrs.js";
import {
  createIssue,
  updateIssue,
  deleteIssue,
  getIssueSyncState,
  transitionIssueToDone,
  countIssues,
  addComment,
} from "./jira.js";

// One-way push: Postgres is the source of truth and every objective / key
// result is mirrored into a Jira issue (objective = parent, key result =
// child via `parent`). Nothing is ever pulled back — edits made in Jira to
// a summary or description are overwritten on the next push (the issue's
// description says so). Every local write has already committed before a
// push runs; a failed push is recorded on the row (`sync_error`) for the
// UI's Retry button rather than rolling the local write back.

export class OkrSetupError extends Error {}

// Jira itself was unreachable or failed (not the user's input) — a 502.
export class OkrUpstreamError extends Error {}

export async function getSyncContext(userId) {
  const jira = await getJiraSettings(userId);
  if (!jira) throw new OkrSetupError("Configure your Jira connection in Settings first.");
  const okr = await getOkrSettings(userId);
  if (!okr) throw new OkrSetupError("Choose a Jira project for OKR sync in Settings first.");
  return { jira, okr };
}

function creds({ jira }) {
  return { baseUrl: jira.baseUrl, email: jira.email, apiToken: jira.apiToken };
}

const PERIOD_LABEL = /^okr-\d{4}-Q[1-4]$/;

// Keeps any labels someone added in Jira; only swaps out our own period label.
function okrLabels(existing, period) {
  const kept = existing.filter((label) => !PERIOD_LABEL.test(label) && label !== "okr");
  return [...kept, "okr", `okr-${period}`];
}

function formatPeriod(period) {
  const [year, quarter] = period.split("-");
  return `${quarter} ${year}`;
}

function formatValue(value, unit) {
  const n = String(Number(value.toFixed(2)));
  return unit ? `${n} ${unit}` : n;
}

function percent(progress) {
  return `${Math.round(progress * 100)}%`;
}

const MANAGED_NOTE = "Managed by Cockpit. Edit it there; changes made to this issue's summary or description in Jira are overwritten on the next sync.";

function objectiveDescription(objective) {
  const count = objective.keyResults.length;
  return [
    objective.description,
    objective.description ? "" : null,
    `Period: ${formatPeriod(objective.period)}`,
    `Progress: ${percent(objective.progress)} across ${count} key result${count === 1 ? "" : "s"}`,
    "",
    MANAGED_NOTE,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// One line describing where a key result stands — used in its issue
// description and in check-in comments.
function progressLine(kr) {
  if (kr.kind === "milestone") return `Milestone: ${kr.done ? "done" : "not done yet"}`;
  if (kr.kind === "jira") {
    return `Progress: ${kr.jiraDone ?? 0} of ${kr.jiraTotal ?? 0} matching issues done (${percent(kr.progress)})`;
  }
  return (
    `Current: ${formatValue(kr.currentValue, kr.unit)} · Target: ${formatValue(kr.targetValue, kr.unit)} · ` +
    `Start: ${formatValue(kr.startValue, kr.unit)} · Progress: ${percent(kr.progress)}`
  );
}

function keyResultDescription(kr, objective) {
  return [
    `Key result of: ${objective.title}`,
    progressLine(kr),
    kr.kind === "jira" ? `Query: ${kr.jql}` : null,
    "",
    MANAGED_NOTE,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// "Jira issue count failed (400): {"errorMessages":["..."]}" → the messages.
function jiraErrorMessages(err) {
  try {
    const body = JSON.parse(err.message.slice(err.message.indexOf("): ") + 3));
    const messages = [...(body.errorMessages ?? []), ...Object.values(body.errors ?? {})];
    if (messages.length) return messages.join(" ");
  } catch {
    // not JSON — fall through to the raw message
  }
  return err.message;
}

async function countKeyResultQuery(ctx, jql) {
  try {
    return await countIssues({ ...creds(ctx), jql });
  } catch (err) {
    if (err.status === 400) throw new Error(`Jira rejected this query: ${jiraErrorMessages(err)}`);
    console.error(err);
    throw new OkrUpstreamError(err.message);
  }
}

// Validates a key result's input and, for a Jira query, counts it up front:
// an invalid query is rejected (400) before anything is saved, and the
// counts it returns are stored with the row so progress is right at once.
export async function prepareKeyResultInput(ctx, raw) {
  const input = validateKeyResultInput(raw);
  if (input.kind !== "jira") return input;
  const { total, done } = await countKeyResultQuery(ctx, input.jql);
  return { ...input, jiraTotal: total, jiraDone: done };
}

// Create-or-update one issue, then move it across the done line if needed.
// The new key is saved the moment the create succeeds, so a failure in a
// later step can never cause the next retry to create a duplicate issue.
// Returns the stored sync error (null when fully in sync).
async function pushIssue(ctx, { existingKey, createFields, fields, period, complete, saveState }) {
  let key = existingKey;
  try {
    let state;
    if (!key) {
      ({ key } = await createIssue({ ...creds(ctx), fields: { ...createFields, ...fields, labels: okrLabels([], period) } }));
      await saveState({ jiraIssueKey: key, syncError: null });
      state = await getIssueSyncState({ ...creds(ctx), issueKey: key });
    } else {
      state = await getIssueSyncState({ ...creds(ctx), issueKey: key });
      await updateIssue({ ...creds(ctx), issueKey: key, fields: { ...fields, labels: okrLabels(state.labels, period) } });
    }

    const moved = await transitionIssueToDone({
      ...creds(ctx),
      issueKey: key,
      currentCategory: state.statusCategory,
      done: complete,
    });
    const syncError = moved
      ? null
      : `Synced, but ${key}'s workflow has no transition ${complete ? "to a Done" : "out of its Done"} status from here.`;
    await saveState({ jiraIssueKey: key, syncError });
    return syncError;
  } catch (err) {
    console.error(err);
    await saveState({ jiraIssueKey: key, syncError: err.message });
    return err.message;
  }
}

async function pushObjective(ctx, userId, objective) {
  return pushIssue(ctx, {
    existingKey: objective.jiraIssueKey,
    createFields: { project: { key: ctx.okr.projectKey }, issuetype: { id: ctx.okr.objectiveIssueTypeId } },
    fields: { summary: objective.title, description: objectiveDescription(objective) },
    period: objective.period,
    complete: objective.keyResults.length > 0 && objective.progress >= 1,
    saveState: (state) => setObjectiveSyncState(userId, objective.id, state),
  });
}

async function pushKeyResult(ctx, userId, kr, objective) {
  if (!objective.jiraIssueKey) {
    const syncError = "Waiting for its objective to be created in Jira first.";
    await setKeyResultSyncState(userId, kr.id, { syncError });
    return syncError;
  }
  return pushIssue(ctx, {
    existingKey: kr.jiraIssueKey,
    createFields: {
      project: { key: ctx.okr.projectKey },
      issuetype: { id: ctx.okr.keyResultIssueTypeId },
      parent: { key: objective.jiraIssueKey },
    },
    fields: { summary: kr.title, description: keyResultDescription(kr, objective) },
    period: objective.period,
    complete: kr.progress >= 1,
    saveState: (state) => setKeyResultSyncState(userId, kr.id, state),
  });
}

// Pushes the objective and then every key result under it — used after an
// objective edit (its period/title appear on every child) and for Retry.
export async function syncObjectiveTree(ctx, userId, objectiveId) {
  let objective = await getObjective(userId, objectiveId);
  if (!objective) throw new Error("Objective not found");
  const errors = [];

  const objectiveError = await pushObjective(ctx, userId, objective);
  if (objectiveError) errors.push(objectiveError);
  objective = await getObjective(userId, objectiveId);

  for (const kr of objective.keyResults) {
    const krError = await pushKeyResult(ctx, userId, kr, objective);
    if (krError) errors.push(krError);
  }
  return errors[0] ?? null;
}

// Pushes one key result, then its objective (whose progress just changed).
// Creates the objective's issue first if it never made it into Jira.
export async function syncKeyResult(ctx, userId, keyResultId) {
  const kr = await getKeyResult(userId, keyResultId);
  if (!kr) return null;
  let objective = await getObjective(userId, kr.objectiveId);

  if (!objective.jiraIssueKey) {
    await pushObjective(ctx, userId, objective);
    objective = await getObjective(userId, kr.objectiveId);
  }

  const krError = await pushKeyResult(ctx, userId, kr, objective);
  const objectiveError = objective.jiraIssueKey ? await pushObjective(ctx, userId, objective) : null;
  return krError ?? objectiveError;
}

// Re-counts every Jira-query key result in a quarter (the page calls this
// on load) and pushes any whose progress moved, plus their objectives. A
// count that fails keeps the last numbers and records count_error.
export async function refreshPeriodCounts(ctx, userId, period) {
  const objectives = await listObjectives(userId, period);
  for (const objective of objectives) {
    let changed = false;
    for (const kr of objective.keyResults.filter((k) => k.kind === "jira")) {
      try {
        const { total, done } = await countIssues({ ...creds(ctx), jql: kr.jql });
        await setKeyResultCounts(userId, kr.id, { total, done });
        if (total !== kr.jiraTotal || done !== kr.jiraDone) {
          await recordCheckIn(userId, kr.id, { onlyIfChanged: true });
          await pushKeyResult(ctx, userId, await getKeyResult(userId, kr.id), objective);
          changed = true;
        }
      } catch (err) {
        console.error(err);
        await setKeyResultCounts(userId, kr.id, { countError: `Couldn't refresh the count: ${jiraErrorMessages(err)}` });
      }
    }
    if (changed && objective.jiraIssueKey) await pushObjective(ctx, userId, await getObjective(userId, objective.id));
  }
}

// An explicit check-in: apply the new value (metric current value /
// milestone done; a Jira query is re-counted instead), record it with the
// note, push the issue, and leave the check-in as a comment on it.
export async function checkInKeyResult(ctx, userId, id, { currentValue, done, note }) {
  const before = await getKeyResult(userId, id);
  if (!before) throw new Error("Key result not found");

  if (before.kind === "jira") {
    const counts = await countKeyResultQuery(ctx, before.jql);
    await setKeyResultCounts(userId, id, counts);
  } else {
    await applyCheckInValue(userId, id, { currentValue, done });
  }
  await recordCheckIn(userId, id, { note: note ?? "" });

  let syncError = await syncKeyResult(ctx, userId, id);
  const kr = await getKeyResult(userId, id);
  if (kr.jiraIssueKey) {
    const text = ["Check-in from Cockpit", progressLine(kr), note?.trim() ? `Note: ${note.trim()}` : null]
      .filter(Boolean)
      .join("\n");
    try {
      await addComment({ ...creds(ctx), issueKey: kr.jiraIssueKey, text });
    } catch (err) {
      console.error(err);
      syncError = syncError ?? `Check-in saved, but the Jira comment failed: ${err.message}`;
      await setKeyResultSyncState(userId, id, { syncError });
    }
  }
  return syncError;
}

// Deletes the Jira issues first, then the local rows regardless — a user
// without Jira's "Delete issues" permission can still delete their own OKR.
// Returns one warning per Jira issue that couldn't be deleted.
async function deleteJiraIssues(ctx, keys) {
  const warnings = [];
  for (const issueKey of keys) {
    try {
      await deleteIssue({ ...creds(ctx), issueKey });
    } catch (err) {
      console.error(err);
      warnings.push(`${issueKey} wasn't deleted in Jira: ${err.message}`);
    }
  }
  return warnings;
}

export async function deleteObjectiveEverywhere(ctx, userId, objectiveId) {
  const objective = await getObjective(userId, objectiveId);
  if (!objective) throw new Error("Objective not found");
  const keys = [...objective.keyResults.map((kr) => kr.jiraIssueKey), objective.jiraIssueKey].filter(Boolean);
  const warnings = await deleteJiraIssues(ctx, keys);
  await deleteObjective(userId, objectiveId);
  return warnings;
}

export async function deleteKeyResultEverywhere(ctx, userId, keyResultId) {
  const kr = await getKeyResult(userId, keyResultId);
  if (!kr) throw new Error("Key result not found");
  const warnings = await deleteJiraIssues(ctx, [kr.jiraIssueKey].filter(Boolean));
  await deleteKeyResult(userId, keyResultId);

  const objective = await getObjective(userId, kr.objectiveId);
  if (objective.jiraIssueKey) await pushObjective(ctx, userId, objective);
  return warnings;
}
