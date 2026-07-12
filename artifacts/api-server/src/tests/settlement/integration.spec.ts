import test from "node:test";
import assert from "node:assert/strict";

import { runSettlementRecovery } from "../../jobs/settlementRecovery.js";
import { runSettlementWorker } from "../../engine/settlement/worker/settlementWorker.js";
import { createSettlementIntegrationHarness } from "./integrationHarness.js";
import { makeSelection } from "./helpers.js";

test("settlement integration keeps payout ledger idempotent across duplicate settlement retries", async () => {
  const harness = createSettlementIntegrationHarness({
    users: [{ id: 7, balance: "100.00" }],
    bets: [
      {
        id: 101,
        userId: 7,
        matchId: "match-1",
        matchTitle: "Team A vs Team B",
        selections: [
          makeSelection("asian-leg", { odd: 1.9, outcome: "half_won" }),
          makeSelection("winner-leg", { odd: 2.0, outcome: "won" }),
        ],
        stake: "10.00",
        potentialWin: "38.00",
        totalOdds: "3.80",
        status: "pending",
        version: 4,
        createdAt: new Date("2026-01-01T08:00:00.000Z"),
        updatedAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    ],
    cashoutStates: [{ betId: 101 }],
  });

  const snapshot = harness.getBet(101)!;

  const firstDecision = await harness.settleBet({
    bet: snapshot,
    trigger: "worker_batch",
    selections: snapshot.selections,
    cycleId: "cycle-1",
  });

  const secondDecision = await harness.settleBet({
    bet: snapshot,
    trigger: "worker_batch",
    selections: snapshot.selections,
    cycleId: "cycle-2",
  });

  assert.equal(firstDecision?.status, "won");
  assert.equal(secondDecision, undefined);

  const settledBet = harness.getBet(101)!;
  assert.equal(settledBet.status, "won");
  assert.equal(settledBet.version, 5);
  assert.equal(settledBet.totalOdds, "2.90");
  assert.equal(settledBet.potentialWin, "29.00");

  assert.equal(harness.getUser(7)?.balance, "129.00");
  assert.equal(harness.state.ledgerEntries.length, 1);
  assert.equal(harness.state.ledgerEntries[0]?.idempotencyKey, "bet:101:settlement:payout");
  assert.equal(harness.state.settlementLogs.length, 1);
  assert.equal(harness.state.cashoutStates.length, 0);
});

test("settlement worker integration settles pending tickets with ledger and refund side effects", async () => {
  const harness = createSettlementIntegrationHarness({
    users: [{ id: 9, balance: "50.00" }],
    bets: [
      {
        id: 201,
        userId: 9,
        matchId: "match-1",
        matchTitle: "Home vs Away",
        selections: [makeSelection("winner-leg", { odd: 2.0, outcome: "won" })],
        stake: "10.00",
        potentialWin: "20.00",
        totalOdds: "2.00",
        status: "pending",
        version: 1,
        createdAt: new Date("2026-01-01T08:00:00.000Z"),
        updatedAt: new Date("2026-01-01T08:00:00.000Z"),
      },
      {
        id: 202,
        userId: 9,
        matchId: "match-1",
        matchTitle: "Home vs Away",
        selections: [
          makeSelection("void-leg-1", { odd: 1.8, outcome: "void" }),
          makeSelection("void-leg-2", { odd: 2.2, outcome: "void" }),
        ],
        stake: "5.00",
        potentialWin: "19.80",
        totalOdds: "3.96",
        status: "pending",
        version: 1,
        createdAt: new Date("2026-01-01T08:00:00.000Z"),
        updatedAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    ],
  });

  await runSettlementWorker(harness.workerDeps);

  assert.equal(harness.getBet(201)?.status, "won");
  assert.equal(harness.getBet(202)?.status, "voided");
  assert.equal(harness.state.ledgerEntries.length, 2);
  assert.deepEqual(
    harness.state.ledgerEntries.map((entry) => entry.kind).sort(),
    ["bet_settlement_payout", "bet_settlement_void_refund"],
  );
  assert.equal(harness.getUser(9)?.balance, "75.00");
  assert.equal(harness.state.settlementLogs.length, 2);
});

test("settlement recovery integration only reprocesses stale unlocked bets and releases lock heartbeat", async () => {
  const harness = createSettlementIntegrationHarness({
    users: [{ id: 11, balance: "80.00" }],
    bets: [
      {
        id: 301,
        userId: 11,
        matchId: "match-1",
        matchTitle: "Stale bet",
        selections: [makeSelection("winner-leg", { odd: 2.0, outcome: "won" })],
        stake: "10.00",
        potentialWin: "20.00",
        totalOdds: "2.00",
        status: "pending",
        version: 1,
        createdAt: new Date("2026-01-01T01:00:00.000Z"),
        updatedAt: new Date("2026-01-01T07:30:00.000Z"),
      },
      {
        id: 302,
        userId: 11,
        matchId: "match-1",
        matchTitle: "Fresh bet",
        selections: [makeSelection("winner-leg", { odd: 1.5, outcome: "won" })],
        stake: "10.00",
        potentialWin: "15.00",
        totalOdds: "1.50",
        status: "pending",
        version: 1,
        createdAt: new Date("2026-01-01T01:00:00.000Z"),
        updatedAt: new Date("2026-01-01T11:00:00.000Z"),
      },
      {
        id: 303,
        userId: 11,
        matchId: "match-1",
        matchTitle: "Locked bet",
        selections: [makeSelection("winner-leg", { odd: 3.0, outcome: "won" })],
        stake: "10.00",
        potentialWin: "30.00",
        totalOdds: "3.00",
        status: "pending",
        version: 1,
        createdAt: new Date("2026-01-01T01:00:00.000Z"),
        updatedAt: new Date("2026-01-01T07:00:00.000Z"),
      },
    ],
    deniedLockBetIds: [303],
  });

  await runSettlementRecovery(harness.recoveryDeps);

  assert.equal(harness.getBet(301)?.status, "won");
  assert.equal(harness.getBet(302)?.status, "pending");
  assert.equal(harness.getBet(303)?.status, "pending");
  assert.equal(harness.getUser(11)?.balance, "100.00");
  assert.equal(harness.state.ledgerEntries.length, 1);
  assert.equal(harness.state.releasedLocks.length, 1);
  assert.deepEqual(harness.state.releasedLocks[0], {
    betId: 301,
    owner: "recovery:1767268800000",
  });
  assert.equal(harness.state.stoppedHeartbeats.length, 1);
});
