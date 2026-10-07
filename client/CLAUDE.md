# client/

## Purpose

The React SPA — every page the user sees, and every fetch call to the
server's `/api/*` routes. Eight pages (seven for non-admins) over one Jira
connection plus an optional Google Calendar overlay.

## Ownership

Everything in `client/src/` except `client/src/components/ui/`, which owns
its own conventions (see the child doc).

## Local Contracts

**Routing** (`App.tsx`) — react-router-dom v7, the `<Routes>`/`<Route
element={...}>` API (not `createBrowserRouter`). `RequireAuth` wraps every
authenticated route and redirects to `/login` if there's no user;
`RequireAdmin` (checks `user.role === "admin"`, redirects to `/` otherwise)
additionally wraps `/admin` — always nested *inside* `RequireAuth`, since it
assumes `user` is non-null. Flow: `/login` (with a link to `/signup`, which
creates a new tenant + its first user) → authenticated routes. Pages and
routes: `/` (`Home.tsx`, launcher tiles), `/matrix` (`Dashboard.tsx`,
Eisenhower matrix + drag-to-reorder), `/issues` (`Issues.tsx`, sortable flat
table), `/kanban` (`Kanban.tsx`, status columns + drag-to-transition),
`/time-logger` (`TimeLogger.tsx` + `WeekCalendar.tsx`, logs real Jira
worklogs), `/time-blocking` (`TimeBlocking.tsx` + `BlockingCalendar.tsx`,
local-only planning + read-only Google Calendar overlay), `/notes`
(`Notes.tsx` + `NoteEditor.tsx`, rich-text notes, local-only), `/settings`
(`Settings.tsx`, tabbed — Jira Connection, Google Calendar, Account — the
last one holds self-service account deletion, password-confirmed via a
modal matching `WorklogEditor`'s overlay pattern), `/admin` (`Admin.tsx`,
admin-only — add/remove users and toggle their role within your own
tenant; the Home launcher tile for it is conditionally rendered only when
`user.role === "admin"`, mirroring the route guard).

**Page shell** — no shared layout component; each page renders its own
`<header>`: `mx-auto max-w-[1400px] p-6` wrapper, a breadcrumb `<h1>`
("Cockpit / *Section*"), and a right-aligned action cluster (page-specific
actions, `Settings`, `ThemeToggle`, username, `Log out`). Copy the nearest
existing page's header verbatim for a new page rather than inventing a new
shape.

**Data fetching** — plain `useState`/`useEffect` + `fetch(url, {credentials:
"include"})`. No react-query/SWR anywhere. Each API resource gets its own
`*Client.ts` file (`settingsClient.ts`, `timeLoggerClient.ts`,
`timeBlocksClient.ts`, `googleCalendarClient.ts`, `notesClient.ts`,
`adminClient.ts`, `auth.ts` — login/signup/logout/me/deleteAccount all live
here, not a separate file) with a **locally duplicated** `parseJson` helper
(`{error}` shape
→ `throw new Error(...)`) — this duplication across files is intentional,
not an oversight; don't centralize it.

**Styling** — Tailwind CSS v4 + shadcn "base-nova" style over
`@base-ui/react` (confirmed by `client/components.json`). `cn()` from
`@/lib/utils` for conditional classes.

**Color system** (`client/src/index.css`) — three reserved tiers, never
mixed:
- `--status-good/warning/serious/critical/info` — Jira priority/status
  meaning only (`priority.ts`, `status.ts`). Never reused decoratively.
- `--label` (violet) — reserved for Jira label tag badges.
- `--chart-1..6` — the decorative categorical palette (Home tile accents,
  and the hash-to-color assignment in `worklogColor.ts` for calendar
  blocks). Same validated 8-hue set referenced by the `dataviz` skill; pick
  from here, don't invent new hex values. `Tour.tsx` also reuses these as
  each step's spotlight/dot accent — matching whatever tile/section color
  the step is pointing at, not a new tour-specific hue.
- `--tour-scrim` — the one token outside this categorical/status split: a
  raw rgba (not oklch) plugged directly into `Tour.tsx`'s spotlight
  box-shadow cutout, not used as a background or text color anywhere.

**Dark mode** — `.dark` class on `<html>`, applied by `theme.ts`
(`applyTheme`/`setTheme`), initialized once in `main.tsx` (`initTheme()`).
Components that need to *react* to a live theme change (not just read it
once) use `useIsDarkMode()` (`useSyncExternalStore` + `theme.ts`'s
`subscribeTheme`) — e.g. every calendar block re-colors itself correctly if
the user flips the toggle mid-session.

**Two drag mechanisms, used deliberately for different jobs**:
1. Native HTML5 drag-and-drop — discrete container-to-container moves
   (`Dashboard.tsx` quadrant reordering, `Kanban.tsx` status-column drop).
   Always pair `onDragStart` with a synthetic off-screen preview element
   passed to `setDragImage` — pointing it at the real card (a descendant of
   a scrollable list) makes some browsers snapshot the whole scrollable
   container, scrollbar included, instead of just the card.
2. Pointer-event dragging — continuous position feedback (`WorklogBlock.tsx`
   move/resize, `PlannedBlock.tsx` move/resize, the create-drag in
   `WeekCalendar.tsx`/`BlockingCalendar.tsx`). Pattern: `setPointerCapture`
   on pointerdown, write `style.transform`/`style.top`/`style.height`
   directly to the DOM node on pointermove (not React state — too hot a
   path), compute the final `Date`/duration on pointerup and call back up.

