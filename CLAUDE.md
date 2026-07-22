# DOX framework

- DOX is a lightweight CLAUDE.md hierarchy installed here (see [github.com/agent0ai/dox](https://github.com/agent0ai/dox))
- Agent must follow DOX instructions across any edits

## Core Contract

- CLAUDE.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable CLAUDE.md plus every parent CLAUDE.md above it

## Read Before Editing

1. Read this root CLAUDE.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every CLAUDE.md found along each route
5. If a parent CLAUDE.md lists a child CLAUDE.md whose scope contains the path, read that child and continue from there
6. Use the nearest CLAUDE.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning CLAUDE.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- CLAUDE.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root CLAUDE.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child CLAUDE.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child CLAUDE.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

---

# Cockpit

A personal, single-user, Jira-integrated productivity app. Started as an
Eisenhower matrix over a saved JQL filter; has grown into seven views over
the same Jira connection plus an optional Google Calendar overlay.
`README.md`
in this directory covers the user-facing feature list and setup steps; this
file and its child docs own development conventions and architecture.

## Tech stack

- `client/` — React 19 + Vite + TypeScript SPA, Tailwind CSS v4, shadcn
  "base-nova" style over `@base-ui/react` primitives (not Radix). See
  `client/CLAUDE.md`.
- `server/` — Express API (ESM, Node 18+), PostgreSQL for storage via `pg`
  (node-postgres), no ORM. See `server/CLAUDE.md`.
- Two external integrations, both per-user and optional except Jira: Jira
  Cloud REST API v3 (Basic auth, email + API token) and Google Calendar
  (OAuth2, read-only).

## Dev workflow

- `npm run dev` from the repo root — runs both `server` (`node --watch
  src/index.js`, port 8787) and `client` (Vite, port 5173) via
  `concurrently`. Vite proxies `/api` to the server (see
  `client/vite.config.ts`). This needs a reachable Postgres — either
  `docker compose up db` (just the database service) or your own local
  install — and `DATABASE_URL` set in `server/.env` pointing at it.
- First-time setup: `cp server/.env.example server/.env`, set
  `DATABASE_URL`, then `npm run generate-key` from `server/` for
  `ENCRYPTION_KEY`. Google Calendar env vars are optional — only needed to
  use that one feature.
- `docker compose up --build` from the repo root runs the whole app
  (Postgres + a production-style build of client+server in one container,
  see root `Dockerfile`) — needs a root `.env` (`cp .env.example .env`
  first). This is a separate, deployable path from `npm run dev`; day-to-day
  development still uses `npm run dev` for hot reload.
- No test suite exists. Verification is `tsc --noEmit` (client) and `node
  --check <file>` (server) plus manually exercising the changed route/page —
  see the child docs' Verification sections.

## User Preferences

- Prefer hand-rolling interactions on the existing Tailwind/base-ui
  primitives over adding a new UI dependency, even for non-trivial
  interactions (autocomplete, tabs, and the calendar drag/resize/create
  gestures were all built from scratch rather than pulling in `cmdk`,
  a calendar library, etc.). A new dependency needs a real justification
  (e.g. `node-ical` was added, then removed again once the Google Calendar
  integration moved from ICS parsing to the OAuth API, which expands
  recurring events server-side and made the parsing library unnecessary).
  The one recurring exception is a security boundary rather than an
  interaction: `sanitize-html` (server-side) was added for Notes because
  hand-rolling an HTML allowlist sanitizer for untrusted contentEditable
  output is a correctness-critical parsing problem, not a UI gesture — the
  editor itself still stays dependency-free.
- Reuse existing feature components across pages instead of forking
  near-duplicates: `IssueCard` (built for the matrix) is reused as-is in
  Kanban; `WorklogEditor` (built for Time Logger) is reused for the
  "log this meeting/task-block as a worklog" actions on Time Blocking
  (both `CalendarEventBlock` and `PlannedBlock` open it, pre-filled).
- For a genuine architectural fork (sync target, data model, auth
  approach), ask one tight clarifying question with concrete tradeoffs
  rather than assuming — but keep it to the real fork, not everything that
  could be asked. Once resolved, iterate fast without re-litigating it.
- Keep decorative color usage disciplined: reuse the one validated 8-hue
  categorical palette everywhere a "distinct but not semantically
  meaningful" color is needed (Jira labels, calendar blocks, Home tiles);
  never invent ad hoc colors and never reuse the status-semantic hues
  (tied to Jira priority/status) for decoration.

## Child DOX Index

- `client/CLAUDE.md` — the React SPA: routing, page-shell conventions, data
  fetching, styling/color system, the two drag mechanisms, calendar grid
  math shared between Time Logger and Time Blocking.
- `server/CLAUDE.md` — the Express API: route conventions, per-resource
  data-access modules, DB migration pattern, encryption-at-rest, Jira and
  Google Calendar integration conventions.
