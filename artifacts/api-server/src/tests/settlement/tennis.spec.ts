import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectionSettlement } from "../../settlement.js";
import { makeSelection, type FinishedSettlementCase } from "./helpers.js";

const tennisCases: FinishedSettlementCase[] = [
  {
    name: "tennis total sets over 2.5 is settled as won",
    selection: makeSelection("total-sets-o2.5"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [3, 6],
            [6, 2],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis compact total sets alias is settled as won",
    selection: makeSelection("ts-o25"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [3, 6],
            [6, 2],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis first set even games is settled as won",
    selection: makeSelection("oe1-even"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis total games odd is settled as won",
    selection: makeSelection("oe-odd"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 3],
            [6, 4],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis total games even is settled as won",
    selection: makeSelection("oe-even"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 2],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis first set odd games is settled as won",
    selection: makeSelection("oe1-odd"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 3],
            [6, 4],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis second set even games is settled as won",
    selection: makeSelection("oe2-even"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 2],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis second set odd games is settled as won",
    selection: makeSelection("oe2-odd"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis set plus match combo is settled as won",
    selection: makeSelection("sm2-11"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [4, 6],
            [6, 2],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis set plus match combo sm2-12 is settled as won",
    selection: makeSelection("sm2-12"),
    ft: { home: 1, away: 2 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [3, 6],
            [4, 6],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis set plus match combo sm2-21 is settled as won",
    selection: makeSelection("sm2-21"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [4, 6],
            [6, 3],
            [6, 2],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis set plus match combo sm2-22 is settled as won",
    selection: makeSelection("sm2-22"),
    ft: { home: 0, away: 2 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [4, 6],
            [3, 6],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis exact sets 2-0 home is settled as won",
    selection: makeSelection("es-h20"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis set handicap home -1.5 is settled as won",
    selection: makeSelection("sh15-home"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis compact set winner alias is settled as won",
    selection: makeSelection("s1-home"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis game handicap home -2.5 is settled as won",
    selection: makeSelection("gh-home-2.5"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis game handicap alias with label line is settled as won",
    selection: makeSelection("gh-home", { label: "Home -2.5" }),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis total games alias is settled as won",
    selection: makeSelection("total-games-o21.5"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [3, 6],
            [6, 4],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis total games over 21.5 is settled as won",
    selection: makeSelection("tg-o-21.5"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [3, 6],
            [6, 4],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis first set games over 9.5 is settled as won",
    selection: makeSelection("s1g-o-9.5"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [7, 5],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis games set alias is settled as won",
    selection: makeSelection("games-set1-o-9.5"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [7, 5],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis first set exact score 6-4 is settled as won",
    selection: makeSelection("sc1-6-4"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis away wins at least one set no is settled as won",
    selection: makeSelection("wal2-no"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis home wins at least one set yes is settled as won",
    selection: makeSelection("wal1-yes"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [3, 6],
            [6, 2],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis home wins at least one set no is settled as won",
    selection: makeSelection("wal1-no"),
    ft: { home: 0, away: 2 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [4, 6],
            [3, 6],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis away wins at least one set yes is settled as won",
    selection: makeSelection("wal2-yes"),
    ft: { home: 1, away: 2 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 4],
            [3, 6],
            [4, 6],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    // Regression: a set still in progress (5-4) must never be read as a
    // loss just because it doesn't yet equal the backed exact score.
    name: "tennis legacy exact set score stays pending while the set is still in progress",
    selection: makeSelection("set-6-3"),
    ft: { home: 0, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [[5, 4]],
        },
      },
    },
    expected: null,
  },
  {
    name: "tennis legacy exact set score is settled as won once the set finishes on that score",
    selection: makeSelection("set-6-3"),
    ft: { home: 1, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [[6, 3]],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis legacy exact set score is settled as lost once the match is over without that score",
    selection: makeSelection("set-6-3"),
    ft: { home: 1, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [[6, 4]],
        },
      },
    },
    expected: "lost",
  },
];

for (const tc of tennisCases) {
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
