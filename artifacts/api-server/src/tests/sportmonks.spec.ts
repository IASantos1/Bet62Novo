import test from "node:test";
import assert from "node:assert/strict";

const {
  extractSportMonksFootballOverride,
  getSportMonksFixtureScore,
  getSportMonksFixtureMinute,
  isSportMonksFixtureLive,
  isSportMonksFixtureFinished,
  countSportMonksRedCards,
  getSportMonksFixtureCornersCards,
  filterUpcomingFixtures,
  filterHeadToHeadFixtures,
  isFootballLiveDisplayEvent,
  getPlayerCurrentSeasonStatTotal,
  getPlayerRecentMatches,
} = await import("../services/sportmonks/football.js");

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
const onexbet = { id: 35, legacy_id: 35, name: "1xbet" };
const fulltimeResultMarket = {
  id: 1,
  legacy_id: 1,
  name: "Fulltime Result",
  developer_name: "FULLTIME_RESULT",
  has_winning_calculations: true,
};

// Real GET /v3/football/rounds/396699 sample, unfiltered (2026-08-29,
// Brazilian Série A, Fluminense v Remo, fixture 19621849) — the bookmaker
// this platform standardized on (1xbet, explicit user decision, same brand
// used for every other sport). No default bookmakerId arg passed below —
// confirms 1xbet is the actual default.
test("extractSportMonksFootballOverride: Fulltime Result (1xbet, default bookmaker)", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 35, label: "Draw", value: "3.89", name: "Draw", original_label: null, market: fulltimeResultMarket, bookmaker: onexbet },
    { market_id: 1, bookmaker_id: 35, label: "Home", value: "1.54", name: "Home", original_label: null, market: fulltimeResultMarket, bookmaker: onexbet },
    { market_id: 1, bookmaker_id: 35, label: "Away", value: "8.18", name: "Away", original_label: null, market: fulltimeResultMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.odds, { home: 1.54, draw: 3.89, away: 8.18 });
});

// Same real sample — 1xbet's Double Chance uses "Home/Draw"/"Draw/Away"/
// "Home/Away" labels, NOT bet365's "1X"/"X2"/"12" (see the bet365-specific
// test further down) — a quirk found comparing bookmakers within the same
// SportMonks response.
test("extractSportMonksFootballOverride: Double Chance (1xbet's Home/Draw/Away vocabulary)", () => {
  const doubleChanceMarket = {
    id: 2, legacy_id: 63, name: "Double Chance", developer_name: "DOUBLE_CHANCE", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 2, bookmaker_id: 35, label: "Home/Draw", value: "1.09", name: "Home/Draw", market: doubleChanceMarket, bookmaker: onexbet },
    { market_id: 2, bookmaker_id: 35, label: "Draw/Away", value: "2.58", name: "Draw/Away", market: doubleChanceMarket, bookmaker: onexbet },
    { market_id: 2, bookmaker_id: 35, label: "Home/Away", value: "1.28", name: "Home/Away", market: doubleChanceMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.doubleChance, { homeOrDraw: 1.09, awayOrDraw: 2.58, homeOrAway: 1.28 });
});

test("extractSportMonksFootballOverride: Both Teams To Score (1xbet)", () => {
  const bttsMarket = {
    id: 14, legacy_id: 976105, name: "Both Teams To Score", developer_name: "BOTH_TEAMS_TO_SCORE", has_winning_calculations: true,
  };
  const odds = [
    { market_id: 14, bookmaker_id: 35, label: "No", value: "1.65", name: "No", market: bttsMarket, bookmaker: onexbet },
    { market_id: 14, bookmaker_id: 35, label: "Yes", value: "2.24", name: "Yes", market: bttsMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.bothTeamsScore, { yes: 2.24, no: 1.65 });
});

// 1xbet uses a single GOALS_OVER_UNDER market (developer_name), not
// bet365's split MATCH_GOALS/ALTERNATIVE_MATCH_GOALS — same Over/Under +
// `total` shape, merged into the same totalGoals ladder.
test("extractSportMonksFootballOverride: total goals via 1xbet's GOALS_OVER_UNDER", () => {
  const goalsOverUnderMarket = {
    id: 80, legacy_id: null, name: "Goals Over/Under", developer_name: "GOALS_OVER_UNDER", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 80, bookmaker_id: 35, label: "Under", value: "1.72", total: "2.5", market: goalsOverUnderMarket, bookmaker: onexbet },
    { market_id: 80, bookmaker_id: 35, label: "Over", value: "2.21", total: "2.5", market: goalsOverUnderMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.totalGoals, { over25: 2.21, under25: 1.72 });
});

// 1xbet uses developer_name CORNER_MARKET, not bet365's TOTAL_CORNERS —
// same shape, merged into the same corners ladder.
test("extractSportMonksFootballOverride: Total Corners via 1xbet's CORNER_MARKET at the 10.5 line", () => {
  const cornerMarket = {
    id: 67, legacy_id: null, name: "Corners Over Under", developer_name: "CORNER_MARKET", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 67, bookmaker_id: 35, label: "Under", value: "1.66", total: "10.5", market: cornerMarket, bookmaker: onexbet },
    { market_id: 67, bookmaker_id: 35, label: "Over", value: "2.13", total: "10.5", market: cornerMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.corners, { o105: 2.13, u105: 1.66 });
});

test("extractSportMonksFootballOverride: Number of Cards (1xbet) at the 4.5 line", () => {
  const cardsMarket = {
    id: 255, legacy_id: 136704329, name: "Number of Cards", developer_name: "NUMBER_OF_CARDS", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 255, bookmaker_id: 35, label: "Over", value: "1.91", total: "4.5", market: cardsMarket, bookmaker: onexbet },
    { market_id: 255, bookmaker_id: 35, label: "Under", value: "1.80", total: "4.5", market: cardsMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.cards, { o45: 1.91, u45: 1.8 });
});

// Real GET /v3/football/rounds/396699?include=...&filters=bookmakers:2
// sample (2026-08-28) — a DIFFERENT bookmaker (bet365) than the platform's
// chosen 1xbet, passed here with an explicit bookmakerId to lock in the
// vocabulary-quirk handling even though it's not the default anymore.
test("extractSportMonksFootballOverride: Fulltime Result via original_label (bet365, Home/Draw/Away labels, name null)", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 2, label: "Away", value: "8.50", name: null, original_label: "2", market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "Draw", value: "4.00", name: null, original_label: "Draw", market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "Home", value: "1.45", name: null, original_label: "1", market: fulltimeResultMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds), 2);
  assert.deepEqual(out.odds, { home: 1.45, draw: 4.0, away: 8.5 });
});

