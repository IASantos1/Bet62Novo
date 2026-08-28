import test from "node:test";
import assert from "node:assert/strict";

const { extractSportMonksFootballOverride } = await import(
  "../services/sportmonks/football.js"
);

function makeFixture(odds: unknown[]) {
  return {
    id: 19621849,
    name: "Fluminense vs Remo",
    starting_at: "2026-08-22 19:00:00",
    starting_at_timestamp: 1787425200,
    state_id: 5,
    odds,
  } as Parameters<typeof extractSportMonksFootballOverride>[0];
}

const bet365 = { id: 2, legacy_id: 2, name: "bet365" };
const fulltimeResultMarket = {
  id: 1,
  legacy_id: 1,
  name: "Fulltime Result",
  developer_name: "FULLTIME_RESULT",
  has_winning_calculations: true,
};

// Real GET /v3/football/rounds/396699 sample (2026-08-28, Brazilian Série A,
// a finished fixture) — this bookmaker/league combo uses "Home"/"Draw"/"Away"
// labels with `name` null, but a consistently-normalized `original_label`
// ("1"/"Draw"/"2").
test("extractSportMonksFootballOverride: Fulltime Result via original_label (Home/Draw/Away labels, name null)", () => {
  const odds = [
    {
      market_id: 1,
      bookmaker_id: 2,
      label: "Away",
      value: "8.50",
      name: null,
      original_label: "2",
      market: fulltimeResultMarket,
      bookmaker: bet365,
    },
    {
      market_id: 1,
      bookmaker_id: 2,
      label: "Draw",
      value: "4.00",
      name: null,
      original_label: "Draw",
      market: fulltimeResultMarket,
      bookmaker: bet365,
    },
    {
      market_id: 1,
      bookmaker_id: 2,
      label: "Home",
      value: "1.45",
      name: null,
      original_label: "1",
      market: fulltimeResultMarket,
      bookmaker: bet365,
    },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.odds, { home: 1.45, draw: 4.0, away: 8.5 });
});

// Real live GET .../fixtures.odds sample (2026-08-28, Bodø/Glimt v NEC) — the
// SAME market (developer_name FULLTIME_RESULT) here uses "1"/"X"/"2" labels
// instead, with the team name carried in `name` and no original_label at
// all — confirms the label-vocabulary quirk the extraction has to handle.
test("extractSportMonksFootballOverride: Fulltime Result via 1/X/2 labels (name carries team, no original_label)", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 2, label: "1", value: "1.22", name: "Bodo/Glimt", market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "X", value: "6.00", name: "Draw", market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "2", value: "10.00", name: "NEC", market: fulltimeResultMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.odds, { home: 1.22, draw: 6.0, away: 10.0 });
});

test("extractSportMonksFootballOverride: Double Chance (1X/X2/12)", () => {
  const doubleChanceMarket = {
    id: 2, legacy_id: 63, name: "Double Chance", developer_name: "DOUBLE_CHANCE", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 2, bookmaker_id: 2, label: "1X", value: "1.03", name: "Bodo/Glimt or Draw", market: doubleChanceMarket, bookmaker: bet365 },
    { market_id: 2, bookmaker_id: 2, label: "X2", value: "4.00", name: "NEC or Draw", market: doubleChanceMarket, bookmaker: bet365 },
    { market_id: 2, bookmaker_id: 2, label: "12", value: "1.11", name: "Bodo/Glimt or NEC", market: doubleChanceMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.doubleChance, { homeOrDraw: 1.03, awayOrDraw: 4.0, homeOrAway: 1.11 });
});

