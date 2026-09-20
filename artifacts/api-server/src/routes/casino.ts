import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  casinoGamesTable,
  casinoBannersTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { kvCache } from "../services/cache/kvCache.js";

const router: IRouter = Router();

// SilentAPI and Palace Casino removed entirely 2026-09-20+ (explicit user
// decision) — the casino catalog (casino_games table) is left in place but
// every row was deactivated (isActive=false) as part of the removal, so
// /games and /providers below now always return empty. The front-end pages
// through the catalog 24 games at a time and never talks to either former
// aggregator directly for listing.
const GAMES_CACHE_TTL_SECONDS = 300;
const PROVIDERS_CACHE_TTL_SECONDS = 3600;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

// ── Franchise grouping ("Gates of Olympus", "Big Bass", ...) for the
// horizontal-scroll rows browsing view. There's no franchise field from
// the provider — this derives one from the game name: normalize, drop a
// leading article, then key on the first two remaining words. Verified
// against the real catalog: "Gates of Olympus"/"Gates of Olympus 1000"/
// "...Xmas 1000" all key to "gates olympus" (distinct from "Gates of
// Gatot Kaca" -> "gates gatot"); "5 Lions"/"5 Lions Gold"/"5 Lions Dance"
// all key to "5 lions"; "Big Bass Bonanza" and "Bigger Bass Bonanza" key
// differently ("big bass" vs "bigger bass") - two related but genuinely
// different rows, which matches what was asked for explicitly.
const LEADING_ARTICLES = new Set(["the", "a", "an"]);

function gameFamilyKey(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[™®©'']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length > 0 && LEADING_ARTICLES.has(tokens[0]!)) tokens.shift();
  const key = tokens.slice(0, 2).join(" ");
  return key || cleaned || name.toLowerCase();
}

// Category pills the front-end offers ("Todos", "Populares", "Novos",
// "Slots", "Ao Vivo", "Baccarat", "Blackjack", "Roulette"). Palace Casino's
// own category field only ever carries "Slots" or "Ao Vivo" (see
// PalaceCasinoGame.category in services/palaceCasino/client.ts) — there is
// no richer taxonomy (Megaways, Jackpots, Bonus Buy, Free Spins) available
// from the aggregator, so those pills are intentionally NOT offered here
// rather than shipping a filter that would silently return nothing or an
// incomplete/wrong subset for a real-money catalog. Baccarat/Blackjack/
// Roulette aren't a Palace Casino category either, but the game type is
// reliably embedded in the title for every table game we've seen in the
// catalog, so a name match is a genuine (not approximated) filter for
// those three specifically.
const NAME_KEYWORD_CATEGORIES = new Set(["baccarat", "blackjack", "roulette"]);

router.get("/games", async (req: Request, res: Response) => {
  const provider = typeof req.query["provider"] === "string" ? req.query["provider"].trim() : "";
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
  const category =
    typeof req.query["category"] === "string" ? req.query["category"].trim().toLowerCase() : "";
  const sort = typeof req.query["sort"] === "string" ? req.query["sort"].trim().toLowerCase() : "popular";
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query["limit"]) || DEFAULT_LIMIT));

  const cacheKey = `casino:games:v3:${provider || "*"}:${category || "*"}:${sort}:${search.toLowerCase()}:${page}:${limit}`;
  const cached = await kvCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  // Palace Casino only — SilentAPI is suspended (kept as dormant code, not
  // deleted, in case that decision changes again; explicitly filtered out
  // here rather than relying on its catalog happening to be empty).
  const conditions = [
    eq(casinoGamesTable.isActive, true),
    eq(casinoGamesTable.source, "palace"),
  ];
  // ilike, not exact eq — the frontend's default-view provider filter
  // ("Pragmatic") is a hardcoded substring, not necessarily Palace
  // Casino's exact provider_name string (could be "Pragmatic Play",
  // "PragmaticPlay", etc.) — an exact-match miss here would silently
  // render an empty catalog instead of erroring, which is worse than a
  // slightly loose match.
  if (provider && provider !== "Todos") conditions.push(ilike(casinoGamesTable.provider, `%${provider}%`));
  if (search) conditions.push(ilike(casinoGamesTable.name, `%${search}%`));
  if (category === "slots" || category === "ao vivo") {
    conditions.push(ilike(casinoGamesTable.category, category));
  } else if (NAME_KEYWORD_CATEGORIES.has(category)) {
    conditions.push(ilike(casinoGamesTable.name, `%${category}%`));
  }
  // "todos" / "populares" / "novos" / "" carry no extra WHERE — they only
  // affect the ORDER BY below.
  const where = and(...conditions);

  const orderBy =
    sort === "new"
      ? [desc(casinoGamesTable.createdAt), asc(casinoGamesTable.name)]
      : sort === "az"
        ? [asc(casinoGamesTable.name)]
        : [desc(casinoGamesTable.popularity), asc(casinoGamesTable.name)];

  const [games, [{ total }]] = await Promise.all([
    db
      .select({
        id: casinoGamesTable.gameUid,
        name: casinoGamesTable.name,
        provider: casinoGamesTable.provider,
        vendorCode: casinoGamesTable.vendorCode,
        category: casinoGamesTable.category,
        img: casinoGamesTable.img,
        source: casinoGamesTable.source,
      })
      .from(casinoGamesTable)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(casinoGamesTable).where(where),
  ]);

  const payload = JSON.stringify({ page, limit, total: Number(total), games });
  await kvCache.set(cacheKey, payload, GAMES_CACHE_TTL_SECONDS);
  res.setHeader("Content-Type", "application/json");
  res.send(payload);
});

