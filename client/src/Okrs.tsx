import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ChevronLeft, ChevronRight, HelpCircle, History, Pencil, Plus, RefreshCw } from "lucide-react";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import {
  OkrSetupError,
  createKeyResult,
  createObjective,
  currentPeriod,
  deleteKeyResult,
  deleteObjective,
  fetchOkrs,
  formatPeriod,
  jiraSearchUrl,
  refreshOkrs,
  shiftPeriod,
  syncObjective,
  updateKeyResult,
  updateObjective,
} from "./okrsClient";
import type { KeyResult, Objective, OkrsResponse } from "./okrsClient";
import { ObjectiveEditor } from "./ObjectiveEditor";
import type { ObjectiveEditorState } from "./ObjectiveEditor";
import { KeyResultEditor } from "./KeyResultEditor";
import type { KeyResultEditorState } from "./KeyResultEditor";
import { CheckInDialog } from "./CheckInDialog";
import { Sparkline } from "./Sparkline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "./ThemeToggle";
import { Tour } from "./Tour";
import type { TourStep } from "./Tour";
import { cn } from "@/lib/utils";

const OKRS_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="okrs-period"]',
    title: "One quarter at a time",
    body: "Each objective belongs to a quarter. Step back to review last quarter, or forward to plan the next one.",
    accent: "var(--chart-2)",
  },
  {
    selector: '[data-tour="okrs-new"]',
    title: "Synced to Jira",
    body: "Every objective you add becomes a Jira issue in the project you picked in Settings, and each key result becomes a child issue under it.",
    accent: "var(--chart-2)",
  },
  {
    selector: '[data-tour="okrs-objective"]',
    title: "Progress rolls up",
    body: "A key result's bar fills as its number moves from start to target, as a milestone is ticked, or as the issues matching its Jira query get done. The objective is the average of its key results, and the Jira issues move to Done when they hit 100%.",
    accent: "var(--chart-1)",
  },
  {
    selector: '[data-tour="okrs-checkin"]',
    title: "Check in",
    body: "Log a new value with a note. The line next to each key result is its progress over time, and the full history is in here. Notes are also posted as comments on the Jira issue.",
    accent: "var(--chart-1)",
  },
  {
    selector: '[data-tour="okrs-jira-key"]',
    title: "Open it in Jira",
    body: "Click the issue key to open it in Jira. Edit OKRs here, though: changes made in Jira to a summary or description get overwritten on the next sync.",
    accent: "var(--chart-1)",
  },
];

// Cycled per objective, in display order — decorative only, from the
// shared categorical palette (see client/CLAUDE.md's color system).
const ACCENTS = [
  { border: "border-t-chart-1", bar: "bg-chart-1", text: "text-chart-1" },
  { border: "border-t-chart-2", bar: "bg-chart-2", text: "text-chart-2" },
  { border: "border-t-chart-3", bar: "bg-chart-3", text: "text-chart-3" },
  { border: "border-t-chart-4", bar: "bg-chart-4", text: "text-chart-4" },
  { border: "border-t-chart-5", bar: "bg-chart-5", text: "text-chart-5" },
  { border: "border-t-chart-6", bar: "bg-chart-6", text: "text-chart-6" },
];

function percent(progress: number) {
  return `${Math.round(progress * 100)}%`;
}

function formatValue(value: number | null, unit: string) {
  if (value === null) return "—";
  const n = String(Number(value.toFixed(2)));
  return unit ? `${n} ${unit}` : n;
}

function ProgressBar({ progress, barClass, className }: { progress: number; barClass: string; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-[width]", barClass)} style={{ width: percent(progress) }} />
    </div>
  );
}

function JiraKey({ issueKey, baseUrl, tourId }: { issueKey: string | null; baseUrl: string; tourId?: string }) {
  if (!issueKey) return null;
  return (
    <a
      href={`${baseUrl}/browse/${issueKey}`}
      target="_blank"
      rel="noreferrer"
      data-tour={tourId}
      className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      {issueKey}
    </a>
  );
}

function SyncError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <span title={message} aria-label={message} className="shrink-0">
      <AlertCircle className="size-3.5 text-destructive" />
    </span>
  );
}

