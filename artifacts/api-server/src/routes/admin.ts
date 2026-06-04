import { Router, type IRouter, type Response, type Request } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { kycDocumentsTable, usersTable, betsTable, paymentsTable, withdrawalsTable, settlementLogsTable } from "@workspace/db/schema";
import { eq, desc, count, sum, sql, gte, lte, and } from "drizzle-orm";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  let s = String(val);
  // Neutralize potential formula injection (=, +, -, @, tab, CR at start)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.startsWith("'")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsv).join(",");
}

const router: IRouter = Router();

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
  windowMs: 60_000,
  max: 5,
  message: "Muitas tentativas. Tente novamente em 1 minuto.",
});

// POST /api/admin/login
router.post("/login", adminLoginRateLimit, (req: Request, res: Response): void => {
  const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
  const loginId = username || email;

  if (!loginId || !password) {
    res.status(400).json({ error: "Utilizador/email e senha são obrigatórios" });
    return;
  }

  const usernameMatch = loginId === ADMIN_USERNAME;
  const emailMatch = loginId === ADMIN_EMAIL;

  if ((!usernameMatch && !emailMatch) || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const token = jwt.sign({ username: ADMIN_USERNAME, email: ADMIN_EMAIL, isAdmin: true }, SESSION_SECRET, { expiresIn: "8h" });
  res.json({ token, username: ADMIN_USERNAME, email: ADMIN_EMAIL });
});

// GET /api/admin/stats
router.get("/stats", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    const [userCount] = await db.select({ count: count() }).from(usersTable);
    const [betCount] = await db.select({ count: count() }).from(betsTable);
    const [pendingCount] = await db.select({ count: count() }).from(betsTable).where(eq(betsTable.status, "pending"));
    const [wonCount] = await db.select({ count: count() }).from(betsTable).where(eq(betsTable.status, "won"));
    const [lostCount] = await db.select({ count: count() }).from(betsTable).where(eq(betsTable.status, "lost"));
    const [cashoutCount] = await db.select({ count: count() }).from(betsTable).where(eq(betsTable.status, "cashed_out"));
    const [totalStaked] = await db.select({ total: sum(betsTable.stake) }).from(betsTable);
    const [totalPaidOut] = await db.select({ total: sum(betsTable.potentialWin) }).from(betsTable).where(eq(betsTable.status, "won"));
    const [totalBalance] = await db.select({ total: sum(usersTable.balance) }).from(usersTable);
    const [totalDeposited] = await db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(eq(paymentsTable.status, "completed"));
    const [pendingWithdrawals] = await db.select({ count: count(), total: sum(withdrawalsTable.amount) }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));

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
          ? (((parseFloat(totalStaked.total) - parseFloat(totalPaidOut.total || "0")) / parseFloat(totalStaked.total)) * 100).toFixed(1)
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
});

// GET /api/admin/users
router.get("/users", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      balance: usersTable.balance,
      freebetBalance: usersTable.freebetBalance,
      kycStatus: usersTable.kycStatus,
      selfExcludedUntil: usersTable.selfExcludedUntil,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt));

    const betCounts = await db.select({
      userId: betsTable.userId,
      count: count(),
      totalStaked: sum(betsTable.stake),
    }).from(betsTable).groupBy(betsTable.userId);

    const betMap = new Map(betCounts.map(b => [b.userId, b]));

    const result = users.map(u => ({
      ...u,
      betCount: Number(betMap.get(u.id)?.count || 0),
      totalStaked: parseFloat(betMap.get(u.id)?.totalStaked || "0"),
      banned: u.selfExcludedUntil ? new Date(u.selfExcludedUntil) > new Date() : false,
    }));

    res.json(result);
  } catch (err) {
    logger.error({ err }, "Admin users error");
    res.status(500).json({ error: "Erro ao carregar usuários" });
  }
});

// GET /api/admin/users/:id/detail
router.get("/users/:id/detail", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const userId = parseInt(String(req.params["id"]), 10);
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Utilizador não encontrado" }); return; }

    const bets = await db.select().from(betsTable).where(eq(betsTable.userId, userId)).orderBy(desc(betsTable.createdAt)).limit(50);
    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.userId, userId)).orderBy(desc(paymentsTable.createdAt)).limit(50);
    const withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, userId)).orderBy(desc(withdrawalsTable.createdAt)).limit(50);
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
});

// PUT /api/admin/users/:id/balance
router.put("/users/:id/balance", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const userId = parseInt(String(req.params["id"]), 10);
  const { balance, operation, amount } = req.body;

  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

    let newBalance: string;
    if (operation === "add") {
      newBalance = (parseFloat(user.balance) + parseFloat(amount)).toFixed(2);
    } else if (operation === "subtract") {
      newBalance = Math.max(0, parseFloat(user.balance) - parseFloat(amount)).toFixed(2);
    } else if (balance !== undefined) {
      newBalance = parseFloat(balance).toFixed(2);
    } else {
      res.status(400).json({ error: "Operação inválida" }); return;
    }

    const [updated] = await db.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.id, userId)).returning();
    res.json({ id: updated.id, balance: updated.balance });
  } catch (err) {
    logger.error({ err }, "Admin balance update error");
    res.status(500).json({ error: "Erro ao atualizar saldo" });
  }
});

