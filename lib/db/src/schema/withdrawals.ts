import { pgTable, text, serial, timestamp, integer, decimal, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  iban: text("iban").notNull(),
  holderName: text("holder_name").notNull(),
  nif: text("nif").notNull(),
  status: text("status").notNull().default("pending_review"),
  notes: text("notes"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  riskFlags: jsonb("risk_flags"),
  providerReference: text("provider_reference"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Withdrawal = typeof withdrawalsTable.$inferSelect;
