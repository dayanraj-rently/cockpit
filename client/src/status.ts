// Color is reserved for statuses worth calling out at a glance — everything
// else (backlog-like states) stays neutral.
export function statusDotClass(status: string | undefined): string | undefined {
  switch (status) {
    case "Done":
      return "bg-status-good";
    case "In Progress":
    case "In Review":
      return "bg-status-info";
    case "On Hold":
      return "bg-status-warning";
    default:
      return undefined;
  }
}
