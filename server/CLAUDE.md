# server/

## Purpose

The Express API — the sole backend for the client SPA. Owns auth, all
Jira integration, the Google Calendar OAuth integration, and every local
SQLite table.

## Ownership

All of `server/src/`, including `src/scripts/` (two small one-off CLI
utilities — `createUser.js`, `generateKey.js` — not a durable boundary of
their own, so no separate child doc).

## Local Contracts

- **One flat `index.js`** — every route is registered directly on `app`,
  no router modules or sub-apps. New routes are added inline, grouped next
  to the existing routes for the same resource (worklog routes together,
  time-block routes together, etc.).
- **Auth**: every protected route takes `requireAuth` (`auth.js`) as its
  second argument. It resolves the `sid` cookie → session → sets `req.user
  = {id, username}`, or responds 401.
- **Status-code convention**: 401 only ever comes from `requireAuth`. 400
  is for bad/missing request params, and for purely-local-data validation
  failures (quadrant order, time blocks) — pattern: `try {...} catch (err)
  { res.status(400).json({error: err.message}) }`. 502 is specifically for
  upstream Jira/Google failures — pattern: `console.error(err)` then
  `res.status(502).json({error: err.message})`. Reads return `res.json({
  <namedKey>: data})`; writes return `res.json({ok: true})` (plus an `id`
  when the caller needs one back).
- **Data-access modules**: one file per resource (`settings.js`,
  `overrides.js`, `timeBlocks.js`, `googleCalendar.js`, `notes.js`), each exporting
  plain functions taking `userId` first. Raw `better-sqlite3` prepared
  statements (`db.prepare(...).get/all/run(...)`) — no ORM. Upserts use
  `INSERT ... ON CONFLICT(pk) DO UPDATE SET col = excluded.col`. Batch
  writes wrap in `db.transaction(...)`.
- **DB migrations** (`db.js`): base schema lives in one `CREATE TABLE IF
  NOT EXISTS` block. Additive column changes: `PRAGMA table_info(table)`
  check + `ALTER TABLE ... ADD COLUMN`. A destructive rebuild (drop +
  recreate) is only acceptable when the old data is provably unusable
  under the new shape — e.g. done once when Google Calendar moved from a
  secret-ICS-URL to OAuth tokens, since the old encrypted URL couldn't be
  converted into OAuth tokens regardless. Never drop data that's still
  meaningful under the new schema.
- **Notes** (`notes.js`): free-form rich-text notes, one row per note,
  scoped by `user_id` like every other table. Content is authored via a
  hand-rolled contentEditable editor on the client (`NoteEditor.tsx`) and
  arrives as untrusted HTML — `notes.js` sanitizes it through
  `sanitize-html` (allowlisted tags/attributes) on every create/update
  before it touches SQLite, so every read is safe by construction. This is
  the one dependency exception to the "hand-roll, don't add a UI library"
  preference (see root `CLAUDE.md`) — it's a security boundary, not an
  interaction.
- **Multi-tenancy extension point**: every table (including `notes`) is
  scoped by `user_id`, never by a per-table `tenant_id` — don't add one
  preemptively to a new table. When real multi-tenancy (orgs above users)
  is built, the intended extension is a `tenants` table + `tenant_id` FK
  on `users` only; isolation for every existing/future child table already
  flows through `user_id → users.tenant_id`, so no other table needs to
  change.
- **Encryption at rest** (`crypto.js`): `encrypt`/`decrypt`, AES-256-GCM,
  key from `ENCRYPTION_KEY` (asserted at process boot — exits if missing).
  This is the *only* mechanism for any secret stored in SQLite (Jira API
  token, Google OAuth access + refresh tokens). Never store a secret in
  plaintext; never log a decrypted secret.
- **Jira integration** (`jira.js`): every call is a template-literal
  `${baseUrl}/rest/api/3/...` request, Basic auth built from the per-user
  `email` + `apiToken` via a shared `authHeaders()` helper. Every function
  throws `new Error("... failed (<status>): <body text>")` on `!res.ok`.
  Two distinct pagination shapes exist — don't conflate them:
  `fetchAllIssues` uses `nextPageToken`/`isLast` (the `/search/jql` shape);
  `getIssueWorklogs` uses `startAt`/`maxResults`/`total` (the worklog-list
  shape). ADF comment encode/decode helpers (`textToAdf`/`adfToText`) are
  local to this file.
- **Google Calendar integration** — OAuth2 only (`googleAuth.js` +
  `googleCalendar.js`). The earlier secret-ICS-URL approach (and its
  `node-ical` dependency) was fully removed, not kept as a fallback.
  Access tokens auto-refresh via `ensureValidAccessToken()` (60s safety
  margin before real expiry) using the stored refresh token.
  `events.list` is always called with `singleEvents=true`, so Google
  expands recurring events server-side — there is no RRULE-expansion code
  anywhere in this codebase. OAuth CSRF `state` tokens live in an
  in-memory `Map` (`googleAuth.js`'s `pendingStates`, 10-minute TTL) — this
  is only safe because the app is single-process; a multi-instance deploy
  would need a real shared store instead.
- **Required vs. optional config**: `ENCRYPTION_KEY` is mandatory,
  asserted at boot. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
  `GOOGLE_REDIRECT_URI` are optional — checked lazily inside
  `googleAuth.js`'s `getConfig()`, not at boot — and their absence only
  disables the Google Calendar feature specifically. Callers already treat
  "Google Calendar not connected" as a normal, non-error state (e.g.
  `fetchCalendarEvents` returns `null` for "not connected" vs. `[]` for
  "connected, nothing in range" — preserve that distinction in new code).

## Work Guidance

- Follow the nearest existing route/module as the template for a new one.
  This codebase has never introduced a new abstraction layer (router
  files, an ORM, service classes) partway through — keep additions flat
  and consistent with what's already here.
- Any new per-user secret: goes through `crypto.js`, gets its own
  migration in `db.js`, and exposes a `*Public()` read that never returns
  the secret itself (see `getJiraSettingsPublic`,
  `getGoogleCalendarSettingsPublic` as the pattern).

## Verification

- `node --check src/<file>.js` after editing any server file — catches
  syntax errors immediately, cheaper than waiting for `node --watch`'s
  restart.
- Confirm the dev server (`npm run dev` from repo root) restarts cleanly,
  then `curl` the changed route and confirm a 401 (unauthenticated) rather
  than a 500/crash, before considering a server change done.

## Child DOX Index

None.
