import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, casinoGamesTable, ledgerEntriesTable } from "@workspace/db";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { CONFIG } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { statpalCache } from "../services/statpal/cache.js";
import { applyBalanceDelta } from "../lib/ledger.js";
import { timingSafeEqualString } from "../lib/security.js";
import {
  ensurePalaceCasinoUser,
  getPalaceCasinoGameUrl,
} from "../services/palaceCasino/client.js";

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
          // GetGameUrl has no currency parameter (confirmed against
          // SilentAPI's docs) — the account's operating currency is fixed
          // on their side, not selectable per-request. Do not add a
          // currency field back here; it's silently ignored.
          member_account: memberAccountForUser(userId),
          game_uid: gameUid,
          balance: Number(user.balance),
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
        // Surface the aggregator's own reason (e.g. region/licensing
        // restrictions on that specific vendor) instead of a blanket
        // message — this is the only place that reason is visible outside
        // the server logs, and it's what tells us whether a given game
        // needs to be disabled/reported to SilentAPI. Some failures come
        // back with an HTTP error status and no JSON body at all (data is
        // null) or a JSON body with no msg field — fall back to surfacing
        // the HTTP status itself so a per-game report always carries SOME
        // concrete signal instead of a blank "no reason given".
        const reason = data?.msg
          ? ` (${data.msg})`
          : !resp.ok
            ? ` (HTTP ${resp.status})`
            : "";
        res.status(502).json({ error: `Não foi possível iniciar o jogo.${reason}` });
        return;
      }

      res.json({ url: data.payload.game_launch_url });
    } catch (err) {
      // Network/timeout failures (DNS, connection refused, the 15s
      // AbortSignal firing) never reach the branch above at all — surface
      // the actual error message here too, since "some games work, some
      // don't" with a shared URL/token points at a per-request issue
      // (e.g. a slow provider backend timing out) rather than config.
      const reason = err instanceof Error ? ` (${err.message})` : "";
      logger.error({ err, userId, gameUid }, "[casino] launch error");
      res.status(502).json({ error: `Não foi possível iniciar o jogo.${reason}` });
    }
  },
);

// Palace Casino launch — separate route from /launch above (SilentAPI)
// since the two aggregators have unrelated request/response shapes and are
// expected to coexist during the catalog migration. Palace Casino uses
// Seamless wallet mode: no balance is sent here at all (unlike SilentAPI's
// GetGameUrl) — the balance stays with us and Palace Casino asks for it
// per-bet via the /palace/callback webhook instead (see also
// ensurePalaceCasinoUser's doc comment on the memberAccountForUser
// convention shared between both integrations).
router.post(
  "/palace/launch",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    if (!CONFIG.PALACE_CASINO_API_TOKEN) {
      res.status(503).json({ error: "Cassino indisponível no momento." });
      return;
    }
    const userId = req.user!.id;
    const body = req.body as { providerId?: unknown; gameSymbol?: unknown };
    const providerId = Number(body.providerId);
    const gameSymbol = String(body.gameSymbol ?? "").trim();
    if (!Number.isInteger(providerId) || providerId <= 0 || !gameSymbol) {
      res.status(400).json({ error: "Jogo inválido." });
      return;
    }

    try {
      const homeUrl =
        process.env["PUBLIC_SITE_URL"]?.trim() ||
        `${req.protocol}://${req.get("host")}`;

      const user = await ensurePalaceCasinoUser(memberAccountForUser(userId));
      const { game_url } = await getPalaceCasinoGameUrl({
        userCode: user.user_code,
        providerId,
        gameSymbol,
        returnUrl: homeUrl,
      });
      res.json({ url: game_url });
    } catch (err) {
      const reason = err instanceof Error ? ` (${err.message})` : "";
      logger.error({ err, userId, providerId, gameSymbol }, "[palace-casino] launch error");
      res.status(502).json({ error: `Não foi possível iniciar o jogo.${reason}` });
    }
  },
);

