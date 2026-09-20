// PropLine HTTP push webhook (line_movement/resolution/steam/
// market_suspended) — added 2026-09-20. Separate from the outbound
// WebSocket client (websocketClient.ts), which only carries raw
// per-outcome price deltas used to wake the REST re-sync for odds this
// codebase already prices. steam (cross-book sharp-money alerts) and
// market_suspended (another book pulling a market pregame) don't exist on
// that stream at all — this is the only channel for them.
//
// Signature scheme confirmed by reading the real installed `propline` npm
// SDK's own PropLine.verifySignature() source (never trusted from prose
// docs alone, same rule this project has applied to every other PropLine
// claim this session — its own webhookBody() had a real, separate bug for
// the sibling `transport` field): HMAC-SHA256(secret, `${timestamp}.` +
// rawBody), compared against the `X-PropLine-Signature` header in
// constant time, where `${timestamp}` is the `X-PropLine-Timestamp`
// header value. Reimplemented natively here (matching this codebase's own
// GOAL API/Stripe/casino webhook verifiers) rather than depending on the
// `propline` package at runtime — a decision already made for the WS
// client for the same reason (a confirmed real bug elsewhere in that same
// SDK version).
import crypto from "node:crypto";
import { timingSafeEqualString } from "../../lib/security.js";
import { logger } from "../../lib/logger.js";

const MAX_CLOCK_SKEW_SECONDS = 300;

export type PropLineWebhookVerifyResult =
  | { valid: true }
  | { valid: false; reason: "missing_header" | "bad_signature" | "stale_timestamp" };

export function verifyPropLineHttpSignature(
  rawBody: Buffer,
  timestampHeader: string | string[] | undefined,
  signatureHeader: string | string[] | undefined,
  secret: string,
): PropLineWebhookVerifyResult {
  if (
    !secret ||
    typeof timestampHeader !== "string" ||
    !timestampHeader ||
    typeof signatureHeader !== "string" ||
    !signatureHeader
  ) {
    return { valid: false, reason: "missing_header" };
  }

  const message = Buffer.concat([Buffer.from(`${timestampHeader}.`, "utf8"), rawBody]);
  const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
  if (!timingSafeEqualString(expected, signatureHeader)) {
    return { valid: false, reason: "bad_signature" };
  }

  const nowSeconds = Date.now() / 1000;
  const tSeconds = Number(timestampHeader);
  if (!Number.isFinite(tSeconds) || Math.abs(nowSeconds - tSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "stale_timestamp" };
  }

  return { valid: true };
}

export type PropLineWebhookEventType = "line_movement" | "resolution" | "steam" | "market_suspended";

export type PropLineWebhookEvent = {
  deliveryId: number | null;
  eventType: string;
  data: Record<string, unknown>;
};

/** Parses both delivery shapes PropLine's own docs describe: the batched
 * envelope (`{"batch": true, "event_type", "count", "events": [{
 * "delivery_id", "data" }] }` — this webhook's own config has
 * `batch_max: 100`, so this is the shape actually expected in production)
 * and a plain single-event body (`{"delivery_id"?, "event_type", "data"}`)
 * as a fallback for an unbatched subscription. Never assumed correct
 * without a real capture — see applyPropLineWebhookEvents' comment. */
export function parsePropLineWebhookBody(rawBody: Buffer): PropLineWebhookEvent[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (obj["batch"] === true && Array.isArray(obj["events"])) {
    const eventType = typeof obj["event_type"] === "string" ? obj["event_type"] : "unknown";
    const out: PropLineWebhookEvent[] = [];
    for (const raw of obj["events"] as unknown[]) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      out.push({
        deliveryId: typeof item["delivery_id"] === "number" ? item["delivery_id"] : null,
        eventType,
        data: (item["data"] as Record<string, unknown>) ?? {},
      });
    }
    return out;
  }

  if (typeof obj["event_type"] === "string") {
    return [
      {
        deliveryId: typeof obj["delivery_id"] === "number" ? obj["delivery_id"] : null,
        eventType: obj["event_type"],
        data: (obj["data"] as Record<string, unknown>) ?? {},
      },
    ];
  }

  return null;
}

const RECENT_EVENTS_MAX = 200;
const recentEvents: Array<PropLineWebhookEvent & { receivedAt: number }> = [];
let totalReceived = 0;
let lastReceivedAt: number | null = null;
let lastSignatureFailureAt: number | null = null;

/** Records events for admin visibility (GET /api/admin/propline-webhook-
 * events) — deliberately NOT wired into the suspension engine or any
 * automatic betting decision yet. steam/market_suspended are a risk signal
 * about what OTHER books are doing, not a fact about this platform's own
 * match state the way api-tennis's/GOAL API's own live feeds are — acting
 * on them automatically (e.g. auto-suspending a BET62 market because one
 * other book pulled theirs) is a real product/risk decision this session
 * hasn't been asked to make, so this only observes and logs for now. */
export function recordPropLineWebhookEvents(events: PropLineWebhookEvent[]): void {
  const now = Date.now();
  lastReceivedAt = now;
  totalReceived += events.length;
  for (const ev of events) {
    logger.info(
      { eventType: ev.eventType, deliveryId: ev.deliveryId, data: ev.data },
      "[propline-webhook] event received",
    );
    recentEvents.unshift({ ...ev, receivedAt: now });
  }
  while (recentEvents.length > RECENT_EVENTS_MAX) recentEvents.pop();
}

export function recordPropLineWebhookSignatureFailure(): void {
  lastSignatureFailureAt = Date.now();
}

export function getPropLineWebhookStatus(): {
  totalReceived: number;
  lastReceivedAt: number | null;
  lastSignatureFailureAt: number | null;
  recentEvents: Array<PropLineWebhookEvent & { receivedAt: number }>;
} {
  return { totalReceived, lastReceivedAt, lastSignatureFailureAt, recentEvents };
}
