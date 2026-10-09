# client/

## Purpose

The React SPA — every page the user sees, and every fetch call to the
server's `/api/*` routes. Ten pages (nine for non-admins) over one Jira
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
routes: `/` (`Home.tsx`, launcher tiles; most pages sit inside
iPhone-style folders — "Jira" (Matrix, Issues, Kanban, Time Logger) and
"Productivity" (Time Blocking, Notes, Sticky Notes) and "Management"
(Settings, Admin) — each a `Folder` config rendered via `renderFolder`.
Admin-only apps carry `adminOnly` and are filtered out for members; a folder left
with one app renders as that app's plain `AppTile` instead of a one-item
folder, so members see a normal Settings tile. `FolderTile` previews a folder as a 2×2 mini icon
grid, `FolderOverlay` opens it in a blurred overlay with the same
Esc/backdrop-to-close behavior as `WorklogEditor`; the Home tour points at
the folders, not the hidden tiles (plus a `tile-settings` step that only
resolves for members, when Management collapses to a plain tile). Each app in a folder needs its own
mini-grid hue so the preview reads, even if its old standalone tile shared
a color with a sibling), `/matrix` (`Dashboard.tsx`,
Eisenhower matrix + drag-to-reorder), `/issues` (`Issues.tsx`, sortable flat
table), `/kanban` (`Kanban.tsx`, status columns + drag-to-transition),
`/time-logger` (`TimeLogger.tsx` + `WeekCalendar.tsx`, logs real Jira
worklogs), `/time-blocking` (`TimeBlocking.tsx` + `BlockingCalendar.tsx`,
local-only planning + read-only Google Calendar overlay), `/notes`
(`Notes.tsx` + `NoteEditor.tsx`, rich-text notes, local-only), `/stickies`
(`StickyNotes.tsx` + `StickyNoteCard.tsx`, freeform sticky-note board,
local-only — see below), `/okrs`
(`Okrs.tsx` + `ObjectiveEditor.tsx` + `KeyResultEditor.tsx` +
`CheckInDialog.tsx` + `Sparkline.tsx`, quarterly OKRs synced to Jira — see
below), `/settings`
(`Settings.tsx`, tabbed — Jira Connection, OKR Sync, Google Calendar, Account — the
last one holds self-service account deletion, password-confirmed via a
modal matching `WorklogEditor`'s overlay pattern), `/admin` (`Admin.tsx`,
admin-only — add/remove users and toggle their role within your own
tenant; its Home entry in the Management folder is `adminOnly`, shown
only when `user.role === "admin"`, mirroring the route guard).

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
`stickyNotesClient.ts`, `okrsClient.ts`, `adminClient.ts`, `auth.ts` — login/signup/logout/me/deleteAccount all live
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
  the hash-to-color assignment in `worklogColor.ts` for calendar
  blocks, and the six sticky-note color slots). Same validated 8-hue set referenced by the `dataviz` skill; pick
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
   `WeekCalendar.tsx`/`BlockingCalendar.tsx`, `StickyNoteCard.tsx` move). Pattern: `setPointerCapture`
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

**Sticky notes** (`StickyNotes.tsx`, `StickyNoteCard.tsx`) — a scrollable
board; each sticky is absolutely positioned at its stored `x`/`y` (px) and
dragged by its top strip only (the textarea stays a normal text target).
Plain text in a `<textarea>`, autosaved on a 600ms debounce and flushed on
blur/unmount; color is a slot 0–5 rendered as `var(--chart-N)` (top border
+ a `color-mix` tint toward `--background`, so `text-foreground` reads on
every slot in both themes). Stacking order is a separate `stack` id array
mapped to `zIndex`, while render order stays fixed by id — re-ordering the
DOM to bring a sticky to front would drop its pointer capture mid-drag.
Saves are optimistic and build the full row from a `notesRef` of the
latest state (a move and a text autosave can land back to back); a failed
save shows the error and reloads. Deleting a sticky with text takes a
second click. Double-click on empty board creates a sticky there.

**OKRs** (`Okrs.tsx`, `okrsClient.ts`) — one quarter at a time (period
string `"2026-Q4"`; `currentPeriod`/`shiftPeriod`/`formatPeriod` in
`okrsClient.ts`). Progress, sync state (`jiraIssueKey`, `syncError`) and
the objective roll-up all come from the server — the page never computes
them, and simply reloads the list after every mutation. The one extra
call: on entering a quarter that has Jira-query key results, the page
shows the stored counts first, then calls `refreshOkrs` once and reloads
(never after each edit — the server re-counts the key result it saved).
`Sparkline` is a hand-rolled inline SVG (fixed 0–100% domain so rows
compare, 2px line in the objective's `text-chart-N` via `currentColor`,
native `<title>` tooltips on enlarged hit circles); `CheckInDialog`'s
history table is its table view. Server responses
with `needsSetup` (no Jira connection or no OKR project yet) surface as
`OkrSetupError`, which the page renders as a "go to Settings" card, same
shape as Dashboard's. Objective cards cycle `--chart-1..6` by display
index (border + progress-bar fill); errors use `text-destructive`, never a
status hue. The two editors follow `WorklogEditor`'s overlay pattern;
deleting anything that has a Jira issue takes a second click because it
deletes the Jira issue(s) too. The Settings "OKR Sync" tab
(`OkrSyncPanel`) picks the project and both issue types, defaulting to
Epic → Task when the project has them.

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
happens to exist" (Dashboard, Kanban, WeekCalendar, BlockingCalendar,
StickyNotes) do that by passing an optional `tourId` prop through to
`IssueCard` / `WorklogBlock` / `PlannedBlock` / `CalendarEventBlock` /
`StickyNoteCard`, computed as "the
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
