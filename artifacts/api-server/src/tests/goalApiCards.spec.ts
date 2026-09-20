import test from "node:test";
import assert from "node:assert/strict";
import { countGoalApiRedCards } from "../services/goalapi/liveMatchEngine.js";
import { buildGoalApiEvents } from "../services/goalapi/common.js";
import type { GoalApiCard, GoalApiSubstitution } from "../services/goalapi/index.js";

// Real bug fixed 2026-09-20 (user-reported: red-card suspension never
// firing despite being wired up) — cards were never confirmed real on
// /fixtures/:id/events (only "GOAL" has ever been observed there); the
// real data lives on the separate /fixtures/:id/cards endpoint, captured
// live for a real match with 3 yellow cards (0 red). These tests use that
// real shape, plus a synthetic red card (same shape, not yet observed
// live) to prove the "red" branch matches once the provider does send one.

const realYellowCards: GoalApiCard[] = [
  {
    id: "cmu94kv3grst1km081266pzd4",
    fixtureId: "cmt71rdb2sveut107jztus79r",
    time: "3",
    timeNum: 3,
    card: "yellow card",
    homeFault: "Peglow",
    homePlayerId: "1927658576",
    awayFault: null,
    awayPlayerId: null,
    info: null,
    scoreInfoTime: "1st Half",
  },
  {
    id: "cmu94kv3grst2km08skmfupqf",
    fixtureId: "cmt71rdb2sveut107jztus79r",
    time: "47",
    timeNum: 47,
    card: "yellow card",
    homeFault: null,
    homePlayerId: null,
    awayFault: "D. Schnegg",
    awayPlayerId: "50802776",
    info: null,
    scoreInfoTime: "2nd Half",
  },
];

test("countGoalApiRedCards: real yellow cards never count as red for either side", () => {
  assert.equal(countGoalApiRedCards(realYellowCards, "home"), 0);
  assert.equal(countGoalApiRedCards(realYellowCards, "away"), 0);
});

test("countGoalApiRedCards: a red card counts only for the side whose *Fault field is set", () => {
  const cards: GoalApiCard[] = [
    ...realYellowCards,
    {
      id: "x",
      fixtureId: "f",
      time: "80",
      timeNum: 80,
      card: "red card",
      homeFault: null,
      homePlayerId: null,
      awayFault: "S. Bad Tackle",
      awayPlayerId: "999",
      info: null,
      scoreInfoTime: "2nd Half",
    },
  ];
  assert.equal(countGoalApiRedCards(cards, "home"), 0);
  assert.equal(countGoalApiRedCards(cards, "away"), 1);
});

test("countGoalApiRedCards: null/empty input never throws", () => {
  assert.equal(countGoalApiRedCards(null, "home"), 0);
  assert.equal(countGoalApiRedCards([], "away"), 0);
});

test("buildGoalApiEvents: real cards map to yellow_card/red_card entries with the fouling player", () => {
  const out = buildGoalApiEvents(null, null, realYellowCards);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.type, "yellow_card");
  assert.equal(out[0]!.team, "home");
  assert.equal(out[0]!.player, "Peglow");
  assert.equal(out[1]!.team, "away");
  assert.equal(out[1]!.player, "D. Schnegg");
});

test("buildGoalApiEvents: real substitution shape (combined 'Out | In' string) splits correctly", () => {
  const subs: GoalApiSubstitution[] = [
    {
      id: "cmu94mlhtsd92km08h7y77jiz",
      fixtureId: "cmt71rdb2sveut107jztus79r",
      time: "65",
      timeNum: 65,
      substitution: "J. Hopkins | N. Ordaz",
      substitutionPlayerId: "3867253939 | 2958147113",
      team: "home",
    },
  ];
  const out = buildGoalApiEvents(null, subs, null);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.type, "substitution");
  assert.equal(out[0]!.team, "home");
  assert.equal(out[0]!.player, "N. Ordaz");
  assert.equal(out[0]!.detail, "Saiu: J. Hopkins");
  assert.equal(out[0]!.minute, 65);
});
