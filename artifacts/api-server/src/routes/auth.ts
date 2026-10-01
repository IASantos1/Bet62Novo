import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, adminAuditLogTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { CONFIG } from "../lib/config.js";
import { applyFreebetBalanceDelta, applyDemoBalanceDelta } from "../lib/ledger.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { csrfProtection } from "../middlewares/csrf.js";
import { authMiddleware, requireLockableSession, type AuthRequest } from "../middlewares/auth.js";
import {
  createSession,
  evaluateSession,
  findSessionByRefreshToken,
  hashToken,
  lockSession,
  revokeAllUserSessions,
  revokeSession,
  rotateSession,
  setSessionCookies,
  clearSessionCookies,
  touchSession,
} from "../lib/sessions.js";
import { logSecurityEvent } from "../lib/securityAudit.js";
import { kvCache } from "../services/cache/kvCache.js";
// Relative import — see sessions.ts's comment for why (tsc alias-resolution
// quirk for newly-added schema exports).
import { userPasskeysTable } from "../../../../lib/db/src/schema/userPasskeys.js";
import { affiliatesTable } from "../../../../lib/db/src/schema/affiliates.js";

const router: IRouter = Router();

async function userHasPasskey(userId: number): Promise<boolean> {
  const [row] = await db.select({ id: userPasskeysTable.id }).from(userPasskeysTable).where(eq(userPasskeysTable.userId, userId)).limit(1);
  return !!row;
}

const registerRateLimit = rateLimit({
  name: "auth-register",
  windowMs: 60 * 60_000,
  max: 10,
  message: "Muitas tentativas de registo. Tente novamente mais tarde.",
});

const loginRateLimit = rateLimit({
  name: "auth-login",
  windowMs: 15 * 60_000,
  max: 10,
  message: "Muitas tentativas de login. Tente novamente mais tarde.",
});

// A new brute-force surface: /session/unlock-password is a second way to
// try a password against an account, distinct from /login — it needs its
// own limiter or it would be an unlimited guessing endpoint.
const unlockPasswordRateLimit = rateLimit({
  name: "auth-unlock-password",
  windowMs: 15 * 60_000,
  max: 10,
  message: "Muitas tentativas de desbloqueio. Tente novamente mais tarde.",
});

const refreshRateLimit = rateLimit({
  name: "auth-refresh",
  windowMs: 15 * 60_000,
  max: 30,
  message: "Muitos pedidos de renovação de sessão.",
});

// Per-account lockout, distinct from loginRateLimit above (which is a
// generic per-IP throttle at a much higher ceiling). This tracks wrong
// PASSWORDS against one specific, existing account regardless of source
// IP — three wrong passwords locks that account's password login for 3
// minutes (Santos, 2026-09-30). Only counted once the email is confirmed
// to belong to a real account (see the call site), so this never reveals
// which emails exist — a guess against a nonexistent email still just
// gets the generic "Invalid credentials", governed only by the per-IP
// limiter above.
const PASSWORD_LOGIN_FAIL_LIMIT = 3;
const PASSWORD_LOGIN_LOCKOUT_SECONDS = 3 * 60;

function loginFailCountKey(email: string): string {
  return `auth:login-fail-count:${email}`;
}
function loginLockedUntilKey(email: string): string {
  return `auth:login-locked-until:${email}`;
}

// CSRF is scoped to this router only for this phase — see middlewares/csrf.ts.
// Naturally exempts /login and /register since neither request carries a
// bet62_session cookie yet.
router.use(csrfProtection);

function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return { ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

function publicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    balance: user.balance,
    freebetBalance: user.freebetBalance,
    environment: user.environment,
    demoBalance: user.demoBalance,
  };
}

