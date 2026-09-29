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

// Categories where a generic, non-branded title (just "Blackjack",
// "Roulette", "Baccarat") is genuinely common across unrelated studios —
// unlike a slot title ("Sweet Bonanza 1000 DICE"), which is a specific
// branded product essentially guaranteed to be unique across the whole
// industry. Two same-titled *slots* are, in practice, always the same
// underlying game re-listed twice by the aggregator; two same-titled
// *table games* might legitimately be two different studios' takes on a
// classic. Only this second group gets the more cautious thumbnail check.
const GENERIC_TITLE_RISK_CATEGORIES = new Set(["blackjack", "roulette", "baccarat"]);

// BigBang's own feed sometimes re-lists the exact same title under more
// than one game id (seen in production as visually identical cards, e.g.
// several "Sweet Bonanza" entries back to back — 2026-09-29). Each id still
// gets its own casino_games row (the unique index is on gameUid, not name),
// so nothing here ever collapses two DB rows into one; instead we pick a
// single canonical id per duplicate title before it reaches the
// insert/update diff below, and deactivate the losers if they were already
// synced from an earlier run.
//
// Merging used to also require every entry in the group to share the same
// thumbnail, on the theory that a same-titled game with a different
// thumbnail might be a genuinely distinct game. In production this made
// the merge never actually fire: BigBang serves a per-id thumbnail URL, so
// two listings of the exact same slot still end up with two different img
// values, and the "ambiguous" branch left both active — the bug this dedup
// was supposed to fix (2026-09-30). Slots/crash/live-category titles are
// branded and unique enough that the name match alone is reliable; only
// the generic table-game titles above still get the thumbnail check.
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
    const categories = new Set(group.map((g) => g.category));
    if (categories.size === 1 && GENERIC_TITLE_RISK_CATEGORIES.has(group[0]!.category)) {
      const imgs = new Set(group.map((g) => g.img).filter((img): img is string => !!img));
      if (imgs.size > 1) {
        logger.warn(
          { name: group[0]!.name, category: group[0]!.category, gameUids: group.map((g) => g.gameUid) },
          "[bigbang] same-titled table games with different thumbnails — left active, needs manual review",
        );
        winners.push(...group);
        continue;
      }
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

    // Every id BigBang returned this run, winners and dedup losers alike —
    // used below to tell "still in the remote catalog" apart from "gone".
    const allRemoteGameUids = new Set(remoteGames.map((g) => String(g.id)));

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
        isActive: casinoGamesTable.isActive,
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

      // A game still present in the remote catalog must end up active,
      // even if nothing else about it changed — this row could be
      // reactivating from a plan change, an earlier dedup loss, or a
      // manual admin toggle. Reconciling isActive here (not just the
      // content fields) is what makes a resync actually self-heal instead
      // of requiring every stale row to be hunted down by hand.
      if (
        current.provider !== row.provider ||
        current.name !== row.name ||
        current.vendorCode !== row.vendorCode ||
        current.category !== row.category ||
        current.img !== row.img ||
        !current.isActive
      ) {
        await db
          .update(casinoGamesTable)
          .set({
            provider: row.provider,
            name: row.name,
            vendorCode: row.vendorCode,
            category: row.category,
            img: row.img,
            isActive: true,
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
      deactivated += result.length;
    }

    // A row whose gameUid never showed up anywhere in this fetch — not as
    // a winner, not as a dedup loser — no longer exists in BigBang's
    // catalog at all. This previously had no cleanup path: the insert/
    // update loop above only ever touches rows BigBang still lists, so an
    // id that disappeared (e.g. every id changing after a BigBang plan/
    // entitlement upgrade) stayed active forever, permanently doubling the
    // visible catalog alongside its replacement — confirmed in production
    // (~7300 games becoming ~14600) even after the title-dedup fix above,
    // since that fix only ever collapses duplicates *within* one fetch
    // (2026-09-30).
    const staleIds = existing
      .filter((row) => row.isActive && !allRemoteGameUids.has(row.gameUid))
      .map((row) => row.id);
    for (let i = 0; i < staleIds.length; i += 500) {
      const chunk = staleIds.slice(i, i + 500);
      if (chunk.length === 0) continue;
      const result = await db
        .update(casinoGamesTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(inArray(casinoGamesTable.id, chunk), eq(casinoGamesTable.isActive, true)))
        .returning({ id: casinoGamesTable.id });
      deactivated += result.length;
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
