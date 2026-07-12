import test from "node:test";
import assert from "node:assert/strict";

import { resolveLiveSelectionSettlement } from "../../settlement.js";
import { makeSelection, type LiveSettlementCase } from "./helpers.js";

const liveCases: LiveSettlementCase[] = [
  {
    name: "live half time home is settled early as won",
    selection: makeSelection("ht-home"),
    score: {
      home: 1,
      away: 0,
      htScore: [1, 0],
      status: "live",
    },
    expected: "won",
  },
  {
    name: "live htft mismatch is settled early as lost",
    selection: makeSelection("htft-da"),
    score: {
      home: 1,
      away: 0,
      htScore: [1, 0],
      status: "live",
    },
    expected: "lost",
  },
  {
    name: "live over 2.5 goals is settled early as won",
    selection: makeSelection("o25"),
    score: {
      home: 2,
      away: 1,
      status: "live",
    },
    expected: "won",
  },
  {
    name: "live under 2.5 goals is settled early as lost",
    selection: makeSelection("u25"),
    score: {
      home: 2,
      away: 1,
      status: "live",
    },
    expected: "lost",
  },
  {
    name: "live corners under 10.5 is settled early as lost",
    selection: makeSelection("corners-u105"),
    score: {
      home: 1,
      away: 0,
      cornersTotal: 11,
      status: "live",
    },
    expected: "lost",
  },
  {
    name: "live first goal home is settled early as won",
    selection: makeSelection("fg-home"),
    score: {
      home: 1,
      away: 0,
      firstGoal: "home",
      status: "live",
    },
    expected: "won",
  },
  {
    name: "live basketball all quarters home is settled early as lost when a quarter is not won",
    selection: makeSelection("b-allq-home"),
    score: {
      home: 70,
      away: 68,
      basketballQuarters: [
        [20, 18],
        [15, 15],
      ],
      status: "live",
    },
    expected: "lost",
  },
  {
    name: "live hockey first period home is settled early as won",
    selection: makeSelection("p1-home"),
    score: {
      home: 2,
      away: 1,
      hockeyPeriods: [[1, 0]],
      status: "live",
    },
    expected: "won",
  },
  {
    name: "live hockey shots on goal over is settled early as won",
    selection: makeSelection("sog-o-40.5"),
    score: {
      home: 2,
      away: 1,
      hockeyShotsOnGoalTotal: 41,
      status: "live",
    },
    expected: "won",
  },
  {
    name: "live baseball first five total over is settled early as won",
    selection: makeSelection("f5t-o-4.5"),
    score: {
      home: 4,
      away: 2,
      baseballInnings: [
        [1, 0],
        [0, 1],
        [1, 0],
        [1, 1],
        [1, 0],
      ],
      status: "live",
    },
    expected: "won",
  },
];

for (const tc of liveCases) {
  test(tc.name, () => {
    const result = resolveLiveSelectionSettlement(tc.selection, tc.score);
    assert.equal(result.outcome, tc.expected);
  });
}
