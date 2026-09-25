import crypto from "node:crypto";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error(
    "[SECURITY] SESSION_SECRET environment variable is not set. " +
      "Set SESSION_SECRET in your deployment configuration.",
  );
}

/**
 * Derived, not stored — an HMAC of the session's own id (already a
 * SHA-256 hash of the session token) under the existing SESSION_SECRET.
 * It automatically rotates whenever the session itself rotates (login,
 * refresh, unlock) with no extra column or lookup needed.
 */
export function deriveCsrfToken(sessionId: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET as string).update(sessionId).digest("base64url");
}
