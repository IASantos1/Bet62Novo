import test from "node:test";
import assert from "node:assert/strict";

import { buildLiveSettlementScore, resolveSelectionSettlement } from "../../settlement.js";
import { makeSelection, type FinishedSettlementCase } from "./helpers.js";

const hockeyCases: FinishedSettlementCase[] = [
  {
    name: "hockey shots on goal over is settled as won",
    selection: makeSelection("sog-o-60.5"),
    ft: { home: 3, away: 2 },
    extra: {
      extras: {
        hockey: {
          teamStats: {
            home: { shotsOnGoal: 34 },
            away: { shotsOnGoal: 29 },
          },
        },
      },
    },
    expected: "won",
  },
  {
    name: "hockey shots on goal exact line is settled as void",
    selection: makeSelection("sog-o-63"),
    ft: { home: 3, away: 2 },
    extra: {
      extras: {
        hockey: {
          teamStats: {
            home: { shotsOnGoal: 33 },
            away: { shotsOnGoal: 30 },
          },
        },
      },
    },
    expected: "void",
  },
  {
    name: "hockey first period home is settled as won",
    selection: makeSelection("p1-home"),
    ft: { home: 3, away: 1 },
    extra: {
      extras: {
        hockey: {
          periods: [
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
    name: "hockey period alias is settled as won",
    selection: makeSelection("per1-home"),
    ft: { home: 3, away: 1 },
    extra: {
      extras: {
        hockey: {
          periods: [
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
    name: "hockey second period total over 1.5 is settled as won",
    selection: makeSelection("p2t-o-1.5"),
    ft: { home: 3, away: 1 },
    extra: {
      extras: {
        hockey: {
          periods: [
            [1, 0],
            [1, 1],
            [1, 0],
          ],
        },
      },
    },
    expected: "won",
  },
];

for (const tc of hockeyCases) {
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

test("live hockey score builder extracts shots on goal total", () => {
  const score = buildLiveSettlementScore({
    homeScore: 2,
    awayScore: 1,
    status: "live",
    _liveExtra: {
      periods: [
        [1, 0],
        [1, 1],
      ],
      shotsOnGoalTotal: 63,
    },
  } as any);

  assert.ok(score);
  assert.equal(score?.hockeyShotsOnGoalTotal, 63);
});
