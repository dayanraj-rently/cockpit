import { useEffect, useState } from "react";
import type { Worklog, IssueSearchResult } from "./timeLoggerClient";
import { searchIssues } from "./timeLoggerClient";
import { formatDayHeader, formatDuration, setTimeOnDay, toTimeInputValue } from "./dateUtils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
} from "@/components/ui/autocomplete";

export type WorklogEditorState =
  | {
      mode: "create";
      day: Date;
      started: Date;
      timeSpentSeconds: number;
      initialComment?: string;
      initialIssueKey?: string;
    }
  | { mode: "edit"; worklog: Worklog };

const SEARCH_DEBOUNCE_MS = 250;

export function WorklogEditor({
  state,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  state: WorklogEditorState;
  onClose: () => void;
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
  const isEdit = state.mode === "edit";
  const day = isEdit ? new Date(state.worklog.started) : state.started;
  const initialStarted = isEdit ? new Date(state.worklog.started) : state.started;
  const initialTimeSpentSeconds = isEdit ? state.worklog.timeSpentSeconds : state.timeSpentSeconds;
  const initialEnded = new Date(initialStarted.getTime() + initialTimeSpentSeconds * 1000);

  const [startInput, setStartInput] = useState(() => toTimeInputValue(initialStarted));
  const [endInput, setEndInput] = useState(() => toTimeInputValue(initialEnded));

  const started = setTimeOnDay(day, startInput);
  const ended = setTimeOnDay(day, endInput);
  const timeSpentSeconds = (ended.getTime() - started.getTime()) / 1000;

  const [issueKey, setIssueKey] = useState(isEdit ? state.worklog.issueKey : (state.initialIssueKey ?? ""));
  const [issueQuery, setIssueQuery] = useState(
    isEdit ? `${state.worklog.issueKey} ${state.worklog.issueSummary ?? ""}` : (state.initialIssueKey ?? ""),
  );
  const [issueResults, setIssueResults] = useState<IssueSearchResult[]>([]);
  const [issueSearchLoading, setIssueSearchLoading] = useState(false);
  const [notes, setNotes] = useState(isEdit ? (state.worklog.comment ?? "") : (state.initialComment ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) return;
    if (!issueQuery.trim()) {
      setIssueResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setIssueSearchLoading(true);
      try {
        const data = await searchIssues(issueQuery.trim());
        setIssueResults(data.issues);
      } catch {
        setIssueResults([]);
      } finally {
        setIssueSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [issueQuery, isEdit]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSave() {
    if (!issueKey) {
      setError("Pick an issue to log time against.");
      return;
    }
    if (timeSpentSeconds <= 0) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await onUpdate(state.worklog, { started, timeSpentSeconds, comment: notes });
      } else {
        await onCreate({ issueKey, started, timeSpentSeconds, comment: notes });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(state.worklog);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm gap-3 px-4 py-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium">{formatDayHeader(day)}</div>

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="worklog-start">Start</Label>
            <Input
              id="worklog-start"
              type="time"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="worklog-end">End</Label>
            <Input id="worklog-end" type="time" value={endInput} onChange={(e) => setEndInput(e.target.value)} />
          </div>
          <span className="pb-1.5 text-xs whitespace-nowrap text-muted-foreground">
            {timeSpentSeconds > 0 ? formatDuration(timeSpentSeconds) : "—"}
          </span>
        </div>

        {isEdit ? (
          <div className="text-sm">
            <span className="font-mono text-muted-foreground">{state.worklog.issueKey}</span>{" "}
            {state.worklog.issueSummary}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label>Issue</Label>
            <Autocomplete
              items={issueResults}
              mode="none"
              value={issueQuery}
              onValueChange={setIssueQuery}
              itemToStringValue={(i: IssueSearchResult) => `${i.key} ${i.summary ?? ""}`}
            >
              <AutocompleteInputGroup>
                <AutocompleteInput placeholder="Search issues…" />
              </AutocompleteInputGroup>
              <AutocompleteContent>
                {issueSearchLoading && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
                )}
                {!issueSearchLoading && issueQuery.trim() && issueResults.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No matches</div>
                )}
                {issueResults.map((i) => (
                  <AutocompleteItem
                    key={i.key}
                    value={i}
                    onClick={() => {
                      setIssueKey(i.key);
                      setIssueQuery(`${i.key} ${i.summary ?? ""}`);
                    }}
                  >
                    <span className="font-mono text-xs">{i.key}</span>{" "}
                    <span className="truncate">{i.summary}</span>
                  </AutocompleteItem>
                ))}
              </AutocompleteContent>
            </Autocomplete>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you work on?"
            rows={3}
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          {isEdit ? (
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
