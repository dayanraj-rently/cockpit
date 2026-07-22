export interface Note {
  id: string;
  title: string;
  contentHtml: string;
  createdAt: string;
  updatedAt: string;
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchNotes(): Promise<{ notes: Note[] }> {
  const res = await fetch("/api/notes", { credentials: "include" });
  return parseJson(res);
}

export async function createNote(input: { title: string; contentHtml: string }): Promise<{ ok: true; id: string }> {
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function updateNote(id: string, input: { title: string; contentHtml: string }): Promise<{ ok: true }> {
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function deleteNote(id: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson(res);
}
