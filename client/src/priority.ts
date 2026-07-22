// Color is reserved for the priorities that should visually pop — everything
// at or below Medium stays neutral so the escalated ones actually stand out.
export function priorityBadgeVariant(
  priority: string | undefined,
): "critical" | "serious" | "warning" | "outline" {
  switch (priority) {
    case "Code Red":
      return "critical";
    case "Highest":
      return "serious";
    case "High":
      return "warning";
    default:
      return "outline";
  }
}
