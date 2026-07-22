import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import {
  fetchAllIssues,
  getIssueTransitions,
  transitionIssue,
  searchOrgUsers,
  assignIssue,
  getMyself,
  getIssueWorklogs,
  addWorklog,
  updateWorklog,
  deleteWorklog,
  searchIssuePicker,
} from "./jira.js";
import { classifyIssue } from "./quadrant.js";
import { assertEncryptionKeyConfigured } from "./crypto.js";
import { getJiraSettings, getJiraSettingsPublic, upsertJiraSettings } from "./settings.js";
import { QUADRANTS, getPlacements, setQuadrantOrder } from "./overrides.js";
import { listTimeBlocks, createTimeBlock, updateTimeBlock, deleteTimeBlock } from "./timeBlocks.js";
import { listNotes, getNote, createNote, updateNote, deleteNote } from "./notes.js";
import {
  getGoogleCalendarSettingsPublic,
  saveGoogleTokens,
  disconnectGoogleCalendar,
  fetchCalendarEvents,
} from "./googleCalendar.js";
import { createOAuthState, consumeOAuthState, getGoogleAuthUrl, exchangeCodeForTokens } from "./googleAuth.js";
import {
  SESSION_COOKIE,
  createSession,
  createUser,
  deleteSession,
  hasAnyUsers,
  requireAuth,
  sessionCookieOptions,
  verifyCredentials,
} from "./auth.js";

try {
  assertEncryptionKeyConfigured();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { PORT = 8787 } = process.env;

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/api/install/status", (req, res) => {
  res.json({ needed: !hasAnyUsers() });
});

app.post("/api/install", (req, res) => {
  if (hasAnyUsers()) {
    return res.status(409).json({ error: "Setup has already been completed." });
  }

  const { username, password } = req.body ?? {};
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    createUser(username.trim(), password);
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: "Could not create account" });
  }

  const user = verifyCredentials(username.trim(), password);
  const session = createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions());
  res.json({ username: user.username });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const user = verifyCredentials(username, password);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const session = createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions());
  res.json({ username: user.username });
});

