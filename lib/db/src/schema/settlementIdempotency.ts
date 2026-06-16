import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { betsTable } from "./bets";

export const settlementIdempotencyTable = pgTable("settlement_idempotency", {
  id: serial("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull(),
  betId: integer("bet_id").notNull().references(() => betsTable.id),
  trigger: text("trigger").notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  matchId: text("match_id"),
  jobId: text("job_id"),
  engineVersion: text("engine_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idempotencyKeyIdx: uniqueIndex("settlement_idempotency_key_idx").on(table.idempotencyKey),
}));

export type SettlementIdempotency = typeof settlementIdempotencyTable.$inferSelect;