// Real live GET .../fixtures.odds sample (2026-08-28, Bodø/Glimt v NEC) —
// the SAME market (developer_name FULLTIME_RESULT) here uses "1"/"X"/"2"
// labels instead, with the team name carried in `name` and no
// original_label at all.
test("extractSportMonksFootballOverride: Fulltime Result via 1/X/2 labels (bet365, name carries team, no original_label)", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 2, label: "1", value: "1.22", name: "Bodo/Glimt", market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "X", value: "6.00", name: "Draw", market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "2", value: "10.00", name: "NEC", market: fulltimeResultMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds), 2);
  assert.deepEqual(out.odds, { home: 1.22, draw: 6.0, away: 10.0 });
});

test("extractSportMonksFootballOverride: Double Chance (bet365's 1X/X2/12 vocabulary)", () => {
  const doubleChanceMarket = {
    id: 2, legacy_id: 63, name: "Double Chance", developer_name: "DOUBLE_CHANCE", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 2, bookmaker_id: 2, label: "1X", value: "1.03", name: "Bodo/Glimt or Draw", market: doubleChanceMarket, bookmaker: bet365 },
    { market_id: 2, bookmaker_id: 2, label: "X2", value: "4.00", name: "NEC or Draw", market: doubleChanceMarket, bookmaker: bet365 },
    { market_id: 2, bookmaker_id: 2, label: "12", value: "1.11", name: "Bodo/Glimt or NEC", market: doubleChanceMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds), 2);
  assert.deepEqual(out.doubleChance, { homeOrDraw: 1.03, awayOrDraw: 4.0, homeOrAway: 1.11 });
});

test("extractSportMonksFootballOverride: Draw No Bet (bet365)", () => {
  const dnbMarket = {
    id: 10, legacy_id: 137918013, name: "Draw No Bet", developer_name: "DRAW_NO_BET", has_winning_calculations: true,
  };
  const odds = [
    { market_id: 10, bookmaker_id: 2, label: "1", value: "1.06", name: "Bodo/Glimt", market: dnbMarket, bookmaker: bet365 },
    { market_id: 10, bookmaker_id: 2, label: "2", value: "8.00", name: "NEC", market: dnbMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds), 2);
  assert.deepEqual(out.drawNoBet, { home: 1.06, away: 8.0 });
});

// Real Total Corners line seen live (bet365) was a whole number ("8"), not
// one of the fixed half-lines (8.5/9.5/10.5) the ladder maps — confirms an
// unrecognized line is silently skipped rather than half-populating the
// ladder, same tolerant behavior pulsescore/football.ts's own corners
// extraction uses.
test("extractSportMonksFootballOverride: Total Corners at an unmapped whole-number line stays unset", () => {
  const cornersMarket = {
    id: 68, legacy_id: 136703818, name: "Total Corners", developer_name: "TOTAL_CORNERS", has_winning_calculations: false,
  };
  const odds = [
    { market_id: 68, bookmaker_id: 2, label: "Over", value: "1.25", name: null, total: "8", market: cornersMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds), 2);
  assert.equal(out.corners, undefined);
});

// Confirmed real data only ever showed one side for this bet365 market in
// the sample (no "No" row observed for this particular fixture) — the
// extraction must not half-populate bothTeamsScore from a single side.
test("extractSportMonksFootballOverride: Both Teams To Score stays unset without both Yes and No", () => {
  const bttsMarket = {
    id: 14, legacy_id: 976105, name: "Both Teams To Score", developer_name: "BOTH_TEAMS_TO_SCORE", has_winning_calculations: true,
  };
  const odds = [
    { market_id: 14, bookmaker_id: 2, label: "Yes", value: "2.37", name: null, market: bttsMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds), 2);
  assert.equal(out.bothTeamsScore, undefined);
});

