# server/

## Purpose

The Express API — the sole backend for the client SPA. Owns auth, all
Jira integration, the Google Calendar OAuth integration, and every table in
the PostgreSQL database.

## Ownership

All of `server/src/`, including `src/scripts/` (two small one-off CLI
utilities — `createUser.js`, `generateKey.js` — not a durable boundary of
their own, so no separate child doc). Any script here that imports `db.js`
(directly or via `auth.js`/a data-access module) must call `process.exit(0)`
on success — a `pg.Pool` keeps idle connections open, so unlike the old
synchronous `better-sqlite3` handle, the process won't exit on its own once
the script's work is done.

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
  `overrides.js`, `timeBlocks.js`, `googleCalendar.js`, `notes.js`), each
  exporting `async` functions taking `userId` first. Raw `pg` queries
  (`await db.query(sql, params)`, `$1/$2/...` positional placeholders) — no
  ORM. Upserts use `INSERT ... ON CONFLICT (pk) DO UPDATE SET col =
  EXCLUDED.col`. Multi-statement writes that must be atomic (see
  `setQuadrantOrder` in `overrides.js`) check out a client explicitly
  (`await db.connect()`) and wrap in `BEGIN`/`COMMIT`/`ROLLBACK` — `db.query`
  on the shared pool does *not* give you a transaction, since each call may
  run on a different pooled connection.
- **Async is load-bearing everywhere**: every data-access function is
  `async`, so every route calling one must be too, with the call `await`ed.
  `requireAuth` itself is async (it queries the session) and catches its
  own errors into a 500 — Express 4 does not auto-catch a rejected async
  middleware/handler the way Express 5 does, so any new async route needs
  its own try/catch around DB calls if it wants a clean error response
  instead of a hung request.
- **BIGINT columns**: `started_at_ms` (`time_blocks`) and `token_expiry_ms`
  (`google_calendar_settings`) are epoch milliseconds and must stay
  `BIGINT` — Postgres's `INTEGER` is 32-bit and overflows for any
  millisecond timestamp since ~1970. `pg` returns `BIGINT` values as JS
  strings (to avoid silent precision loss), not numbers — wrap in `Number()`
  before doing arithmetic on one (see `ensureValidAccessToken` in
  `googleCalendar.js`).
- **DB schema** (`db.js`): one `CREATE TABLE IF NOT EXISTS` block, run via
  top-level `await` at import time (so `import "./db.js"` alone is enough
  to initialize the schema — no separate init call needed elsewhere).
  Additive column changes going forward: `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS ...` (native to Postgres — no existence-check query needed first,
  unlike the old SQLite `PRAGMA table_info` pattern). A destructive rebuild
  (drop + recreate) is only acceptable when the old data is provably
  unusable under the new shape. Never drop data that's still meaningful
  under the new schema.
- **Notes** (`notes.js`): free-form rich-text notes, one row per note,
  scoped by `user_id` like every other table. Content is authored via a
  hand-rolled contentEditable editor on the client (`NoteEditor.tsx`) and
  arrives as untrusted HTML — `notes.js` sanitizes it through
  `sanitize-html` (allowlisted tags/attributes) on every create/update
  before it touches Postgres, so every read is safe by construction. This is
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
  This is the *only* mechanism for any secret stored in Postgres (Jira API
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
- **Required vs. optional config**: `DATABASE_URL` and `ENCRYPTION_KEY` are
  mandatory, both asserted at boot (`db.js` exits immediately if
  `DATABASE_URL` is missing, before any schema/table code runs).
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` are
  optional — checked lazily inside `googleAuth.js`'s `getConfig()`, not at
  boot — and their absence only disables the Google Calendar feature
  specifically. Callers already treat "Google Calendar not connected" as a
  normal, non-error state (e.g. `fetchCalendarEvents` returns `null` for
  "not connected" vs. `[]` for "connected, nothing in range" — preserve
  that distinction in new code).
- **Production static serving** (`index.js`, bottom of the file, right
  before `app.listen`): if `../../client/dist` exists relative to
  `src/index.js` (i.e. a sibling `client/dist`), the server serves it via
  `express.static` plus a SPA-fallback route (regex-excluded from `/api`,
  so it can never shadow an API route regardless of registration order).
  This only exists in the Docker image (see root `Dockerfile`, which builds
  the client into that exact path) — local `npm run dev` has no
  `client/dist`, so this block is a no-op and Vite's dev-server proxy
  handles the client as always.

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
- For anything touching `db.js` or a data-access module: also run `docker
  compose up --build` from the repo root and confirm the `app` service
  boots against the real Postgres container (not just that the code
  syntax-checks) — async/pg mistakes (missing `await`, wrong placeholder
  syntax) surface as runtime errors, not build-time ones.

## Child DOX Index

None.
