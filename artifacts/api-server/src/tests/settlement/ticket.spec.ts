import test from "node:test";
import assert from "node:assert/strict";

import { deriveSettlementDecision } from "../../services/settlement/settleBet.js";
import { makeSelection } from "./helpers.js";

test("multi-bet aggregation treats won plus void as winning ticket with adjusted odds", () => {
  const decision = deriveSettlementDecision(
    {
      id: 10,
      stake: "10.00",
      matchId: "multi-1",
    },
    [
      makeSelection("home", { odd: 2.0, outcome: "won" }),
      makeSelection("away", { odd: 3.0, outcome: "void" }),
    ],
  );

  assert.equal(decision.status, "won");
  assert.equal(decision.payout, "20.00");
  assert.equal(decision.totalOdds, "2.00");
});

test("multi-bet aggregation preserves half-won outcomes in payout calculation", () => {
  const decision = deriveSettlementDecision(
    {
      id: 11,
      stake: "10.00",
      matchId: "multi-2",
    },
    [
      makeSelection("asian-leg", { odd: 1.9, outcome: "half_won" }),
      makeSelection("winner-leg", { odd: 2.0, outcome: "won" }),
    ],
  );

  assert.equal(decision.status, "won");
  assert.equal(decision.payout, "29.00");
  assert.equal(decision.totalOdds, "2.90");
});

test("multi-bet aggregation preserves half-lost outcomes in payout calculation", () => {
  const decision = deriveSettlementDecision(
    {
      id: 13,
      stake: "10.00",
      matchId: "multi-4",
    },
    [
      makeSelection("asian-leg", { odd: 1.9, outcome: "half_lost" }),
      makeSelection("winner-leg", { odd: 2.0, outcome: "won" }),
    ],
  );

  assert.equal(decision.status, "won");
  assert.equal(decision.payout, "10.00");
  assert.equal(decision.totalOdds, "1.00");
});

test("multi-bet aggregation refunds stake when all selections are void", () => {
  const decision = deriveSettlementDecision(
    {
      id: 12,
      stake: "15.00",
      matchId: "multi-3",
    },
    [
      makeSelection("void-leg-1", { odd: 1.8, outcome: "void" }),
      makeSelection("void-leg-2", { odd: 2.1, outcome: "void" }),
    ],
  );

  assert.equal(decision.status, "voided");
  assert.equal(decision.payout, "15.00");
});

test("multi-bet aggregation marks ticket as lost when any leg loses", () => {
  const decision = deriveSettlementDecision(
    {
      id: 14,
      stake: "20.00",
      matchId: "multi-5",
    },
    [
      makeSelection("winner-leg", { odd: 2.0, outcome: "won" }),
      makeSelection("losing-leg", { odd: 1.7, outcome: "lost" }),
    ],
  );

  assert.equal(decision.status, "lost");
  assert.equal(decision.payout, "0.00");
});

test("multi-bet aggregation remains pending when any leg is unresolved", () => {
  const decision = deriveSettlementDecision(
    {
      id: 15,
      stake: "20.00",
      matchId: "multi-6",
    },
    [
      makeSelection("winner-leg", { odd: 2.0, outcome: "won" }),
      makeSelection("pending-leg", { odd: 1.7, outcome: null }),
    ],
  );

  assert.equal(decision.status, "pending");
  assert.equal(decision.payout, "0.00");
});

test("multi-bet aggregation settles as lost immediately even while another leg is still unresolved", () => {
  // Reproduces the "tennis multiple never settles" bug: a leg that's
  // already definitively lost must sink the ticket right away instead of
  // waiting on a sibling leg (e.g. a tennis set that hasn't finished yet).
  const decision = deriveSettlementDecision(
    {
      id: 16,
      stake: "20.00",
      matchId: "multi-7",
    },
    [
      makeSelection("losing-leg", { odd: 1.7, outcome: "lost" }),
      makeSelection("pending-leg", { odd: 2.0, outcome: null }),
    ],
  );

  assert.equal(decision.status, "lost");
  assert.equal(decision.payout, "0.00");
});

// History: an audit (2026-08-10) found a freebet win/void paying the full
// stake-inclusive amount to real balance was exploitable — a freebet's
// stake is debited from freebetBalance at placement, never real balance,
// so crediting stake*odds back to real balance on a win manufactured real,
// withdrawable money that was never actually risked, repeatable with every
// freebet granted. That was fixed with a "stake not returned" (winnings-
// only) payout. Reverted 2026-08-15: explicit, informed platform-owner
// decision (confirmed twice via AskUserQuestion, shown the exact exploit
// and a concrete numeric example both times) that a freebet win should pay
// exactly like a real-money bet — stake included. Freebet VOIDs are
// unaffected by this reversal and still refund to freebetBalance, not real
// balance (see settlement.ts's applyVoidRefund) — only WINS changed.
test("freebet win pays stake-inclusive, same as a real-money bet", () => {
  const decision = deriveSettlementDecision(
    {
      id: 20,
      stake: "10.00",
      matchId: "freebet-1",
      isFreebet: "true",
    },
    [makeSelection("home", { odd: 2.0, outcome: "won" })],
  );

  assert.equal(decision.status, "won");
  assert.equal(decision.payout, "20.00");
});

test("a non-freebet win is unaffected — stake is included as before", () => {
  const decision = deriveSettlementDecision(
    {
      id: 21,
      stake: "10.00",
      matchId: "freebet-2",
      isFreebet: "false",
    },
    [makeSelection("home", { odd: 2.0, outcome: "won" })],
  );

  assert.equal(decision.status, "won");
  assert.equal(decision.payout, "20.00");
});

test("freebet and non-freebet wins compute the exact same payout at identical stake/odds", () => {
  const freebetDecision = deriveSettlementDecision(
    {
      id: 22,
      stake: "10.00",
      matchId: "freebet-3",
      isFreebet: "true",
    },
    [makeSelection("home", { odd: 1.5, outcome: "won" })],
  );
  const realDecision = deriveSettlementDecision(
    {
      id: 23,
      stake: "10.00",
      matchId: "freebet-4",
      isFreebet: "false",
    },
    [makeSelection("home", { odd: 1.5, outcome: "won" })],
  );

  assert.equal(freebetDecision.status, "won");
  assert.equal(freebetDecision.payout, "15.00");
  assert.equal(freebetDecision.payout, realDecision.payout);
});
