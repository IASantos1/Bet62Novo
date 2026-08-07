// One-time import of the consolidated provider catalog (casinoGames.json)
// into Postgres, source="silentapi". Run with:
//   pnpm --filter @workspace/api-server run seed:casino
//
// There is no documented "list all games" endpoint from SilentAPI (only
// GetGameUrl for launch and the wallet callback), so this seeds from the
// static JSON snapshot rather than a live sync — unlike Palace Casino's
// seed (seedPalaceCasinoGames.ts), which syncs live against their API.
// Re-run after refreshing that JSON to pick up new/renamed games — existing
// rows are upserted by (provider, game_uid, source) in a single bulk
// statement, never duplicated.
//
// Read at runtime (not a static `import ... with { type: "json" }`) so a
// missing/not-yet-provided catalog file doesn't break the build or
// typecheck — it only fails when this script actually runs without one.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, casinoGamesTable, initDb } from "@workspace/db";

const SOURCE = "silentapi";
const CATALOG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/casinoGames.json",
);

type SourceGame = {
  id: string;
  name: string;
  provider: string;
  vendorCode: number | null;
  category: string;
  img: string | null;
};

async function main() {
  let raw: string;
  try {
    raw = readFileSync(CATALOG_PATH, "utf8");
  } catch {
    console.error(
      `No catalog file at ${CATALOG_PATH} — drop the SilentAPI games JSON there (array of ` +
        `{id, name, provider, vendorCode, category, img}) before running this seed.`,
    );
    process.exit(1);
  }
  const games = JSON.parse(raw) as SourceGame[];

  // This script can run standalone (e.g. `railway run ... seed:casino`)
  // without the main server ever having booted, so it can't assume
  // initDb() already created the table — ensure it here first.
  await initDb();

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

  // Collapse same-named relists down to a single tile — showing "3 African
  // Drums" three times (once per provider label) reads as broken/duplicated
  // to a player even though each copy is a technically distinct catalog row.
  // Keep whichever copy has a real thumbnail; if none do, keep the first seen.
  const bestByName = new Map<string, SourceGame>();
  for (const g of games) {
    const key = g.name.trim().toLowerCase();
    const existing = bestByName.get(key);
    if (!existing || (!existing.img && g.img)) bestByName.set(key, g);
  }
  const deduped = [...bestByName.values()];

  await db
    .insert(casinoGamesTable)
    .values(
      deduped.map((g) => ({
        provider: g.provider,
        gameUid: g.id,
        name: g.name,
        vendorCode: g.vendorCode,
        category: g.category,
        img: g.img ?? imgByName.get(g.name.trim().toLowerCase()) ?? null,
        isActive: true,
        source: SOURCE,
        updatedAt: now,
      })),
    )
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
        isActive: true,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  // Deactivate rows from a previous run that are no longer in the deduped
  // set (e.g. a sibling relist that lost the "best copy" pick, or a game
  // dropped from the source JSON) instead of leaving stale duplicates
  // visible. Scoped to source="silentapi" so this never touches Palace
  // Casino's rows, which share the same (provider, game_uid) key space.
  const keptKeys = deduped.map((g) => `${g.provider}:${g.id}`);
  await db.execute(sql`
    UPDATE casino_games
    SET is_active = false, updated_at = NOW()
    WHERE source = ${SOURCE}
      AND (provider || ':' || game_uid) <> ALL(${keptKeys})
      AND is_active = true
  `);

  console.log(
    `Seeded ${deduped.length} unique SilentAPI casino games (from ${games.length} raw entries) into Postgres.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Casino games seed failed:", err);
  process.exit(1);
});
