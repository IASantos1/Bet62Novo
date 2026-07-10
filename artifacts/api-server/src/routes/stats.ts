import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, betsTable } from "@workspace/db";
import { count, sum, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// GET /api/stats — public platform stats for hero section
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [userCount] = await db.select({ count: count() }).from(usersTable);
    const [betCount] = await db.select({ count: count() }).from(betsTable);
    const [wonCount] = await db.select({ count: count() }).from(betsTable).where(eq(betsTable.status, "won"));
    const [totalPaidOut] = await db
      .select({ total: sum(betsTable.potentialWin) })
      .from(betsTable)
      .where(eq(betsTable.status, "won"));

    res.json({
      totalUsers: Number(userCount.count),
      totalBets: Number(betCount.count),
      totalWon: Number(wonCount.count),
      totalPaidOut: parseFloat(totalPaidOut.total || "0"),
    });
  } catch (err) {
    logger.error({ err }, "Public stats error");
    res.status(500).json({ error: "Erro ao carregar estatísticas" });
  }
});

export default router;
