import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyPropLineHttpSignature, parsePropLineWebhookBody } from "../services/propline/webhook.js";

// The PropLine HTTP webhook receiver in app.ts (registered before
// express.json() with express.raw()) trusts verifyPropLineHttpSignature as
// its sole authentication mechanism. Same construction as GOAL API's own
// verifier (see goalApiWebhook.spec.ts) but with the timestamp and
// signature carried as two separate headers instead of one combined
// `t=...,v1=...` value — confirmed against the real installed `propline`
// npm SDK's own PropLine.verifySignature() source, not from prose docs.

const secret = "test_propline_webhook_secret";

function sign(rawBody: string, timestamp: string, withSecret: string): string {
  const message = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), Buffer.from(rawBody, "utf8")]);
  return crypto.createHmac("sha256", withSecret).update(message).digest("hex");
}

test("PropLine webhook: accepts a correctly signed, fresh payload", () => {
  const payload = JSON.stringify({ event_type: "steam", data: { market: "h2h" } });
  const t = String(Math.floor(Date.now() / 1000));
  const result = verifyPropLineHttpSignature(Buffer.from(payload), t, sign(payload, t, secret), secret);
  assert.equal(result.valid, true);
});

test("PropLine webhook: rejects a payload signed with the wrong secret", () => {
  const payload = JSON.stringify({ event_type: "steam", data: {} });
  const t = String(Math.floor(Date.now() / 1000));
  const result = verifyPropLineHttpSignature(
    Buffer.from(payload),
    t,
    sign(payload, t, "a_completely_different_secret"),
    secret,
  );
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "bad_signature");
});

test("PropLine webhook: rejects a tampered payload (signature no longer matches body)", () => {
  const originalPayload = JSON.stringify({ event_type: "steam", data: { market: "h2h" } });
  const t = String(Math.floor(Date.now() / 1000));
  const sig = sign(originalPayload, t, secret);
  const tamperedPayload = JSON.stringify({ event_type: "market_suspended", data: { market: "h2h" } });
  const result = verifyPropLineHttpSignature(Buffer.from(tamperedPayload), t, sig, secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "bad_signature");
});

test("PropLine webhook: rejects a missing signature header", () => {
  const payload = JSON.stringify({ event_type: "steam", data: {} });
  const t = String(Math.floor(Date.now() / 1000));
  const result = verifyPropLineHttpSignature(Buffer.from(payload), t, undefined, secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "missing_header");
});

test("PropLine webhook: rejects a missing timestamp header", () => {
  const payload = JSON.stringify({ event_type: "steam", data: {} });
  const result = verifyPropLineHttpSignature(Buffer.from(payload), undefined, "deadbeef", secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "missing_header");
});

test("PropLine webhook: rejects a stale timestamp outside the 5-minute tolerance window (replay protection)", () => {
  const payload = JSON.stringify({ event_type: "steam", data: {} });
  const staleT = String(Math.floor(Date.now() / 1000) - 600); // 10 minutes old
  const result = verifyPropLineHttpSignature(Buffer.from(payload), staleT, sign(payload, staleT, secret), secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "stale_timestamp");
});

test("PropLine webhook: rejects when no secret is configured", () => {
  const payload = JSON.stringify({ event_type: "steam", data: {} });
  const t = String(Math.floor(Date.now() / 1000));
  const result = verifyPropLineHttpSignature(Buffer.from(payload), t, sign(payload, t, secret), "");
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "missing_header");
});

test("parsePropLineWebhookBody: parses a single (unbatched) event", () => {
  const payload = JSON.stringify({ delivery_id: 42, event_type: "market_suspended", data: { books_agreeing: 3 } });
  const parsed = parsePropLineWebhookBody(Buffer.from(payload));
  assert.deepEqual(parsed, [{ deliveryId: 42, eventType: "market_suspended", data: { books_agreeing: 3 } }]);
});

test("parsePropLineWebhookBody: parses a batched envelope into one entry per event", () => {
  const payload = JSON.stringify({
    batch: true,
    event_type: "steam",
    count: 2,
    events: [
      { delivery_id: 1, data: { steam_score: 55 } },
      { delivery_id: 2, data: { steam_score: 80 } },
    ],
  });
  const parsed = parsePropLineWebhookBody(Buffer.from(payload));
  assert.deepEqual(parsed, [
    { deliveryId: 1, eventType: "steam", data: { steam_score: 55 } },
    { deliveryId: 2, eventType: "steam", data: { steam_score: 80 } },
  ]);
});

test("parsePropLineWebhookBody: rejects invalid JSON", () => {
  assert.equal(parsePropLineWebhookBody(Buffer.from("not json")), null);
});

test("parsePropLineWebhookBody: rejects a body missing event_type entirely", () => {
  assert.equal(parsePropLineWebhookBody(Buffer.from(JSON.stringify({ data: {} }))), null);
});
