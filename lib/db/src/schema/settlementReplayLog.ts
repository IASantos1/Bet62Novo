import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const settlementReplayLogTable = pgTable("settlement_replay_log", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  triggeredBy: text("triggered_by").notNull(),
  reason: text("reason").notNull(),
  betsAffected: integer("bets_affected"),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SettlementReplayLog = typeof settlementReplayLogTable.$inferSelect;
export type InsertSettlementReplayLog = typeof settlementReplayLogTable.$inferInsert;
