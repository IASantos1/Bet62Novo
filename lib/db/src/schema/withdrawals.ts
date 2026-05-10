import { pgTable, text, serial, timestamp, integer, decimal } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  iban: text("iban").notNull(),
  holderName: text("holder_name").notNull(),
  nif: text("nif").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Withdrawal = typeof withdrawalsTable.$inferSelect;