**Calendar grid math** — `calendarLayout.ts` (`PX_PER_HOUR`,
`VISIBLE_START_HOUR/END_HOUR`, `SNAP_MINUTES`, `MIN_DURATION_MS`,
`MIN_BLOCK_HEIGHT_PX`, `TIME_AXIS_WIDTH_PX`) is shared by both calendars
(Time Logger and Time Blocking) — keep their position math in agreement if
these change. `dateUtils.ts` holds all date/time formatting plus
`toJiraStarted()`, which builds Jira's exact `yyyy-MM-ddTHH:mm:ss.SSS±HHMM`
string from the browser's own local UTC offset — this is why no timezone
library exists anywhere in the client; the browser's `Date` already knows
the correct offset for any given instant.

**Three calendar block visual languages, by design** (so "what kind of
block is this" reads at a glance without labels):
- `WorklogBlock` — solid fill. Already-logged real Jira time; editable.
- `PlannedBlock` — tinted background + left border. Locally-planned time;
  editable; optionally linked to a Jira issue. Also carries the "+"
  (log-as-worklog) button, opening `WorklogEditor` pre-filled from the
  block (issue key too, when the block has one).
- `CalendarEventBlock` — dashed border, muted fill, no drag handlers at
  all. Synced from Google, read-only except the "+" (log-as-worklog)
  button, which opens `WorklogEditor` pre-filled from the meeting.

**Rich-text editing** (`NoteEditor.tsx`) — a hand-rolled contentEditable
`<div>` + toolbar, using `document.execCommand` (bold/italic/underline/
headings/lists/link); no editor dependency (see root `CLAUDE.md`'s
dependency exception note — sanitization, not the editor, is where a
library was justified). Two non-obvious rules that keep it correct:
toolbar buttons need `onMouseDown={(e) => e.preventDefault()}` (not just
`onClick`) or the mousedown's default focus shift collapses the
editor's text selection before the formatting command can run on it.
The DOM-sync `useEffect` must compare the incoming `value` prop against
the **live DOM** (`el.innerHTML !== value`), not a ref snapshot of the
last-known value — comparing against a ref that gets updated on every
keystroke means the check is always true-equal on mount and on note
switches, silently skipping the initial content write.

**On-demand tour** (`Tour.tsx`) — one shared component every page feeds its
own small `steps: TourStep[]` array (`{selector, title, body, accent}`),
triggered by a `HelpCircle` icon button in the same header-cluster spot on
every page (right before `ThemeToggle`). Purely on-demand: no auto-trigger
on first visit, no "seen it" state persisted anywhere (server or
localStorage) — every run starts fresh. Anchors are plain `data-tour="..."`
attributes on real elements (or a descendant-combinator selector like
`[data-tour="matrix-card"] button` to drill into a specific part of an
already-anchored element, rather than adding another attribute deep in a
shared component). `Tour` resolves `steps` against the live DOM once at
mount and silently drops any whose selector doesn't currently match —
this is how pages with conditionally-rendered content (no worklogs logged
this week, no Google Calendar connected, an empty Notes list) stay
tour-safe without special-casing: a step for a "first card"/"first
worklog"/"first meeting" element that doesn't exist just doesn't show,
rather than crashing. Pages needing to spotlight "whichever card/block
happens to exist" (Dashboard, Kanban, WeekCalendar, BlockingCalendar) do
that by passing an optional `tourId` prop through to `IssueCard` /
`WorklogBlock` / `PlannedBlock` / `CalendarEventBlock`, computed as "the
first one in reading order" — never hardcoded to a specific issue key or
worklog id, since that data is live and different every session.
`Tour`'s positioning always scrolls the target into view with instant
(not smooth) behavior *before* calling `getBoundingClientRect()` — scroll
first, then measure. Measuring first and scrolling after was tried and
visibly broke: the highlight/tooltip are `position: fixed`
(viewport-relative), so they'd get placed against the pre-scroll layout,
then the page would scroll out from under them once the async smooth-scroll
caught up, landing the spotlight on whatever card ended up at that now-stale
screen coordinate — reading exactly like "steps visited out of order" even
though the step sequence itself was always correct.

## Work Guidance

- No new UI dependency for anything achievable by hand-rolling on the
  existing primitives + Tailwind — this has held for autocomplete, tabs,
  and all calendar drag/resize/create interactions so far.
- Reuse an existing feature component across pages before writing a new
  one with near-identical shape (see `IssueCard` and `WorklogEditor` reuse
  above).

## Verification

- `npx tsc -b --noEmit` from `client/` after any change — **not** plain
  `tsc --noEmit`: the root `tsconfig.json` here has `"files": []` and only
  `references` (a solution-style config), so plain `tsc --noEmit` silently
  checks zero files and always exits 0 regardless of real errors. `-b`
  (build mode) is what actually follows the references and type-checks
  `tsconfig.app.json`/`tsconfig.node.json` — the same thing `npm run build`
  relies on via `tsc -b && vite build`. This was discovered when a
  pre-existing type error in `autocomplete.tsx` (stale `*Props` type names
  after a `@base-ui/react` upgrade) shipped unnoticed until a from-scratch
  Docker build's `npm run build` finally caught it.
- Dev server (`npm run dev` from repo root) HMRs on save; a transient error
  logged mid-edit (before a multi-file rename finishes) is expected and
  resolves itself — confirm by re-running `tsc` and checking no error is
  logged *after* the last file in the edit sequence was saved.

## Child DOX Index

- `src/components/ui/CLAUDE.md` — the shadcn/base-ui primitive wrapper
  library (Button, Card, Select, Autocomplete, Tabs, etc.) consumed by
  every page and feature component above.