const GROUPS_CACHE_TTL_SECONDS = 300;
const DEFAULT_GROUPS_LIMIT = 12;
const MAX_GROUPS_LIMIT = 30;

// Browsing-by-franchise view: paginates whole rows (franchises), not
// individual games — page 1 might return 12 rows totalling 40 games. Not
// used for search (a handful of matches split into many 1-game rows isn't
// useful there); the front-end falls back to the flat /games list once a
// search term is entered.
router.get("/games/grouped", async (req: Request, res: Response) => {
  const provider = typeof req.query["provider"] === "string" ? req.query["provider"].trim() : "";
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(
    MAX_GROUPS_LIMIT,
    Math.max(1, Number(req.query["limit"]) || DEFAULT_GROUPS_LIMIT),
  );

  const cacheKey = `casino:games-grouped:v1:${provider || "*"}:${page}:${limit}`;
  const cached = await kvCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const conditions = [
    eq(casinoGamesTable.isActive, true),
    eq(casinoGamesTable.source, "palace"),
  ];
  // ilike, not exact eq — the frontend's default-view provider filter
  // ("Pragmatic") is a hardcoded substring, not necessarily Palace
  // Casino's exact provider_name string (could be "Pragmatic Play",
  // "PragmaticPlay", etc.) — an exact-match miss here would silently
  // render an empty catalog instead of erroring, which is worse than a
  // slightly loose match.
  if (provider && provider !== "Todos") conditions.push(ilike(casinoGamesTable.provider, `%${provider}%`));

  const rows = await db
    .select({
      id: casinoGamesTable.gameUid,
      name: casinoGamesTable.name,
      provider: casinoGamesTable.provider,
      vendorCode: casinoGamesTable.vendorCode,
      category: casinoGamesTable.category,
      img: casinoGamesTable.img,
      source: casinoGamesTable.source,
      popularity: casinoGamesTable.popularity,
    })
    .from(casinoGamesTable)
    .where(and(...conditions))
    .orderBy(asc(casinoGamesTable.name));

  const byKey = new Map<
    string,
    { name: string; games: Omit<(typeof rows)[number], "popularity">[] }
  >();
  for (const row of rows) {
    const key = gameFamilyKey(row.name);
    const { popularity: _popularity, ...game } = row;
    const existing = byKey.get(key);
    if (existing) {
      existing.games.push(game);
      // Shortest name is usually the base game ("Gates of Olympus" over
      // "Gates of Olympus 1000") - use it as the row title.
      if (game.name.length < existing.name.length) existing.name = game.name;
    } else {
      byKey.set(key, { name: game.name, games: [game] });
    }
  }

  const allGroups = [...byKey.values()].sort(
    (a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name),
  );

  const totalGroups = allGroups.length;
  const groups = allGroups.slice((page - 1) * limit, page * limit);

  const payload = JSON.stringify({ page, limit, totalGroups, groups });
  await kvCache.set(cacheKey, payload, GROUPS_CACHE_TTL_SECONDS);
  res.setHeader("Content-Type", "application/json");
  res.send(payload);
});

