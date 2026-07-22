import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarClock, Flame, Trash2, Users } from "lucide-react";
import type { Issue, IssuesResponse, Quadrant } from "./types";
import type { QuadrantAccent } from "./quadrants";
import { QUADRANTS } from "./quadrants";
import { IssueCard } from "./IssueCard";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const QUADRANT_ICON: Record<Quadrant, typeof Flame> = {
  "do-first": Flame,
  schedule: CalendarClock,
  delegate: Users,
  eliminate: Trash2,
};

// A light touch only: the accent tints the icon and a thin top edge, nothing
// else about the quadrant card changes.
const ACCENT_CLASSES: Record<QuadrantAccent, { icon: string; border: string }> = {
  critical: { icon: "text-status-critical", border: "border-t-status-critical" },
  serious: { icon: "text-status-serious", border: "border-t-status-serious" },
  warning: { icon: "text-status-warning", border: "border-t-status-warning" },
  good: { icon: "text-status-good", border: "border-t-status-good" },
};

export function Dashboard({
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
  const [dragOverQuadrant, setDragOverQuadrant] = useState<Quadrant | null>(null);
  const [dropTarget, setDropTarget] = useState<{ quadrant: Quadrant; beforeKey: string | null } | null>(
    null,
  );
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());
  const columnRefs = useRef(new Map<Quadrant, HTMLDivElement>());

  // Native HTML5 drag-and-drop auto-scrolls the nearest scrollable ancestor
  // whenever the cursor nears its edge — a spec-level browser behavior, not
  // something this app renders. On a page taller than the viewport, that's
  // the whole page, and every quadrant panel rides along with it, which
  // reads as "the quadrant moved." Locking both root-scroll elements for the
  // duration of a drag removes anything for that behavior to act on; each
  // quadrant's own internal list scrolling is a separate, unaffected element.
  useEffect(() => {
    if (!draggedKey) return;
    const html = document.documentElement;
    const { body } = document;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [draggedKey]);

  async function load() {
    setLoading(true);
    setError(null);
    setNeedsSetup(false);
    try {
      const res = await fetch("/api/issues", { credentials: "include" });
      const data = (await res.json()) as IssuesResponse & {
        error?: string;
        needsSetup?: boolean;
      };
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

  const counts = useMemo(() => {
    const map: Record<Quadrant, number> = { "do-first": 0, schedule: 0, delegate: 0, eliminate: 0 };
    for (const issue of issues ?? []) {
      map[issue.quadrant]++;
    }
    return map;
  }, [issues]);

  const grouped = useMemo(() => {
    const map: Record<Quadrant, Issue[]> = {
      "do-first": [],
      schedule: [],
      delegate: [],
      eliminate: [],
    };
    for (const issue of issues ?? []) {
      map[issue.quadrant].push(issue);
    }
    return map;
  }, [issues]);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  // Places `key` into `quadrant`, immediately before `beforeKey` (or at the
  // end, if `beforeKey` is null), reordering the flat issues array to match,
  // then persists the resulting quadrant order.
  function reorderIssues(
    current: Issue[],
    key: string,
    quadrant: Quadrant,
    beforeKey: string | null,
  ): Issue[] {
    const dragged = current.find((i) => i.key === key);
    if (!dragged) return current;
    const rest = current.filter((i) => i.key !== key);
    const updatedDragged: Issue = { ...dragged, quadrant };

    const targetIndex = beforeKey === null ? -1 : rest.findIndex((i) => i.key === beforeKey);
    const insertAt = targetIndex === -1 ? rest.length : targetIndex;

    return [...rest.slice(0, insertAt), updatedDragged, ...rest.slice(insertAt)];
  }

  async function moveIssue(key: string, quadrant: Quadrant, beforeKey: string | null) {
    if (!issues) return;
    const previous = issues;
    const reordered = reorderIssues(issues, key, quadrant, beforeKey);
    setIssues(reordered);
    const issueKeys = reordered.filter((i) => i.quadrant === quadrant).map((i) => i.key);
    try {
      const res = await fetch(`/api/quadrants/${quadrant}/order`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKeys }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
    } catch (err) {
      setIssues(previous);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Finds the peer (excluding the dragged card) whose card the cursor is
  // currently above the vertical midpoint of, using live measured
  // positions rather than which DOM element the event happened to bubble
  // through — a gap between cards, or the thin drop-indicator bar, would
  // otherwise register as "no card here" and misreport the drop as
  // "append to the end."
  function computeBeforeKey(quadrant: Quadrant, clientY: number): string | null {
    const peers = grouped[quadrant].filter((p) => p.key !== draggedKey);
    for (const peer of peers) {
      const rect = cardRefs.current.get(peer.key)?.getBoundingClientRect();
      if (rect && clientY < rect.top + rect.height / 2) {
        return peer.key;
      }
    }
    return null;
  }

  // Pixel offset (within the scrollable column) for the drop-indicator line.
  // Computed from measured card positions rather than rendered as a real
  // flex sibling — a real sibling shifts every card after it every time the
  // target changes mid-drag, which cascades into the whole column visibly
  // reflowing instead of just the dragged card moving.
  function indicatorTop(quadrant: Quadrant): number | null {
    if (dropTarget?.quadrant !== quadrant) return null;
    const container = columnRefs.current.get(quadrant);
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();

    if (dropTarget.beforeKey !== null) {
      const rect = cardRefs.current.get(dropTarget.beforeKey)?.getBoundingClientRect();
      if (!rect) return null;
      return rect.top - containerRect.top + container.scrollTop - 6;
    }

    const peers = grouped[quadrant].filter((p) => p.key !== draggedKey);
    const last = peers[peers.length - 1];
    if (!last) return null;
    const rect = cardRefs.current.get(last.key)?.getBoundingClientRect();
    if (!rect) return null;
    return rect.bottom - containerRect.top + container.scrollTop + 2;
  }

  function finalizeDrop(quadrant: Quadrant) {
    const key = draggedKey;
    const beforeKey = dropTarget?.quadrant === quadrant ? dropTarget.beforeKey : null;
    setDropTarget(null);
    setDraggedKey(null);
    setDragOverQuadrant(null);
    if (!key) return;
    moveIssue(key, quadrant, beforeKey);
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Eisenhower Matrix</span>
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
          <AlertDescription>Couldn't load Jira issues: {error}</AlertDescription>
        </Alert>
      )}

      {!needsSetup && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {QUADRANTS.map((q) => {
            const Icon = QUADRANT_ICON[q.id];
            const accent = ACCENT_CLASSES[q.accent];
            const indicatorY = indicatorTop(q.id);
            return (
              <Card
                key={q.id}
                className={cn(
                  "h-[560px] gap-3 border-t-2 px-4 py-4 shadow-none transition-colors",
                  accent.border,
                  dragOverQuadrant === q.id && "ring-2 ring-ring/50",
                )}
              >
                <div className="flex shrink-0 items-baseline gap-2">
                  <Icon className={cn("size-4 self-center", accent.icon)} />
                  <h2 className="text-base font-medium">{q.title}</h2>
                  <span className="flex-1 text-xs text-muted-foreground">{q.subtitle}</span>
                  <Badge variant="outline">{counts[q.id]}</Badge>
                </div>
                <div
                  ref={(el) => {
                    if (el) columnRefs.current.set(q.id, el);
                    else columnRefs.current.delete(q.id);
                  }}
                  className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1"
                  onDragOver={(e) => {
                    if (!draggedKey) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverQuadrant(q.id);
                    setDropTarget({ quadrant: q.id, beforeKey: computeBeforeKey(q.id, e.clientY) });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    finalizeDrop(q.id);
                  }}
                >
                  {grouped[q.id].length === 0 && !loading && (
                    <p className="text-sm text-muted-foreground">Nothing here</p>
                  )}
                  {grouped[q.id].map((issue) => (
                    <IssueCard
                      key={issue.key}
                      issue={issue}
                      dragging={draggedKey === issue.key}
                      cardRef={(el) => {
                        if (el) cardRefs.current.set(issue.key, el);
                        else cardRefs.current.delete(issue.key);
                      }}
                      onDragStart={(e) => {
                        // Pointing setDragImage at the real card (a descendant
                        // of the scrollable ticket list) has been observed to
                        // make the browser snapshot the whole scrollable
                        // container — scrollbar and all — instead of just the
                        // card. A standalone element with no scrolling
                        // ancestor sidesteps that entirely.
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
                        setDragOverQuadrant(null);
                        setDropTarget(null);
                      }}
                      onIssueChanged={load}
                    />
                  ))}
                  {indicatorY !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-1 h-1 rounded-full bg-primary"
                      style={{ top: indicatorY }}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
