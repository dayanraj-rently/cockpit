import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Clock, Columns3, Settings, List, CalendarClock, StickyNote, Users, HelpCircle, Target, Pin, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { logout } from "./auth";
import type { AuthUser } from "./auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "./ThemeToggle";
import { Tour } from "./Tour";
import type { TourStep } from "./Tour";

const HOME_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="tile-jira-folder"]',
    title: "Jira folder",
    body: "Eisenhower Matrix, Issues, Kanban Board and Time Logger — everything that works on your Jira tickets — live together in here. Click the folder to open it.",
    accent: "var(--chart-3)",
  },
  {
    selector: '[data-tour="tile-productivity-folder"]',
    title: "Productivity folder",
    body: "Time Blocking, Notes and Sticky Notes — your own planning and jotting, separate from Jira — live in here. Click the folder to open it.",
    accent: "var(--chart-6)",
  },
  {
    selector: '[data-tour="tile-okrs"]',
    title: "OKRs",
    body: "Objectives and key results for each quarter, with progress that rolls up — and every one mirrored as an issue in a Jira project you choose.",
    accent: "var(--chart-2)",
  },
  {
    selector: '[data-tour="tile-management-folder"]',
    title: "Management folder",
    body: "Settings (your Jira connection, Google Calendar and account) and Admin (add, remove or promote the people in your organization) live in here.",
    accent: "var(--chart-4)",
  },
  {
    // Only on screen for members: with Admin hidden, the Management folder
    // has one app left and renders as a plain Settings tile instead.
    selector: '[data-tour="tile-settings"]',
    title: "Settings",
    body: "Your Jira connection, Google Calendar, and account all live here.",
    accent: "var(--chart-4)",
  },
];

interface FolderApp {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  // Full class names (not built from a color name) so Tailwind sees them.
  borderClass: string;
  textClass: string;
  tintClass: string;
  /** Hidden entirely for non-admins (mirrors the route guard). */
  adminOnly?: boolean;
  /** Tour anchor for when this app renders as a standalone tile. */
  tourId?: string;
}

interface Folder {
  title: string;
  tourId: string;
  borderClass: string;
  apps: FolderApp[];
}

const JIRA_FOLDER: Folder = {
  title: "Jira",
  tourId: "tile-jira-folder",
  borderClass: "border-t-chart-3",
  apps: [
    {
      to: "/matrix",
      title: "Eisenhower Matrix",
      description: "Prioritize your Jira tickets by urgency and importance.",
      icon: Flame,
      borderClass: "border-t-chart-3",
      textClass: "text-chart-3",
      tintClass: "bg-chart-3/15",
    },
    {
      to: "/issues",
      title: "Issues",
      description: "A plain list of every ticket from your JQL query.",
      icon: List,
      borderClass: "border-t-chart-5",
      textClass: "text-chart-5",
      tintClass: "bg-chart-5/15",
    },
    {
      to: "/kanban",
      title: "Kanban Board",
      description: "See every ticket from your JQL query grouped by status.",
      icon: Columns3,
      borderClass: "border-t-chart-2",
      textClass: "text-chart-2",
      tintClass: "bg-chart-2/15",
    },
    {
      to: "/time-logger",
      title: "Time Logger",
      description: "Log time against Jira issues on a weekly calendar.",
      icon: Clock,
      borderClass: "border-t-chart-1",
      textClass: "text-chart-1",
      tintClass: "bg-chart-1/15",
    },
  ],
};

const PRODUCTIVITY_FOLDER: Folder = {
  title: "Productivity",
  tourId: "tile-productivity-folder",
  borderClass: "border-t-chart-6",
  apps: [
    {
      to: "/time-blocking",
      title: "Time Blocking",
      description: "Plan your week ahead, optionally linked to a Jira issue.",
      icon: CalendarClock,
      borderClass: "border-t-chart-6",
      textClass: "text-chart-6",
      tintClass: "bg-chart-6/15",
    },
    {
      to: "/notes",
      title: "Notes",
      description: "Free-form notes with basic text formatting.",
      icon: StickyNote,
      borderClass: "border-t-chart-5",
      textClass: "text-chart-5",
      tintClass: "bg-chart-5/15",
    },
    {
      to: "/stickies",
      title: "Sticky Notes",
      description: "A freeform board of quick, colored sticky notes.",
      icon: Pin,
      borderClass: "border-t-chart-4",
      textClass: "text-chart-4",
      tintClass: "bg-chart-4/15",
    },
  ],
};

