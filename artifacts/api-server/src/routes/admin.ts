import { Router, type IRouter, type Response, type Request } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import {
  kycDocumentsTable,
  usersTable,
  betsTable,
  paymentsTable,
  withdrawalsTable,
  settlementLogsTable,
  casinoGamesTable,
  ledgerEntriesTable,
  casinoBannersTable,
} from "@workspace/db/schema";
import { eq, desc, count, sum, sql, gte, lte, and, ilike, asc, like, inArray } from "drizzle-orm";
import {
  adminMiddleware,
  type AdminRequest,
} from "../middlewares/adminAuth.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { logger } from "../lib/logger.js";
import { applyBalanceDelta, applyFreebetBalanceDelta } from "../lib/ledger.js";
import {
  getPulseScoreFootballLive,
  getPulseScoreFootballUsage,
} from "../services/pulsescore/football.js";
import {
  getPulseScoreTennisLive,
  getPulseScoreTennisUsage,
} from "../services/pulsescore/tennis.js";
import { pulseScoreFootballWsStatus } from "../services/pulsescore/footballWs.js";
import {
  pulseScoreBasketball,
  pulseScoreHockey,
  pulseScoreBaseball,
  pulseScoreVolleyball,
} from "../services/pulsescore/genericSportLive.js";
import { pulseScoreRestUrl } from "../services/pulsescore/client.js";
import { CONFIG } from "../lib/config.js";
import { getSettlementFallbackMetrics } from "../lib/settlementHelpers.js";
import { timingSafeEqualString } from "../lib/security.js";
import fs from "fs";
import path from "path";
import manualReviewRouter from "./manualReview.js";
import { replayEngine } from "../lib/replayEngine.js";
import { countryForLeagueName } from "./matches.js";
import { pulseScoreFetchFootballLeagues } from "../services/pulsescore/leagues.js";
import {
  getPalaceCasinoProviders,
  getPalaceCasinoAgentInfo,
} from "../services/palaceCasino/client.js";
import { listMappings, setMapping, createMapping } from "../services/liveStream/mapping.js";
import { memberAccountForUser } from "./casino.js";

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  let s = String(val);
  // Neutralize potential formula injection (=, +, -, @, tab, CR at start)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.startsWith("'")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsv).join(",");
}

const router: IRouter = Router();
const LATE_PENDING_DEFAULT_HOURS = 3;

type AdminPendingSelection = {
  selection?: string;
  market?: string;
  label?: string;
  matchId?: string;
  matchTitle?: string;
  outcome?: string | null;
  pendingReason?: string | null;
  finalScore?: { home: number; away: number } | null;
  htScore?: { htHome: number; htAway: number } | null;
  kickoffTime?: string;
  scheduledAt?: string;
  date?: string;
  time?: string;
  sport?: string;
  providerSport?: string;
};

function normalizeAdminSport(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value) return "unknown";
  if (value === "soccer") return "football";
  if (value === "nba" || value === "bball") return "basketball";
  if (value === "mlb") return "baseball";
  if (value === "nhl") return "hockey";
  if (value === "volley") return "volleyball";
  return value;
}

function inferAdminSportFromMatchId(matchId: unknown): string {
  const value = String(matchId ?? "")
    .trim()
    .toLowerCase();
  if (value.startsWith("football-v2-")) return "football";
  if (value.startsWith("tennis-v2-")) return "tennis";
  if (value.startsWith("bball-v2-")) return "basketball";
  if (value.startsWith("baseball-v2-") || value.startsWith("mlb-v2-"))
    return "baseball";
  if (value.startsWith("hockey-v2-")) return "hockey";
  if (value.startsWith("volley-live-") || value.startsWith("volley-odds-"))
    return "volleyball";
  return "unknown";
}

function parseAdminSelectionKickoffTs(
  sel: AdminPendingSelection,
): number | null {
  const isoCandidate = sel.kickoffTime ?? sel.scheduledAt;
  if (typeof isoCandidate === "string" && isoCandidate.trim() !== "") {
    const ts = new Date(isoCandidate).getTime();
    if (Number.isFinite(ts)) return ts;
  }

  const date = String(sel.date ?? "").trim();
  const time = String(sel.time ?? "").trim();
  const dateMatch = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!dateMatch) return null;
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  const hh = timeMatch ? Number(timeMatch[1]) : 0;
  const mm = timeMatch ? Number(timeMatch[2]) : 0;
  const ts = Date.UTC(
    Number(dateMatch[3]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[1]),
    hh,
    mm,
  );
  return Number.isFinite(ts) ? ts : null;
}

function parseAdminBetKickoffTs(bet: {
  kickoffTime?: Date | string | null;
  createdAt: Date;
  selections: AdminPendingSelection[];
}): number {
  const kickoff = bet.kickoffTime;
  if (kickoff instanceof Date && Number.isFinite(kickoff.getTime())) {
    return kickoff.getTime();
  }
  if (typeof kickoff === "string" && kickoff.trim() !== "") {
    const ts = new Date(kickoff).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  const selectionKickoffs = bet.selections
    .map((sel) => parseAdminSelectionKickoffTs(sel))
    .filter((ts): ts is number => Number.isFinite(ts));
  if (selectionKickoffs.length > 0) return Math.min(...selectionKickoffs);
  return bet.createdAt.getTime();
}

function incrementCounter(counters: Record<string, number>, key: string): void {
  counters[key] = (counters[key] ?? 0) + 1;
}

function buildLatePendingSummary(
  pendingBets: Array<{
    id: number;
    userId: number;
    matchId: string;
    matchTitle: string;
    stake: string;
    potentialWin: string;
    totalOdds: string;
    status: string;
    createdAt: Date;
    kickoffTime?: Date | null;
    selections: unknown;
    userName?: string | null;
    userEmail?: string | null;
  }>,
  graceHours: number,
  limit: number,
): {
  graceHours: number;
  latePendingBetCount: number;
  latePendingSelectionCount: number;
  byReason: Record<string, number>;
  bySport: Record<string, number>;
  byMarket: Record<string, number>;
  rows: Array<Record<string, unknown>>;
} {
  const thresholdMs = graceHours * 60 * 60 * 1000;
  const byReason: Record<string, number> = {};
  const bySport: Record<string, number> = {};
  const byMarket: Record<string, number> = {};
  const lateBetIds = new Set<number>();
  const rows: Array<Record<string, unknown>> = [];

  for (const bet of pendingBets) {
    const selections = Array.isArray(bet.selections)
      ? (bet.selections as AdminPendingSelection[])
      : [];
    const kickoffTs = parseAdminBetKickoffTs({
      kickoffTime: bet.kickoffTime,
      createdAt: bet.createdAt,
      selections,
    });
    const ageMs = Date.now() - kickoffTs;
    if (ageMs < thresholdMs) continue;

    for (let index = 0; index < selections.length; index++) {
      const sel = selections[index]!;
      const outcome = typeof sel.outcome === "string" ? sel.outcome : null;
      if (outcome && outcome !== "pending") continue;

      lateBetIds.add(bet.id);
      const reason =
        String(sel.pendingReason ?? "missing_pending_reason").trim() ||
        "missing_pending_reason";
      const sport =
        normalizeAdminSport(sel.providerSport ?? sel.sport) !== "unknown"
          ? normalizeAdminSport(sel.providerSport ?? sel.sport)
          : inferAdminSportFromMatchId(sel.matchId ?? bet.matchId);
      const market =
        String(sel.market ?? sel.selection ?? "unknown").trim() || "unknown";

      incrementCounter(byReason, reason);
      incrementCounter(bySport, sport);
      incrementCounter(byMarket, market);

      if (rows.length < limit) {
        rows.push({
          betId: bet.id,
          userId: bet.userId,
          userName: bet.userName ?? null,
          userEmail: bet.userEmail ?? null,
          matchId: sel.matchId ?? bet.matchId,
          matchTitle: sel.matchTitle ?? bet.matchTitle,
          selectionIndex: index,
          selection: sel.selection ?? null,
          market: sel.market ?? null,
          label: sel.label ?? null,
          sport,
          reason,
          createdAt: bet.createdAt,
          kickoffTime: new Date(kickoffTs).toISOString(),
          pendingForMinutes: Math.floor(ageMs / 60_000),
          finalScore: sel.finalScore ?? null,
          htScore: sel.htScore ?? null,
          stake: bet.stake,
          totalOdds: bet.totalOdds,
          potentialWin: bet.potentialWin,
        });
      }
    }
  }

  return {
    graceHours,
    latePendingBetCount: lateBetIds.size,
    latePendingSelectionCount: Object.values(byReason).reduce(
      (sumSoFar, countValue) => sumSoFar + countValue,
      0,
    ),
    byReason,
    bySport,
    byMarket,
    rows,
  };
}

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("[SECURITY] SESSION_SECRET environment variable is not set.");
}
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_EMAIL) {
  throw new Error(
    "[SECURITY] ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_EMAIL must be set.",
  );
}

const adminLoginRateLimit = rateLimit({
  name: "admin-login",
  windowMs: 60_000,
  max: 5,
  message: "Muitas tentativas. Tente novamente em 1 minuto.",
});

// POST /api/admin/login
router.post(
  "/login",
  adminLoginRateLimit,
  (req: Request, res: Response): void => {
    const { username, email, password } = req.body as {
      username?: string;
      email?: string;
      password?: string;
    };
    const loginId = username || email;

    if (!loginId || !password) {
      res
        .status(400)
        .json({ error: "Utilizador/email e senha são obrigatórios" });
      return;
    }

    const usernameMatch = loginId === ADMIN_USERNAME;
    const emailMatch = loginId === ADMIN_EMAIL;

    if (
      (!usernameMatch && !emailMatch) ||
      !timingSafeEqualString(password, ADMIN_PASSWORD)
    ) {
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }

    const token = jwt.sign(
      { username: ADMIN_USERNAME, email: ADMIN_EMAIL, isAdmin: true },
      SESSION_SECRET,
      { expiresIn: "8h" },
    );
    res.json({ token, username: ADMIN_USERNAME, email: ADMIN_EMAIL });
  },
);

