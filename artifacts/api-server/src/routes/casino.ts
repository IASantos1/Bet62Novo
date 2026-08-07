import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  casinoGamesTable,
  ledgerEntriesTable,
  casinoBannersTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";
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

// Catalog lives in Postgres (casino_games table). SilentAPI is
// suspended — /games and /providers below only ever return source="palace"
// rows (seeded via `pnpm run seed:palace-casino`, synced live against
// Palace Casino's API); the SilentAPI /launch route and its wallet
// callback (registered in app.ts) are kept as dormant code, not deleted,
// in case that decision changes again, but nothing in the active catalog
// reaches them. The front-end pages through the catalog 24 games at a
// time and never talks to either aggregator directly for listing.
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

  // Palace Casino only — SilentAPI is suspended (kept as dormant code, not
  // deleted, in case that decision changes again; explicitly filtered out
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
  const cached = await statpalCache.get(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "application/json");
    res.send(cached);
    return;
  }

  const conditions = [
    eq(casinoGamesTable.isActive, true),
    eq(casinoGamesTable.source, "palace"),
  ];
  if (provider && provider !== "Todos") conditions.push(eq(casinoGamesTable.provider, provider));

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
  await statpalCache.set(cacheKey, payload, GROUPS_CACHE_TTL_SECONDS);
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
  const cached = await statpalCache.get(cacheKey);
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
  const games = allGameIds.length
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
  const gamesByPk = new Map(games.map((g) => [g.pk, g]));

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
  await statpalCache.set(cacheKey, payload, BANNERS_CACHE_TTL_SECONDS);
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
        res.status(400).json({ error: `Não foi possível iniciar o jogo.${reason}` });
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
      res.status(400).json({ error: `Não foi possível iniciar o jogo.${reason}` });
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
      // 400, not 502 — this site is behind Cloudflare, which replaces the
      // body of any "gateway" status (502/504/52x) with its own generic
      // branded error page regardless of what we actually send, hiding the
      // real `reason` from both the user and from us debugging a screenshot.
      // 400 passes through untouched.
      const reason = err instanceof Error ? ` (${err.message})` : "";
      logger.error({ err, userId, providerId, gameSymbol }, "[palace-casino] launch error");
      res.status(400).json({ error: `Não foi possível iniciar o jogo.${reason}` });
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
// Amount unit: initially assumed Palace Casino used minor units (cents,
// as integers) — the general convention for casino/sportsbook APIs
// (SoftSwiss, Pragmatic, Evolution, etc.) and consistent with the docs'
// "amount": 0.9 example if read as "0.9 units of 0.01". A live end-to-end
// test proved that wrong for this integration: a real balance of 55.93
// EUR sent as 5593 (cents) rendered in-game as "€5,593.00" — Palace
// Casino's game engine reads the balance/amount fields as plain decimal
// EUR, the same representation our own ledger already uses natively. So
// there is no unit conversion left to do — these helpers just normalize
// number/string shapes at the boundary (JSON wants a bare number, our
// ledger wants a 2-decimal string).
function toPalaceAmount(ledgerAmount: string | number): number {
  return Number(Number(ledgerAmount).toFixed(2));
}
function fromPalaceAmount(amount: string | number): string {
  return Number(amount).toFixed(2);
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

// Palace Casino's own dashboard/docs are inconsistent about language: the
// PHP reference implementation (ground truth for real production traffic)
// uses English field names (command/data/account/result/balance), but their
// own callback-test tool and one doc page send/expect Portuguese
// (comando/dados/conta/resultado/saldo) — confirmed by the user pasting
// that exact Portuguese doc page. Rather than bet on one being "the real
// one", both requests (parseCommand below) and responses (palaceResult)
// carry both sets of keys — costs nothing, and works regardless of which
// side of their own platform is actually calling us.
const COMMAND_ALIASES_PT: Record<string, string> = {
  autenticar: "authenticate",
  saldo: "balance",
  aposta: "bet",
  "vitória": "win",
  vitoria: "win",
  cancelar: "cancel",
  status: "status",
};

function parseCommand(body: Record<string, unknown>): {
  command: string;
  data: Record<string, unknown>;
} {
  const rawCommand = String(body["command"] ?? body["comando"] ?? "");
  const data = (body["data"] ?? body["dados"] ?? {}) as Record<string, unknown>;
  return { command: COMMAND_ALIASES_PT[rawCommand] ?? rawCommand, data };
}

function accountFrom(data: Record<string, unknown>): string {
  return String(data["account"] ?? data["conta"] ?? "").trim();
}

function palaceResult(
  res: Response,
  result: number,
  data?: Record<string, unknown>,
): void {
  // Always HTTP 200 — see header comment. status mirrors their reference's
  // literal "OK"/"ERROR" string, which they may also inspect.
  const status = result === PALACE_RESULT.SUCCESS ? "OK" : "ERROR";
  const dataOut = data
    ? {
        ...data,
        ...("account" in data ? { conta: data["account"] } : {}),
        ...("balance" in data ? { saldo: data["balance"] } : {}),
      }
    : undefined;
  res.status(200).json({
    result,
    resultado: result,
    status,
    ...(dataOut ? { data: dataOut, dados: dataOut } : {}),
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

  const { command, data } = parseCommand(req.body as Record<string, unknown>);
  const account = accountFrom(data);
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
          balance: toPalaceAmount(balance),
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
          balance: toPalaceAmount(balance),
        });
        return;
      }
      case "bet": {
        const transGuid = String(data["trans_guid"] ?? "").trim();
        const amount = Number(data["amount"]);
        if (!transGuid || !Number.isFinite(amount) || amount <= 0) {
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
              amount: `-${fromPalaceAmount(amount)}`,
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
              balance: toPalaceAmount(balance!),
            });
          } else {
            palaceResult(res, PALACE_RESULT.SUCCESS, {
              balance: toPalaceAmount(balance!),
            });
          }
        } catch (err) {
          logger.warn({ err, userId, transGuid }, "[palace-callback] bet declined");
          const balance = await currentUserBalance(db, userId);
          palaceResult(res, PALACE_RESULT.BALANCE_INSUFFICIENT, {
            balance: toPalaceAmount(balance!),
          });
        }
        return;
      }
      case "win": {
        const transGuid = String(data["trans_guid"] ?? "").trim();
        const amount = Number(data["amount"]);
        if (!transGuid || !Number.isFinite(amount) || amount < 0) {
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
            amount: fromPalaceAmount(amount),
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
          { balance: toPalaceAmount(balance!) },
        );
        return;
      }
      case "cancel": {
        // Accept both spellings — one real example from Palace Casino's own
        // docs used "cancle_trans_guid" (missing the e) instead of the
        // correctly-spelled field their PHP reference implementation uses.
        // Unclear which is authoritative for real traffic, so read whichever
        // is present rather than betting on one.
        const cancelTransGuid = String(
          data["cancel_trans_guid"] ?? data["cancle_trans_guid"] ?? "",
        ).trim();
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
            balance: toPalaceAmount(balance!),
          });
          return;
        }
        const balance = await currentUserBalance(db, userId);
        palaceResult(res, PALACE_RESULT.SUCCESS, {
          balance: toPalaceAmount(balance!),
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
