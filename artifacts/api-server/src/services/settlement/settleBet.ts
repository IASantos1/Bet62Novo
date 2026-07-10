import { settleSelection } from "../../engine/settlement/core/settleSelection";
import {
  db,
  betsTable,
  cashoutStatesTable,
  settlementLogsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { applyBalanceDelta } from "../../lib/ledger.js";
import { ensureSettlementTransitionIdempotency } from "../../settlement.js";

export type SettleBetInput = {
  bet: any;
  trigger: string;
  selections: any[];
  cycleId: string;
};

export async function settleBet(input: SettleBetInput) {
  const { bet, trigger, selections } = input;

  return db.transaction(async (tx) => {
    // 1. ENGINE DECISION (NUNCA vem de fora)
    const outcome = settleSelection({
      betId: bet.id,
      match: bet.match,
      selection: selections[0],
      ruleVersion: "2025.06-v4",
    });
    const betStatus = outcome === "void" ? "voided" : outcome;

    // 2. IDEMPOTÊNCIA (anti double processing)
    const canProceed = await ensureSettlementTransitionIdempotency(tx, {
      betId: bet.id,
      trigger,
      oldStatus: "pending",
      newStatus: betStatus,
      matchId: bet.matchId,
    });

    if (!canProceed) {
      logger.warn({ betId: bet.id }, "Settlement blocked by idempotency");
      return;
    }

    // 3. OPTIMISTIC LOCK (evita dupla execução concorrente)
    const rows = await tx
      .update(betsTable)
      .set({
        status: betStatus,
        updatedAt: new Date(),
        version: sql`${betsTable.version} + 1`,
      })
      .where(
        and(
          eq(betsTable.id, bet.id),
          eq(betsTable.status, "pending"),
          eq(betsTable.version, bet.version),
        ),
      )
      .returning({
        id: betsTable.id,
      });

    if (rows.length === 0) {
      logger.warn(
        { betId: bet.id },
        "Optimistic lock failed (already processed)"
      );
      return;
    }

    // 4. CLEANUP CASHOUT STATE
    await tx
      .delete(cashoutStatesTable)
      .where(eq(cashoutStatesTable.betId, bet.id));

    // 5. LEDGER (SINGLE SOURCE OF TRUTH FINANCEIRO)

    if (outcome === "won") {
      await applyBalanceDelta(tx, {
        userId: bet.userId,
        amount: bet.potentialWin,
        kind: "bet_settlement_payout",
        idempotencyKey: `bet:${bet.id}:win`,
        refType: "bet",
        refId: String(bet.id),
      });
    }

    if (outcome === "void") {
      await applyBalanceDelta(tx, {
        userId: bet.userId,
        amount: bet.stake,
        kind: "bet_settlement_void_refund",
        idempotencyKey: `bet:${bet.id}:void`,
        refType: "bet",
        refId: String(bet.id),
      });
    }

    // 6. AUDIT LOG (imutável)
    await tx.insert(settlementLogsTable).values({
      settlementKey: `${bet.id}:${trigger}:${outcome}`,
      betId: bet.id,
      userId: bet.userId,
      oldStatus: "pending",
      newStatus: betStatus,
      payout: bet.potentialWin ?? "0.00",
      message: `engine-settled via ${trigger}`,
      createdAt: new Date(),
    });

    logger.info(
      {
        betId: bet.id,
        outcome,
        trigger,
      },
      "Bet settled successfully"
    );
  });
}
