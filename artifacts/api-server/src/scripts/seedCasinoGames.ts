// One-time import of the consolidated provider catalog (casinoGames.json)
// into Postgres. Run with: pnpm --filter @workspace/api-server run seed:casino
//
// There is no documented "list all games" endpoint from the aggregator (only
// GetGameUrl for launch and the wallet callback), so this seeds from the
// static JSON snapshot rather than a live sync. Re-run after refreshing that
// JSON to pick up new/renamed games — existing rows are upserted by
// (provider, game_uid) in a single bulk statement, never duplicated.
import { sql } from "drizzle-orm";
import { db, casinoGamesTable } from "@workspace/db";
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
  const games = casinoGamesData as SourceGame[];
  const now = new Date();

  await db.insert(casinoGamesTable).values(
    games.map((g) => ({
      provider: g.provider,
      gameUid: g.id,
      name: g.name,
      vendorCode: g.vendorCode,
      category: g.category,
      img: g.img,
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
