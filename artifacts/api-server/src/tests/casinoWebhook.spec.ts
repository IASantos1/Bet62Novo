import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { timingSafeEqualString } from "../lib/security.js";
import { memberAccountForUser, userIdFromMemberAccount } from "../routes/casino.js";

// The casino wallet callback in app.ts (registered before express.json() with
// express.raw()) trusts this exact HMAC-SHA256-over-raw-body primitive as its
// sole authentication mechanism before crediting/debiting real money. These
// tests exercise that primitive against forged/tampered input, entirely
// locally — no network call to SilentAPI.

const secret = "test_casino_callback_secret";

function sign(rawBody: string, withSecret: string): string {
  return crypto.createHmac("sha256", withSecret).update(rawBody).digest("hex");
}

function verifies(rawBody: string, signature: string, withSecret: string): boolean {
  const expected = sign(rawBody, withSecret);
  return timingSafeEqualString(expected, signature);
}

test("casino webhook: accepts a correctly signed payload", () => {
  const payload = JSON.stringify({ serial_number: "txn-1", member_account: "u1", win_amount: "10.00", bet_amount: "5.00" });
  const signature = sign(payload, secret);
  assert.equal(verifies(payload, signature, secret), true);
});

test("casino webhook: rejects a payload signed with the wrong secret", () => {
  const payload = JSON.stringify({ serial_number: "txn-2", member_account: "u1", win_amount: "10.00", bet_amount: "5.00" });
  const signature = sign(payload, "a_completely_different_secret");
  assert.equal(verifies(payload, signature, secret), false);
});

test("casino webhook: rejects a tampered payload (signature no longer matches body)", () => {
  const originalPayload = JSON.stringify({ serial_number: "txn-3", win_amount: "10.00", bet_amount: "5.00" });
  const signature = sign(originalPayload, secret);
  const tamperedPayload = JSON.stringify({ serial_number: "txn-3", win_amount: "10000.00", bet_amount: "5.00" });
  assert.equal(verifies(tamperedPayload, signature, secret), false);
});

test("casino webhook: rejects a missing/garbage signature", () => {
  const payload = JSON.stringify({ serial_number: "txn-4", win_amount: "10.00", bet_amount: "5.00" });
  assert.equal(verifies(payload, "not-a-real-signature", secret), false);
});

test("memberAccountForUser / userIdFromMemberAccount: round-trips a user id", () => {
  const account = memberAccountForUser(42);
  assert.equal(account, "u42");
  assert.equal(userIdFromMemberAccount(account), 42);
});

test("userIdFromMemberAccount: rejects malformed or foreign account strings", () => {
  assert.equal(userIdFromMemberAccount("not-an-account"), null);
  assert.equal(userIdFromMemberAccount("42"), null);
  assert.equal(userIdFromMemberAccount("u"), null);
  assert.equal(userIdFromMemberAccount("u-1"), null);
  assert.equal(userIdFromMemberAccount("u0"), null);
});
