import type { AuthUser } from "./auth";

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchInstallStatus(): Promise<{ needed: boolean }> {
  const res = await fetch("/api/install/status", { credentials: "include" });
  return parseJson(res);
}

export async function completeInstall(username: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  return parseJson(res);
}
