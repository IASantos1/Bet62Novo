import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  casinoGamesTable,
  casinoBannersTable,
  usersTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { applyBalanceDelta } from "../lib/ledger.js";
import { bigBangBalanceChangeSignature, bigBangLaunchGame } from "../services/bigbang/client.js";
import { ensureBigBangCatalogFresh } from "../services/bigbang/sync.js";
import { kvCache } from "../services/cache/kvCache.js";

const router: IRouter = Router();
const CASINO_SOURCE = "bigbang";
const BIGBANG_BALANCE_SANDBOX = "100000.00";
const BIGBANG_DEFAULT_LANGUAGE = "pt";
const DEFAULT_CASINO_CURRENCY = "EUR";

async function maybeSyncBigBangCatalog(): Promise<void> {
  try {
    await ensureBigBangCatalogFresh();
  } catch (err) {
    logger.warn({ err }, "[bigbang] catalog sync skipped/failed");
  }
}

function parseBigBangUserId(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) throw Object.assign(new Error("Montante inválido"), { status: 400 });
  return (Math.round(n * 100) / 100).toFixed(2);
}

function bigBangKind(args: { type?: unknown; amount: number }): string {
  const type = String(args.type ?? "").trim().toLowerCase();
  if (type === "refund") return "casino_bigbang_refund";
  if (type === "bet" || args.amount < 0) return "casino_bigbang_bet";
  if (type === "win" || args.amount > 0) return "casino_bigbang_win";
  if (type === "round") return "casino_bigbang_round";
  return "casino_bigbang_close";
}

function safeHexEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// BigBang Casino is the current casino aggregator. The public catalog still
// reads from casino_games so banners/admin keep working, but the rows are
// synced from BigBang instead of a local JSON snapshot or a removed provider.
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
// "Slots", "Ao Vivo", "Baccarat", "Blackjack", "Roulette"). BigBang's raw
// feed doesn't expose the exact same richer browse taxonomy the UI has used
// historically, so the DB-normalized category keeps only the categories we
// can assert from the provider feed itself plus a safe title-keyword match
// for Baccarat/Blackjack/Roulette.
const NAME_KEYWORD_CATEGORIES = new Set(["baccarat", "blackjack", "roulette"]);

router.get("/games", async (req: Request, res: Response) => {
  await maybeSyncBigBangCatalog();
  const provider = typeof req.query["provider"] === "string" ? req.query["provider"].trim() : "";
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
  const category =
    typeof req.query["category"] === "string" ? req.query["category"].trim().toLowerCase() : "";
  const sort = typeof req.query["sort"] === "string" ? req.query["sort"].trim().toLowerCase() : "popular";
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query["limit"]) || DEFAULT_LIMIT));

  const cacheKey = `casino:games:v4:${provider || "*"}:${category || "*"}:${sort}:${search.toLowerCase()}:${page}:${limit}`;
  const cached = await kvCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const conditions = [
    eq(casinoGamesTable.isActive, true),
    eq(casinoGamesTable.source, CASINO_SOURCE),
  ];
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
  await maybeSyncBigBangCatalog();
  const provider = typeof req.query["provider"] === "string" ? req.query["provider"].trim() : "";
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(
    MAX_GROUPS_LIMIT,
    Math.max(1, Number(req.query["limit"]) || DEFAULT_GROUPS_LIMIT),
  );

  const cacheKey = `casino:games-grouped:v2:${provider || "*"}:${page}:${limit}`;
  const cached = await kvCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const conditions = [
    eq(casinoGamesTable.isActive, true),
    eq(casinoGamesTable.source, CASINO_SOURCE),
  ];
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
  await maybeSyncBigBangCatalog();
  const cacheKey = "casino:providers:v3";
  const cached = await kvCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const rows = await db
    .selectDistinct({ provider: casinoGamesTable.provider })
    .from(casinoGamesTable)
    .where(and(eq(casinoGamesTable.isActive, true), eq(casinoGamesTable.source, CASINO_SOURCE)))
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

router.post(
  "/launch",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const gameUid = String((req.body as { gameUid?: unknown })?.gameUid ?? "").trim();
    if (!gameUid) {
      res.status(400).json({ error: "gameUid é obrigatório." });
      return;
    }

    await maybeSyncBigBangCatalog();

    const [game] = await db
      .select({
        gameUid: casinoGamesTable.gameUid,
        isActive: casinoGamesTable.isActive,
      })
      .from(casinoGamesTable)
      .where(and(eq(casinoGamesTable.gameUid, gameUid), eq(casinoGamesTable.source, CASINO_SOURCE)))
      .limit(1);

    if (!game || !game.isActive) {
      res.status(404).json({ error: "Jogo não encontrado." });
      return;
    }

    const numericGameId = Number(game.gameUid);
    if (!Number.isInteger(numericGameId) || numericGameId <= 0) {
      res.status(500).json({ error: "Identificador do jogo inválido." });
      return;
    }

    try {
      const publicSiteUrlRaw = process.env["PUBLIC_SITE_URL"]?.trim();
      const publicSiteUrl = publicSiteUrlRaw ? publicSiteUrlRaw.replace(/\/+$/, "") : "";
      const launched = await bigBangLaunchGame({
        gameId: numericGameId,
        userToken: String(req.user!.id),
        language: BIGBANG_DEFAULT_LANGUAGE,
        returnUrl: publicSiteUrl ? `${publicSiteUrl}/casino` : undefined,
      });
      res.json({ url: launched.gameUrl, provider: launched.provider, sessionId: launched.sessionId });
    } catch (err) {
      logger.error({ err, gameUid, userId: req.user?.id }, "POST /api/casino/launch error");
      const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
      res.status(status).json({ error: (err as Error).message || "Não foi possível iniciar o jogo." });
    }
  },
);

