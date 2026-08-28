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
    name: "tennis 2nd set exact score 4-6 is settled as won",
    selection: makeSelection("sc2-4-6"),
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
    name: "tennis 2nd set game handicap home -2.5 is settled as won",
    selection: makeSelection("gh2-home-2.5"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [4, 6],
            [6, 3],
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "tennis 2nd set game handicap does not settle off the 1st set's score",
    selection: makeSelection("gh2-home-2.5"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 0],
            [6, 4],
          ],
        },
      },
    },
    expected: "lost",
  },
  {
    name: "tennis 2nd set home player total games over is settled as won",
    selection: makeSelection("hpg2-o", { marketLine: 5.5 }),
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
    name: "tennis 2nd set away player total games under is settled as won",
    selection: makeSelection("apg2-u", { marketLine: 4.5 }),
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
  // Note: an impossible set score (e.g. 7-4, 8-1 — see
  // isImpossibleTennisGameState in settlement.ts) is handled by the
  // dedicated void-immediately check below ("exact set score voids on an
  // impossible ... game count"), not by staying pending — a corrupt final
  // result should not sit stuck until the 72h no-result timeout.
  {
    name: "tennis correct set score settles as won on a valid extended advantage set",
    selection: makeSelection("sc1-9-7"),
    ft: { home: 1, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [[9, 7]],
        },
      },
    },
    expected: "won",
  },
  // Regression: an impossible set score anywhere in the match (a wider
  // margin than tennis allows once past 6 games) voids the ticket instead
  // of leaving it stuck pending until the 72h no-result timeout.
  {
    name: "tennis exact set score voids when a later set in the match is corrupt",
    selection: makeSelection("sc1-6-3"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        tennis: {
          sets: [
            [6, 3],
            [7, 4], // impossible — can never occur in a real set
          ],
        },
      },
    },
    expected: "void",
  },
  {
    name: "tennis exact set score voids on an impossible 8-1 game count",
    selection: makeSelection("sc1-6-3"),
    ft: { home: 1, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [[8, 1]],
        },
      },
    },
    expected: "void",
  },
  // A wide margin below 6 games is completely normal (6-0, 6-1, 6-2 are
  // all real scores) — must not be confused with the "past 6, gap > 2"
  // corruption check above.
  {
    name: "tennis exact set score settles normally on a clean 6-2 finish",
    selection: makeSelection("sc1-6-2"),
    ft: { home: 1, away: 0 },
    extra: {
      extras: {
        tennis: {
          sets: [[6, 2]],
        },
      },
    },
    expected: "won",
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
