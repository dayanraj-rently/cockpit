const FIELDS = [
  "summary",
  "issuetype",
  "priority",
  "status",
  "duedate",
  "updated",
  "created",
  "project",
  "assignee",
  "reporter",
  "labels",
];

export async function fetchAllIssues({ baseUrl, email, apiToken, jql }) {
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const issues = [];
  let nextPageToken;

  do {
    const body = { jql, fields: FIELDS, maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira search failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    issues.push(...data.issues);
    nextPageToken = data.isLast ? undefined : data.nextPageToken;
  } while (nextPageToken);

  return issues;
}

function authHeaders(email, apiToken) {
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return { Authorization: `Basic ${auth}`, Accept: "application/json" };
}

export async function getIssueTransitions({ baseUrl, email, apiToken, issueKey }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
    headers: authHeaders(email, apiToken),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira transitions fetch failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.transitions.map((t) => ({ id: t.id, name: t.name, toStatus: t.to?.name }));
}

export async function transitionIssue({ baseUrl, email, apiToken, issueKey, transitionId }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
    method: "POST",
    headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
    body: JSON.stringify({ transition: { id: transitionId } }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira transition failed (${res.status}): ${text}`);
  }
}

// Searches the whole org's user directory (not just users already granted
// the "Assignable User" permission on this issue's project) so anyone can be
// picked. Jira's own permission scheme still governs whether the assignment
// itself succeeds; a user with no assignable access to the project will
// still be rejected by assignIssue().
export async function searchOrgUsers({ baseUrl, email, apiToken, query }) {
  const params = new URLSearchParams({ query, maxResults: "50" });

  const res = await fetch(`${baseUrl}/rest/api/3/user/search?${params.toString()}`, {
    headers: authHeaders(email, apiToken),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira user search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.map((u) => ({
    accountId: u.accountId,
    displayName: u.displayName,
    avatarUrl: u.avatarUrls?.["24x24"],
  }));
}

export async function assignIssue({ baseUrl, email, apiToken, issueKey, accountId }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/assignee`, {
    method: "PUT",
    headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira assignee update failed (${res.status}): ${text}`);
  }
}

export async function getMyself({ baseUrl, email, apiToken }) {
  const res = await fetch(`${baseUrl}/rest/api/3/myself`, {
    headers: authHeaders(email, apiToken),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira myself fetch failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { accountId: data.accountId };
}

// One paragraph per newline; Jira v3 worklog comments are Atlassian Document
// Format, not plain strings.
function textToAdf(text) {
  if (!text?.trim()) return undefined;
  return {
    type: "doc",
    version: 1,
    content: text
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      })),
  };
}

function adfToText(adf) {
  if (!adf?.content) return "";
  return adf.content
    .map((node) => (node.content ?? []).map((n) => n.text ?? "").join(""))
    .join("\n")
    .trim();
}

export async function getIssueWorklogs({ baseUrl, email, apiToken, issueKey }) {
  const worklogs = [];
  let startAt = 0;
  let total = Infinity;

  while (startAt < total) {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: "100" });
    const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog?${params.toString()}`, {
      headers: authHeaders(email, apiToken),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira worklog fetch failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    worklogs.push(
      ...data.worklogs.map((w) => ({
        id: w.id,
        authorAccountId: w.author?.accountId,
        started: w.started,
        timeSpentSeconds: w.timeSpentSeconds,
        comment: adfToText(w.comment),
      })),
    );
    total = data.total;
    startAt += data.worklogs.length;
    if (data.worklogs.length === 0) break;
  }

  return worklogs;
}

export async function addWorklog({ baseUrl, email, apiToken, issueKey, started, timeSpentSeconds, comment }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog?adjustEstimate=leave`, {
    method: "POST",
    headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
    body: JSON.stringify({ started, timeSpentSeconds, comment: textToAdf(comment) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira worklog create failed (${res.status}): ${text}`);
  }
}

export async function updateWorklog({
  baseUrl,
  email,
  apiToken,
  issueKey,
  worklogId,
  started,
  timeSpentSeconds,
  comment,
}) {
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${issueKey}/worklog/${worklogId}?adjustEstimate=leave`,
    {
      method: "PUT",
      headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
      body: JSON.stringify({ started, timeSpentSeconds, comment: textToAdf(comment) }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira worklog update failed (${res.status}): ${text}`);
  }
}

export async function deleteWorklog({ baseUrl, email, apiToken, issueKey, worklogId }) {
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${issueKey}/worklog/${worklogId}?adjustEstimate=leave`,
    {
      method: "DELETE",
      headers: authHeaders(email, apiToken),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira worklog delete failed (${res.status}): ${text}`);
  }
}

