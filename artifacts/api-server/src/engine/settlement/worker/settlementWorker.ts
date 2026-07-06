import { db, betsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { settleBet } from "../../../services/settlement/settleBet";
import { logger } from "../../../lib/logger.js";

const BATCH_SIZE = 50;

export async function runSettlementWorker() {
  try {
    const bets = await db
      .select()
      .from(betsTable)
      .where(eq(betsTable.status, "pending"))
      .limit(BATCH_SIZE);

    if (bets.length === 0) {
      logger.info("Settlement worker: no bets to process");
      return;
    }

    logger.info({ count: bets.length }, "Settlement batch started");

    for (const bet of bets) {
      try {
        await settleBet({
          bet,
          trigger: "worker_batch",
          selections: bet.selections || [],
          cycleId: `worker-${Date.now()}`,
        });
      } catch (err) {
        logger.error({ err, betId: bet.id }, "Settlement failed for bet");
      }
    }

    logger.info("Settlement batch finished");
  } catch (err) {
    logger.error({ err }, "Settlement worker crashed");
  }
}