export function Okrs({
  user,
  onLoggedOut,
  onOpenSettings,
}: {
  user: AuthUser;
  onLoggedOut: () => void;
  onOpenSettings: () => void;
}) {
  const [period, setPeriod] = useState(currentPeriod);
  const [data, setData] = useState<OkrsResponse | null>(null);
  const [needsSetup, setNeedsSetup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [objectiveEditor, setObjectiveEditor] = useState<ObjectiveEditorState | null>(null);
  const [keyResultEditor, setKeyResultEditor] = useState<KeyResultEditorState | null>(null);
  const [checkIn, setCheckIn] = useState<{ keyResult: KeyResult; accentClass: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  async function load(): Promise<OkrsResponse | null> {
    setError(null);
    try {
      const loaded = await fetchOkrs(period);
      setData(loaded);
      setNeedsSetup(null);
      return loaded;
    } catch (err) {
      if (err instanceof OkrSetupError) setNeedsSetup(err.message);
      else setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  // Show the stored numbers right away, then re-count any Jira-query key
  // results in the background and reload once — only on entering a
  // quarter, not after every edit (edits re-count the one they touch).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const loaded = await load();
      const hasJiraQueries = loaded?.objectives.some((o) => o.keyResults.some((kr) => kr.kind === "jira"));
      if (cancelled || !hasJiraQueries) return;
      setRefreshing(true);
      try {
        await refreshOkrs(period);
        if (!cancelled) await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  // Every mutation reloads afterward: sync state and rolled-up progress are
  // computed server-side, so the fresh list is the simplest source of truth.
  async function afterDelete(result: { warnings: string[] }) {
    setNotice(result.warnings);
    await load();
  }

  async function handleRetry(objective: Objective) {
    setSyncingId(objective.id);
    setError(null);
    try {
      await syncObjective(objective.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncingId(null);
    }
  }

  async function toggleMilestone(kr: KeyResult) {
    setError(null);
    try {
      await updateKeyResult(kr.id, {
        ...kr,
        startValue: null,
        targetValue: null,
        currentValue: null,
        done: !kr.done,
        jql: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const objectives = data?.objectives ?? [];
  const baseUrl = data?.jiraBaseUrl ?? "";
  const firstJiraKeyObjectiveId = objectives.find((o) => o.jiraIssueKey)?.id;
  const firstKeyResultId = objectives.flatMap((o) => o.keyResults)[0]?.id;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>OKRs</span>
        </h1>
        <div className="flex items-center gap-3">
          {!needsSetup && (
            <Button onClick={() => setObjectiveEditor({ mode: "create", period })} data-tour="okrs-new">
              <Plus /> New objective
            </Button>
          )}
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" data-tour="okrs-period">
          <Button variant="ghost" size="icon-sm" title="Previous quarter" onClick={() => setPeriod(shiftPeriod(period, -1))}>
            <ChevronLeft />
          </Button>
          <span className="w-20 text-center text-sm font-medium">{formatPeriod(period)}</span>
          <Button variant="ghost" size="icon-sm" title="Next quarter" onClick={() => setPeriod(shiftPeriod(period, 1))}>
            <ChevronRight />
          </Button>
        </div>
        {period !== currentPeriod() && (
          <Button variant="outline" size="sm" onClick={() => setPeriod(currentPeriod())}>
            This quarter
          </Button>
        )}
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {refreshing && "Refreshing Jira query counts… · "}
            Syncing to Jira project <span className="font-mono">{data.projectKey}</span>
          </span>
        )}
      </div>

      {needsSetup && (
        <Card className="mb-4 flex-row flex-wrap items-center justify-between gap-3 px-4 py-3.5 shadow-none">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-muted-foreground" />
            <p className="text-sm">{needsSetup}</p>
          </div>
          <Button variant="outline" onClick={onOpenSettings}>
            Open Settings
          </Button>
        </Card>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice.length > 0 && (
        <Alert className="mb-4">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Deleted here, but some Jira issues are still there:
            <ul className="mt-1 list-disc pl-4">
              {notice.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {!needsSetup && !loading && objectives.length === 0 && !error && (
        <Card className="items-center gap-2 px-4 py-10 text-center shadow-none">
          <p className="text-sm text-muted-foreground">No objectives for {formatPeriod(period)} yet.</p>
          <Button variant="outline" onClick={() => setObjectiveEditor({ mode: "create", period })}>
            <Plus /> Add the first one
          </Button>
        </Card>
      )}

      {loading && !data && !needsSetup && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {objectives.map((objective, index) => {
          const accent = ACCENTS[index % ACCENTS.length];
          const needsRetry = objective.syncError || objective.keyResults.some((kr) => kr.syncError);
          return (
            <Card
              key={objective.id}
              data-tour={index === 0 ? "okrs-objective" : undefined}
              className={cn("gap-3 border-t-2 px-4 py-4 shadow-none", accent.border)}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-medium">{objective.title}</h2>
                    <JiraKey
                      issueKey={objective.jiraIssueKey}
                      baseUrl={baseUrl}
                      tourId={objective.id === firstJiraKeyObjectiveId ? "okrs-jira-key" : undefined}
                    />
                    <SyncError message={objective.syncError} />
                  </div>
                  {objective.description && (
                    <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{objective.description}</p>
                  )}
                </div>
                {needsRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    title="Push this objective and its key results to Jira again"
                    disabled={syncingId === objective.id}
                    onClick={() => handleRetry(objective)}
                  >
                    <RefreshCw className={cn(syncingId === objective.id && "animate-spin")} /> Retry sync
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Edit objective"
                  onClick={() => setObjectiveEditor({ mode: "edit", objective })}
                >
                  <Pencil />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <ProgressBar progress={objective.progress} barClass={accent.bar} className="h-2 flex-1" />
                <span className="w-10 text-right text-sm font-medium tabular-nums">{percent(objective.progress)}</span>
              </div>

              <div className="flex flex-col divide-y rounded-lg border">
                {objective.keyResults.length === 0 && (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">No key results yet.</p>
                )}
                {objective.keyResults.map((kr) => (
                  <div key={kr.id} className="flex items-center gap-2 px-3 py-2">
                    {kr.kind === "milestone" && (
                      <input
                        type="checkbox"
                        checked={kr.done}
                        onChange={() => toggleMilestone(kr)}
                        className="size-4 shrink-0"
                        title={kr.done ? "Mark as not done" : "Mark as done"}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("truncate text-sm", kr.kind === "milestone" && kr.done && "line-through text-muted-foreground")}>
                          {kr.title}
                        </span>
                        <JiraKey issueKey={kr.jiraIssueKey} baseUrl={baseUrl} />
                        <SyncError message={kr.syncError} />
                        <SyncError message={kr.countError} />
                      </div>
                      {kr.kind === "metric" && (
                        <div className="mt-1 flex items-center gap-2">
                          <ProgressBar progress={kr.progress} barClass={accent.bar} className="flex-1" />
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatValue(kr.currentValue, kr.unit)} / {formatValue(kr.targetValue, kr.unit)}
                          </span>
                        </div>
                      )}
                      {kr.kind === "jira" && (
                        <div className="mt-1 flex items-center gap-2">
                          <ProgressBar progress={kr.progress} barClass={accent.bar} className="flex-1" />
                          <a
                            href={jiraSearchUrl(baseUrl, kr.jql)}
                            target="_blank"
                            rel="noreferrer"
                            title={kr.jql}
                            className="shrink-0 text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline"
                          >
                            {kr.jiraDone ?? 0} / {kr.jiraTotal ?? 0} issues done
                          </a>
                        </div>
                      )}
                    </div>
                    <Sparkline points={kr.history} className={accent.text} />
                    <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {percent(kr.progress)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Check in & history"
                      data-tour={kr.id === firstKeyResultId ? "okrs-checkin" : undefined}
                      onClick={() => setCheckIn({ keyResult: kr, accentClass: accent.text })}
                    >
                      <History />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Edit key result"
                      onClick={() => setKeyResultEditor({ mode: "edit", objective, keyResult: kr })}
                    >
                      <Pencil />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setKeyResultEditor({ mode: "create", objective })}
              >
                <Plus /> Add key result
              </Button>
            </Card>
          );
        })}
      </div>

      {objectiveEditor && (
        <ObjectiveEditor
          state={objectiveEditor}
          onClose={() => setObjectiveEditor(null)}
          onSave={async (input) => {
            if (objectiveEditor.mode === "edit") await updateObjective(objectiveEditor.objective.id, input);
            else await createObjective(input);
            await load();
          }}
          onDelete={async (objective) => afterDelete(await deleteObjective(objective.id))}
        />
      )}

      {keyResultEditor && (
        <KeyResultEditor
          state={keyResultEditor}
          onClose={() => setKeyResultEditor(null)}
          onSave={async (input) => {
            if (keyResultEditor.mode === "edit") await updateKeyResult(keyResultEditor.keyResult.id, input);
            else await createKeyResult(keyResultEditor.objective.id, input);
            await load();
          }}
          onDelete={async (kr) => afterDelete(await deleteKeyResult(kr.id))}
        />
      )}

      {checkIn && (
        <CheckInDialog
          keyResult={checkIn.keyResult}
          accentClass={checkIn.accentClass}
          onClose={() => setCheckIn(null)}
          onCheckedIn={async () => {
            await load();
          }}
        />
      )}

      {tourOpen && <Tour steps={OKRS_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
