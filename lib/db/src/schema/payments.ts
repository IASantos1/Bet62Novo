import { pgTable, text, serial, timestamp, integer, decimal } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Payment = typeof paymentsTable.$inferSelect;