// Confirmed real data only ever showed a "Yes" row for this market (no "No"
// row observed) — the extraction must not half-populate bothTeamsScore from
// a single side.
test("extractSportMonksFootballOverride: Both Teams To Score stays unset without both Yes and No", () => {
  const bttsMarket = {
    id: 14, legacy_id: 976105, name: "Both Teams To Score", developer_name: "BOTH_TEAMS_TO_SCORE", has_winning_calculations: true,
  };
  const odds = [
    { market_id: 14, bookmaker_id: 2, label: "Yes", value: "2.37", name: null, market: bttsMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.equal(out.bothTeamsScore, undefined);
});

test("extractSportMonksFootballOverride: Draw No Bet (home/away)", () => {
  const dnbMarket = {
    id: 10, legacy_id: 137918013, name: "Draw No Bet", developer_name: "DRAW_NO_BET", has_winning_calculations: true,
  };
  const odds = [
    { market_id: 10, bookmaker_id: 2, label: "1", value: "1.06", name: "Bodo/Glimt", market: dnbMarket, bookmaker: bet365 },
    { market_id: 10, bookmaker_id: 2, label: "2", value: "8.00", name: "NEC", market: dnbMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.drawNoBet, { home: 1.06, away: 8.0 });
});

// Match Goals (line 2.5) merged with Alternative Match Goals (line 0.5) into
// the same fixed totalGoals ladder — confirms both developer_names feed the
// same output field.
test("extractSportMonksFootballOverride: Match Goals + Alternative Match Goals merge into the totalGoals ladder", () => {
  const matchGoalsMarket = {
    id: 4, legacy_id: 28077, name: "Match Goals", developer_name: "MATCH_GOALS", has_winning_calculations: false,
  };
  const altMatchGoalsMarket = {
    id: 5, legacy_id: 136703813, name: "Alternative Match Goals", developer_name: "ALTERNATIVE_MATCH_GOALS", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 4, bookmaker_id: 2, label: "Over", value: "1.66", name: null, total: "2.5", market: matchGoalsMarket, bookmaker: bet365 },
    { market_id: 4, bookmaker_id: 2, label: "Under", value: "2.10", name: null, total: "2.5", market: matchGoalsMarket, bookmaker: bet365 },
    { market_id: 5, bookmaker_id: 2, label: "Over", value: "1.03", name: null, total: "0.5", market: altMatchGoalsMarket, bookmaker: bet365 },
    { market_id: 5, bookmaker_id: 2, label: "Under", value: "10.00", name: null, total: "0.5", market: altMatchGoalsMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.totalGoals, { over25: 1.66, under25: 2.1, over05: 1.03, under05: 10.0 });
});

// Real Total Corners line seen live was a whole number ("8"), not one of the
// fixed half-lines (8.5/9.5/10.5) the ladder maps — confirms an unrecognized
// line is silently skipped rather than half-populating the ladder, same
// tolerant behavior pulsescore/football.ts's own corners extraction uses.
test("extractSportMonksFootballOverride: Total Corners at an unmapped whole-number line stays unset", () => {
  const cornersMarket = {
    id: 68, legacy_id: 136703818, name: "Total Corners", developer_name: "TOTAL_CORNERS", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 68, bookmaker_id: 2, label: "Over", value: "1.25", name: null, total: "8", market: cornersMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.equal(out.corners, undefined);
});

test("extractSportMonksFootballOverride: Number of Cards at the 4.5 line", () => {
  const cardsMarket = {
    id: 255, legacy_id: 136704329, name: "Number of Cards", developer_name: "NUMBER_OF_CARDS", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 255, bookmaker_id: 2, label: "Over", value: "1.61", name: null, total: "4.5", market: cardsMarket, bookmaker: bet365 },
    { market_id: 255, bookmaker_id: 2, label: "Under", value: "2.20", name: null, total: "4.5", market: cardsMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.cards, { o45: 1.61, u45: 2.2 });
});

test("extractSportMonksFootballOverride: a suspended odd is excluded", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 2, label: "1", value: "1.22", name: "Bodo/Glimt", suspended: true, market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "X", value: "6.00", name: "Draw", market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "2", value: "10.00", name: "NEC", market: fulltimeResultMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.odds, { home: null, draw: 6.0, away: 10.0 });
});

test("extractSportMonksFootballOverride: a different bookmaker_id is ignored", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 999, label: "1", value: "1.22", name: "Bodo/Glimt", market: fulltimeResultMarket, bookmaker: { id: 999, legacy_id: 999, name: "other" } },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.equal(out.odds, undefined);
});