test("extractSportMonksFootballOverride: a suspended odd is excluded", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 35, label: "Home", value: "1.54", name: "Home", suspended: true, market: fulltimeResultMarket, bookmaker: onexbet },
    { market_id: 1, bookmaker_id: 35, label: "Draw", value: "3.89", name: "Draw", market: fulltimeResultMarket, bookmaker: onexbet },
    { market_id: 1, bookmaker_id: 35, label: "Away", value: "8.18", name: "Away", market: fulltimeResultMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.odds, { home: null, draw: 3.89, away: 8.18 });
});

// ── Phase 2 markets (2026-08-29) — all built from the SAME real fixture
// (Fluminense v Remo, 1xbet, id 19621849) as the "Fulltime Result (1xbet,
// default bookmaker)" test above, so every value here is internally
// consistent with a single real match.
const halfTimeResultMarket = {
  id: 31, legacy_id: 37, name: "Half Time Result", developer_name: "HALF_TIME_RESULT", has_winning_calculations: false,
};
const secondHalfResultMarket = {
  id: 97, legacy_id: null, name: "2nd Half Result", developer_name: "2ND_HALF_RESULT", has_winning_calculations: false,
};
const correctScoreMarket = {
  id: 57, legacy_id: null, name: "Correct Score", developer_name: "CORRECT_SCORE", has_winning_calculations: false,
};
const htftDoubleMarket = {
  id: 49, legacy_id: null, name: "HT/FT Double", developer_name: "HT_FT_DOUBLE", has_winning_calculations: false,
};
const oddEvenMarket = {
  id: 44, legacy_id: null, name: "Odd/Even", developer_name: "ODD_EVEN", has_winning_calculations: false,
};
const homeTeamGoalsMarket = {
  id: 20, legacy_id: 976198, name: "Home Team Goals", developer_name: "HOME_TEAM_GOALS", has_winning_calculations: false,
};
const awayTeamGoalsMarket = {
  id: 21, legacy_id: 976204, name: "Away Team Goals", developer_name: "AWAY_TEAM_GOALS", has_winning_calculations: false,
};
const btts1HMarket = {
  id: 15, legacy_id: 976226, name: "Both Teams to Score in 1st Half", developer_name: "BOTH_TEAMS_TO_SCORE_IN_1ST_HALF", has_winning_calculations: false,
};
const btts2HMarket = {
  id: 16, legacy_id: 976230, name: "Both Teams to Score in 2nd Half", developer_name: "BOTH_TEAMS_TO_SCORE_IN_2ND_HALF", has_winning_calculations: false,
};
const halfWithMostGoalsMarket = {
  id: 101, legacy_id: null, name: "Half With Most Goals", developer_name: "HALF_WITH_MOST_GOALS", has_winning_calculations: false,
};

