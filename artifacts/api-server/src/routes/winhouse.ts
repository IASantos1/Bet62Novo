import { db, usersTable } from "@workspace/db";
import { ledgerEntriesTable } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, createHmac } from "node:crypto";
import { CONFIG } from "../lib/config.js";
import { applyBalanceDelta } from "../lib/ledger.js";
import { logger } from "../lib/logger.js";
import { timingSafeEqualString } from "../lib/security.js";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { getWinHouseGame } from "../services/winhouse/prematch.js";
import { getWinHouse24hGames } from "../services/winhouse/list.js";
import { normalizeListGame } from "../services/winhouse/listGame.js";
import { filterWinHouseListGame } from "../services/winhouse/leagueFilter.js";
import { parseWinHouseGame } from "../services/winhouse/parser.js";
import { formatWinHouseFootballTicket } from "../services/winhouse/telegramFormat.js";
import { isTelegramConfigured } from "../lib/telegram/client.js";
import { getLastWinHousePromotionTick, getWinHousePromotionCronStatus } from "../lib/winhousePromotionCron.js";
// Relative import — same tsc alias-resolution convention already used for
// telegramPostsTable/affiliatesTable elsewhere in routes/*.ts.
import { winhousePromotionPostsTable } from "../../../../lib/db/src/schema/winhousePromotionPosts.js";

const router: IRouter = Router();
const DEFAULT_WINHOUSE_CURRENCY = "EUR";

type WinHouseBalanceChangePayload = {
  username: string;
  session: string;
  transactionId: string;
  amountRaw: string;
  action: string;
  ticketId: string;
};

type WinHouseLedgerMetadata = {
  provider: "winhouse";
  requestKey: string;
  balanceAfter?: string | null;
};

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) {
    throw Object.assign(new Error("Montante inválido"), { status: 400 });
  }
  return (Math.round(n * 100) / 100).toFixed(2);
}

function parseWinHouseUserId(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function buildWinHouseLaunchToken(params: {
  playerId: string;
  session: string;
  walletApiKey: string;
}): string {
  const expiry = Date.now() + 5 * 60_000;
  const payload = `${params.playerId}|${expiry}|${params.session}`;
  const signature = createHmac("sha256", params.walletApiKey)
    .update(payload)
    .digest("hex");
  return `${params.playerId}.${expiry}.${params.session}.${signature}`;
}

export function buildWinHouseBalanceChangeSignature(params: {
  username?: unknown;
  amount?: unknown;
  action?: unknown;
  ticketId?: unknown;
  transactionId?: unknown;
  walletApiKey: string;
}): string {
  const payload =
    String(params.username ?? "") +
    String(params.amount ?? "") +
    String(params.action ?? "") +
    String(params.ticketId ?? "") +
    String(params.transactionId ?? "");
  return createHmac("sha256", params.walletApiKey).update(payload).digest("hex");
}

export function normalizeWinHouseBalanceChangePayload(
  input: Record<string, unknown>,
): WinHouseBalanceChangePayload {
  return {
    username: String(input.username ?? "").trim(),
    session: String(input.session ?? "").trim(),
    transactionId: String(input.transaction_id ?? "").trim(),
    amountRaw: String(input.amount ?? "").trim(),
    action: String(input.action ?? "").trim().toLowerCase(),
    ticketId: String(input.ticket_id ?? "").trim(),
  };
}

export function serializeWinHouseBalanceChangePayload(
  payload: WinHouseBalanceChangePayload,
): string {
  return JSON.stringify([
    payload.username,
    payload.session,
    payload.transactionId,
    payload.amountRaw,
    payload.action,
    payload.ticketId,
  ]);
}

function isWinHouseWalletConfigured(): boolean {
  return Boolean(CONFIG.WINHOUSE_WALLET_API_KEY && CONFIG.WINHOUSE_CALLBACK_TOKEN);
}

function readStoredWinHouseMetadata(metadata: unknown): WinHouseLedgerMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  if (record.provider !== "winhouse") return null;
  return {
    provider: "winhouse",
    requestKey: String(record.requestKey ?? ""),
    balanceAfter:
      record.balanceAfter == null ? null : String(record.balanceAfter),
  };
}

async function getExistingWinHouseLedgerEntry(
  tx: typeof db,
  idempotencyKey: string,
): Promise<{ requestKey: string; balanceAfter: string | null } | null> {
  const [existing] = await tx
    .select({ metadata: ledgerEntriesTable.metadata })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.idempotencyKey, idempotencyKey))
    .limit(1);

  const parsed = readStoredWinHouseMetadata(existing?.metadata);
  if (!parsed) return null;
  return {
    requestKey: parsed.requestKey,
    balanceAfter: parsed.balanceAfter ?? null,
  };
}

