import { settleBet } from "../../../services/settlement/settleBet.js";
import { logger } from "../../../lib/logger.js";
import { getPendingSelectionsByMatch } from "../repository/selectionRepository.js";

const TEST_MATCH_ID = process.env.SETTLEMENT_MATCH_ID ?? "";

export type SettlementWorkerDeps = {
  settleBet: typeof settleBet;
  getPendingSelectionsByMatch: typeof getPendingSelectionsByMatch;
  logger: Pick<typeof logger, "info" | "warn" | "error">;
  testMatchId: string;
  now: () => number;
};

const defaultSettlementWorkerDeps: SettlementWorkerDeps = {
  settleBet,
  getPendingSelectionsByMatch,
  logger,
  testMatchId: TEST_MATCH_ID,
  now: () => Date.now(),
};

export async function runSettlementWorker(
  deps: SettlementWorkerDeps = defaultSettlementWorkerDeps,
) {
  try {
    if (!deps.testMatchId) {
      deps.logger.warn(
        "SETTLEMENT_MATCH_ID not configured. Worker is waiting.",
      );
      return;
    }

    const bets = await deps.getPendingSelectionsByMatch(deps.testMatchId);

    if (bets.length === 0) {
      deps.logger.info(
        { matchId: deps.testMatchId },
        "No pending bets",
      );
      return;
    }

    deps.logger.info(
      {
        matchId: deps.testMatchId,
        bets: bets.length,
      },
      "Settlement batch started",
    );

    for (const item of bets) {
      try {
        await deps.settleBet({
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
          cycleId: `worker-${deps.now()}`,
        });
      } catch (err) {
        deps.logger.error(
          {
            err,
            betId: item.betId,
          },
          "Settlement failed",
        );
      }
    }

    deps.logger.info("Settlement batch finished");
  } catch (err) {
    deps.logger.error({ err }, "Settlement worker crashed");
  }
}
