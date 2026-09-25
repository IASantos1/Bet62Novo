import crypto from "node:crypto";
import { db } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { kvCache } from "../services/cache/kvCache.js";
import { deriveCsrfToken } from "./csrf.js";
// Imported by relative path, not the "@workspace/db"/"@workspace/db/schema"
// alias — tsc's alias-based module resolution here doesn't pick up
// newly-added schema exports within a single typecheck run (same quirk
// hit shipping featuredMatchBanners.ts). A direct relative import always
// sees current exports; not a runtime issue either way.
import { sessionsTable, type Session } from "../../../../lib/db/src/schema/sessions.js";

const AUTH_IDLE_TIMEOUT_SECONDS = Number(process.env.AUTH_IDLE_TIMEOUT_SECONDS) || 900;
const AUTH_SESSION_MAX_AGE_SECONDS = Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS) || 43_200;
const AUTH_REFRESH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS) || 2_592_000;

// Read-through cache in front of Postgres — deliberately short-lived
// (well under the 30s activity-touch throttle window) so a missed
// explicit cache-bust on lock/revoke/rotate self-heals fast rather than
// leaving a stale "active" read live for long. Postgres is always the
// fallback and the source of truth for the session row itself: unlike
// kvCache's other callers (rate limits, WebAuthn challenges), losing a
// session to a container restart or having one instance not see another
// instance's revoke would be a real security bug, not just a slower path.
const SESSION_CACHE_TTL_SECONDS = 30;

export type SessionStatus = "active" | "locked" | "expired" | "revoked";

export type SessionEvaluation =
  | { status: "active"; session: Session }
  | { status: "locked"; session: Session }
  | { status: "expired" }
  | { status: "revoked" };

function sessionCacheKey(tokenHash: string): string {
  return `session:${tokenHash}`;
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

/** Random 256-bit opaque token + its SHA-256 hash (the hash is what's persisted). */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256Hex(token) };
}

async function cacheSession(session: Session): Promise<void> {
  await kvCache.set(sessionCacheKey(session.id), JSON.stringify(session), SESSION_CACHE_TTL_SECONDS);
}

async function bustSessionCache(tokenHash: string): Promise<void> {
  await kvCache.del(sessionCacheKey(tokenHash));
}

const SESSION_DATE_FIELDS = [
  "createdAt",
  "lastActivityAt",
  "lockedAt",
  "expiresAt",
  "refreshExpiresAt",
  "revokedAt",
] as const;

// JSON.parse leaves Date columns as plain strings — every caller of
// getSession/evaluateSession calls .getTime() on these, so the cached
// copy has to come back exactly as shaped as a fresh DB row.
function reviveSessionDates(raw: Record<string, unknown>): Session {
  for (const field of SESSION_DATE_FIELDS) {
    if (raw[field]) raw[field] = new Date(raw[field] as string);
  }
  return raw as unknown as Session;
}

async function readSession(tokenHash: string): Promise<Session | null> {
  const cached = await kvCache.get(sessionCacheKey(tokenHash));
  if (cached) {
    try {
      return reviveSessionDates(JSON.parse(cached));
    } catch {
      // fall through to Postgres on a corrupt cache entry
    }
  }
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, tokenHash)).limit(1);
  if (row) await cacheSession(row);
  return row ?? null;
}

