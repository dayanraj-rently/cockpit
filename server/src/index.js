import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  createTenantWithFirstUser,
  deleteAccount,
  deleteSession,
  requireAdmin,
  requireAuth,
  sessionCookieOptions,
  verifyCredentials,
} from "./auth.js";
import { listTenantUsers, addTenantUser, removeTenantUser, setUserRole } from "./admin.js";

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

// Signup is always available — not a one-time gate — since any number of
// independent tenants can be created on this one deployment. Each call
// creates a brand-new tenant plus its first user, atomically (see
// createTenantWithFirstUser in auth.js). The tenant itself is never
// user-named — signup is just username/password, same as before
// multi-tenancy existed; createTenantWithFirstUser auto-names it from the
// username.
app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  let result;
  try {
    result = await createTenantWithFirstUser(username.trim(), password);
  } catch (err) {
    // Postgres unique-violation on users.username (globally unique — see
    // auth.js verifyCredentials comment for why it's not per-tenant).
    if (err.code === "23505") {
      return res.status(400).json({ error: "Username already taken" });
    }
    console.error(err);
    return res.status(400).json({ error: "Could not create account" });
  }

  const session = await createSession(result.userId);
  res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions());
  res.json({ username: username.trim(), tenantName: result.tenantName, role: result.role });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const user = await verifyCredentials(username, password);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions());
  res.json({ username: user.username, tenantName: user.tenantName, role: user.role });
});

app.post("/api/auth/logout", async (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (sessionId) await deleteSession(sessionId);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username, tenantName: req.user.tenantName, role: req.user.role });
});

// Password re-entry, not just the session cookie, is required here — the
// cookie only proves *a* request came from the logged-in browser, not that
// the person at the keyboard right now genuinely means to permanently
// destroy their account. "Incorrect password" is a validation failure like
// any other bad input, not an auth failure, so it's a 400 — 401 is
// reserved for requireAuth (see server/CLAUDE.md's status-code convention).
app.delete("/api/account", requireAuth, async (req, res) => {
  const { password } = req.body ?? {};
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  try {
    await deleteAccount(req.user.id, password);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// Admin routes: every one scoped to req.user.tenantId, never a global user
// list — an admin manages their own tenant's roster only, never another
// tenant's. requireAdmin (chained after requireAuth) rejects non-admins
// with 403.
app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  res.json({ users: await listTenantUsers(req.user.tenantId) });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    await addTenantUser(req.user.tenantId, username.trim(), password);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Username already taken" });
    }
    return res.status(400).json({ error: err.message });
  }
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await removeTenantUser(req.user.tenantId, req.params.id, req.user.id);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json({ ok: true });
});

app.put("/api/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body ?? {};
  try {
    await setUserRole(req.user.tenantId, req.params.id, role);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json({ ok: true });
});

app.get("/api/settings/jira", requireAuth, async (req, res) => {
  res.json(await getJiraSettingsPublic(req.user.id));
});

app.put("/api/settings/jira", requireAuth, async (req, res) => {
  const { baseUrl, email, apiToken, jql } = req.body ?? {};
  try {
    await upsertJiraSettings(req.user.id, { baseUrl, email, apiToken, jql });
    res.json(await getJiraSettingsPublic(req.user.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/issues", requireAuth, async (req, res) => {
  const settings = await getJiraSettings(req.user.id);
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

    const placements = await getPlacements(req.user.id);

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
  const settings = await getJiraSettings(req.user.id);
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

  const settings = await getJiraSettings(req.user.id);
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
  const settings = await getJiraSettings(req.user.id);
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

  const settings = await getJiraSettings(req.user.id);
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
  const settings = await getJiraSettings(req.user.id);
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

  const settings = await getJiraSettings(req.user.id);
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

  const settings = await getJiraSettings(req.user.id);
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
  const settings = await getJiraSettings(req.user.id);
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
  const settings = await getJiraSettings(req.user.id);
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

app.put("/api/quadrants/:quadrant/order", requireAuth, async (req, res) => {
  const { quadrant } = req.params;
  const { issueKeys } = req.body ?? {};

  if (!QUADRANTS.has(quadrant)) {
    return res.status(400).json({ error: "Invalid quadrant" });
  }
  if (!Array.isArray(issueKeys) || !issueKeys.every((key) => typeof key === "string")) {
    return res.status(400).json({ error: "issueKeys must be an array of strings" });
  }

  try {
    await setQuadrantOrder(req.user.id, quadrant, issueKeys);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Time blocks are purely local planning data — never synced to Jira (there's
// no "planned time" concept in Jira's API) — so these follow the same
// local-data convention as /api/quadrants/:quadrant/order: validate, try/catch
// into a 400 on failure, no Jira round-trip.
app.get("/api/time-blocks", requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (typeof start !== "string" || typeof end !== "string") {
    return res.status(400).json({ error: "start and end are required" });
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return res.status(400).json({ error: "start and end must be valid ISO timestamps" });
  }

  const blocks = await listTimeBlocks(req.user.id, startMs, endMs);
  res.json({ blocks });
});

app.post("/api/time-blocks", requireAuth, async (req, res) => {
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
    const block = await createTimeBlock(req.user.id, { issueKey, title, notes, started, timeSpentSeconds });
    res.json({ ok: true, id: block.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/time-blocks/:id", requireAuth, async (req, res) => {
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
    await updateTimeBlock(req.user.id, req.params.id, { issueKey, title, notes, started, timeSpentSeconds });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/time-blocks/:id", requireAuth, async (req, res) => {
  try {
    await deleteTimeBlock(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Notes are purely local data (no Jira/Google round-trip), so this follows
// the same validate-then-400-on-failure convention as /api/time-blocks.
app.get("/api/notes", requireAuth, async (req, res) => {
  res.json({ notes: await listNotes(req.user.id) });
});

app.get("/api/notes/:id", requireAuth, async (req, res) => {
  const note = await getNote(req.user.id, req.params.id);
  if (!note) return res.status(400).json({ error: "Note not found" });
  res.json({ note });
});

app.post("/api/notes", requireAuth, async (req, res) => {
  const { title, contentHtml } = req.body ?? {};
  try {
    const note = await createNote(req.user.id, { title, contentHtml });
    res.json({ ok: true, id: note.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/notes/:id", requireAuth, async (req, res) => {
  const { title, contentHtml } = req.body ?? {};
  try {
    await updateNote(req.user.id, req.params.id, { title, contentHtml });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    await deleteNote(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/settings/google-calendar", requireAuth, async (req, res) => {
  res.json(await getGoogleCalendarSettingsPublic(req.user.id));
});

app.delete("/api/settings/google-calendar", requireAuth, async (req, res) => {
  await disconnectGoogleCalendar(req.user.id);
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
    await saveGoogleTokens(userId, tokens);
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

// Production only: serves the built client SPA alongside the API. In local
// dev, client/dist doesn't exist (Vite's dev server + proxy handles the
// client instead), so this is a no-op and nothing here runs. The regex
// excludes anything under /api so it can never shadow a real API route,
// regardless of route registration order.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Cockpit server listening on http://localhost:${PORT}`);
});