// ── Palace Casino wallet callback (Seamless mode) ───────────────────────────
// Palace Casino calls this on every game action instead of us pushing to
// them — the balance never leaves our ledger. Auth is a static shared
// token in the "Callback-Token" header (not HMAC-over-body like SilentAPI's
// callback), so this can sit after express.json() as an ordinary route
// instead of needing raw-body registration in app.ts.
//
// Timeout budget from the docs: "aposta"/"saldo" must respond within 2s,
// everything else within 4s — keep this handler free of slow work.
// win/cancel deliveries retry up to 51 times (first + 50 more, 2-4s apart)
// until they get a 200, so every branch that touches money MUST be
// idempotent on trans_guid — applyBalanceDelta's onConflictDoNothing on
// idempotencyKey plus re-reading the current balance either way (whether
// this call inserted or was a dedup no-op) is what makes that safe: a
// retried delivery gets the same "OK, here's the balance" answer instead
// of a second charge.
//
// NOT YET SAFE TO GO LIVE: toLedgerAmount/fromLedgerAmount below are
// unimplemented — Palace Casino's amount unit (euros? cents? their own
// points needing a conversion rate?) hasn't been confirmed yet. Every
// branch that moves money routes through these two functions so there's
// exactly one place to fix once that's known; until then they throw,
// which correctly 500s (not silently misbooks) any real bet/win/cancel
// that reaches this route.
function toLedgerAmount(_rawAmount: number): string {
  throw new Error(
    "Palace Casino amount unit not confirmed yet (euros/cents/points?) — see toLedgerAmount in routes/casino.ts",
  );
}
function fromLedgerAmount(_ledgerAmount: string | number): number {
  throw new Error(
    "Palace Casino amount unit not confirmed yet (euros/cents/points?) — see fromLedgerAmount in routes/casino.ts",
  );
}

