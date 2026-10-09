import { useEffect, useState } from "react";
import type { CheckIn, KeyResult } from "./okrsClient";
import { checkInKeyResult, fetchCheckIns } from "./okrsClient";
import { formatDateTime } from "./dateUtils";
import { Sparkline } from "./Sparkline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function formatValue(kr: KeyResult, value: number | null) {
  if (kr.kind === "milestone") return null;
  if (value === null) return "—";
  const n = String(Number(value.toFixed(2)));
  if (kr.kind === "jira") return `${n} done`;
  return kr.unit ? `${n} ${kr.unit}` : n;
}

// Log a new value (with an optional note) and see the key result's full
// history. Same overlay shape as WorklogEditor. A Jira-query key result has
// nothing to type in — checking in re-counts it from Jira.
export function CheckInDialog({
  keyResult,
  accentClass,
  onClose,
  onCheckedIn,
}: {
  keyResult: KeyResult;
  accentClass: string;
  onClose: () => void;
  onCheckedIn: () => Promise<void>;
}) {
  const [checkIns, setCheckIns] = useState<CheckIn[] | null>(null);
  const [currentValue, setCurrentValue] = useState(String(keyResult.currentValue ?? ""));
  const [done, setDone] = useState(keyResult.done);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCheckIns(keyResult.id)
      .then((data) => setCheckIns(data.checkIns))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [keyResult.id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSave() {
    let value: number | undefined;
    if (keyResult.kind === "metric") {
      value = Number(currentValue);
      if (!currentValue.trim() || !Number.isFinite(value)) {
        setError("Current value must be a number.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await checkInKeyResult(keyResult.id, { currentValue: value, done, note });
      await onCheckedIn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const history = checkIns ? [...checkIns].reverse().map((c) => ({ progress: c.progress, at: c.createdAt })) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md gap-3 px-4 py-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm font-medium">
            Check in
            <div className="truncate text-xs font-normal text-muted-foreground">{keyResult.title}</div>
          </div>
          <Sparkline points={history} width={120} height={32} className={accentClass} />
        </div>

        {keyResult.kind === "metric" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="checkin-value">
              Current value{keyResult.unit ? ` (${keyResult.unit})` : ""}
            </Label>
            <Input
              id="checkin-value"
              autoFocus
              inputMode="decimal"
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Start {keyResult.startValue} → target {keyResult.targetValue}
            </p>
          </div>
        )}
        {keyResult.kind === "milestone" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="size-4" />
            Done
          </label>
        )}
        {keyResult.kind === "jira" && (
          <p className="text-sm text-muted-foreground">
            The count is refreshed from Jira when you save: currently {keyResult.jiraDone ?? 0} of{" "}
            {keyResult.jiraTotal ?? 0} matching issues are done.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checkin-note">Note (optional)</Label>
          <Textarea
            id="checkin-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What changed, what's blocking, what's next?"
            rows={2}
          />
          {keyResult.jiraIssueKey && (
            <p className="text-xs text-muted-foreground">Also posted as a comment on {keyResult.jiraIssueKey}.</p>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save check-in"}
          </Button>
        </div>

        <div className="flex flex-col gap-1 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground">History</div>
          {checkIns === null && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
          {checkIns?.length === 0 && <p className="text-xs text-muted-foreground">No check-ins yet.</p>}
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {checkIns?.map((c) => (
                  <tr key={c.id} className="border-b align-top last:border-b-0">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{formatDateTime(c.createdAt)}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap tabular-nums">{formatValue(keyResult, c.value)}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">
                      {Math.round(c.progress * 100)}%
                    </td>
                    <td className="py-1.5 whitespace-pre-line text-muted-foreground">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
