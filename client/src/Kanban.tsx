import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, HelpCircle } from "lucide-react";
import type { Issue, IssuesResponse, Transition } from "./types";
import { IssueCard } from "./IssueCard";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import { statusDotClass } from "./status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";
import { Tour } from "./Tour";
import type { TourStep } from "./Tour";
import { cn } from "@/lib/utils";

const KANBAN_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="kanban-columns"]',
    title: "The columns",
    body: "One per Jira status, left to right in workflow order.",
    accent: "var(--chart-2)",
  },
  {
    selector: '[data-tour="kanban-card"]',
    title: "Dragging a card",
    body: "Drag it to a new column and it really transitions the ticket in Jira — not just a visual reorder.",
    accent: "var(--chart-2)",
  },
];

// Jira's three fixed status categories, in the order a workflow naturally
// flows through. Anything without a recognized category (shouldn't happen
// in practice) sorts after all three.
const CATEGORY_ORDER: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };

function columnRank(statusCategory: string | undefined): number {
  return statusCategory !== undefined && statusCategory in CATEGORY_ORDER
    ? CATEGORY_ORDER[statusCategory]
    : 3;
}

export function Kanban({
  user,
  onLoggedOut,
  onOpenSettings,
}: {
  user: AuthUser;
  onLoggedOut: () => void;
  onOpenSettings: () => void;
}) {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setNeedsSetup(false);
    try {
      const res = await fetch("/api/issues", { credentials: "include" });
      const data = (await res.json()) as IssuesResponse & { error?: string; needsSetup?: boolean };
      if (!res.ok) {
        if (data.needsSetup) {
          setNeedsSetup(true);
        } else {
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }
        return;
      }
      setIssues(data.issues);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(() => {
    const byStatus = new Map<string, { statusCategory?: string; issues: Issue[] }>();
    for (const issue of issues ?? []) {
      const status = issue.status ?? "No status";
      const column = byStatus.get(status);
      if (column) {
        column.issues.push(issue);
      } else {
        byStatus.set(status, { statusCategory: issue.statusCategory, issues: [issue] });
      }
    }
    return Array.from(byStatus.entries())
      .map(([status, { statusCategory, issues: columnIssues }]) => ({ status, statusCategory, issues: columnIssues }))
      .sort((a, b) => {
        const rankDiff = columnRank(a.statusCategory) - columnRank(b.statusCategory);
        if (rankDiff !== 0) return rankDiff;
        return a.status.localeCompare(b.status);
      });
  }, [issues]);

  // First card in reading order (leftmost non-empty column) — where the
  // tour anchors its drag-to-transition step, since which card that
  // actually is depends entirely on live Jira data.
  const firstCardKey = useMemo(() => columns.map((c) => c.issues[0]?.key).find(Boolean), [columns]);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  async function handleDrop(targetStatus: string) {
    setDragOverStatus(null);
    const key = draggedKey;
    setDraggedKey(null);
    if (!key || !issues) return;

    const issue = issues.find((i) => i.key === key);
    if (!issue || issue.status === targetStatus) return;

    setError(null);
    try {
      const transitionsRes = await fetch(`/api/issues/${encodeURIComponent(key)}/transitions`, {
        credentials: "include",
      });
      const transitionsData = (await transitionsRes.json()) as { transitions: Transition[]; error?: string };
      if (!transitionsRes.ok) {
        throw new Error(transitionsData.error ?? `Request failed (${transitionsRes.status})`);
      }

      const match = transitionsData.transitions.find((t) => t.toStatus === targetStatus);
      if (!match) {
        throw new Error(`${key} has no workflow transition from "${issue.status}" to "${targetStatus}".`);
      }

      const transitionRes = await fetch(`/api/issues/${encodeURIComponent(key)}/transitions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitionId: match.id }),
      });
      if (!transitionRes.ok) {
        const data = (await transitionRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${transitionRes.status})`);
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
          <span>Kanban Board</span>
        </h1>
        <div className="flex items-center gap-3">
          {fetchedAt && (
            <span className="text-xs text-muted-foreground">
              synced {new Date(fetchedAt).toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" onClick={onOpenSettings}>
            Settings
          </Button>
          <Button variant="ghost" size="icon" title="Take a tour" onClick={() => setTourOpen(true)}>
            <HelpCircle />
          </Button>
          <ThemeToggle />
          <span className="text-sm text-muted-foreground">{user.username}</span>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>

      {needsSetup && (
        <Card className="mb-4 flex-row flex-wrap items-center justify-between gap-3 px-4 py-3.5 shadow-none">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-muted-foreground" />
            <p className="text-sm">You haven't connected a Jira account yet.</p>
          </div>
          <Button variant="outline" onClick={onOpenSettings}>
            Configure Jira connection
          </Button>
        </Card>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!needsSetup && (
        <div className="flex gap-4 overflow-x-auto pb-2" data-tour="kanban-columns">
          {columns.map((col) => (
            <Card
              key={col.status}
              className={cn(
                "flex h-[calc(100vh-180px)] w-80 shrink-0 flex-col gap-3 px-4 py-4 shadow-none transition-colors",
                dragOverStatus === col.status && "ring-2 ring-ring/50",
              )}
            >
              <div className="flex shrink-0 items-center gap-2">
                {statusDotClass(col.status) && (
                  <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(col.status))} />
                )}
                <h2 className="truncate text-base font-medium">{col.status}</h2>
                <span className="flex-1" />
                <Badge variant="outline">{col.issues.length}</Badge>
              </div>
              <div
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1"
                onDragOver={(e) => {
                  if (!draggedKey) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverStatus(col.status);
                }}
                onDragLeave={() => {
                  setDragOverStatus((current) => (current === col.status ? null : current));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(col.status);
                }}
              >
                {col.issues.length === 0 && !loading && (
                  <p className="text-sm text-muted-foreground">Nothing here</p>
                )}
                {col.issues.map((issue) => (
                  <IssueCard
                    key={issue.key}
                    issue={issue}
                    tourId={issue.key === firstCardKey ? "kanban-card" : undefined}
                    dragging={draggedKey === issue.key}
                    onDragStart={(e) => {
                      // Pointing setDragImage at the real card (a descendant
                      // of the scrollable column) has been observed to make
                      // the browser snapshot the whole scrollable container
                      // — scrollbar and all — instead of just the card. A
                      // standalone element with no scrolling ancestor
                      // sidesteps that entirely.
                      const preview = document.createElement("div");
                      preview.textContent = `${issue.key} — ${issue.summary}`;
                      preview.style.cssText =
                        "position:fixed;top:-1000px;left:-1000px;max-width:280px;padding:6px 10px;background:#fff;color:#0b0b0b;border:1px solid rgba(11,11,11,0.15);border-radius:8px;font-size:12px;font-family:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(0,0,0,0.15);";
                      document.body.appendChild(preview);
                      e.dataTransfer.setDragImage(preview, 12, 12);
                      setTimeout(() => preview.remove(), 0);

                      e.dataTransfer.setData("text/plain", issue.key);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedKey(issue.key);
                    }}
                    onDragEnd={() => {
                      setDraggedKey(null);
                      setDragOverStatus(null);
                    }}
                    onIssueChanged={load}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tourOpen && <Tour steps={KANBAN_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
