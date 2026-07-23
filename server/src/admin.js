import { db } from "./db.js";
import { ROLES, createUser } from "./auth.js";

function toApiShape(row) {
  return {
    id: String(row.id),
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function listTenantUsers(tenantId) {
  const { rows } = await db.query(
    "SELECT id, username, role, created_at FROM users WHERE tenant_id = $1 ORDER BY id ASC",
    [tenantId],
  );
  return rows.map(toApiShape);
}

export async function addTenantUser(tenantId, username, password) {
  // Always a plain member — the tenant's admin already exists (whoever
  // created it via signup or the CLI). Promote via setUserRole afterward
  // if the new teammate should also be an admin.
  await createUser(username, password, tenantId, "member");
}

// The `AND tenant_id = $2` in both mutations below is the same
// ownership-safe guard used elsewhere (time_blocks, notes key mutations on
// `id AND user_id`) — here scoped to the tenant boundary instead, so an
// admin can never affect a user outside their own tenant even if they
// guess another tenant's user id.
export async function removeTenantUser(tenantId, targetUserId, requestingUserId) {
  if (String(targetUserId) === String(requestingUserId)) {
    throw new Error("Use Settings → Account to delete your own account");
  }
  const result = await db.query("DELETE FROM users WHERE id = $1 AND tenant_id = $2", [targetUserId, tenantId]);
  if (result.rowCount === 0) throw new Error("User not found");
}

export async function setUserRole(tenantId, targetUserId, role) {
  if (!ROLES.has(role)) throw new Error(`Invalid role: ${role}`);

  if (role === "member") {
    const { rows } = await db.query("SELECT role FROM users WHERE id = $1 AND tenant_id = $2", [
      targetUserId,
      tenantId,
    ]);
    const target = rows[0];
    if (!target) throw new Error("User not found");
    if (target.role === "admin") {
      const { rows: counts } = await db.query(
        "SELECT COUNT(*) AS count FROM users WHERE tenant_id = $1 AND role = 'admin' AND id != $2",
        [tenantId, targetUserId],
      );
      if (Number(counts[0].count) === 0) {
        throw new Error("Every organization needs at least one admin — promote someone else first");
      }
    }
  }

  const result = await db.query("UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3", [
    role,
    targetUserId,
    tenantId,
  ]);
  if (result.rowCount === 0) throw new Error("User not found");
}
