import { Link } from "react-router-dom";
import { Flame, Clock, Columns3, Settings, List, CalendarClock, StickyNote } from "lucide-react";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "./ThemeToggle";

export function Home({ user, onLoggedOut }: { user: AuthUser; onLoggedOut: () => void }) {
  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Cockpit</h1>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground">{user.username}</span>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/matrix" className="block">
          <Card className="gap-2 border-t-2 border-t-chart-3 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30">
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
          <Card className="gap-2 border-t-2 border-t-chart-5 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30">
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
          <Card className="gap-2 border-t-2 border-t-chart-1 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30">
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
          <Card className="gap-2 border-t-2 border-t-chart-6 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30">
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
          <Card className="gap-2 border-t-2 border-t-chart-2 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30">
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
          <Card className="gap-2 border-t-2 border-t-chart-5 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30">
            <div className="flex items-center gap-2">
              <StickyNote className="size-4 text-chart-5" />
              <h2 className="text-base font-medium">Notes</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Free-form notes with basic text formatting.
            </p>
          </Card>
        </Link>
        <Link to="/settings" className="block">
          <Card className="gap-2 border-t-2 border-t-chart-4 px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30">
            <div className="flex items-center gap-2">
              <Settings className="size-4 text-chart-4" />
              <h2 className="text-base font-medium">Settings</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Jira connection and other app preferences.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
