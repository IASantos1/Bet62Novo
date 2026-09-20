// Deactivates every row in casino_games (isActive=false) — run once as part
// of removing the SilentAPI + Palace Casino integrations entirely
// (2026-09-20+, user decision). The catalog table itself is left in place
// (no rows deleted, no schema change) so historical game metadata and any
// downstream references (e.g. casino_banners.gameIds) stay valid; the
// /games, /games/grouped, /providers and /banners routes in routes/casino.ts
// already only ever show isActive=true rows, so this alone empties the
// visible catalog without touching ledger/transaction history.
//
// Run with: pnpm --filter @workspace/api-server run casino:disable-all
import { eq, sql } from "drizzle-orm";
import { db, casinoGamesTable, initDb } from "@workspace/db";

async function main() {
  await initDb();

  const result = await db
    .update(casinoGamesTable)
    .set({ isActive: false, updatedAt: sql`now()` })
    .where(eq(casinoGamesTable.isActive, true))
    .returning({ id: casinoGamesTable.id });

  console.log(`Deactivated ${result.length} casino game row(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("deactivateAllCasinoGames failed:", err);
    process.exit(1);
  });
