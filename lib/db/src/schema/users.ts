import { pgTable, text, serial, timestamp, decimal, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { output } from "zod/v4/core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  withdrawalHoldBalance: decimal("withdrawal_hold_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  freebetBalance: decimal("freebet_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  // Casino-only free spins, tracked as a count — never merged into `balance`.
  // Replaces the old first-deposit freebet (see firstDepositGranted below):
  // freebets only ever worked against BET62's own native sportsbook engine,
  // never through the WinHouse iframe, so the deposit-triggered welcome
  // bonus now grants these instead, redeemable only in the casino where
  // BET62 fully controls the BigBang seamless-wallet debit/credit webhook.
  casinoBonusSpinsRemaining: integer("casino_bonus_spins_remaining").notNull().default(0),
  nif: text("nif"),
  withdrawalIban: text("withdrawal_iban"),
  withdrawalName: text("withdrawal_name"),
  selfExcludedUntil: timestamp("self_excluded_until", { withTimezone: true }),
  kycStatus: text("kyc_status").default("not_submitted"),
  kycDocumentType: text("kyc_document_type"),
  kycDocumentNumber: text("kyc_document_number"),
  kycSubmittedAt: timestamp("kyc_submitted_at", { withTimezone: true }),
  firstDepositGranted: text("first_deposit_granted").default("none"),
  // "production" | "demo" — which provider set (WinHouse/BigBang LIVE vs
  // DEMO/Sandbox) and wallet this account uses. Only an admin can change
  // this post-registration (see PATCH /api/admin/users/:id/environment);
  // the frontend must never be trusted to set it directly (Santos, 2026-09-30).
  environment: text("environment").notNull().default("production"),
  // Not a Drizzle .references() FK to affiliates — affiliates.userId already
  // references users.id, and Drizzle table definitions can't reference each
  // other both ways without a circular module import between users.ts and
  // affiliates.ts. Validated at the application layer instead (the affiliate
  // lookup in POST /register only ever writes an id that came from a real
  // affiliates row). The DB-level FK still exists via init.ts's ALTER TABLE.
  affiliateId: integer("affiliate_id"),
  affiliateCode: text("affiliate_code"),
  // version: serial("version"), // Uncomment after running migration
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = output<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
