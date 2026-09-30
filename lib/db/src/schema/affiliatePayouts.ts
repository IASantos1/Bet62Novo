import { pgTable, text, serial, timestamp, decimal, integer } from "drizzle-orm/pg-core";
import { affiliatesTable } from "./affiliates.js";

export const affiliatePayoutsTable = pgTable("affiliate_payouts", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull().references(() => affiliatesTable.id),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  status: text("status").notNull().default("pending"), // pending | paid
  paymentMethod: text("payment_method"),
  transactionId: text("transaction_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export type AffiliatePayout = typeof affiliatePayoutsTable.$inferSelect;