async function currentUserBalance(
  tx: typeof db,
  userId: number,
): Promise<string | null> {
  const [row] = await tx
    .select({ balance: usersTable.balance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row?.balance ?? null;
}

router.post("/palace/callback", async (req: Request, res: Response) => {
  const token = req.headers["callback-token"];
  if (
    !CONFIG.PALACE_CASINO_CALLBACK_TOKEN ||
    typeof token !== "string" ||
    !timingSafeEqualString(token, CONFIG.PALACE_CASINO_CALLBACK_TOKEN)
  ) {
    res.status(401).json({ resultado: 1, status: "UNAUTHORIZED" });
    return;
  }

  const body = req.body as {
    comando?: unknown;
    dados?: Record<string, unknown>;
  };
  const comando = String(body.comando ?? "");
  const dados = body.dados ?? {};
  const conta = String(dados["conta"] ?? "").trim();
  const userId = userIdFromMemberAccount(conta);
  if (!userId) {
    logger.warn({ conta, comando }, "[palace-callback] unknown conta format");
    res.status(400).json({ resultado: 1, status: "UNKNOWN_ACCOUNT" });
    return;
  }

  try {
    switch (comando) {
      case "autenticar": {
        const balance = await currentUserBalance(db, userId);
        if (balance === null) {
          res.status(400).json({ resultado: 1, status: "UNKNOWN_ACCOUNT" });
          return;
        }
        res.json({
          resultado: 0,
          status: "OK",
          dados: { conta, saldo: fromLedgerAmount(balance) },
        });
        return;
      }
      case "saldo": {
        const balance = await currentUserBalance(db, userId);
        if (balance === null) {
          res.status(400).json({ resultado: 1, status: "UNKNOWN_ACCOUNT" });
          return;
        }
        res.json({
          resultado: 0,
          status: "OK",
          dados: { saldo: fromLedgerAmount(balance) },
        });
        return;
      }
      case "aposta": {
        const transGuid = String(dados["trans_guid"] ?? "").trim();
        const rawAmount = Number(dados["amount"]);
        if (!transGuid || !Number.isFinite(rawAmount) || rawAmount <= 0) {
          res.status(400).json({ resultado: 1, status: "INVALID_REQUEST" });
          return;
        }
        try {
          const balance = await db.transaction(async (tx) => {
            await applyBalanceDelta(tx, {
              userId,
              amount: `-${toLedgerAmount(rawAmount)}`,
              kind: "casino_palace_bet",
              idempotencyKey: `palace:${transGuid}`,
              refType: "casino_palace_round",
              refId: String(dados["round_id"] ?? transGuid),
              metadata: dados,
              enforceNonNegative: true,
            });
            return currentUserBalance(tx as unknown as typeof db, userId);
          });
          res.json({
            resultado: 0,
            status: "OK",
            dados: { saldo: fromLedgerAmount(balance!) },
          });
        } catch (err) {
          logger.warn({ err, userId, transGuid }, "[palace-callback] bet declined");
          res.status(400).json({ resultado: 1, status: "INSUFFICIENT_BALANCE" });
        }
        return;
      }
      case "vitória":
      case "vitoria": {
        const transGuid = String(dados["trans_guid"] ?? "").trim();
        const rawAmount = Number(dados["amount"]);
        if (!transGuid || !Number.isFinite(rawAmount) || rawAmount < 0) {
          res.status(400).json({ resultado: 1, status: "INVALID_REQUEST" });
          return;
        }
        const balance = await db.transaction(async (tx) => {
          await applyBalanceDelta(tx, {
            userId,
            amount: toLedgerAmount(rawAmount),
            kind: "casino_palace_win",
            idempotencyKey: `palace:${transGuid}`,
            refType: "casino_palace_round",
            refId: String(dados["round_id"] ?? transGuid),
            metadata: dados,
          });
          return currentUserBalance(tx as unknown as typeof db, userId);
        });
        res.json({
          resultado: 0,
          status: "OK",
          dados: { saldo: fromLedgerAmount(balance!) },
        });
        return;
      }
      case "cancelar": {
        const transGuid = String(dados["trans_guid"] ?? "").trim();
        const cancelTransGuid = String(dados["cancel_trans_guid"] ?? "").trim();
        if (!transGuid || !cancelTransGuid) {
          res.status(400).json({ resultado: 1, status: "INVALID_REQUEST" });
          return;
        }
        const balance = await db.transaction(async (tx) => {
          // Reverse exactly what we actually applied for cancel_trans_guid
          // (looked up from our own ledger) rather than trusting the
          // amount/type resent in this cancel payload — avoids any drift
          // between what Palace Casino thinks it sent and what we recorded.
          const [original] = await tx
            .select({ amount: ledgerEntriesTable.amount })
            .from(ledgerEntriesTable)
            .where(eq(ledgerEntriesTable.idempotencyKey, `palace:${cancelTransGuid}`))
            .limit(1);
          if (original) {
            const reversal = (-Number(original.amount)).toFixed(2);
            await applyBalanceDelta(tx, {
              userId,
              amount: reversal,
              kind: "casino_palace_cancel",
              idempotencyKey: `palace:${transGuid}`,
              refType: "casino_palace_round",
              refId: String(dados["round_id"] ?? transGuid),
              metadata: dados,
            });
          }
          // original not found: nothing to reverse (already reversed, or
          // the original bet/win never actually landed) — no-op, still
          // answer with the current balance so the retry contract holds.
          return currentUserBalance(tx as unknown as typeof db, userId);
        });
        res.json({
          resultado: 0,
          status: "OK",
          dados: { saldo: fromLedgerAmount(balance!) },
        });
        return;
      }
      case "status": {
        const transGuid = String(dados["trans_guid"] ?? "").trim();
        if (!transGuid) {
          res.status(400).json({ resultado: 1, status: "INVALID_REQUEST" });
          return;
        }
        const [row] = await db
          .select({ id: ledgerEntriesTable.id })
          .from(ledgerEntriesTable)
          .where(eq(ledgerEntriesTable.idempotencyKey, `palace:${transGuid}`))
          .limit(1);
        res.json({
          resultado: 0,
          status: "OK",
          dados: {
            conta,
            trans_guid: transGuid,
            trans_status: row ? "OK" : "NOT_FOUND",
          },
        });
        return;
      }
      default:
        logger.warn({ comando }, "[palace-callback] unknown comando");
        res.status(400).json({ resultado: 1, status: "UNKNOWN_COMMAND" });
    }
  } catch (err) {
    logger.error({ err, userId, comando }, "[palace-callback] processing error");
    res.status(500).json({ resultado: 1, status: "ERROR" });
  }
});

export default router;
