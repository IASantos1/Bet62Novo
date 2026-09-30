import { pgTable, text, serial, timestamp, decimal, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

// A promoter/affiliate identity — independent of any login. `userId` is an
// optional link to a `users` row (typically that promoter's own DEMO
// account, per the "conta DEMO para promotores" requirement) so they can
// authenticate and see their own dashboard at GET /api/affiliate/dashboard;
// an affiliate created without a linked user simply has no self-service
// dashboard yet (still fully usable from the admin panel).
//
// Deliberately no denormalized totals (total_users/total_deposits/
// total_commission/available_commission/paid_commission) despite the
// original spec listing them as columns — those are all derivable by
// aggregating users/affiliate_commissions/affiliate_payouts on read, and a
// denormalized running counter is a durable source of drift bugs (a missed
// update path silently desyncs it from the real ledger of commissions).
// The dashboard/admin queries compute these live instead.
export const affiliatesTable = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  name: text("name").notNull(),
  email: text("email").unique(),
  code: text("code").notNull().unique(),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
  status: text("status").notNull().default("active"), // active | inactive
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Affiliate = typeof affiliatesTable.$inferSelect;