// Used for "which issue am I logging time against" (the Time Logger /
// Time Blocking issue autocomplete). Built on plain JQL (the same
// /search/jql endpoint fetchAllIssues uses) rather than Jira's dedicated
// /issue/picker typeahead: the picker's "quick search" index has been
// observed to go completely blind for some projects (returns zero results
// even for an exact, visible issue key) while a JQL search against the
// same credentials finds the issue fine — so JQL is the reliable choice
// here even though it means building the query ourselves.
export async function searchIssuePicker({ baseUrl, email, apiToken, query }) {
  const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const clauses = [`summary ~ "${escaped}*"`];

  const keyMatch = query.trim().match(/^([A-Za-z][A-Za-z0-9_]+)-(\d+)$/);
  const projectMatch = query.trim().match(/^([A-Za-z][A-Za-z0-9_]+)-?$/);
  if (keyMatch) clauses.push(`key = "${keyMatch[1].toUpperCase()}-${keyMatch[2]}"`);
  else if (projectMatch) clauses.push(`project = "${projectMatch[1].toUpperCase()}"`);

  const jql = `(${clauses.join(" OR ")}) ORDER BY updated DESC`;

  const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
    body: JSON.stringify({ jql, fields: ["summary"], maxResults: 20 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira issue search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data.issues ?? []).map((issue) => ({ key: issue.key, summary: issue.fields?.summary }));
}

// --- OKR sync (see okrSync.js) ---

export async function listProjects({ baseUrl, email, apiToken }) {
  const projects = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: "100", orderBy: "name" });
    const res = await fetch(`${baseUrl}/rest/api/3/project/search?${params.toString()}`, {
      headers: authHeaders(email, apiToken),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira project list failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    projects.push(...data.values.map((p) => ({ key: p.key, name: p.name })));
    startAt += data.values.length;
    isLast = data.isLast ?? true;
    if (data.values.length === 0) break;
  }

  return projects;
}

// Only the issue types the user can actually create in this project (the
// createmeta endpoint, not the site-wide /issuetype list).
export async function listProjectIssueTypes({ baseUrl, email, apiToken, projectKey }) {
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes?maxResults=100`,
    { headers: authHeaders(email, apiToken) },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira issue type list failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data.issueTypes ?? data.values ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    subtask: Boolean(t.subtask),
  }));
}

// `fields` is passed through as-is, except `description`, which is plain
// text here and converted to ADF.
function issueFieldsBody({ description, ...fields }) {
  return description === undefined ? fields : { ...fields, description: textToAdf(description) ?? null };
}

export async function createIssue({ baseUrl, email, apiToken, fields }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
    body: JSON.stringify({ fields: issueFieldsBody(fields) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira issue create failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { key: data.key };
}

export async function getIssueSyncState({ baseUrl, email, apiToken, issueKey }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}?fields=status,labels`, {
    headers: authHeaders(email, apiToken),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira issue fetch failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    statusCategory: data.fields?.status?.statusCategory?.key,
    labels: data.fields?.labels ?? [],
  };
}

export async function updateIssue({ baseUrl, email, apiToken, issueKey, fields }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}`, {
    method: "PUT",
    headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
    body: JSON.stringify({ fields: issueFieldsBody(fields) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira issue update failed (${res.status}): ${text}`);
  }
}

// A 404 counts as success: the issue is already gone, which is the goal.
export async function deleteIssue({ baseUrl, email, apiToken, issueKey }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}?deleteSubtasks=true`, {
    method: "DELETE",
    headers: authHeaders(email, apiToken),
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Jira issue delete failed (${res.status}): ${text}`);
  }
}

// Moves an issue across the done / not-done line using whatever transition
// the project's workflow offers into a matching status category. Leaves the
// issue alone if it's already on the right side (so a manual "In Progress"
// in Jira isn't reset to "To Do"). Returns false when the workflow has no
// such transition from the current status.
export async function transitionIssueToDone({ baseUrl, email, apiToken, issueKey, currentCategory, done }) {
  if ((currentCategory === "done") === done) return true;

  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
    headers: authHeaders(email, apiToken),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira transitions fetch failed (${res.status}): ${text}`);
  }

  const { transitions } = await res.json();
  const byCategory = (key) => transitions.find((t) => t.to?.statusCategory?.key === key);
  const target = done ? byCategory("done") : (byCategory("new") ?? byCategory("indeterminate"));
  if (!target) return false;

  await transitionIssue({ baseUrl, email, apiToken, issueKey, transitionId: target.id });
  return true;
}

// A trailing ORDER BY would make `(<jql>) AND ...` invalid, and ordering is
// irrelevant to a count anyway.
function stripOrderBy(jql) {
  return jql.replace(/\s+ORDER\s+BY\s+[\s\S]*$/i, "").trim();
}

async function approximateCount({ baseUrl, email, apiToken, jql }) {
  const res = await fetch(`${baseUrl}/rest/api/3/search/approximate-count`, {
    method: "POST",
    headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
    body: JSON.stringify({ jql }),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Jira issue count failed (${res.status}): ${text}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.count ?? 0;
}

// Progress source for Jira-query key results: how many issues match, and
// how many of those are in a Done-category status. Errors carry `.status`
// so callers can tell a bad query (400) from Jira being unreachable.
export async function countIssues({ baseUrl, email, apiToken, jql }) {
  const base = stripOrderBy(jql);
  const [total, done] = await Promise.all([
    approximateCount({ baseUrl, email, apiToken, jql: base }),
    approximateCount({ baseUrl, email, apiToken, jql: `(${base}) AND statusCategory = Done` }),
  ]);
  return { total, done };
}

export async function addComment({ baseUrl, email, apiToken, issueKey, text }) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    headers: { ...authHeaders(email, apiToken), "Content-Type": "application/json" },
    body: JSON.stringify({ body: textToAdf(text) }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira comment create failed (${res.status}): ${body}`);
  }
}
