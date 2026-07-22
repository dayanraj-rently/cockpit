import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import type { AuthUser } from "./auth";
import { logout } from "./auth";
import { addDays, formatWeekRange, startOfWeek, toJiraStarted } from "./dateUtils";
import {
  fetchWorklogs,
  createWorklog,
  updateWorklog as updateWorklogApi,
  deleteWorklog as deleteWorklogApi,
} from "./timeLoggerClient";
import type { Worklog } from "./timeLoggerClient";
import { WeekCalendar } from "./WeekCalendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";

export function TimeLogger({
  user,
  onLoggedOut,
  onOpenSettings,
}: {
  user: AuthUser;
  onLoggedOut: () => void;
  onOpenSettings: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [worklogs, setWorklogs] = useState<Worklog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setNeedsSetup(false);
    try {
      const start = toJiraStarted(weekStart);
      const end = toJiraStarted(addDays(weekStart, 7));
      const data = await fetchWorklogs(start, end);
      setWorklogs(data.worklogs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Configure your Jira connection")) {
        setNeedsSetup(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Refetch whenever the visible week changes; `load` itself is stable
    // enough in spirit (same shape every render) that including it would
    // just re-run this effect on every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  async function handleCreate(input: {
    issueKey: string;
    started: Date;
    timeSpentSeconds: number;
    comment: string;
  }) {
    await createWorklog({
      issueKey: input.issueKey,
      started: toJiraStarted(input.started),
      timeSpentSeconds: input.timeSpentSeconds,
      comment: input.comment,
    });
    await load();
  }

  async function handleUpdate(
    worklog: Worklog,
    updates: { started: Date; timeSpentSeconds: number; comment?: string },
  ) {
    await updateWorklogApi(worklog.issueKey, worklog.id, {
      started: toJiraStarted(updates.started),
      timeSpentSeconds: updates.timeSpentSeconds,
      comment: updates.comment ?? worklog.comment ?? "",
    });
    await load();
  }

  async function handleDelete(worklog: Worklog) {
    await deleteWorklogApi(worklog.issueKey, worklog.id);
    await load();
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Time Logger</span>
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              aria-label="Previous week"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium tabular-nums">
              {formatWeekRange(weekStart)}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              aria-label="Next week"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Today
          </Button>
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
          <AlertDescription>Couldn't load worklogs: {error}</AlertDescription>
        </Alert>
      )}

      {!needsSetup && (
        <WeekCalendar
          weekStart={weekStart}
          worklogs={worklogs ?? []}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
