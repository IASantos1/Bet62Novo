import { db, usersTable, paymentsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { logger } from "./logger.js";
// Relative imports — same tsc alias-resolution workaround already used for
// telegramPostsTable/affiliatesTable/winhousePromotionPostsTable elsewhere.
import { welcomeBonusRolloversTable } from "../../../../lib/db/src/schema/welcomeBonusRollovers.js";
import { freebetUnlockPlansTable } from "../../../../lib/db/src/schema/freebetUnlockPlans.js";

// Both plans below are granted on the user's first completed deposit only
// (never a later top-up) — same rule, and same "exactly 1 completed
// payment row" check, as casinoBonus.ts's maybeGrantCasinoWelcomeBonus.
// Whether a user already has a grant is read from the existence of a row
// in that plan's own table (no separate "granted" flag on usersTable
// needed — unlike casinoBonus.ts's firstDepositGranted, which predates
// this and is kept as-is rather than migrated).
async function isFirstCompletedDeposit(userId: number): Promise<boolean> {
  const [{ completedCount }] = await db
    .select({ completedCount: count() })
    .from(paymentsTable)
    .where(eq(paymentsTable.userId, userId));
  return Number(completedCount) === 1;
}

const WELCOME_BONUS_MATCH_RATE = 1; // 100%
const WELCOME_BONUS_MAX = 500;
const WELCOME_BONUS_ROLLOVER_MULTIPLIER = 5;
const WELCOME_BONUS_MIN_ODDS = "1.50";
const WELCOME_BONUS_DEADLINE_DAYS = 30;

// "100% bónus de boas-vindas" (home.tsx's "bonus100" promo card). Records
// the grant and its rollover target/deadline — does NOT credit any balance.
// Per the user's own call (2026-10-06): safer to make the bonus amount
// real only once the rollover is confirmed complete than to credit it
// upfront and risk having to claw it back. rolloverProgress intentionally
// never advances anywhere in this codebase yet — see this table's own
// schema comment for why (no confirmed way to read a WinHouse ticket's
// odds server-side).
export async function maybeGrantWelcomeBonusRollover(userId: number, depositAmount: number): Promise<void> {
  try {
    if (depositAmount <= 0) return;
    const [existing] = await db
      .select({ id: welcomeBonusRolloversTable.id })
      .from(welcomeBonusRolloversTable)
      .where(eq(welcomeBonusRolloversTable.userId, userId))
      .limit(1);
    if (existing) return;
    if (!(await isFirstCompletedDeposit(userId))) return;

    const bonusAmount = Math.min(depositAmount * WELCOME_BONUS_MATCH_RATE, WELCOME_BONUS_MAX);
    const rolloverTarget = (depositAmount + bonusAmount) * WELCOME_BONUS_ROLLOVER_MULTIPLIER;
    const expiresAt = new Date(Date.now() + WELCOME_BONUS_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(welcomeBonusRolloversTable).values({
      userId,
      depositAmount: depositAmount.toFixed(2),
      bonusAmount: bonusAmount.toFixed(2),
      rolloverTarget: rolloverTarget.toFixed(2),
      minOdds: WELCOME_BONUS_MIN_ODDS,
      expiresAt,
    });

    logger.info({ userId, depositAmount, bonusAmount, rolloverTarget }, "Welcome bonus rollover granted");
  } catch (err) {
    logger.error({ err, userId }, "Error granting welcome bonus rollover");
  }
}

const FREEBET_UNLOCK_MIN_DEPOSIT = 10;
const FREEBET_UNLOCK_AMOUNT = 5;
const FREEBET_UNLOCK_REQUIRED_WINS = 2;
const FREEBET_UNLOCK_MIN_ODDS = "1.55";
const FREEBET_UNLOCK_DEADLINE_DAYS = 7;

// User-specified plan (2026-10-06): deposit >= €10 -> €5 freebet, released
// once the user wins 2 qualifying bets (odds >= 1.55 each, staked from
// real balance — not this freebet) within 7 days. Same reasoning as
// maybeGrantWelcomeBonusRollover above: records the grant, winsCompleted
// never advances yet, nothing credited until that's wired to a real data
// source.
export async function maybeGrantFreebetUnlockPlan(userId: number, depositAmount: number): Promise<void> {
  try {
    if (depositAmount < FREEBET_UNLOCK_MIN_DEPOSIT) return;
    const [existing] = await db
      .select({ id: freebetUnlockPlansTable.id })
      .from(freebetUnlockPlansTable)
      .where(eq(freebetUnlockPlansTable.userId, userId))
      .limit(1);
    if (existing) return;
    if (!(await isFirstCompletedDeposit(userId))) return;

    const expiresAt = new Date(Date.now() + FREEBET_UNLOCK_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(freebetUnlockPlansTable).values({
      userId,
      depositAmount: depositAmount.toFixed(2),
      freebetAmount: FREEBET_UNLOCK_AMOUNT.toFixed(2),
      requiredWins: FREEBET_UNLOCK_REQUIRED_WINS,
      minOdds: FREEBET_UNLOCK_MIN_ODDS,
      expiresAt,
    });

    logger.info({ userId, depositAmount }, "Freebet unlock plan granted");
  } catch (err) {
    logger.error({ err, userId }, "Error granting freebet unlock plan");
  }
}
