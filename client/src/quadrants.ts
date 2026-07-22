import type { Quadrant } from "./types";

// Criticality accent, reusing the same reserved status palette as priority/status —
// a light touch, not a full recolor of each quadrant.
export type QuadrantAccent = "critical" | "serious" | "warning" | "good";

export const QUADRANTS: Array<{
  id: Quadrant;
  title: string;
  subtitle: string;
  accent: QuadrantAccent;
}> = [
  { id: "do-first", title: "Do First", subtitle: "Urgent & important", accent: "critical" },
  { id: "schedule", title: "Schedule", subtitle: "Important, not urgent", accent: "serious" },
  { id: "delegate", title: "Delegate", subtitle: "Urgent, not important", accent: "warning" },
  { id: "eliminate", title: "Eliminate", subtitle: "Neither", accent: "good" },
];