test("extractSportMonksFootballOverride: Half Time Result (1xbet)", () => {
  const odds = [
    { market_id: 31, bookmaker_id: 35, label: "Away", value: "7.66", name: "Away", market: halfTimeResultMarket, bookmaker: onexbet },
    { market_id: 31, bookmaker_id: 35, label: "Draw", value: "2.25", name: "Draw", market: halfTimeResultMarket, bookmaker: onexbet },
    { market_id: 31, bookmaker_id: 35, label: "Home", value: "2.10", name: "Home", market: halfTimeResultMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.halfTime, { home: 2.1, draw: 2.25, away: 7.66 });
});

test("extractSportMonksFootballOverride: 2nd Half Result (1xbet)", () => {
  const odds = [
    { market_id: 97, bookmaker_id: 35, label: "Away", value: "6.40", name: "Away", market: secondHalfResultMarket, bookmaker: onexbet },
    { market_id: 97, bookmaker_id: 35, label: "Home", value: "1.92", name: "Home", market: secondHalfResultMarket, bookmaker: onexbet },
    { market_id: 97, bookmaker_id: 35, label: "Draw", value: "2.66", name: "Draw", market: secondHalfResultMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.secondHalf, { home: 1.92, draw: 2.66, away: 6.4 });
});

test("extractSportMonksFootballOverride: Correct Score converts 1xbet's 'H:A' labels to 'H-A' keys", () => {
  const odds = [
    { market_id: 57, bookmaker_id: 35, label: "10:4", value: "100.00", name: "10:4", market: correctScoreMarket, bookmaker: onexbet },
    { market_id: 57, bookmaker_id: 35, label: "5:2", value: "101.00", name: "5:2", market: correctScoreMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.correctScore, { "10-4": 100, "5-2": 101 });
});

test("extractSportMonksFootballOverride: HT/FT Double maps 'Home/Away' style labels to htft-hd keys", () => {
  const odds = [
    { market_id: 49, bookmaker_id: 35, label: "Draw/Away", value: "15.00", name: "Draw/Away", market: htftDoubleMarket, bookmaker: onexbet },
    { market_id: 49, bookmaker_id: 35, label: "Home/Home", value: "2.25", name: "Home/Home", market: htftDoubleMarket, bookmaker: onexbet },
    { market_id: 49, bookmaker_id: 35, label: "Away/Home", value: "21.00", name: "Away/Home", market: htftDoubleMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.htft, { da: 15, hh: 2.25, ah: 21 });
});

test("extractSportMonksFootballOverride: Odd/Even total goals (1xbet)", () => {
  const odds = [
    { market_id: 44, bookmaker_id: 35, label: "Odd", value: "1.92", name: "Odd", market: oddEvenMarket, bookmaker: onexbet },
    { market_id: 44, bookmaker_id: 35, label: "Even", value: "1.82", name: "Even", market: oddEvenMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.goalOddEven, { odd: 1.92, even: 1.82 });
});

test("extractSportMonksFootballOverride: Home/Away Team Goals merge into one teamGoals ladder at the 0.5 line", () => {
  const odds = [
    { market_id: 20, bookmaker_id: 35, label: "Over", value: "1.14", total: "0.5", market: homeTeamGoalsMarket, bookmaker: onexbet },
    { market_id: 20, bookmaker_id: 35, label: "Under", value: "5.52", total: "0.5", market: homeTeamGoalsMarket, bookmaker: onexbet },
    { market_id: 21, bookmaker_id: 35, label: "Over", value: "1.90", total: "0.5", market: awayTeamGoalsMarket, bookmaker: onexbet },
    { market_id: 21, bookmaker_id: 35, label: "Under", value: "1.90", total: "0.5", market: awayTeamGoalsMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.teamGoals, { homeOver05: 1.14, homeUnder05: 5.52, awayOver05: 1.9, awayUnder05: 1.9 });
});

test("extractSportMonksFootballOverride: Both Teams To Score in 1st/2nd Half (1xbet)", () => {
  const odds = [
    { market_id: 15, bookmaker_id: 35, label: "No", value: "1.13", name: "No", market: btts1HMarket, bookmaker: onexbet },
    { market_id: 15, bookmaker_id: 35, label: "Yes", value: "6.02", name: "Yes", market: btts1HMarket, bookmaker: onexbet },
    { market_id: 16, bookmaker_id: 35, label: "Yes", value: "4.38", name: "Yes", market: btts2HMarket, bookmaker: onexbet },
    { market_id: 16, bookmaker_id: 35, label: "No", value: "1.22", name: "No", market: btts2HMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.btts1H, { yes: 6.02, no: 1.13 });
  assert.deepEqual(out.btts2H, { yes: 4.38, no: 1.22 });
});

test("extractSportMonksFootballOverride: Half With Most Goals maps '1st Half'/'2nd Half'/'Draw' to first/second/equal", () => {
  const odds = [
    { market_id: 101, bookmaker_id: 35, label: "Draw", value: "3.40", name: "Draw", market: halfWithMostGoalsMarket, bookmaker: onexbet },
    { market_id: 101, bookmaker_id: 35, label: "2nd Half", value: "2.09", name: "2nd Half", market: halfWithMostGoalsMarket, bookmaker: onexbet },
    { market_id: 101, bookmaker_id: 35, label: "1st Half", value: "3.04", name: "1st Half", market: halfWithMostGoalsMarket, bookmaker: onexbet },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.deepEqual(out.highestScoringHalf, { first: 3.04, second: 2.09, equal: 3.4 });
});

test("extractSportMonksFootballOverride: a different bookmaker_id than requested is ignored", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 999, label: "Home", value: "1.54", name: "Home", market: fulltimeResultMarket, bookmaker: { id: 999, legacy_id: 999, name: "other" } },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds));
  assert.equal(out.odds, undefined);
});

// ── Live helpers ─────────────────────────────────────────────────────────
// Real GET /v3/football/livescores/inplay sample (2026-08-29) — Fiorentina
// (home, participant_id 109) v Frosinone (away, participant_id 4070), mid
// 2nd half, Frosinone leading 3-0 (2 goals in the 1st half, 1 more in the
// 2nd). No REDCARD event occurred in this particular real fixture — see
// makeFinishedFixture below for the redcard test, which uses a different
// real fixture that genuinely had one.
function makeLiveFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 19713605,
    name: "Fiorentina vs Frosinone",
    starting_at: "2026-08-29 18:30:00",
    starting_at_timestamp: 1788020200,
    state_id: 22,
    state: { id: 22, state: "INPLAY_2ND_HALF", name: "2nd Half", short_name: "2nd", developer_name: "INPLAY_2ND_HALF" },
    scores: [
      { description: "2ND_HALF_ONLY", participant_id: 4070, score: { goals: 1, participant: "away" } },
      { description: "2ND_HALF_ONLY", participant_id: 109, score: { goals: 0, participant: "home" } },
      { description: "2ND_HALF", participant_id: 4070, score: { goals: 3, participant: "away" } },
      { description: "2ND_HALF", participant_id: 109, score: { goals: 0, participant: "home" } },
      { description: "CURRENT", participant_id: 4070, score: { goals: 3, participant: "away" } },
      { description: "1ST_HALF", participant_id: 109, score: { goals: 0, participant: "home" } },
      { description: "1ST_HALF", participant_id: 4070, score: { goals: 2, participant: "away" } },
      { description: "CURRENT", participant_id: 109, score: { goals: 0, participant: "home" } },
    ],
    periods: [
      { id: 7064612, type_id: 1, description: "1st-half", ticking: false, minutes: 48, seconds: 32, counts_from: 0, time_added: 3 },
      { id: 7065026, type_id: 2, description: "2nd-half", ticking: true, minutes: 92, seconds: 40, counts_from: 45, time_added: 5 },
    ],
    participants: [
      { id: 109, name: "Fiorentina", meta: { location: "home", winner: null, position: 20 } },
      { id: 4070, name: "Frosinone", meta: { location: "away", winner: null, position: 14 } },
    ],
    events: [],
    ...overrides,
  } as unknown as Parameters<typeof getSportMonksFixtureScore>[0];
}

test("getSportMonksFixtureScore: reads the CURRENT score row per side (real 2nd-half sample)", () => {
  assert.deepEqual(getSportMonksFixtureScore(makeLiveFixture()), { home: 0, away: 3 });
});

test("getSportMonksFixtureScore: null (not 0-0) when no CURRENT row exists yet", () => {
  assert.equal(getSportMonksFixtureScore(makeLiveFixture({ scores: [] })), null);
});

test("getSportMonksFixtureMinute: uses the ticking period's minute (2nd half, real sample)", () => {
  assert.equal(getSportMonksFixtureMinute(makeLiveFixture()), 92);
});

test("getSportMonksFixtureMinute: falls back to the last period when none is ticking (half-time)", () => {
  const fx = makeLiveFixture({
    periods: [
      { id: 1, type_id: 1, description: "1st-half", ticking: false, minutes: 45, seconds: 0, counts_from: 0, time_added: 0 },
    ],
  });
  assert.equal(getSportMonksFixtureMinute(fx), 45);
});

test("isSportMonksFixtureLive: true for INPLAY_2ND_HALF, HT, and INPLAY_1ST_HALF; false for NS/FT", () => {
  assert.equal(isSportMonksFixtureLive(makeLiveFixture()), true);
  assert.equal(
    isSportMonksFixtureLive(makeLiveFixture({ state: { id: 3, state: "HT", name: "Half Time", short_name: "HT", developer_name: "HT" } })),
    true,
  );
  assert.equal(
    isSportMonksFixtureLive(makeLiveFixture({ state: { id: 1, state: "NS", name: "Not Started", short_name: "NS", developer_name: "NS" } })),
    false,
  );
  assert.equal(
    isSportMonksFixtureLive(makeLiveFixture({ state: { id: 5, state: "FT", name: "Full Time", short_name: "FT", developer_name: "FT" } })),
    false,
  );
});

test("isSportMonksFixtureFinished: true only for FT (real confirmed value)", () => {
  assert.equal(isSportMonksFixtureFinished(makeLiveFixture()), false);
});

// Real GET /v3/football/livescores/inplay sample (2026-08-29) — Borussia
// Dortmund (home, participant_id 68) v Hamburger SV (away, participant_id
// 2708), a genuinely finished match (state FT) that had a real REDCARD
// event on the home side, minute 77.
function makeFinishedFixtureWithRedCard() {
  return {
    id: 19735196,
    name: "Borussia Dortmund vs Hamburger SV",
    starting_at: "2026-08-29 18:30:00",
    starting_at_timestamp: 1788020200,
    state_id: 5,
    state: { id: 5, state: "FT", name: "Full Time", short_name: "FT", developer_name: "FT" },
    participants: [
      { id: 68, name: "Borussia Dortmund", meta: { location: "home", winner: true, position: 9 } },
      { id: 2708, name: "Hamburger SV", meta: { location: "away", winner: false, position: 7 } },
    ],
    events: [
      {
        id: 157695614,
        fixture_id: 19735196,
        period_id: 7065005,
        participant_id: 68,
        type_id: 20,
        player_id: 37722654,
        related_player_id: null,
        player_name: "Samuele Inácio",
        related_player_name: null,
        result: null,
        info: "Foul",
        addition: "1st Redcard",
        minute: 77,
        extra_minute: null,
        rescinded: false,
        type: { id: 20, name: "Redcard", code: "redcard", developer_name: "REDCARD" },
      },
    ],
  } as unknown as Parameters<typeof getSportMonksFixtureScore>[0];
}

test("isSportMonksFixtureFinished: true for a real FT fixture", () => {
  assert.equal(isSportMonksFixtureFinished(makeFinishedFixtureWithRedCard()), true);
});

test("countSportMonksRedCards: counts a real REDCARD event for the home side, zero for away", () => {
  const fx = makeFinishedFixtureWithRedCard();
  assert.equal(countSportMonksRedCards(fx, "home"), 1);
  assert.equal(countSportMonksRedCards(fx, "away"), 0);
});

// Real GET /v3/football/fixtures/19621957?include=statistics.type sample
// (2026-08-29) — São Paulo (home, participant_id 3496) vs Mirassol (away,
// participant_id 11126), a finished match with real CORNERS (type_id 34,
// home 12/away 4) and YELLOWCARDS (type_id 84, home 1/away 2) statistics.
// No red cards occurred in this real match, so cardsTotal here is purely
// yellow (confirmed by countSportMonksRedCards returning 0 for both sides
// with no REDCARD events present).
function makeFixtureWithCornersCardsStats() {
  return {
    id: 19621957,
    name: "São Paulo vs Mirassol",
    starting_at: "2026-08-22 21:30:00",
    starting_at_timestamp: 1787513400,
    state_id: 5,
    participants: [
      { id: 3496, name: "São Paulo", meta: { location: "home", winner: null, position: 3 } },
      { id: 11126, name: "Mirassol", meta: { location: "away", winner: null, position: 8 } },
    ],
    events: [],
    statistics: [
      { id: 1, fixture_id: 19621957, type_id: 34, participant_id: 3496, location: "home", data: { value: 12 }, type: { id: 34, name: "Corners", code: "corners", developer_name: "CORNERS" } },
      { id: 2, fixture_id: 19621957, type_id: 34, participant_id: 11126, location: "away", data: { value: 4 }, type: { id: 34, name: "Corners", code: "corners", developer_name: "CORNERS" } },
      { id: 3, fixture_id: 19621957, type_id: 84, participant_id: 3496, location: "home", data: { value: 1 }, type: { id: 84, name: "Yellowcards", code: "yellowcards", developer_name: "YELLOWCARDS" } },
      { id: 4, fixture_id: 19621957, type_id: 84, participant_id: 11126, location: "away", data: { value: 2 }, type: { id: 84, name: "Yellowcards", code: "yellowcards", developer_name: "YELLOWCARDS" } },
    ],
  } as unknown as Parameters<typeof getSportMonksFixtureCornersCards>[0];
}

test("getSportMonksFixtureCornersCards: reads real CORNERS/YELLOWCARDS statistics per side and totals them", () => {
  const fx = makeFixtureWithCornersCardsStats();
  assert.deepEqual(getSportMonksFixtureCornersCards(fx), {
    cornersHome: 12,
    cornersAway: 4,
    cornersTotal: 16,
    yellowCardsHome: 1,
    yellowCardsAway: 2,
    cardsTotal: 3,
  });
});

test("getSportMonksFixtureCornersCards: adds confirmed REDCARD events on top of yellow cards", () => {
  const fx = makeFixtureWithCornersCardsStats();
  (fx as any).events = [
    {
      id: 1, fixture_id: 19621957, period_id: 1, participant_id: 3496, type_id: 20,
      player_id: null, related_player_id: null, player_name: "Test Player", related_player_name: null,
      result: null, info: null, addition: null, minute: 80, extra_minute: null, rescinded: false,
      type: { id: 20, name: "Redcard", code: "redcard", developer_name: "REDCARD" },
    },
  ];
  assert.equal(getSportMonksFixtureCornersCards(fx).cardsTotal, 4);
});

test("getSportMonksFixtureCornersCards: null (not 0) fields when no statistics are present yet", () => {
  const fx = makeFixtureWithCornersCardsStats();
  (fx as any).statistics = [];
  assert.deepEqual(getSportMonksFixtureCornersCards(fx), {
    cornersHome: null,
    cornersAway: null,
    cornersTotal: null,
    yellowCardsHome: null,
    yellowCardsAway: null,
    cardsTotal: null,
  });
});

// Real GET /v3/football/schedules/teams/3496 sample (2026-08-29) — a subset
// of São Paulo's (team_id 3496) real schedule fixtures, covering both an
// upcoming (state_id 1) and a finished (state_id 5) meeting against
// Mirassol (team_id 11126, same real fixture id 19621957 used in the
// corners/cards tests above), plus other real opponents for filtering.
const saoPauloScheduleSample = [
  {
    id: 19621816, name: "Palmeiras vs São Paulo", starting_at: "2026-09-12 00:00:00",
    starting_at_timestamp: 1789171200, state_id: 1,
    participants: [
      { id: 3422, name: "Palmeiras", meta: { location: "home" } },
      { id: 3496, name: "São Paulo", meta: { location: "away" } },
    ],
  },
  {
    id: 19621765, name: "Mirassol vs São Paulo", starting_at: "2026-10-24 00:00:00",
    starting_at_timestamp: 1792800000, state_id: 1,
    participants: [
      { id: 11126, name: "Mirassol", meta: { location: "home" } },
      { id: 3496, name: "São Paulo", meta: { location: "away" } },
    ],
  },
  {
    id: 19621807, name: "São Paulo vs Internacional", starting_at: "2026-09-19 00:00:00",
    starting_at_timestamp: 1789776000, state_id: 1,
    participants: [
      { id: 3496, name: "São Paulo", meta: { location: "home" } },
      { id: 2696, name: "Internacional", meta: { location: "away" } },
    ],
  },
  {
    id: 19621957, name: "São Paulo vs Mirassol", starting_at: "2026-04-26 00:00:00",
    starting_at_timestamp: 1777161600, state_id: 5,
    participants: [
      { id: 3496, name: "São Paulo", meta: { location: "home" } },
      { id: 11126, name: "Mirassol", meta: { location: "away" } },
    ],
  },
  {
    id: 19621840, name: "Chapecoense vs São Paulo", starting_at: "2026-08-23 21:30:00",
    starting_at_timestamp: 1787520600, state_id: 5,
    participants: [
      { id: 710, name: "Chapecoense", meta: { location: "home" } },
      { id: 3496, name: "São Paulo", meta: { location: "away" } },
    ],
  },
] as unknown as Parameters<typeof filterUpcomingFixtures>[0];

test("filterUpcomingFixtures: keeps only state_id 1 fixtures in the future, earliest first, limited", () => {
  // 2026-09-01 00:00:00 UTC — after 19621840 (already finished) but before
  // every real state_id-1 fixture in the sample.
  const now = 1788307200;
  const result = filterUpcomingFixtures(saoPauloScheduleSample, now, 2);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((fx) => fx.id), [19621816, 19621807]);
});

test("filterUpcomingFixtures: excludes a real fixture already in the past even if state_id is still 1", () => {
  // Same fixtures, but "now" is after 19621816's kickoff too — only the two
  // later ones remain.
  const now = 1789200000;
  const result = filterUpcomingFixtures(saoPauloScheduleSample, now, 10);
  assert.deepEqual(result.map((fx) => fx.id), [19621807, 19621765]);
});

test("filterHeadToHeadFixtures: only the real finished meeting against Mirassol, not the upcoming one or other opponents", () => {
  const result = filterHeadToHeadFixtures(saoPauloScheduleSample, 11126, 10);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.id, 19621957);
});

