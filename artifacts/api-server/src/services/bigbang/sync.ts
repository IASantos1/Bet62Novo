import { casinoGamesTable, db } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { kvCache } from "../cache/kvCache.js";
import { type BigBangGame, bigBangListGamesPage } from "./client.js";

const BIGBANG_SYNC_TS_CACHE_KEY = "casino:bigbang:last-sync-ts";
const BIGBANG_SYNC_TTL_MS = 6 * 60 * 60 * 1000;
const BIGBANG_PAGE_LIMIT = 5000;

let inFlightSync: Promise<{
  inserted: number;
  updated: number;
  deactivated: number;
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

type NormalizedGame = ReturnType<typeof normalizeGame>;

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// BigBang's own feed sometimes re-lists the exact same title under more
// than one game id (seen in production as visually identical cards, e.g.
// several "Sweet Bonanza" entries back to back — 2026-09-29). Each id still
// gets its own casino_games row (the unique index is on gameUid, not name),
// so nothing here ever collapses two DB rows into one; instead we pick a
// single canonical id per duplicate title before it reaches the
// insert/update diff below, and deactivate the losers if they were already
// synced from an earlier run. Only auto-merge when every entry in the
// group shares the same thumbnail (or has none) — a same-titled game with
// a genuinely different thumbnail is left untouched as an ambiguous case
// for manual review via the admin catalog toggle, rather than risk hiding
// a real, distinct game.
export function dedupeNormalizedGames(games: NormalizedGame[]): {
  winners: NormalizedGame[];
  loserGameUids: string[];
} {
  const groups = new Map<string, NormalizedGame[]>();
  for (const game of games) {
    const key = normalizeNameKey(game.name);
    const list = groups.get(key);
    if (list) list.push(game);
    else groups.set(key, [game]);
  }

  const winners: NormalizedGame[] = [];
  const loserGameUids: string[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      winners.push(group[0]!);
      continue;
    }
    const imgs = new Set(group.map((g) => g.img).filter((img): img is string => !!img));
    if (imgs.size > 1) {
      logger.warn(
        { name: group[0]!.name, gameUids: group.map((g) => g.gameUid) },
        "[bigbang] same-titled games with different thumbnails — left active, needs manual review",
      );
      winners.push(...group);
      continue;
    }
    const [winner, ...losers] = [...group].sort((a, b) =>
      a.gameUid.localeCompare(b.gameUid, undefined, { numeric: true }),
    );
    winners.push(winner!);
    loserGameUids.push(...losers.map((g) => g.gameUid));
  }

  return { winners, loserGameUids };
}

export async function syncBigBangCatalog(force = false): Promise<{
  inserted: number;
  updated: number;
  deactivated: number;
  totalRemote: number;
}> {
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    const lastSyncRaw = await kvCache.get(BIGBANG_SYNC_TS_CACHE_KEY);
    const lastSyncTs = Number(lastSyncRaw ?? 0);
    if (!force && Number.isFinite(lastSyncTs) && lastSyncTs > 0) {
      const ageMs = Date.now() - lastSyncTs;
      if (ageMs >= 0 && ageMs < BIGBANG_SYNC_TTL_MS) {
        return { inserted: 0, updated: 0, deactivated: 0, totalRemote: 0 };
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

    const { winners: normalized, loserGameUids } = dedupeNormalizedGames(
      remoteGames.map(normalizeGame),
    );
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

    // Duplicate titles from a *previous* sync (before this dedup existed,
    // or a loser that only became a duplicate on this run) still have their
    // own active row — take those down now rather than leaving them to
    // rot as permanent visual dupes in the catalog.
    let deactivated = 0;
    const loserIds = loserGameUids
      .map((uid) => existingByUid.get(uid)?.id)
      .filter((id): id is number => typeof id === "number");
    if (loserIds.length > 0) {
      const result = await db
        .update(casinoGamesTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(inArray(casinoGamesTable.id, loserIds), eq(casinoGamesTable.isActive, true)))
        .returning({ id: casinoGamesTable.id });
      deactivated = result.length;
    }

    await kvCache.set(
      BIGBANG_SYNC_TS_CACHE_KEY,
      String(Date.now()),
      Math.ceil(BIGBANG_SYNC_TTL_MS / 1000),
    );
    logger.info(
      { inserted, updated, deactivated, totalRemote: normalized.length },
      "[bigbang] casino catalog synced",
    );
    return { inserted, updated, deactivated, totalRemote: normalized.length };
  })().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
}

export async function ensureBigBangCatalogFresh(): Promise<void> {
  await syncBigBangCatalog(false);
}
