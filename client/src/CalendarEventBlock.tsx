import { CalendarDays, Plus } from "lucide-react";
import type { CalendarEvent } from "./googleCalendarClient";
import { formatTimeRange } from "./dateUtils";
import { PX_PER_HOUR, VISIBLE_START_HOUR, MIN_BLOCK_HEIGHT_PX } from "./calendarLayout";

function gridStartOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), VISIBLE_START_HOUR, 0, 0, 0);
}

function topForDate(date: Date, day: Date): number {
  const minutes = (date.getTime() - gridStartOfDay(day).getTime()) / 60000;
  return (minutes / 60) * PX_PER_HOUR;
}

// Read-only by design (no pointer handlers) — a dashed neutral outline
// visually sets these apart from both WorklogBlock's solid fill and
// PlannedBlock's tinted left-border, so "synced from Google" reads as its
// own thing at a glance.
export function CalendarEventBlock({
  event,
  day,
  onLogAsWorklog,
}: {
  event: CalendarEvent;
  day: Date;
  onLogAsWorklog: (event: CalendarEvent) => void;
}) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const top = topForDate(start, day);
  const height = Math.max(((end.getTime() - start.getTime()) / 3600000) * PX_PER_HOUR, MIN_BLOCK_HEIGHT_PX);

  return (
    <div
      className="absolute inset-x-0.5 overflow-hidden rounded-md border border-dashed border-muted-foreground/40 bg-muted/70 px-1.5 py-1 text-[11px] text-muted-foreground select-none"
      style={{ top, height }}
      title={event.title}
    >
      <button
        type="button"
        className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded bg-background/80 text-muted-foreground hover:text-foreground"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onLogAsWorklog(event);
        }}
        title="Log as Jira worklog"
      >
        <Plus className="size-2.5" />
      </button>

      <div className="flex items-center gap-1 pr-4 font-semibold">
        <CalendarDays className="size-3 shrink-0" />
        <span className="truncate">{event.title}</span>
      </div>
      <div className="mt-0.5">{formatTimeRange(start, end)}</div>
      {event.location && <div className="mt-0.5 truncate">{event.location}</div>}
    </div>
  );
}
