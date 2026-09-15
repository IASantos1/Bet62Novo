import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyGoalApiSignature, parseGoalApiWebhookBody } from "../services/goalapi/webhook.js";

// The GOAL API webhook receiver in app.ts (registered before express.json()
// with express.raw()) trusts verifyGoalApiSignature as its sole
// authentication mechanism. These tests exercise the real function against
// forged/tampered/replayed input, entirely locally — no network call.

const secret = "test_goal_api_webhook_secret";

function sign(rawBody: string, t: number, withSecret: string): string {
  return crypto.createHmac("sha256", withSecret).update(`${t}.${rawBody}`).digest("hex");
}

function header(rawBody: string, t: number, withSecret: string): string {
  return `t=${t},v1=${sign(rawBody, t, withSecret)}`;
}

test("GOAL API webhook: accepts a correctly signed, fresh payload", () => {
  const payload = JSON.stringify({ event: "goal.scored", data: { fixtureId: "f1" } });
  const t = Math.floor(Date.now() / 1000);
  const result = verifyGoalApiSignature(Buffer.from(payload), header(payload, t, secret), secret);
  assert.equal(result.valid, true);
});

test("GOAL API webhook: rejects a payload signed with the wrong secret", () => {
  const payload = JSON.stringify({ event: "goal.scored", data: { fixtureId: "f1" } });
  const t = Math.floor(Date.now() / 1000);
  const result = verifyGoalApiSignature(Buffer.from(payload), header(payload, t, "a_completely_different_secret"), secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "bad_signature");
});

test("GOAL API webhook: rejects a tampered payload (signature no longer matches body)", () => {
  const originalPayload = JSON.stringify({ event: "goal.scored", data: { fixtureId: "f1" } });
  const t = Math.floor(Date.now() / 1000);
  const sig = header(originalPayload, t, secret);
  const tamperedPayload = JSON.stringify({ event: "match.finished", data: { fixtureId: "f1" } });
  const result = verifyGoalApiSignature(Buffer.from(tamperedPayload), sig, secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "bad_signature");
});

test("GOAL API webhook: rejects a missing signature header", () => {
  const payload = JSON.stringify({ event: "goal.scored", data: { fixtureId: "f1" } });
  const result = verifyGoalApiSignature(Buffer.from(payload), undefined, secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "missing_header");
});

test("GOAL API webhook: rejects a malformed signature header (missing t or v1)", () => {
  const payload = JSON.stringify({ event: "goal.scored", data: { fixtureId: "f1" } });
  const result = verifyGoalApiSignature(Buffer.from(payload), "v1=deadbeef", secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "malformed_header");
});

test("GOAL API webhook: rejects a stale timestamp outside the 5-minute tolerance window (replay protection)", () => {
  const payload = JSON.stringify({ event: "goal.scored", data: { fixtureId: "f1" } });
  const staleT = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
  const result = verifyGoalApiSignature(Buffer.from(payload), header(payload, staleT, secret), secret);
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "stale_timestamp");
});

test("GOAL API webhook: rejects when no secret is configured", () => {
  const payload = JSON.stringify({ event: "goal.scored", data: { fixtureId: "f1" } });
  const t = Math.floor(Date.now() / 1000);
  const result = verifyGoalApiSignature(Buffer.from(payload), header(payload, t, secret), "");
  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, "missing_header");
});

test("parseGoalApiWebhookBody: parses a well-formed event", () => {
  const payload = JSON.stringify({ event: "match.finished", data: { fixtureId: "f42" } });
  const parsed = parseGoalApiWebhookBody(Buffer.from(payload));
  assert.deepEqual(parsed, { event: "match.finished", data: { fixtureId: "f42" } });
});

test("parseGoalApiWebhookBody: rejects invalid JSON", () => {
  assert.equal(parseGoalApiWebhookBody(Buffer.from("not json")), null);
});

test("parseGoalApiWebhookBody: rejects a body missing the event field", () => {
  assert.equal(parseGoalApiWebhookBody(Buffer.from(JSON.stringify({ data: {} }))), null);
});
