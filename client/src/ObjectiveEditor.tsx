import { useEffect, useState } from "react";
import type { Objective, ObjectiveInput } from "./okrsClient";
import { formatPeriod } from "./okrsClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ObjectiveEditorState = { mode: "create"; period: string } | { mode: "edit"; objective: Objective };

// Same overlay/modal shape as WorklogEditor. Deleting takes a second click
// because it also deletes the objective's (and its key results') Jira issues.
export function ObjectiveEditor({
  state,
  onClose,
  onSave,
  onDelete,
}: {
  state: ObjectiveEditorState;
  onClose: () => void;
  onSave: (input: ObjectiveInput) => Promise<void>;
  onDelete: (objective: Objective) => Promise<void>;
}) {
  const isEdit = state.mode === "edit";
  const period = isEdit ? state.objective.period : state.period;
  const [title, setTitle] = useState(isEdit ? state.objective.title : "");
  const [description, setDescription] = useState(isEdit ? state.objective.description : "");
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
      setError("Give the objective a title.");
      return;
    }
    run(() => onSave({ period, title, description }));
  }

  const jiraIssueCount = isEdit
    ? [state.objective.jiraIssueKey, ...state.objective.keyResults.map((kr) => kr.jiraIssueKey)].filter(Boolean)
        .length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md gap-3 px-4 py-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium">
          {isEdit ? "Edit objective" : "New objective"}{" "}
          <span className="text-muted-foreground">· {formatPeriod(period)}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="objective-title">Objective</Label>
          <Input
            id="objective-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Make onboarding effortless"
            maxLength={255}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="objective-description">Why it matters (optional)</Label>
          <Textarea
            id="objective-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        {confirmingDelete && (
          <p className="text-xs text-destructive">
            This also deletes {jiraIssueCount === 1 ? "its Jira issue" : `its ${jiraIssueCount} Jira issues`} (the
            objective and every key result). Click Delete again to confirm.
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          {isEdit ? (
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() =>
                confirmingDelete || jiraIssueCount === 0
                  ? run(() => onDelete(state.objective))
                  : setConfirmingDelete(true)
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
