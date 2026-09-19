import test from "node:test";
import assert from "node:assert/strict";
import { detectTennisIncidents } from "../services/apitennis/incidentEngine.js";
import { computeTennisMarketSuspension } from "../markets/tennisSuspensionEngine.js";

test("detectTennisIncidents: server-holds-40-0 is a game point, not a break point", () => {
  const incidents = detectTennisIncidents(
    { sets: [], currentPoints: [30, 0], serving: [true, false] },
    { sets: [], currentPoints: [40, 0], serving: [true, false] },
  );
  assert.equal(incidents.some((i) => i.type === "BREAK_POINT"), false);
  assert.equal(incidents.some((i) => i.type === "POINT"), true);
});

test("detectTennisIncidents: receiver at 40 while opponent serves is a break point", () => {
  const incidents = detectTennisIncidents(
    { sets: [[3, 2]], currentPoints: [15, 30], serving: [true, false] },
    { sets: [[3, 2]], currentPoints: [15, 40], serving: [true, false] },
  );
  const bp = incidents.find((i) => i.type === "BREAK_POINT");
  assert.ok(bp);
  assert.equal(bp!.side, "away");
});

test("detectTennisIncidents: 40-40 deuce is never a game point for either side", () => {
  const incidents = detectTennisIncidents(
    { sets: [[3, 2]], currentPoints: [30, 40], serving: [true, false] },
    { sets: [[3, 2]], currentPoints: [40, 40], serving: [true, false] },
  );
  assert.equal(incidents.some((i) => i.type === "BREAK_POINT" || i.type === "SET_POINT" || i.type === "MATCH_POINT"), false);
});

test("detectTennisIncidents: server at advantage in a would-be-set-closing game is a set point, not a break point", () => {
  const incidents = detectTennisIncidents(
    { sets: [[5, 4]], currentPoints: [40, 40], serving: [true, false] },
    { sets: [[5, 4]], currentPoints: ["AD", 40], serving: [true, false] },
  );
  const sp = incidents.find((i) => i.type === "SET_POINT");
  assert.ok(sp);
  assert.equal(sp!.side, "home");
  assert.equal(incidents.some((i) => i.type === "BREAK_POINT"), false);
});

test("detectTennisIncidents: game point that would win the 2nd set with 1 set already won is a match point", () => {
  const incidents = detectTennisIncidents(
    { sets: [[6, 3], [5, 4]], currentPoints: [30, 15], serving: [true, false] },
    { sets: [[6, 3], [5, 4]], currentPoints: [40, 15], serving: [true, false] },
  );
  const mp = incidents.find((i) => i.type === "MATCH_POINT");
  assert.ok(mp);
  assert.equal(mp!.side, "home");
});

test("detectTennisIncidents: a finished set is reported as SET_WON for the winner", () => {
  const incidents = detectTennisIncidents(
    { sets: [[6, 3]] },
    { sets: [[6, 3], [1, 0]] },
  );
  const sw = incidents.find((i) => i.type === "SET_WON");
  assert.ok(sw);
  assert.equal(sw!.side, "home");
});

test("detectTennisIncidents: tiebreak game point uses the 6-point race scale, not 40", () => {
  const incidents = detectTennisIncidents(
    { sets: [[6, 6]], currentPoints: [5, 4], serving: [false, true] },
    { sets: [[6, 6]], currentPoints: [6, 4], serving: [false, true] },
  );
  // In a tiebreak, winning the game always wins the set (wouldWinSet is
  // unconditionally true) — home leads 6-4 here, receiving, so this reads
  // as a set point for home, not a break point.
  const sp = incidents.find((i) => i.type === "SET_POINT");
  assert.ok(sp);
  assert.equal(sp!.side, "home");
});

test("computeTennisMarketSuspension: a break point suspends every tennis market group", () => {
  const now = 1_000_000;
  const { marketSuspension, suspensionReason } = computeTennisMarketSuspension({
    now,
    incidents: [{ type: "BREAK_POINT", side: "away" }],
  });
  assert.ok(marketSuspension);
  assert.equal(suspensionReason, "BREAK POINT!");
  for (const key of ["result", "handicap", "jogos", "sets", "especiais", "perset"]) {
    assert.ok(marketSuspension![key] > now, `expected ${key} to be suspended`);
  }
});

test("computeTennisMarketSuspension: match point suspends longer than a break point", () => {
  const now = 1_000_000;
  const bp = computeTennisMarketSuspension({ now, incidents: [{ type: "BREAK_POINT", side: "home" }] });
  const mp = computeTennisMarketSuspension({ now, incidents: [{ type: "MATCH_POINT", side: "home" }] });
  assert.ok(mp.marketSuspension!["result"]! > bp.marketSuspension!["result"]!);
});

test("computeTennisMarketSuspension: expires and clears once the delay passes", () => {
  const start = 1_000_000;
  const { marketSuspension } = computeTennisMarketSuspension({
    now: start,
    incidents: [{ type: "BREAK_POINT", side: "home" }],
  });
  const later = computeTennisMarketSuspension({
    now: start + 60_000,
    existingSuspension: marketSuspension,
    incidents: [],
  });
  assert.equal(later.marketSuspension, undefined);
});

test("computeTennisMarketSuspension: a quiet tick with no incidents keeps a still-active suspension", () => {
  const start = 1_000_000;
  const { marketSuspension, suspensionReason } = computeTennisMarketSuspension({
    now: start,
    incidents: [{ type: "SET_POINT", side: "away" }],
  });
  const next = computeTennisMarketSuspension({
    now: start + 1_000,
    existingSuspension: marketSuspension,
    existingReason: suspensionReason,
    incidents: [],
  });
  assert.ok(next.marketSuspension);
  assert.equal(next.suspensionReason, "SET POINT!");
});
