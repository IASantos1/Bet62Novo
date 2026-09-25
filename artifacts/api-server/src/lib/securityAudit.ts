import { db } from "@workspace/db";
// Relative import, not the "@workspace/db" alias — see sessions.ts's
// comment for why (tsc alias-resolution quirk for newly-added exports).
import { securityAuditLogTable } from "../../../../lib/db/src/schema/securityAuditLog.js";
import { logger } from "./logger.js";

export type SecurityEvent =
  | "login_success"
  | "login_failed"
  | "register"
  | "logout"
  | "session_locked"
  | "session_unlocked_password"
  | "session_unlocked_passkey"
  | "passkey_registered"
  | "refresh_rotated"
  | "refresh_reuse_detected";

// Never pass password/secret material in metadata — this is a durable,
// queryable log, not a debug trace.
export async function logSecurityEvent(args: {
  userId: number;
  event: SecurityEvent;
  sessionId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(securityAuditLogTable).values({
      userId: args.userId,
      event: args.event,
      sessionId: args.sessionId ?? null,
      ip: args.ip ?? null,
      userAgent: args.userAgent ?? null,
      metadata: (args.metadata ?? null) as never,
    });
  } catch (err) {
    // Never let an audit-log failure break the auth flow it's logging.
    logger.error({ err, event: args.event }, "Failed to write security audit log");
  }
}
