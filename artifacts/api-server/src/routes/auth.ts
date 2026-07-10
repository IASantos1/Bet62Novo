import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error(
    "[SECURITY] SESSION_SECRET environment variable is not set. " +
      "Set SESSION_SECRET in your deployment configuration.",
  );
}

function validatePortugueseNif(nif: string): boolean {
  const digits = (nif ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  if (!["1","2","3","5","6","7","8","9"].includes(digits[0]!)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(digits[i]!) * (9 - i);
  const rem = sum % 11;
  const check = rem < 2 ? 0 : 11 - rem;
  return check === parseInt(digits[8]!);
}

router.post("/register", async (req, res): Promise<void> => {
  const { name, email, password, nif } = req.body as { name?: string; email?: string; password?: string; nif?: string };

  if (!name || !email || !password) {
    res.status(400).json({ error: "Missing name, email or password" });
    return;
  }

  const nifClean = (nif ?? "").replace(/\s/g, "");
  // Optional NIF: if provided, validate it
  if (nifClean && !validatePortugueseNif(nifClean)) {
    res.status(400).json({ error: "NIF inválido. Insira um NIF português válido com 9 dígitos." });
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
      nif: nifClean || null,
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

import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { type Response } from "express";
import { sql } from "drizzle-orm";

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
