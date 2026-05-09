import { Router, type IRouter, type Response } from "express";
import { db, betsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { liveMatchState } from "./matches";

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

router.post("/:id/cashout", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const betId = parseInt(String(req.params["id"]), 10);

  if (isNaN(betId)) {
    res.status(400).json({ error: "Invalid bet ID" });
    return;
  }

  try {
    const [bet] = await db.select().from(betsTable).where(eq(betsTable.id, betId)).limit(1);

    if (!bet) {
      res.status(404).json({ error: "Bet not found" });
      return;
    }

    if (bet.userId !== req.user!.id) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    if (bet.status !== "pending") {
      res.status(400).json({ error: "Bet is not eligible for cash out" });
      return;
    }

    const stake = parseFloat(bet.stake);
    const originalOdds = parseFloat(bet.totalOdds);

    // Try to find current odds from live state, otherwise use a random drift factor
    let currentOdds = originalOdds;
    const liveMatch = liveMatchState.get(bet.matchId);
    if (liveMatch) {
      currentOdds = liveMatch.odds.home * liveMatch.odds.draw * liveMatch.odds.away;
      currentOdds = Math.max(1.05, currentOdds);
    } else {
      // Apply a small drift (1–20% increase in current odds = less favorable cashout)
      const drift = 1 + Math.random() * 0.2;
      currentOdds = Math.max(1.05, originalOdds * drift);
    }

    // cashoutValue = (stake × originalOdds) / currentOdds × 0.92
    const cashoutValue = Math.max(0, Number(((stake * originalOdds) / currentOdds * 0.92).toFixed(2)));

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    const userBalance = parseFloat(user.balance);

    const result = await db.transaction(async (tx) => {
      await tx.update(betsTable).set({ status: "cashed_out" }).where(eq(betsTable.id, betId));
      const newBalance = (userBalance + cashoutValue).toFixed(2);
      await tx.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.id, req.user!.id));
      return { cashoutValue, newBalance };
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "Cashout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
