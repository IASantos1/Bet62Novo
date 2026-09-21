import { casinoGamesTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { kvCache } from "../cache/kvCache.js";
import { type BigBangGame, bigBangListGamesPage } from "./client.js";

const BIGBANG_SYNC_TS_CACHE_KEY = "casino:bigbang:last-sync-ts";
const BIGBANG_SYNC_TTL_MS = 6 * 60 * 60 * 1000;
const BIGBANG_PAGE_LIMIT = 5000;

let inFlightSync: Promise<{
  inserted: number;
  updated: number;
  totalRemote: number;
}> | null = null;
type CasinoGameInsert = typeof casinoGamesTable.$inferInsert;

function mapCasinoCategory(game: BigBangGame): string {
  if (game.game_type === "live") return "ao vivo";
  if (game.game_type === "crash") return "crash";
  const title = `${game.title ?? ""} ${game.name ?? ""}`.toLowerCase();
  if (title.includes("baccarat")) return "baccarat";
  if (title.includes("blackjack")) return "blackjack";
  if (title.includes("roulette")) return "roulette";
  return "slots";
}

function normalizeGame(game: BigBangGame) {
  return {
    provider: String(game.provider ?? game.category_title ?? game.category ?? "BigBang"),
    gameUid: String(game.id),
    name: String(game.title ?? game.name ?? game.id),
    vendorCode: Number.isInteger(game.id) ? game.id : null,
    category: mapCasinoCategory(game),
    img: game.thumbnail ?? null,
    source: "bigbang",
  } as const;
}

export async function syncBigBangCatalog(force = false): Promise<{
  inserted: number;
  updated: number;
  totalRemote: number;
}> {
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    const lastSyncRaw = await kvCache.get(BIGBANG_SYNC_TS_CACHE_KEY);
    const lastSyncTs = Number(lastSyncRaw ?? 0);
    if (!force && Number.isFinite(lastSyncTs) && lastSyncTs > 0) {
      const ageMs = Date.now() - lastSyncTs;
      if (ageMs >= 0 && ageMs < BIGBANG_SYNC_TTL_MS) {
        return { inserted: 0, updated: 0, totalRemote: 0 };
      }
    }

    const remoteGames: BigBangGame[] = [];
    for (let offset = 0; ; offset += BIGBANG_PAGE_LIMIT) {
      const page = await bigBangListGamesPage({
        limit: BIGBANG_PAGE_LIMIT,
        offset,
      });
      remoteGames.push(...page.data);
      const total = Number(page.pagination?.total ?? 0);
      if (page.data.length < BIGBANG_PAGE_LIMIT) break;
      if (total > 0 && offset + BIGBANG_PAGE_LIMIT >= total) break;
    }

    const normalized = remoteGames.map(normalizeGame);
    const existing = await db
      .select({
        id: casinoGamesTable.id,
        provider: casinoGamesTable.provider,
        gameUid: casinoGamesTable.gameUid,
        name: casinoGamesTable.name,
        vendorCode: casinoGamesTable.vendorCode,
        category: casinoGamesTable.category,
        img: casinoGamesTable.img,
      })
      .from(casinoGamesTable)
      .where(eq(casinoGamesTable.source, "bigbang"));

    const existingByUid = new Map<string, (typeof existing)[number]>(
      existing.map((row) => [row.gameUid, row]),
    );
    const inserts: CasinoGameInsert[] = [];
    let updated = 0;

    for (const row of normalized) {
      const current = existingByUid.get(row.gameUid);
      if (!current) {
        inserts.push({
          ...row,
          isActive: true,
          popularity: 0,
        });
        continue;
      }

      if (
        current.provider !== row.provider ||
        current.name !== row.name ||
        current.vendorCode !== row.vendorCode ||
        current.category !== row.category ||
        current.img !== row.img
      ) {
        await db
          .update(casinoGamesTable)
          .set({
            provider: row.provider,
            name: row.name,
            vendorCode: row.vendorCode,
            category: row.category,
            img: row.img,
            updatedAt: new Date(),
          })
          .where(eq(casinoGamesTable.id, current.id));
        updated += 1;
      }
    }

    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 500) {
      const chunk = inserts.slice(i, i + 500);
      if (chunk.length === 0) continue;
      await db.insert(casinoGamesTable).values(chunk);
      inserted += chunk.length;
    }

    await kvCache.set(
      BIGBANG_SYNC_TS_CACHE_KEY,
      String(Date.now()),
      Math.ceil(BIGBANG_SYNC_TTL_MS / 1000),
    );
    logger.info(
      { inserted, updated, totalRemote: normalized.length },
      "[bigbang] casino catalog synced",
    );
    return { inserted, updated, totalRemote: normalized.length };
  })().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
}

export async function ensureBigBangCatalogFresh(): Promise<void> {
  await syncBigBangCatalog(false);
}
