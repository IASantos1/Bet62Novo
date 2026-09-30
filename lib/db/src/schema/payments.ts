import { pgTable, text, serial, timestamp, integer, decimal } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(), // multibanco | mbway | card
  status: text("status").notNull().default("pending"), // pending | completed | failed
  entity: text("entity"),
  reference: text("reference"),
  requestId: text("request_id"),
  paymentUrl: text("payment_url"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // Not a Drizzle FK to affiliates, same reasoning as users.affiliateId in
  // users.ts (avoids a circular module import) — the real FK constraint
  // still exists in the database via init.ts.
  affiliateId: integer("affiliate_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Payment = typeof paymentsTable.$inferSelect;
