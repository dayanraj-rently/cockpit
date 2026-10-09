import { useEffect, useRef, useState } from "react";
import { GripHorizontal, Trash2 } from "lucide-react";
import type { StickyNote, StickyNoteInput } from "./stickyNotesClient";
import { STICKY_COLOR_COUNT } from "./stickyNotesClient";
import { cn } from "@/lib/utils";

export const STICKY_WIDTH_PX = 208;
export const STICKY_HEIGHT_PX = 200;

// Same "a drag that barely moved is a click" threshold as PlannedBlock.
const CLICK_THRESHOLD_PX = 4;
const AUTOSAVE_DELAY_MS = 600;

export function stickyColorVar(slot: number): string {
  return `var(--chart-${(slot % STICKY_COLOR_COUNT) + 1})`;
}

export function StickyNoteCard({
  note,
  zIndex,
  autoFocus,
  onSave,
  onDelete,
  onBringToFront,
  tourId,
}: {
  note: StickyNote;
  zIndex: number;
  autoFocus: boolean;
  onSave: (id: string, patch: Partial<StickyNoteInput>) => void;
  onDelete: (id: string) => void;
  onBringToFront: (id: string) => void;
  tourId?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(note.content);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The latest unsaved text, so blur/unmount can flush it without waiting
  // for the debounce.
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const color = stickyColorVar(note.color);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Pick up server-side content changes (e.g. after a reload) only when
  // nothing local is waiting to be saved — never clobber in-progress typing.
  useEffect(() => {
    if (pendingRef.current === null) setText(note.content);
  }, [note.content]);

  function flush() {
    window.clearTimeout(timerRef.current);
    if (pendingRef.current === null) return;
    const content = pendingRef.current;
    pendingRef.current = null;
    if (content !== note.content) onSave(note.id, { content });
  }

  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTextChange(value: string) {
    setText(value);
    pendingRef.current = value;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
  }

  function handleDragPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const el = elRef.current;
    if (!el) return;
    e.preventDefault();
    onBringToFront(note.id);
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let moved = 0;

    function handleMove(ev: PointerEvent) {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
      if (el) el.style.transform = `translate(${dx}px, ${dy}px) rotate(-1deg)`;
    }

    function handleUp(ev: PointerEvent) {
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", handleUp);
      handle.removeEventListener("pointercancel", handleUp);
      if (el) el.style.transform = "";
      if (moved < CLICK_THRESHOLD_PX) return;

      const x = Math.max(0, Math.round(note.x + ev.clientX - startClientX));
      const y = Math.max(0, Math.round(note.y + ev.clientY - startClientY));
      onSave(note.id, { x, y });
    }

    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", handleUp);
    handle.addEventListener("pointercancel", handleUp);
  }

  function handleDeleteClick() {
    // Empty stickies go immediately; ones with text take a second click.
    if (text.trim() === "" || confirmingDelete) {
      window.clearTimeout(timerRef.current);
      pendingRef.current = null;
      onDelete(note.id);
    } else {
      setConfirmingDelete(true);
    }
  }

  return (
    <div
      ref={elRef}
      className="group absolute flex flex-col overflow-hidden rounded-md border-t-4 shadow-md transition-shadow focus-within:shadow-lg"
      style={{
        left: note.x,
        top: note.y,
        width: STICKY_WIDTH_PX,
        height: STICKY_HEIGHT_PX,
        zIndex,
        borderTopColor: color,
        // Tinted toward the page background rather than a solid fill, so
        // text-foreground stays readable on every slot in both themes.
        backgroundColor: `color-mix(in oklab, ${color} 22%, var(--background))`,
      }}
      onPointerDown={() => onBringToFront(note.id)}
      data-tour={tourId}
    >
      <div
        className="flex h-7 shrink-0 cursor-grab touch-none items-center gap-1 px-1.5 select-none active:cursor-grabbing"
        onPointerDown={handleDragPointerDown}
        title="Drag to move"
        data-sticky-handle
      >
        <GripHorizontal className="size-3.5 text-muted-foreground" />
        <div
          className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
          data-sticky-colors
        >
          {Array.from({ length: STICKY_COLOR_COUNT }, (_, slot) => (
            <button
              key={slot}
              type="button"
              title="Change color"
              className={cn(
                "size-3 rounded-full ring-offset-1 ring-offset-transparent",
                slot === note.color && "ring-2 ring-foreground/60",
              )}
              style={{ backgroundColor: stickyColorVar(slot) }}
              onClick={() => slot !== note.color && onSave(note.id, { color: slot })}
            />
          ))}
          <button
            type="button"
            title={confirmingDelete ? "Click again to delete" : "Delete"}
            className={cn(
              "ml-1 flex h-5 items-center gap-1 rounded px-1 text-muted-foreground hover:text-destructive",
              confirmingDelete && "bg-destructive/10 text-destructive",
            )}
            onClick={handleDeleteClick}
            onBlur={() => setConfirmingDelete(false)}
          >
            <Trash2 className="size-3.5" />
            {confirmingDelete && <span className="text-[11px] font-medium">Delete?</span>}
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={flush}
        onFocus={() => onBringToFront(note.id)}
        placeholder="Write something…"
        maxLength={5000}
        className="flex-1 resize-none bg-transparent px-3 pb-3 text-sm leading-snug text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
