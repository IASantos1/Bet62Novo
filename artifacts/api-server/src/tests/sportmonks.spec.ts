import test from "node:test";
import assert from "node:assert/strict";

const {
  extractSportMonksFootballOverride,
  getSportMonksFixtureScore,
  getSportMonksFixtureMinute,
  isSportMonksFixtureLive,
  isSportMonksFixtureFinished,
  countSportMonksRedCards,
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