router.post(
  "/palace/launch",
  authMiddleware,
  async (_req: AuthRequest, res: Response) => {
    res.status(503).json({ error: "Cassino indisponível no momento." });
  },
);

router.get("/bigbang/user-data", async (req: Request, res: Response) => {
  const username = String(req.query["username"] ?? "").trim();
  const userId = parseBigBangUserId(username);
  if (!userId) {
    res.status(404).json({ error: "unknown user" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, balance: usersTable.balance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "unknown user" });
    return;
  }

  res.json({
    username,
    balance: formatMoney(user.balance),
    currency: DEFAULT_CASINO_CURRENCY,
  });
});

router.post("/bigbang/balance-change", async (req: Request, res: Response) => {
  const payload = (req.body ?? {}) as {
    username?: unknown;
    amount?: unknown;
    game?: unknown;
    game_category?: unknown;
    transaction_id?: unknown;
    signature?: unknown;
    round_id?: unknown;
    type?: unknown;
    round_end?: unknown;
    game_id?: unknown;
    provider_id?: unknown;
    sandbox?: unknown;
  };

  const username = String(payload.username ?? "").trim();
  const userId = parseBigBangUserId(username);
  const transactionId = String(payload.transaction_id ?? "").trim();
  const game = String(payload.game ?? "").trim();
  const gameCategory = String(payload.game_category ?? "").trim();
  const signature = String(payload.signature ?? "").trim().toLowerCase();
  const amountNum = Number(payload.amount);

  if (!username || !transactionId || !game || !gameCategory || !signature || !Number.isFinite(amountNum)) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  if (!userId) {
    res.status(404).json({ error: "unknown user" });
    return;
  }

  try {
    const expected = bigBangBalanceChangeSignature({
      username,
      amount: payload.amount,
      game,
      game_category: gameCategory,
      transaction_id: transactionId,
    });
    if (!safeHexEqual(expected, signature)) {
      res.status(401).json({ error: "bad signature" });
      return;
    }
  } catch (err) {
    logger.error({ err }, "POST /api/casino/bigbang/balance-change signature error");
    res.status(503).json({ error: "wallet unavailable" });
    return;
  }

  if (payload.sandbox === true) {
    res.json({ status: "ok", balance: BIGBANG_BALANCE_SANDBOX });
    return;
  }

  try {
    const result = await (db as typeof db & {
      transaction: <T>(cb: (tx: typeof db) => Promise<T>) => Promise<T>;
    }).transaction(async (tx) => {
      const [user] = await tx
        .select({ id: usersTable.id, balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user) {
        throw Object.assign(new Error("unknown user"), { status: 404 });
      }

      const applied = await applyBalanceDelta(tx, {
        userId,
        amount: formatMoney(amountNum),
        kind: bigBangKind({ type: payload.type, amount: amountNum }),
        idempotencyKey: `casino:bigbang:${transactionId}`,
        refType: "bigbang_transaction",
        refId: transactionId,
        metadata: {
          username,
          roundId: payload.round_id ?? null,
          type: payload.type ?? null,
          roundEnd: Boolean(payload.round_end),
          game,
          gameCategory,
          gameId: payload.game_id ?? null,
          providerId: payload.provider_id ?? null,
        },
        enforceNonNegative: amountNum < 0,
      });

      const [updatedUser] = await tx
        .select({ balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      return {
        balance: updatedUser?.balance ?? user.balance,
        duplicate: !applied,
      };
    });

    res.json({
      status: "ok",
      balance: formatMoney(result.balance),
      ...(result.duplicate ? { duplicate: true } : {}),
    });
  } catch (err) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
    if (status === 400) {
      res.status(400).json({ error: "insufficient balance" });
      return;
    }
    if (status === 404) {
      res.status(404).json({ error: "unknown user" });
      return;
    }
    logger.error({ err, userId, transactionId }, "POST /api/casino/bigbang/balance-change error");
    res.status(500).json({ error: "wallet unavailable" });
  }
});

// Legacy Palace callback stub kept only so an old upstream webhook config
// fails gracefully instead of spamming 404s after the provider switch.
router.post("/palace/callback", async (_req: Request, res: Response) => {
  res.status(200).json({ result: 100, resultado: 100, status: "ERROR" });
});

export default router;
