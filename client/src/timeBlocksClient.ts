export interface TimeBlock {
  id: string;
  issueKey?: string | null;
  title: string;
  notes?: string | null;
  started: string;
  timeSpentSeconds: number;
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchTimeBlocks(startIso: string, endIso: string): Promise<{ blocks: TimeBlock[] }> {
  const params = new URLSearchParams({ start: startIso, end: endIso });
  const res = await fetch(`/api/time-blocks?${params.toString()}`, { credentials: "include" });
  return parseJson(res);
}

export async function createTimeBlock(input: {
  issueKey?: string | null;
  title: string;
  notes?: string;
  started: string;
  timeSpentSeconds: number;
}): Promise<{ ok: true; id: string }> {
  const res = await fetch("/api/time-blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function updateTimeBlock(
  id: string,
  input: { issueKey?: string | null; title: string; notes?: string; started: string; timeSpentSeconds: number },
): Promise<{ ok: true }> {
  const res = await fetch(`/api/time-blocks/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function deleteTimeBlock(id: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/time-blocks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson(res);
}
