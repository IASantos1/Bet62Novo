import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectionSettlement } from "../../settlement.js";
import { makeSelection, type FinishedSettlementCase } from "./helpers.js";

const footballCases: FinishedSettlementCase[] = [
  {
    name: "football 1x2 home is settled as won",
    selection: makeSelection("1x2-home"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football compact result alias is settled as won",
    selection: makeSelection("r:home"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football draw result is settled as won",
    selection: makeSelection("draw"),
    ft: { home: 1, away: 1 },
    expected: "won",
  },
  {
    name: "football double chance home or draw is settled as won",
    selection: makeSelection("dc-hd"),
    ft: { home: 1, away: 1 },
    expected: "won",
  },
  {
    name: "football compact double chance alias is settled as won",
    selection: makeSelection("dc:hd"),
    ft: { home: 1, away: 1 },
    expected: "won",
  },
  {
    name: "football away or draw double chance is settled as won",
    selection: makeSelection("dc-da"),
    ft: { home: 1, away: 2 },
    expected: "won",
  },
  {
    name: "football home or away double chance is settled as won",
    selection: makeSelection("homeOrAway"),
    ft: { home: 1, away: 0 },
    expected: "won",
  },
  {
    name: "football both teams to score yes is settled as won",
    selection: makeSelection("bts-yes"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football both teams to score no is settled as won",
    selection: makeSelection("bts-no"),
    ft: { home: 1, away: 0 },
    expected: "won",
  },
  {
    name: "football total goals over 2.5 is settled as won",
    selection: makeSelection("o25"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football compact total goals alias is settled as won",
    selection: makeSelection("tg:o2.5"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football goal odd is settled as won",
    selection: makeSelection("goe-odd"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football win to nil home is settled as won",
    selection: makeSelection("wtn-h"),
    ft: { home: 2, away: 0 },
    expected: "won",
  },
  {
    name: "football win to nil away is settled as won",
    selection: makeSelection("wtn-a"),
    ft: { home: 0, away: 2 },
    expected: "won",
  },
  {
    name: "football away clean sheet is settled as won",
    selection: makeSelection("cs-a"),
    ft: { home: 0, away: 1 },
    expected: "won",
  },
  {
    name: "football home clean sheet is settled as won",
    selection: makeSelection("cs-h"),
    ft: { home: 1, away: 0 },
    expected: "won",
  },
  {
    name: "football exact goals 3 is settled as won",
    selection: makeSelection("eg-g3"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football exact goals 0 is settled as won",
    selection: makeSelection("eg-g0"),
    ft: { home: 0, away: 0 },
    expected: "won",
  },
  {
    name: "football exact goals 1 is settled as won",
    selection: makeSelection("eg-g1"),
    ft: { home: 1, away: 0 },
    expected: "won",
  },
  {
    name: "football exact goals 2 is settled as won",
    selection: makeSelection("eg-g2"),
    ft: { home: 1, away: 1 },
    expected: "won",
  },
  {
    name: "football exact goals 4 is settled as won",
    selection: makeSelection("eg-g4"),
    ft: { home: 3, away: 1 },
    expected: "won",
  },
  {
    name: "football exact goals 5 plus is settled as won",
    selection: makeSelection("eg-g5plus"),
    ft: { home: 3, away: 2 },
    expected: "won",
  },
  {
    name: "football draw no bet home is void on draw",
    selection: makeSelection("dnb-home"),
    ft: { home: 1, away: 1 },
    expected: "void",
  },
  {
    name: "football draw no bet away is void on draw",
    selection: makeSelection("dnb-away"),
    ft: { home: 1, away: 1 },
    expected: "void",
  },
  {
    name: "football exact score 3-2 is settled as won",
    selection: makeSelection("cs-3-2"),
    ft: { home: 3, away: 2 },
    expected: "won",
  },
  {
    name: "football home team goals over 1.5 is settled as won",
    selection: makeSelection("tgh-o15"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football compact home team goals alias is settled as won",
    selection: makeSelection("htg:o1.5"),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football away team goals under 0.5 is settled as won",
    selection: makeSelection("tga-u05"),
    ft: { home: 2, away: 0 },
    expected: "won",
  },
  {
    name: "football compact away team goals alias is settled as won",
    selection: makeSelection("atg:u0.5"),
    ft: { home: 2, away: 0 },
    expected: "won",
  },
  {
    name: "football first goal home is settled as won",
    selection: makeSelection("fg-home"),
    ft: { home: 1, away: 0 },
    extra: { firstGoal: "home" },
    expected: "won",
  },
  {
    name: "football player goal market is settled as won",
    selection: makeSelection("pg:John Doe"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        football: {
          goals: [{ minute: 12, playerName: "John Doe" }],
        },
      },
    },
    expected: "won",
  },
  {
    name: "football player assist market is settled as won",
    selection: makeSelection("pa:John Doe"),
    ft: { home: 2, away: 0 },
    extra: {
      extras: {
        football: {
          goals: [{ minute: 12, playerName: "Finisher", assistName: "John Doe" }],
        },
      },
    },
    expected: "won",
  },
  {
    name: "football player first half card market is settled as won",
    selection: makeSelection("pc1h:John Doe"),
    ft: { home: 1, away: 0 },
    extra: {
      extras: {
        football: {
          cards: [{ minute: 24, playerName: "John Doe" }],
        },
      },
    },
    expected: "won",
  },
  {
    name: "football asian handicap home -0.25 is settled as half lost on draw",
    selection: makeSelection("ah:home", { marketLine: -0.25 }),
    ft: { home: 1, away: 1 },
    expected: "half_lost",
  },
  {
    name: "football asian handicap away +0.5 alias is settled as won",
    selection: makeSelection("ah:away", { marketLine: 0.5 }),
    ft: { home: 1, away: 2 },
    expected: "won",
  },
  {
    name: "football compact handicap home minus one is settled as won",
    selection: makeSelection("hc-hm1"),
    ft: { home: 3, away: 1 },
    expected: "won",
  },
  {
    name: "football compact handicap away plus one is settled as won",
    selection: makeSelection("hc-ap1"),
    ft: { home: 1, away: 2 },
    expected: "won",
  },
  {
    name: "football compact handicap home minus one point five is settled as won",
    selection: makeSelection("hc-hm15"),
    ft: { home: 3, away: 1 },
    expected: "won",
  },
  {
    name: "football compact handicap away plus one point five is settled as won",
    selection: makeSelection("hc-ap15"),
    ft: { home: 1, away: 2 },
    expected: "won",
  },
  {
    name: "football puck line home -1.5 alias is settled as won",
    selection: makeSelection("pl:home", { marketLine: -1.5 }),
    ft: { home: 3, away: 1 },
    expected: "won",
  },
  {
    name: "football puck line away +1.5 alias is settled as won",
    selection: makeSelection("pl:away", { marketLine: 1.5 }),
    ft: { home: 2, away: 1 },
    expected: "won",
  },
  {
    name: "football extra time home is settled as won",
    selection: makeSelection("et-home"),
    ft: { home: 1, away: 1 },
    extra: {
      extras: {
        football: {
          ftHome: 1,
          ftAway: 1,
          etHome: 1,
          etAway: 0,
        },
      },
    },
    expected: "won",
  },
  {
    name: "football extra time away is settled as won",
    selection: makeSelection("et-away"),
    ft: { home: 1, away: 1 },
    extra: {
      extras: {
        football: {
          ftHome: 1,
          ftAway: 1,
          etHome: 0,
          etAway: 1,
        },
      },
    },
    expected: "won",
  },
  {
    name: "football extra time draw is settled as won",
    selection: makeSelection("et-draw"),
    ft: { home: 1, away: 1 },
    extra: {
      extras: {
        football: {
          ftHome: 1,
          ftAway: 1,
          etHome: 0,
          etAway: 0,
        },
      },
    },
    expected: "won",
  },
  {
    name: "football extra time tie winner home is settled as won",
    selection: makeSelection("et-tw-home"),
    ft: { home: 1, away: 1 },
    extra: {
      extras: {
        football: {
          ftHome: 1,
          ftAway: 1,
          etHome: 1,
          etAway: 0,
        },
      },
    },
    expected: "won",
  },
  {
    name: "football extra time tie winner away is settled as won",
    selection: makeSelection("et-tw-away"),
    ft: { home: 1, away: 1 },
    extra: {
      extras: {
        football: {
          ftHome: 1,
          ftAway: 1,
          etHome: 0,
          etAway: 1,
        },
      },
    },
    expected: "won",
  },
  {
    name: "football penalty winner home is settled as won",
    selection: makeSelection("pen-home"),
    ft: { home: 1, away: 1 },
    extra: {
      extras: {
        football: {
          penHome: 5,
          penAway: 4,
        },
      },
    },
    expected: "won",
  },
  {
    name: "football first half home is settled as won",
    selection: makeSelection("ht-home"),
    ft: { home: 2, away: 1 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football compact first half result alias is settled as won",
    selection: makeSelection("ht:home"),
    ft: { home: 2, away: 1 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football first half draw is settled as won",
    selection: makeSelection("ht-draw"),
    ft: { home: 2, away: 2 },
    ht: { htHome: 1, htAway: 1 },
    expected: "won",
  },
  {
    name: "football first half away is settled as won",
    selection: makeSelection("ht-away"),
    ft: { home: 1, away: 2 },
    ht: { htHome: 0, htAway: 1 },
    expected: "won",
  },
  {
    name: "football first half both teams to score no is settled as won",
    selection: makeSelection("b1h-no"),
    ft: { home: 2, away: 1 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football first half both teams to score yes is settled as won",
    selection: makeSelection("b1h-yes"),
    ft: { home: 2, away: 1 },
    ht: { htHome: 1, htAway: 1 },
    expected: "won",
  },
  {
    name: "football second half both teams to score yes is settled as won",
    selection: makeSelection("b2h-yes"),
    ft: { home: 2, away: 2 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football second half both teams to score no is settled as won",
    selection: makeSelection("b2h-no"),
    ft: { home: 1, away: 0 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football win both halves home is settled as won",
    selection: makeSelection("wbh-h"),
    ft: { home: 2, away: 0 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football compact win both halves alias is settled as won",
    selection: makeSelection("twbh:h"),
    ft: { home: 2, away: 0 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football highest scoring half equal is settled as won",
    selection: makeSelection("hsf-e"),
    ft: { home: 2, away: 2 },
    ht: { htHome: 1, htAway: 1 },
    expected: "won",
  },
  {
    name: "football compact highest scoring half alias is settled as won",
    selection: makeSelection("hsh:eq"),
    ft: { home: 2, away: 2 },
    ht: { htHome: 1, htAway: 1 },
    expected: "won",
  },
  {
    name: "football second half away is settled as won",
    selection: makeSelection("2h-away"),
    ft: { home: 1, away: 2 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football compact second half result alias is settled as won",
    selection: makeSelection("sh:away"),
    ft: { home: 1, away: 2 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football second half over 1.5 goals is settled as won",
    selection: makeSelection("2h-o15g"),
    ft: { home: 3, away: 0 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football second half correct score 2-0 is settled as won",
    selection: makeSelection("h2cs-2-0"),
    ft: { home: 3, away: 0 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football corners exact line is settled as void",
    selection: makeSelection("corners-o10"),
    ft: { home: 1, away: 0 },
    extra: { cornersTotal: 10 },
    expected: "void",
  },
  {
    name: "football compact corners alias is settled as won",
    selection: makeSelection("cn:o10.5"),
    ft: { home: 1, away: 0 },
    extra: { cornersTotal: 11 },
    expected: "won",
  },
  {
    name: "football first half cards over is settled as won",
    selection: makeSelection("1hcard-o2"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        football: {
          cards: [
            { minute: 10, playerName: "A" },
            { minute: 20, playerName: "B" },
            { minute: 42, playerName: "C" },
            { minute: 76, playerName: "D" },
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "football compact cards alias is settled as won",
    selection: makeSelection("cd:o4.5"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        football: {
          cards: [
            { minute: 10, playerName: "A" },
            { minute: 20, playerName: "B" },
            { minute: 42, playerName: "C" },
            { minute: 76, playerName: "D" },
            { minute: 83, playerName: "E" },
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "football compact first half cards alias is settled as won",
    selection: makeSelection("cd1h:o2.5"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        football: {
          cards: [
            { minute: 10, playerName: "A" },
            { minute: 20, playerName: "B" },
            { minute: 42, playerName: "C" },
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "football compact second half cards alias is settled as won",
    selection: makeSelection("cd2h:u1.5"),
    ft: { home: 2, away: 1 },
    extra: {
      extras: {
        football: {
          cards: [
            { minute: 10, playerName: "A" },
            { minute: 20, playerName: "B" },
            { minute: 42, playerName: "C" },
            { minute: 76, playerName: "D" },
          ],
        },
      },
    },
    expected: "won",
  },
  {
    name: "football htft hh is settled as won",
    selection: makeSelection("htft-hh"),
    ft: { home: 2, away: 1 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football compact htft alias is settled as won",
    selection: makeSelection("htft:hh"),
    ft: { home: 2, away: 1 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
  {
    name: "football halftime correct score dynamic market is settled as won",
    selection: makeSelection("htcs-1-0"),
    ft: { home: 2, away: 1 },
    ht: { htHome: 1, htAway: 0 },
    expected: "won",
  },
];

for (const tc of footballCases) {
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
