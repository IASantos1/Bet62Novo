import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectionSettlement } from "../../settlement.js";
import { makeSelection, type FinishedSettlementCase } from "./helpers.js";

const volleyballSetExtras = {
  extras: {
    volleyball: {
      sets: [
        [25, 20],
        [22, 25],
        [25, 21],
        [25, 23],
      ],
    },
  },
};

const volleyballCases: FinishedSettlementCase[] = [
  {
    name: "volleyball total points over is settled as won",
    selection: makeSelection("pt-o-180.5"),
    ft: { home: 3, away: 1 },
    extra: volleyballSetExtras,
    expected: "won",
  },
  {
    name: "volleyball set winner is settled as won",
    selection: makeSelection("set1-home"),
    ft: { home: 3, away: 1 },
    extra: {
      extras: {
        volleyball: {
          sets: [
            [25, 21],
            [22, 25],
            [25, 18],
            [25, 19],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "volleyball exact score 3-1 home is settled as won",
    selection: makeSelection("vs-s31"),
    ft: { home: 3, away: 1 },
    extra: {
      extras: {
        homeScore: { current: 3 },
        awayScore: { current: 1 },
      },
    },
    expected: "won",
  },
  {
    name: "volleyball set handicap home is settled as won",
    selection: makeSelection("hcap-vb-home"),
    ft: { home: 3, away: 1 },
    extra: {
      extras: {
        homeScore: { current: 3 },
        awayScore: { current: 1 },
      },
    },
    expected: "won",
  },
  {
    name: "volleyball home points handicap is settled as won",
    selection: makeSelection("pth", { marketLine: -5.5 }),
    ft: { home: 3, away: 1 },
    extra: volleyballSetExtras,
    expected: "won",
  },
];

for (const tc of volleyballCases) {
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
