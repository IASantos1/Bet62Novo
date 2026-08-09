import test from "node:test";
import assert from "node:assert/strict";

const {
  findApiFootballFixture,
  fixtureHasRedCard,
  fixtureHasVarReview,
  latestGoalScorer,
  latestGoalIsPenalty,
  fixturePenaltyEvents,
  extractTeamStats,
} = await import("../services/apiFootball.js");

function makeFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fixtureId: 1,
    statusShort: "2H",
    elapsed: 70,
    leagueName: "Test League",
    leagueCountry: "Testland",
    home: { id: 10, name: "Home FC", logo: "https://example.com/home.png" },
    away: { id: 20, name: "Away FC", logo: "https://example.com/away.png" },
    goalsHome: 0,
    goalsAway: 0,
    events: [],
    ...overrides,
  };
}

// Real sample shape confirmed against a live GET /fixtures?live=all response
// (2026-08-09) — Biwako Shiga v FC Gifu, eventId with a real red card:
// {"type":"Card","detail":"Red Card","player":{"name":"Y. Motoyoshi"}}.
test("fixtureHasRedCard: detects a real 'Red Card' event", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 44,
        extraMinute: null,
        teamId: 10,
        teamName: "Home FC",
        playerName: "Y. Motoyoshi",
        assistName: null,
        type: "Card",
        detail: "Red Card",
        comments: null,
      },
    ],
  });
  assert.equal(fixtureHasRedCard(fixture), true);
});

test("fixtureHasRedCard: a yellow card alone does not count", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 30,
        extraMinute: null,
        teamId: 10,
        teamName: "Home FC",
        playerName: "S. Nakamura",
        assistName: null,
        type: "Card",
        detail: "Yellow Card",
        comments: null,
      },
    ],
  });
  assert.equal(fixtureHasRedCard(fixture), false);
});

// No real "Var"-typed event has been seen yet in a live sample (VAR reviews
// are rare) — this exercises the generic, case-insensitive passthrough
// detection (fixtureHasVarReview matches on type alone, not an allow-listed
// detail string) so a real one is caught the instant it appears without
// needing a code change.
test("fixtureHasVarReview: matches a 'Var'-typed event case-insensitively", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 55,
        extraMinute: null,
        teamId: 10,
        teamName: "Home FC",
        playerName: null,
        assistName: null,
        type: "VAR",
        detail: "Goal Disallowed - Offside",
        comments: null,
      },
    ],
  });
  assert.equal(fixtureHasVarReview(fixture), true);
});

test("fixtureHasVarReview: a goal/card fixture with no VAR event returns false", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 10,
        extraMinute: null,
        teamId: 10,
        teamName: "Home FC",
        playerName: "S. Lindmark",
        assistName: "Z. Bawa",
        type: "Goal",
        detail: "Normal Goal",
        comments: null,
      },
    ],
  });
  assert.equal(fixtureHasVarReview(fixture), false);
});

// Real sample shape: Umeå FC v AFC Eskilstuna — {"type":"Goal","detail":
// "Normal Goal","player":{"name":"S. Lindmark"},"assist":{"name":"Z. Bawa"}}.
test("latestGoalScorer: returns the last goal's scorer, ignoring cards/subs after it", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 10,
        extraMinute: null,
        teamId: 10,
        teamName: "Home FC",
        playerName: "S. Lindmark",
        assistName: "Z. Bawa",
        type: "Goal",
        detail: "Normal Goal",
        comments: null,
      },
      {
        minute: 30,
        extraMinute: null,
        teamId: 20,
        teamName: "Away FC",
        playerName: "W. Jiang",
        assistName: null,
        type: "Card",
        detail: "Yellow Card",
        comments: "Foul",
      },
    ],
  });
  assert.equal(latestGoalScorer(fixture), "S. Lindmark");
});

test("latestGoalScorer: null when the fixture has no goal events yet", () => {
  const fixture = makeFixture({ events: [] });
  assert.equal(latestGoalScorer(fixture), null);
});

test("latestGoalIsPenalty: true when the last goal event's detail is exactly 'Penalty'", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 10,
        extraMinute: null,
        teamId: 10,
        teamName: "Home FC",
        playerName: "S. Lindmark",
        assistName: null,
        type: "Goal",
        detail: "Penalty",
        comments: null,
      },
    ],
  });
  assert.equal(latestGoalIsPenalty(fixture), true);
});

