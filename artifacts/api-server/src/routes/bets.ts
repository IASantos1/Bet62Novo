import { Router, type IRouter, type Response } from "express";
import { db, betsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/place", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { matchId, matchTitle, selections, stake, potentialWin, totalOdds } = req.body;

  if (!matchId || !matchTitle || !selections || !stake || !potentialWin || !totalOdds) {
    res.status(400).json({ error: "Missing bet details" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    
    const userBalance = parseFloat(user.balance);
    const betStake = parseFloat(stake);

    if (userBalance < betStake) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Use a transaction to ensure both user balance update and bet insertion succeed
    const result = await db.transaction(async (tx) => {
      const [bet] = await tx.insert(betsTable).values({
        userId: req.user!.id,
        matchId,
        matchTitle,
        selections,
        stake,
        potentialWin,
        totalOdds,
        status: "pending",
      }).returning();

      const newBalance = (userBalance - betStake).toFixed(2);
      await tx.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.id, req.user!.id));

      return { bet, newBalance };
    });

    res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, "Bet placement error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/my", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bets = await db.select().from(betsTable)
      .where(eq(betsTable.userId, req.user!.id))
      .orderBy(desc(betsTable.createdAt));
    
    res.json(bets);
  } catch (err) {
    logger.error({ err }, "Fetch bets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
