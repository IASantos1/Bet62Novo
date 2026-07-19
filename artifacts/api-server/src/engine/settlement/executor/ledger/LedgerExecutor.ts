import { db, betsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { applyBalanceDelta } from "../../../../lib/ledger.js";
import { logger } from "../../../../lib/logger.js";
import { SettlementResult } from "../../results/SettlementResult.js";

export class LedgerExecutor {

    async execute(result: SettlementResult): Promise<void> {
        const { betId, userId, status, stake, payout } = result;

        // Determine the amount to credit based on settlement status
        let amount: string | null = null;
        let kind: string;

        switch (status) {
            case "won":
                // Credit full payout
                amount = payout.toFixed(2);
                kind = "settlement_win";
                break;

            case "lost":
                // Stake was already deducted at bet placement — no credit
                return;

            case "void":
                // Refund the full stake
                amount = stake.toFixed(2);
                kind = "settlement_void";
                break;

            case "halfwon":
                // Credit half payout
                amount = (payout / 2).toFixed(2);
                kind = "settlement_halfwon";
                break;

            case "halflost":
                // Refund half stake
                amount = (stake / 2).toFixed(2);
                kind = "settlement_halflost";
                break;

            case "pending":
                return;

            default:
                return;
        }

        const idempotencyKey = `settlement:${betId}:${status}`;

        try {
            await db.transaction(async (tx) => {
                // Credit the ledger and update the user's displayed balance atomically
                const credited = await applyBalanceDelta(tx as never, {
                    userId,
                    amount,
                    kind,
                    idempotencyKey,
                    refType: "bet",
                    refId: String(betId),
                    metadata: { betId, status, stake, payout },
                });

                if (!credited) {
                    logger.info(
                        { betId, status, idempotencyKey },
                        "LedgerExecutor: idempotency key already exists — skipping duplicate"
                    );
                    return;
                }

                // Update the bet status in the same transaction
                const betStatus = mapStatusToBetStatus(status);
                await tx
                    .update(betsTable)
                    .set({
                        status: betStatus,
                        updatedAt: sql`now()`,
                    })
                    .where(eq(betsTable.id, betId));

                logger.info(
                    { betId, userId, status, amount, kind },
                    "LedgerExecutor: ledger entry created and bet status updated"
                );
            });
        } catch (err) {
            logger.error(
                { err, betId, userId, status },
                "LedgerExecutor: failed to apply ledger entry"
            );
        }
    }

}

function mapStatusToBetStatus(status: SettlementResult["status"]): string {
    switch (status) {
        case "won":
        case "halfwon":
            return "won";
        case "lost":
        case "halflost":
            return "lost";
        case "void":
            return "voided";
        default:
            return "pending";
    }
}
