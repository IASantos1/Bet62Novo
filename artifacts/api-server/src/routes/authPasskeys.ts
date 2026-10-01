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
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { kvCache } from "../services/cache/kvCache.js";
import { createSession, setSessionCookies } from "../lib/sessions.js";
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

// Keyed by the normalized email rather than a session, since login now
// happens with no session yet (Santos, 2026-09-28) — a second concurrent
// login attempt for the same email overwriting the first's challenge is
// an acceptable tradeoff (mirrors registerChallengeKey's one-ceremony-
// per-identity assumption).
function loginChallengeKey(email: string): string {
  return `webauthn:login:${email}`;
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

// ── Login (public, email-scoped — no session required) ─────────────────────
// Idle timeout and "Sair" now both sign the user all the way out (Santos,
// 2026-09-28) instead of leaving a "locked" session to resume, so Face ID
// on the login screen has to be a genuine fresh login: the client sends
// the email remembered on this device (see home.tsx's REMEMBERED_EMAIL_KEY),
// the server looks up that user's passkeys and scopes the WebAuthn
// ceremony to them (avoids Safari's full account-chooser UI — same
// residentKey: "discouraged" reasoning as registration above), and a
// successful verification mints a brand new session via createSession,
// exactly like POST /login does for a password.
const passkeyLoginRateLimit = rateLimit({
  name: "auth-passkey-login",
  windowMs: 15 * 60_000,
  max: 20,
  message: "Muitas tentativas de autenticação biométrica.",
});

function normalizeEmail(raw: unknown): string | null {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return email.length > 0 ? email : null;
}

router.post(
  "/passkey/login/options",
  passkeyLoginRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: "Missing email" });
      return;
    }
    try {
      const { rpID } = webauthnConfig();
      const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
      // Same generic error whether the email doesn't exist or just has no
      // passkey — never confirm which emails are registered.
      const passkeys = user
        ? await db.select().from(userPasskeysTable).where(eq(userPasskeysTable.userId, user.id))
        : [];
      if (!user || passkeys.length === 0) {
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

      await kvCache.set(loginChallengeKey(email), options.challenge, CHALLENGE_TTL_SECONDS);
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
  async (req: Request, res: Response): Promise<void> => {
    const email = normalizeEmail(req.body?.email);
    const response = req.body?.response as AuthenticationResponseJSON | undefined;
    if (!email || !response) {
      res.status(400).json({ error: "Missing email or response" });
      return;
    }
    const meta = requestMeta(req);
    try {
      const { rpID, origin } = webauthnConfig();
      const expectedChallenge = await kvCache.get(loginChallengeKey(email));
      if (!expectedChallenge) {
        res.status(400).json({ error: "Challenge expired or missing — try again." });
        return;
      }

      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (!user) {
        res.status(401).json({ error: "Verification failed" });
        return;
      }

      const [passkey] = await db
        .select()
        .from(userPasskeysTable)
        .where(and(eq(userPasskeysTable.credentialId, response.id), eq(userPasskeysTable.userId, user.id)))
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
          userId: user.id,
          event: "login_failed",
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
      await kvCache.del(loginChallengeKey(email));

      const { sessionToken, refreshToken, session } = await createSession(user.id, meta);
      setSessionCookies(res, { sessionToken, refreshToken });
      await logSecurityEvent({ userId: user.id, event: "session_unlocked_passkey", sessionId: session.id, ...meta });

      res.json({ user: publicUser(user) });
    } catch (err) {
      logger.error({ err }, "Passkey login/verify error");
      res.status(401).json({ error: "Verification failed" });
    }
  },
);

export default router;
