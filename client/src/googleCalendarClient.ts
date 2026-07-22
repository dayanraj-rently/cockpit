export interface GoogleCalendarSettings {
  connected: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchGoogleCalendarSettings(): Promise<GoogleCalendarSettings> {
  const res = await fetch("/api/settings/google-calendar", { credentials: "include" });
  return parseJson(res);
}

export async function disconnectGoogleCalendar(): Promise<{ ok: true }> {
  const res = await fetch("/api/settings/google-calendar", { method: "DELETE", credentials: "include" });
  return parseJson(res);
}

export async function fetchCalendarEvents(
  startIso: string,
  endIso: string,
): Promise<{ events: CalendarEvent[] }> {
  const params = new URLSearchParams({ start: startIso, end: endIso });
  const res = await fetch(`/api/calendar-events?${params.toString()}`, { credentials: "include" });
  return parseJson(res);
}
