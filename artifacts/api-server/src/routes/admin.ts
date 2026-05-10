import { Router, type IRouter, type Response, type Request } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable, betsTable } from "@workspace/db";
import { eq, desc, count, sum, sql } from "drizzle-orm";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SESSION_SECRET = process.env.SESSION_SECRET || "default_secret";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "bet62admin2026";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@bet62.com";

// POST /api/admin/login  (aceita username OU email)
router.post("/login", (req: Request, res: Response): void => {
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

    // Last 7 days bets per day
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
        margin: totalStaked.total
          ? (((parseFloat(totalStaked.total) - parseFloat(totalPaidOut.total || "0")) / parseFloat(totalStaked.total)) * 100).toFixed(1)
          : "0.0",
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
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt));

    // For each user, get bet count
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
    }));

    res.json(result);
  } catch (err) {
    logger.error({ err }, "Admin users error");
    res.status(500).json({ error: "Erro ao carregar usuários" });
  }
});

// PUT /api/admin/users/:id/balance
router.put("/users/:id/balance", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const userId = parseInt(String(req.params["id"]), 10);
  const { balance, operation, amount } = req.body;

  if (isNaN(userId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    let newBalance: string;
    if (operation === "add") {
      newBalance = (parseFloat(user.balance) + parseFloat(amount)).toFixed(2);
    } else if (operation === "subtract") {
      newBalance = Math.max(0, parseFloat(user.balance) - parseFloat(amount)).toFixed(2);
    } else if (balance !== undefined) {
      newBalance = parseFloat(balance).toFixed(2);
    } else {
      res.status(400).json({ error: "Operação inválida" });
      return;
    }

    const [updated] = await db.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.id, userId)).returning();
    res.json({ id: updated.id, balance: updated.balance });
  } catch (err) {
    logger.error({ err }, "Admin balance update error");
    res.status(500).json({ error: "Erro ao atualizar saldo" });
  }
});

// GET /api/admin/bets
router.get("/bets", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(String(req.query["page"] || "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;

    const bets = await db
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

  const validStatuses = ["pending", "won", "lost", "cashed_out"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Status inválido" });
    return;
  }

  try {
    const [bet] = await db.select().from(betsTable).where(eq(betsTable.id, betId)).limit(1);
    if (!bet) {
      res.status(404).json({ error: "Aposta não encontrada" });
      return;
    }

    if (status === "won" && bet.status !== "won") {
      // Credit user with potential win
      await db.transaction(async (tx) => {
        await tx.update(betsTable).set({ status }).where(eq(betsTable.id, betId));
        const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, bet.userId)).limit(1);
        const newBalance = (parseFloat(user.balance) + parseFloat(bet.potentialWin)).toFixed(2);
        await tx.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.id, bet.userId));
      });
    } else {
      await db.update(betsTable).set({ status }).where(eq(betsTable.id, betId));
    }

    res.json({ id: betId, status });
  } catch (err) {
    logger.error({ err }, "Admin bet status update error");
    res.status(500).json({ error: "Erro ao atualizar status" });
  }
});

export default router;
