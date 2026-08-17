import test from "node:test";
import assert from "node:assert/strict";

// extractTeamNames/extractLiveEventsList/findStatscoreIdInObject were
// written without live access to demo.betby.com/sptpub.com from the
// environment this was built in (see session.ts's header comment for the
// real BetBY flow this was reverse-engineered from via manual network
// inspection). These tests pin down the TOLERANCE behavior itself — accepts
// several plausible shapes, never throws, returns null/empty on a genuine
// miss rather than a half-populated guess — not a claim that any one shape
// is fully confirmed. Add a test with the exact real shape once production
// logs (recordUnknownBetbyShape) confirm it.

const { extractTeamNames, extractLiveEventsList } = await import(
  "../services/betbyTracker/pulseBridge.js"
);
const { findStatscoreIdInObject } = await import("../services/betbyTracker/proxy.js");

test("extractTeamNames: old /api/v4/live desc.competitors array shape", () => {
  const ev = { desc: { competitors: [{ name: "Corinthians" }, { name: "Cruzeiro" }] } };
  assert.deepEqual(extractTeamNames(ev), { home: "Corinthians", away: "Cruzeiro" });
});

test("extractTeamNames: nested desc.state.competitors shape", () => {
  const ev = { desc: { state: { competitors: [{ name: "Corinthians" }, { name: "Cruzeiro" }] } } };
  assert.deepEqual(extractTeamNames(ev), { home: "Corinthians", away: "Cruzeiro" });
});

test("extractTeamNames: flat home/away string shape", () => {
  const ev = { desc: { home: "Corinthians", away: "Cruzeiro" } };
  assert.deepEqual(extractTeamNames(ev), { home: "Corinthians", away: "Cruzeiro" });
});

test("extractTeamNames: flat teams.home/teams.away object shape", () => {
  const ev = { teams: { home: { name: "Corinthians" }, away: { name: "Cruzeiro" } } };
  assert.deepEqual(extractTeamNames(ev), { home: "Corinthians", away: "Cruzeiro" });
});

test("extractTeamNames: missing/malformed input returns null, never throws", () => {
  assert.equal(extractTeamNames(null), null);
  assert.equal(extractTeamNames({}), null);
  assert.equal(extractTeamNames({ desc: { competitors: [{ name: "OnlyOneTeam" }] } }), null);
  assert.equal(extractTeamNames("not an object"), null);
});

test("extractLiveEventsList: events-as-map shape (mirrors the old, wrong-host assumption)", () => {
  const body = {
    events: {
      "2695677816124608550": {
        desc: {
          sport: "1",
          tournament: "10",
          competitors: [{ name: "SC Corinthians SP" }, { name: "Cruzeiro EC MG" }],
        },
      },
    },
    tournaments: { "10": { name: "Brasileiro Serie A" } },
  };
  const out = extractLiveEventsList(body);
  assert.deepEqual(out, [
    {
      betbyEventId: "2695677816124608550",
      sportId: "1",
      homeName: "SC Corinthians SP",
      awayName: "Cruzeiro EC MG",
      tournamentName: "Brasileiro Serie A",
    },
  ]);
});

test("extractLiveEventsList: bare array-of-events shape", () => {
  const body = [
    {
      desc: {
        id: "2695677816124608550",
        sport: "1",
        competitors: [{ name: "SC Corinthians SP" }, { name: "Cruzeiro EC MG" }],
      },
    },
  ];
  const out = extractLiveEventsList(body);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.betbyEventId, "2695677816124608550");
  assert.equal(out[0]!.homeName, "SC Corinthians SP");
});

test("extractLiveEventsList: unrecognized shape returns an empty array, never throws", () => {
  assert.deepEqual(extractLiveEventsList({ unexpected: "shape" }), []);
  assert.deepEqual(extractLiveEventsList(null), []);
  assert.deepEqual(extractLiveEventsList("not an object"), []);
});

test("findStatscoreIdInObject: finds a plausible statscoreEventId key at any depth", () => {
  const body = { state: { info: { statscoreEventId: "6670732" } }, players: [], markets: {} };
  assert.equal(findStatscoreIdInObject(body, 0), "6670732");
});

test("findStatscoreIdInObject: finds a numeric trackerId variant", () => {
  const body = { desc: { trackerId: 6670732 } };
  assert.equal(findStatscoreIdInObject(body, 0), "6670732");
});

test("findStatscoreIdInObject: ignores an out-of-range or non-numeric-looking value under a matching key", () => {
  assert.equal(findStatscoreIdInObject({ statscoreEventId: "not-a-number" }, 0), null);
  assert.equal(findStatscoreIdInObject({ statscoreEventId: "12" }, 0), null); // too short to be a real id
});

test("findStatscoreIdInObject: no matching key anywhere returns null, never throws", () => {
  assert.equal(findStatscoreIdInObject({ players: [], markets: {} }, 0), null);
  assert.equal(findStatscoreIdInObject(null, 0), null);
  assert.equal(findStatscoreIdInObject("not an object", 0), null);
});
