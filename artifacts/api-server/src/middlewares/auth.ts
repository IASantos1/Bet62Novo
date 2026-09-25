import { type Request, type Response, type NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import { logger } from "../lib/logger.js";
import { evaluateSession, hashToken, touchSession } from "../lib/sessions.js";
import type { Session } from "../../../../lib/db/src/schema/sessions.js";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error(
    "[SECURITY] SESSION_SECRET environment variable is not set. " +
      "The server refuses to start without a JWT secret. " +
      "Set SESSION_SECRET in your deployment configuration.",
  );
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
  session?: Session;
}

// Short-lived, single-purpose token for the open-bet-states SSE stream
// (routes/bets.ts's GET /open-states-stream). EventSource can't set custom
// headers, so the only way to authenticate that connection is a token in
// the URL query string — unaffected by the session-cookie migration below,
// left exactly as-is.
const OPEN_BET_STREAM_TOKEN_PURPOSE = "open-states-stream";

export function mintOpenBetStreamToken(user: { id: number; email: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, purpose: OPEN_BET_STREAM_TOKEN_PURPOSE },
    SESSION_SECRET as jwt.Secret,
    { expiresIn: "5m" },
  );
}

export function verifyOpenBetStreamToken(token: string): { id: number; email: string } {
  const decoded = jwt.verify(token, SESSION_SECRET as jwt.Secret, {
    algorithms: ["HS256"],
  }) as unknown as { id: number; email: string; purpose?: string };
  if (decoded.purpose !== OPEN_BET_STREAM_TOKEN_PURPOSE) {
    throw new Error("Token not valid for this purpose");
  }
  return { id: decoded.id, email: decoded.email };
}

async function loadUserForSession(userId: number): Promise<{ id: number; email: string } | null> {
  const { db, usersTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user ?? null;
}

// Reads the bet62_session cookie and consults the real, server-side
// session record (lib/sessions.ts) — replaces the old pure jwt.verify()
// check, which never queried the DB and had no way to revoke or lock a
// session. `req.user` keeps the exact same { id, email } shape as before
// so the many existing route files that destructure it don't need to
// change. A locked session gets its own 401 code (SESSION_LOCKED) rather
// than the generic one, since the frontend needs to tell "show the lock
// screen" apart from "you're logged out."
export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const sessionToken = req.cookies?.bet62_session as string | undefined;
  if (!sessionToken) {
    res.status(401).json({ error: "Missing session" });
    return;
  }

  try {
    const evaluation = await evaluateSession(hashToken(sessionToken));
    if (evaluation.status === "locked") {
      res.status(401).json({ error: "SESSION_LOCKED" });
      return;
    }
    if (evaluation.status !== "active") {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    const user = await loadUserForSession(evaluation.session.userId);
    if (!user) {
      res.status(401).json({ error: "Invalid session" });
      return;
    }

    await touchSession(evaluation.session);
    req.user = user;
    req.session = evaluation.session;
    next();
  } catch (err) {
    logger.error({ err }, "Session verification failed");
    res.status(401).json({ error: "Invalid session" });
  }
};

// Accepts either an active OR a locked session — used only by the small
// set of endpoints that must work while the user is locked out: logging
// out entirely ("forget this device"), and the two unlock ceremonies
// (password, passkey). Never accepts expired/revoked — those still need
// a full /login.
export const requireLockableSession = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const sessionToken = req.cookies?.bet62_session as string | undefined;
  if (!sessionToken) {
    res.status(401).json({ error: "Missing session" });
    return;
  }

  try {
    const evaluation = await evaluateSession(hashToken(sessionToken));
    if (evaluation.status !== "active" && evaluation.status !== "locked") {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    const user = await loadUserForSession(evaluation.session.userId);
    if (!user) {
      res.status(401).json({ error: "Invalid session" });
      return;
    }

    req.user = user;
    req.session = evaluation.session;
    next();
  } catch (err) {
    logger.error({ err }, "Session verification failed");
    res.status(401).json({ error: "Invalid session" });
  }
};