// GET /api/admin/stats
router.get(
  "/stats",
  adminMiddleware,
  async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const [userCount] = await db.select({ count: count() }).from(usersTable);
      const [betCount] = await db.select({ count: count() }).from(betsTable);
      const [pendingCount] = await db
        .select({ count: count() })
        .from(betsTable)
        .where(eq(betsTable.status, "pending"));
      const [wonCount] = await db
        .select({ count: count() })
        .from(betsTable)
        .where(eq(betsTable.status, "won"));
      const [lostCount] = await db
        .select({ count: count() })
        .from(betsTable)
        .where(eq(betsTable.status, "lost"));
      const [cashoutCount] = await db
        .select({ count: count() })
        .from(betsTable)
        .where(eq(betsTable.status, "cashed_out"));
      const [totalStaked] = await db
        .select({ total: sum(betsTable.stake) })
        .from(betsTable);
      const [totalPaidOut] = await db
        .select({ total: sum(betsTable.potentialWin) })
        .from(betsTable)
        .where(eq(betsTable.status, "won"));
      const [totalBalance] = await db
        .select({ total: sum(usersTable.balance) })
        .from(usersTable);
      const [totalDeposited] = await db
        .select({ total: sum(paymentsTable.amount) })
        .from(paymentsTable)
        .where(eq(paymentsTable.status, "completed"));
      const [pendingWithdrawals] = await db
        .select({ count: count(), total: sum(withdrawalsTable.amount) })
        .from(withdrawalsTable)
        .where(eq(withdrawalsTable.status, "pending_review"));

      const last7Days = await db.execute(sql`
      SELECT DATE(created_at AT TIME ZONE 'UTC') as day, COUNT(*) as bets, SUM(stake::numeric) as volume
      FROM bets
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day ASC
    `);

      res.json({
        users: { total: Number(userCount.count) },
        bets: {
          total: Number(betCount.count),
          pending: Number(pendingCount.count),
          won: Number(wonCount.count),
          lost: Number(lostCount.count),
          cashedOut: Number(cashoutCount.count),
        },
        financial: {
          totalStaked: parseFloat(totalStaked.total || "0"),
          totalPaidOut: parseFloat(totalPaidOut.total || "0"),
          totalUserBalance: parseFloat(totalBalance.total || "0"),
          totalDeposited: parseFloat(totalDeposited.total || "0"),
          margin: totalStaked.total
            ? (
                ((parseFloat(totalStaked.total) -
                  parseFloat(totalPaidOut.total || "0")) /
                  parseFloat(totalStaked.total)) *
                100
              ).toFixed(1)
            : "0.0",
        },
        withdrawals: {
          pendingCount: Number(pendingWithdrawals.count),
          pendingTotal: parseFloat(pendingWithdrawals.total || "0"),
        },
        chart: last7Days.rows,
      });
    } catch (err) {
      logger.error({ err }, "Admin stats error");
      res.status(500).json({ error: "Erro ao carregar estatísticas" });
    }
  },
);

// GET /api/admin/users
router.get(
  "/users",
  adminMiddleware,
  async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const users = await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          balance: usersTable.balance,
          freebetBalance: usersTable.freebetBalance,
          kycStatus: usersTable.kycStatus,
          selfExcludedUntil: usersTable.selfExcludedUntil,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt));

      const betCounts = await db
        .select({
          userId: betsTable.userId,
          count: count(),
          totalStaked: sum(betsTable.stake),
        })
        .from(betsTable)
        .groupBy(betsTable.userId);

      const betMap = new Map(betCounts.map((b) => [b.userId, b]));

      const result = users.map((u) => ({
        ...u,
        betCount: Number(betMap.get(u.id)?.count || 0),
        totalStaked: parseFloat(betMap.get(u.id)?.totalStaked || "0"),
        banned: u.selfExcludedUntil
          ? new Date(u.selfExcludedUntil) > new Date()
          : false,
      }));

      res.json(result);
    } catch (err) {
      logger.error({ err }, "Admin users error");
      res.status(500).json({ error: "Erro ao carregar usuários" });
    }
  },
);

// GET /api/admin/users/:id/detail
router.get(
  "/users/:id/detail",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const userId = parseInt(String(req.params["id"]), 10);
    if (isNaN(userId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "Utilizador não encontrado" });
        return;
      }

      const bets = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.userId, userId))
        .orderBy(desc(betsTable.createdAt))
        .limit(50);
      const payments = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.userId, userId))
        .orderBy(desc(paymentsTable.createdAt))
        .limit(50);
      const withdrawals = await db
        .select()
        .from(withdrawalsTable)
        .where(eq(withdrawalsTable.userId, userId))
        .orderBy(desc(withdrawalsTable.createdAt))
        .limit(50);
      const kycDocuments = await db
        .select({
          id: kycDocumentsTable.id,
          userId: kycDocumentsTable.userId,
          kind: kycDocumentsTable.kind,
          fileName: kycDocumentsTable.fileName,
          mimeType: kycDocumentsTable.mimeType,
          fileSize: kycDocumentsTable.fileSize,
          status: kycDocumentsTable.status,
          createdAt: kycDocumentsTable.createdAt,
          reviewedAt: kycDocumentsTable.reviewedAt,
        })
        .from(kycDocumentsTable)
        .where(eq(kycDocumentsTable.userId, userId))
        .orderBy(desc(kycDocumentsTable.createdAt));

      res.json({ user, bets, payments, withdrawals, kycDocuments });
    } catch (err) {
      logger.error({ err }, "Admin user detail error");
      res.status(500).json({ error: "Erro ao carregar detalhes" });
    }
  },
);

// PUT /api/admin/users/:id/balance
router.put(
  "/users/:id/balance",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const userId = parseInt(String(req.params["id"]), 10);
    const { balance, operation, amount } = req.body;

    if (isNaN(userId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    try {
      const updated = await db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        if (!user)
          throw Object.assign(new Error("Usuário não encontrado"), {
            status: 404,
          });

        let newBalance: string;
        if (operation === "add") {
          newBalance = (parseFloat(user.balance) + parseFloat(amount)).toFixed(
            2,
          );
        } else if (operation === "subtract") {
          newBalance = Math.max(
            0,
            parseFloat(user.balance) - parseFloat(amount),
          ).toFixed(2);
        } else if (
          balance !== undefined ||
          (operation === "set" && amount !== undefined)
        ) {
          const targetBalance = balance ?? amount;
          newBalance = Math.max(0, parseFloat(targetBalance)).toFixed(2);
        } else {
          throw Object.assign(new Error("Operação inválida"), { status: 400 });
        }

        const delta = (
          parseFloat(newBalance) - parseFloat(user.balance)
        ).toFixed(2);
        if (delta !== "0.00") {
          const reqKey = String(
            (req as unknown as Request).header("Idempotency-Key") ??
              (req as unknown as Request).header("X-Idempotency-Key") ??
              "",
          );
          const idempotencyKey =
            reqKey.trim() !== ""
              ? reqKey.trim()
              : `admin:balance:${userId}:${newBalance}:${String(operation ?? "set")}`;
          await applyBalanceDelta(tx, {
            userId,
            amount: delta,
            kind: "admin_balance_adjustment",
            idempotencyKey,
            refType: "admin",
            refId: req.admin?.username ?? "admin",
            enforceNonNegative: true,
            metadata: { operation: operation ?? "set", newBalance },
          });
        }

        const [after] = await tx
          .select({ id: usersTable.id, balance: usersTable.balance })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        return after!;
      });

      res.json({ id: updated.id, balance: updated.balance });
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 400 || e.status === 404) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      logger.error({ err }, "Admin balance update error");
      res.status(500).json({ error: "Erro ao atualizar saldo" });
    }
  },
);

// PUT /api/admin/users/:id/freebet
router.put(
  "/users/:id/freebet",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const userId = parseInt(String(req.params["id"]), 10);
    const { amount } = req.body as { amount?: string };

    if (
      isNaN(userId) ||
      !amount ||
      isNaN(parseFloat(amount)) ||
      parseFloat(amount) <= 0
    ) {
      res.status(400).json({ error: "Valor de freebet inválido" });
      return;
    }

    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "Utilizador não encontrado" });
        return;
      }

      const newFreebet = (
        parseFloat(user.freebetBalance) + parseFloat(amount)
      ).toFixed(2);
      const [updated] = await db
        .update(usersTable)
        .set({ freebetBalance: newFreebet })
        .where(eq(usersTable.id, userId))
        .returning();
      res.json({ id: updated.id, freebetBalance: updated.freebetBalance });
    } catch (err) {
      logger.error({ err }, "Admin freebet error");
      res.status(500).json({ error: "Erro ao atribuir freebet" });
    }
  },
);

// PUT /api/admin/users/:id/ban
router.put(
  "/users/:id/ban",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const userId = parseInt(String(req.params["id"]), 10);
    const { banned } = req.body as { banned?: boolean };

    if (isNaN(userId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "Utilizador não encontrado" });
        return;
      }

      const selfExcludedUntil = banned
        ? new Date("2099-12-31T23:59:59Z")
        : null;
      const [updated] = await db
        .update(usersTable)
        .set({ selfExcludedUntil })
        .where(eq(usersTable.id, userId))
        .returning();
      res.json({
        id: updated.id,
        banned: updated.selfExcludedUntil
          ? new Date(updated.selfExcludedUntil) > new Date()
          : false,
      });
    } catch (err) {
      logger.error({ err }, "Admin ban error");
      res.status(500).json({ error: "Erro ao banir utilizador" });
    }
  },
);

// PUT /api/admin/users/:id/kyc
router.put(
  "/users/:id/kyc",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const userId = parseInt(String(req.params["id"]), 10);
    const { kycStatus } = req.body as { kycStatus?: string };
    const valid = ["not_submitted", "pending", "approved", "rejected"];
    if (isNaN(userId) || !kycStatus || !valid.includes(kycStatus)) {
      res.status(400).json({ error: "Status KYC inválido" });
      return;
    }
    try {
      const [updated] = await db
        .update(usersTable)
        .set({ kycStatus })
        .where(eq(usersTable.id, userId))
        .returning();
      res.json({ id: updated.id, kycStatus: updated.kycStatus });
    } catch (err) {
      logger.error({ err }, "Admin KYC error");
      res.status(500).json({ error: "Erro ao atualizar KYC" });
    }
  },
);

function getKycUploadRoot(): string {
  return path.resolve(
    ((globalThis as Record<string, unknown>).__dirname as string) ?? __dirname,
    "../uploads/kyc",
  );
}

function resolveKycStoredFile(storagePath: string): string | null {
  const uploadRoot = getKycUploadRoot();
  const normalizedRoot = path.resolve(uploadRoot);
  const candidates = [
    path.isAbsolute(storagePath)
      ? path.resolve(storagePath)
      : path.resolve(normalizedRoot, storagePath),
    path.resolve(normalizedRoot, path.basename(storagePath)),
  ];

  for (const candidate of candidates) {
    const normalizedCandidate = path.resolve(candidate);
    if (
      (normalizedCandidate === normalizedRoot ||
        normalizedCandidate.startsWith(normalizedRoot + path.sep)) &&
      fs.existsSync(normalizedCandidate)
    ) {
      return normalizedCandidate;
    }
  }

  return null;
}

