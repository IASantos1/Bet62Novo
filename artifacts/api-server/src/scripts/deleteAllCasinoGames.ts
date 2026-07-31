// Permanently deletes every row from casino_games — for when the whole
// aggregator integration is being replaced (a different provider/system),
// not just paused. Unlike casino:disable-all (is_active=false, trivially
// reversible), this actually empties the table; re-populating afterward
// means re-running seed:casino from the JSON snapshot, or seeding fresh
// data for whatever new system replaces it.
//
// Run with: pnpm --filter @workspace/api-server run casino:delete-all
import { sql } from "drizzle-orm";
import { db, initDb } from "@workspace/db";

async function main() {
  await initDb();
  const result = await db.execute(sql`DELETE FROM casino_games`);
  console.log(`Deleted ${result.rowCount ?? 0} casino games.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Casino games deletion failed:", err);
  process.exit(1);
});
