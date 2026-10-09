export interface StickyNote {
  id: string;
  content: string;
  /** Slot 0–5 into the --chart-1..6 palette. */
  color: number;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

export type StickyNoteInput = Pick<StickyNote, "content" | "color" | "x" | "y">;

export const STICKY_COLOR_COUNT = 6;

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchStickyNotes(): Promise<{ stickyNotes: StickyNote[] }> {
  const res = await fetch("/api/sticky-notes", { credentials: "include" });
  return parseJson(res);
}

export async function createStickyNote(input: StickyNoteInput): Promise<{ ok: true; id: string }> {
  const res = await fetch("/api/sticky-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function updateStickyNote(id: string, input: StickyNoteInput): Promise<{ ok: true }> {
  const res = await fetch(`/api/sticky-notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function deleteStickyNote(id: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/sticky-notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson(res);
}