router.get(
  "/kyc/documents",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const userIdStr = String(req.query["userId"] || "");
    const userId = userIdStr ? parseInt(userIdStr, 10) : null;
    const status = String(req.query["status"] || "");

    if (userIdStr && (userId === null || isNaN(userId))) {
      res.status(400).json({ error: "userId inválido" });
      return;
    }

    const validStatuses = ["pending", "approved", "rejected"];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: "status inválido" });
      return;
    }

    try {
      const conditions = [];
      if (userId !== null)
        conditions.push(eq(kycDocumentsTable.userId, userId));
      if (status) conditions.push(eq(kycDocumentsTable.status, status));

      const docs = await db
        .select({
          id: kycDocumentsTable.id,
          userId: kycDocumentsTable.userId,
          kind: kycDocumentsTable.kind,
          fileName: kycDocumentsTable.fileName,
          mimeType: kycDocumentsTable.mimeType,
          fileSize: kycDocumentsTable.fileSize,
          status: kycDocumentsTable.status,
          createdAt: kycDocumentsTable.createdAt,
          reviewedAt: kycDocumentsTable.reviewedAt,
        })
        .from(kycDocumentsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(kycDocumentsTable.createdAt))
        .limit(500);

      res.json(docs);
    } catch (err) {
      logger.error({ err }, "Admin kyc documents error");
      res.status(500).json({ error: "Erro ao carregar documentos" });
    }
  },
);

router.get(
  "/kyc/documents/:id/download",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const docId = parseInt(String(req.params["id"]), 10);
    if (isNaN(docId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    try {
      const [doc] = await db
        .select({
          id: kycDocumentsTable.id,
          fileName: kycDocumentsTable.fileName,
          mimeType: kycDocumentsTable.mimeType,
          storagePath: kycDocumentsTable.storagePath,
          fileData: kycDocumentsTable.fileData,
        })
        .from(kycDocumentsTable)
        .where(eq(kycDocumentsTable.id, docId))
        .limit(1);

      if (!doc) {
        res.status(404).json({ error: "Documento não encontrado" });
        return;
      }

      const resolved = resolveKycStoredFile(doc.storagePath);
      if (!resolved) {
        if (doc.fileData && doc.fileData.length > 0) {
          res.setHeader("Content-Type", doc.mimeType);
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
          );
          res.setHeader("Cache-Control", "no-store");
          res.send(doc.fileData);
          return;
        }
        res.status(404).json({
          error:
            "Ficheiro não encontrado. Este documento foi guardado apenas no disco local e já não existe no servidor atual.",
        });
        return;
      }

      res.setHeader("Content-Type", doc.mimeType);
      res.setHeader("Cache-Control", "no-store");
      res.download(resolved, doc.fileName);
    } catch (err) {
      logger.error({ err }, "Admin kyc download error");
      res.status(500).json({ error: "Erro ao descarregar documento" });
    }
  },
);

router.put(
  "/kyc/documents/:id/status",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const docId = parseInt(String(req.params["id"]), 10);
    const { status } = req.body as { status?: string };
    const validStatuses = ["pending", "approved", "rejected"];

    if (isNaN(docId) || !status || !validStatuses.includes(status)) {
      res.status(400).json({ error: "Status inválido" });
      return;
    }

    try {
      const [updated] = await db
        .update(kycDocumentsTable)
        .set({
          status,
          reviewedAt:
            status === "approved" || status === "rejected" ? new Date() : null,
        })
        .where(eq(kycDocumentsTable.id, docId))
        .returning({
          id: kycDocumentsTable.id,
          userId: kycDocumentsTable.userId,
          kind: kycDocumentsTable.kind,
          fileName: kycDocumentsTable.fileName,
          mimeType: kycDocumentsTable.mimeType,
          fileSize: kycDocumentsTable.fileSize,
          status: kycDocumentsTable.status,
          createdAt: kycDocumentsTable.createdAt,
          reviewedAt: kycDocumentsTable.reviewedAt,
        });

      if (!updated) {
        res.status(404).json({ error: "Documento não encontrado" });
        return;
      }

      const allDocs = await db
        .select({ status: kycDocumentsTable.status })
        .from(kycDocumentsTable)
        .where(eq(kycDocumentsTable.userId, updated.userId));

      const hasRejected = allDocs.some((d) => d.status === "rejected");
      const allApproved =
        allDocs.length > 0 && allDocs.every((d) => d.status === "approved");
      const nextUserStatus = hasRejected
        ? "rejected"
        : allApproved
          ? "approved"
          : "pending";

      const [user] = await db
        .update(usersTable)
        .set({ kycStatus: nextUserStatus })
        .where(eq(usersTable.id, updated.userId))
        .returning({ id: usersTable.id, kycStatus: usersTable.kycStatus });

      res.json({ ok: true, document: updated, user });
    } catch (err) {
      logger.error({ err }, "Admin kyc update status error");
      res.status(500).json({ error: "Erro ao atualizar status do documento" });
    }
  },
);

// GET /api/admin/bets
router.get(
  "/bets",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page = parseInt(String(req.query["page"] || "1"), 10);
      const status = String(req.query["status"] || "all");
      const limit = 50;
      const offset = (page - 1) * limit;

      const validStatuses = ["pending", "won", "lost", "cashed_out"];
      const query = db
        .select({
          id: betsTable.id,
          userId: betsTable.userId,
          matchTitle: betsTable.matchTitle,
          stake: betsTable.stake,
          potentialWin: betsTable.potentialWin,
          totalOdds: betsTable.totalOdds,
          status: betsTable.status,
          createdAt: betsTable.createdAt,
          userName: usersTable.name,
          userEmail: usersTable.email,
          // Individual legs of the bet (match/market/selection/odd per leg) —
          // user request 2026-08-15: let an admin click a bet in the list
          // and see every selection it's made of, not just the flat
          // matchTitle summary string. Read-only for the admin view; the
          // settlement engine reads this same column directly from the DB,
          // never through this endpoint.
          selections: betsTable.selections,
        })
        .from(betsTable)
        .leftJoin(usersTable, eq(betsTable.userId, usersTable.id))
        .orderBy(desc(betsTable.createdAt))
        .limit(limit)
        .offset(offset);

      const bets = validStatuses.includes(status)
        ? await query.where(eq(betsTable.status, status))
        : await query;

      res.json(bets);
    } catch (err) {
      logger.error({ err }, "Admin bets error");
      res.status(500).json({ error: "Erro ao carregar apostas" });
    }
  },
);

// PUT /api/admin/bets/:id/status
router.put(
  "/bets/:id/status",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const rawId = String(req.params["id"] ?? "");
    const normalized = rawId.toUpperCase().startsWith("BT62-")
      ? rawId.slice(5)
      : rawId;
    const betId = parseInt(normalized, 10);
    const { status } = req.body;

    if (!Number.isFinite(betId) || betId <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const validStatuses = ["pending", "won", "lost", "cashed_out", "voided"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Status inválido" });
      return;
    }

    try {
      const [bet] = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.id, betId))
        .limit(1);
      if (!bet) {
        res.status(404).json({ error: "Aposta não encontrada" });
        return;
      }

      const oldStatus = bet.status;
      const isFreebet = String(bet.isFreebet ?? "") === "true";
      // A freebet win pays stake-inclusive, same as bet.potentialWin — see
      // settlement.ts's freebetAwareWinPayout for the full policy history
      // (2026-08-15: explicit, informed platform-owner decision to pay a
      // freebet win exactly like a real-money bet). isFreebet is still
      // read above/used below for freebetBalance vs real-balance credit
      // routing, just no longer changes the payout AMOUNT for a win.
      const winPayout = bet.potentialWin;
      let changed = false;

      await db.transaction(async (tx) => {
        // Optimistic lock: only update if status actually changed. Bumps
        // version for consistency with the rest of the codebase's
        // optimistic-locking scheme (updateBetOptimistic, settlement.ts) —
        // this endpoint previously left it untouched.
        const rows = await tx
          .update(betsTable)
          .set({ status, version: sql`${betsTable.version} + 1` })
          .where(
            and(eq(betsTable.id, betId), sql`${betsTable.status} != ${status}`),
          )
          .returning({ id: betsTable.id, version: betsTable.version });

        if (rows.length === 0) return; // already at desired status — no-op
        changed = true;
        const v = rows[0]!.version;

        // Claw back a previous payout/refund when moving AWAY from a status
        // that already credited money — otherwise correcting an admin
        // mistake (e.g. won → lost) left the earlier credit in place
        // permanently, with no debit ever issued. Confirmed missing via
        // audit (2026-08-10). Uses the *previous* transition's own amount
        // (won/voided credit both reversible via a straight negation) —
        // this can't double-claw-back since it only fires once, exactly
        // when actually leaving that status (oldStatus check).
        if (oldStatus === "won" && status !== "won") {
          // A win — freebet or not — was credited to REAL balance below
          // (matching settlement.ts's primary auto-settlement path, which
          // always uses applyBalanceDelta for a win regardless of
          // isFreebet), so the clawback must also target real balance, not
          // freebetBalance. Previously this branched on isFreebet, which
          // was inconsistent with what the credit below actually did —
          // fixed 2026-08-15 alongside the freebet win payout policy
          // change, found while touching this exact code.
          await applyBalanceDelta(tx, {
            userId: bet.userId,
            amount: `-${winPayout}`,
            kind: "admin_bet_settlement_clawback",
            idempotencyKey: `admin:bet:${betId}:v:${v}:clawback:won`,
            refType: "bet",
            refId: String(betId),
          });
        }
        if (oldStatus === "voided" && status !== "voided") {
          const clawback = isFreebet ? applyFreebetBalanceDelta : applyBalanceDelta;
          await clawback(tx, {
            userId: bet.userId,
            amount: `-${bet.stake}`,
            kind: "admin_bet_settlement_clawback",
            idempotencyKey: `admin:bet:${betId}:v:${v}:clawback:voided`,
            refType: "bet",
            refId: String(betId),
          });
        }

        // Credit balance atomically when marking won (only from non-won
        // state) — always REAL balance, freebet or not, matching
        // settlement.ts's primary auto-settlement path (which always uses
        // applyBalanceDelta for a win). The freebet-vs-real distinction only
        // affects the STAKE (debited from freebetBalance at placement,
        // refunded to freebetBalance on void) — a win's payout is real
        // money either way.
        if (status === "won" && oldStatus !== "won") {
          await applyBalanceDelta(tx, {
            userId: bet.userId,
            amount: winPayout,
            kind: "admin_bet_settlement_payout",
            idempotencyKey: `admin:bet:${betId}:v:${v}:status:won`,
            refType: "bet",
            refId: String(betId),
          });
        }

        // Refund stake when voiding (only from non-voided state) — to
        // freebetBalance for a freebet bet, matching settlement.ts's
        // applyVoidRefund (the stake was never real money to begin with).
        if (status === "voided" && oldStatus !== "voided") {
          const refund = isFreebet ? applyFreebetBalanceDelta : applyBalanceDelta;
          await refund(tx, {
            userId: bet.userId,
            amount: bet.stake,
            kind: "admin_bet_settlement_refund",
            idempotencyKey: `admin:bet:${betId}:v:${v}:status:voided`,
            refType: "bet",
            refId: String(betId),
          });
        }
      });

      if (changed) {
        try {
          await db
            .insert(settlementLogsTable)
            .values({
              settlementKey: `admin:bet:${betId}:old:${oldStatus}:new:${status}:event:manual_settlement`,
              betId: bet.id,
              userId: bet.userId,
              oldStatus,
              newStatus: status,
              payout:
                status === "won"
                  ? winPayout
                  : status === "voided"
                    ? bet.stake
                    : "0.00",
              message: "Manual settlement by admin",
            })
            .onConflictDoNothing();
        } catch (auditErr) {
          logger.error(
            { err: auditErr, betId, oldStatus, status },
            "Admin bet status audit log failed",
          );
        }
      }

      res.json({ id: betId, status });
    } catch (err) {
      logger.error({ err }, "Admin bet status update error");
      res.status(500).json({ error: "Erro ao atualizar status" });
    }
  },
);

