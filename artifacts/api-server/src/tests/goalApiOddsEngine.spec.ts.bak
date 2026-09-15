import test from "node:test";
import assert from "node:assert/strict";
import { shouldAcceptOddsUpdate } from "../services/goalapi/oddsEngine.js";

test("shouldAcceptOddsUpdate: accepts the first real price when there is no previous value", () => {
  assert.equal(shouldAcceptOddsUpdate(null, { home: 1.8, draw: 3.4, away: 4.2 }, 40, false), true);
});

test("shouldAcceptOddsUpdate: accepts a small swing well within the limit", () => {
  const previous = { home: 1.8, draw: 3.4, away: 4.2 };
  const candidate = { home: 1.85, draw: 3.3, away: 4.0 };
  assert.equal(shouldAcceptOddsUpdate(previous, candidate, 40, false), true);
});

test("shouldAcceptOddsUpdate: rejects a large unexplained swing", () => {
  const previous = { home: 1.8, draw: 3.4, away: 4.2 };
  const candidate = { home: 5.0, draw: 3.4, away: 4.2 }; // home nearly tripled
  assert.equal(shouldAcceptOddsUpdate(previous, candidate, 40, false), false);
});

test("shouldAcceptOddsUpdate: accepts the same large swing when a goal/red card explains it", () => {
  const previous = { home: 1.8, draw: 3.4, away: 4.2 };
  const candidate = { home: 5.0, draw: 3.4, away: 4.2 };
  assert.equal(shouldAcceptOddsUpdate(previous, candidate, 40, true), true);
});

test("shouldAcceptOddsUpdate: a swing exactly at the limit is accepted, just past it is rejected", () => {
  const previous = { home: 2.0, draw: 3.0, away: 4.0 };
  assert.equal(shouldAcceptOddsUpdate(previous, { home: 2.8, draw: 3.0, away: 4.0 }, 40, false), true); // +40%
  assert.equal(shouldAcceptOddsUpdate(previous, { home: 2.81, draw: 3.0, away: 4.0 }, 40, false), false); // +40.5%
});
