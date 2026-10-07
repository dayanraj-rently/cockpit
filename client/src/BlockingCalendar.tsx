import { useEffect, useMemo, useRef, useState } from "react";
import type { TimeBlock } from "./timeBlocksClient";
import type { CalendarEvent } from "./googleCalendarClient";
import {
  addDays,
  formatDayHeader,
  formatDuration,
  formatHourLabel,
  formatTime,
  isSameDay,
  snapToMinutes,
} from "./dateUtils";
import { PlannedBlock } from "./PlannedBlock";
import { PlannedBlockEditor } from "./PlannedBlockEditor";
import type { PlannedBlockEditorState } from "./PlannedBlockEditor";
import { CalendarEventBlock } from "./CalendarEventBlock";
import {
  GRID_HEIGHT_PX,
  MIN_DURATION_MS,
  PX_PER_HOUR,
  SNAP_MINUTES,
  TIME_AXIS_WIDTH_PX,
  VISIBLE_END_HOUR,
  VISIBLE_START_HOUR,
} from "./calendarLayout";
import { cn } from "@/lib/utils";

const HOURS = Array.from(
  { length: VISIBLE_END_HOUR - VISIBLE_START_HOUR + 1 },
  (_, i) => VISIBLE_START_HOUR + i,
);

function gridStartOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), VISIBLE_START_HOUR, 0, 0, 0);
}

function topForDate(date: Date, day: Date): number {
  const minutes = (date.getTime() - gridStartOfDay(day).getTime()) / 60000;
  return (minutes / 60) * PX_PER_HOUR;
}