// GET /api/admin/payments
router.get(
  "/payments",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page = parseInt(String(req.query["page"] || "1"), 10);
      const limit = 50;
      const offset = (page - 1) * limit;

      const payments = await db
        .select({
          id: paymentsTable.id,
          orderId: paymentsTable.orderId,
          userId: paymentsTable.userId,
          amount: paymentsTable.amount,
          method: paymentsTable.method,
          status: paymentsTable.status,
          entity: paymentsTable.entity,
          reference: paymentsTable.reference,
          createdAt: paymentsTable.createdAt,
          userName: usersTable.name,
          userEmail: usersTable.email,
        })
        .from(paymentsTable)
        .leftJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
        .orderBy(desc(paymentsTable.createdAt))
        .limit(limit)
        .offset(offset);

      res.json(payments);
    } catch (err) {
      logger.error({ err }, "Admin payments error");
      res.status(500).json({ error: "Erro ao carregar pagamentos" });
    }
  },
);

// POST /api/admin/payments/:id/credit  — manually credit a payment
router.post(
  "/payments/:id/credit",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const paymentId = parseInt(String(req.params["id"]), 10);
    if (isNaN(paymentId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    try {
      const [payment] = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.id, paymentId))
        .limit(1);
      if (!payment) {
        res.status(404).json({ error: "Pagamento não encontrado" });
        return;
      }
      if (payment.status === "completed") {
        res.status(400).json({ error: "Pagamento já foi creditado" });
        return;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(paymentsTable)
          .set({ status: "completed" })
          .where(eq(paymentsTable.id, paymentId));
        await applyBalanceDelta(tx, {
          userId: payment.userId,
          amount: payment.amount,
          kind: "admin_payment_credit",
          idempotencyKey: `payment:${payment.orderId}:admin_credit`,
          refType: "payment",
          refId: payment.orderId,
        });
      });

      res.json({ id: paymentId, status: "completed" });
    } catch (err) {
      logger.error({ err }, "Admin payment credit error");
      res.status(500).json({ error: "Erro ao creditar pagamento" });
    }
  },
);

// GET /api/admin/export?type=bets|deposits|withdrawals&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  "/export",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    const type = String(req.query["type"] || "bets");
    const fromStr = String(req.query["from"] || "");
    const toStr = String(req.query["to"] || "");

    const validTypes = ["bets", "deposits", "withdrawals"];
    if (!validTypes.includes(type)) {
      res
        .status(400)
        .json({ error: "Tipo inválido. Use: bets, deposits ou withdrawals" });
      return;
    }

    const fromDate = fromStr ? new Date(`${fromStr}T00:00:00Z`) : null;
    const toDate = toStr ? new Date(`${toStr}T23:59:59Z`) : null;

    if (fromDate && isNaN(fromDate.getTime())) {
      res.status(400).json({ error: "Data 'from' inválida" });
      return;
    }
    if (toDate && isNaN(toDate.getTime())) {
      res.status(400).json({ error: "Data 'to' inválida" });
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      res
        .status(400)
        .json({ error: "Data 'from' não pode ser posterior a 'to'" });
      return;
    }

    try {
      let csvLines: string[] = [];
      const filename = `bet62_${type}_${fromStr || "all"}_${toStr || "all"}.csv`;

      if (type === "bets") {
        const conditions = [];
        if (fromDate) conditions.push(gte(betsTable.createdAt, fromDate));
        if (toDate) conditions.push(lte(betsTable.createdAt, toDate));

        const rows = await db
          .select({
            id: betsTable.id,
            userId: betsTable.userId,
            userName: usersTable.name,
            userEmail: usersTable.email,
            matchTitle: betsTable.matchTitle,
            stake: betsTable.stake,
            potentialWin: betsTable.potentialWin,
            totalOdds: betsTable.totalOdds,
            status: betsTable.status,
            createdAt: betsTable.createdAt,
          })
          .from(betsTable)
          .leftJoin(usersTable, eq(betsTable.userId, usersTable.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(betsTable.createdAt));

        csvLines.push(
          buildCsvRow([
            "ID",
            "ID Utilizador",
            "Nome",
            "Email",
            "Aposta",
            "Valor (€)",
            "Ganho Potencial (€)",
            "Odds",
            "Status",
            "Data",
          ]),
        );
        for (const r of rows) {
          csvLines.push(
            buildCsvRow([
              r.id,
              r.userId,
              r.userName,
              r.userEmail,
              r.matchTitle,
              parseFloat(r.stake).toFixed(2),
              parseFloat(r.potentialWin).toFixed(2),
              parseFloat(r.totalOdds).toFixed(2),
              r.status,
              new Date(r.createdAt).toISOString(),
            ]),
          );
        }
      } else if (type === "deposits") {
        const conditions = [];
        if (fromDate) conditions.push(gte(paymentsTable.createdAt, fromDate));
        if (toDate) conditions.push(lte(paymentsTable.createdAt, toDate));

        const rows = await db
          .select({
            id: paymentsTable.id,
            orderId: paymentsTable.orderId,
            userId: paymentsTable.userId,
            userName: usersTable.name,
            userEmail: usersTable.email,
            amount: paymentsTable.amount,
            method: paymentsTable.method,
            status: paymentsTable.status,
            entity: paymentsTable.entity,
            reference: paymentsTable.reference,
            createdAt: paymentsTable.createdAt,
          })
          .from(paymentsTable)
          .leftJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(paymentsTable.createdAt));

        csvLines.push(
          buildCsvRow([
            "ID",
            "Order ID",
            "ID Utilizador",
            "Nome",
            "Email",
            "Valor (€)",
            "Método",
            "Status",
            "Entidade",
            "Referência",
            "Data",
          ]),
        );
        for (const r of rows) {
          csvLines.push(
            buildCsvRow([
              r.id,
              r.orderId,
              r.userId,
              r.userName,
              r.userEmail,
              parseFloat(r.amount).toFixed(2),
              r.method,
              r.status,
              r.entity,
              r.reference,
              new Date(r.createdAt).toISOString(),
            ]),
          );
        }
      } else if (type === "withdrawals") {
        const conditions = [];
        if (fromDate)
          conditions.push(gte(withdrawalsTable.createdAt, fromDate));
        if (toDate) conditions.push(lte(withdrawalsTable.createdAt, toDate));

        const rows = await db
          .select({
            id: withdrawalsTable.id,
            userId: withdrawalsTable.userId,
            userName: usersTable.name,
            userEmail: usersTable.email,
            amount: withdrawalsTable.amount,
            iban: withdrawalsTable.iban,
            holderName: withdrawalsTable.holderName,
            nif: withdrawalsTable.nif,
            status: withdrawalsTable.status,
            notes: withdrawalsTable.notes,
            createdAt: withdrawalsTable.createdAt,
          })
          .from(withdrawalsTable)
          .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(withdrawalsTable.createdAt));

        csvLines.push(
          buildCsvRow([
            "ID",
            "ID Utilizador",
            "Nome",
            "Email",
            "Valor (€)",
            "IBAN",
            "Titular",
            "NIF",
            "Status",
            "Notas",
            "Data",
          ]),
        );
        for (const r of rows) {
          csvLines.push(
            buildCsvRow([
              r.id,
              r.userId,
              r.userName,
              r.userEmail,
              parseFloat(r.amount).toFixed(2),
              r.iban,
              r.holderName,
              r.nif,
              r.status,
              r.notes,
              new Date(r.createdAt).toISOString(),
            ]),
          );
        }
      }

      const csv = csvLines.join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send("\uFEFF" + csv);
    } catch (err) {
      logger.error({ err }, "Admin export error");
      res.status(500).json({ error: "Erro ao gerar relatório" });
    }
  },
);

// GET /api/admin/settlement-logs — last 200 settlement events
router.get(
  "/settlement-logs",
  adminMiddleware,
  async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const logs = await db
        .select({
          id: settlementLogsTable.id,
          betId: settlementLogsTable.betId,
          userId: settlementLogsTable.userId,
          oldStatus: settlementLogsTable.oldStatus,
          newStatus: settlementLogsTable.newStatus,
          payout: settlementLogsTable.payout,
          message: settlementLogsTable.message,
          createdAt: settlementLogsTable.createdAt,
          userName: usersTable.name,
          userEmail: usersTable.email,
        })
        .from(settlementLogsTable)
        .leftJoin(usersTable, eq(settlementLogsTable.userId, usersTable.id))
        .orderBy(desc(settlementLogsTable.createdAt))
        .limit(200);
      res.json(logs);
    } catch (err) {
      logger.error({ err }, "Admin settlement-logs error");
      res.status(500).json({ error: "Erro ao carregar logs" });
    }
  },
);

