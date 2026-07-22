export interface Worklog {
  id: string;
  issueKey: string;
  issueSummary?: string;
  issueType?: string;
  issueTypeIconUrl?: string;
  priority?: string;
  priorityIconUrl?: string;
  status?: string;
  project?: string;
  url: string;
  started: string;
  timeSpentSeconds: number;
  comment?: string;
}

export interface IssueSearchResult {
  key: string;
  summary?: string;
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchWorklogs(startIso: string, endIso: string): Promise<{ worklogs: Worklog[] }> {
  const params = new URLSearchParams({ start: startIso, end: endIso });
  const res = await fetch(`/api/worklogs?${params.toString()}`, { credentials: "include" });
  return parseJson(res);
}

export async function createWorklog(input: {
  issueKey: string;
  started: string;
  timeSpentSeconds: number;
  comment?: string;
}): Promise<{ ok: true }> {
  const res = await fetch("/api/worklogs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function updateWorklog(
  issueKey: string,
  worklogId: string,
  input: { started: string; timeSpentSeconds: number; comment?: string },
): Promise<{ ok: true }> {
  const res = await fetch(`/api/worklogs/${encodeURIComponent(issueKey)}/${encodeURIComponent(worklogId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function deleteWorklog(issueKey: string, worklogId: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/worklogs/${encodeURIComponent(issueKey)}/${encodeURIComponent(worklogId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson(res);
}

export async function searchIssues(query: string): Promise<{ issues: IssueSearchResult[] }> {
  const params = new URLSearchParams({ query });
  const res = await fetch(`/api/issues/search?${params.toString()}`, { credentials: "include" });
  return parseJson(res);
}
