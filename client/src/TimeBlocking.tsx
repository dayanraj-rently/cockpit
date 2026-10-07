import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import type { AuthUser } from "./auth";
import { logout } from "./auth";
import { addDays, formatWeekRange, startOfWeek, toJiraStarted } from "./dateUtils";
import {
  fetchTimeBlocks,
  createTimeBlock,
  updateTimeBlock as updateTimeBlockApi,
  deleteTimeBlock as deleteTimeBlockApi,
} from "./timeBlocksClient";
import type { TimeBlock } from "./timeBlocksClient";
import { fetchCalendarEvents } from "./googleCalendarClient";
import type { CalendarEvent } from "./googleCalendarClient";
import { createWorklog as createWorklogApi } from "./timeLoggerClient";
import { BlockingCalendar } from "./BlockingCalendar";
import { WorklogEditor } from "./WorklogEditor";
import type { WorklogEditorState } from "./WorklogEditor";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";
import { Tour } from "./Tour";
import type { TourStep } from "./Tour";

const TIME_BLOCKING_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="time-blocking-grid"]',
    title: "Planning a block",
    body: "Click and drag to block out time for yourself. Nothing here reaches Jira unless you link it to an issue.",
    accent: "var(--chart-6)",
  },
  {
    selector: '[data-tour="time-blocking-meeting"]',
    title: "Meetings, dashed border",
    body: "If Google Calendar's connected in Settings, your real meetings show up here too — read-only, dashed so you can tell them apart. Click the + to log any block or meeting as a real Jira worklog.",
    accent: "var(--chart-6)",
  },
];

export function TimeBlocking({
  user,
  onLoggedOut,
  onOpenSettings,
}: {
  user: AuthUser;
  onLoggedOut: () => void;
  onOpenSettings: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [blocks, setBlocks] = useState<TimeBlock[] | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [worklogEditorState, setWorklogEditorState] = useState<WorklogEditorState | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setCalendarError(null);
    try {
      const start = toJiraStarted(weekStart);
      const end = toJiraStarted(addDays(weekStart, 7));
      const [blocksData, eventsResult] = await Promise.all([
        fetchTimeBlocks(start, end),
        // Google Calendar is optional — "not connected" shouldn't block or
        // scare the user; only a genuine fetch/parse failure surfaces.
        fetchCalendarEvents(start, end).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          if (!message.includes("Connect your Google Calendar")) {
            setCalendarError(message);
          }
          return { events: [] };
        }),
      ]);
      setBlocks(blocksData.blocks);
      setEvents(eventsResult.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  async function handleCreate(input: {
    issueKey?: string | null;
    title: string;
    notes: string;
    started: Date;
    timeSpentSeconds: number;
  }) {
    await createTimeBlock({
      issueKey: input.issueKey,
      title: input.title,
      notes: input.notes,
      started: toJiraStarted(input.started),
      timeSpentSeconds: input.timeSpentSeconds,
    });
    await load();
  }

  async function handleUpdate(
    block: TimeBlock,
    updates: { issueKey?: string | null; title: string; notes: string; started: Date; timeSpentSeconds: number },
  ) {
    await updateTimeBlockApi(block.id, {
      issueKey: updates.issueKey,
      title: updates.title,
      notes: updates.notes,
      started: toJiraStarted(updates.started),
      timeSpentSeconds: updates.timeSpentSeconds,
    });
    await load();
  }

  async function handleDelete(block: TimeBlock) {
    await deleteTimeBlockApi(block.id);
    await load();
  }

  function handleLogEventAsWorklog(event: CalendarEvent) {
    const started = new Date(event.start);
    const ended = new Date(event.end);
    setWorklogEditorState({
      mode: "create",
      day: started,
      started,
      timeSpentSeconds: Math.max((ended.getTime() - started.getTime()) / 1000, 60),
      initialComment: event.title,
    });
  }

  function handleLogBlockAsWorklog(block: TimeBlock) {
    const started = new Date(block.started);
    setWorklogEditorState({
      mode: "create",
      day: started,
      started,
      timeSpentSeconds: block.timeSpentSeconds,
      initialComment: block.notes || block.title,
      initialIssueKey: block.issueKey ?? undefined,
    });
  }

  async function handleCreateWorklog(input: {
    issueKey: string;
    started: Date;
    timeSpentSeconds: number;
    comment: string;
  }) {
    await createWorklogApi({
      issueKey: input.issueKey,
      started: toJiraStarted(input.started),
      timeSpentSeconds: input.timeSpentSeconds,
      comment: input.comment,
    });
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Time Blocking</span>
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

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Couldn't load your planned blocks: {error}</AlertDescription>
        </Alert>
      )}

      {calendarError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Couldn't load your Google Calendar: {calendarError}</AlertDescription>
        </Alert>
      )}

      <BlockingCalendar
        weekStart={weekStart}
        blocks={blocks ?? []}
        events={events}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onLogEventAsWorklog={handleLogEventAsWorklog}
        onLogBlockAsWorklog={handleLogBlockAsWorklog}
      />

      {worklogEditorState && (
        <WorklogEditor
          state={worklogEditorState}
          onClose={() => setWorklogEditorState(null)}
          onCreate={handleCreateWorklog}
          onUpdate={async () => {}}
          onDelete={async () => {}}
        />
      )}

      {tourOpen && <Tour steps={TIME_BLOCKING_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
