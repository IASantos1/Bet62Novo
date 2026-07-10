import { db, betsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { acquireBetSettlementLock, releaseBetSettlementLock } from "../lib/settlement/lock.js";
import { logger } from "../lib/logger.js";

const RECOVERY_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3h

export async function runSettlementRecovery() {
  const cycleId = `recovery:${Date.now()}`;

  try {
    const cutoff = new Date(Date.now() - RECOVERY_THRESHOLD_MS);

    const stuckBets = await db
      .select()
      .from(betsTable)
      .where(
        and(
          eq(betsTable.status, "pending"),
          lt(betsTable.updatedAt, cutoff)
        )
      );

    for (const bet of stuckBets) {
      const { ok } = await acquireBetSettlementLock(bet.id, cycleId);

      if (!ok) continue;

      try {
        logger.warn({ betId: bet.id }, "Recovering stuck bet settlement");

        // await settleBet(bet)

      } catch (err) {
        logger.error({ err, betId: bet.id }, "Recovery failed");

      } finally {
        await releaseBetSettlementLock(bet.id, cycleId);
      }
    }

  } catch (err) {
    logger.error({ err }, "Recovery job failed");
  }
}
