import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger.js";

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
}

export function verifyAuthToken(token: string): { id: number; email: string } {
  // Explicit algorithm allow-list (audit hardening, 2026-08-10) — the
  // jsonwebtoken library already infers/rejects based on key type by
  // default, so this isn't exploitable as-is, but pinning it is standard
  // defense-in-depth a formal security review will expect regardless.
  return jwt.verify(token, SESSION_SECRET as jwt.Secret, {
    algorithms: ["HS256"],
  }) as unknown as { id: number; email: string };
}

// Short-lived, single-purpose token for the open-bet-states SSE stream
// (routes/bets.ts's GET /open-states-stream). EventSource can't set custom
// headers, so the only way to authenticate that connection is a token in
// the URL query string — but the full 7-day session JWT ending up there
// leaks via browser history and any intermediary (proxy/CDN) access logs
// not configured to redact query strings (audit finding, 2026-08-10; this
// app's own pino logger already strips query strings, but upstream infra
// might not). Minting a 5-minute, stream-scoped token instead (fetched via
// a normal authenticated header request, GET /open-states-stream-token)
// bounds the exposure window and blast radius of a leaked URL to just this
// one low-value read-only stream, instead of the full session.
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

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAuthToken(token!);
    req.user = decoded;
    next();
  } catch (err) {
    logger.error({ err }, "JWT verification failed");
    res.status(401).json({ error: "Invalid token" });
  }
};