app.post("/api/auth/logout", (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (sessionId) deleteSession(sessionId);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

app.get("/api/settings/jira", requireAuth, (req, res) => {
  res.json(getJiraSettingsPublic(req.user.id));
});

app.put("/api/settings/jira", requireAuth, (req, res) => {
  const { baseUrl, email, apiToken, jql } = req.body ?? {};
  try {
    upsertJiraSettings(req.user.id, { baseUrl, email, apiToken, jql });
    res.json(getJiraSettingsPublic(req.user.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/issues", requireAuth, async (req, res) => {
  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({
      error: "Configure your Jira connection in Settings first.",
      needsSetup: true,
    });
  }
  if (!settings.jql) {
    return res.status(400).json({
      error: "Add a JQL query in Settings first.",
      needsSetup: true,
    });
  }

  try {
    const rawIssues = await fetchAllIssues({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      jql: settings.jql,
    });

    const placements = getPlacements(req.user.id);

    const issues = rawIssues.map((issue) => {
      const { important, urgent, urgencySource, quadrant } = classifyIssue(issue);
      const placement = placements.get(issue.key);
      return {
        key: issue.key,
        url: `${settings.baseUrl}/browse/${issue.key}`,
        summary: issue.fields.summary,
        issueType: issue.fields.issuetype?.name,
        priority: issue.fields.priority?.name,
        status: issue.fields.status?.name,
        statusCategory: issue.fields.status?.statusCategory?.key,
        project: issue.fields.project?.key,
        dueDate: issue.fields.duedate,
        created: issue.fields.created,
        updated: issue.fields.updated,
        assignee: issue.fields.assignee?.displayName,
        assigneeAccountId: issue.fields.assignee?.accountId ?? null,
        reporter: issue.fields.reporter?.displayName,
        labels: issue.fields.labels ?? [],
        important,
        urgent,
        urgencySource,
        quadrant: placement?.quadrant ?? quadrant,
        quadrantOverridden: Boolean(placement) && placement.quadrant !== quadrant,
        position: placement?.position ?? null,
      };
    });

    // Within each quadrant: manually-ranked issues first (by position), then
    // everything else in the JQL's default order.
    const originalIndex = new Map(issues.map((issue, index) => [issue.key, index]));
    issues.sort((a, b) => {
      const aPos = a.position ?? Infinity;
      const bPos = b.position ?? Infinity;
      if (aPos !== bPos) return aPos - bPos;
      return originalIndex.get(a.key) - originalIndex.get(b.key);
    });

    res.json({ issues, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/issues/:key/transitions", requireAuth, async (req, res) => {
  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  try {
    const transitions = await getIssueTransitions({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      issueKey: req.params.key,
    });
    res.json({ transitions });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/issues/:key/transitions", requireAuth, async (req, res) => {
  const { transitionId } = req.body ?? {};
  if (!transitionId || typeof transitionId !== "string") {
    return res.status(400).json({ error: "transitionId is required" });
  }

  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  try {
    await transitionIssue({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      issueKey: req.params.key,
      transitionId,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/issues/:key/assignable-users", requireAuth, async (req, res) => {
  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    return res.json({ users: [] });
  }

  try {
    const users = await searchOrgUsers({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      query,
    });
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.put("/api/issues/:key/assignee", requireAuth, async (req, res) => {
  const { accountId } = req.body ?? {};
  if (accountId !== null && typeof accountId !== "string") {
    return res.status(400).json({ error: "accountId must be a string or null" });
  }

  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  try {
    await assignIssue({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      issueKey: req.params.key,
      accountId,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

// Widens an ISO instant to a YYYY-MM-DD date string, `deltaDays` away — used
// to pad the JQL worklogDate window, since that field is evaluated in Jira's
// site timezone rather than the browser's.
function jqlDateBound(iso, deltaDays) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

app.get("/api/worklogs", requireAuth, async (req, res) => {
  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  const { start, end } = req.query;
  if (typeof start !== "string" || typeof end !== "string") {
    return res.status(400).json({ error: "start and end are required" });
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return res.status(400).json({ error: "start and end must be valid ISO timestamps" });
  }

  try {
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${jqlDateBound(start, -1)}" AND worklogDate <= "${jqlDateBound(end, 1)}"`;

    const [rawIssues, myself] = await Promise.all([
      fetchAllIssues({
        baseUrl: settings.baseUrl,
        email: settings.email,
        apiToken: settings.apiToken,
        jql,
      }),
      getMyself({ baseUrl: settings.baseUrl, email: settings.email, apiToken: settings.apiToken }),
    ]);

    const perIssue = await Promise.all(
      rawIssues.map((issue) =>
        getIssueWorklogs({
          baseUrl: settings.baseUrl,
          email: settings.email,
          apiToken: settings.apiToken,
          issueKey: issue.key,
        }).then((worklogs) => ({ issue, worklogs })),
      ),
    );

    const worklogs = [];
    for (const { issue, worklogs: issueWorklogs } of perIssue) {
      for (const w of issueWorklogs) {
        if (w.authorAccountId !== myself.accountId) continue;
        const startedMs = Date.parse(w.started);
        if (Number.isNaN(startedMs) || startedMs < startMs || startedMs >= endMs) continue;
        worklogs.push({
          id: w.id,
          issueKey: issue.key,
          issueSummary: issue.fields.summary,
          issueType: issue.fields.issuetype?.name,
          issueTypeIconUrl: issue.fields.issuetype?.iconUrl,
          priority: issue.fields.priority?.name,
          priorityIconUrl: issue.fields.priority?.iconUrl,
          status: issue.fields.status?.name,
          project: issue.fields.project?.key,
          url: `${settings.baseUrl}/browse/${issue.key}`,
          started: w.started,
          timeSpentSeconds: w.timeSpentSeconds,
          comment: w.comment,
        });
      }
    }

    res.json({ worklogs });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/worklogs", requireAuth, async (req, res) => {
  const { issueKey, started, timeSpentSeconds, comment } = req.body ?? {};
  if (!issueKey || typeof issueKey !== "string") {
    return res.status(400).json({ error: "issueKey is required" });
  }
  if (!started || typeof started !== "string") {
    return res.status(400).json({ error: "started is required" });
  }
  if (!Number.isFinite(timeSpentSeconds) || timeSpentSeconds <= 0) {
    return res.status(400).json({ error: "timeSpentSeconds must be a positive number" });
  }

  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  try {
    await addWorklog({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      issueKey,
      started,
      timeSpentSeconds,
      comment,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.put("/api/worklogs/:issueKey/:worklogId", requireAuth, async (req, res) => {
  const { started, timeSpentSeconds, comment } = req.body ?? {};
  if (!started || typeof started !== "string") {
    return res.status(400).json({ error: "started is required" });
  }
  if (!Number.isFinite(timeSpentSeconds) || timeSpentSeconds <= 0) {
    return res.status(400).json({ error: "timeSpentSeconds must be a positive number" });
  }

  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  try {
    await updateWorklog({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      issueKey: req.params.issueKey,
      worklogId: req.params.worklogId,
      started,
      timeSpentSeconds,
      comment,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.delete("/api/worklogs/:issueKey/:worklogId", requireAuth, async (req, res) => {
  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  try {
    await deleteWorklog({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      issueKey: req.params.issueKey,
      worklogId: req.params.worklogId,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/issues/search", requireAuth, async (req, res) => {
  const settings = getJiraSettings(req.user.id);
  if (!settings) {
    return res.status(400).json({ error: "Configure your Jira connection in Settings first." });
  }

  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    return res.json({ issues: [] });
  }

  try {
    const issues = await searchIssuePicker({
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
      query,
    });
    res.json({ issues });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.put("/api/quadrants/:quadrant/order", requireAuth, (req, res) => {
  const { quadrant } = req.params;
  const { issueKeys } = req.body ?? {};

  if (!QUADRANTS.has(quadrant)) {
    return res.status(400).json({ error: "Invalid quadrant" });
  }
  if (!Array.isArray(issueKeys) || !issueKeys.every((key) => typeof key === "string")) {
    return res.status(400).json({ error: "issueKeys must be an array of strings" });
  }

  try {
    setQuadrantOrder(req.user.id, quadrant, issueKeys);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Time blocks are purely local planning data — never synced to Jira (there's
// no "planned time" concept in Jira's API) — so these follow the same
// local-data convention as /api/quadrants/:quadrant/order: validate, try/catch
// into a 400 on failure, no Jira round-trip.
app.get("/api/time-blocks", requireAuth, (req, res) => {
  const { start, end } = req.query;
  if (typeof start !== "string" || typeof end !== "string") {
    return res.status(400).json({ error: "start and end are required" });
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return res.status(400).json({ error: "start and end must be valid ISO timestamps" });
  }

  const blocks = listTimeBlocks(req.user.id, startMs, endMs);
  res.json({ blocks });
});

app.post("/api/time-blocks", requireAuth, (req, res) => {
  const { issueKey, title, notes, started, timeSpentSeconds } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  if (!started || typeof started !== "string") {
    return res.status(400).json({ error: "started is required" });
  }
  if (!Number.isFinite(timeSpentSeconds) || timeSpentSeconds <= 0) {
    return res.status(400).json({ error: "timeSpentSeconds must be a positive number" });
  }

  try {
    const block = createTimeBlock(req.user.id, { issueKey, title, notes, started, timeSpentSeconds });
    res.json({ ok: true, id: block.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/time-blocks/:id", requireAuth, (req, res) => {
  const { issueKey, title, notes, started, timeSpentSeconds } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  if (!started || typeof started !== "string") {
    return res.status(400).json({ error: "started is required" });
  }
  if (!Number.isFinite(timeSpentSeconds) || timeSpentSeconds <= 0) {
    return res.status(400).json({ error: "timeSpentSeconds must be a positive number" });
  }

  try {
    updateTimeBlock(req.user.id, req.params.id, { issueKey, title, notes, started, timeSpentSeconds });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/time-blocks/:id", requireAuth, (req, res) => {
  try {
    deleteTimeBlock(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Notes are purely local data (no Jira/Google round-trip), so this follows
// the same validate-then-400-on-failure convention as /api/time-blocks.
app.get("/api/notes", requireAuth, (req, res) => {
  res.json({ notes: listNotes(req.user.id) });
});

app.get("/api/notes/:id", requireAuth, (req, res) => {
  const note = getNote(req.user.id, req.params.id);
  if (!note) return res.status(400).json({ error: "Note not found" });
  res.json({ note });
});

app.post("/api/notes", requireAuth, (req, res) => {
  const { title, contentHtml } = req.body ?? {};
  try {
    const note = createNote(req.user.id, { title, contentHtml });
    res.json({ ok: true, id: note.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/notes/:id", requireAuth, (req, res) => {
  const { title, contentHtml } = req.body ?? {};
  try {
    updateNote(req.user.id, req.params.id, { title, contentHtml });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/notes/:id", requireAuth, (req, res) => {
  try {
    deleteNote(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/settings/google-calendar", requireAuth, (req, res) => {
  res.json(getGoogleCalendarSettingsPublic(req.user.id));
});

app.delete("/api/settings/google-calendar", requireAuth, (req, res) => {
  disconnectGoogleCalendar(req.user.id);
  res.json({ ok: true });
});

app.get("/api/google/connect", requireAuth, (req, res) => {
  try {
    const state = createOAuthState(req.user.id);
    res.redirect(getGoogleAuthUrl(state));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Redirect target registered with Google — not behind requireAuth. The
// user identity comes from the CSRF `state` token minted in /connect (tied
// to the session that started the flow), not from "whatever cookie happens
// to be on this request", which is the standard OAuth-callback pattern.
app.get("/api/google/callback", async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const redirect = (params) => res.redirect(`${clientUrl}/settings?${new URLSearchParams(params).toString()}`);

  const { code, state, error: oauthError } = req.query;
  if (oauthError) {
    return redirect({ googleCalendar: "error", message: String(oauthError) });
  }

  const userId = typeof state === "string" ? consumeOAuthState(state) : null;
  if (!userId) {
    return redirect({ googleCalendar: "error", message: "Invalid or expired connection attempt. Please try again." });
  }
  if (typeof code !== "string") {
    return redirect({ googleCalendar: "error", message: "Google did not return an authorization code." });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    saveGoogleTokens(userId, tokens);
    redirect({ googleCalendar: "connected" });
  } catch (err) {
    redirect({ googleCalendar: "error", message: err.message });
  }
});

app.get("/api/calendar-events", requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (typeof start !== "string" || typeof end !== "string") {
    return res.status(400).json({ error: "start and end are required" });
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return res.status(400).json({ error: "start and end must be valid ISO timestamps" });
  }

  try {
    const events = await fetchCalendarEvents(req.user.id, startMs, endMs);
    if (events === null) {
      return res
        .status(400)
        .json({ error: "Connect your Google Calendar in Settings first.", needsSetup: true });
    }
    res.json({ events });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Cockpit server listening on http://localhost:${PORT}`);
});
