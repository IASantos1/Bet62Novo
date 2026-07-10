import { settlementEngine } from "../core/SettlementEngine.js";
import { settleBet } from "../../../services/settlement/settleBet";
import { logger } from "../../../lib/logger.js";
import { getPendingSelectionsByMatch } from "../repository/selectionRepository";

const TEST_MATCH_ID = process.env.SETTLEMENT_MATCH_ID ?? "";

export async function runSettlementWorker() {
  try {
    if (!TEST_MATCH_ID) {
      logger.warn(
        "SETTLEMENT_MATCH_ID not configured. Worker is waiting.",
      );
      return;
    }

    const selections = await getPendingSelectionsByMatch(TEST_MATCH_ID);

    if (selections.length === 0) {
      logger.info(
        { matchId: TEST_MATCH_ID },
        "No pending selections",
      );
      return;
    }

    logger.info(
      {
        matchId: TEST_MATCH_ID,
        selections: selections.length,
      },
      "Settlement batch started",
    );

    for (const item of selections) {
      try {
        await settleBet({
          bet: {
            id: item.betId,
            userId: item.userId,
            matchId: item.matchId,
            status: item.status,
            version: item.version,
            stake: item.stake,
            potentialWin: item.potentialWin,
          },
          trigger: "worker_batch",
          selections: item.selections,
          cycleId: `worker-${Date.now()}`,
        });
      } catch (err) {
        logger.error(
          {
            err,
            betId: item.betId,
          },
          "Settlement failed",
        );
      }
    }

    logger.info("Settlement batch finished");
  } catch (err) {
    logger.error({ err }, "Settlement worker crashed");
  }
}
