// GOAL API webhook signature verification. The provider signs every
// delivery with `X-Goal-Signature: t=<unix-seconds>,v1=<hex-hmac>`, where
// v1 = HMAC-SHA256(endpoint_secret, `${t}.${rawBody}`) — same construction
// as Stripe's, and documented with the identical security rationale: this
// endpoint's URL isn't a secret (it shows up in logs/proxies), so anyone
// who finds it could POST fabricated events without this check. Verify
// against the RAW request body (before any JSON re-serialization) exactly
// like the existing Stripe/casino webhook handlers in app.ts — the route
// wiring in app.ts must register this with express.raw(), not express.json().
import crypto from "node:crypto";
import { timingSafeEqualString } from "../../lib/security.js";

const MAX_CLOCK_SKEW_SECONDS = 300;

export type GoalApiWebhookVerifyResult =
  | { valid: true }
  | { valid: false; reason: "missing_header" | "malformed_header" | "bad_signature" | "stale_timestamp" };

export function verifyGoalApiSignature(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  secret: string,
): GoalApiWebhookVerifyResult {
  if (!secret || typeof signatureHeader !== "string" || !signatureHeader) {
    return { valid: false, reason: "missing_header" };
  }
  const parts: Record<string, string> = {};
  for (const piece of signatureHeader.split(",")) {
    const eq = piece.indexOf("=");
    if (eq === -1) continue;
    parts[piece.slice(0, eq).trim()] = piece.slice(eq + 1).trim();
  }
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return { valid: false, reason: "malformed_header" };

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody.toString("utf8")}`).digest("hex");
  if (!timingSafeEqualString(expected, v1)) {
    return { valid: false, reason: "bad_signature" };
  }

  const nowSeconds = Date.now() / 1000;
  const tSeconds = Number(t);
  if (!Number.isFinite(tSeconds) || Math.abs(nowSeconds - tSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "stale_timestamp" };
  }

  return { valid: true };
}

export type GoalApiWebhookEvent =
  | { event: "match.started"; data: { fixtureId: string } }
  | { event: "match.finished"; data: { fixtureId: string } }
  | { event: "goal.scored"; data: { fixtureId: string; team: "home" | "away"; homeScore: number; awayScore: number } }
  | { event: "score.changed"; data: { fixtureId: string; homeScore: number; awayScore: number } }
  | { event: "match.status_changed"; data: { fixtureId: string; status: string } };

export function parseGoalApiWebhookBody(rawBody: Buffer): GoalApiWebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody.toString("utf8"));
    if (!parsed || typeof parsed.event !== "string" || !parsed.data) return null;
    return parsed as GoalApiWebhookEvent;
  } catch {
    return null;
  }
}
