import { pgTable, text, serial, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  withdrawalHoldBalance: decimal("withdrawal_hold_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  freebetBalance: decimal("freebet_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  nif: text("nif"),
  withdrawalIban: text("withdrawal_iban"),
  withdrawalName: text("withdrawal_name"),
  selfExcludedUntil: timestamp("self_excluded_until", { withTimezone: true }),
  kycStatus: text("kyc_status").default("not_submitted"),
  kycDocumentType: text("kyc_document_type"),
  kycDocumentNumber: text("kyc_document_number"),
  kycSubmittedAt: timestamp("kyc_submitted_at", { withTimezone: true }),
  firstDepositGranted: text("first_deposit_granted").default("none"),
  version: serial("version"), // Optional for now, will be not null after migration
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
