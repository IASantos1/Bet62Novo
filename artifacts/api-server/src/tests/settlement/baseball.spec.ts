import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectionSettlement } from "../../settlement.js";
import { makeSelection, type FinishedSettlementCase } from "./helpers.js";

const baseballCases: FinishedSettlementCase[] = [
  {
    name: "baseball first five innings home is settled as won",
    selection: makeSelection("f5-home"),
    ft: { home: 5, away: 2 },
    extra: {
      extras: {
        baseball: {
          innings: [
            [1, 0],
            [0, 0],
            [2, 0],
            [0, 1],
            [1, 0],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "baseball mlb first five alias is settled as won",
    selection: makeSelection("mlb-f5-home"),
    ft: { home: 5, away: 2 },
    extra: {
      extras: {
        baseball: {
          innings: [
            [1, 0],
            [0, 0],
            [2, 0],
            [0, 1],
            [1, 0],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "baseball mlb first five away alias is settled as won",
    selection: makeSelection("mlb-f5-away"),
    ft: { home: 2, away: 5 },
    extra: {
      extras: {
        baseball: {
          innings: [
            [0, 1],
            [0, 0],
            [0, 2],
            [1, 0],
            [0, 1],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "baseball first five total exact line is settled as void",
    selection: makeSelection("f5t-o-4"),
    ft: { home: 5, away: 4 },
    extra: {
      extras: {
        baseball: {
          innings: [
            [1, 0],
            [0, 1],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        },
      },
    },
    expected: "void",
  },
  {
    name: "baseball mlb first five total alias is settled as void",
    selection: makeSelection("mlb-f5t-o-4"),
    ft: { home: 5, away: 4 },
    extra: {
      extras: {
        baseball: {
          innings: [
            [1, 0],
            [0, 1],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        },
      },
    },
    expected: "void",
  },
  {
    name: "baseball mlb first five total 4.5 alias is settled as won",
    selection: makeSelection("mlb-f5t-o-4.5"),
    ft: { home: 5, away: 2 },
    extra: {
      extras: {
        baseball: {
          innings: [
            [1, 0],
            [0, 1],
            [1, 0],
            [1, 1],
            [1, 0],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "baseball total runs over 8.5 is settled as won",
    selection: makeSelection("mlb-o85"),
    ft: { home: 6, away: 4 },
    expected: "won",
  },
  {
    name: "baseball mlb total alias is settled as won",
    selection: makeSelection("mlb-tot-o-8.5"),
    ft: { home: 6, away: 4 },
    expected: "won",
  },
  {
    name: "baseball run line home is settled as won",
    selection: makeSelection("rl-home"),
    ft: { home: 5, away: 3 },
    expected: "won",
  },
  {
    name: "baseball mlb run line alias is settled as won",
    selection: makeSelection("mlb-rl-home-1.5"),
    ft: { home: 5, away: 3 },
    expected: "won",
  },
  {
    name: "baseball away run line alias is settled as won",
    selection: makeSelection("rl-away"),
    ft: { home: 3, away: 2 },
    expected: "won",
  },
];

for (const tc of baseballCases) {
  test(tc.name, () => {
    const result = resolveSelectionSettlement(
      tc.selection,
      tc.ft,
      tc.ht,
      tc.extra,
    );

    assert.equal(result.outcome, tc.expected);
  });
}