const MANAGEMENT_FOLDER: Folder = {
  title: "Management",
  tourId: "tile-management-folder",
  borderClass: "border-t-chart-4",
  apps: [
    {
      to: "/settings",
      title: "Settings",
      description: "Jira connection and other app preferences.",
      icon: Settings,
      borderClass: "border-t-chart-4",
      textClass: "text-chart-4",
      tintClass: "bg-chart-4/15",
      tourId: "tile-settings",
    },
    {
      to: "/admin",
      title: "Admin",
      description: "Add or remove users in your organization.",
      icon: Users,
      borderClass: "border-t-chart-1",
      textClass: "text-chart-1",
      tintClass: "bg-chart-1/15",
      adminOnly: true,
    },
  ],
};

function AppTile({ app, heading: Heading = "h2" }: { app: FolderApp; heading?: "h2" | "h3" }) {
  const Icon = app.icon;
  return (
    <Link to={app.to} className="block">
      <Card
        data-tour={app.tourId}
        className={`h-full gap-2 border-t-2 ${app.borderClass} px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${app.textClass}`} />
          <Heading className="text-base font-medium">{app.title}</Heading>
        </div>
        <p className="text-sm text-muted-foreground">{app.description}</p>
      </Card>
    </Link>
  );
}

// An iPhone-style folder: the tile previews its apps as a mini icon grid,
// and opening it shows the full tiles in an overlay.
function FolderTile({ folder, onOpen }: { folder: Folder; onOpen: () => void }) {
  const { title, apps } = folder;
  return (
    <button type="button" className="block text-left" onClick={onOpen}>
      <Card
        data-tour={folder.tourId}
        className={`h-full gap-2 border-t-2 ${folder.borderClass} px-4 py-4 shadow-none transition-colors hover:ring-2 hover:ring-ring/30`}
      >
        <div className="flex items-center gap-3">
          <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1.5">
            {Array.from({ length: 4 }, (_, i) => {
              const app = apps[i];
              if (!app) return <div key={i} className="size-5" />;
              const Icon = app.icon;
              return (
                <div key={app.to} className={`flex size-5 items-center justify-center rounded ${app.tintClass}`}>
                  <Icon className={`size-3 ${app.textClass}`} />
                </div>
              );
            })}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-medium">{title}</h2>
            <p className="truncate text-sm text-muted-foreground">{apps.map((a) => a.title).join(" · ")}</p>
          </div>
        </div>
      </Card>
    </button>
  );
}

function FolderOverlay({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  const { title, apps } = folder;
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-150 animate-in fade-in-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-background/90 p-5 shadow-xl ring-1 ring-foreground/10 duration-150 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon-sm" title="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
        {/* Two columns for an even count (2×2), three otherwise, so no tile is left alone on a row. */}
        <div className={`grid grid-cols-1 gap-4 ${apps.length % 2 === 0 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          {apps.map((app) => (
            // Inside the overlay, the app's own tour anchor would point the
            // tour at a hidden tile — drop it.
            <AppTile key={app.to} app={{ ...app, tourId: undefined }} heading="h3" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Home({ user, onLoggedOut }: { user: AuthUser; onLoggedOut: () => void }) {
  const [tourOpen, setTourOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<Folder | null>(null);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  // Filters out admin-only apps for members; a folder left with a single app
  // renders as that app's plain tile rather than a one-item folder.
  function renderFolder(folder: Folder) {
    const apps = folder.apps.filter((app) => !app.adminOnly || user.role === "admin");
    if (apps.length === 0) return null;
    if (apps.length === 1) return <AppTile key={folder.title} app={apps[0]} />;
    const visible = { ...folder, apps };
    return <FolderTile key={folder.title} folder={visible} onOpen={() => setOpenFolder(visible)} />;
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
        {renderFolder(JIRA_FOLDER)}
        {renderFolder(PRODUCTIVITY_FOLDER)}
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
        {renderFolder(MANAGEMENT_FOLDER)}
      </div>

      {openFolder && <FolderOverlay folder={openFolder} onClose={() => setOpenFolder(null)} />}
      {tourOpen && <Tour steps={HOME_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
