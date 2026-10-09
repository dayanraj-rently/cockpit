# Cockpit

Personal, Jira-integrated productivity dashboard. Multi-tenant: any number
of independent organizations can sign up on one deployment, each with any
number of users, but every user's own Jira connection, notes, and time
blocks stay exactly as personal and isolated as they'd be in a true
single-user install. Seven views over one saved JQL filter per user, an
OKRs page synced into a Jira project of your choice (plus an admin-only
page for managing your organization's users), and an optional read-only
Google Calendar overlay.

> Development conventions and architecture live in `CLAUDE.md` (and the
> `CLAUDE.md` in `client/`, `client/src/components/ui/`, and `server/`).
> This file is the practical "what it does and how to run it" doc.

Every page has a **Take a tour** button (the `?` icon next to the theme
toggle) that spotlights that page's own non-obvious bits — Home's tour
walks through what each tile does, and each other page's tour covers just
its own tricky parts (drag-to-reorder, click-drag-to-log-time, and so on).
Purely on-demand: nothing pops up on its own, and nothing about whether
you've seen it before is ever remembered.

## Features

- **Eisenhower Matrix** (`/matrix`) — a 2×2 board (Do First / Schedule /
  Delegate / Eliminate) computed from each issue's priority and due date;
  drag a card to override its quadrant, or edit assignee/status inline.
- **Issues** (`/issues`) — a plain, sortable table of every ticket your
  JQL returns.
- **Kanban Board** (`/kanban`) — one column per Jira status; drag a card
  to a different column to fire the real Jira workflow transition.
- **Time Logger** (`/time-logger`) — a weekly calendar for real Jira
  worklogs: click-drag to create one, drag to move/resize, click to
  edit or delete.
- **Time Blocking** (`/time-blocking`) — a weekly calendar for planning
  your own time. Entries are local only (never synced to Jira) and can
  optionally link to a Jira issue. If Google Calendar is connected, your
  meetings show up read-only alongside your plans, each with a one-click
  button to log that meeting's time as a real Jira worklog.
- **Notes** (`/notes`) — free-form rich-text notes (bold/italic/underline,
  headings, lists, links), local only, unrelated to Jira.
- **OKRs** (`/okrs`) — quarterly objectives, each with key results that
  are a metric (start → target, current value; decreasing targets work
  too), a done/not-done milestone, or a Jira query (progress = share of
  matching issues that are done, re-counted each time you open the
  quarter). Progress rolls up from key results to the objective. **Check
  in** on a key result to log a new value with a note (also posted as a
  comment on its Jira issue); every progress change is kept, shown as a
  small trend line on each key result and as a full history in the
  check-in dialog. Every objective and key result is also created
  as an issue in the Jira project picked under Settings → OKR Sync
  (objective = parent issue, key results = its children, labelled `okr` and
  `okr-<year>-Q<n>`), kept up to date on every edit, and moved to Done when
  it reaches 100%. Sync is one way: edit OKRs in Cockpit, not in Jira. If a
  push to Jira fails, your edit is still saved and the item shows a
  **Retry sync** button.
- **Settings** (`/settings`) — tabbed: **Jira Connection** (base URL,
  account email, API token, JQL), **OKR Sync** (Jira project + issue types
  for objectives and key results), **Google Calendar** (optional OAuth
  connect/disconnect), and **Account** (permanently delete your account and
  all its data, password-confirmed).
- **Admin** (`/admin`, admins only) — add or remove users in your own
  organization, and promote/demote them between admin and member. Not
  visible at all to regular members (no launcher tile, and the route
  itself redirects away).

## Setup

Needs a PostgreSQL database, either way — pick one of the two paths below.

### Option A: Docker Compose (runs everything, Postgres + the app)

1. `cp .env.example .env` (repo root), set `POSTGRES_PASSWORD`, and set
   `ENCRYPTION_KEY` — generate one with `npm run generate-key` from
   `server/` (works without Docker running).
2. `docker compose up --build` — builds a production-style client+server
   image and starts it alongside Postgres. Open http://localhost:8787.
3. Continue with "Then, either way" below.

### Option B: `npm run dev` (local Node, hot reload)

1. `cp server/.env.example server/.env`.
2. Get a Postgres reachable at the `DATABASE_URL` in `server/.env` — either
   `docker compose up db` (just the database service) or your own local
   install — then set `DATABASE_URL` to match.
3. From `server/`, run `npm run generate-key` and paste the output in as
   `ENCRYPTION_KEY` in `server/.env`. This key encrypts every stored secret
   (Jira API token, Google OAuth tokens) at rest — losing or changing it
   makes previously saved ones undecryptable.
4. `npm run dev` from the repo root — starts the API on `:8787` and the
   Vite dev server on `:5173` (open that one in the browser).

### Then, either way

1. Open the app — you'll land on the login screen. Click **Create one** to
   sign up: pick a username and password (exactly like the old one-time
   install screen). Behind the scenes this creates a brand-new, fully
   isolated account for you — signing up again with a different username
   creates a second, completely separate one on the same deployment; there
   is no "organization" concept to fill in or think about. (To add a
   *second* user to your *same* account/isolation boundary instead, use
   `npm run create-user` from `server/` — see "Auth & credential notes"
   below.)
2. Log in, open **Settings → Jira Connection**, and fill in your Jira base
   URL, account email, an API token (generate one at
   https://id.atlassian.com/manage-profile/security/api-tokens), and the
   JQL query behind every feature above except the local half of Time
   Blocking. Nothing else loads until this is filled in.
3. *(Optional)* For meetings on Time Blocking, open **Settings → Google
   Calendar** and click **Connect with Google**. This requires you to have
   already created your own Google Cloud OAuth client (Client ID/Secret +
   an authorized redirect URI) and set `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` in `server/.env` (or the
   repo-root `.env` for Docker Compose) — see the comments in the relevant
   `.env.example` for the exact steps.

## How issues are classified (Eisenhower Matrix only)

- **Important** axis: Jira priority. `Code Red` / `Highest` / `High` →
  important, `Medium` / `Low` / `Lowest` → not important.
- **Urgent** axis: due date if the issue has one (due within 3 days, or
  overdue, counts as urgent). Most issues in this filter don't carry a due
  date, so as a fallback, issues in `In Progress` / `In Review` count as
  urgent and everything else (`Backlog`, `Current Backlog`, `On Hold`)
  doesn't.

Quadrants: **Do First** (urgent+important), **Schedule** (important, not
urgent), **Delegate** (urgent, not important), **Eliminate** (neither).

## Structure

- `server/` — Express API. Authenticates to Jira with Basic auth (per-user
  email + API token) and to Google Calendar with OAuth2 (read-only,
  auto-refreshing). Owns login and every table in the PostgreSQL database
  (see `docker-compose.yml`, or your own Postgres instance): `tenants`,
  `users` (each with a `role` of `admin` or `member`, scoped to their own
  tenant — there's no cross-tenant superuser), `sessions`, `jira_settings`,
  `quadrant_overrides` (matrix drag overrides), `time_blocks` (Time
  Blocking entries), `google_calendar_settings` (encrypted OAuth tokens),
  `notes`. Every table below `users` is scoped by `user_id` only — a
  tenant is purely an isolation/account boundary, not a shared workspace,
  so multiple users in the same organization still can't see each other's
  Jira connection, notes, or time blocks; "admin" only ever means "can
  manage this organization's user list," never "can see other users'
  data." See `server/CLAUDE.md` for route and integration conventions.
- `client/` — React + Vite + TypeScript SPA styled with
  [shadcn/ui](https://ui.shadcn.com) (Tailwind CSS v4 + Base UI
  primitives). Shows a login screen (with a link to sign up) until
  `/api/auth/me` confirms a session, then the Home launcher and the seven
  pages listed above (eight for admins, who also get the Admin tile). Dark
  mode follows the OS `prefers-color-scheme` setting automatically. shadcn
  components live in `src/components/ui/`;
  see `client/src/components/ui/CLAUDE.md` before adding more.

## Auth & credential notes

- Signing up (`POST /api/signup`) always creates a **new**, fully isolated
  account (just username/password — never gated shut, unlike the old
  one-time install screen). Under the hood every account is backed by its
  own "tenant" row for isolation, but this is invisible in the UI — there's
  no organization name to pick, and no user-facing concept of one. Whoever
  signs up becomes that organization's **admin** automatically — the very
  first user is always the administrator, same rule the old one-time
  install screen had, just generalized to "first user of each org" now
  that signup is repeatable. To add a *second* user sharing your *same*
  isolation boundary, either use the in-app **Admin** page (admins only —
  add a user, remove one, or toggle their role) or run `npm run
  create-user` from `server/`: it prompts for an organization name
  (matches an existing one by exact name, or creates a new one if it
  doesn't match) plus username/password — the CLI is the only way to
  create a *second* admin-owned organization from scratch without going
  through the browser's `/signup` page. A user added to an *existing* org
  (either way) always starts as a plain member, never an admin.
- Every organization always has at least one admin, enforced server-side:
  you can't demote the last admin to member, and the last admin can't
  delete their own account (Settings → Account) while teammates still
  exist — promote someone else first.
- **Settings → Account** lets you permanently delete your own account —
  re-enter your password to confirm, then everything tied to it (Jira
  connection, notes, time blocks, Google Calendar connection, sessions) is
  deleted immediately and irreversibly.
- Sessions live 7 days and are stored server-side, so restarting the
  server doesn't log you out; clearing the `sessions` table (or the whole
  Postgres volume) does.
- Cookies are `httpOnly` + `SameSite=Lax`; the `secure` flag only turns on
  when `NODE_ENV=production`, since local dev runs over plain HTTP.
- Passwords are **hashed** with bcrypt (one-way — only ever compared,
  never read back). The Jira API token and Google OAuth tokens are
  **encrypted** with AES-256-GCM using `ENCRYPTION_KEY` (reversible — the
  server needs the real values to call those APIs on your behalf). These
  are different mechanisms for a reason: a password never needs to be
  recovered, a token does.
- The Settings screen never re-displays a saved Jira token; leaving the
  token field blank on save keeps the existing one.
