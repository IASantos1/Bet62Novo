import { pgTable, text, serial, timestamp, decimal, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { affiliatesTable } from "./affiliates.js";
import { paymentsTable } from "./payments.js";
import { affiliatePayoutsTable } from "./affiliatePayouts.js";

// One row per REAL, CONFIRMED deposit that had an affiliate attached —
// created at most once per deposit_id (enforced by the unique index below,
// the same onConflictDoNothing-on-unique-constraint idempotency pattern
// already used by ledger_entries.idempotency_key, rather than the spec's
// "SELECT then INSERT" approach, which races under concurrent webhook
// retries). payout_id is set once this commission is claimed by a payout
// request; a commission with payout_id = null and status = 'confirmed' is
// what "available_commission" sums on read.
export const affiliateCommissionsTable = pgTable("affiliate_commissions", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull().references(() => affiliatesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  depositId: integer("deposit_id").notNull().references(() => paymentsTable.id),
  depositAmount: decimal("deposit_amount", { precision: 14, scale: 2 }).notNull(),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull(),
  commissionAmount: decimal("commission_amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("confirmed"), // confirmed | reversed | paid
  payoutId: integer("payout_id").references(() => affiliatePayoutsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => ({
  depositUniqueIdx: uniqueIndex("affiliate_commissions_deposit_id_idx").on(table.depositId),
}));

export type AffiliateCommission = typeof affiliateCommissionsTable.$inferSelect;
