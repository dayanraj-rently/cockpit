import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, Plus } from "lucide-react";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import {
  fetchStickyNotes,
  createStickyNote,
  updateStickyNote,
  deleteStickyNote,
  STICKY_COLOR_COUNT,
} from "./stickyNotesClient";
import type { StickyNote, StickyNoteInput } from "./stickyNotesClient";
import { StickyNoteCard, STICKY_WIDTH_PX, STICKY_HEIGHT_PX } from "./StickyNoteCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";
import { Tour } from "./Tour";
import type { TourStep } from "./Tour";

const STICKY_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="stickies-new"]',
    title: "New sticky",
    body: "Drops a sticky near the top-left of what you're looking at. You can also double-click any empty spot on the board to put one right there.",
    accent: "var(--chart-6)",
  },
  {
    selector: '[data-tour="sticky-first"] [data-sticky-handle]',
    title: "Drag to move",
    body: "Grab a sticky by its top strip and drop it anywhere. Its spot is remembered.",
    accent: "var(--chart-6)",
  },
  {
    selector: '[data-tour="sticky-first"] [data-sticky-colors]',
    title: "Color and delete",
    body: "Hover a sticky to recolor it or delete it. A sticky with text in it asks for a second click before it's deleted.",
    accent: "var(--chart-6)",
  },
];

// Extra room past the furthest sticky, so there's always space to drag into.
const BOARD_SLACK_PX = 320;

export function StickyNotes({
  user,
  onLoggedOut,
  onOpenSettings,
}: {
  user: AuthUser;
  onLoggedOut: () => void;
  onOpenSettings: () => void;
}) {
  const [notes, setNotes] = useState<StickyNote[] | null>(null);
  // Stacking order, back to front. Kept separate from render order so
  // bringing a sticky to front never re-orders DOM nodes mid-drag (which
  // would drop its pointer capture).
  const [stack, setStack] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  // Saves build the full row from the latest state, not a render-time
  // snapshot — a move and a text autosave can land back to back.
  const notesRef = useRef<StickyNote[]>([]);
  notesRef.current = notes ?? [];

  async function load() {
    try {
      const data = await fetchStickyNotes();
      setNotes(data.stickyNotes);
      setStack(data.stickyNotes.map((n) => n.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  async function addNote(x: number, y: number) {
    setError(null);
    const input: StickyNoteInput = {
      content: "",
      color: notesRef.current.length % STICKY_COLOR_COUNT,
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
    };
    try {
      const { id } = await createStickyNote(input);
      const now = new Date().toISOString();
      setNotes((prev) => [...(prev ?? []), { id, ...input, createdAt: now, updatedAt: now }]);
      setStack((prev) => [...prev, id]);
      setFocusId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleNewClick() {
    const board = boardRef.current;
    // Cascade new stickies from the visible top-left so repeated clicks
    // don't stack them exactly on top of each other.
    const offset = 24 + (notesRef.current.length % 8) * 24;
    addNote((board?.scrollLeft ?? 0) + offset, (board?.scrollTop ?? 0) + offset);
  }

  function handleBoardDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    addNote(e.clientX - rect.left - STICKY_WIDTH_PX / 2, e.clientY - rect.top - 14);
  }

  async function saveNote(id: string, patch: Partial<StickyNoteInput>) {
    const current = notesRef.current.find((n) => n.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    setNotes((prev) => prev?.map((n) => (n.id === id ? next : n)) ?? prev);
    try {
      await updateStickyNote(id, { content: next.content, color: next.color, x: next.x, y: next.y });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      load();
    }
  }

  async function removeNote(id: string) {
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev);
    setStack((prev) => prev.filter((s) => s !== id));
    try {
      await deleteStickyNote(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      load();
    }
  }

  function bringToFront(id: string) {
    setStack((prev) => (prev[prev.length - 1] === id ? prev : [...prev.filter((s) => s !== id), id]));
  }

  const ordered = [...(notes ?? [])].sort((a, b) => Number(a.id) - Number(b.id));
  // "First" in reading order (top-most, then left-most) for the tour.
  const firstId = [...ordered].sort((a, b) => a.y - b.y || a.x - b.x)[0]?.id;
  const canvasWidth = Math.max(0, ...ordered.map((n) => n.x + STICKY_WIDTH_PX)) + BOARD_SLACK_PX;
  const canvasHeight = Math.max(0, ...ordered.map((n) => n.y + STICKY_HEIGHT_PX)) + BOARD_SLACK_PX;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Sticky Notes</span>
        </h1>
        <div className="flex items-center gap-3">
          <Button onClick={handleNewClick} disabled={notes === null} data-tour="stickies-new">
            <Plus />
            New sticky
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
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        ref={boardRef}
        className="relative h-[calc(100vh-140px)] min-h-[400px] overflow-auto rounded-xl border bg-muted/30"
      >
        <div
          className="relative"
          style={{
            width: `max(100%, ${canvasWidth}px)`,
            height: `max(100%, ${canvasHeight}px)`,
            backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          onDoubleClick={handleBoardDoubleClick}
        >
          {notes?.length === 0 && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No stickies yet — double-click anywhere on the board, or use New sticky.
            </p>
          )}
          {notes === null && !error && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading…</p>
          )}
          {ordered.map((note) => (
            <StickyNoteCard
              key={note.id}
              note={note}
              zIndex={stack.indexOf(note.id) + 1}
              autoFocus={note.id === focusId}
              onSave={saveNote}
              onDelete={removeNote}
              onBringToFront={bringToFront}
              tourId={note.id === firstId ? "sticky-first" : undefined}
            />
          ))}
        </div>
      </div>

      {tourOpen && <Tour steps={STICKY_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
