import { pgTable, text, serial, timestamp, integer, decimal, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  kind: text("kind").notNull(),
  refType: text("ref_type"),
  refId: text("ref_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
