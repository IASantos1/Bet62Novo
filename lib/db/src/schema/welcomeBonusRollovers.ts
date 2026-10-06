import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Tracks the "100% bónus de boas-vindas" promo card (home.tsx's PROMO_CONTENT
// "bonus100"): 100% match on the user's first deposit (capped at €500),
// released only after the user wagers rolloverTarget (5x deposit+bonus) in
// qualifying sportsbook stake (odds >= minOdds) within 30 days.
//
// Granted (2026-10-06) but NOT YET FUNCTIONAL end-to-end: WinHouse's
// /balance-change webhook (routes/winhouse.ts) tells us a bet's amount but
// not its odds, and no confirmed server-side way to fetch per-ticket odds
// exists yet (the only internal endpoint found during investigation,
// /ousr/get/in/.in, appears to be browser-session-scoped — its own URL
// carries no user identifier at all, strongly suggesting it can't be called
// from our backend without first replicating that session). So this table
// records real grants with a real deadline, but rolloverProgress only ever
// moves once that odds-data gap is resolved (either an official WinHouse
// reporting API, or a confirmed way to read ticket-level odds) — there is
// deliberately no code anywhere that advances rolloverProgress yet, rather
// than fake-advancing it off stake volume alone (which would wrongly count
// casino play as sportsbook wagering, and ignore the odds-minimum term).
export const welcomeBonusRolloversTable = pgTable("welcome_bonus_rollovers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  depositAmount: text("deposit_amount").notNull(),
  bonusAmount: text("bonus_amount").notNull(),
  // (depositAmount + bonusAmount) * 5, per the promo's terms.
  rolloverTarget: text("rollover_target").notNull(),
  rolloverProgress: text("rollover_progress").notNull().default("0.00"),
  minOdds: text("min_odds").notNull().default("1.50"),
  // "active" | "completed" — "expired" is derived at read time
  // (active && expiresAt < now) rather than stored, since nothing needs to
  // react to the transition itself yet.
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WelcomeBonusRolloverRow = typeof welcomeBonusRolloversTable.$inferSelect;
export type InsertWelcomeBonusRollover = typeof welcomeBonusRolloversTable.$inferInsert;
