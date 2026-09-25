import { type Request, type Response, type NextFunction } from "express";
import { deriveCsrfToken } from "../lib/csrf.js";
import { hashToken } from "../lib/sessions.js";
import { timingSafeEqualString } from "../lib/security.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Double-submit-cookie CSRF check, scoped to the /auth router only for
// this phase (see plan: rolling this out to the rest of the app's many
// individual fetch() call sites is a tracked follow-up, not silently
// assumed done). Keys off cookie presence rather than a route allowlist:
// a request with no bet62_session cookie has no session to forge into
// (this is what naturally exempts /login, /register and any
// server-to-server webhook), and a request that does carry one must also
// carry a matching X-CSRF-Token header.
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const sessionToken = req.cookies?.bet62_session as string | undefined;
  if (!sessionToken) {
    next();
    return;
  }

  const header = req.headers["x-csrf-token"];
  const expected = deriveCsrfToken(hashToken(sessionToken));
  if (typeof header !== "string" || !timingSafeEqualString(header, expected)) {
    res.status(403).json({ error: "CSRF_TOKEN_INVALID" });
    return;
  }

  next();
}
