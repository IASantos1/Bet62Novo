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

// Catalog lives in Postgres (casino_games table). SilentAPI is no longer
// used — /games and /providers below only ever return source="palace"
// rows (seeded via `pnpm run seed:palace-casino`, a live sync against
// Palace Casino's own API); the SilentAPI /launch route and callback
// further down are kept as dormant code, not deleted, in case that
// decision changes, but nothing in the active catalog reaches them. The
// front-end pages through the catalog 24 games at a time and never talks
// to either aggregator directly for listing.
const GAMES_CACHE_TTL_SECONDS = 300;
const PROVIDERS_CACHE_TTL_SECONDS = 3600;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

router.get("/games", async (req: Request, res: Response) => {
  const provider = typeof req.query["provider"] === "string" ? req.query["provider"].trim() : "";
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query["limit"]) || DEFAULT_LIMIT));

  const cacheKey = `casino:games:v2:${provider || "*"}:${search.toLowerCase()}:${page}:${limit}`;
  const cached = await statpalCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  // Palace Casino only — SilentAPI is no longer used (kept as dormant code,
  // not deleted, in case that decision changes; explicitly filtered out
  // here rather than relying on its catalog happening to be empty).
  const conditions = [
    eq(casinoGamesTable.isActive, true),
    eq(casinoGamesTable.source, "palace"),
  ];
  if (provider && provider !== "Todos") conditions.push(eq(casinoGamesTable.provider, provider));
  if (search) conditions.push(ilike(casinoGamesTable.name, `%${search}%`));
  const where = and(...conditions);

  const [games, [{ total }]] = await Promise.all([
    db
      .select({
        id: casinoGamesTable.gameUid,
        name: casinoGamesTable.name,
        provider: casinoGamesTable.provider,
        // For source="palace" rows this doubles as the provider_id needed
        // by /palace/launch (see seedPalaceCasinoGames.ts) - not a real
        // "vendor code" for that source, but reusing the column avoids a
        // schema change just for this.
        vendorCode: casinoGamesTable.vendorCode,
        category: casinoGamesTable.category,
        img: casinoGamesTable.img,
        source: casinoGamesTable.source,
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
  const cacheKey = "casino:providers:v2";
  const cached = await statpalCache.get(cacheKey);
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
// Field/command names and the response contract below are taken from
// Palace Casino's own PHP reference implementation, NOT the earlier
// (auto-translated-to-Portuguese) doc page — that page's JSON examples
// turned out to have mistranslated field/command names ("comando"/"dados"/
// "conta"/"autenticar" etc.) that don't match what their real server
// sends: it's "command"/"data"/"account"/"authenticate" (English), and
// critically **the response is ALWAYS HTTP 200** — every outcome, success
// or failure, is communicated via the `result` field in the JSON body
// (0 = success; nonzero = the specific failure, see PALACE_RESULT below).
// The reference PHP never once calls http_response_code() for an error.
//
// Timeout budget from the docs: "bet"/"balance" must respond within 2s,
// everything else within 4s — keep this handler free of slow work.
//
// Idempotency, per the reference implementation (not what SilentAPI's
// callback does — don't copy that pattern here): a *repeat* delivery of
// the same trans_guid for bet/win is REJECTED with
// PALACE_RESULT.ALREADY_PROCESSED, not silently re-answered as success.
// Cancel is different: it's idempotent by re-checking a stable key derived
// from cancel_trans_guid (see the "cancel" case below), matching the
// reference's "UPDATE ... SET sort='CANCEL' WHERE trans_guid=cancel_trans_guid"
// — the second cancel attempt for the same original transaction is a
// harmless no-op, not an error.
//
// Amount unit: Palace Casino sends/expects EUR amounts in minor units
// (cents, as integers) — the industry-standard convention for casino/
// sportsbook APIs (SoftSwiss, Pragmatic, Evolution, etc. all do this),
// confirmed by the user. Our own ledger stores decimal EUR strings
// ("50.00") — the established convention across the whole platform
// (sports betting, payments, withdrawals) — so amounts are converted at
// just this integration's boundary (centsToLedgerAmount/
// ledgerAmountToCents below) rather than migrating the platform's
// monetary representation, which is a much bigger, unrelated change.
function centsToLedgerAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}
function ledgerAmountToCents(ledgerAmount: string | number): number {
  return Math.round(Number(ledgerAmount) * 100);
}

const PALACE_RESULT = {
  SUCCESS: 0,
  USER_NOT_FOUND: 21,
  BALANCE_INSUFFICIENT: 31,
  ALREADY_PROCESSED: 41, // duplicate trans_guid for a new bet/win/cancel
  TRANS_NOT_FOUND: 42, // status lookup for an unknown trans_guid
  CANCEL_TRANS_NOT_FOUND: 43, // cancel_trans_guid never seen
  INVALID_REQUEST: 90,
  INTERNAL_ERROR: 99,
  BAD_TOKEN: 100,
} as const;

function palaceResult(
  res: Response,
  result: number,
  data?: Record<string, unknown>,
): void {
  // Always HTTP 200 — see header comment. status mirrors their reference's
  // literal "OK"/"ERROR" string, which they may also inspect.
  res.status(200).json({
    result,
    status: result === PALACE_RESULT.SUCCESS ? "OK" : "ERROR",
    ...(data ? { data } : {}),
  });
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

async function ledgerEntryByKey(
  tx: typeof db,
  idempotencyKey: string,
): Promise<{ amount: string } | null> {
  const [row] = await tx
    .select({ amount: ledgerEntriesTable.amount })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.idempotencyKey, idempotencyKey))
    .limit(1);
  return row ?? null;
}

router.post("/palace/callback", async (req: Request, res: Response) => {
  const token = req.headers["callback-token"];
  if (
    !CONFIG.PALACE_CASINO_CALLBACK_TOKEN ||
    typeof token !== "string" ||
    !timingSafeEqualString(token, CONFIG.PALACE_CASINO_CALLBACK_TOKEN)
  ) {
    palaceResult(res, PALACE_RESULT.BAD_TOKEN);
    return;
  }

  const body = req.body as {
    command?: unknown;
    data?: Record<string, unknown>;
  };
  const command = String(body.command ?? "");
  const data = body.data ?? {};
  const account = String(data["account"] ?? "").trim();
  const userId = userIdFromMemberAccount(account);
  if (!userId) {
    logger.warn({ account, command }, "[palace-callback] unknown account format");
    palaceResult(res, PALACE_RESULT.USER_NOT_FOUND);
    return;
  }

  try {
    switch (command) {
      case "authenticate": {
        const balance = await currentUserBalance(db, userId);
        if (balance === null) {
          palaceResult(res, PALACE_RESULT.USER_NOT_FOUND);
          return;
        }
        palaceResult(res, PALACE_RESULT.SUCCESS, {
          account,
          balance: ledgerAmountToCents(balance),
        });
        return;
      }
      case "balance": {
        const balance = await currentUserBalance(db, userId);
        if (balance === null) {
          palaceResult(res, PALACE_RESULT.USER_NOT_FOUND);
          return;
        }
        palaceResult(res, PALACE_RESULT.SUCCESS, {
          balance: ledgerAmountToCents(balance),
        });
        return;
      }
      case "bet": {
        const transGuid = String(data["trans_guid"] ?? "").trim();
        const amountCents = Number(data["amount"]);
        if (!transGuid || !Number.isFinite(amountCents) || amountCents <= 0) {
          palaceResult(res, PALACE_RESULT.INVALID_REQUEST);
          return;
        }
        const idempotencyKey = `palace:${transGuid}`;
        try {
          const outcome = await db.transaction(async (tx) => {
            const existing = await ledgerEntryByKey(
              tx as unknown as typeof db,
              idempotencyKey,
            );
            if (existing) return "duplicate" as const;
            const ok = await applyBalanceDelta(tx, {
              userId,
              amount: `-${centsToLedgerAmount(amountCents)}`,
              kind: "casino_palace_bet",
              idempotencyKey,
              refType: "casino_palace_round",
              refId: String(data["round_id"] ?? transGuid),
              metadata: data,
              enforceNonNegative: true,
            });
            return ok ? ("applied" as const) : ("duplicate" as const);
          });
          const balance = await currentUserBalance(db, userId);
          if (outcome === "duplicate") {
            palaceResult(res, PALACE_RESULT.ALREADY_PROCESSED, {
              balance: ledgerAmountToCents(balance!),
            });
          } else {
            palaceResult(res, PALACE_RESULT.SUCCESS, {
              balance: ledgerAmountToCents(balance!),
            });
          }
        } catch (err) {
          logger.warn({ err, userId, transGuid }, "[palace-callback] bet declined");
          const balance = await currentUserBalance(db, userId);
          palaceResult(res, PALACE_RESULT.BALANCE_INSUFFICIENT, {
            balance: ledgerAmountToCents(balance!),
          });
        }
        return;
      }
      case "win": {
        const transGuid = String(data["trans_guid"] ?? "").trim();
        const amountCents = Number(data["amount"]);
        if (!transGuid || !Number.isFinite(amountCents) || amountCents < 0) {
          palaceResult(res, PALACE_RESULT.INVALID_REQUEST);
          return;
        }
        const idempotencyKey = `palace:${transGuid}`;
        const outcome = await db.transaction(async (tx) => {
          const existing = await ledgerEntryByKey(
            tx as unknown as typeof db,
            idempotencyKey,
          );
          if (existing) return "duplicate" as const;
          await applyBalanceDelta(tx, {
            userId,
            amount: centsToLedgerAmount(amountCents),
            kind: "casino_palace_win",
            idempotencyKey,
            refType: "casino_palace_round",
            refId: String(data["round_id"] ?? transGuid),
            metadata: data,
          });
          return "applied" as const;
        });
        const balance = await currentUserBalance(db, userId);
        palaceResult(
          res,
          outcome === "duplicate"
            ? PALACE_RESULT.ALREADY_PROCESSED
            : PALACE_RESULT.SUCCESS,
          { balance: ledgerAmountToCents(balance!) },
        );
        return;
      }
      case "cancel": {
        const cancelTransGuid = String(data["cancel_trans_guid"] ?? "").trim();
        if (!cancelTransGuid) {
          palaceResult(res, PALACE_RESULT.INVALID_REQUEST);
          return;
        }
        const originalKey = `palace:${cancelTransGuid}`;
        // Idempotency key for the *reversal* is derived from cancel_trans_guid
        // (stable across retries) rather than this cancel event's own
        // trans_guid, which may differ on each retry attempt — matching the
        // reference's "mark the original row CANCEL" behavior: the first
        // cancel of a given original transaction reverses it, any further
        // cancel of the same original is a harmless no-op.
        const reversalKey = `palace:cancel:${cancelTransGuid}`;
        const outcome = await db.transaction(async (tx) => {
          const original = await ledgerEntryByKey(
            tx as unknown as typeof db,
            originalKey,
          );
          if (!original) return "not_found" as const;
          const alreadyReversed = await ledgerEntryByKey(
            tx as unknown as typeof db,
            reversalKey,
          );
          if (alreadyReversed) return "already_canceled" as const;
          const reversal = (-Number(original.amount)).toFixed(2);
          await applyBalanceDelta(tx, {
            userId,
            amount: reversal,
            kind: "casino_palace_cancel",
            idempotencyKey: reversalKey,
            refType: "casino_palace_round",
            refId: String(data["round_id"] ?? cancelTransGuid),
            metadata: data,
          });
          return "reversed" as const;
        });
        if (outcome === "not_found") {
          const balance = await currentUserBalance(db, userId);
          palaceResult(res, PALACE_RESULT.CANCEL_TRANS_NOT_FOUND, {
            balance: ledgerAmountToCents(balance!),
          });
          return;
        }
        const balance = await currentUserBalance(db, userId);
        palaceResult(res, PALACE_RESULT.SUCCESS, {
          balance: ledgerAmountToCents(balance!),
        });
        return;
      }
      case "status": {
        const transGuid = String(data["trans_guid"] ?? "").trim();
        if (!transGuid) {
          palaceResult(res, PALACE_RESULT.INVALID_REQUEST);
          return;
        }
        const original = await ledgerEntryByKey(db, `palace:${transGuid}`);
        if (!original) {
          palaceResult(res, PALACE_RESULT.TRANS_NOT_FOUND);
          return;
        }
        const reversed = await ledgerEntryByKey(db, `palace:cancel:${transGuid}`);
        palaceResult(res, PALACE_RESULT.SUCCESS, {
          account,
          trans_guid: transGuid,
          trans_status: reversed ? "CANCELED" : "OK",
        });
        return;
      }
      default:
        logger.warn({ command }, "[palace-callback] unknown command");
        palaceResult(res, PALACE_RESULT.INVALID_REQUEST);
    }
  } catch (err) {
    logger.error({ err, userId, command }, "[palace-callback] processing error");
    palaceResult(res, PALACE_RESULT.INTERNAL_ERROR);
  }
});

export default router;
