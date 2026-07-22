const IMPORTANT_PRIORITIES = new Set(["Code Red", "Highest", "High"]);
const ACTIVE_STATUSES = new Set(["In Progress", "In Review"]);
const URGENT_DUE_WITHIN_DAYS = 3;

export function classifyIssue(issue) {
  const priorityName = issue.fields.priority?.name ?? "Medium";
  const statusName = issue.fields.status?.name ?? "";
  const dueDate = issue.fields.duedate;

  const important = IMPORTANT_PRIORITIES.has(priorityName);

  let urgent;
  let urgencySource;
  if (dueDate) {
    const daysUntilDue = (new Date(dueDate) - Date.now()) / (1000 * 60 * 60 * 24);
    urgent = daysUntilDue <= URGENT_DUE_WITHIN_DAYS;
    urgencySource = "duedate";
  } else {
    urgent = ACTIVE_STATUSES.has(statusName);
    urgencySource = "status-fallback";
  }

  let quadrant;
  if (important && urgent) quadrant = "do-first";
  else if (important && !urgent) quadrant = "schedule";
  else if (!important && urgent) quadrant = "delegate";
  else quadrant = "eliminate";

  return { important, urgent, urgencySource, quadrant };
}
