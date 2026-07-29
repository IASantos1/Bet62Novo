import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, casinoGamesTable } from "@workspace/db";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { CONFIG } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { statpalCache } from "../services/statpal/cache.js";

const router: IRouter = Router();

// Catalog now lives in Postgres (casino_games table, seeded via
// `pnpm run seed:casino` from the provider dumps) instead of being shipped
// to the browser as one ~700KB JSON blob. The front-end pages through it
// 24 games at a time and never talks to the aggregator directly for
// listing — only /launch calls out to SilentAPI.
const GAMES_CACHE_TTL_SECONDS = 300;
const PROVIDERS_CACHE_TTL_SECONDS = 3600;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

router.get("/games", async (req: Request, res: Response) => {
  const provider = typeof req.query["provider"] === "string" ? req.query["provider"].trim() : "";
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query["limit"]) || DEFAULT_LIMIT));

  const cacheKey = `casino:games:v1:${provider || "*"}:${search.toLowerCase()}:${page}:${limit}`;
  const cached = await statpalCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const conditions = [eq(casinoGamesTable.isActive, true)];
  if (provider && provider !== "Todos") conditions.push(eq(casinoGamesTable.provider, provider));
  if (search) conditions.push(ilike(casinoGamesTable.name, `%${search}%`));
  const where = and(...conditions);

  const [games, [{ total }]] = await Promise.all([
    db
      .select({
        id: casinoGamesTable.gameUid,
        name: casinoGamesTable.name,
        provider: casinoGamesTable.provider,
        vendorCode: casinoGamesTable.vendorCode,
        category: casinoGamesTable.category,
        img: casinoGamesTable.img,
      })
      .from(casinoGamesTable)
      .where(where)
      .orderBy(desc(casinoGamesTable.popularity), asc(casinoGamesTable.name))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(casinoGamesTable).where(where),
  ]);

  const payload = JSON.stringify({ page, limit, total: Number(total), games });
  await statpalCache.set(cacheKey, payload, GAMES_CACHE_TTL_SECONDS);
  res.setHeader("Content-Type", "application/json");
  res.send(payload);
});

router.get("/providers", async (_req: Request, res: Response) => {
  const cacheKey = "casino:providers:v1";
  const cached = await statpalCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const rows = await db
    .selectDistinct({ provider: casinoGamesTable.provider })
    .from(casinoGamesTable)
    .where(eq(casinoGamesTable.isActive, true))
    .orderBy(asc(casinoGamesTable.provider));

  const payload = JSON.stringify({ providers: rows.map((r) => r.provider) });
  await statpalCache.set(cacheKey, payload, PROVIDERS_CACHE_TTL_SECONDS);
  res.setHeader("Content-Type", "application/json");
  res.send(payload);
});

// SilentAPI needs an alphanumeric player id it can hand back to us on every
// wallet callback. Our own numeric user id already satisfies their
// alphanumeric + length constraints once prefixed with a letter (a bare
// numeric string risks being misread/truncated by some providers), and the
// prefix makes it trivially reversible — no separate mapping table needed.
export function memberAccountForUser(userId: number): string {
  return `u${userId}`;
}

export function userIdFromMemberAccount(memberAccount: string): number | null {
  const m = /^u(\d+)$/.exec(memberAccount);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.post(
  "/launch",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    if (!CONFIG.SILENTAPI_AUTH_TOKEN) {
      res.status(503).json({ error: "Cassino indisponível no momento." });
      return;
    }
    const userId = req.user!.id;
    const gameUid = String((req.body as { gameUid?: unknown })?.gameUid ?? "").trim();
    if (!gameUid) {
      res.status(400).json({ error: "Jogo inválido." });
      return;
    }

    try {
      const [user] = await db
        .select({ balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "Utilizador não encontrado." });
        return;
      }

      const homeUrl =
        process.env["PUBLIC_SITE_URL"]?.trim() ||
        `${req.protocol}://${req.get("host")}`;

      const resp = await fetch(`${CONFIG.SILENTAPI_BASE_URL}/GetGameUrl.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.SILENTAPI_AUTH_TOKEN}`,
        },
        body: JSON.stringify({
          member_account: memberAccountForUser(userId),
          game_uid: gameUid,
          balance: Number(user.balance),
          currency: "EUR",
          home_url: homeUrl,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = (await resp.json().catch(() => null)) as {
        code?: number;
        msg?: string;
        payload?: { game_launch_url?: string };
      } | null;

      if (!resp.ok || !data || data.code !== 0 || !data.payload?.game_launch_url) {
        logger.warn(
          { status: resp.status, data, userId, gameUid },
          "[casino] GetGameUrl failed",
        );
        res.status(502).json({ error: "Não foi possível iniciar o jogo." });
        return;
      }

      res.json({ url: data.payload.game_launch_url });
    } catch (err) {
      logger.error({ err, userId, gameUid }, "[casino] launch error");
      res.status(502).json({ error: "Não foi possível iniciar o jogo." });
    }
  },
);

export default router;