export function validatePortugueseNif(nif: string): boolean {
  const digits = (nif ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  if (!["1","2","3","5","6","7","8","9"].includes(digits[0]!)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(digits[i]!) * (9 - i);
  const rem = sum % 11;
  const check = rem < 2 ? 0 : 11 - rem;
  return check === parseInt(digits[8]!);
}

const AFFILIATE_COOKIE_NAME = "bet62_affiliate";

// Resolves the affiliate code captured in the bet62_affiliate cookie (set
// client-side on ?ref=CODE landings — see rememberedLogin.ts's sibling for
// the pattern) against a real, active affiliates row. A missing/unknown/
// inactive code is never an error — registration proceeds referral-less,
// exactly as if no ?ref= had ever been present (Santos, 2026-09-30).
async function resolveAffiliateFromCookie(
  req: Request,
): Promise<{ id: number; code: string } | null> {
  const raw = req.cookies?.[AFFILIATE_COOKIE_NAME];
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!code) return null;
  const [affiliate] = await db
    .select({ id: affiliatesTable.id, code: affiliatesTable.code, status: affiliatesTable.status })
    .from(affiliatesTable)
    .where(eq(affiliatesTable.code, code))
    .limit(1);
  if (!affiliate || affiliate.status !== "active") return null;
  return { id: affiliate.id, code: affiliate.code };
}

router.post("/register", registerRateLimit, async (req, res): Promise<void> => {
  const { name, password, nif } = req.body as { name?: string; email?: string; password?: string; nif?: string };
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : undefined;

  if (!name || !email || !password) {
    res.status(400).json({ error: "Missing name, email or password" });
    return;
  }

  // Confirmed via audit (2026-08-10): previously only checked truthiness,
  // so a 1-character password ("a") was accepted and hashed — a material
  // account-takeover weakness on a real-money platform, especially
  // combined with credential stuffing. Minimum length only (not a
  // composition rule like "must contain a symbol") — length is the
  // strongest single predictor of resistance to brute force, and
  // composition rules are known (NIST 800-63B) to push users toward
  // predictable patterns instead of actually stronger passwords.
  if (password.length < 8) {
    res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres" });
    return;
  }

  // Basic format check (not exhaustive RFC 5322 validation) — catches
  // obviously malformed addresses before they're stored and silently
  // break transactional email delivery (KYC correspondence, password
  // resets, settlement notifications).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Email inválido" });
    return;
  }

  const nifClean = (nif ?? "").replace(/\s/g, "");
  // Optional NIF: if provided, validate it
  if (nifClean && !validatePortugueseNif(nifClean)) {
    res.status(400).json({ error: "NIF inválido. Insira um NIF português válido com 9 dígitos." });
    return;
  }

  try {
    const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existingUser.length > 0) {
      res.status(400).json({ error: "Email already registered" });
      return;
    }

    // Cost 12 (was 10) — bumped per audit recommendation (2026-08-10) for a
    // real-money/regulated platform; 10 is an acceptable minimum per
    // current OWASP guidance but not future-proofed.
    const passwordHash = await bcrypt.hash(password, 12);
    const affiliate = await resolveAffiliateFromCookie(req);
    const [user] = await db.insert(usersTable).values({
      name,
      email,
      passwordHash,
      nif: nifClean || null,
      affiliateId: affiliate?.id ?? null,
      affiliateCode: affiliate?.code ?? null,
      balance: "0.00",
      freebetBalance: "0.00",
    }).returning();

    const meta = requestMeta(req);
    const { sessionToken, refreshToken, session } = await createSession(user.id, meta);
    setSessionCookies(res, { sessionToken, refreshToken });
    await logSecurityEvent({ userId: user.id, event: "register", sessionId: session.id, ...meta });

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    logger.error({ err }, "Registration error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Self-service demo signup — the only place in the codebase allowed to set
// environment: "demo" on a fresh insert. Deliberately separate from
// /register rather than a body flag on it: keeps the real registration
// endpoint's contract exactly as-is (no client-declared environment ever
// reaches it) and makes every demo account's origin unambiguous in an
// audit trail. No NIF/KYC — demo accounts never touch real money (deposits/
// withdrawals are rejected server-side, see routes/payments.ts and
// routes/withdrawals.ts) and never carry affiliate attribution (a demo
// signup is not a real referral, and payments.ts already only pays
// commission on environment="production" deposits).
router.post("/register-demo", registerRateLimit, async (req, res): Promise<void> => {
  const { name, password } = req.body as { name?: string; email?: string; password?: string };
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : undefined;

  if (!name || !email || !password) {
    res.status(400).json({ error: "Missing name, email or password" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Email inválido" });
    return;
  }

  try {
    const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existingUser.length > 0) {
      res.status(400).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const startingBalance = CONFIG.DEMO_STARTING_BALANCE.toFixed(2);

    const user = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(usersTable)
        .values({
          name,
          email,
          passwordHash,
          environment: "demo",
          balance: "0.00",
          freebetBalance: "0.00",
          demoBalance: "0.00",
        })
        .returning();
      if (!inserted) throw new Error("insert failed");

      await applyDemoBalanceDelta(tx, {
        userId: inserted.id,
        amount: startingBalance,
        kind: "demo_signup_bonus",
        idempotencyKey: `demo-signup:${inserted.id}`,
      });

      await tx.insert(adminAuditLogTable).values({
        action: "demo_user_registered",
        adminUser: "system",
        targetType: "user",
        targetId: String(inserted.id),
        details: { environment: "demo", startingBalance },
        ip: req.ip ?? null,
      });

      const [withBalance] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, inserted.id))
        .limit(1);
      return withBalance!;
    });

    const meta = requestMeta(req);
    const { sessionToken, refreshToken, session } = await createSession(user.id, meta);
    setSessionCookies(res, { sessionToken, refreshToken });
    await logSecurityEvent({ userId: user.id, event: "register_demo", sessionId: session.id, ...meta });

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    logger.error({ err }, "Demo registration error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", loginRateLimit, async (req, res): Promise<void> => {
  const { password } = req.body;
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : undefined;

  if (!email || !password) {
    res.status(400).json({ error: "Missing email or password" });
    return;
  }

  const meta = requestMeta(req);
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const lockedUntil = Number((await kvCache.get(loginLockedUntilKey(email))) ?? 0);
    if (lockedUntil > Date.now()) {
      const retryAfterSeconds = Math.ceil((lockedUntil - Date.now()) / 1000);
      res.status(429).json({
        error: "ACCOUNT_LOCKED",
        message: `Demasiadas tentativas erradas. Tente novamente em ${Math.ceil(retryAfterSeconds / 60)} minuto(s).`,
        retryAfterSeconds,
      });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await logSecurityEvent({ userId: user.id, event: "login_failed", ...meta });

      const fails = Number((await kvCache.get(loginFailCountKey(email))) ?? 0) + 1;
      if (fails >= PASSWORD_LOGIN_FAIL_LIMIT) {
        await kvCache.set(
          loginLockedUntilKey(email),
          String(Date.now() + PASSWORD_LOGIN_LOCKOUT_SECONDS * 1000),
          PASSWORD_LOGIN_LOCKOUT_SECONDS,
        );
        await kvCache.del(loginFailCountKey(email));
        await logSecurityEvent({ userId: user.id, event: "login_locked", ...meta });
        res.status(429).json({
          error: "ACCOUNT_LOCKED",
          message: `Demasiadas tentativas erradas. Tente novamente em ${Math.ceil(PASSWORD_LOGIN_LOCKOUT_SECONDS / 60)} minuto(s).`,
          retryAfterSeconds: PASSWORD_LOGIN_LOCKOUT_SECONDS,
        });
        return;
      }
      await kvCache.set(loginFailCountKey(email), String(fails), PASSWORD_LOGIN_LOCKOUT_SECONDS);
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    await kvCache.del(loginFailCountKey(email));
    await kvCache.del(loginLockedUntilKey(email));

    const { sessionToken, refreshToken, session } = await createSession(user.id, meta);
    setSessionCookies(res, { sessionToken, refreshToken });
    await logSecurityEvent({ userId: user.id, event: "login_success", sessionId: session.id, ...meta });

    res.json({ user: publicUser(user) });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Deliberately not authMiddleware-gated: a locked user still has to be
// able to sign all the way out ("forget this device").
router.post("/logout", requireLockableSession, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await revokeSession(req.session!.id, "logout");
    await logSecurityEvent({ userId: req.user!.id, event: "logout", sessionId: req.session!.id, ...requestMeta(req) });
    clearSessionCookies(res);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Logout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Status-check endpoint, not a protected resource — handles LOCKED/EXPIRED
// itself instead of letting authMiddleware 401 them away. Always HTTP 200.
router.get("/session", async (req: Request, res: Response): Promise<void> => {
  const sessionToken = req.cookies?.bet62_session as string | undefined;
  if (!sessionToken) {
    res.json({ status: "EXPIRED" });
    return;
  }

  try {
    const evaluation = await evaluateSession(hashToken(sessionToken));
    if (evaluation.status === "active") {
      await touchSession(evaluation.session);
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, evaluation.session.userId)).limit(1);
      if (!user) {
        res.json({ status: "EXPIRED" });
        return;
      }
      res.json({
        status: "ACTIVE",
        user: publicUser(user),
        passkeyAvailable: await userHasPasskey(user.id),
      });
      return;
    }
    if (evaluation.status === "locked") {
      const [user] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, evaluation.session.userId))
        .limit(1);
      // Deliberately minimal — no balance/name while locked, that would
      // defeat the point of the lock screen.
      res.json({
        status: "LOCKED",
        email: user?.email ?? null,
        passkeyAvailable: await userHasPasskey(evaluation.session.userId),
      });
      return;
    }
    res.json({ status: "EXPIRED" });
  } catch (err) {
    logger.error({ err }, "Session check error");
    res.json({ status: "EXPIRED" });
  }
});

router.post("/session/lock", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await lockSession(req.session!.id, "explicit");
    await logSecurityEvent({ userId: req.user!.id, event: "session_locked", sessionId: req.session!.id, ...requestMeta(req) });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Session lock error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Real, server-verifying replacement for the old client-only unlock flow,
// which discarded the /login response entirely and (worse) would have let
// the caller pick which account to check the password against via a
// client-supplied email. The account here comes only from the server-known
// locked session — the request body is just { password }.
router.post(
  "/session/unlock-password",
  unlockPasswordRateLimit,
  requireLockableSession,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { password } = req.body as { password?: string };
    if (!password) {
      res.status(400).json({ error: "Missing password" });
      return;
    }

    const meta = requestMeta(req);
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
      if (!user) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        await logSecurityEvent({ userId: user.id, event: "login_failed", sessionId: req.session!.id, ...meta, metadata: { via: "unlock_password" } });
        res.status(401).json({ error: "Palavra-passe incorreta" });
        return;
      }

      const { sessionToken, refreshToken, session } = await rotateSession(req.session!, "unlocked", meta);
      setSessionCookies(res, { sessionToken, refreshToken });
      await logSecurityEvent({ userId: user.id, event: "session_unlocked_password", sessionId: session.id, ...meta });

      res.json({ status: "ACTIVE", user: publicUser(user) });
    } catch (err) {
      logger.error({ err }, "Unlock-password error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post("/refresh", refreshRateLimit, async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.bet62_refresh as string | undefined;
  if (!refreshToken) {
    res.status(401).json({ error: "REFRESH_INVALID" });
    return;
  }

  const meta = requestMeta(req);
  try {
    const session = await findSessionByRefreshToken(refreshToken);
    if (!session) {
      res.status(401).json({ error: "REFRESH_INVALID" });
      return;
    }

    if (session.status === "revoked") {
      // A refresh token that was already consumed once (revokedReason
      // "unlocked"/"refreshed") being presented again is the classic
      // stolen-token-replay signal — kill every session this user has
      // rather than trying to find just the one successor.
      await logSecurityEvent({
        userId: session.userId,
        event: "refresh_reuse_detected",
        sessionId: session.id,
        ...meta,
        metadata: { revokedReason: session.revokedReason },
      });
      await revokeAllUserSessions(session.userId, "refresh_reuse_detected");
      clearSessionCookies(res);
      res.status(401).json({ error: "REFRESH_INVALID" });
      return;
    }

    if (!session.refreshExpiresAt || session.refreshExpiresAt.getTime() <= Date.now()) {
      res.status(401).json({ error: "REFRESH_EXPIRED" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "REFRESH_INVALID" });
      return;
    }

    const rotated = await rotateSession(session, "refreshed", meta);
    setSessionCookies(res, { sessionToken: rotated.sessionToken, refreshToken: rotated.refreshToken });
    await logSecurityEvent({ userId: user.id, event: "refresh_rotated", sessionId: rotated.session.id, ...meta });

    res.json({ status: "ACTIVE", user: publicUser(user) });
  } catch (err) {
    logger.error({ err }, "Refresh error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── WEEKLY CASHBACK CHECK ───────────────────────────────────────────────────
router.get("/cashback", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    // Sum all bets lost in the last 7 days
    const { betsTable } = await import("@workspace/db");
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const lostBets = await db
      .select()
      .from(betsTable)
      .where(
        sql`${betsTable.userId} = ${userId} AND ${betsTable.status} = 'lost' AND ${betsTable.createdAt} >= ${oneWeekAgo}`
      );
    const totalLost = lostBets.reduce((sum, b) => sum + parseFloat(b.stake), 0);
    const cashback = Math.min(100, +(totalLost * 0.10).toFixed(2));
    res.json({ totalLost: +totalLost.toFixed(2), cashback, bets: lostBets.length });
  } catch (err) {
    logger.error({ err }, "Cashback check error");
    res.status(500).json({ error: "Erro ao calcular cashback" });
  }
});

/** ISO-8601 week key, e.g. "2026-W39" — Monday-anchored, matches the
 * standard week numbering most people mean by "semanal". */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ─── WEEKLY CASHBACK CLAIM ────────────────────────────────────────────────────
// The frontend's "RESGATAR" button used to just show a success toast and
// clear local state — it never told the server, so the balance never
// actually moved (real-money bug: user sees "credited" but nothing lands).
// Recomputes the cashback server-side (never trust a client-submitted
// amount for money) and credits it via applyFreebetBalanceDelta, same
// bonus-balance destination the UI already promises ("creditado em saldo
// bónus"). idempotencyKey is scoped to the calendar ISO week, and
// ledgerEntriesTable.idempotencyKey has a real DB-level UNIQUE constraint
// (lib/ledger.ts's insert ... onConflictDoNothing pattern), so a double
// click, a retry, or two tabs open at once can never double-credit —
// the second attempt's insert simply no-ops and the route reports 409.
router.post("/cashback/claim", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { betsTable } = await import("@workspace/db");
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const lostBets = await db
      .select()
      .from(betsTable)
      .where(
        sql`${betsTable.userId} = ${userId} AND ${betsTable.status} = 'lost' AND ${betsTable.createdAt} >= ${oneWeekAgo}`
      );
    const totalLost = lostBets.reduce((sum, b) => sum + parseFloat(b.stake), 0);
    const cashback = Math.min(100, +(totalLost * 0.10).toFixed(2));
    if (cashback <= 0) {
      res.status(400).json({ error: "Ainda não há cashback disponível esta semana." });
      return;
    }

    const weekKey = isoWeekKey(new Date());
    const credited = await db.transaction(async (tx) =>
      applyFreebetBalanceDelta(tx, {
        userId,
        amount: cashback.toFixed(2),
        kind: "cashback_weekly",
        idempotencyKey: `cashback:${userId}:${weekKey}`,
        refType: "cashback",
        refId: weekKey,
        metadata: { totalLost, bets: lostBets.length },
      }),
    );

    if (!credited) {
      res.status(409).json({ error: "O cashback desta semana já foi resgatado." });
      return;
    }

    logger.info({ userId, cashback, weekKey }, "Weekly cashback claimed");
    res.json({ credited: true, amount: cashback });
  } catch (err) {
    logger.error({ err }, "Cashback claim error");
    res.status(500).json({ error: "Erro ao resgatar cashback" });
  }
});

router.get("/me", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      user: {
        ...publicUser(user),
        nif: user.nif,
        withdrawalIban: user.withdrawalIban,
        withdrawalName: user.withdrawalName,
        selfExcludedUntil: user.selfExcludedUntil,
        kycStatus: user.kycStatus,
      }
    });
  } catch (err) {
    logger.error({ err }, "Auth me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