router.get("/providers", async (_req: Request, res: Response) => {
  const cacheKey = "casino:providers:v2";
  const cached = await kvCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const rows = await db
    .selectDistinct({ provider: casinoGamesTable.provider })
    .from(casinoGamesTable)
    .where(and(eq(casinoGamesTable.isActive, true), eq(casinoGamesTable.source, "palace")))
    .orderBy(asc(casinoGamesTable.provider));

  const payload = JSON.stringify({ providers: rows.map((r) => r.provider) });
  await kvCache.set(cacheKey, payload, PROVIDERS_CACHE_TTL_SECONDS);
  res.setHeader("Content-Type", "application/json");
  res.send(payload);
});

const BANNERS_CACHE_TTL_SECONDS = 60;

// Promo banners for the casino page — top and middle placements, each one
// independently promoting a curated set of games. A banner only renders once
// at least one of its promoted games is still active (catalog churn
// shouldn't leave a banner pointing at a dead/removed game).
router.get("/banners", async (req: Request, res: Response) => {
  const position = typeof req.query["position"] === "string" ? req.query["position"].trim() : "";
  if (position !== "top" && position !== "middle") {
    res.status(400).json({ error: "position deve ser 'top' ou 'middle'." });
    return;
  }

  const cacheKey = `casino:banners:v1:${position}`;
  const cached = await kvCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const banners = await db
    .select()
    .from(casinoBannersTable)
    .where(and(eq(casinoBannersTable.position, position), eq(casinoBannersTable.isActive, true)))
    .orderBy(asc(casinoBannersTable.sortOrder), desc(casinoBannersTable.id));

  const allGameIds = [
    ...new Set(banners.flatMap((b) => (Array.isArray(b.gameIds) ? (b.gameIds as number[]) : []))),
  ];
  type BannerGameRow = {
    pk: number;
    id: string;
    name: string;
    provider: string;
    vendorCode: number | null;
    category: string;
    img: string | null;
    source: string;
  };
  // The ternary's `[]` empty-array branch collapses the select's row type to
  // `{}` — annotate explicitly rather than rely on inference here.
  const games: BannerGameRow[] = allGameIds.length
    ? await db
        .select({
          pk: casinoGamesTable.id,
          // Shaped to match the public /games CasinoGame contract the
          // frontend already knows how to render/launch (id = gameUid).
          id: casinoGamesTable.gameUid,
          name: casinoGamesTable.name,
          provider: casinoGamesTable.provider,
          vendorCode: casinoGamesTable.vendorCode,
          category: casinoGamesTable.category,
          img: casinoGamesTable.img,
          source: casinoGamesTable.source,
        })
        .from(casinoGamesTable)
        .where(and(inArray(casinoGamesTable.id, allGameIds), eq(casinoGamesTable.isActive, true)))
    : [];
  const gamesByPk = new Map(games.map((g): [number, typeof g] => [g.pk, g]));

  const result = banners
    .map((b) => {
      const bannerGames = (Array.isArray(b.gameIds) ? (b.gameIds as number[]) : [])
        .map((pk) => gamesByPk.get(pk))
        .filter((g): g is NonNullable<typeof g> => !!g)
        .map(({ pk: _pk, ...g }) => g);
      return {
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        ctaText: b.ctaText,
        imageUrl: b.imageUrl,
        linkUrl: b.linkUrl,
        position: b.position,
        games: bannerGames,
      };
    })
    .filter((b) => b.linkUrl || b.games.length > 0);

  const payload = JSON.stringify({ banners: result });
  await kvCache.set(cacheKey, payload, BANNERS_CACHE_TTL_SECONDS);
  res.setHeader("Content-Type", "application/json");
  res.send(payload);
});

// SilentAPI and Palace Casino both removed entirely (2026-09-20+, user
// decision) — no casino aggregator remains, so every game-launch route
// always reports the casino as unavailable. Kept registered (not deleted)
// so the front-end's existing POST calls get a graceful JSON error instead
// of a bare 404.
router.post(
  "/launch",
  authMiddleware,
  async (_req: AuthRequest, res: Response) => {
    res.status(503).json({ error: "Cassino indisponível no momento." });
  },
);

router.post(
  "/palace/launch",
  authMiddleware,
  async (_req: AuthRequest, res: Response) => {
    res.status(503).json({ error: "Cassino indisponível no momento." });
  },
);

// Palace Casino's own webhook config may still point at this URL after
// removal — always answer BAD_TOKEN (100), the exact same response this
// route already gave whenever PALACE_CASINO_CALLBACK_TOKEN was unset, so a
// stray delivery gets a graceful, expected rejection instead of a 404.
router.post("/palace/callback", async (_req: Request, res: Response) => {
  res.status(200).json({ result: 100, resultado: 100, status: "ERROR" });
});

export default router;
