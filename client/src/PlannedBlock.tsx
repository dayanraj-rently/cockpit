import { useRef } from "react";
import { Plus } from "lucide-react";
import type { TimeBlock } from "./timeBlocksClient";
import { addDays, formatTimeRange, snapToMinutes } from "./dateUtils";
import { getIssueColor } from "./worklogColor";
import { useIsDarkMode } from "./useIsDarkMode";
import {
  PX_PER_HOUR,
  VISIBLE_START_HOUR,
  MIN_BLOCK_HEIGHT_PX,
  MIN_DURATION_MS,
  SNAP_MINUTES,
} from "./calendarLayout";

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

export function PlannedBlock({
  block,
  day,
  columnWidth,
  onMove,
  onResize,
  onOpen,
  onLogAsWorklog,
}: {
  block: TimeBlock;
  day: Date;
  columnWidth: number;
  onMove: (block: TimeBlock, newStarted: Date) => void;
  onResize: (block: TimeBlock, newStarted: Date, newTimeSpentSeconds: number) => void;
  onOpen: (block: TimeBlock) => void;
  onLogAsWorklog: (block: TimeBlock) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDarkMode();
  const color = getIssueColor(block.issueKey || block.title, isDark);

  const started = new Date(block.started);
  const ended = new Date(started.getTime() + block.timeSpentSeconds * 1000);
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
        onOpen(block);
        return;
      }

      const dayShift = columnWidth > 0 ? Math.round(dx / columnWidth) : 0;
      const deltaMinutes = (dy / PX_PER_HOUR) * 60;
      const shiftedTime = snapToMinutes(new Date(started.getTime() + deltaMinutes * 60000), SNAP_MINUTES);
      const newStarted = addDays(shiftedTime, dayShift);
      onMove(block, newStarted);
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
        onResize(block, newStart, (ended.getTime() - newStart.getTime()) / 1000);
      } else {
        let newEnd = snapToMinutes(new Date(ended.getTime() + deltaMinutes * 60000), SNAP_MINUTES);
        if (newEnd > dayEnd) newEnd = dayEnd;
        if (newEnd.getTime() - started.getTime() < MIN_DURATION_MS) {
          newEnd = new Date(started.getTime() + MIN_DURATION_MS);
        }
        onResize(block, started, (newEnd.getTime() - started.getTime()) / 1000);
      }
    }

    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", handleUp);
  }

  return (
    <div
      ref={elRef}
      // Tinted + left-bordered rather than a solid fill (like WorklogBlock) —
      // "planned" reads visually distinct from "already logged".
      className="absolute inset-x-0.5 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-[11px] text-foreground shadow-sm select-none"
      style={{ top, height, backgroundColor: `${color.bg}26`, borderLeftColor: color.bg }}
      onPointerDown={handleMovePointerDown}
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
        onPointerDown={(e) => handleResizePointerDown("top", e)}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        onPointerDown={(e) => handleResizePointerDown("bottom", e)}
      />

      <button
        type="button"
        className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded bg-background/80 text-muted-foreground hover:text-foreground"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onLogAsWorklog(block);
        }}
        title="Log as Jira worklog"
      >
        <Plus className="size-2.5" />
      </button>

      <div className="flex items-center gap-1 pr-4 font-semibold">
        {block.issueKey && <span className="font-mono text-muted-foreground">{block.issueKey}</span>}
        <span className="truncate">{block.title}</span>
      </div>
      <div className="mt-0.5 text-muted-foreground">{formatTimeRange(started, ended)}</div>
      {block.notes && <div className="mt-0.5 whitespace-pre-wrap text-muted-foreground italic">{block.notes}</div>}
    </div>
  );
}
