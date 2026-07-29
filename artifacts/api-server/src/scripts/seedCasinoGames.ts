// One-time import of the consolidated provider catalog (casinoGames.json)
// into Postgres. Run with: pnpm --filter @workspace/api-server run seed:casino
//
// There is no documented "list all games" endpoint from the aggregator (only
// GetGameUrl for launch and the wallet callback), so this seeds from the
// static JSON snapshot rather than a live sync. Re-run after refreshing that
// JSON to pick up new/renamed games — existing rows are upserted by
// (provider, game_uid) in a single bulk statement, never duplicated.
import { sql } from "drizzle-orm";
import { db, casinoGamesTable, initDb } from "@workspace/db";
import casinoGamesData from "../data/casinoGames.json" with { type: "json" };

type SourceGame = {
  id: string;
  name: string;
  provider: string;
  vendorCode: number | null;
  category: string;
  img: string | null;
};

async function main() {
  // This script can run standalone (e.g. `railway run ... seed:casino`)
  // without the main server ever having booted, so it can't assume
  // initDb() already created the table — ensure it here first.
  await initDb();

  const games = casinoGamesData as SourceGame[];
  const now = new Date();

  // Several titles are relisted under more than one "provider" label by the
  // aggregator (e.g. the same BGaming slot appears under BNG, BNG Asia and
  // BGaming), but only some of those copies carry an image URL. Backfill the
  // ones that don't from a same-named copy that does, instead of showing the
  // dice placeholder when a real thumbnail is available under a sibling entry.
  const imgByName = new Map<string, string>();
  for (const g of games) {
    const key = g.name.trim().toLowerCase();
    if (g.img && !imgByName.has(key)) imgByName.set(key, g.img);
  }

  await db.insert(casinoGamesTable).values(
    games.map((g) => ({
      provider: g.provider,
      gameUid: g.id,
      name: g.name,
      vendorCode: g.vendorCode,
      category: g.category,
      img: g.img ?? imgByName.get(g.name.trim().toLowerCase()) ?? null,
      isActive: true,
      updatedAt: now,
    })),
  ).onConflictDoUpdate({
    target: [casinoGamesTable.provider, casinoGamesTable.gameUid],
    set: {
      name: sql`excluded.name`,
      vendorCode: sql`excluded.vendor_code`,
      category: sql`excluded.category`,
      img: sql`excluded.img`,
      updatedAt: sql`excluded.updated_at`,
    },
  });

  console.log(`Seeded ${games.length} casino games into Postgres.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Casino games seed failed:", err);
  process.exit(1);
});
