import { useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Clock, Columns3, Settings, List, CalendarClock, StickyNote, Users, HelpCircle, Target } from "lucide-react";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "./ThemeToggle";
import { Tour } from "./Tour";
import type { TourStep } from "./Tour";

const HOME_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="tile-matrix"]',
    title: "Eisenhower Matrix",
    body: "Jira's priority and due date decide which quadrant a ticket starts in. Drag a card into a different quadrant to override that — Jira itself doesn't change.",
    accent: "var(--chart-3)",
  },
  {
    selector: '[data-tour="tile-issues"]',
    title: "Issues",
    body: "Every ticket from your JQL query, in one sortable table. Click a column header to sort by it.",
    accent: "var(--chart-5)",
  },
  {
    selector: '[data-tour="tile-time-logger"]',
    title: "Time Logger",
    body: "Log real Jira worklogs on a weekly calendar. Click and drag across the grid to create one.",
    accent: "var(--chart-1)",
  },
  {
    selector: '[data-tour="tile-time-blocking"]',
    title: "Time Blocking",
    body: "Plan your own time, optionally linked to a Jira issue. Connect Google Calendar in Settings to see your meetings here too.",
    accent: "var(--chart-6)",
  },
  {
    selector: '[data-tour="tile-kanban"]',
    title: "Kanban Board",
    body: "Every ticket grouped by status. Drag a card to a new column and it really transitions the ticket in Jira.",
    accent: "var(--chart-2)",
  },
  {
    selector: '[data-tour="tile-notes"]',
    title: "Notes",
    body: "Free-form rich-text notes — nothing to do with Jira, just yours.",
    accent: "var(--chart-5)",
  },
  {
    selector: '[data-tour="tile-okrs"]',
    title: "OKRs",
    body: "Objectives and key results for each quarter, with progress that rolls up — and every one mirrored as an issue in a Jira project you choose.",
    accent: "var(--chart-2)",
  },
  {
    selector: '[data-tour="tile-settings"]',
    title: "Settings",
    body: "Your Jira connection, Google Calendar, and account all live here.",
    accent: "var(--chart-4)",
  },
  {
    selector: '[data-tour="tile-admin"]',
    title: "Admin",
    body: "Add, remove, or promote the people in your organization. Visible only to admins.",
    accent: "var(--chart-1)",
  },
];

export function Home({ user, onLoggedOut }: { user: AuthUser; onLoggedOut: () => void }) {
  const [tourOpen, setTourOpen] = useState(false);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Cockpit</h1>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" title="Take a tour" onClick={() => setTourOpen(true)}>
            <HelpCircle />
          </Button>
          <ThemeToggle />
          <span className="text-sm text-muted-foreground">{user.username}</span>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/matrix" className="block">
          <Card
            data-tour="tile-matrix"
            className="gap-2 border-t-2 border-t-chart-3 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
          >
            <div className="flex items-center gap-2">
              <Flame className="size-4 text-chart-3" />
              <h2 className="text-base font-medium">Eisenhower Matrix</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Prioritize your Jira tickets by urgency and importance.
            </p>
          </Card>
        </Link>
        <Link to="/issues" className="block">
          <Card
            data-tour="tile-issues"
            className="gap-2 border-t-2 border-t-chart-5 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
          >
            <div className="flex items-center gap-2">
              <List className="size-4 text-chart-5" />
              <h2 className="text-base font-medium">Issues</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              A plain list of every ticket from your JQL query.
            </p>
          </Card>
        </Link>
        <Link to="/time-logger" className="block">
          <Card
            data-tour="tile-time-logger"
            className="gap-2 border-t-2 border-t-chart-1 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
          >
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-chart-1" />
              <h2 className="text-base font-medium">Time Logger</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Log time against Jira issues on a weekly calendar.
            </p>
          </Card>
        </Link>
        <Link to="/time-blocking" className="block">
          <Card
            data-tour="tile-time-blocking"
            className="gap-2 border-t-2 border-t-chart-6 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
          >
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-chart-6" />
              <h2 className="text-base font-medium">Time Blocking</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Plan your week ahead, optionally linked to a Jira issue.
            </p>
          </Card>
        </Link>
        <Link to="/kanban" className="block">
          <Card
            data-tour="tile-kanban"
            className="gap-2 border-t-2 border-t-chart-2 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
          >
            <div className="flex items-center gap-2">
              <Columns3 className="size-4 text-chart-2" />
              <h2 className="text-base font-medium">Kanban Board</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              See every ticket from your JQL query grouped by status.
            </p>
          </Card>
        </Link>
        <Link to="/notes" className="block">
          <Card
            data-tour="tile-notes"
            className="gap-2 border-t-2 border-t-chart-5 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
          >
            <div className="flex items-center gap-2">
              <StickyNote className="size-4 text-chart-5" />
              <h2 className="text-base font-medium">Notes</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Free-form notes with basic text formatting.
            </p>
          </Card>
        </Link>
        <Link to="/okrs" className="block">
          <Card
            data-tour="tile-okrs"
            className="gap-2 border-t-2 border-t-chart-2 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
          >
            <div className="flex items-center gap-2">
              <Target className="size-4 text-chart-2" />
              <h2 className="text-base font-medium">OKRs</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Quarterly objectives and key results, synced to Jira.
            </p>
          </Card>
        </Link>
        <Link to="/settings" className="block">
          <Card
            data-tour="tile-settings"
            className="gap-2 border-t-2 border-t-chart-4 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
          >
            <div className="flex items-center gap-2">
              <Settings className="size-4 text-chart-4" />
              <h2 className="text-base font-medium">Settings</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Jira connection and other app preferences.
            </p>
          </Card>
        </Link>
        {user.role === "admin" && (
          <Link to="/admin" className="block">
            <Card
              data-tour="tile-admin"
              className="gap-2 border-t-2 border-t-chart-1 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30"
            >
              <div className="flex items-center gap-2">
                <Users className="size-4 text-chart-1" />
                <h2 className="text-base font-medium">Admin</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Add or remove users in your organization.
              </p>
            </Card>
          </Link>
        )}
      </div>

      {tourOpen && <Tour steps={HOME_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
