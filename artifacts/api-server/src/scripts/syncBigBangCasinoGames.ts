// Manual BigBang catalog sync — forces a fresh pull from the provider into
// casino_games, bypassing the normal TTL-based on-demand sync used by the
// public/admin routes and the startup warmup.
//
// Run with: pnpm --filter @workspace/api-server run casino:sync-bigbang
import { initDb } from "@workspace/db";
import { syncBigBangCatalog } from "../services/bigbang/sync.js";

async function main() {
  await initDb();
  const result = await syncBigBangCatalog(true);
  console.log(
    `BigBang sync complete: inserted=${result.inserted} updated=${result.updated} totalRemote=${result.totalRemote}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("syncBigBangCasinoGames failed:", err);
    process.exit(1);
  });
