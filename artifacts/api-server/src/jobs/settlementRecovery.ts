import { db, betsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import {
  acquireBetSettlementLock,
  releaseBetSettlementLock,
  stopSettlementLockHeartbeat,
} from "../settlement.js";
import { logger } from "../lib/logger.js";
import { settleBet } from "../services/settlement/settleBet.js";

const RECOVERY_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3h

type SettlementLockResult = Awaited<ReturnType<typeof acquireBetSettlementLock>>;

export type SettlementRecoveryDeps = {
  logger: Pick<typeof logger, "warn" | "error">;
  settleBet: typeof settleBet;
  acquireBetSettlementLock: typeof acquireBetSettlementLock;
  releaseBetSettlementLock: typeof releaseBetSettlementLock;
  stopSettlementLockHeartbeat: typeof stopSettlementLockHeartbeat;
  listRecoverableBets: (cutoff: Date) => Promise<(typeof betsTable.$inferSelect)[]>;
  recoveryThresholdMs: number;
  now: () => number;
};

const defaultSettlementRecoveryDeps: SettlementRecoveryDeps = {
  logger,
  settleBet,
  acquireBetSettlementLock,
  releaseBetSettlementLock,
  stopSettlementLockHeartbeat,
  listRecoverableBets: async (cutoff) =>
    db
      .select()
      .from(betsTable)
      .where(
        and(
          eq(betsTable.status, "pending"),
          lt(betsTable.updatedAt, cutoff)
        )
      ),
  recoveryThresholdMs: RECOVERY_THRESHOLD_MS,
  now: () => Date.now(),
};

export async function runSettlementRecovery(
  deps: SettlementRecoveryDeps = defaultSettlementRecoveryDeps,
) {
  const cycleId = `recovery:${deps.now()}`;

  try {
    const cutoff = new Date(deps.now() - deps.recoveryThresholdMs);
    const stuckBets = await deps.listRecoverableBets(cutoff);

    for (const bet of stuckBets) {
      const { ok, heartbeat } = (await deps.acquireBetSettlementLock(
        bet.id,
        cycleId,
      )) as SettlementLockResult;

      if (!ok) continue;

      try {
        deps.logger.warn({ betId: bet.id }, "Recovering stuck bet settlement");

        await deps.settleBet({
          bet,
          trigger: "recovery",
          selections: Array.isArray(bet.selections) ? bet.selections : [],
          cycleId: `${cycleId}:${bet.id}`,
        });

      } catch (err) {
        deps.logger.error({ err, betId: bet.id }, "Recovery failed");

      } finally {
        deps.stopSettlementLockHeartbeat(heartbeat);
        await deps.releaseBetSettlementLock(bet.id, cycleId);
      }
    }

  } catch (err) {
    deps.logger.error({ err }, "Recovery job failed");
  }
}
