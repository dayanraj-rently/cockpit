export interface JiraSettings {
  baseUrl: string | null;
  email: string | null;
  hasToken: boolean;
  jql: string | null;
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchJiraSettings(): Promise<JiraSettings> {
  const res = await fetch("/api/settings/jira", { credentials: "include" });
  return parseJson(res);
}

export async function saveJiraSettings(input: {
  baseUrl: string;
  email: string;
  apiToken?: string;
  jql: string;
}): Promise<JiraSettings> {
  const res = await fetch("/api/settings/jira", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}
