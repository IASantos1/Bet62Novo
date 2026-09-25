import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

// WebAuthn (Face ID/Touch ID) credentials, verified server-side via
// @simplewebauthn/server — replaces the old client-only fake biometric
// flow that never sent anything to the backend.
export const userPasskeysTable = pgTable("user_passkeys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").notNull().default(false),
  transports: jsonb("transports"),
  // Label only — hooked up in a future "my devices" phase, unused for now.
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export type UserPasskey = typeof userPasskeysTable.$inferSelect;