// PUT /api/admin/users/:id/freebet
router.put("/users/:id/freebet", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const userId = parseInt(String(req.params["id"]), 10);
  const { amount } = req.body as { amount?: string };

  if (isNaN(userId) || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    res.status(400).json({ error: "Valor de freebet inválido" }); return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Utilizador não encontrado" }); return; }

    const newFreebet = (parseFloat(user.freebetBalance) + parseFloat(amount)).toFixed(2);
    const [updated] = await db.update(usersTable).set({ freebetBalance: newFreebet }).where(eq(usersTable.id, userId)).returning();
    res.json({ id: updated.id, freebetBalance: updated.freebetBalance });
  } catch (err) {
    logger.error({ err }, "Admin freebet error");
    res.status(500).json({ error: "Erro ao atribuir freebet" });
  }
});

// PUT /api/admin/users/:id/ban
router.put("/users/:id/ban", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const userId = parseInt(String(req.params["id"]), 10);
  const { banned } = req.body as { banned?: boolean };

  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Utilizador não encontrado" }); return; }

    const selfExcludedUntil = banned ? new Date("2099-12-31T23:59:59Z") : null;
    const [updated] = await db.update(usersTable).set({ selfExcludedUntil }).where(eq(usersTable.id, userId)).returning();
    res.json({ id: updated.id, banned: updated.selfExcludedUntil ? new Date(updated.selfExcludedUntil) > new Date() : false });
  } catch (err) {
    logger.error({ err }, "Admin ban error");
    res.status(500).json({ error: "Erro ao banir utilizador" });
  }
});

// PUT /api/admin/users/:id/kyc
router.put("/users/:id/kyc", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const userId = parseInt(String(req.params["id"]), 10);
  const { kycStatus } = req.body as { kycStatus?: string };
  const valid = ["not_submitted", "pending", "approved", "rejected"];
  if (isNaN(userId) || !kycStatus || !valid.includes(kycStatus)) {
    res.status(400).json({ error: "Status KYC inválido" }); return;
  }
  try {
    const [updated] = await db.update(usersTable).set({ kycStatus }).where(eq(usersTable.id, userId)).returning();
    res.json({ id: updated.id, kycStatus: updated.kycStatus });
  } catch (err) {
    logger.error({ err }, "Admin KYC error");
    res.status(500).json({ error: "Erro ao atualizar KYC" });
  }
});

function getKycUploadRoot(): string {
  return path.resolve((globalThis as Record<string, unknown>).__dirname as string ?? __dirname, "../uploads/kyc");
}

router.get("/kyc/documents", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
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
    if (userId !== null) conditions.push(eq(kycDocumentsTable.userId, userId));
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
});

router.get("/kyc/documents/:id/download", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const docId = parseInt(String(req.params["id"]), 10);
  if (isNaN(docId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const [doc] = await db
      .select({
        id: kycDocumentsTable.id,
        fileName: kycDocumentsTable.fileName,
        mimeType: kycDocumentsTable.mimeType,
        storagePath: kycDocumentsTable.storagePath,
      })
      .from(kycDocumentsTable)
      .where(eq(kycDocumentsTable.id, docId))
      .limit(1);

    if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

    const uploadRoot = getKycUploadRoot();
    const resolved = path.resolve(doc.storagePath);
    if (!resolved.startsWith(uploadRoot + path.sep)) {
      res.status(400).json({ error: "Caminho inválido" });
      return;
    }
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: "Ficheiro não encontrado" });
      return;
    }

    res.setHeader("Content-Type", doc.mimeType);
    res.download(resolved, doc.fileName);
  } catch (err) {
    logger.error({ err }, "Admin kyc download error");
    res.status(500).json({ error: "Erro ao descarregar documento" });
  }
});

router.put("/kyc/documents/:id/status", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
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
      .set({ status, reviewedAt: status === "approved" || status === "rejected" ? new Date() : null })
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

    const hasRejected = allDocs.some(d => d.status === "rejected");
    const allApproved = allDocs.length > 0 && allDocs.every(d => d.status === "approved");
    const nextUserStatus = hasRejected ? "rejected" : allApproved ? "approved" : "pending";

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
});

// GET /api/admin/bets
router.get("/bets", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
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
});

