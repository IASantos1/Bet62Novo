import { db, usersTable, paymentsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { logger } from "./logger.js";

// 5 spins per €10 deposited, no cap, per user confirmation (2026-10-02):
// €10→5, €20→10, €30→15, €50→25, €100→50, €200→100. Below €10, no bonus.
export function computeCasinoBonusSpins(depositAmount: number): number {
  if (depositAmount < 10) return 0;
  return Math.floor(depositAmount / 10) * 5;
}

// Replaces the old first-deposit freebet grant (routes/payments.ts used to
// credit freebetBalance here). Freebets only ever worked against BET62's
// own native sportsbook engine — never through the WinHouse iframe, which
// has no concept of a BET62 freebet balance — while the casino's BigBang
// seamless wallet is fully ours to intercept (see routes/casino.ts's
// balance-change webhook). So the deposit-triggered welcome bonus now
// grants casino-only free spins instead.
//
// Still gated by firstDepositGranted exactly as the freebet grant was:
// "none" means never granted, and it flips to a non-"none" value the
// moment it is (now storing the spin count granted, purely for audit —
// nothing reads the specific value, only the "none" vs not check below).
// Granted once ever, on the user's first completed deposit only — a later
// top-up never re-triggers it, even if the very first deposit was under
// €10 and granted zero spins.
export async function maybeGrantCasinoWelcomeBonus(userId: number, depositAmount: number): Promise<void> {
  try {
    const [user] = await db
      .select({ firstDepositGranted: usersTable.firstDepositGranted })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user || user.firstDepositGranted !== "none") return;

    const [{ completedCount }] = await db
      .select({ completedCount: count() })
      .from(paymentsTable)
      .where(eq(paymentsTable.userId, userId));
    if (Number(completedCount) !== 1) return;

    const spins = computeCasinoBonusSpins(depositAmount);
    if (spins <= 0) return;

    await db
      .update(usersTable)
      .set({
        casinoBonusSpinsRemaining: sql`${usersTable.casinoBonusSpinsRemaining} + ${spins}`,
        firstDepositGranted: String(spins),
      })
      .where(eq(usersTable.id, userId));

    logger.info({ userId, spins, depositAmount }, "Casino welcome bonus spins granted");
  } catch (err) {
    logger.error({ err, userId }, "Error granting casino welcome bonus spins");
  }
}
