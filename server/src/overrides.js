import { db } from "./db.js";

export const QUADRANTS = new Set(["do-first", "schedule", "delegate", "eliminate"]);

// Placement = a user's explicit choice of quadrant and/or manual rank for an
// issue, keyed by issue. Position is the issue's index within its quadrant's
// manual order (lower sorts first); issues without a placement fall back to
// the Jira-computed quadrant and the JQL's default order.
export async function getPlacements(userId) {
  const { rows } = await db.query(
    "SELECT issue_key, quadrant, position FROM quadrant_overrides WHERE user_id = $1",
    [userId],
  );
  return new Map(rows.map((row) => [row.issue_key, { quadrant: row.quadrant, position: row.position }]));
}

// Sets the manual order for an entire quadrant: issueKeys is the full list of
// issue keys in that quadrant, top to bottom. Every issue in the list is
// (re)placed into `quadrant` at its index, which both records a cross-quadrant
// move (if any) and the manual rank in one write. All writes share one
// transaction (checked-out client, not the shared pool) so a partial
// reorder can never persist if a later row in the batch fails.
export async function setQuadrantOrder(userId, quadrant, issueKeys) {
  if (!QUADRANTS.has(quadrant)) {
    throw new Error(`Invalid quadrant: ${quadrant}`);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const [index, issueKey] of issueKeys.entries()) {
      await client.query(
        `INSERT INTO quadrant_overrides (user_id, issue_key, quadrant, position, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id, issue_key) DO UPDATE SET
           quadrant = EXCLUDED.quadrant,
           position = EXCLUDED.position,
           updated_at = EXCLUDED.updated_at`,
        [userId, issueKey, quadrant, index],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
