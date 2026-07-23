export interface TenantUser {
  id: string;
  username: string;
  role: "admin" | "member";
  createdAt: string;
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchTenantUsers(): Promise<{ users: TenantUser[] }> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  return parseJson(res);
}

export async function addTenantUser(username: string, password: string): Promise<{ ok: true }> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  return parseJson(res);
}

export async function removeTenantUser(id: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson(res);
}

export async function setTenantUserRole(id: string, role: "admin" | "member"): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ role }),
  });
  return parseJson(res);
}
