# client/

## Purpose

The React SPA — every page the user sees, and every fetch call to the
server's `/api/*` routes. Six pages over one Jira connection plus an
optional Google Calendar overlay.

## Ownership

Everything in `client/src/` except `client/src/components/ui/`, which owns
its own conventions (see the child doc).

## Local Contracts

**Routing** (`App.tsx`) — react-router-dom v7, the `<Routes>`/`<Route
element={...}>` API (not `createBrowserRouter`). `RequireAuth` wraps every
authenticated route and redirects to `/login` if there's no user. Flow:
`/install` (first-run only) → `/login` → authenticated routes. Pages and
routes: `/` (`Home.tsx`, launcher tiles), `/matrix` (`Dashboard.tsx`,
Eisenhower matrix + drag-to-reorder), `/issues` (`Issues.tsx`, sortable flat
table), `/kanban` (`Kanban.tsx`, status columns + drag-to-transition),
`/time-logger` (`TimeLogger.tsx` + `WeekCalendar.tsx`, logs real Jira
worklogs), `/time-blocking` (`TimeBlocking.tsx` + `BlockingCalendar.tsx`,
local-only planning + read-only Google Calendar overlay), `/notes`
(`Notes.tsx` + `NoteEditor.tsx`, rich-text notes, local-only), `/settings`
(`Settings.tsx`, tabbed — Jira Connection, Google Calendar).

**Page shell** — no shared layout component; each page renders its own
`<header>`: `mx-auto max-w-[1400px] p-6` wrapper, a breadcrumb `<h1>` ("My
Dashboard / *Section*"), and a right-aligned action cluster (page-specific
actions, `Settings`, `ThemeToggle`, username, `Log out`). Copy the nearest
existing page's header verbatim for a new page rather than inventing a new
shape.

**Data fetching** — plain `useState`/`useEffect` + `fetch(url, {credentials:
"include"})`. No react-query/SWR anywhere. Each API resource gets its own
`*Client.ts` file (`settingsClient.ts`, `timeLoggerClient.ts`,
`timeBlocksClient.ts`, `googleCalendarClient.ts`, `installClient.ts`,
`auth.ts`) with a **locally duplicated** `parseJson` helper (`{error}` shape
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
  from here, don't invent new hex values.

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

## Work Guidance

- No new UI dependency for anything achievable by hand-rolling on the
  existing primitives + Tailwind — this has held for autocomplete, tabs,
  and all calendar drag/resize/create interactions so far.
- Reuse an existing feature component across pages before writing a new
  one with near-identical shape (see `IssueCard` and `WorklogEditor` reuse
  above).

## Verification

- `npx tsc --noEmit` from `client/` after any change.
- Dev server (`npm run dev` from repo root) HMRs on save; a transient error
  logged mid-edit (before a multi-file rename finishes) is expected and
  resolves itself — confirm by re-running `tsc` and checking no error is
  logged *after* the last file in the edit sequence was saved.

## Child DOX Index

- `src/components/ui/CLAUDE.md` — the shadcn/base-ui primitive wrapper
  library (Button, Card, Select, Autocomplete, Tabs, etc.) consumed by
  every page and feature component above.
