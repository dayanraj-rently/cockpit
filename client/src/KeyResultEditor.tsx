import { useEffect, useState } from "react";
import type { KeyResult, KeyResultInput, KeyResultKind, Objective } from "./okrsClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type KeyResultEditorState =
  | { mode: "create"; objective: Objective }
  | { mode: "edit"; objective: Objective; keyResult: KeyResult };

const KINDS: { id: KeyResultKind; label: string; hint: string }[] = [
  { id: "metric", label: "Metric", hint: "Move a number from a start value to a target." },
  { id: "milestone", label: "Milestone", hint: "Done or not done." },
  {
    id: "jira",
    label: "Jira query",
    hint: "Progress is the share of issues matching this JQL that are done. Checked against Jira when you save.",
  },
];

function toInputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function KeyResultEditor({
  state,
  onClose,
  onSave,
  onDelete,
}: {
  state: KeyResultEditorState;
  onClose: () => void;
  onSave: (input: KeyResultInput) => Promise<void>;
  onDelete: (keyResult: KeyResult) => Promise<void>;
}) {
  const existing = state.mode === "edit" ? state.keyResult : null;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [kind, setKind] = useState<KeyResultKind>(existing?.kind ?? "metric");
  const [startValue, setStartValue] = useState(toInputValue(existing?.startValue ?? 0));
  const [targetValue, setTargetValue] = useState(toInputValue(existing?.targetValue));
  const [currentValue, setCurrentValue] = useState(toInputValue(existing?.currentValue ?? 0));
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [done, setDone] = useState(existing?.done ?? false);
  const [jql, setJql] = useState(existing?.jql ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  function handleSave() {
    if (!title.trim()) {
      setError("Give the key result a title.");
      return;
    }
    if (kind === "milestone") {
      run(() =>
        onSave({ title, kind, startValue: null, targetValue: null, currentValue: null, unit: "", done, jql: "" }),
      );
      return;
    }
    if (kind === "jira") {
      if (!jql.trim()) {
        setError("Enter a JQL query.");
        return;
      }
      run(() =>
        onSave({ title, kind, startValue: null, targetValue: null, currentValue: null, unit: "", done: false, jql }),
      );
      return;
    }
    const start = parseNumber(startValue);
    const target = parseNumber(targetValue);
    const current = parseNumber(currentValue);
    if (start === null || target === null || current === null) {
      setError("Start, target, and current must all be numbers.");
      return;
    }
    if (start === target) {
      setError("Target must be different from the start value.");
      return;
    }
    run(() =>
      onSave({ title, kind, startValue: start, targetValue: target, currentValue: current, unit, done: false, jql: "" }),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md gap-3 px-4 py-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium">
          {existing ? "Edit key result" : "New key result"}
          <div className="truncate text-xs font-normal text-muted-foreground">{state.objective.title}</div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kr-title">Key result</Label>
          <Input
            id="kr-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Cut time-to-first-value from 3 days to 1"
            maxLength={255}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Measured as</Label>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-sm transition-colors",
                  kind === k.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{KINDS.find((k) => k.id === kind)?.hint}</p>
        </div>

        {kind === "jira" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kr-jql">JQL</Label>
            <Textarea
              id="kr-jql"
              value={jql}
              onChange={(e) => setJql(e.target.value)}
              placeholder='project = WEB AND labels = "onboarding"'
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        ) : kind === "metric" ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kr-start">Start</Label>
              <Input id="kr-start" inputMode="decimal" value={startValue} onChange={(e) => setStartValue(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kr-target">Target</Label>
              <Input
                id="kr-target"
                inputMode="decimal"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kr-current">Current</Label>
              <Input
                id="kr-current"
                inputMode="decimal"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kr-unit">Unit (optional)</Label>
              <Input
                id="kr-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="%, ms, users…"
                maxLength={20}
              />
            </div>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="size-4" />
            Done
          </label>
        )}

        {confirmingDelete && (
          <p className="text-xs text-destructive">
            This also deletes {existing?.jiraIssueKey} in Jira. Click Delete again to confirm.
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          {existing ? (
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() =>
                confirmingDelete || !existing.jiraIssueKey ? run(() => onDelete(existing)) : setConfirmingDelete(true)
              }
            >
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
