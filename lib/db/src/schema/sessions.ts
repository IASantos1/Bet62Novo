import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

// Session-lock + WebAuthn auth (lib/sessions.ts owns all reads/writes to
// this table — no route should touch it directly). id is the SHA-256 hex
// digest of the random opaque token stored in the bet62_session cookie,
// never the raw token itself — a DB-only leak (backup, replica, stray log
// line) can't be replayed as a working session credential this way, same
// principle as never storing a password in plaintext.
export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // active | locked | revoked
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // SHA-256 hash of the bet62_refresh cookie value, same reasoning as id.
    refreshTokenHash: text("refresh_token_hash"),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
  },
  (table) => ({
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
    refreshTokenHashIdx: index("sessions_refresh_token_hash_idx").on(table.refreshTokenHash),
  }),
);

export type Session = typeof sessionsTable.$inferSelect;