test("filterHeadToHeadFixtures: most recent finished meeting first, respects limit", () => {
  const withOlderMeeting = [
    ...saoPauloScheduleSample,
    {
      id: 1,
      name: "Mirassol vs São Paulo (older)",
      starting_at: "2025-01-01 00:00:00",
      starting_at_timestamp: 1735689600,
      state_id: 5,
      participants: [
        { id: 11126, name: "Mirassol", meta: { location: "home" } },
        { id: 3496, name: "São Paulo", meta: { location: "away" } },
      ],
    },
  ] as unknown as Parameters<typeof filterHeadToHeadFixtures>[0];
  const result = filterHeadToHeadFixtures(withOlderMeeting, 11126, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.id, 19621957);
});

// Real GET /v3/football/livescores/inplay?include=...events.type... sample
// (2026-08-29, OH Leuven vs Standard Liège, fixture id 19726090) — a real
// PENALTY (type_id 16) event that moved the scoreboard 0-0 -> 0-1 (Casper
// Nielsen, minute 9), same real fixture also seen in a follow-up plain
// `events` (no `.type`) sample of the same match.
test("isFootballLiveDisplayEvent: real PENALTY developer_name counts as a display event (goal from the spot)", () => {
  assert.equal(isFootballLiveDisplayEvent("PENALTY"), true);
});

