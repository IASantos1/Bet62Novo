import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

// User-facing security event log (login/lock/unlock/passkey events) —
// distinct from admin_audit_log (schema/adminAuditLog.ts), which is
// keyed by admin username, not a user FK, and covers admin actions only.
export const securityAuditLogTable = pgTable(
  "security_audit_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    // Deliberately not an FK — the session row may already be rotated/gone
    // by the time this log row is queried.
    sessionId: text("session_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("security_audit_log_user_id_idx").on(table.userId),
  }),
);

export type SecurityAuditLog = typeof securityAuditLogTable.$inferSelect;
