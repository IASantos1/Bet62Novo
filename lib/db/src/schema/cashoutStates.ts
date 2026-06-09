import { pgTable, integer, timestamp, text } from "drizzle-orm/pg-core";
import { betsTable } from "./bets";

export const cashoutStatesTable = pgTable("cashout_states", {
  betId: integer("bet_id").primaryKey().references(() => betsTable.id, { onDelete: "cascade" }),
  unfavorableSince: timestamp("unfavorable_since", { withTimezone: true }).notNull(),
  reason: text("reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CashoutState = typeof cashoutStatesTable.$inferSelect;