async function getCurrentUserBalance(userId: number): Promise<string | null> {
  const [user] = await db
    .select({ balance: usersTable.balance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user ? formatMoney(user.balance) : null;
}

function hasValidWinHouseCallbackToken(req: Request): boolean {
  const token = String(req.query["token"] ?? "");
  return token !== "" && timingSafeEqualString(token, CONFIG.WINHOUSE_CALLBACK_TOKEN);
}

function winHouseLedgerKind(action: string): string {
  if (action === "bet") return "sportsbook_winhouse_bet";
  if (action === "win") return "sportsbook_winhouse_win";
  return "sportsbook_winhouse_adjustment";
}

router.get("/user-data", async (req: Request, res: Response): Promise<void> => {
  if (!isWinHouseWalletConfigured()) {
    res.status(503).json({ error: "WinHouse wallet não configurada" });
    return;
  }

  if (!hasValidWinHouseCallbackToken(req)) {
    res.status(401).json({ error: "bad token" });
    return;
  }

  const username = String(req.query["username"] ?? "").trim();
  const userId = parseWinHouseUserId(username);
  if (!userId) {
    res.status(404).json({ error: "unknown player" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, balance: usersTable.balance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "unknown player" });
    return;
  }

  res.json({
    username: String(user.id),
    balance: formatMoney(user.balance),
    currency: DEFAULT_WINHOUSE_CURRENCY,
  });
});

router.post("/balance-change", async (req: Request, res: Response): Promise<void> => {
  if (!isWinHouseWalletConfigured()) {
    res.status(503).json({ error: "WinHouse wallet não configurada" });
    return;
  }

  if (!hasValidWinHouseCallbackToken(req)) {
    res.status(401).json({ error: "bad token" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const payload = normalizeWinHouseBalanceChangePayload(body);
  const signature = String(body.signature ?? "").trim().toLowerCase();
  const userId = parseWinHouseUserId(payload.username);
  const amountNum = Number(payload.amountRaw);

  if (
    !payload.username ||
    !payload.transactionId ||
    !payload.action ||
    !signature
  ) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }

  if (!Number.isFinite(amountNum) || amountNum === 0) {
    res.status(400).json({ error: "bad amount" });
    return;
  }

  if (payload.action !== "bet" && payload.action !== "win") {
    res.status(400).json({ error: "bad action" });
    return;
  }

  if ((payload.action === "bet" && amountNum > 0) || (payload.action === "win" && amountNum < 0)) {
    res.status(400).json({ error: "amount sign does not match action" });
    return;
  }

  if (!userId) {
    res.status(404).json({ error: "unknown player" });
    return;
  }

  const expectedSignature = buildWinHouseBalanceChangeSignature({
    username: payload.username,
    amount: body.amount,
    action: payload.action,
    ticketId: payload.ticketId,
    transactionId: payload.transactionId,
    walletApiKey: CONFIG.WINHOUSE_WALLET_API_KEY,
  });
  if (!timingSafeEqualString(signature, expectedSignature)) {
    res.status(401).json({ error: "bad signature" });
    return;
  }

  const requestKey = serializeWinHouseBalanceChangePayload(payload);
  const idempotencyKey = `sportsbook:winhouse:${payload.transactionId}`;

  try {
    const existing = await getExistingWinHouseLedgerEntry(db, idempotencyKey);
    if (existing) {
      if (existing.requestKey !== requestKey) {
        res.status(409).json({ error: "transaction_id reused with a different payload" });
        return;
      }
      const balance = existing.balanceAfter ?? (await getCurrentUserBalance(userId));
      res.json({ status: "ok", ...(balance ? { balance } : {}) });
      return;
    }

    const result = await (db as typeof db & {
      transaction: <T>(cb: (tx: typeof db) => Promise<T>) => Promise<T>;
    }).transaction(async (tx) => {
      const duplicate = await getExistingWinHouseLedgerEntry(tx, idempotencyKey);
      if (duplicate) {
        return {
          duplicate: true,
          conflict: duplicate.requestKey !== requestKey,
          balance: duplicate.balanceAfter,
        };
      }

      const [user] = await tx
        .select({ id: usersTable.id, balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user) {
        throw Object.assign(new Error("unknown player"), { status: 404 });
      }

      const applied = await applyBalanceDelta(tx, {
        userId,
        amount: formatMoney(amountNum),
        kind: winHouseLedgerKind(payload.action),
        idempotencyKey,
        refType: "winhouse_transaction",
        refId: payload.transactionId,
        metadata: {
          provider: "winhouse",
          requestKey,
        },
        enforceNonNegative: amountNum < 0,
      });

      if (!applied) {
        const raced = await getExistingWinHouseLedgerEntry(tx, idempotencyKey);
        return {
          duplicate: true,
          conflict: raced?.requestKey !== requestKey,
          balance: raced?.balanceAfter ?? null,
        };
      }

      const [updatedUser] = await tx
        .select({ balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      const balanceAfter = formatMoney(updatedUser?.balance ?? user.balance);
      await tx
        .update(ledgerEntriesTable)
        .set({
          metadata: {
            provider: "winhouse",
            requestKey,
            balanceAfter,
          } as never,
        })
        .where(
          and(
            eq(ledgerEntriesTable.idempotencyKey, idempotencyKey),
            eq(ledgerEntriesTable.userId, userId),
          ),
        );

      return {
        duplicate: false,
        conflict: false,
        balance: balanceAfter,
      };
    });

    if (result.conflict) {
      res.status(409).json({ error: "transaction_id reused with a different payload" });
      return;
    }

    res.json({
      status: "ok",
      ...(result.balance ? { balance: result.balance } : {}),
    });
  } catch (err) {
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : 500;

    if (status === 400) {
      res.status(422).json({ error: "insufficient balance" });
      return;
    }
    if (status === 404) {
      res.status(404).json({ error: "unknown player" });
      return;
    }

    logger.error(
      { err, userId, transactionId: payload.transactionId },
      "POST /api/winhouse/balance-change error",
    );
    res.status(500).json({ error: "wallet unavailable" });
  }
});

router.get(
  "/launch",
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!CONFIG.WINHOUSE_WALLET_API_KEY) {
      res.status(503).json({ error: "WinHouse SSO não configurado" });
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Utilizador não autenticado" });
      return;
    }

    const authHeader = req.headers.authorization ?? "";
    const rawToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    const sessionSeed = rawToken || `${user.id}:${user.email}`;
    const session = createHash("sha256")
      .update(sessionSeed)
      .digest("hex")
      .slice(0, 32);

    const launch = buildWinHouseLaunchToken({
      playerId: String(user.id),
      session,
      walletApiKey: CONFIG.WINHOUSE_WALLET_API_KEY,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({ launch });
  },
);

// Diagnostic endpoint for the Telegram live-odds feature (step 1): confirms
// the backend can query WinHouse's own prematch-game ajax endpoint reliably
// before anything is built on top of it (filtering, formatting, posting).
// No auth — this mirrors exactly what the sportsbook iframe's own
// client-side JS already calls unauthenticated for any visitor.
router.get("/game/:gameId", async (req: Request, res: Response) => {
  const gameId = req.params["gameId"] ?? "";
  if (!/^\d+$/.test(gameId)) {
    res.status(400).json({ error: "gameId inválido" });
    return;
  }

  try {
    const data = await getWinHouseGame(gameId);
    res.json({ success: true, gameId, data });
  } catch (err) {
    logger.error({ err, gameId }, "GET /api/winhouse/game/:gameId error");
    res.status(502).json({ success: false, error: "Não foi possível consultar a WinHouse" });
  }
});

// Step 2 of the Telegram live-odds feature: the same query as /game/:gameId,
// reduced to just the 1x2 market in the simple shape the Telegram post
// formatter (step 3, not built yet) will consume — no auth, same reasoning
// as /game/:gameId above.
router.get("/promotion/:gameId", async (req: Request, res: Response) => {
  const gameId = req.params["gameId"] ?? "";
  if (!/^\d+$/.test(gameId)) {
    res.status(400).json({ error: "gameId inválido" });
    return;
  }

  try {
    const raw = await getWinHouseGame(gameId);
    const parsed = parseWinHouseGame(raw, gameId);
    if (!parsed) {
      res.status(404).json({ error: "Mercado 1X2 não encontrado para este jogo" });
      return;
    }
    // Preview only — not sent to Telegram yet. Lets us confirm the ticket
    // text and button layout look right.
    const ticket = formatWinHouseFootballTicket(parsed, `https://bet62.plus/sportsbook?gameId=${encodeURIComponent(gameId)}`);
    res.json({ ...parsed, telegramText: ticket.html, telegramKeyboard: ticket.keyboard });
  } catch (err) {
    logger.error({ err, gameId }, "GET /api/winhouse/promotion/:gameId error");
    res.status(502).json({ error: "Não foi possível consultar a WinHouse" });
  }
});

// Diagnostic endpoint for the league filter (step before the publish
// scheduler): fetches the next-24h list, normalizes each entry (field
// names are inconsistent — see listGame.ts), and reports which games
// passed the grande/média football filter and why the rest didn't — so
// the curated league list can be checked and tuned against real fixtures
// before anything gets wired to actually post. No auth, same reasoning as
// the other WinHouse diagnostic routes above.
router.get("/today", async (_req: Request, res: Response) => {
  try {
    const raw = await getWinHouse24hGames();
    if (!Array.isArray(raw)) {
      res.status(502).json({ error: "Resposta inesperada da WinHouse" });
      return;
    }

    const included: Array<{
      gameId: string;
      homeTeam: string;
      awayTeam: string;
      league: string;
      country: string;
      date: string;
      tier: string;
    }> = [];
    const excludedCounts: Record<string, number> = {};
    // Distinct (country, league) pairs behind "not_in_allowed_list" — the
    // one bucket that needs eyeballing to tell "no big/medium fixture in
    // this window" apart from "our keyword didn't match the real league
    // name". Counted, not every row, to keep the response small.
    const unmatchedLeagues: Record<string, number> = {};
    // Numeric char codes survive any rendering/translation of this JSON in
    // a browser (a translator can reword or re-encode visible text, but it
    // can't change a number) — captured once, for the first unmatched
    // league whose country looks like "Argentina" (plain ASCII match, no
    // accents needed to find it), to see exactly what bytes WinHouse is
    // really sending versus what this file's own string literals contain.
    let debugLeagueCharCodes: { country: string; league: string; leagueCharCodes: number[] } | null = null;

    for (const entry of raw) {
      const game = normalizeListGame(entry);
      if (!game) continue;
      const result = filterWinHouseListGame(game);
      if (result.status === "included") {
        included.push({
          gameId: game.gameId,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          league: game.league,
          country: game.country,
          date: game.gameDate,
          tier: result.tier,
        });
      } else {
        excludedCounts[result.reason] = (excludedCounts[result.reason] ?? 0) + 1;
        if (result.reason === "not_in_allowed_list") {
          const key = `${game.country} | ${game.league}`;
          unmatchedLeagues[key] = (unmatchedLeagues[key] ?? 0) + 1;
          if (!debugLeagueCharCodes && /argentin/i.test(game.country)) {
            debugLeagueCharCodes = {
              country: game.country,
              league: game.league,
              leagueCharCodes: Array.from(game.league).map((ch) => ch.codePointAt(0) ?? 0),
            };
          }
        }
      }
    }

    res.json({
      totalGames: raw.length,
      includedCount: included.length,
      included,
      excludedCounts,
      unmatchedLeagues,
      debugLeagueCharCodes,
    });
  } catch (err) {
    logger.error({ err }, "GET /api/winhouse/today error");
    res.status(502).json({ error: "Não foi possível consultar a WinHouse" });
  }
});

// Visibility into the automated publish pipeline (lib/winhousePromotionCron.ts
// + services/winhouse/promotionScheduler.ts): the last fixtures it attempted
// to post, success or failure — so this can be confirmed against the real
// Telegram channel without needing admin login. No auth, same reasoning as
// the other WinHouse diagnostic routes above (this is our own posting
// history, not sensitive beyond what the channel itself already shows).
router.get("/promotion-posts", async (_req: Request, res: Response) => {
  try {
    const posts = await db
      .select()
      .from(winhousePromotionPostsTable)
      .orderBy(desc(winhousePromotionPostsTable.id))
      .limit(50);
    // Surfaced so an empty `posts` list can be told apart from "Telegram
    // isn't configured in this environment" without guessing — same field
    // name GET /admin/telegram/posts already exposes. lastTick additionally
    // says *why* the most recent cron tick didn't post (too soon, no
    // candidates, a thrown error, ...) instead of leaving that to guesswork.
    res.json({
      posts,
      configured: isTelegramConfigured(),
      cron: getWinHousePromotionCronStatus(),
      lastTick: getLastWinHousePromotionTick(),
      // Rules out "this request hit a stale process that predates the
      // cron/env fixes" without guessing — a low uptime means whatever
      // `cron`/`lastTick` show above is genuinely from the current code.
      processUptimeSeconds: Math.round(process.uptime()),
    });
  } catch (err) {
    logger.error({ err }, "GET /api/winhouse/promotion-posts error");
    res.status(500).json({ error: "Erro ao listar publicações" });
  }
});

export default router;
