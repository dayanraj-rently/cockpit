import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import { fetchNotes, createNote, updateNote, deleteNote } from "./notesClient";
import type { Note } from "./notesClient";
import { formatDateTime } from "./dateUtils";
import { NoteEditor } from "./NoteEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";
import { Tour } from "./Tour";
import type { TourStep } from "./Tour";
import { cn } from "@/lib/utils";

const NOTES_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="notes-new"]',
    title: "New note",
    body: "Starts a blank note in the editor.",
    accent: "var(--chart-5)",
  },
  {
    selector: '[data-tour="notes-toolbar"]',
    title: "The toolbar",
    body: "Bold, italic, headings, lists, links — the basics, nothing fancier.",
    accent: "var(--chart-5)",
  },
];

export function Notes({
  user,
  onLoggedOut,
  onOpenSettings,
}: {
  user: AuthUser;
  onLoggedOut: () => void;
  onOpenSettings: () => void;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  const selected = notes?.find((n) => n.id === selectedId) ?? null;

  async function load(preferredId?: string) {
    setError(null);
    try {
      const data = await fetchNotes();
      setNotes(data.notes);
      const nextId = preferredId ?? (data.notes.some((n) => n.id === selectedId) ? selectedId : data.notes[0]?.id);
      selectNote(data.notes.find((n) => n.id === nextId) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  function selectNote(note: Note | null) {
    setSelectedId(note?.id ?? null);
    setTitle(note?.title ?? "");
    setContentHtml(note?.contentHtml ?? "");
    setDirty(false);
  }

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  async function handleNewNote() {
    setSaving(true);
    setError(null);
    try {
      const created = await createNote({ title: "Untitled", contentHtml: "" });
      await load(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await updateNote(selectedId, { title, contentHtml });
      await load(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await deleteNote(selectedId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Notes</span>
        </h1>
        <div className="flex items-center gap-3">
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

      <div className="flex gap-4">
        <Card className="w-64 shrink-0 gap-0 p-0 shadow-none">
          <div className="flex items-center justify-between border-b p-2">
            <span className="px-1 text-xs font-medium text-muted-foreground">
              {notes?.length ?? 0} note{notes?.length === 1 ? "" : "s"}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              title="New note"
              onClick={handleNewNote}
              disabled={saving}
              data-tour="notes-new"
            >
              <Plus />
            </Button>
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            {notes?.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No notes yet.</p>
            )}
            {notes?.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => selectNote(note)}
                className={cn(
                  "block w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50",
                  note.id === selectedId && "bg-muted",
                )}
              >
                <div className="truncate text-sm font-medium">{note.title || "Untitled"}</div>
                <div className="text-xs text-muted-foreground">{formatDateTime(note.updatedAt)}</div>
              </button>
            ))}
          </div>
        </Card>

        {selected ? (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                placeholder="Untitled"
                className="text-base font-medium"
              />
              <Button variant="destructive" size="icon" title="Delete note" onClick={handleDelete} disabled={saving}>
                <Trash2 />
              </Button>
              <Button onClick={handleSave} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
            <NoteEditor
              value={contentHtml}
              onChange={(html) => {
                setContentHtml(html);
                setDirty(true);
              }}
            />
          </div>
        ) : (
          <Card className="flex flex-1 items-center justify-center shadow-none">
            <p className="text-sm text-muted-foreground">
              {notes === null ? "Loading…" : "Select a note, or create a new one."}
            </p>
          </Card>
        )}
      </div>

      {tourOpen && <Tour steps={NOTES_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
