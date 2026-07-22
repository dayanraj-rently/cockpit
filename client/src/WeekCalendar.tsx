import { useEffect, useMemo, useRef, useState } from "react";
import type { Worklog } from "./timeLoggerClient";
import {
  addDays,
  formatDayHeader,
  formatDuration,
  formatHourLabel,
  formatTime,
  isSameDay,
  snapToMinutes,
} from "./dateUtils";
import { WorklogBlock } from "./WorklogBlock";
import { WorklogEditor } from "./WorklogEditor";
import type { WorklogEditorState } from "./WorklogEditor";
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

export function WeekCalendar({
  weekStart,
  worklogs,
  onCreate,
  onUpdate,
  onDelete,
}: {
  weekStart: Date;
  worklogs: Worklog[];
  onCreate: (input: {
    issueKey: string;
    started: Date;
    timeSpentSeconds: number;
    comment: string;
  }) => Promise<void>;
  onUpdate: (
    worklog: Worklog,
    updates: { started: Date; timeSpentSeconds: number; comment?: string },
  ) => Promise<void>;
  onDelete: (worklog: Worklog) => Promise<void>;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const daysRowRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState<{ day: Date; startY: number; currentY: number } | null>(null);
  const [editorState, setEditorState] = useState<WorklogEditorState | null>(null);

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

  const worklogsByDay = useMemo(() => {
    const map = new Map<string, Worklog[]>();
    for (const day of days) map.set(day.toDateString(), []);
    for (const w of worklogs) {
      const key = new Date(w.started).toDateString();
      if (map.has(key)) map.get(key)!.push(w);
    }
    return map;
  }, [days, worklogs]);

  function sumForDay(day: Date): number {
    return (worklogsByDay.get(day.toDateString()) ?? []).reduce((sum, w) => sum + w.timeSpentSeconds, 0);
  }

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
    <div className="rounded-lg border">
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

                {(worklogsByDay.get(day.toDateString()) ?? []).map((w) => (
                  <WorklogBlock
                    key={w.id}
                    worklog={w}
                    day={day}
                    columnWidth={columnWidth}
                    onMove={(worklog, newStarted) =>
                      onUpdate(worklog, { started: newStarted, timeSpentSeconds: worklog.timeSpentSeconds })
                    }
                    onResize={(worklog, newStarted, newTimeSpentSeconds) =>
                      onUpdate(worklog, { started: newStarted, timeSpentSeconds: newTimeSpentSeconds })
                    }
                    onOpen={(worklog) => setEditorState({ mode: "edit", worklog })}
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
        <WorklogEditor
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