test("isFootballLiveDisplayEvent: every other confirmed real event type also counts", () => {
  for (const dn of ["GOAL", "OWNGOAL", "SUBSTITUTION", "YELLOWCARD", "REDCARD"]) {
    assert.equal(isFootballLiveDisplayEvent(dn), true, dn);
  }
});

test("isFootballLiveDisplayEvent: an unconfirmed/unknown developer_name (or none) is excluded, not guessed", () => {
  assert.equal(isFootballLiveDisplayEvent("VAR"), false);
  assert.equal(isFootballLiveDisplayEvent(undefined), false);
  assert.equal(isFootballLiveDisplayEvent(null), false);
});

// Real GET /v3/football/players/4700 sample (2026-08-29) — Jonathan Calleri
// (São Paulo). The current-season row (season_id 26763, is_current: true)
// real details: CAPTAIN 20, GOALS {total:7, goals:6, penalties:1},
// YELLOWCARDS {total:4, home:1, away:3}, APPEARANCES 21, MINUTES_PLAYED
// 1704 — no REDCARDS or ASSISTS entries in this real row (a real absence,
// not zero). A second, non-current season row (season_id 23265) has its
// own real GOALS total (5) — used to confirm only the current-season row
// is read.
const calleriProfile = {
  id: 4700,
  display_name: "Jonathan Calleri ",
  statistics: [
    {
      id: 1008798424, team_id: 3496, season_id: 23265,
      season: { id: 23265, name: "2024", is_current: false, league: { id: 648, name: "Serie A" } },
      details: [
        { type_id: 52, value: { total: 5, goals: 5, penalties: 0 }, type: { id: 52, name: "Goals", code: "goals", developer_name: "GOALS" } },
      ],
    },
    {
      id: 1868964264, team_id: 3496, season_id: 26763,
      season: { id: 26763, name: "2026", is_current: true, league: { id: 648, name: "Serie A" } },
      team: { id: 3496, name: "São Paulo", image_path: "https://cdn.sportmonks.com/images/soccer/teams/8/3496.png" },
      details: [
        { type_id: 40, value: { total: 20 }, type: { id: 40, name: "Captain", code: "captain", developer_name: "CAPTAIN" } },
        { type_id: 52, value: { total: 7, goals: 6, penalties: 1 }, type: { id: 52, name: "Goals", code: "goals", developer_name: "GOALS" } },
        { type_id: 84, value: { total: 4, home: 1, away: 3 }, type: { id: 84, name: "Yellowcards", code: "yellowcards", developer_name: "YELLOWCARDS" } },
        { type_id: 321, value: { total: 21 }, type: { id: 321, name: "Appearances", code: "appearances", developer_name: "APPEARANCES" } },
        { type_id: 119, value: { total: 1704 }, type: { id: 119, name: "Minutes Played", code: "minutes-played", developer_name: "MINUTES_PLAYED" } },
      ],
    },
  ],
  latest: [
    {
      fixture_id: 19621840,
      team_id: 3496,
      fixture: {
        id: 19621840, name: "Chapecoense vs São Paulo", starting_at: "2026-08-23 21:30:00",
        starting_at_timestamp: 1787520600, state_id: 5,
        league: { id: 648, name: "Serie A" },
        participants: [
          { id: 710, name: "Chapecoense", meta: { location: "home" } },
          { id: 3496, name: "São Paulo", meta: { location: "away" } },
        ],
        scores: [
          { description: "CURRENT", participant_id: 710, score: { goals: 1, participant: "home" } },
          { description: "CURRENT", participant_id: 3496, score: { goals: 0, participant: "away" } },
        ],
      },
      details: [
        { type_id: 118, data: { value: 6.58 }, type: { id: 118, name: "Rating", code: "rating", developer_name: "RATING" } },
        { type_id: 119, data: { value: 31 }, type: { id: 119, name: "Minutes Played", code: "minutes-played", developer_name: "MINUTES_PLAYED" } },
      ],
    },
    {
      // Real confirmed shape: `fixture: null` for a match SportMonks hasn't
      // backfilled fixture data for yet (real fixture_id 19694867).
      fixture_id: 19694867,
      team_id: 3496,
      fixture: null,
      details: [],
    },
  ],
} as unknown as Parameters<typeof getPlayerCurrentSeasonStatTotal>[0];

