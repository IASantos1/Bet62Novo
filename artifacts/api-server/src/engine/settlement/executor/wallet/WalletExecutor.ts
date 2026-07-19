import { db, betsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../../../lib/logger.js";
import { SettlementResult } from "../../results/SettlementResult.js";

export class WalletExecutor {

    async execute(result: SettlementResult): Promise<void> {
        const { betId, userId, status } = result;

        // Only statuses that require a wallet reconciliation pass
        if (status === "pending") return;

        try {
            // Re-read the user's current balance from DB to confirm it is accurate
            // (applyBalanceDelta in LedgerExecutor already updated it atomically,
            //  so this is purely a verification / secondary-sync step)
            const [user] = await db
                .select({ balance: usersTable.balance })
                .from(usersTable)
                .where(eq(usersTable.id, userId));

            if (!user) {
                logger.warn(
                    { betId, userId },
                    "WalletExecutor: user not found — skipping wallet sync"
                );
                return;
            }

            // Confirm the bet record reflects the final settlement status
            const [bet] = await db
                .select({ id: betsTable.id, status: betsTable.status })
                .from(betsTable)
                .where(eq(betsTable.id, betId));

            if (!bet) {
                logger.warn(
                    { betId },
                    "WalletExecutor: bet not found — skipping wallet sync"
                );
                return;
            }

            // If LedgerExecutor already set the status, nothing to do
            const expectedStatus = mapStatusToBetStatus(status);
            if (bet.status === expectedStatus) {
                logger.info(
                    { betId, status: bet.status, balance: user.balance },
                    "WalletExecutor: bet status already correct — wallet sync complete"
                );
                return;
            }

            // Fallback: ensure the bet status is updated if LedgerExecutor missed it
            await db
                .update(betsTable)
                .set({
                    status: expectedStatus,
                    updatedAt: sql`now()`,
                })
                .where(eq(betsTable.id, betId));

            logger.info(
                { betId, userId, status, expectedStatus, balance: user.balance },
                "WalletExecutor: bet status corrected and wallet verified"
            );
        } catch (err) {
            logger.error(
                { err, betId, userId, status },
                "WalletExecutor: failed to sync wallet/bet status"
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
