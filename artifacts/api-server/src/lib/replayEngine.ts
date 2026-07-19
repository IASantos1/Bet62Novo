import { pool, db, betsTable, settlementReplayLogTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { settleBet } from "../services/settlement/settleBet.js";

export interface ReplayLog {
  id: number;
  matchId: string;
  triggeredBy: string;
  reason: string;
  betsAffected: number | null;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  createdAt: Date;
}

export class ReplayEngine {
  /**
   * Re-run settlement for all settled bets (won/lost) on a given match.
   * Used when a match result was corrected or settlement had a bug.
   */
  async replayMatch(
    matchId: string,
    triggeredBy: string,
    reason: string,
  ): Promise<{ betsProcessed: number; errors: number; replayLogId: number }> {
    if (!pool) {
      throw new Error("Database pool is not available");
    }

    // Create replay log entry
    const [logRow] = await db
      .insert(settlementReplayLogTable)
      .values({
        matchId,
        triggeredBy,
        reason,
        status: "running",
        startedAt: new Date(),
      })
      .returning({ id: settlementReplayLogTable.id });

    const replayLogId = logRow!.id;

    let betsProcessed = 0;
    let errors = 0;

    try {
      // Fetch all settled bets for this match (won or lost)
      const bets = await db
        .select()
        .from(betsTable)
        .where(
          and(
            eq(betsTable.matchId, matchId),
            inArray(betsTable.status, ["won", "lost"]),
          ),
        );

      logger.info(
        { matchId, betsCount: bets.length, replayLogId, triggeredBy },
        "ReplayEngine: starting match replay",
      );

      const cycleId = `replay-${replayLogId}-${Date.now()}`;

      for (const bet of bets) {
        try {
          // Reset bet to pending so the settlement engine can re-process it
          await pool.query(
            `UPDATE bets SET status = 'pending', version = version + 1, updated_at = NOW()
             WHERE id = $1`,
            [bet.id],
          );

          const selections = Array.isArray(bet.selections)
            ? (bet.selections as any[])
            : [];

          await settleBet({
            bet: {
              id: bet.id,
              userId: bet.userId,
              matchId: bet.matchId,
              status: "pending",
              version: bet.version + 1,
              stake: bet.stake,
              potentialWin: bet.potentialWin,
            },
            trigger: `replay:${triggeredBy}`,
            selections,
            cycleId,
          });

          betsProcessed++;
        } catch (err) {
          errors++;
          logger.error(
            { err, betId: bet.id, matchId, replayLogId },
            "ReplayEngine: error settling bet during replay",
          );
        }
      }

      // Update replay log as completed
      await db
        .update(settlementReplayLogTable)
        .set({
          status: errors > 0 && betsProcessed === 0 ? "failed" : "completed",
          betsAffected: betsProcessed,
          completedAt: new Date(),
        })
        .where(eq(settlementReplayLogTable.id, replayLogId));

      logger.info(
        { matchId, betsProcessed, errors, replayLogId },
        "ReplayEngine: replay completed",
      );

      return { betsProcessed, errors, replayLogId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await db
        .update(settlementReplayLogTable)
        .set({
          status: "failed",
          completedAt: new Date(),
          error: errorMessage,
        })
        .where(eq(settlementReplayLogTable.id, replayLogId));

      logger.error({ err, matchId, replayLogId }, "ReplayEngine: replay failed");
      throw err;
    }
  }

  /**
   * Get replay history for a given match.
   */
  async getReplayHistory(matchId: string): Promise<ReplayLog[]> {
    const rows = await db
      .select()
      .from(settlementReplayLogTable)
      .where(eq(settlementReplayLogTable.matchId, matchId))
      .orderBy(settlementReplayLogTable.createdAt);

    return rows.map((row: typeof rows[number]) => ({
      id: row.id,
      matchId: row.matchId,
      triggeredBy: row.triggeredBy,
      reason: row.reason,
      betsAffected: row.betsAffected,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      error: row.error,
      createdAt: row.createdAt,
    }));
  }
}

export const replayEngine = new ReplayEngine();
