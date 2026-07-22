export type Quadrant = "do-first" | "schedule" | "delegate" | "eliminate";

export interface Issue {
  key: string;
  url: string;
  summary: string;
  issueType?: string;
  priority?: string;
  status?: string;
  statusCategory?: string;
  project?: string;
  dueDate: string | null;
  created?: string;
  updated?: string;
  assignee?: string;
  assigneeAccountId?: string | null;
  reporter?: string;
  labels?: string[];
  important: boolean;
  urgent: boolean;
  urgencySource: "duedate" | "status-fallback";
  quadrant: Quadrant;
  quadrantOverridden?: boolean;
  position?: number | null;
}

export interface IssuesResponse {
  issues: Issue[];
  fetchedAt: string;
}

export interface Transition {
  id: string;
  name: string;
  toStatus?: string;
}

export interface AssignableUser {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
}
