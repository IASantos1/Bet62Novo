import test from "node:test";
import assert from "node:assert/strict";

const { normalizeSportscoreMatch, normalizeSportscoreTracker, buildSportscoreEmbedUrl } =
  await import("../services/sportscore/client.js");

// normalizeSportscoreMatch/normalizeSportscoreTracker were written without
// live access to sportscore.com's real API (see client.ts's header comment)
// — these tests exist to pin down the TOLERANCE behavior (accepts several
// plausible field-name shapes, never throws, returns null rather than a
// half-populated object on a genuine miss), not to claim any one shape is
// confirmed correct. Once a real response is captured, add a test with
// that exact shape here.

test("normalizeSportscoreMatch: nested teams.home.name / teams.away.name shape", () => {
  // trackerId only falls back to the "id" field, not "slug" — the widget
  // embed and the raw tracker JSON endpoint use genuinely different ids
  // per the schema's own comment (sportscoreId/slug for /embed/tracker/,
  // trackerId/id for /api/widget/tracker/) — this fixture has no "id",
  // only "slug", so trackerId correctly stays null here.
  const raw = {
    slug: "flamengo-vs-palmeiras",
    teams: { home: { name: "Flamengo" }, away: { name: "Palmeiras" } },
  };
  const m = normalizeSportscoreMatch(raw, "football");
  assert.deepEqual(m, {
    sportscoreId: "flamengo-vs-palmeiras",
    trackerId: null,
    home: "Flamengo",
    away: "Palmeiras",
    sport: "football",
  });
});

test("normalizeSportscoreMatch: flat homeTeam/awayTeam + numeric id shape", () => {
  const raw = { id: 123456, homeTeam: "Corinthians", awayTeam: "Cruzeiro" };
  const m = normalizeSportscoreMatch(raw, "football");
  assert.deepEqual(m, {
    sportscoreId: "123456",
    trackerId: "123456",
    home: "Corinthians",
    away: "Cruzeiro",
    sport: "football",
  });
});

test("normalizeSportscoreMatch: missing team names returns null, never throws", () => {
  assert.equal(normalizeSportscoreMatch({ slug: "x" }, "football"), null);
  assert.equal(normalizeSportscoreMatch(null, "football"), null);
  assert.equal(normalizeSportscoreMatch("not an object", "football"), null);
});

test("normalizeSportscoreTracker: nested score object + incidents array", () => {
  const raw = {
    status: "live",
    minute: "63",
    score: { home: 2, away: 1 },
    incidents: [{ type: "goal", team: "home", minute: 12, player: "Player A" }],
  };
  const t = normalizeSportscoreTracker(raw);
  assert.deepEqual(t, {
    provider: "sportscore",
    status: "live",
    minute: "63",
    homeScore: 2,
    awayScore: 1,
    incidents: [{ type: "goal", team: "home", minute: 12, player: "Player A" }],
  });
});

test("normalizeSportscoreTracker: missing fields default safely, never throws", () => {
  const t = normalizeSportscoreTracker({});
  assert.deepEqual(t, {
    provider: "sportscore",
    status: "unknown",
    minute: "",
    homeScore: 0,
    awayScore: 0,
    incidents: [],
  });
  assert.equal(normalizeSportscoreTracker(null), null);
});

test("buildSportscoreEmbedUrl: builds the documented /embed/tracker/{sport}/{slug}/ path", () => {
  assert.equal(
    buildSportscoreEmbedUrl("football", "flamengo-vs-palmeiras"),
    "https://sportscore.com/embed/tracker/football/flamengo-vs-palmeiras/",
  );
});