router.get(
  "/settlement-metrics",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const from = String((req as unknown as Request).query["from"] ?? "");
      const to = String((req as unknown as Request).query["to"] ?? "");
      const sport = String((req as unknown as Request).query["sport"] ?? "");
      const status = String((req as unknown as Request).query["status"] ?? "");

      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;

      const fromCond =
        fromDate && !Number.isNaN(fromDate.getTime())
          ? sql`AND fs.settled_at >= ${fromDate}`
          : sql``;
      const toCond =
        toDate && !Number.isNaN(toDate.getTime())
          ? sql`AND fs.settled_at <= ${toDate}`
          : sql``;
      const sportCond = sport ? sql`AND mr.sport = ${sport}` : sql``;
      const statusCond = status ? sql`AND fs.new_status = ${status}` : sql``;

      const [overall] = (
        await db.execute(sql`
      WITH first_settlement AS (
        SELECT DISTINCT ON (sl.bet_id)
          sl.bet_id,
          sl.new_status,
          sl.created_at AS settled_at
        FROM settlement_logs sl
        WHERE sl.old_status = 'pending'
        ORDER BY sl.bet_id, sl.created_at ASC
      )
      SELECT
        COUNT(*)::int AS count,
        AVG(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS avg_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p50_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p95_seconds,
        MIN(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS min_seconds,
        MAX(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS max_seconds
      FROM first_settlement fs
      JOIN bets b ON b.id = fs.bet_id
      LEFT JOIN match_results mr ON mr.match_id = b.match_id
      WHERE 1=1
      ${fromCond}
      ${toCond}
      ${sportCond}
      ${statusCond}
    `)
      ).rows as Array<Record<string, unknown>>;

      const bySport = (
        await db.execute(sql`
      WITH first_settlement AS (
        SELECT DISTINCT ON (sl.bet_id)
          sl.bet_id,
          sl.new_status,
          sl.created_at AS settled_at
        FROM settlement_logs sl
        WHERE sl.old_status = 'pending'
        ORDER BY sl.bet_id, sl.created_at ASC
      )
      SELECT
        COALESCE(mr.sport, 'unknown') AS sport,
        COUNT(*)::int AS count,
        AVG(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS avg_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p50_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p95_seconds
      FROM first_settlement fs
      JOIN bets b ON b.id = fs.bet_id
      LEFT JOIN match_results mr ON mr.match_id = b.match_id
      WHERE 1=1
      ${fromCond}
      ${toCond}
      ${sportCond}
      ${statusCond}
      GROUP BY sport
      ORDER BY count DESC
    `)
      ).rows as Array<Record<string, unknown>>;

      const byStatus = (
        await db.execute(sql`
      WITH first_settlement AS (
        SELECT DISTINCT ON (sl.bet_id)
          sl.bet_id,
          sl.new_status,
          sl.created_at AS settled_at
        FROM settlement_logs sl
        WHERE sl.old_status = 'pending'
        ORDER BY sl.bet_id, sl.created_at ASC
      )
      SELECT
        fs.new_status AS status,
        COUNT(*)::int AS count,
        AVG(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS avg_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p50_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p95_seconds
      FROM first_settlement fs
      JOIN bets b ON b.id = fs.bet_id
      LEFT JOIN match_results mr ON mr.match_id = b.match_id
      WHERE 1=1
      ${fromCond}
      ${toCond}
      ${sportCond}
      ${statusCond}
      GROUP BY fs.new_status
      ORDER BY count DESC
    `)
      ).rows as Array<Record<string, unknown>>;

      res.json({ overall: overall ?? null, bySport, byStatus });
    } catch (err) {
      logger.error({ err }, "Admin settlement-metrics error");
      res
        .status(500)
        .json({ error: "Erro ao carregar métricas de liquidação" });
    }
  },
);

router.get(
  "/settlement-pending-reasons",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const limitParam = Number(
        (req as unknown as Request).query["limit"] ?? 20,
      );
      const sampleLimit = Number(
        (req as unknown as Request).query["samples"] ?? 3,
      );
      const topLimit =
        Number.isFinite(limitParam) && limitParam > 0
          ? Math.min(limitParam, 100)
          : 20;
      const samplesPerReason =
        Number.isFinite(sampleLimit) && sampleLimit > 0
          ? Math.min(sampleLimit, 10)
          : 3;

      const pendingBets = await db
        .select({
          id: betsTable.id,
          userId: betsTable.userId,
          matchId: betsTable.matchId,
          status: betsTable.status,
          createdAt: betsTable.createdAt,
          selections: betsTable.selections,
        })
        .from(betsTable)
        .where(eq(betsTable.status, "pending"))
        .orderBy(desc(betsTable.createdAt))
        .limit(2000);

      type PendingSelection = {
        selection?: string;
        market?: string;
        label?: string;
        matchId?: string;
        outcome?: string | null;
        pendingReason?: string;
      };

      const buckets = new Map<
        string,
        {
          reason: string;
          count: number;
          samples: Array<Record<string, unknown>>;
        }
      >();

      let unresolvedSelections = 0;

      for (const bet of pendingBets) {
        const selections = Array.isArray(bet.selections)
          ? (bet.selections as PendingSelection[])
          : [];
        for (const sel of selections) {
          const outcome = typeof sel?.outcome === "string" ? sel.outcome : null;
          if (outcome && outcome !== "pending") continue;

          unresolvedSelections++;
          const reason =
            String(sel?.pendingReason ?? "missing_pending_reason").trim() ||
            "missing_pending_reason";
          const bucket = buckets.get(reason) ?? {
            reason,
            count: 0,
            samples: [],
          };
          bucket.count++;
          if (bucket.samples.length < samplesPerReason) {
            bucket.samples.push({
              betId: bet.id,
              userId: bet.userId,
              matchId: sel?.matchId ?? bet.matchId,
              selection: sel?.selection ?? null,
              market: sel?.market ?? null,
              label: sel?.label ?? null,
              outcome,
              createdAt: bet.createdAt,
            });
          }
          buckets.set(reason, bucket);
        }
      }

      const reasons = Array.from(buckets.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, topLimit);

      res.json({
        pendingBetCount: pendingBets.length,
        unresolvedSelectionCount: unresolvedSelections,
        distinctReasons: buckets.size,
        reasons,
      });
    } catch (err) {
      logger.error({ err }, "Admin settlement-pending-reasons error");
      res
        .status(500)
        .json({ error: "Erro ao carregar pending reasons do settlement" });
    }
  },
);

router.get(
  "/settlement/pending-reasons",
  adminMiddleware,
  async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const pendingBets = await db
        .select({
          selections: betsTable.selections,
        })
        .from(betsTable)
        .where(eq(betsTable.status, "pending"))
        .limit(5000);

      type PendingSelection = {
        outcome?: string | null;
        pendingReason?: string | null;
      };

      const counts: Record<string, number> = {};

      for (const bet of pendingBets) {
        const selections = Array.isArray(bet.selections)
          ? (bet.selections as PendingSelection[])
          : [];
        for (const sel of selections) {
          const outcome = typeof sel?.outcome === "string" ? sel.outcome : null;
          if (outcome && outcome !== "pending") continue;

          const reason =
            String(sel?.pendingReason ?? "missing_pending_reason").trim() ||
            "missing_pending_reason";
          counts[reason] = (counts[reason] ?? 0) + 1;
        }
      }

      res.json(counts);
    } catch (err) {
      logger.error({ err }, "Admin settlement/pending-reasons error");
      res
        .status(500)
        .json({ error: "Erro ao carregar resumo de pendencias do settlement" });
    }
  },
);

router.get(
  "/settlement/fallback-metrics",
  adminMiddleware,
  async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      res.json(getSettlementFallbackMetrics());
    } catch (err) {
      logger.error({ err }, "Admin settlement/fallback-metrics error");
      res
        .status(500)
        .json({ error: "Erro ao carregar metricas de fallback do settlement" });
    }
  },
);

router.get(
  "/settlement/late-pending",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const hoursParam = Number(
        (req as unknown as Request).query["hours"] ??
          LATE_PENDING_DEFAULT_HOURS,
      );
      const limitParam = Number(
        (req as unknown as Request).query["limit"] ?? 100,
      );
      const graceHours =
        Number.isFinite(hoursParam) && hoursParam > 0
          ? Math.min(hoursParam, 168)
          : LATE_PENDING_DEFAULT_HOURS;
      const limit =
        Number.isFinite(limitParam) && limitParam > 0
          ? Math.min(limitParam, 500)
          : 100;

      const pendingBets = await db
        .select({
          id: betsTable.id,
          userId: betsTable.userId,
          matchId: betsTable.matchId,
          matchTitle: betsTable.matchTitle,
          stake: betsTable.stake,
          potentialWin: betsTable.potentialWin,
          totalOdds: betsTable.totalOdds,
          status: betsTable.status,
          createdAt: betsTable.createdAt,
          kickoffTime: betsTable.kickoffTime,
          selections: betsTable.selections,
          userName: usersTable.name,
          userEmail: usersTable.email,
        })
        .from(betsTable)
        .leftJoin(usersTable, eq(betsTable.userId, usersTable.id))
        .where(eq(betsTable.status, "pending"))
        .orderBy(desc(betsTable.createdAt))
        .limit(5000);

      res.json(buildLatePendingSummary(pendingBets, graceHours, limit));
    } catch (err) {
      logger.error({ err }, "Admin settlement/late-pending error");
      res
        .status(500)
        .json({ error: "Erro ao carregar pendencias tardias do settlement" });
    }
  },
);

router.get(
  "/settlement/overview",
  adminMiddleware,
  async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const pendingBets = await db
        .select({
          id: betsTable.id,
          userId: betsTable.userId,
          matchId: betsTable.matchId,
          matchTitle: betsTable.matchTitle,
          stake: betsTable.stake,
          potentialWin: betsTable.potentialWin,
          totalOdds: betsTable.totalOdds,
          status: betsTable.status,
          createdAt: betsTable.createdAt,
          kickoffTime: betsTable.kickoffTime,
          selections: betsTable.selections,
        })
        .from(betsTable)
        .where(eq(betsTable.status, "pending"))
        .limit(5000);

      type PendingSelection = {
        outcome?: string | null;
        pendingReason?: string | null;
      };

      const pendingReasons: Record<string, number> = {};
      for (const bet of pendingBets) {
        const selections = Array.isArray(bet.selections)
          ? (bet.selections as PendingSelection[])
          : [];
        for (const sel of selections) {
          const outcome = typeof sel?.outcome === "string" ? sel.outcome : null;
          if (outcome && outcome !== "pending") continue;
          const reason =
            String(sel?.pendingReason ?? "missing_pending_reason").trim() ||
            "missing_pending_reason";
          pendingReasons[reason] = (pendingReasons[reason] ?? 0) + 1;
        }
      }
      const latePending = buildLatePendingSummary(
        pendingBets,
        LATE_PENDING_DEFAULT_HOURS,
        20,
      );

      const [overall] = (
        await db.execute(sql`
      WITH first_settlement AS (
        SELECT DISTINCT ON (sl.bet_id)
          sl.bet_id,
          sl.new_status,
          sl.created_at AS settled_at
        FROM settlement_logs sl
        WHERE sl.old_status = 'pending'
        ORDER BY sl.bet_id, sl.created_at ASC
      )
      SELECT
        COUNT(*)::int AS count,
        AVG(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS avg_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p50_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p95_seconds,
        MIN(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS min_seconds,
        MAX(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS max_seconds
      FROM first_settlement fs
      JOIN bets b ON b.id = fs.bet_id
      LEFT JOIN match_results mr ON mr.match_id = b.match_id
    `)
      ).rows as Array<Record<string, unknown>>;

      const bySport = (
        await db.execute(sql`
      WITH first_settlement AS (
        SELECT DISTINCT ON (sl.bet_id)
          sl.bet_id,
          sl.new_status,
          sl.created_at AS settled_at
        FROM settlement_logs sl
        WHERE sl.old_status = 'pending'
        ORDER BY sl.bet_id, sl.created_at ASC
      )
      SELECT
        COALESCE(mr.sport, 'unknown') AS sport,
        COUNT(*)::int AS count,
        AVG(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS avg_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p50_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p95_seconds
      FROM first_settlement fs
      JOIN bets b ON b.id = fs.bet_id
      LEFT JOIN match_results mr ON mr.match_id = b.match_id
      GROUP BY sport
      ORDER BY count DESC
    `)
      ).rows as Array<Record<string, unknown>>;

      const byStatus = (
        await db.execute(sql`
      WITH first_settlement AS (
        SELECT DISTINCT ON (sl.bet_id)
          sl.bet_id,
          sl.new_status,
          sl.created_at AS settled_at
        FROM settlement_logs sl
        WHERE sl.old_status = 'pending'
        ORDER BY sl.bet_id, sl.created_at ASC
      )
      SELECT
        fs.new_status AS status,
        COUNT(*)::int AS count,
        AVG(EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS avg_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p50_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.settled_at - b.created_at))) AS p95_seconds
      FROM first_settlement fs
      JOIN bets b ON b.id = fs.bet_id
      LEFT JOIN match_results mr ON mr.match_id = b.match_id
      GROUP BY fs.new_status
      ORDER BY count DESC
    `)
      ).rows as Array<Record<string, unknown>>;

      res.json({
        fallbackMetrics: getSettlementFallbackMetrics(),
        pendingReasons,
        latePending,
        metrics: {
          overall: overall ?? null,
          bySport,
          byStatus,
        },
      });
    } catch (err) {
      logger.error({ err }, "Admin settlement/overview error");
      res
        .status(500)
        .json({ error: "Erro ao carregar overview do settlement" });
    }
  },
);

