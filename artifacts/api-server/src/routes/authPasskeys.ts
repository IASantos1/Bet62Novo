import { Router, type IRouter, type Request, type Response } from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { csrfProtection } from "../middlewares/csrf.js";
import { authMiddleware, requireLockableSession, type AuthRequest } from "../middlewares/auth.js";
import { kvCache } from "../services/cache/kvCache.js";
import { rotateSession, setSessionCookies } from "../lib/sessions.js";
import { logSecurityEvent } from "../lib/securityAudit.js";
// Relative import — see sessions.ts's comment for why (tsc alias-resolution
// quirk for newly-added schema exports).
import { userPasskeysTable } from "../../../../lib/db/src/schema/userPasskeys.js";

const router: IRouter = Router();
router.use(csrfProtection);

const CHALLENGE_TTL_SECONDS = 120;

function webauthnConfig(): { rpName: string; rpID: string; origin: string } {
  const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || "BET62";
  const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  let fallbackHost = "localhost";
  let fallbackOrigin = "http://localhost:5173";
  if (publicSiteUrl) {
    try {
      const parsed = new URL(publicSiteUrl);
      fallbackHost = parsed.hostname;
      fallbackOrigin = publicSiteUrl;
    } catch {
      // ignore malformed PUBLIC_SITE_URL, keep localhost fallback
    }
  }
  const rpID = process.env.WEBAUTHN_RP_ID?.trim() || fallbackHost;
  const origin = process.env.WEBAUTHN_ORIGIN?.trim() || fallbackOrigin;
  return { rpName, rpID, origin };
}

function registerChallengeKey(userId: number): string {
  return `webauthn:register:${userId}`;
}

// Keyed by the session's own hash rather than userId, so a user unlocking
// several sessions/browsers at once doesn't clobber one challenge with
// another.
function loginChallengeKey(sessionId: string): string {
  return `webauthn:login:${sessionId}`;
}

function publicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    balance: user.balance,
    freebetBalance: user.freebetBalance,
  };
}

function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return { ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

// ── Registration (enrolling a new passkey — active session only) ───────────

router.post("/passkey/register/options", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rpName, rpID } = webauthnConfig();
    const existing = await db.select().from(userPasskeysTable).where(eq(userPasskeysTable.userId, req.user!.id));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: req.user!.email,
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: Array.isArray(p.transports) ? (p.transports as string[]) : undefined,
      })),
      // "discouraged" + "platform": goes straight to Face ID/Touch ID.
      // "preferred" residentKey makes Safari treat this as a synced
      // iCloud Keychain passkey and always route through its full
      // account-chooser UI instead — kept from the previous (fake)
      // ceremony's own hard-won discovery of this.
      authenticatorSelection: {
        residentKey: "discouraged",
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
    });

    await kvCache.set(registerChallengeKey(req.user!.id), options.challenge, CHALLENGE_TTL_SECONDS);
    res.json(options);
  } catch (err) {
    logger.error({ err }, "Passkey register/options error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/passkey/register/verify", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const response = req.body as RegistrationResponseJSON;
  try {
    const { rpID, origin } = webauthnConfig();
    const expectedChallenge = await kvCache.get(registerChallengeKey(req.user!.id));
    if (!expectedChallenge) {
      res.status(400).json({ error: "Challenge expired or missing — try again." });
      return;
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified) {
      res.status(400).json({ error: "Verification failed" });
      return;
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await db.insert(userPasskeysTable).values({
      userId: req.user!.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports ?? [],
    });

    await kvCache.del(registerChallengeKey(req.user!.id));
    await logSecurityEvent({ userId: req.user!.id, event: "passkey_registered", sessionId: req.session!.id, ...requestMeta(req) });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Passkey register/verify error");
    res.status(400).json({ error: "Verification failed" });
  }
});

// ── Login/unlock (works against an active OR locked session) ───────────────

const passkeyLoginRateLimit = rateLimit({
  name: "auth-passkey-login",
  windowMs: 15 * 60_000,
  max: 20,
  message: "Muitas tentativas de autenticação biométrica.",
});

router.post(
  "/passkey/login/options",
  passkeyLoginRateLimit,
  requireLockableSession,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { rpID } = webauthnConfig();
      const passkeys = await db.select().from(userPasskeysTable).where(eq(userPasskeysTable.userId, req.user!.id));
      if (passkeys.length === 0) {
        res.status(400).json({ error: "NO_PASSKEY" });
        return;
      }

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: passkeys.map((p) => ({
          id: p.credentialId,
          transports: Array.isArray(p.transports) ? (p.transports as string[]) : undefined,
        })),
        userVerification: "required",
      });

      await kvCache.set(loginChallengeKey(req.session!.id), options.challenge, CHALLENGE_TTL_SECONDS);
      res.json(options);
    } catch (err) {
      logger.error({ err }, "Passkey login/options error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/passkey/login/verify",
  passkeyLoginRateLimit,
  requireLockableSession,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const response = req.body as AuthenticationResponseJSON;
    const meta = requestMeta(req);
    try {
      const { rpID, origin } = webauthnConfig();
      const expectedChallenge = await kvCache.get(loginChallengeKey(req.session!.id));
      if (!expectedChallenge) {
        res.status(400).json({ error: "Challenge expired or missing — try again." });
        return;
      }

      const [passkey] = await db
        .select()
        .from(userPasskeysTable)
        .where(and(eq(userPasskeysTable.credentialId, response.id), eq(userPasskeysTable.userId, req.user!.id)))
        .limit(1);
      if (!passkey) {
        res.status(401).json({ error: "Unknown credential" });
        return;
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: Buffer.from(passkey.publicKey, "base64url"),
          counter: passkey.counter,
          transports: Array.isArray(passkey.transports) ? (passkey.transports as string[]) : undefined,
        },
        requireUserVerification: true,
      });

      // Most platform authenticators (Face ID/Touch ID) legitimately
      // report 0 and never increment — only flag a regression when the
      // authenticator actually does track a nonzero counter.
      const { newCounter } = verification.authenticationInfo;
      if (verification.verified && newCounter !== 0 && newCounter <= passkey.counter) {
        await logSecurityEvent({
          userId: req.user!.id,
          event: "login_failed",
          sessionId: req.session!.id,
          ...meta,
          metadata: { reason: "passkey_counter_replay_suspected" },
        });
        res.status(401).json({ error: "Verification failed" });
        return;
      }

      if (!verification.verified) {
        res.status(401).json({ error: "Verification failed" });
        return;
      }

      await db
        .update(userPasskeysTable)
        .set({ counter: newCounter, lastUsedAt: new Date() })
        .where(eq(userPasskeysTable.id, passkey.id));
      await kvCache.del(loginChallengeKey(req.session!.id));

      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
      if (!user) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }

      const { sessionToken, refreshToken, session } = await rotateSession(req.session!, "unlocked", meta);
      setSessionCookies(res, { sessionToken, refreshToken });
      await logSecurityEvent({ userId: user.id, event: "session_unlocked_passkey", sessionId: session.id, ...meta });

      res.json({ status: "ACTIVE", user: publicUser(user) });
    } catch (err) {
      logger.error({ err }, "Passkey login/verify error");
      res.status(401).json({ error: "Verification failed" });
    }
  },
);

export default router;
