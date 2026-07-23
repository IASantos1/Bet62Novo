import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

// The deposit webhook in app.ts (registered before express.json() with
// express.raw()) trusts stripe.webhooks.constructEvent() as its sole
// authentication mechanism for crediting real money to a user's balance.
// These tests exercise that exact primitive against forged/tampered input,
// entirely locally (HMAC signing/verification — no network call to Stripe).

const secret = "whsec_test_secret_for_unit_tests";

function sign(payload: string, withSecret: string, timestamp?: number) {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: withSecret,
    timestamp,
  });
}

test("Stripe webhook: accepts a correctly signed payload", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const header = sign(payload, secret);
  const event = Stripe.webhooks.constructEvent(payload, header, secret);
  assert.equal(event.type, "checkout.session.completed");
});

test("Stripe webhook: rejects a payload signed with the wrong secret", () => {
  const payload = JSON.stringify({ id: "evt_2", type: "checkout.session.completed" });
  const header = sign(payload, "whsec_a_completely_different_secret");
  assert.throws(() => Stripe.webhooks.constructEvent(payload, header, secret));
});

test("Stripe webhook: rejects a tampered payload (signature no longer matches body)", () => {
  const originalPayload = JSON.stringify({ id: "evt_3", amount: 10 });
  const header = sign(originalPayload, secret);
  const tamperedPayload = JSON.stringify({ id: "evt_3", amount: 100000 });
  assert.throws(() => Stripe.webhooks.constructEvent(tamperedPayload, header, secret));
});

test("Stripe webhook: rejects a missing/garbage signature header", () => {
  const payload = JSON.stringify({ id: "evt_4", type: "checkout.session.completed" });
  assert.throws(() => Stripe.webhooks.constructEvent(payload, "not-a-real-signature", secret));
});

test("Stripe webhook: rejects a stale timestamp outside the default tolerance window", () => {
  const payload = JSON.stringify({ id: "evt_5", type: "checkout.session.completed" });
  const oldTimestamp = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hour old
  const header = sign(payload, secret, oldTimestamp);
  assert.throws(() => Stripe.webhooks.constructEvent(payload, header, secret));
});
