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
  // Regression (2026-08-15): a favored team's spread line is negative
  // (e.g. "-2.5") — the old q1s-/b-q1s- regexes only matched digits, no
  // leading "-", so a negative-line selection never matched at all and sat
  // pending forever. Q1 in basketballQuarterAliasExtras is 31-25 (home by
  // 6), so "home -5.5" (home must win Q1 by MORE than 5.5) wins the same
  // way the positive-line case above does — same numbers, negative sign.
  {
    name: "basketball quarter spread with a negative line is settled as won (not stuck pending)",
    selection: makeSelection("b-q1s-home--5.5"),
    ft: { home: 101, away: 88 },
    extra: basketballQuarterAliasExtras,
    expected: "won",
  },
  {
    name: "basketball quarter spread with a negative line, bare (non-aliased) form is settled as won",
    selection: makeSelection("q1s-home--5.5"),
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
  // Regression (2026-08-27): the full-game spread key (b-spread-<side>-<magnitude>)
  // only ever carries an UNSIGNED magnitude, and the old settlement code
  // assumed home was ALWAYS the favorite regardless of which side actually
  // was — correct when it was, but graded BOTH sides backwards whenever away
  // was the true favorite. Home wins by 3 with away truly favored -5.5: home's
  // real +5.5 (underdog, covers on the outright win) must win; away's real
  // -5.5 (favorite, needed to win by more than 5.5 but lost outright) must
  // lose. The signed marketLine is what lets settlement tell favorite from
  // underdog per side — see readSelectionMarketLine/settleAsianSideHandicapOutcome.
  {
    name: "basketball full-game spread: home underdog (+5.5) wins outright, home side settles won",
    selection: makeSelection("b-spread-home-5.5", { marketLine: 5.5 }),
    ft: { home: 53, away: 50 },
    expected: "won",
  },
  {
    name: "basketball full-game spread: away favorite (-5.5) loses outright, away side settles lost",
    selection: makeSelection("b-spread-away-5.5", { marketLine: -5.5 }),
    ft: { home: 53, away: 50 },
    expected: "lost",
  },
  // Sanity check the OTHER direction still works (home truly favored) —
  // this case already passed before the fix, confirming the fix didn't
  // flip anything that was already correct.
  {
    name: "basketball full-game spread: home favorite (-5.5) covers a 10-point win, home side settles won",
    selection: makeSelection("b-spread-home-5.5", { marketLine: -5.5 }),
    ft: { home: 100, away: 90 },
    expected: "won",
  },
  {
    name: "basketball full-game spread: away underdog (+5.5) settles lost when home covers by 10",
    selection: makeSelection("b-spread-away-5.5", { marketLine: 5.5 }),
    ft: { home: 100, away: 90 },
    expected: "lost",
  },
  {
    name: "basketball full-game spread: exact push on an integer line settles void",
    selection: makeSelection("b-spread-home-5", { marketLine: -5 }),
    ft: { home: 100, away: 95 },
    expected: "void",
  },
  // No signed source at all (bet placed before marketLine/label carried a
  // sign) — falls back to the pre-fix behavior (home assumed favorite),
  // so old already-placed bets keep settling exactly as they did before.
  {
    name: "basketball full-game spread: no signed source falls back to home-favorite assumption",
    selection: makeSelection("b-spread-home-5.5"),
    ft: { home: 100, away: 90 },
    expected: "won",
  },
  // Signed via the human-readable label instead of a stored marketLine —
  // the other supported signed source (readSelectionMarketLine falls back
  // to parseSignedSelectionLabelLine when marketLine isn't set).
  {
    name: "basketball full-game spread: sign read from label when marketLine is absent",
    selection: makeSelection("b-spread-home-5.5", { label: "Home +5.5" }),
    ft: { home: 53, away: 50 },
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
