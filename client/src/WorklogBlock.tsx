import { useRef } from "react";
import type { Worklog } from "./timeLoggerClient";
import { addDays, formatTimeRange, snapToMinutes } from "./dateUtils";
import { getIssueColor } from "./worklogColor";
import { useIsDarkMode } from "./useIsDarkMode";
import { statusDotClass } from "./status";
import {
  PX_PER_HOUR,
  VISIBLE_START_HOUR,
  MIN_BLOCK_HEIGHT_PX,
  MIN_DURATION_MS,
  SNAP_MINUTES,
} from "./calendarLayout";
import { cn } from "@/lib/utils";

// A drag that never moved more than this many pixels counts as a click
// (opens the edit popover) rather than a move (issues a PUT with the same
// values it already had).
const CLICK_THRESHOLD_PX = 4;

function gridStartOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), VISIBLE_START_HOUR, 0, 0, 0);
}

function topForDate(date: Date, day: Date): number {
  const minutes = (date.getTime() - gridStartOfDay(day).getTime()) / 60000;
  return (minutes / 60) * PX_PER_HOUR;
}

export function WorklogBlock({
  worklog,
  day,
  columnWidth,
  onMove,
  onResize,
  onOpen,
  tourId,
}: {
  worklog: Worklog;
  day: Date;
  columnWidth: number;
  onMove: (worklog: Worklog, newStarted: Date) => void;
  onResize: (worklog: Worklog, newStarted: Date, newTimeSpentSeconds: number) => void;
  onOpen: (worklog: Worklog) => void;
  tourId?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDarkMode();
  const color = getIssueColor(worklog.issueKey, isDark);

  const started = new Date(worklog.started);
  const ended = new Date(started.getTime() + worklog.timeSpentSeconds * 1000);
  const top = topForDate(started, day);
  const height = Math.max(((ended.getTime() - started.getTime()) / 3600000) * PX_PER_HOUR, MIN_BLOCK_HEIGHT_PX);

  function handleMovePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = elRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let moved = 0;

    function handleMove(ev: PointerEvent) {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
      if (el) el.style.transform = `translate(${dx}px, ${dy}px)`;
      if (el) el.style.zIndex = "20";
    }

    function handleUp(ev: PointerEvent) {
      el?.removeEventListener("pointermove", handleMove);
      el?.removeEventListener("pointerup", handleUp);
      if (el) {
        el.style.transform = "";
        el.style.zIndex = "";
      }

      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;

      if (moved < CLICK_THRESHOLD_PX) {
        onOpen(worklog);
        return;
      }

      const dayShift = columnWidth > 0 ? Math.round(dx / columnWidth) : 0;
      const deltaMinutes = (dy / PX_PER_HOUR) * 60;
      const shiftedTime = snapToMinutes(new Date(started.getTime() + deltaMinutes * 60000), SNAP_MINUTES);
      const newStarted = addDays(shiftedTime, dayShift);
      onMove(worklog, newStarted);
    }

    el.addEventListener("pointermove", handleMove);
    el.addEventListener("pointerup", handleUp);
  }

  function handleResizePointerDown(edge: "top" | "bottom", e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const startClientY = e.clientY;
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
    const dayEnd = addDays(dayStart, 1);
    const el = elRef.current;
    const baseTop = top;
    const baseHeight = height;

    function handleMove(ev: PointerEvent) {
      const dy = ev.clientY - startClientY;
      if (!el) return;
      if (edge === "top") {
        el.style.top = `${baseTop + dy}px`;
        el.style.height = `${Math.max(baseHeight - dy, MIN_BLOCK_HEIGHT_PX)}px`;
      } else {
        el.style.height = `${Math.max(baseHeight + dy, MIN_BLOCK_HEIGHT_PX)}px`;
      }
    }

    function handleUp(ev: PointerEvent) {
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", handleUp);
      if (el) {
        el.style.top = "";
        el.style.height = "";
      }

      const dy = ev.clientY - startClientY;
      const deltaMinutes = (dy / PX_PER_HOUR) * 60;

      if (edge === "top") {
        let newStart = snapToMinutes(new Date(started.getTime() + deltaMinutes * 60000), SNAP_MINUTES);
        if (newStart < dayStart) newStart = dayStart;
        if (ended.getTime() - newStart.getTime() < MIN_DURATION_MS) {
          newStart = new Date(ended.getTime() - MIN_DURATION_MS);
        }
        onResize(worklog, newStart, (ended.getTime() - newStart.getTime()) / 1000);
      } else {
        let newEnd = snapToMinutes(new Date(ended.getTime() + deltaMinutes * 60000), SNAP_MINUTES);
        if (newEnd > dayEnd) newEnd = dayEnd;
        if (newEnd.getTime() - started.getTime() < MIN_DURATION_MS) {
          newEnd = new Date(started.getTime() + MIN_DURATION_MS);
        }
        onResize(worklog, started, (newEnd.getTime() - started.getTime()) / 1000);
      }
    }

    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", handleUp);
  }

  return (
    <div
      ref={elRef}
      className="group absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-1 text-[11px] shadow-sm select-none"
      style={{ top, height, backgroundColor: color.bg, color: color.fg }}
      onPointerDown={handleMovePointerDown}
      data-tour={tourId}
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
        onPointerDown={(e) => handleResizePointerDown("top", e)}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        onPointerDown={(e) => handleResizePointerDown("bottom", e)}
      />

      <div className="flex items-center gap-1 font-semibold">
        <span className="font-mono">{worklog.issueKey}</span>
        <span className="truncate">{worklog.issueSummary}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 opacity-90">
        {worklog.issueTypeIconUrl && <img src={worklog.issueTypeIconUrl} alt="" className="size-3" />}
        {worklog.priorityIconUrl && <img src={worklog.priorityIconUrl} alt="" className="size-3" />}
        {statusDotClass(worklog.status) && (
          <span className={cn("size-1.5 rounded-full", statusDotClass(worklog.status))} />
        )}
        {worklog.status && <span className="truncate">{worklog.status}</span>}
      </div>
      <div className="mt-0.5 opacity-90">{formatTimeRange(started, ended)}</div>
      {worklog.comment && <div className="mt-0.5 whitespace-pre-wrap italic opacity-90">{worklog.comment}</div>}
    </div>
  );
}
