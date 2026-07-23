import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import { fetchTenantUsers, addTenantUser, removeTenantUser, setTenantUserRole } from "./adminClient";
import type { TenantUser } from "./adminClient";
import { formatDateTime } from "./dateUtils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";

const MIN_PASSWORD_LENGTH = 8;

function AddUserModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("Username is required");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      await addTenantUser(username.trim(), password);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm gap-3 px-4 py-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium">Add a user</div>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-username">Username</Label>
            <Input
              id="new-user-username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-password">Password</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-confirm-password">Confirm password</Label>
            <Input
              id="new-user-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add user"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function Admin({
  user,
  onLoggedOut,
  onOpenSettings,
}: {
  user: AuthUser;
  onLoggedOut: () => void;
  onOpenSettings: () => void;
}) {
  const [users, setUsers] = useState<TenantUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await fetchTenantUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  async function handleRemove(target: TenantUser) {
    setBusyId(target.id);
    setError(null);
    try {
      await removeTenantUser(target.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleRole(target: TenantUser) {
    setBusyId(target.id);
    setError(null);
    try {
      await setTenantUserRole(target.id, target.role === "admin" ? "member" : "admin");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Admin</span>
        </h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onOpenSettings}>
            Settings
          </Button>
          <ThemeToggle />
          <span className="text-sm text-muted-foreground">{user.username}</span>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="max-w-[720px] gap-0 p-0 shadow-none">
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-medium">
            {users?.length ?? 0} user{users?.length === 1 ? "" : "s"}
          </span>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="size-3.5" />
            Add user
          </Button>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => {
              const isSelf = u.username === user.username;
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2 align-middle">{u.username}</td>
                  <td className="px-3 py-2 align-middle">
                    <Badge variant={u.role === "admin" ? "default" : "outline"}>{u.role}</Badge>
                  </td>
                  <td className="px-3 py-2 align-middle whitespace-nowrap text-muted-foreground">
                    {formatDateTime(u.createdAt)}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    {isSelf ? (
                      <span className="text-xs text-muted-foreground">
                        Manage your own account from Settings → Account
                      </span>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleToggleRole(u)}
                        >
                          {u.role === "admin" ? "Remove admin" : "Make admin"}
                        </Button>
                        <Button variant="destructive" size="sm" disabled={busy} onClick={() => handleRemove(u)}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users?.length === 0 && <p className="p-3 text-sm text-muted-foreground">No users yet.</p>}
      </Card>

      {modalOpen && (
        <AddUserModal
          onClose={() => setModalOpen(false)}
          onAdded={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