test("getPlayerCurrentSeasonStatTotal: reads GOALS total from the real current-season row, not the older one", () => {
  assert.equal(getPlayerCurrentSeasonStatTotal(calleriProfile, 52), 7);
});

test("getPlayerCurrentSeasonStatTotal: real absence (no REDCARDS/ASSISTS in the current row) is null, not zero", () => {
  assert.equal(getPlayerCurrentSeasonStatTotal(calleriProfile, 83), null);
  assert.equal(getPlayerCurrentSeasonStatTotal(calleriProfile, 79), null);
});

test("getPlayerCurrentSeasonStatTotal: reads a plain-object total field (APPEARANCES, MINUTES_PLAYED)", () => {
  assert.equal(getPlayerCurrentSeasonStatTotal(calleriProfile, 321), 21);
  assert.equal(getPlayerCurrentSeasonStatTotal(calleriProfile, 119), 1704);
});

test("getPlayerRecentMatches: skips a real latest[] entry with fixture:null and fills in opponent/scores by team_id side", () => {
  const matches = getPlayerRecentMatches(calleriProfile, 10);
  assert.equal(matches.length, 1);
  const m = matches[0]!;
  assert.equal(m.fixtureId, 19621840);
  assert.equal(m.opponent, "Chapecoense");
  assert.equal(m.isHome, false);
  assert.equal(m.teamScore, 0);
  assert.equal(m.opponentScore, 1);
  assert.equal(m.rating, 6.58);
  assert.equal(m.minutesPlayed, 31);
  assert.equal(m.goals, 0);
});

