// Deactivates every game in the casino catalog — the whole "Cassino" tab
// goes empty (isActive=true is what /api/casino/games and /api/casino/providers
// filter on) without deleting the seeded rows, so it's trivially reversible:
// re-run `pnpm run seed:casino` to reactivate the full catalog again, or flip
// individual rows back with a targeted UPDATE.
//
// Run with: pnpm --filter @workspace/api-server run casino:disable-all
import { sql } from "drizzle-orm";
import { db, initDb } from "@workspace/db";

async function main() {
  await initDb();
  const result = await db.execute(
    sql`UPDATE casino_games SET is_active = false, updated_at = NOW() WHERE is_active = true`,
  );
  console.log(`Deactivated ${result.rowCount ?? 0} casino games.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Casino games deactivation failed:", err);
  process.exit(1);
});
