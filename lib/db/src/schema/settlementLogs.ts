import { pgTable, text, serial, timestamp, integer, decimal } from "drizzle-orm/pg-core";
import { betsTable } from "./bets";

export const settlementLogsTable = pgTable("settlement_logs", {
  id: serial("id").primaryKey(),
  betId: integer("bet_id").notNull().references(() => betsTable.id),
  userId: integer("user_id").notNull(),
  oldStatus: text("old_status").notNull(),
  newStatus: text("new_status").notNull(),
  payout: decimal("payout", { precision: 12, scale: 2 }),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SettlementLog = typeof settlementLogsTable.$inferSelect;
