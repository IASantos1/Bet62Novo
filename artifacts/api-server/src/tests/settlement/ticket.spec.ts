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
