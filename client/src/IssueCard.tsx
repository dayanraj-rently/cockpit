import { useEffect, useRef, useState } from "react";
import { User, X } from "lucide-react";
import type { AssignableUser, Issue, Transition } from "./types";
import { priorityBadgeVariant } from "./priority";
import { statusDotClass } from "./status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
} from "@/components/ui/autocomplete";
import { cn } from "@/lib/utils";

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function StatusSelect({ issue, onStatusChanged }: { issue: Issue; onStatusChanged: () => void }) {
  const [transitions, setTransitions] = useState<Transition[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenChange(open: boolean) {
    if (!open || transitions !== null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${encodeURIComponent(issue.key)}/transitions`, {
        credentials: "include",
      });
      const data = (await res.json()) as { transitions: Transition[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setTransitions(data.transitions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(transitionId: string | null) {
    if (!transitionId) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${encodeURIComponent(issue.key)}/transitions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitionId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setTransitions(null);
      onStatusChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <span
      draggable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Select onOpenChange={handleOpenChange} onValueChange={handleSelect} disabled={updating}>
        <SelectTrigger
          size="sm"
          className="h-auto gap-1 rounded-md border-none bg-transparent px-1 py-0 text-[11.5px] font-normal text-muted-foreground hover:bg-muted"
        >
          {!updating && statusDotClass(issue.status) && (
            <span className={cn("size-1.5 rounded-full", statusDotClass(issue.status))} />
          )}
          {updating ? "Updating…" : issue.status}
        </SelectTrigger>
        <SelectContent align="start">
          {loading && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>}
          {error && <div className="px-2 py-1.5 text-xs text-destructive">{error}</div>}
          {transitions?.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No transitions available</div>
          )}
          {transitions?.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}

// Debounce before hitting Jira's assignable-users search as the user types,
// so every keystroke doesn't fire its own request.
const ASSIGNEE_SEARCH_DEBOUNCE_MS = 250;

function AssigneeSelect({ issue, onAssigneeChanged }: { issue: Issue; onAssigneeChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetches assignable users matching `query` (Jira does the filtering
  // server-side), debounced and cancellable so a fast typist never has a
  // stale response clobber a fresher one.
  useEffect(() => {
    if (!editing) return;
    if (!query.trim()) {
      setUsers([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ query });
        const res = await fetch(
          `/api/issues/${encodeURIComponent(issue.key)}/assignable-users?${params.toString()}`,
          { credentials: "include", signal: controller.signal },
        );
        const data = (await res.json()) as { users: AssignableUser[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        setUsers(data.users);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }, ASSIGNEE_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [editing, query, issue.key]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function stopEditing() {
    setEditing(false);
    setQuery("");
    setUsers([]);
    setError(null);
  }

  async function applyAssignee(accountId: string | null) {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${encodeURIComponent(issue.key)}/assignee`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      stopEditing();
      onAssigneeChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <span
      draggable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {!editing ? (
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-1 py-0 text-[11.5px] font-normal text-muted-foreground hover:bg-muted"
          onClick={() => setEditing(true)}
        >
          <User className="size-3" />
          {issue.assignee ?? "Unassigned"}
        </button>
      ) : (
        <Autocomplete
          items={users}
          mode="none"
          value={query}
          onValueChange={setQuery}
          open={editing}
          onOpenChange={(open) => {
            if (!open) stopEditing();
          }}
          itemToStringValue={(u: AssignableUser) => u.displayName}
          disabled={updating}
        >
          <AutocompleteInputGroup className="w-40">
            <AutocompleteInput ref={inputRef} placeholder="Assign to…" className="pr-6" />
            <button
              type="button"
              className="absolute right-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyAssignee(null)}
              title="Unassign"
            >
              <X className="size-3" />
            </button>
          </AutocompleteInputGroup>
          <AutocompleteContent>
            {loading && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>}
            {error && <div className="px-2 py-1.5 text-xs text-destructive">{error}</div>}
            {!loading && !error && users.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {query.trim() ? "No matches" : "Type to search…"}
              </div>
            )}
            {!loading &&
              users.map((u) => (
                <AutocompleteItem key={u.accountId} value={u} onClick={() => applyAssignee(u.accountId)}>
                  {u.displayName}
                </AutocompleteItem>
              ))}
          </AutocompleteContent>
        </Autocomplete>
      )}
    </span>
  );
}

export function IssueCard({
  issue,
  dragging,
  cardRef,
  onDragStart,
  onDragEnd,
  onIssueChanged,
}: {
  issue: Issue;
  dragging?: boolean;
  cardRef?: (el: HTMLAnchorElement | null) => void;
  onDragStart?: (e: React.DragEvent<HTMLAnchorElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLAnchorElement>) => void;
  onIssueChanged: () => void;
}) {
  return (
    <a
      ref={cardRef}
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      className="block cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <Card
        className={cn(
          "gap-2 px-3 py-2.5 shadow-none transition-colors hover:ring-2 hover:ring-ring/30",
          dragging && "opacity-40",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {issue.key}
          </span>
          <Badge variant={priorityBadgeVariant(issue.priority)}>{issue.priority}</Badge>
        </div>
        <p className="text-sm">{issue.summary}</p>
        <div className="flex flex-wrap items-center gap-2.5 text-[11.5px] text-muted-foreground">
          <AssigneeSelect issue={issue} onAssigneeChanged={onIssueChanged} />
          {issue.reporter && <span>reported by {issue.reporter}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-[11.5px] text-muted-foreground">
          <span>{issue.project}</span>
          <StatusSelect issue={issue} onStatusChanged={onIssueChanged} />
          <span>updated {relativeTime(issue.updated)}</span>
        </div>
        {issue.labels && issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {issue.labels.map((label) => (
              <Badge key={label} variant="label">
                {label}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </a>
  );
}