export function BlockingCalendar({
  weekStart,
  blocks,
  events,
  onCreate,
  onUpdate,
  onDelete,
  onLogEventAsWorklog,
  onLogBlockAsWorklog,
}: {
  weekStart: Date;
  blocks: TimeBlock[];
  events: CalendarEvent[];
  onCreate: (input: {
    issueKey?: string | null;
    title: string;
    notes: string;
    started: Date;
    timeSpentSeconds: number;
  }) => Promise<void>;
  onUpdate: (
    block: TimeBlock,
    updates: { issueKey?: string | null; title: string; notes: string; started: Date; timeSpentSeconds: number },
  ) => Promise<void>;
  onDelete: (block: TimeBlock) => Promise<void>;
  onLogEventAsWorklog: (event: CalendarEvent) => void;
  onLogBlockAsWorklog: (block: TimeBlock) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const daysRowRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState<{ day: Date; startY: number; currentY: number } | null>(null);
  const [editorState, setEditorState] = useState<PlannedBlockEditorState | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - VISIBLE_START_HOUR) * PX_PER_HOUR;
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const el = daysRowRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setColumnWidth(el.clientWidth / 7));
    observer.observe(el);
    setColumnWidth(el.clientWidth / 7);
    return () => observer.disconnect();
  }, []);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, TimeBlock[]>();
    for (const day of days) map.set(day.toDateString(), []);
    for (const b of blocks) {
      const key = new Date(b.started).toDateString();
      if (map.has(key)) map.get(key)!.push(b);
    }
    return map;
  }, [days, blocks]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of days) map.set(day.toDateString(), []);
    for (const ev of events) {
      const key = new Date(ev.start).toDateString();
      if (map.has(key)) map.get(key)!.push(ev);
    }
    return map;
  }, [days, events]);

  function sumForDay(day: Date): number {
    return (blocksByDay.get(day.toDateString()) ?? []).reduce((sum, b) => sum + b.timeSpentSeconds, 0);
  }

  // First synced meeting in reading order (earliest day with one) — where
  // the tour anchors its Google Calendar step, since which event that
  // actually is depends entirely on what's on the connected calendar.
  const firstEventId = useMemo(
    () => days.map((d) => eventsByDay.get(d.toDateString())?.[0]?.id).find(Boolean),
    [days, eventsByDay],
  );

  function handleGridPointerDown(day: Date, e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft({ day, startY: y, currentY: y });
  }

  function handleGridPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draft) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDraft((d) => (d ? { ...d, currentY: y } : d));
  }

  function handleGridPointerUp() {
    if (!draft) return;
    const top = Math.min(draft.startY, draft.currentY);
    const bottom = Math.max(draft.startY, draft.currentY);
    const gridStart = gridStartOfDay(draft.day);
    const startedRaw = new Date(gridStart.getTime() + (top / PX_PER_HOUR) * 3600000);
    const endedRaw = new Date(gridStart.getTime() + (bottom / PX_PER_HOUR) * 3600000);
    const started = snapToMinutes(startedRaw, SNAP_MINUTES);
    let ended = snapToMinutes(endedRaw, SNAP_MINUTES);
    if (ended.getTime() - started.getTime() < MIN_DURATION_MS) {
      ended = new Date(started.getTime() + MIN_DURATION_MS);
    }
    const day = draft.day;
    setDraft(null);
    setEditorState({
      mode: "create",
      day,
      started,
      timeSpentSeconds: (ended.getTime() - started.getTime()) / 1000,
    });
  }

  return (
    <div className="rounded-lg border" data-tour="time-blocking-grid">
      <div className="flex border-b">
        <div style={{ width: TIME_AXIS_WIDTH_PX }} className="shrink-0" />
        <div ref={daysRowRef} className="flex flex-1">
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "flex-1 border-l px-2 py-2 text-center text-xs font-medium",
                isSameDay(day, now) && "bg-accent/50",
              )}
            >
              {formatDayHeader(day)}
            </div>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex overflow-y-auto" style={{ maxHeight: 600 }}>
        <div style={{ width: TIME_AXIS_WIDTH_PX, height: GRID_HEIGHT_PX }} className="relative shrink-0">
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground"
              style={{ top: (h - VISIBLE_START_HOUR) * PX_PER_HOUR }}
            >
              {formatHourLabel(h)}
            </div>
          ))}
        </div>

        <div className="flex flex-1">
          {days.map((day) => {
            const isToday = isSameDay(day, now);
            return (
              <div
                key={day.toISOString()}
                className="relative flex-1 border-l"
                style={{ height: GRID_HEIGHT_PX }}
                onPointerDown={(e) => handleGridPointerDown(day, e)}
                onPointerMove={handleGridPointerMove}
                onPointerUp={handleGridPointerUp}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (h - VISIBLE_START_HOUR) * PX_PER_HOUR }}
                  />
                ))}

                {isToday && now.getHours() >= VISIBLE_START_HOUR && now.getHours() < VISIBLE_END_HOUR && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive"
                    style={{ top: topForDate(now, day) }}
                  >
                    <span className="absolute -top-2.5 left-0.5 rounded bg-destructive px-1 text-[9px] text-white">
                      {formatTime(now)}
                    </span>
                  </div>
                )}

                {draft && isSameDay(draft.day, day) && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 rounded-md border-2 border-dashed border-primary/60 bg-primary/10"
                    style={{
                      top: Math.min(draft.startY, draft.currentY),
                      height: Math.abs(draft.currentY - draft.startY),
                    }}
                  />
                )}

                {(eventsByDay.get(day.toDateString()) ?? []).map((ev) => (
                  <CalendarEventBlock
                    key={ev.id}
                    event={ev}
                    day={day}
                    onLogAsWorklog={onLogEventAsWorklog}
                    tourId={ev.id === firstEventId ? "time-blocking-meeting" : undefined}
                  />
                ))}

                {(blocksByDay.get(day.toDateString()) ?? []).map((b) => (
                  <PlannedBlock
                    key={b.id}
                    block={b}
                    day={day}
                    columnWidth={columnWidth}
                    onMove={(block, newStarted) =>
                      onUpdate(block, {
                        issueKey: block.issueKey,
                        title: block.title,
                        notes: block.notes ?? "",
                        started: newStarted,
                        timeSpentSeconds: block.timeSpentSeconds,
                      })
                    }
                    onResize={(block, newStarted, newTimeSpentSeconds) =>
                      onUpdate(block, {
                        issueKey: block.issueKey,
                        title: block.title,
                        notes: block.notes ?? "",
                        started: newStarted,
                        timeSpentSeconds: newTimeSpentSeconds,
                      })
                    }
                    onOpen={(block) => setEditorState({ mode: "edit", block })}
                    onLogAsWorklog={onLogBlockAsWorklog}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex border-t">
        <div
          style={{ width: TIME_AXIS_WIDTH_PX }}
          className="shrink-0 py-1.5 text-center text-[11px] text-muted-foreground"
        >
          Σ
        </div>
        <div className="flex flex-1">
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="flex-1 border-l py-1.5 text-center text-[11px] text-muted-foreground tabular-nums"
            >
              {formatDuration(sumForDay(day))}
            </div>
          ))}
        </div>
      </div>

      {editorState && (
        <PlannedBlockEditor
          state={editorState}
          onClose={() => setEditorState(null)}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
