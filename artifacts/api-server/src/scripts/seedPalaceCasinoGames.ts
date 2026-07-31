// Imports the Palace Casino game catalog into Postgres (casino_games,
// source="palace") — a live sync against their /game/providers and
// /game/games endpoints, unlike seedCasinoGames.ts (SilentAPI) which seeds
// from a static JSON snapshot because no live listing endpoint exists for
// that aggregator.
//
// Run with: pnpm --filter @workspace/api-server run seed:palace-casino
import { sql } from "drizzle-orm";
import { db, casinoGamesTable, initDb } from "@workspace/db";
import {
  getPalaceCasinoProviders,
  getPalaceCasinoGames,
  type PalaceCasinoGame,
} from "../services/palaceCasino/client.js";

const SOURCE = "palace";

async function main() {
  // Standalone-runnable (e.g. `railway run ... seed:palace-casino`) without
  // the main server having booted first — same reasoning as seedCasinoGames.ts.
  await initDb();

  const providers = await getPalaceCasinoProviders();
  const active = providers.filter((p) => p.status === 1);
  console.log(
    `Found ${providers.length} providers (${active.length} active, ${
      providers.length - active.length
    } in maintenance).`,
  );

  const rows: Array<{
    provider: string;
    gameUid: string;
    name: string;
    vendorCode: number;
    category: string;
    img: string | null;
    isActive: boolean;
    source: string;
  }> = [];

  for (const provider of active) {
    let games: PalaceCasinoGame[];
    try {
      games = await getPalaceCasinoGames(provider.provider_id);
    } catch (err) {
      console.error(
        `Skipping provider ${provider.provider_name} (${provider.provider_id}):`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    for (const g of games) {
      rows.push({
        provider: provider.provider_name,
        gameUid: g.game_code,
        name: g.game_name,
        // provider_id doubles as the launch-time provider identifier
        // (routes/casino.ts's /palace/launch needs it) - reusing
        // vendor_code rather than adding a new column for it.
        vendorCode: provider.provider_id,
        category: g.category,
        img: g.game_image || null,
        isActive: g.launch_enable,
        source: SOURCE,
      });
    }
    console.log(`  ${provider.provider_name}: ${games.length} games`);
  }

  if (rows.length === 0) {
    console.log("No games found — nothing to seed.");
    process.exit(0);
  }

  const now = new Date();
  await db
    .insert(casinoGamesTable)
    .values(rows.map((r) => ({ ...r, updatedAt: now })))
    .onConflictDoUpdate({
      target: [
        casinoGamesTable.provider,
        casinoGamesTable.gameUid,
        casinoGamesTable.source,
      ],
      set: {
        name: sql`excluded.name`,
        vendorCode: sql`excluded.vendor_code`,
        category: sql`excluded.category`,
        img: sql`excluded.img`,
        isActive: sql`excluded.is_active`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  // Deactivate palace-sourced rows no longer present in this sync (game
  // removed from the agent's catalog, provider went into maintenance)
  // instead of leaving stale entries visible - same pattern as
  // seedCasinoGames.ts's post-upsert cleanup.
  const keptKeys = rows.map((r) => `${r.provider}:${r.gameUid}`);
  await db.execute(sql`
    UPDATE casino_games
    SET is_active = false, updated_at = NOW()
    WHERE source = ${SOURCE}
      AND (provider || ':' || game_uid) <> ALL(${keptKeys})
      AND is_active = true
  `);

  console.log(`Seeded ${rows.length} Palace Casino games into Postgres.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Palace Casino games seed failed:", err);
  process.exit(1);
});
