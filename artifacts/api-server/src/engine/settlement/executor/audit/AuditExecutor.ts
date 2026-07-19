import { SettlementResult } from "../../results/SettlementResult.js";
import { pool } from "@workspace/db";
import { logger } from "../../../../lib/logger.js";

const HIGH_PAYOUT_THRESHOLD = 1000;
const HIGH_ODDS_THRESHOLD = 50;
const UNUSUAL_STATUSES: string[] = ["void", "halfwon", "halflost"];

function determinePriority(result: SettlementResult): "high" | "normal" | "low" {
  if (result.payout > HIGH_PAYOUT_THRESHOLD && result.odds > HIGH_ODDS_THRESHOLD) {
    return "high";
  }
  if (result.payout > HIGH_PAYOUT_THRESHOLD || result.odds > HIGH_ODDS_THRESHOLD) {
    return "normal";
  }
  return "low";
}

function buildReviewReason(result: SettlementResult): string {
  const reasons: string[] = [];
  if (result.payout > HIGH_PAYOUT_THRESHOLD) {
    reasons.push(`High payout: ${result.payout}`);
  }
  if (result.odds > HIGH_ODDS_THRESHOLD) {
    reasons.push(`High odds: ${result.odds}`);
  }
  if (UNUSUAL_STATUSES.includes(result.status)) {
    reasons.push(`Unusual settlement status: ${result.status}`);
  }
  return reasons.join("; ");
}

function shouldFlagForReview(result: SettlementResult): boolean {
  return (
    result.payout > HIGH_PAYOUT_THRESHOLD ||
    result.odds > HIGH_ODDS_THRESHOLD ||
    UNUSUAL_STATUSES.includes(result.status)
  );
}

export class AuditExecutor {

  async execute(result: SettlementResult): Promise<void> {
    try {
      if (!shouldFlagForReview(result)) {
        return;
      }

      if (!pool) {
        logger.warn({ betId: result.betId }, "AuditExecutor: pool not available, skipping review queue insert");
        return;
      }

      const reason = buildReviewReason(result);
      const priority = determinePriority(result);

      await pool.query(
        `INSERT INTO manual_review_queue
           (bet_id, match_id, reason, priority, status, settlement_result, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, NOW(), NOW())`,
        [
          result.betId,
          result.matchId,
          reason,
          priority,
          JSON.stringify(result),
        ],
      );

      logger.info(
        { betId: result.betId, matchId: result.matchId, priority, reason },
        "AuditExecutor: bet flagged for manual review",
      );
    } catch (err) {
      logger.error({ err, betId: result.betId }, "AuditExecutor: failed to insert into manual_review_queue");
    }
  }

}
