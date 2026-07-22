# Cockpit

Personal, single-user, Jira-integrated productivity dashboard. Seven views
over one saved JQL filter, plus an optional read-only Google Calendar
overlay.

> Development conventions and architecture live in `CLAUDE.md` (and the
> `CLAUDE.md` in `client/`, `client/src/components/ui/`, and `server/`).
> This file is the practical "what it does and how to run it" doc.

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
- **Settings** (`/settings`) — tabbed: **Jira Connection** (base URL,
  account email, API token, JQL) and **Google Calendar** (optional OAuth
  connect/disconnect).

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

1. On a completely fresh database (no accounts yet) you'll land on a
   one-time install screen to create your username/password; after that,
   and on every later launch, you'll land on the normal login screen
   instead.
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
  (see `docker-compose.yml`, or your own Postgres instance): `users`,
  `sessions`, `jira_settings`, `quadrant_overrides` (matrix drag
  overrides), `time_blocks` (Time Blocking entries),
  `google_calendar_settings` (encrypted OAuth tokens), `notes`.
  See `server/CLAUDE.md` for route and integration conventions.
- `client/` — React + Vite + TypeScript SPA styled with
  [shadcn/ui](https://ui.shadcn.com) (Tailwind CSS v4 + Base UI
  primitives). Shows a one-time install screen on a completely fresh
  database, otherwise a login screen until `/api/auth/me` confirms a
  session, then the Home launcher and the seven pages listed above. Dark
  mode follows the OS `prefers-color-scheme` setting automatically.
  shadcn components live in `src/components/ui/`; see
  `client/src/components/ui/CLAUDE.md` before adding more.

## Auth & credential notes

- The very first account is created from the browser via a one-time
  install screen (`GET /api/install/status` reports whether it's needed;
  it's gated off for good the moment one account exists, even if called
  directly). To add a *second* account later, use `npm run create-user`
  from `server/` — no in-app signup route exists once installation is
  complete.
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
