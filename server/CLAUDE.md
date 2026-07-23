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
  = {id, username, tenantId, tenantName, role}`, or responds 401. Admin-only
  routes chain `requireAdmin` right after it as a third argument.
- **Status-code convention**: 401 only ever comes from `requireAuth`. 403
  only ever comes from `requireAdmin` (an authenticated request, just not
  permitted to do this particular thing). 400 is for bad/missing request
  params, and for purely-local-data validation failures (quadrant order,
  time blocks) — pattern: `try {...} catch (err) {
  res.status(400).json({error: err.message}) }`. 502 is specifically for
  upstream Jira/Google failures — pattern: `console.error(err)` then
  `res.status(502).json({error: err.message})`. Reads return `res.json({
  <namedKey>: data})`; writes return `res.json({ok: true})` (plus an `id`
  when the caller needs one back).
- **Data-access modules**: one file per resource (`settings.js`,
  `overrides.js`, `timeBlocks.js`, `googleCalendar.js`, `notes.js`,
  `admin.js`), each exporting `async` functions taking `userId` first
  (`admin.js`'s functions take `tenantId` first instead — see the Roles
  bullet below for why that's the correct scoping key there). Raw `pg`
  queries (`await db.query(sql, params)`, `$1/$2/...` positional
  placeholders) — no ORM. Upserts use `INSERT ... ON CONFLICT (pk) DO
  UPDATE SET col = EXCLUDED.col`. Multi-statement writes that must be
  atomic (see `setQuadrantOrder` in `overrides.js`) check out a client
  explicitly (`await db.connect()`) and wrap in `BEGIN`/`COMMIT`/`ROLLBACK`
  — `db.query` on the shared pool does *not* give you a transaction, since
  each call may run on a different pooled connection.
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
- **DB schema** (`db.js`): a base `CREATE TABLE IF NOT EXISTS` block, run
  via top-level `await` at import time (so `import "./db.js"` alone is
  enough to initialize the schema — no separate init call needed
  elsewhere), followed by any migrations against a database that may
  already have rows in it (see the tenants/`tenant_id` migration below).
  Additive column changes: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
  (native to Postgres — no existence-check query needed first, unlike the
  old SQLite `PRAGMA table_info` pattern); backfill any NULLs a `NOT NULL`
  column needs before setting the constraint. A destructive rebuild (drop +
  recreate) is only acceptable when the old data is provably unusable
  under the new shape. Never drop data that's still meaningful under the
  new schema.
- **Notes** (`notes.js`): free-form rich-text notes, one row per note,
  scoped by `user_id` like every other table. Content is authored via a
  hand-rolled contentEditable editor on the client (`NoteEditor.tsx`) and
  arrives as untrusted HTML — `notes.js` sanitizes it through
  `sanitize-html` (allowlisted tags/attributes) on every create/update
  before it touches Postgres, so every read is safe by construction. This is
  the one dependency exception to the "hand-roll, don't add a UI library"
  preference (see root `CLAUDE.md`) — it's a security boundary, not an
  interaction.
- **Multi-tenancy** (`tenants` table + `users.tenant_id`, implemented):
  tenants are an isolation/account boundary only, not a shared workspace —
  every user's data (Jira connection, notes, time blocks, etc.) stays
  exactly as personal as it was pre-multi-tenancy. No child table (`notes`
  included) references `tenant_id` directly or ever should; isolation for
  every existing/future child table flows through `user_id →
  users.tenant_id`, so adding a new resource table never needs a
  `tenant_id` column of its own.
  - **Signup, not install**: `POST /api/signup` (`index.js`) replaced the
    old one-time-forever `/api/install` gate. It's always available (no
    `hasAnyUsers()`-style check) and creates a brand-new tenant + its first
    user together, atomically — see `createTenantWithFirstUser` in
    `auth.js`, which checks out a client and wraps both INSERTs in one
    transaction (same pattern as `setQuadrantOrder` in `overrides.js`) so a
    username collision on the second INSERT can't leave an orphaned,
    user-less tenant behind.
  - **The tenant is never user-named at signup** — the form is just
    username/password, identical to the old install screen.
    `createTenantWithFirstUser` auto-names it `"<username>'s workspace"`,
    the exact same convention the backfill migration below uses. This was
    a deliberate simplification after the first pass exposed an org-name
    field: with no tenant-level features built yet (no shared settings, no
    admin view, no billing), asking for an org name at signup was pure
    friction with no payoff. If a real user-facing "organization" concept
    (rename, multiple users self-joining one org, etc.) gets built later,
    surface the name then — don't reintroduce the field preemptively.
  - **`username` is globally unique, not per-tenant.** Deliberate
    simplification: per-tenant uniqueness would mean the same username
    could exist in two different orgs, which requires a tenant-selector
    step at login (subdomain, org slug, or similar) to resolve which
    account you mean — real added UX complexity this app doesn't need.
    Login (`verifyCredentials`) still looks up by `username` alone.
  - **Backfill migration** (`db.js`): `users.tenant_id` is added as
    `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (nullable), then every
    existing user with a NULL `tenant_id` is backfilled into their own
    brand-new one-person tenant (named `"<username>'s workspace"`) before
    the column is set `NOT NULL`. This runs at every boot and is
    idempotent — a second run finds zero NULL rows and the final
    `ALTER COLUMN ... SET NOT NULL` is a no-op if already set. Deliberately
    *not* a shared "default tenant" for every pre-existing user — that
    would merge unrelated accounts' isolation boundary together, which is
    exactly what this migration exists to avoid.
  - **CLI parity** (`scripts/createUser.js`): prompts for an organization
    name in addition to username/password, and calls
    `findOrCreateTenantByName` (`auth.js`) — an exact, case-sensitive name
    match against `tenants.name` (no unique constraint on that column, so a
    typo creates a second org rather than erroring; acceptable for a
    human-run one-off tool). This lets an admin either add a second user to
    an existing org or spin up a new one, alongside in-app self-service
    signup. Role follows the same rule as everywhere else: brand-new org →
    `admin`, existing org → `member`.
  - **Roles** (`users.role`, `'admin' | 'member'`, exported as the `ROLES`
    set from `auth.js`): scoped per-tenant, not global — there is no
    superuser role that spans tenants. Whoever is the FIRST user of a
    tenant is always its admin (`createTenantWithFirstUser` sets it
    explicitly; the CLI does the same when `findOrCreateTenantByName`
    reports a brand-new org). Everyone added to an *existing* tenant
    (CLI, or the Admin page's "Add user") starts as a plain `member` —
    promote them afterward if they should also manage users. `requireAdmin`
    (`auth.js`, chained after `requireAuth`) gates every `/api/admin/*`
    route with a 403 (not 401 — see the status-code convention above) for
    a non-admin. An admin's power is scoped to their *own* tenant's roster
    only (`server/src/admin.js` filters every query by `tenant_id`) — they
    never gain visibility into another user's Jira connection, notes, or
    time blocks; "admin" is strictly about managing the user list, not a
    backdoor into other users' data.
  - **Invariant: a tenant with users always has an admin.** Enforced in two
    places: `setUserRole` (`admin.js`) refuses to demote the tenant's last
    admin to `member`, and `deleteAccount` (`auth.js`) refuses to let the
    last admin delete their own account while teammates still exist (if
    they're the last admin *and* the last user, deletion proceeds normally
    — the tenant just becomes empty). Both checks use
    `COUNT(*) FILTER (WHERE role = 'admin')` scoped to the same tenant,
    excluding the target row.
  - **Self-service account deletion** (`DELETE /api/account`,
    `deleteAccount` in `auth.js`): requires re-entering the current
    password even though the request is already authenticated — the
    session cookie only proves *a* request came from this browser, not
    that whoever's at the keyboard right now genuinely means to
    permanently destroy the account, so it's an intentional second check.
    "Incorrect password" is a 400 (a validation failure), not a 401 — 401
    is reserved for `requireAuth` per the status-code convention above.
    Deletes only the `users` row; every child table cascades from there
    (`sessions`, `jira_settings`, `quadrant_overrides`, `time_blocks`,
    `google_calendar_settings`, `notes`) via the existing `ON DELETE
    CASCADE` FKs — no new cleanup code needed. Deliberately does *not*
    delete the user's `tenants` row: if a teammate shares that tenant (via
    `scripts/createUser.js` or the Admin page), deleting one account must
    never take the other down with it. An orphaned tenant with zero users
    is harmless — tenants are never listed or exposed anywhere.
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
