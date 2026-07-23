import test from "node:test";
import assert from "node:assert/strict";

import {
  canTransitionWithdrawalStatus,
  canUserCancelWithdrawalStatus,
  normalizeWebhookWithdrawalStatus,
  buildWithdrawalRiskFlags,
  getWithdrawalWebhookSecret,
} from "../routes/withdrawals.js";

test("canTransitionWithdrawalStatus: allows the documented admin transitions", () => {
  assert.equal(canTransitionWithdrawalStatus("pending_review", "approved"), true);
  assert.equal(canTransitionWithdrawalStatus("pending_review", "rejected"), true);
  assert.equal(canTransitionWithdrawalStatus("approved", "processing"), true);
  assert.equal(canTransitionWithdrawalStatus("processing", "paid"), true);
  assert.equal(canTransitionWithdrawalStatus("failed", "approved"), true);
});

test("canTransitionWithdrawalStatus: rejects transitions out of terminal/undefined states", () => {
  assert.equal(canTransitionWithdrawalStatus("paid", "processing"), false);
  assert.equal(canTransitionWithdrawalStatus("rejected", "approved"), false);
  assert.equal(canTransitionWithdrawalStatus("cancelled", "approved"), false);
});

test("canTransitionWithdrawalStatus: rejects skipping straight from pending_review to paid", () => {
  assert.equal(canTransitionWithdrawalStatus("pending_review", "paid"), false);
});

test("canUserCancelWithdrawalStatus: only pending_review and approved are user-cancellable", () => {
  assert.equal(canUserCancelWithdrawalStatus("pending_review"), true);
  assert.equal(canUserCancelWithdrawalStatus("approved"), true);
  assert.equal(canUserCancelWithdrawalStatus("processing"), false);
  assert.equal(canUserCancelWithdrawalStatus("paid"), false);
});

test("normalizeWebhookWithdrawalStatus: maps provider synonyms to canonical statuses", () => {
  assert.equal(normalizeWebhookWithdrawalStatus("succeeded"), "paid");
  assert.equal(normalizeWebhookWithdrawalStatus("Completed"), "paid");
  assert.equal(normalizeWebhookWithdrawalStatus("in_progress"), "processing");
  assert.equal(normalizeWebhookWithdrawalStatus("declined"), "failed");
});

test("normalizeWebhookWithdrawalStatus: returns null for unrecognized values", () => {
  assert.equal(normalizeWebhookWithdrawalStatus("something_else"), null);
  assert.equal(normalizeWebhookWithdrawalStatus(""), null);
});

test("buildWithdrawalRiskFlags: flags a brand-new account withdrawing most of its balance", () => {
  const flags = buildWithdrawalRiskFlags({
    amount: 950,
    userBalanceBefore: 1000,
    userCreatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h old
    previousWithdrawalCount: 0,
    completedDepositCount: 0,
    totalCompletedDeposits: 0,
    latestCompletedDepositAt: null,
    settledBetCount: 0,
  });
  const codes = flags.map((f) => f.code);
  assert.ok(codes.includes("first_withdrawal"));
  assert.ok(codes.includes("new_account"));
  assert.ok(codes.includes("no_completed_deposits"));
  assert.ok(codes.includes("high_balance_ratio"));
  assert.ok(codes.includes("low_settled_bet_history"));

  const newAccountFlag = flags.find((f) => f.code === "new_account");
  assert.equal(newAccountFlag?.severity, "high"); // < 24h old
});

test("buildWithdrawalRiskFlags: an established account with modest withdrawal gets no flags", () => {
  const flags = buildWithdrawalRiskFlags({
    amount: 50,
    userBalanceBefore: 1000,
    userCreatedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year old
    previousWithdrawalCount: 5,
    completedDepositCount: 10,
    totalCompletedDeposits: 5000,
    latestCompletedDepositAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    settledBetCount: 50,
  });
  assert.deepEqual(flags, []);
});

test("buildWithdrawalRiskFlags: flags amounts at and above the large-amount thresholds", () => {
  const base = {
    userBalanceBefore: 10000,
    userCreatedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    previousWithdrawalCount: 5,
    completedDepositCount: 10,
    totalCompletedDeposits: 50000,
    latestCompletedDepositAt: null,
    settledBetCount: 50,
  };
  const medium = buildWithdrawalRiskFlags({ ...base, amount: 1000 }).find((f) => f.code === "large_amount");
  const high = buildWithdrawalRiskFlags({ ...base, amount: 2500 }).find((f) => f.code === "large_amount");
  assert.equal(medium?.severity, "medium");
  assert.equal(high?.severity, "high");
});

test("getWithdrawalWebhookSecret: reads the dedicated header first", () => {
  const secret = getWithdrawalWebhookSecret({
    headers: { "x-withdrawal-webhook-secret": "abc123" },
  });
  assert.equal(secret, "abc123");
});

test("getWithdrawalWebhookSecret: falls back to a Bearer authorization header", () => {
  const secret = getWithdrawalWebhookSecret({
    headers: { authorization: "Bearer abc123" },
  });
  assert.equal(secret, "abc123");
});

test("getWithdrawalWebhookSecret: returns empty string when no credential is present", () => {
  const secret = getWithdrawalWebhookSecret({ headers: {} });
  assert.equal(secret, "");
});
