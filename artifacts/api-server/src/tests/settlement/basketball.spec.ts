import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectionSettlement } from "../../settlement.js";
import { makeSelection, type FinishedSettlementCase } from "./helpers.js";

const basketballExtras = {
  extras: {
    basketball: {
      quarters: [
        [30, 25],
        [28, 24],
        [22, 20],
        [21, 19],
      ],
    },
  },
};

const basketballQuarterAliasExtras = {
  extras: {
    basketball: {
      quarters: [
        [31, 25],
        [27, 24],
        [22, 20],
        [21, 19],
      ],
    },
  },
};

const basketballAwayExtras = {
  extras: {
    basketball: {
      quarters: [
        [20, 25],
        [19, 24],
        [18, 22],
        [21, 23],
      ],
    },
  },
};

const basketballCases: FinishedSettlementCase[] = [
  {
    name: "basketball all quarters home is settled as won",
    selection: makeSelection("b-allq-home"),
    ft: { home: 101, away: 88 },
    extra: basketballExtras,
    expected: "won",
  },
  {
    name: "basketball quarter spread push is settled as void",
    selection: makeSelection("q1s-home-5"),
    ft: { home: 100, away: 95 },
    extra: {
      extras: {
        basketball: {
          quarters: [
            [30, 25],
            [22, 24],
            [24, 22],
            [24, 24],
          ],
        },
      },
    },
    expected: "void",
  },
  {
    name: "basketball quarter total alias is settled as won",
    selection: makeSelection("b-q2t-o-45.5"),
    ft: { home: 101, away: 88 },
    extra: basketballExtras,
    expected: "won",
  },
  {
    name: "basketball exact expected quarter total alias is settled as won",
    selection: makeSelection("b-q1t-o-45.5"),
    ft: { home: 101, away: 88 },
    extra: basketballQuarterAliasExtras,
    expected: "won",
  },
  {
    name: "basketball quarter spread alias is settled as void",
    selection: makeSelection("b-q1s-home-5"),
    ft: { home: 100, away: 95 },
    extra: {
      extras: {
        basketball: {
          quarters: [
            [30, 25],
            [22, 24],
            [24, 22],
            [24, 24],
          ],
        },
      },
    },
    expected: "void",
  },
  {
    name: "basketball exact expected quarter spread alias is settled as won",
    selection: makeSelection("b-q1s-home-5.5"),
    ft: { home: 101, away: 88 },
    extra: basketballQuarterAliasExtras,
    expected: "won",
  },
  {
    name: "basketball total points over 180.5 is settled as won",
    selection: makeSelection("b-pts-o-180.5"),
    ft: { home: 101, away: 88 },
    extra: basketballExtras,
    expected: "won",
  },
  {
    name: "basketball first half points over 100.5 is settled as won",
    selection: makeSelection("b-h1-pts-o-100.5"),
    ft: { home: 101, away: 88 },
    extra: basketballExtras,
    expected: "won",
  },
  {
    name: "basketball home team total over 95.5 is settled as won",
    selection: makeSelection("b-tt-home-o-95.5"),
    ft: { home: 101, away: 88 },
    extra: basketballExtras,
    expected: "won",
  },
  {
    name: "basketball first quarter home is settled as won",
    selection: makeSelection("q1-home"),
    ft: { home: 101, away: 88 },
    extra: basketballExtras,
    expected: "won",
  },
  {
    name: "basketball any quarter home is settled as won",
    selection: makeSelection("b-anyq-home"),
    ft: { home: 101, away: 88 },
    extra: basketballExtras,
    expected: "won",
  },
  {
    name: "basketball any quarter away is settled as won",
    selection: makeSelection("b-anyq-away"),
    ft: { home: 78, away: 94 },
    extra: basketballAwayExtras,
    expected: "won",
  },
  {
    name: "basketball all quarters away is settled as won",
    selection: makeSelection("b-allq-away"),
    ft: { home: 78, away: 94 },
    extra: basketballAwayExtras,
    expected: "won",
  },
  {
    name: "basketball second quarter total over 45.5 is settled as won",
    selection: makeSelection("q2t-o-45.5"),
    ft: { home: 101, away: 88 },
    extra: basketballExtras,
    expected: "won",
  },
];

for (const tc of basketballCases) {
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
