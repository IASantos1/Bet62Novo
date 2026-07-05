import { db, betsTable, cashoutStatesTable, settlementLogsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { applyBalanceDelta } from "../../lib/ledger.js";
import { ensureSettlementTransitionIdempotency } from "../../settlement.js";

export type SettleBetInput = {
  bet: any;
  newStatus: "won" | "lost" | "voided";
  trigger: string;
  payout?: string;
  selections: any[];
  cycleId: string;
};

export async function settleBet(input: SettleBetInput) {
  const { bet, newStatus, trigger, payout, selections, cycleId } = input;

  return db.transaction(async (tx) => {
    // 1. Idempotência (anti duplicate event)
    const canProceed = await ensureSettlementTransitionIdempotency(tx, {
      betId: bet.id,
      trigger,
      oldStatus: "pending",
      newStatus,
      matchId: bet.matchId,
    });

    if (!canProceed) return;

    // 2. Optimistic Lock (versão + status)
    const rows = await tx
      .update(betsTable)
      .set({
        status: newStatus,
        selections,
        potentialWin: payout ?? bet.potentialWin,
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
        "Optimistic lock failed - bet already processed",
      );
      return;
    }

    // 3. Cleanup cashout state
    await tx
      .delete(cashoutStatesTable)
      .where(eq(cashoutStatesTable.betId, bet.id));

    // 4. Ledger (SÓ UMA FONTE DE VERDADE FINANCEIRA)
    if (newStatus === "won") {
      await applyBalanceDelta(tx, {
        userId: bet.userId,
        amount: payout!,
        kind: "bet_settlement_payout",
        idempotencyKey: `bet:${bet.id}:settle:win`,
        refType: "bet",
        refId: String(bet.id),
      });
    }

    if (newStatus === "voided") {
      await applyBalanceDelta(tx, {
        userId: bet.userId,
        amount: bet.stake,
        kind: "bet_settlement_void_refund",
        idempotencyKey: `bet:${bet.id}:settle:void`,
        refType: "bet",
        refId: String(bet.id),
      });
    }

    // 5. Log auditável
    await tx.insert(settlementLogsTable).values({
      settlementKey: `${bet.id}:${trigger}:${newStatus}`,
      betId: bet.id,
      userId: bet.userId,
      oldStatus: "pending",
      newStatus,
      payout: payout ?? "0.00",
      message: `settled via ${trigger}`,
    });

    logger.info(
      {
        betId: bet.id,
        status: newStatus,
        trigger,
      },
      "Bet settled successfully",
    );
  });
}
