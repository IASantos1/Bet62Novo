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
} from "@workspace/db/schema";
import { eq, desc, count, sum, sql, gte, lte, and } from "drizzle-orm";
import {
  adminMiddleware,
  type AdminRequest,
} from "../middlewares/adminAuth.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { logger } from "../lib/logger.js";
import { applyBalanceDelta } from "../lib/ledger.js";
import { getSettlementFallbackMetrics } from "../lib/settlementHelpers.js";
import { timingSafeEqualString } from "../lib/security.js";
import fs from "fs";
import path from "path";
import manualReviewRouter from "./manualReview.js";
import { replayEngine } from "../lib/replayEngine.js";

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
      let changed = false;

      await db.transaction(async (tx) => {
        // Optimistic lock: only update if status actually changed
        const rows = await tx
          .update(betsTable)
          .set({ status })
          .where(
            and(eq(betsTable.id, betId), sql`${betsTable.status} != ${status}`),
          )
          .returning({ id: betsTable.id });

        if (rows.length === 0) return; // already at desired status — no-op
        changed = true;

        // Credit balance atomically when marking won (only from non-won state)
        if (status === "won" && oldStatus !== "won") {
          await applyBalanceDelta(tx, {
            userId: bet.userId,
            amount: bet.potentialWin,
            kind: "admin_bet_settlement_payout",
            idempotencyKey: `admin:bet:${betId}:status:won`,
            refType: "bet",
            refId: String(betId),
          });
        }

        // Refund stake when voiding (only from non-voided state)
        if (status === "voided" && oldStatus !== "voided") {
          await applyBalanceDelta(tx, {
            userId: bet.userId,
            amount: bet.stake,
            kind: "admin_bet_settlement_refund",
            idempotencyKey: `admin:bet:${betId}:status:voided`,
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
                  ? bet.potentialWin
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

// ── Statpal API usage ─────────────────────────────────────────────────────────
// Cached so the dashboard card can refresh every 60 s without hammering Statpal.
let statpalUsageCache: { data: Record<string, unknown>; at: number } | null = null;
const STATPAL_USAGE_TTL_MS = 60_000;

router.get("/statpal-usage", adminMiddleware, async (_req, res) => {
  try {
    const key = process.env.STATPAL_API_KEY;
    if (!key) {
      res.status(503).json({ error: "STATPAL_API_KEY não configurada" });
      return;
    }

    // Serve from cache if fresh
    if (statpalUsageCache && Date.now() - statpalUsageCache.at < STATPAL_USAGE_TTL_MS) {
      res.json(statpalUsageCache.data);
      return;
    }

    const url = new URL("https://statpal.io/api/user-request-count");
    url.searchParams.set("access_key", key);

    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      res.status(502).json({ error: `Statpal devolveu ${resp.status}` });
      return;
    }

    const raw = await resp.json() as Record<string, unknown>;

    // Normalize field names (Statpal uses Portuguese keys)
    const data = {
      accessKey: raw["access_key"] ?? raw["accessKey"] ?? null,
      date: raw["data_atual"] ?? raw["date"] ?? null,
      requestCount:
        raw["contagem_de_solicitações"] ??
        raw["request_count"] ??
        raw["requestCount"] ??
        null,
    };

    statpalUsageCache = { data, at: Date.now() };
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /api/admin/statpal-usage error");
    res.status(500).json({ error: "Erro ao consultar Statpal" });
  }
});

export default router;