test("latestGoalIsPenalty: false for a routine open-play goal", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 10,
        extraMinute: null,
        teamId: 10,
        teamName: "Home FC",
        playerName: "S. Lindmark",
        assistName: null,
        type: "Goal",
        detail: "Normal Goal",
        comments: null,
      },
    ],
  });
  assert.equal(latestGoalIsPenalty(fixture), false);
});

test("fixturePenaltyEvents: catches a MISSED penalty even though the score never changes", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 60,
        extraMinute: null,
        teamId: 20,
        teamName: "Away FC",
        playerName: "W. Jiang",
        assistName: null,
        type: "Goal",
        detail: "Missed Penalty",
        comments: null,
      },
    ],
  });
  const penalties = fixturePenaltyEvents(fixture);
  assert.equal(penalties.length, 1);
  assert.equal(penalties[0]?.playerName, "W. Jiang");
});

test("fixturePenaltyEvents: empty when the fixture has no penalty-outcome events", () => {
  const fixture = makeFixture({
    events: [
      {
        minute: 10,
        extraMinute: null,
        teamId: 10,
        teamName: "Home FC",
        playerName: "S. Lindmark",
        assistName: null,
        type: "Goal",
        detail: "Normal Goal",
        comments: null,
      },
    ],
  });
  assert.equal(fixturePenaltyEvents(fixture).length, 0);
});

// teamNamesMatch's existing fuzzy/tolerant matching (already battle-tested
// across the PulseScore integration) is reused here, not reimplemented —
// this just confirms findApiFootballFixture wires it correctly.
test("findApiFootballFixture: finds the fixture matching both team names", () => {
  const fixtures = [
    makeFixture({ fixtureId: 1, home: { id: 10, name: "Real Madrid", logo: null }, away: { id: 20, name: "Barcelona", logo: null } }),
    makeFixture({ fixtureId: 2, home: { id: 30, name: "Home FC", logo: null }, away: { id: 40, name: "Away FC", logo: null } }),
  ];
  const found = findApiFootballFixture("Home FC", "Away FC", fixtures);
  assert.equal(found?.fixtureId, 2);
});

test("findApiFootballFixture: returns null when no fixture matches", () => {
  const fixtures = [
    makeFixture({ fixtureId: 1, home: { id: 10, name: "Real Madrid", logo: null }, away: { id: 20, name: "Barcelona", logo: null } }),
  ];
  const found = findApiFootballFixture("Home FC", "Away FC", fixtures);
  assert.equal(found, null);
});

// Built against API-Football's stable public documentation for
// /fixtures/statistics (not yet verified against a real live response —
// see apiFootball.ts's own header comment on this section). Shape: one
// block per team, each a {type, value} array, value either a plain number
// or a "NN%" string.
test("extractTeamStats: maps known stat types, parsing both plain numbers and '%' strings", () => {
  const block = {
    team: { id: 10, name: "Home FC" },
    statistics: [
      { type: "Shots on Goal", value: 5 },
      { type: "Total Shots", value: 12 },
      { type: "Ball Possession", value: "58%" },
      { type: "Corner Kicks", value: 6 },
      { type: "Fouls", value: 9 },
      { type: "Offsides", value: 2 },
      { type: "Yellow Cards", value: 1 },
      { type: "Red Cards", value: null },
    ],
  };
  const stats = extractTeamStats(block);
  assert.equal(stats?.shotsTotal, 12);
  assert.equal(stats?.shotsOnTarget, 5);
  assert.equal(stats?.possessionPct, 58);
  assert.equal(stats?.corners, 6);
  assert.equal(stats?.fouls, 9);
  assert.equal(stats?.offsides, 2);
  assert.equal(stats?.yellowCards, 1);
  assert.equal(stats?.redCards, null);
});

test("extractTeamStats: an unrecognised type string still lands in `raw`, not a promoted field", () => {
  const block = {
    team: { id: 10, name: "Home FC" },
    statistics: [{ type: "expected_goals", value: "1.8" }],
  };
  const stats = extractTeamStats(block);
  assert.equal(stats?.shotsTotal, null);
  assert.equal(stats?.raw["expected_goals"], "1.8");
});

test("extractTeamStats: null when the block has no statistics array at all", () => {
  assert.equal(extractTeamStats(undefined), null);
  assert.equal(extractTeamStats({ team: { id: 10, name: "Home FC" } }), null);
});