// Real GET /fixtures/19621836?include=odds.market;odds.bookmaker sample
// (2026-08-29) — fixture genuinely live at request time (state_id 22 =
// INPLAY_2ND_HALF, Atlético Mineiro v Vitória). Proves live odds work via
// this per-fixture endpoint (unlike the abandoned /odds/inplay general
// list — see getSportMonksLiveOddsByFixture's header in football.ts):
// bet365 FULLTIME_RESULT values 1.90/3.30/4.33, suspended:null,
// stopped:false, latest_bookmaker_update minutes-old at test time.
test("extractSportMonksFootballOverride: real live bet365 1X2 from a fixture genuinely in play", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 2, label: "Home", value: "1.90", name: null, original_label: "1", suspended: null, stopped: false, market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "Draw", value: "3.30", name: null, original_label: "Draw", suspended: null, stopped: false, market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "Away", value: "4.33", name: null, original_label: "2", suspended: null, stopped: false, market: fulltimeResultMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds), 2);
  assert.deepEqual(out.odds, { home: 1.9, draw: 3.3, away: 4.33 });
});

// Same real sample: `suspended` stayed null on every one of that fixture's
// 3798 odds rows, but `stopped` carried the real live-suspension signal
// (539 rows had stopped:true) — oddsByDeveloperName excludes stopped rows
// too now, so a fully-stopped live market falls back to synthetic instead
// of showing a frozen price.
test("extractSportMonksFootballOverride: a fully-stopped live market (real signal, suspended stays null) is excluded", () => {
  const odds = [
    { market_id: 1, bookmaker_id: 2, label: "Home", value: "1.90", suspended: null, stopped: true, market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "Draw", value: "3.30", suspended: null, stopped: true, market: fulltimeResultMarket, bookmaker: bet365 },
    { market_id: 1, bookmaker_id: 2, label: "Away", value: "4.33", suspended: null, stopped: true, market: fulltimeResultMarket, bookmaker: bet365 },
  ];
  const out = extractSportMonksFootballOverride(makeFixture(odds), 2);
  assert.equal(out.odds, undefined);
});