router.get(
  "/settlement-pending-selections",
  adminMiddleware,
  async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const reasonFilter = String(
        (req as unknown as Request).query["reason"] ?? "",
      ).trim();
      const limitParam = Number(
        (req as unknown as Request).query["limit"] ?? 100,
      );
      const limit =
        Number.isFinite(limitParam) && limitParam > 0
          ? Math.min(limitParam, 500)
          : 100;

      const pendingBets = await db
        .select({
          id: betsTable.id,
          userId: betsTable.userId,
          matchId: betsTable.matchId,
          matchTitle: betsTable.matchTitle,
          stake: betsTable.stake,
          potentialWin: betsTable.potentialWin,
          totalOdds: betsTable.totalOdds,
          status: betsTable.status,
          createdAt: betsTable.createdAt,
          selections: betsTable.selections,
          userName: usersTable.name,
          userEmail: usersTable.email,
        })
        .from(betsTable)
        .leftJoin(usersTable, eq(betsTable.userId, usersTable.id))
        .where(eq(betsTable.status, "pending"))
        .orderBy(desc(betsTable.createdAt))
        .limit(2000);

      type PendingSelection = {
        selection?: string;
        market?: string;
        label?: string;
        matchId?: string;
        matchTitle?: string;
        outcome?: string | null;
        pendingReason?: string;
        finalScore?: { home: number; away: number };
        htScore?: { htHome: number; htAway: number };
      };

      const rows: Array<Record<string, unknown>> = [];

      for (const bet of pendingBets) {
        const selections = Array.isArray(bet.selections)
          ? (bet.selections as PendingSelection[])
          : [];
        for (let index = 0; index < selections.length; index++) {
          const sel = selections[index]!;
          const outcome = typeof sel?.outcome === "string" ? sel.outcome : null;
          if (outcome && outcome !== "pending") continue;

          const reason =
            String(sel?.pendingReason ?? "missing_pending_reason").trim() ||
            "missing_pending_reason";
          if (reasonFilter && reason !== reasonFilter) continue;

          rows.push({
            reason,
            betId: bet.id,
            userId: bet.userId,
            userName: bet.userName,
            userEmail: bet.userEmail,
            matchId: sel?.matchId ?? bet.matchId,
            matchTitle: sel?.matchTitle ?? bet.matchTitle,
            selectionIndex: index,
            selection: sel?.selection ?? null,
            market: sel?.market ?? null,
            label: sel?.label ?? null,
            outcome,
            pendingReason: reason,
            finalScore: sel?.finalScore ?? null,
            htScore: sel?.htScore ?? null,
            stake: bet.stake,
            totalOdds: bet.totalOdds,
            potentialWin: bet.potentialWin,
            createdAt: bet.createdAt,
            selections,
          });

          if (rows.length >= limit) break;
        }
        if (rows.length >= limit) break;
      }

      res.json({
        reasonFilter: reasonFilter || null,
        count: rows.length,
        rows,
      });
    } catch (err) {
      logger.error({ err }, "Admin settlement-pending-selections error");
      res
        .status(500)
        .json({ error: "Erro ao carregar seleções pendentes do settlement" });
    }
  },
);

// Mount manual review sub-router
router.use("/review", manualReviewRouter);

// POST /api/admin/replay/:matchId — trigger a settlement replay for a match
router.post(
  "/replay/:matchId",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    try {
      const { matchId } = req.params;
      if (!matchId) {
        res.status(400).json({ error: "matchId é obrigatório" });
        return;
      }

      const reason: string = req.body?.reason ?? "Manual admin replay";
      const triggeredBy = req.admin!.username;

      const result = await replayEngine.replayMatch(matchId, triggeredBy, reason);

      logger.info(
        { matchId, triggeredBy, ...result },
        "Admin triggered settlement replay",
      );

      res.json({
        success: true,
        matchId,
        ...result,
      });
    } catch (err) {
      logger.error({ err }, "POST /api/admin/replay/:matchId error");
      res.status(500).json({ error: "Erro ao executar replay do settlement" });
    }
  },
);

// GET /api/admin/replay/:matchId/history — get replay history for a match
router.get(
  "/replay/:matchId/history",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    try {
      const { matchId } = req.params;
      if (!matchId) {
        res.status(400).json({ error: "matchId é obrigatório" });
        return;
      }

      const history = await replayEngine.getReplayHistory(matchId);

      res.json({ matchId, history });
    } catch (err) {
      logger.error({ err }, "GET /api/admin/replay/:matchId/history error");
      res.status(500).json({ error: "Erro ao carregar histórico de replays" });
    }
  },
);