// PUT /api/admin/bets/:id/status
router.put("/bets/:id/status", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const betId = parseInt(String(req.params["id"]), 10);
  const { status } = req.body;

  const validStatuses = ["pending", "won", "lost", "cashed_out", "voided"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Status inválido" }); return;
  }

  try {
    const [bet] = await db.select().from(betsTable).where(eq(betsTable.id, betId)).limit(1);
    if (!bet) { res.status(404).json({ error: "Aposta não encontrada" }); return; }

    const oldStatus = bet.status;

    await db.transaction(async (tx) => {
      // Optimistic lock: only update if status actually changed
      const rows = await tx
        .update(betsTable)
        .set({ status })
        .where(and(eq(betsTable.id, betId), sql`${betsTable.status} != ${status}`))
        .returning({ id: betsTable.id });

      if (rows.length === 0) return; // already at desired status — no-op

      // Credit balance atomically when marking won (only from non-won state)
      if (status === "won" && oldStatus !== "won") {
        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${bet.potentialWin}::numeric` })
          .where(eq(usersTable.id, bet.userId));
      }

      // Refund stake when voiding (only from non-voided state)
      if (status === "voided" && oldStatus !== "voided") {
        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${bet.stake}::numeric` })
          .where(eq(usersTable.id, bet.userId));
      }

      // Audit log
      await tx.insert(settlementLogsTable).values({
        betId: bet.id,
        userId: bet.userId,
        oldStatus,
        newStatus: status,
        payout: status === "won" ? bet.potentialWin : status === "voided" ? bet.stake : "0.00",
        message: `Manual settlement by admin`,
      });
    });

    res.json({ id: betId, status });
  } catch (err) {
    logger.error({ err }, "Admin bet status update error");
    res.status(500).json({ error: "Erro ao atualizar status" });
  }
});

// GET /api/admin/payments
router.get("/payments", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
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
});

// POST /api/admin/payments/:id/credit  — manually credit a payment
router.post("/payments/:id/credit", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const paymentId = parseInt(String(req.params["id"]), 10);
  if (isNaN(paymentId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId)).limit(1);
    if (!payment) { res.status(404).json({ error: "Pagamento não encontrado" }); return; }
    if (payment.status === "completed") { res.status(400).json({ error: "Pagamento já foi creditado" }); return; }

    await db.transaction(async (tx) => {
      await tx.update(paymentsTable).set({ status: "completed" }).where(eq(paymentsTable.id, paymentId));
      await tx.update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${payment.amount}` })
        .where(eq(usersTable.id, payment.userId));
    });

    res.json({ id: paymentId, status: "completed" });
  } catch (err) {
    logger.error({ err }, "Admin payment credit error");
    res.status(500).json({ error: "Erro ao creditar pagamento" });
  }
});

// GET /api/admin/export?type=bets|deposits|withdrawals&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/export", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const type = String(req.query["type"] || "bets");
  const fromStr = String(req.query["from"] || "");
  const toStr = String(req.query["to"] || "");

  const validTypes = ["bets", "deposits", "withdrawals"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: "Tipo inválido. Use: bets, deposits ou withdrawals" });
    return;
  }

  const fromDate = fromStr ? new Date(`${fromStr}T00:00:00Z`) : null;
  const toDate = toStr ? new Date(`${toStr}T23:59:59Z`) : null;

  if (fromDate && isNaN(fromDate.getTime())) { res.status(400).json({ error: "Data 'from' inválida" }); return; }
  if (toDate && isNaN(toDate.getTime())) { res.status(400).json({ error: "Data 'to' inválida" }); return; }
  if (fromDate && toDate && fromDate > toDate) { res.status(400).json({ error: "Data 'from' não pode ser posterior a 'to'" }); return; }

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

      csvLines.push(buildCsvRow(["ID", "ID Utilizador", "Nome", "Email", "Aposta", "Valor (€)", "Ganho Potencial (€)", "Odds", "Status", "Data"]));
      for (const r of rows) {
        csvLines.push(buildCsvRow([
          r.id, r.userId, r.userName, r.userEmail,
          r.matchTitle,
          parseFloat(r.stake).toFixed(2),
          parseFloat(r.potentialWin).toFixed(2),
          parseFloat(r.totalOdds).toFixed(2),
          r.status,
          new Date(r.createdAt).toISOString(),
        ]));
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

      csvLines.push(buildCsvRow(["ID", "Order ID", "ID Utilizador", "Nome", "Email", "Valor (€)", "Método", "Status", "Entidade", "Referência", "Data"]));
      for (const r of rows) {
        csvLines.push(buildCsvRow([
          r.id, r.orderId, r.userId, r.userName, r.userEmail,
          parseFloat(r.amount).toFixed(2),
          r.method, r.status,
          r.entity, r.reference,
          new Date(r.createdAt).toISOString(),
        ]));
      }
    } else if (type === "withdrawals") {
      const conditions = [];
      if (fromDate) conditions.push(gte(withdrawalsTable.createdAt, fromDate));
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

      csvLines.push(buildCsvRow(["ID", "ID Utilizador", "Nome", "Email", "Valor (€)", "IBAN", "Titular", "NIF", "Status", "Notas", "Data"]));
      for (const r of rows) {
        csvLines.push(buildCsvRow([
          r.id, r.userId, r.userName, r.userEmail,
          parseFloat(r.amount).toFixed(2),
          r.iban, r.holderName, r.nif,
          r.status, r.notes,
          new Date(r.createdAt).toISOString(),
        ]));
      }
    }

    const csv = csvLines.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  } catch (err) {
    logger.error({ err }, "Admin export error");
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
});

// GET /api/admin/settlement-logs — last 200 settlement events
router.get("/settlement-logs", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
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
});

export default router;