export async function createSession(
  userId: number,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ sessionToken: string; refreshToken: string; session: Session }> {
  const { token: sessionToken, tokenHash: sessionId } = generateOpaqueToken();
  const { token: refreshToken, tokenHash: refreshTokenHash } = generateOpaqueToken();
  const now = Date.now();

  const [session] = await db
    .insert(sessionsTable)
    .values({
      id: sessionId,
      userId,
      status: "active",
      expiresAt: new Date(now + AUTH_SESSION_MAX_AGE_SECONDS * 1000),
      refreshTokenHash,
      refreshExpiresAt: new Date(now + AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    })
    .returning();

  await cacheSession(session);
  return { sessionToken, refreshToken, session };
}

/**
 * The single decision point used by authMiddleware, GET /session, and the
 * passkey/unlock-password flows. Locking on idle timeout is a lazy
 * transition — noticed and written on whichever request happens to read
 * the session next (a normal API call, or the visibilitychange poll) — so
 * no cron/sweeper job is needed.
 */
export async function evaluateSession(tokenHash: string): Promise<SessionEvaluation> {
  const session = await readSession(tokenHash);
  if (!session) return { status: "expired" };
  if (session.revokedAt || session.status === "revoked") return { status: "revoked" };
  if (session.expiresAt.getTime() <= Date.now()) return { status: "expired" };

  if (session.status === "locked") return { status: "locked", session };

  const idleForMs = Date.now() - session.lastActivityAt.getTime();
  if (idleForMs > AUTH_IDLE_TIMEOUT_SECONDS * 1000) {
    const locked = await lockSession(tokenHash, "idle_timeout");
    return locked ? { status: "locked", session: locked } : { status: "expired" };
  }

  return { status: "active", session };
}

/** Throttled last_activity_at write — at most once every 30s, per spec. */
export async function touchSession(session: Session): Promise<void> {
  const staleForMs = Date.now() - session.lastActivityAt.getTime();
  if (staleForMs < 30_000) return;

  await db
    .update(sessionsTable)
    .set({ lastActivityAt: new Date() })
    .where(
      sql`${sessionsTable.id} = ${session.id} AND ${sessionsTable.lastActivityAt} < now() - interval '30 seconds'`,
    );
  await bustSessionCache(session.id);
}

export async function lockSession(tokenHash: string, _reason: string): Promise<Session | null> {
  const [updated] = await db
    .update(sessionsTable)
    .set({ status: "locked", lockedAt: new Date() })
    .where(eq(sessionsTable.id, tokenHash))
    .returning();
  if (updated) await bustSessionCache(tokenHash);
  return updated ?? null;
}

export async function revokeSession(tokenHash: string, reason: string): Promise<void> {
  await db
    .update(sessionsTable)
    .set({ status: "revoked", revokedAt: new Date(), revokedReason: reason })
    .where(eq(sessionsTable.id, tokenHash));
  await bustSessionCache(tokenHash);
}

/**
 * Never reactivate a locked/old session in place — always revoke it and
 * mint a brand new one. Shared by password-unlock, passkey-unlock, and
 * /refresh, so all three "produce a fresh active session" paths behave
 * identically.
 */
export async function rotateSession(
  oldSession: Session,
  reason: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ sessionToken: string; refreshToken: string; session: Session }> {
  await revokeSession(oldSession.id, reason);
  return createSession(oldSession.userId, meta);
}

/**
 * Validates a refresh token cookie against the session that minted it.
 * A match against an already-revoked-with-reason-"refreshed" row is a
 * replay of a consumed refresh token — the classic stolen-token signal —
 * so the caller should also revoke whatever session superseded it.
 */
export async function findSessionByRefreshToken(refreshToken: string): Promise<Session | null> {
  const refreshTokenHash = hashToken(refreshToken);
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.refreshTokenHash, refreshTokenHash))
    .limit(1);
  return row ?? null;
}

/**
 * Defensive response to a detected refresh-token replay: rather than
 * tracking a rotation chain to find the "one successor session" a stolen
 * token was exchanged for, just kill every session this user currently
 * has — the same blast-radius response as a full password-reset-style
 * lockout, without needing extra schema.
 */
export async function revokeAllUserSessions(userId: number, reason: string): Promise<void> {
  const rows = await db
    .update(sessionsTable)
    .set({ status: "revoked", revokedAt: new Date(), revokedReason: reason })
    .where(sql`${sessionsTable.userId} = ${userId} AND ${sessionsTable.status} != 'revoked'`)
    .returning({ id: sessionsTable.id });
  await Promise.all(rows.map((row) => bustSessionCache(row.id)));
}

export { AUTH_IDLE_TIMEOUT_SECONDS, AUTH_SESSION_MAX_AGE_SECONDS, AUTH_REFRESH_TOKEN_TTL_SECONDS };

// ── Cookies ──────────────────────────────────────────────────────────────────
// Shared by every route that creates/rotates a session (login, register,
// unlock-password, passkey login, refresh) so the three cookies' flags
// never drift out of sync between call sites.

type CookieRes = { cookie: (name: string, value: string, opts: Record<string, unknown>) => void; clearCookie: (name: string, opts?: Record<string, unknown>) => void };

function secureFlag(): boolean {
  return process.env.NODE_ENV === "production";
}

export function setSessionCookies(res: CookieRes, tokens: { sessionToken: string; refreshToken: string }): void {
  const secure = secureFlag();
  res.cookie("bet62_session", tokens.sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS * 1000,
  });
  res.cookie("bet62_refresh", tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api/auth/",
    maxAge: AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  // Deliberately NOT httpOnly — the frontend reads this to attach the
  // X-CSRF-Token header (double-submit-cookie pattern).
  res.cookie("bet62_csrf", deriveCsrfTokenForToken(tokens.sessionToken), {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS * 1000,
  });
}

export function clearSessionCookies(res: CookieRes): void {
  res.clearCookie("bet62_session", { path: "/" });
  res.clearCookie("bet62_refresh", { path: "/api/auth/" });
  res.clearCookie("bet62_csrf", { path: "/" });
}

function deriveCsrfTokenForToken(sessionToken: string): string {
  return deriveCsrfToken(hashToken(sessionToken));
}