// Read-only diagnostic for the PulseScore integration (real bookmaker odds).
// Each sport's live odds are built directly from this same feed by its own
// buildXLiveFromPulseScore function in matches.ts (buildFootballLive.../
// buildTennisLive.../buildBasketballLive.../buildHockeyLive.../
// buildBaseballLive.../buildVolleyballLive...) — there is no separate
// "overlay" step. All six come from a fresh REST fetch each tick. Bookmaker
// pin per sport (confirmed against real samples, not a fixed convention —
// verify against the actual *.ts extraction file before relying on this):
// tennis=bet365, football/basketball/hockey=bwin, volleyball=unibetau.
// Hockey and baseball currently have no LIVE builder wired into the public
// feed (prematch/upcoming only) — this debug route still fetches their raw
// live data for diagnostic purposes.
router.get("/pulsescore-debug", adminMiddleware, async (_req: AdminRequest, res) => {
  if (!CONFIG.PULSESCORE_API_KEY) {
    res.status(503).json({ error: "PULSESCORE_API_KEY não configurada" });
    return;
  }
  try {
    const [football, tennis, basketball, hockey, baseball, volleyball] =
      await Promise.all([
        getPulseScoreFootballLive(),
        getPulseScoreTennisLive(),
        pulseScoreBasketball.getLive(),
        pulseScoreHockey.getLive(),
        pulseScoreBaseball.getLive(),
        pulseScoreVolleyball.getLive(),
      ]);
    res.json({
      football: { count: football.length, events: football },
      tennis: { count: tennis.length, events: tennis },
      basketball: { count: basketball.length, events: basketball },
      hockey: { count: hockey.length, events: hockey },
      baseball: { count: baseball.length, events: baseball },
      volleyball: { count: volleyball.length, events: volleyball },
    });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/pulsescore-debug error");
    res.status(500).json({
      error: "Erro ao consultar PulseScore",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// PulseScore usage — same "Utilização" card the admin dashboard shows for
// other providers, but PulseScore has no /user-request-count equivalent
// to query from their side, so this reports what WE'VE counted ourselves
// (see the requestsToday/framesToday counters in the pulsescore services).
router.get("/pulsescore-usage", adminMiddleware, async (_req: AdminRequest, res) => {
  if (!CONFIG.PULSESCORE_API_KEY) {
    res.status(503).json({ error: "PULSESCORE_API_KEY não configurada" });
    return;
  }
  res.json({
    football: { ...getPulseScoreFootballUsage(), ws: pulseScoreFootballWsStatus() },
    tennis: getPulseScoreTennisUsage(),
    basketball: pulseScoreBasketball.getUsage(),
    hockey: pulseScoreHockey.getUsage(),
    baseball: pulseScoreBaseball.getUsage(),
    volleyball: pulseScoreVolleyball.getUsage(),
  });
});

// Raw, uncached probe of PulseScore's /live-events endpoint — bypasses
// getPulseScoreFootballLive()'s cache-and-swallow-errors behavior (built so
// a transient failure never blows away the live board, but that same
// behavior hides a persistent failure behind stale data with no visible
// error anywhere in the UI). Confirmed in production (2026-08-08) via
// Railway's Deploy Logs: football's live poller was getting a persistent
// 401 while tennis's got a 429 (rate-limited, so its key IS accepted) in
// the same window — this endpoint exists so that comparison can be re-run
// from the admin panel instead of needing Railway shell/log access every
// time, since PULSESCORE_API_KEY is the same for both sports/paths.
router.get("/pulsescore-live-check", adminMiddleware, async (_req: AdminRequest, res) => {
  if (!CONFIG.PULSESCORE_API_KEY) {
    res.status(503).json({ error: "PULSESCORE_API_KEY não configurada" });
    return;
  }
  const probe = async (sport: string, bookmaker: string) => {
    const url = pulseScoreRestUrl(`/live-events?sport=${sport}&limit=5`, bookmaker);
    const startedAt = Date.now();
    try {
      const resp = await fetch(url, {
        headers: { "X-Secret": CONFIG.PULSESCORE_API_KEY },
        signal: AbortSignal.timeout(6000),
      });
      const bodyText = await resp.text();
      return {
        sport,
        status: resp.status,
        ok: resp.ok,
        tookMs: Date.now() - startedAt,
        bodyPreview: bodyText.slice(0, 500),
      };
    } catch (err) {
      return {
        sport,
        status: null,
        ok: false,
        tookMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
  // Explicit bookmaker per sport, matching each sport's real current live
  // pipeline (bwin for football since the 2026-08-08 switch, bet365 for
  // tennis — see football.ts/tennis.ts) — this used to omit the bookmaker
  // and silently fall back to CONFIG.PULSESCORE_BOOKMAKER's "bet365"
  // default for both probes, which meant football's diagnostic result no
  // longer reflected the bookmaker football actually runs on (audit
  // finding, 2026-08-10).
  const [football, tennis] = await Promise.all([
    probe("soccer", "bwin"),
    probe("tennis", "bet365"),
  ]);
  res.json({ football, tennis, checkedAt: new Date().toISOString() });
});

// Read-only diagnostic ahead of a possible PulseScore fixtures cutover:
// PulseScore's league listing has no country field (just a flat league
// name), while our whole catalog (blocking, priority, market tier) is keyed
// by "country: league". This reports what fraction of bet365's actual
// prematch football league list we can already resolve a country for via
// countryForLeagueName() (derived from DOMESTIC_PRIORITY) — the real
// coverage number needed to decide whether that migration is safe yet,
// instead of guessing from the league count alone.
router.get(
  "/pulsescore-league-coverage",
  adminMiddleware,
  async (_req: AdminRequest, res) => {
    if (!CONFIG.PULSESCORE_API_KEY) {
      res.status(503).json({ error: "PULSESCORE_API_KEY não configurada" });
      return;
    }
    try {
      const leagues = await pulseScoreFetchFootballLeagues();
      const resolved: Array<{ league: string; country: string; eventCount: number }> = [];
      const unresolved: Array<{ league: string; eventCount: number }> = [];
      for (const l of leagues) {
        const country = countryForLeagueName(l.league);
        if (country) resolved.push({ league: l.league, country, eventCount: l.eventCount });
        else unresolved.push({ league: l.league, eventCount: l.eventCount });
      }
      res.json({
        totalLeagues: leagues.length,
        resolvedCount: resolved.length,
        unresolvedCount: unresolved.length,
        coveragePct:
          leagues.length > 0
            ? Math.round((resolved.length / leagues.length) * 1000) / 10
            : 0,
        resolved,
        unresolved,
      });
    } catch (err) {
      logger.error({ err }, "GET /api/admin/pulsescore-league-coverage error");
      res.status(500).json({
        error: "Erro ao consultar ligas do PulseScore",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

// Read-only diagnostic for the Palace Casino integration. Includes
// agent/info specifically so the account's configured currency can be
// eyeballed before going live — it was found to be USD ("internal_usd",
// currency: 1) rather than the EUR our ledger assumes; the user asked
// Palace Casino to switch it to EUR, so this is how to confirm that
// actually landed (no documented currency-code table to check
// programmatically — see getPalaceCasinoAgentInfo's doc comment).
router.get(
  "/palace-casino-debug",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    // Booleans only, never the actual secret values — this is meant to be
    // eyeballed in a browser, unlike PALACE_CASINO_API_TOKEN/
    // PALACE_CASINO_CALLBACK_TOKEN themselves which stay Railway-env-only.
    const base = {
      apiTokenConfigured: !!CONFIG.PALACE_CASINO_API_TOKEN,
      callbackTokenConfigured: !!CONFIG.PALACE_CASINO_CALLBACK_TOKEN,
      // What must be pasted into Palace Casino's own callback-URL setting —
      // trusts the request's own host/protocol so this is always correct
      // for whichever environment (production vs. any preview deploy) it's
      // viewed from.
      expectedCallbackUrl: `${req.protocol}://${req.get("host")}/api/casino/palace/callback`,
    };
    if (!CONFIG.PALACE_CASINO_API_TOKEN) {
      res.status(503).json({ ...base, error: "PALACE_CASINO_API_TOKEN não configurada" });
      return;
    }
    try {
      const [agent, providers] = await Promise.all([
        getPalaceCasinoAgentInfo(),
        getPalaceCasinoProviders(),
      ]);
      res.json({ ...base, agent, count: providers.length, providers });
    } catch (err) {
      logger.error({ err }, "GET /api/admin/palace-casino-debug error");
      res.status(500).json({
        ...base,
        error: "Erro ao consultar Palace Casino",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

// Simulates a real Palace Casino wallet callback against our OWN server —
// exercises the exact same route/token-check/DB-lookup path a genuine
// Palace Casino "authenticate" call would, without needing Palace Casino to
// actually call us. Built specifically to diagnose "game shows CREDIT 0":
// if this returns the real balance, our callback implementation is proven
// correct and the problem is entirely on Palace Casino's side (callback URL
// not configured, or the agent account not yet funded/limited correctly);
// if this itself fails, the error here is the real bug to fix.
router.post(
  "/palace-casino-debug/self-test",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    const userId = Number((req.body as { userId?: unknown })?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "userId inválido" });
      return;
    }
    if (!CONFIG.PALACE_CASINO_CALLBACK_TOKEN) {
      res.status(503).json({ error: "PALACE_CASINO_CALLBACK_TOKEN não configurada" });
      return;
    }
    try {
      const port = process.env["API_PORT"] ?? process.env["PORT"] ?? "8080";
      const resp = await fetch(`http://127.0.0.1:${port}/api/casino/palace/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Callback-Token": CONFIG.PALACE_CASINO_CALLBACK_TOKEN,
        },
        body: JSON.stringify({
          command: "authenticate",
          data: { account: memberAccountForUser(userId) },
          timestamp: String(Math.floor(Date.now() / 1000)),
          check: "21",
        }),
        signal: AbortSignal.timeout(6000),
      });
      const data = await resp.json().catch(() => null);
      res.json({ httpStatus: resp.status, response: data });
    } catch (err) {
      logger.error({ err, userId }, "POST /api/admin/palace-casino-debug/self-test error");
      res.status(500).json({
        error: "Erro ao executar teste",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

// ── Casino admin: overview / catalog / transactions ─────────────────────────
// Kinds recorded by the Palace Casino wallet callback (routes/casino.ts) —
// bet/win amounts are already signed (bet negative, win positive), and a
// cancel row is the exact reversal of its original bet, so summing `amount`
// across all three for a period gives the net change to *players'* balances;
// GGR (house revenue) is the negative of that.
const CASINO_LEDGER_KINDS = [
  "casino_palace_bet",
  "casino_palace_win",
  "casino_palace_cancel",
  // SilentAPI settles bet+win as one net-delta callback per round (see
  // app.ts's /api/casino/callback), unlike Palace's three separate kinds —
  // included here too so "allTime" GGR still covers whichever aggregator
  // was active during any given period, not just the currently-active one.
  "casino_round_settlement",
] as const;

router.get("/casino/overview", adminMiddleware, async (_req: AdminRequest, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [[gameCounts], [providerCounts], [todayNet], [allTimeNet]] =
      await Promise.all([
        db
          .select({
            total: count(),
            active: sql<number>`count(*) filter (where ${casinoGamesTable.isActive})`,
          })
          .from(casinoGamesTable)
          .where(eq(casinoGamesTable.source, "palace")),
        db
          .select({ total: sql<number>`count(distinct ${casinoGamesTable.provider})` })
          .from(casinoGamesTable)
          .where(and(eq(casinoGamesTable.source, "palace"), eq(casinoGamesTable.isActive, true))),
        db
          .select({ net: sum(ledgerEntriesTable.amount) })
          .from(ledgerEntriesTable)
          .where(
            and(
              inArray(ledgerEntriesTable.kind, CASINO_LEDGER_KINDS),
              gte(ledgerEntriesTable.createdAt, startOfToday),
            ),
          ),
        db
          .select({ net: sum(ledgerEntriesTable.amount) })
          .from(ledgerEntriesTable)
          .where(inArray(ledgerEntriesTable.kind, CASINO_LEDGER_KINDS)),
      ]);

    res.json({
      games: { total: Number(gameCounts?.total ?? 0), active: Number(gameCounts?.active ?? 0) },
      providers: Number(providerCounts?.total ?? 0),
      ggr: {
        today: -(Number(todayNet?.net ?? 0)),
        allTime: -(Number(allTimeNet?.net ?? 0)),
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/casino/overview error");
    res.status(500).json({ error: "Erro ao consultar estatísticas do cassino" });
  }
});

router.get("/casino/games", adminMiddleware, async (req: AdminRequest, res) => {
  try {
    const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
    const provider = typeof req.query["provider"] === "string" ? req.query["provider"].trim() : "";
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 30));

    const conditions = [eq(casinoGamesTable.source, "palace")];
    if (provider && provider !== "Todos") conditions.push(eq(casinoGamesTable.provider, provider));
    if (search) conditions.push(ilike(casinoGamesTable.name, `%${search}%`));
    const where = and(...conditions);

    const [games, [{ total }]] = await Promise.all([
      db
        .select()
        .from(casinoGamesTable)
        .where(where)
        .orderBy(asc(casinoGamesTable.provider), asc(casinoGamesTable.name))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(casinoGamesTable).where(where),
    ]);

    res.json({ page, limit, total: Number(total), games });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/casino/games error");
    res.status(500).json({ error: "Erro ao listar jogos" });
  }
});

router.patch(
  "/casino/games/:id/active",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    const id = Number(req.params["id"]);
    const isActive = Boolean((req.body as { isActive?: unknown })?.isActive);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Id inválido" });
      return;
    }
    try {
      const [updated] = await db
        .update(casinoGamesTable)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(casinoGamesTable.id, id))
        .returning({ id: casinoGamesTable.id, isActive: casinoGamesTable.isActive });
      if (!updated) {
        res.status(404).json({ error: "Jogo não encontrado" });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err, id }, "PATCH /api/admin/casino/games/:id/active error");
      res.status(500).json({ error: "Erro ao atualizar jogo" });
    }
  },
);

router.get("/casino/transactions", adminMiddleware, async (req: AdminRequest, res) => {
  try {
    const userId = Number(req.query["userId"]) || null;
    const kind = typeof req.query["kind"] === "string" ? req.query["kind"].trim() : "";
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 30));

    const conditions = [like(ledgerEntriesTable.kind, "casino_%")];
    if (userId) conditions.push(eq(ledgerEntriesTable.userId, userId));
    if (kind) conditions.push(eq(ledgerEntriesTable.kind, kind));
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: ledgerEntriesTable.id,
          userId: ledgerEntriesTable.userId,
          userEmail: usersTable.email,
          amount: ledgerEntriesTable.amount,
          currency: ledgerEntriesTable.currency,
          kind: ledgerEntriesTable.kind,
          refType: ledgerEntriesTable.refType,
          refId: ledgerEntriesTable.refId,
          metadata: ledgerEntriesTable.metadata,
          createdAt: ledgerEntriesTable.createdAt,
        })
        .from(ledgerEntriesTable)
        .leftJoin(usersTable, eq(usersTable.id, ledgerEntriesTable.userId))
        .where(where)
        .orderBy(desc(ledgerEntriesTable.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(ledgerEntriesTable).where(where),
    ]);

    res.json({ page, limit, total: Number(total), transactions: rows });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/casino/transactions error");
    res.status(500).json({ error: "Erro ao listar transações" });
  }
});

// ── Casino promo banners ─────────────────────────────────────────────────────
// Admin CRUD for the casino page's top/middle banner slots (routes/casino.ts
// GET /banners serves the public read side). Multiple banners can share a
// position — sortOrder controls display order — each independently promoting
// its own set of games via gameIds.
function normalizeBannerGameIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
}

router.get("/casino/banners", adminMiddleware, async (_req: AdminRequest, res) => {
  try {
    const banners = await db
      .select()
      .from(casinoBannersTable)
      .orderBy(asc(casinoBannersTable.position), asc(casinoBannersTable.sortOrder), desc(casinoBannersTable.id));

    const allGameIds = [
      ...new Set(banners.flatMap((b) => normalizeBannerGameIds(b.gameIds))),
    ];
    const games = allGameIds.length
      ? await db
          .select({
            id: casinoGamesTable.id,
            name: casinoGamesTable.name,
            provider: casinoGamesTable.provider,
            img: casinoGamesTable.img,
          })
          .from(casinoGamesTable)
          .where(inArray(casinoGamesTable.id, allGameIds))
      : [];
    const gamesById = new Map(games.map((g) => [g.id, g]));

    res.json({
      banners: banners.map((b) => ({
        ...b,
        games: normalizeBannerGameIds(b.gameIds)
          .map((id) => gamesById.get(id))
          .filter((g): g is NonNullable<typeof g> => !!g),
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/casino/banners error");
    res.status(500).json({ error: "Erro ao listar banners" });
  }
});

router.post("/casino/banners", adminMiddleware, async (req: AdminRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const title = String(body["title"] ?? "").trim();
    const imageUrl = String(body["imageUrl"] ?? "").trim();
    const position = String(body["position"] ?? "").trim();
    if (!title || !imageUrl || (position !== "top" && position !== "middle")) {
      res.status(400).json({ error: "title, imageUrl e position ('top'|'middle') são obrigatórios." });
      return;
    }
    const [created] = await db
      .insert(casinoBannersTable)
      .values({
        title,
        subtitle: body["subtitle"] ? String(body["subtitle"]) : null,
        ctaText: body["ctaText"] ? String(body["ctaText"]) : null,
        imageUrl,
        linkUrl: body["linkUrl"] ? String(body["linkUrl"]) : null,
        position,
        gameIds: normalizeBannerGameIds(body["gameIds"]),
        isActive: body["isActive"] === undefined ? true : Boolean(body["isActive"]),
        sortOrder: Number.isFinite(Number(body["sortOrder"])) ? Number(body["sortOrder"]) : 0,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "POST /api/admin/casino/banners error");
    res.status(500).json({ error: "Erro ao criar banner" });
  }
});

router.patch("/casino/banners/:id", adminMiddleware, async (req: AdminRequest, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  try {
    const body = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body["title"] !== undefined) update["title"] = String(body["title"]).trim();
    if (body["subtitle"] !== undefined) update["subtitle"] = body["subtitle"] ? String(body["subtitle"]) : null;
    if (body["ctaText"] !== undefined) update["ctaText"] = body["ctaText"] ? String(body["ctaText"]) : null;
    if (body["imageUrl"] !== undefined) update["imageUrl"] = String(body["imageUrl"]).trim();
    if (body["linkUrl"] !== undefined) update["linkUrl"] = body["linkUrl"] ? String(body["linkUrl"]) : null;
    if (body["position"] !== undefined) {
      const position = String(body["position"]);
      if (position !== "top" && position !== "middle") {
        res.status(400).json({ error: "position deve ser 'top' ou 'middle'." });
        return;
      }
      update["position"] = position;
    }
    if (body["gameIds"] !== undefined) update["gameIds"] = normalizeBannerGameIds(body["gameIds"]);
    if (body["isActive"] !== undefined) update["isActive"] = Boolean(body["isActive"]);
    if (body["sortOrder"] !== undefined) update["sortOrder"] = Number(body["sortOrder"]) || 0;

    const [updated] = await db
      .update(casinoBannersTable)
      .set(update)
      .where(eq(casinoBannersTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Banner não encontrado" });
      return;
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err, id }, "PATCH /api/admin/casino/banners/:id error");
    res.status(500).json({ error: "Erro ao atualizar banner" });
  }
});

router.delete("/casino/banners/:id", adminMiddleware, async (req: AdminRequest, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(casinoBannersTable)
      .where(eq(casinoBannersTable.id, id))
      .returning({ id: casinoBannersTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Banner não encontrado" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id }, "DELETE /api/admin/casino/banners/:id error");
    res.status(500).json({ error: "Erro ao apagar banner" });
  }
});

// AI-assisted banner copy: the admin describes the promotion in a prompt
// ("cria um banner de boas-vindas para o Gates of Olympus") plus which games
// it's for, and gets back a suggested title/subtitle/CTA (and an image
// pulled from one of the promoted games) to review and tweak before saving —
// there's no image-generation model wired up here, so the "image" side of
// this is a sensible default, not a generated asset. Falls back to a
// deterministic template when ANTHROPIC_API_KEY isn't configured, so the
// button always does something useful rather than erroring out.
router.post("/casino/banners/ai-generate", adminMiddleware, async (req: AdminRequest, res) => {
  try {
    const body = req.body as { prompt?: unknown; gameIds?: unknown };
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      res.status(400).json({ error: "prompt é obrigatório." });
      return;
    }
    const gameIds = normalizeBannerGameIds(body.gameIds);
    const games = gameIds.length
      ? await db
          .select({ id: casinoGamesTable.id, name: casinoGamesTable.name, img: casinoGamesTable.img })
          .from(casinoGamesTable)
          .where(inArray(casinoGamesTable.id, gameIds))
      : [];
    const gameNames = games.map((g) => g.name);
    const suggestedImage = games.find((g) => g.img)?.img ?? null;

    if (CONFIG.ANTHROPIC_API_KEY) {
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": CONFIG.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 300,
            system:
              "Escreves copy curta para banners promocionais de um casino online em português europeu. " +
              "Responde APENAS com JSON válido no formato " +
              '{"title": string (máx 40 caracteres), "subtitle": string (máx 80 caracteres), "ctaText": string (máx 20 caracteres, ex: \\"Jogar Agora\\")}. ' +
              "Sem markdown, sem texto extra.",
            messages: [
              {
                role: "user",
                content: `Pedido do admin: ${prompt}${gameNames.length ? `\nJogos a promover: ${gameNames.join(", ")}` : ""}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { content?: Array<{ text?: string }> };
          const text = data.content?.[0]?.text ?? "";
          const parsed = JSON.parse(text.trim()) as {
            title?: string;
            subtitle?: string;
            ctaText?: string;
          };
          if (parsed.title) {
            res.json({
              title: parsed.title,
              subtitle: parsed.subtitle ?? "",
              ctaText: parsed.ctaText || "Jogar Agora",
              imageUrl: suggestedImage,
              gameIds,
            });
            return;
          }
        }
        logger.warn({ status: resp.status }, "[casino-banner-ai] Anthropic call failed, using template fallback");
      } catch (err) {
        logger.warn({ err }, "[casino-banner-ai] Anthropic call errored, using template fallback");
      }
    }

    // Template fallback (also used when no API key is configured).
    const primaryGame = gameNames[0];
    res.json({
      title: primaryGame ? `Joga ${primaryGame}` : prompt.slice(0, 40),
      subtitle: gameNames.length > 1
        ? `Disponível agora: ${gameNames.join(", ")}`
        : prompt.slice(0, 80),
      ctaText: "Jogar Agora",
      imageUrl: suggestedImage,
      gameIds,
    });
  } catch (err) {
    logger.error({ err }, "POST /api/admin/casino/banners/ai-generate error");
    res.status(500).json({ error: "Erro ao gerar banner" });
  }
});

// ── BET62 Live Streaming — mapping admin ─────────────────────────────────────
// An admin fills in the SMYTDRYT video fields here to wire up the live
// stream for a match.
router.get("/live-stream/mappings", adminMiddleware, async (_req: AdminRequest, res) => {
  try {
    const mappings = await listMappings();
    res.json({ mappings });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/live-stream/mappings error");
    res.status(500).json({ error: "Erro ao listar mapeamentos" });
  }
});

// betbyEventId isn't a real BetBY id here — a stable placeholder is
// generated so the NOT NULL UNIQUE column is satisfied without pretending
// to know a real one.
router.post("/live-stream/mappings", adminMiddleware, async (req: AdminRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const home = String(body["home"] ?? "").trim();
    const away = String(body["away"] ?? "").trim();
    const league = typeof body["league"] === "string" && body["league"].trim() ? body["league"].trim() : null;
    if (!home || !away) {
      res.status(400).json({ error: "home e away são obrigatórios" });
      return;
    }
    const betbyEventId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const created = await createMapping({ betbyEventId, home, away, league });
    logger.info(
      { home, away, admin: req.admin!.username },
      "Admin created live-stream mapping",
    );
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "POST /api/admin/live-stream/mappings error");
    res.status(500).json({ error: "Erro ao criar mapeamento" });
  }
});

router.patch(
  "/live-stream/mappings/:betbyEventId",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    const betbyEventId = String(req.params["betbyEventId"]);
    const body = req.body as Record<string, unknown>;
    const toIntOrNull = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const toStrOrNull = (v: unknown): string | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      return String(v);
    };
    try {
      const updated = await setMapping(betbyEventId, {
        videoMatchId: toIntOrNull(body["videoMatchId"]),
        videoSportId: toIntOrNull(body["videoSportId"]),
        videoTournamentId: toIntOrNull(body["videoTournamentId"]),
        videoStatsHost: toStrOrNull(body["videoStatsHost"]),
        videoKey: toStrOrNull(body["videoKey"]),
        videoBasePath: toStrOrNull(body["videoBasePath"]),
        videoTimestamp: toIntOrNull(body["videoTimestamp"]),
      });
      if (!updated) {
        res.status(404).json({ error: "Mapeamento não encontrado" });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err, betbyEventId }, "PATCH /api/admin/live-stream/mappings/:betbyEventId error");
      res.status(500).json({ error: "Erro ao atualizar mapeamento" });
    }
  },
);

export default router;

