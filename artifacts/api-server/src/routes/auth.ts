import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { SESSION_SECRET } from "../lib/env";

const router: IRouter = Router();

router.post("/register", async (req, res): Promise<void> => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: "Missing name, email or password" });
    return;
  }

  try {
    const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existingUser.length > 0) {
      res.status(400).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      name,
      email,
      passwordHash,
      balance: "0.00",
      freebetBalance: "0.00",
    }).returning();

    const token = jwt.sign({ id: user.id, email: user.email }, SESSION_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        balance: user.balance,
        freebetBalance: user.freebetBalance,
      }
    });
  } catch (err) {
    logger.error({ err }, "Registration error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Missing email or password" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SESSION_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        balance: user.balance,
        freebetBalance: user.freebetBalance,
      }
    });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { type Response } from "express";
import { sql } from "drizzle-orm";

// ─── DEPOSIT ────────────────────────────────────────────────────────────────
router.post("/deposit", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount } = req.body as { amount?: number };
  if (!amount || typeof amount !== "number" || amount < 10 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €10, máximo €5000." });
    return;
  }
  try {
    const [user] = await db
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${amount.toFixed(2)}` })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    // Determine which promotions are triggered
    const promotions: string[] = [];
    const newBalance = parseFloat(user.balance);
    const isFirstDeposit = newBalance - amount <= 1000; // started at 1000
    if (isFirstDeposit && amount >= 20) promotions.push("freebets20");
    if (isFirstDeposit && amount >= 100) promotions.push("bonus100");

    res.json({
      balance: user.balance,
      promotions,
    });
  } catch (err) {
    logger.error({ err }, "Deposit error");
    res.status(500).json({ error: "Erro ao processar depósito" });
  }
});

// ─── WEEKLY CASHBACK CHECK ───────────────────────────────────────────────────
router.get("/cashback", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    // Sum all bets lost in the last 7 days
    const { betsTable } = await import("@workspace/db");
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const lostBets = await db
      .select()
      .from(betsTable)
      .where(
        sql`${betsTable.userId} = ${userId} AND ${betsTable.status} = 'lost' AND ${betsTable.createdAt} >= ${oneWeekAgo}`
      );
    const totalLost = lostBets.reduce((sum, b) => sum + parseFloat(b.stake), 0);
    const cashback = Math.min(100, +(totalLost * 0.10).toFixed(2));
    res.json({ totalLost: +totalLost.toFixed(2), cashback, bets: lostBets.length });
  } catch (err) {
    logger.error({ err }, "Cashback check error");
    res.status(500).json({ error: "Erro ao calcular cashback" });
  }
});

router.get("/me", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        balance: user.balance,
        freebetBalance: user.freebetBalance,
        nif: user.nif,
        withdrawalIban: user.withdrawalIban,
        withdrawalName: user.withdrawalName,
        selfExcludedUntil: user.selfExcludedUntil,
        kycStatus: user.kycStatus,
      }
    });
  } catch (err) {
    logger.error({ err }, "Auth me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
