import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { fetchJiraSettings, saveJiraSettings } from "./settingsClient";
import { fetchGoogleCalendarSettings, disconnectGoogleCalendar } from "./googleCalendarClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { ThemeToggle } from "./ThemeToggle";

function JiraConnectionPanel() {
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [jql, setJql] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchJiraSettings()
      .then((s) => {
        setBaseUrl(s.baseUrl ?? "");
        setEmail(s.email ?? "");
        setHasToken(s.hasToken);
        setJql(s.jql ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await saveJiraSettings({
        baseUrl,
        email,
        apiToken: apiToken || undefined,
        jql,
      });
      setHasToken(result.hasToken);
      setApiToken("");
      setJql(result.jql ?? "");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <Card className="max-w-[640px]">
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertDescription>Saved.</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baseUrl">Jira base URL</Label>
            <Input
              id="baseUrl"
              placeholder="https://yourcompany.atlassian.net"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Jira account email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiToken">API token</Label>
            <Input
              id="apiToken"
              type="password"
              placeholder={hasToken ? "•••••••••• (saved — leave blank to keep it)" : "Paste your API token"}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Generate a token at{" "}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                id.atlassian.com
              </a>
              . It's encrypted before being stored and is never shown again after saving.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jql">JQL query</Label>
            <Textarea
              id="jql"
              placeholder="assignee = currentUser() ORDER BY updated DESC"
              value={jql}
              onChange={(e) => setJql(e.target.value)}
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Controls which Jira issues show up in the matrix. Test it in Jira's issue search first if
              you're not sure it's valid.
            </p>
          </div>

          <Button type="submit" disabled={saving} className="self-start">
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Reads the one-time ?googleCalendar=connected|error&message=... query params
// left by the OAuth callback redirect, then strips them so a page refresh
// doesn't keep re-showing the same result.
function useOAuthRedirectResult() {
  const [result, setResult] = useState<{ status: "connected" | "error"; message?: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("googleCalendar");
    if (status === "connected" || status === "error") {
      setResult({ status, message: params.get("message") ?? undefined });
      params.delete("googleCalendar");
      params.delete("message");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
  }, []);

  return result;
}

function GoogleCalendarPanel() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectResult = useOAuthRedirectResult();

  useEffect(() => {
    fetchGoogleCalendarSettings()
      .then((s) => setConnected(s.connected))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (redirectResult?.status === "connected") setConnected(true);
  }, [redirectResult]);

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectGoogleCalendar();
      setConnected(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <Card className="max-w-[640px]">
      <CardContent>
        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {redirectResult?.status === "connected" && (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertDescription>Google Calendar connected.</AlertDescription>
            </Alert>
          )}
          {redirectResult?.status === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                {redirectResult.message ?? "Couldn't connect Google Calendar."}
              </AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">
            {connected
              ? "Your Google Calendar is connected. Meetings show up read-only on the Time Blocking calendar."
              : "Connect your Google Calendar to see your meetings on the Time Blocking calendar. Uses Google's sign-in — only read-only calendar access is requested, and you can revoke it from your Google Account at any time."}
          </p>

          <div className="flex items-center gap-2">
            {connected ? (
              <Button type="button" variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </Button>
            ) : (
              <Button render={<a href="/api/google/connect" />}>Connect with Google</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Settings({ onDone }: { onDone: () => void }) {
  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Cockpit
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Settings</span>
        </h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onDone}>
            Back to Dashboard
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Tabs defaultValue="jira">
        <TabsList>
          <TabsTab value="jira">Jira Connection</TabsTab>
          <TabsTab value="google-calendar">Google Calendar</TabsTab>
        </TabsList>
        <TabsPanel value="jira">
          <JiraConnectionPanel />
        </TabsPanel>
        <TabsPanel value="google-calendar">
          <GoogleCalendarPanel />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
