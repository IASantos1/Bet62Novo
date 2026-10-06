import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// User-specified plan (2026-10-06): deposit >= €10 -> €5 freebet, released
// only once the user WINS requiredWins (2) qualifying bets — each with odds
// >= minOdds (1.55), either as 2 separate tickets or 1 multiple with 2+
// selections each at that odd — staked from their REAL deposited balance
// (not the €5 itself), within 7 days. On success the €5 moves straight into
// real balance (never through freebetBalance, to avoid it being spendable
// before the condition is met).
//
// Same gap as welcome_bonus_rollovers (see that schema's comment): granted
// with a real deadline, but winsCompleted only ever advances once we have a
// confirmed way to read a ticket's odds and result server-side. No code
// anywhere fakes a win off balance-change's amount alone yet.
export const freebetUnlockPlansTable = pgTable("freebet_unlock_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  depositAmount: text("deposit_amount").notNull(),
  freebetAmount: text("freebet_amount").notNull(),
  requiredWins: integer("required_wins").notNull().default(2),
  winsCompleted: integer("wins_completed").notNull().default(0),
  minOdds: text("min_odds").notNull().default("1.55"),
  // "active" | "completed" — same "expired" is derived, not stored, as
  // welcome_bonus_rollovers.
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FreebetUnlockPlanRow = typeof freebetUnlockPlansTable.$inferSelect;
export type InsertFreebetUnlockPlan = typeof freebetUnlockPlansTable.$inferInsert;
