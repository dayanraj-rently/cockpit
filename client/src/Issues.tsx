import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowUpDown, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import type { Issue, IssuesResponse } from "./types";
import { priorityBadgeVariant } from "./priority";
import { statusDotClass } from "./status";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import { formatDateTime } from "./dateUtils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";
import { Tour } from "./Tour";
import type { TourStep } from "./Tour";
import { cn } from "@/lib/utils";

const ISSUES_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="issues-headers"]',
    title: "Column headers",
    body: "Click any header to sort by it. Click again to reverse the order.",
    accent: "var(--chart-5)",
  },
  {
    selector: '[data-tour="issues-key"]',
    title: "Issue key",
    body: "Click the key to open that ticket directly in Jira.",
    accent: "var(--chart-5)",
  },
];

type SortColumn =
  | "key"
  | "summary"
  | "issueType"
  | "priority"
  | "status"
  | "assignee"
  | "labels"
  | "created"
  | "updated";
type SortDirection = "asc" | "desc";

// Priority/status don't sort sensibly alphabetically ("Highest" < "Low"
// would put Highest first) — rank by actual severity / workflow order
// instead, same category order the Kanban board uses for statuses.
const PRIORITY_RANK: Record<string, number> = { "Code Red": 0, Highest: 1, High: 2, Medium: 3, Low: 4, Lowest: 5 };
const STATUS_CATEGORY_RANK: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };

function compareIssues(a: Issue, b: Issue, column: SortColumn): number {
  switch (column) {
    case "key":
      return a.key.localeCompare(b.key);
    case "summary":
      return a.summary.localeCompare(b.summary);
    case "issueType":
      return (a.issueType ?? "").localeCompare(b.issueType ?? "");
    case "priority":
      return (
        (a.priority ? (PRIORITY_RANK[a.priority] ?? 99) : 99) -
        (b.priority ? (PRIORITY_RANK[b.priority] ?? 99) : 99)
      );
    case "status": {
      const rankA = STATUS_CATEGORY_RANK[a.statusCategory ?? ""] ?? 3;
      const rankB = STATUS_CATEGORY_RANK[b.statusCategory ?? ""] ?? 3;
      return rankA !== rankB ? rankA - rankB : (a.status ?? "").localeCompare(b.status ?? "");
    }
    case "assignee":
      return (a.assignee ?? "").localeCompare(b.assignee ?? "");
    case "labels":
      return (a.labels ?? []).join(", ").localeCompare((b.labels ?? []).join(", "));
    case "created":
      return new Date(a.created ?? 0).getTime() - new Date(b.created ?? 0).getTime();
    case "updated":
      return new Date(a.updated ?? 0).getTime() - new Date(b.updated ?? 0).getTime();
    default:
      return 0;
  }
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn | null;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
}) {
  const active = activeColumn === column;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

export function Issues({
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
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [tourOpen, setTourOpen] = useState(false);

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const sortedIssues = useMemo(() => {
    if (!issues || !sortColumn) return issues ?? [];
    const sorted = [...issues].sort((a, b) => compareIssues(a, b, sortColumn));
    return sortDirection === "asc" ? sorted : sorted.reverse();
  }, [issues, sortColumn, sortDirection]);

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

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Issues</span>
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
          <AlertDescription>Couldn't load issues: {error}</AlertDescription>
        </Alert>
      )}

      {!needsSetup && (
        <Card className="shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground" data-tour="issues-headers">
                  <SortableHeader label="Key" column="key" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Summary" column="summary" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Type" column="issueType" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Priority" column="priority" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Status" column="status" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Assignee" column="assignee" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Labels" column="labels" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Created" column="created" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Updated" column="updated" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedIssues.map((issue, idx) => (
                  <tr key={issue.key} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                        data-tour={idx === 0 ? "issues-key" : undefined}
                      >
                        {issue.key}
                      </a>
                    </td>
                    <td className="px-3 py-2 align-top">{issue.summary}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                      {issue.issueType}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <Badge variant={priorityBadgeVariant(issue.priority)}>{issue.priority}</Badge>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {statusDotClass(issue.status) && (
                          <span className={cn("size-1.5 rounded-full", statusDotClass(issue.status))} />
                        )}
                        {issue.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                      {issue.assignee ?? "Unassigned"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {issue.labels && issue.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {issue.labels.map((label) => (
                            <Badge key={label} variant="label">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                      {formatDateTime(issue.created)}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                      {formatDateTime(issue.updated)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {issues && sortedIssues.length === 0 && !loading && (
              <p className="p-4 text-sm text-muted-foreground">No issues match your JQL query.</p>
            )}
          </div>
        </Card>
      )}

      {tourOpen && <Tour steps={ISSUES_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
