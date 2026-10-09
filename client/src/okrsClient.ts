export type KeyResultKind = "metric" | "milestone" | "jira";

export interface HistoryPoint {
  progress: number;
  at: string;
}

export interface CheckIn {
  id: string;
  value: number | null;
  progress: number;
  note: string;
  createdAt: string;
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  kind: KeyResultKind;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string;
  done: boolean;
  jql: string;
  jiraTotal: number | null;
  jiraDone: number | null;
  countError: string | null;
  jiraIssueKey: string | null;
  syncError: string | null;
  progress: number;
  // Oldest first, up to the last 30 check-ins — for the sparkline.
  history: HistoryPoint[];
}

export interface Objective {
  id: string;
  period: string;
  title: string;
  description: string;
  jiraIssueKey: string | null;
  syncError: string | null;
  keyResults: KeyResult[];
  progress: number;
}

export interface OkrsResponse {
  objectives: Objective[];
  jiraBaseUrl: string;
  projectKey: string;
}

export interface OkrSettings {
  projectKey: string | null;
  objectiveIssueTypeId: string | null;
  keyResultIssueTypeId: string | null;
}

export interface JiraProject {
  key: string;
  name: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

export interface ObjectiveInput {
  period: string;
  title: string;
  description: string;
}

export interface KeyResultInput {
  title: string;
  kind: KeyResultKind;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string;
  done: boolean;
  jql: string;
}

// Thrown when the Jira connection or OKR project isn't configured yet, so
// the page can show a "go to Settings" prompt instead of a generic error.
export class OkrSetupError extends Error {}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.needsSetup) throw new OkrSetupError(data.error);
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

function send(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(parseJson);
}

export async function fetchOkrs(period: string): Promise<OkrsResponse> {
  const res = await fetch(`/api/okrs?period=${encodeURIComponent(period)}`, { credentials: "include" });
  return parseJson(res);
}

export function createObjective(input: ObjectiveInput): Promise<{ ok: true; id: string; syncError: string | null }> {
  return send("/api/objectives", "POST", input);
}

export function updateObjective(id: string, input: ObjectiveInput): Promise<{ ok: true; syncError: string | null }> {
  return send(`/api/objectives/${encodeURIComponent(id)}`, "PUT", input);
}

export function syncObjective(id: string): Promise<{ ok: true; syncError: string | null }> {
  return send(`/api/objectives/${encodeURIComponent(id)}/sync`, "POST");
}

export function deleteObjective(id: string): Promise<{ ok: true; warnings: string[] }> {
  return send(`/api/objectives/${encodeURIComponent(id)}`, "DELETE");
}

export function createKeyResult(
  objectiveId: string,
  input: KeyResultInput,
): Promise<{ ok: true; id: string; syncError: string | null }> {
  return send(`/api/objectives/${encodeURIComponent(objectiveId)}/key-results`, "POST", input);
}

export function updateKeyResult(id: string, input: KeyResultInput): Promise<{ ok: true; syncError: string | null }> {
  return send(`/api/key-results/${encodeURIComponent(id)}`, "PUT", input);
}

export function deleteKeyResult(id: string): Promise<{ ok: true; warnings: string[] }> {
  return send(`/api/key-results/${encodeURIComponent(id)}`, "DELETE");
}

export function refreshOkrs(period: string): Promise<{ ok: true }> {
  return send(`/api/okrs/refresh?period=${encodeURIComponent(period)}`, "POST");
}

export async function fetchCheckIns(keyResultId: string): Promise<{ checkIns: CheckIn[] }> {
  const res = await fetch(`/api/key-results/${encodeURIComponent(keyResultId)}/check-ins`, {
    credentials: "include",
  });
  return parseJson(res);
}

export function checkInKeyResult(
  keyResultId: string,
  input: { currentValue?: number; done?: boolean; note: string },
): Promise<{ ok: true; syncError: string | null }> {
  return send(`/api/key-results/${encodeURIComponent(keyResultId)}/check-ins`, "POST", input);
}

export function jiraSearchUrl(baseUrl: string, jql: string): string {
  return `${baseUrl}/issues/?jql=${encodeURIComponent(jql)}`;
}

export async function fetchOkrSettings(): Promise<OkrSettings> {
  const res = await fetch("/api/settings/okr", { credentials: "include" });
  return parseJson(res);
}

export function saveOkrSettings(input: {
  projectKey: string;
  objectiveIssueTypeId: string;
  keyResultIssueTypeId: string;
}): Promise<OkrSettings> {
  return send("/api/settings/okr", "PUT", input);
}

export async function fetchJiraProjects(): Promise<{ projects: JiraProject[] }> {
  const res = await fetch("/api/jira/projects", { credentials: "include" });
  return parseJson(res);
}

export async function fetchProjectIssueTypes(projectKey: string): Promise<{ issueTypes: JiraIssueType[] }> {
  const res = await fetch(`/api/jira/projects/${encodeURIComponent(projectKey)}/issue-types`, {
    credentials: "include",
  });
  return parseJson(res);
}

// Periods are calendar quarters, stored as "2026-Q4".
export function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
}

export function shiftPeriod(period: string, delta: number): string {
  const [year, quarter] = period.split("-Q").map(Number);
  const index = year * 4 + (quarter - 1) + delta;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

export function formatPeriod(period: string): string {
  const [year, quarter] = period.split("-");
  return `${quarter} ${year}`;
}
