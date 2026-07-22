import { db } from "./db.js";

export const QUADRANTS = new Set(["do-first", "schedule", "delegate", "eliminate"]);

// Placement = a user's explicit choice of quadrant and/or manual rank for an
// issue, keyed by issue. Position is the issue's index within its quadrant's
// manual order (lower sorts first); issues without a placement fall back to
// the Jira-computed quadrant and the JQL's default order.
export function getPlacements(userId) {
  const rows = db
    .prepare("SELECT issue_key, quadrant, position FROM quadrant_overrides WHERE user_id = ?")
    .all(userId);
  return new Map(rows.map((row) => [row.issue_key, { quadrant: row.quadrant, position: row.position }]));
}

// Sets the manual order for an entire quadrant: issueKeys is the full list of
// issue keys in that quadrant, top to bottom. Every issue in the list is
// (re)placed into `quadrant` at its index, which both records a cross-quadrant
// move (if any) and the manual rank in one write.
export function setQuadrantOrder(userId, quadrant, issueKeys) {
  if (!QUADRANTS.has(quadrant)) {
    throw new Error(`Invalid quadrant: ${quadrant}`);
  }

  const stmt = db.prepare(
    `INSERT INTO quadrant_overrides (user_id, issue_key, quadrant, position, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, issue_key) DO UPDATE SET
       quadrant = excluded.quadrant,
       position = excluded.position,
       updated_at = excluded.updated_at`,
  );

  const setAll = db.transaction((keys) => {
    keys.forEach((issueKey, index) => stmt.run(userId, issueKey, quadrant, index));
  });
  setAll(issueKeys);
}
