import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectionSettlement } from "../../settlement.js";
import { makeSelection } from "./helpers.js";

const HOUR_MS = 60 * 60 * 1000;
const THRESHOLD_72H_MS = 72 * HOUR_MS;

function withMockedNow<T>(now: number, run: () => T): T {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return run();
  } finally {
    Date.now = originalNow;
  }
}

test("cancelled event is immediately voided", () => {
  const result = resolveSelectionSettlement(
    makeSelection("home"),
    { home: 0, away: 0 },
    undefined,
    {
      status: "cancelled",
    },
  );

  assert.equal(result.outcome, "void");
});

test("postponed event remains pending before the 72h void threshold", () => {
  const now = Date.parse("2026-01-05T12:00:00.000Z");
  const result = withMockedNow(now, () =>
    resolveSelectionSettlement(
      makeSelection("home"),
      { home: 0, away: 0 },
      undefined,
      {
        status: "postponed",
        finishedAt: now - 2 * HOUR_MS,
      },
    ),
  );

  assert.equal(result.outcome, null);
});

test("postponed event stays pending exactly at the 72h threshold", () => {
  const now = Date.parse("2026-01-05T12:00:00.000Z");
  const result = withMockedNow(now, () =>
    resolveSelectionSettlement(
      makeSelection("home"),
      { home: 0, away: 0 },
      undefined,
      {
        status: "postponed",
        finishedAt: now - THRESHOLD_72H_MS,
      },
    ),
  );

  assert.equal(result.outcome, null);
});

test("postponed event is voided once it passes the 72h threshold", () => {
  const now = Date.parse("2026-01-05T12:00:00.000Z");
  const result = withMockedNow(now, () =>
    resolveSelectionSettlement(
      makeSelection("home"),
      { home: 0, away: 0 },
      undefined,
      {
        status: "postponed",
        finishedAt: now - THRESHOLD_72H_MS - 1,
      },
    ),
  );

  assert.equal(result.outcome, "void");
});

test("delayed event is voided once it passes the same 72h threshold", () => {
  const now = Date.parse("2026-01-05T12:00:00.000Z");
  const result = withMockedNow(now, () =>
    resolveSelectionSettlement(
      makeSelection("home"),
      { home: 0, away: 0 },
      undefined,
      {
        status: "delayed",
        finishedAt: now - THRESHOLD_72H_MS - 1,
      },
    ),
  );

  assert.equal(result.outcome, "void");
});

test("unresolved market auto-voids after settlement timeout", () => {
  const now = Date.parse("2026-01-10T12:00:00.000Z");
  const result = withMockedNow(now, () =>
    resolveSelectionSettlement(
      makeSelection("1hcard-o2"),
      { home: 1, away: 0 },
      undefined,
      {
        finishedAt: now - 8 * 24 * HOUR_MS,
      },
    ),
  );

  assert.equal(result.outcome, "void");
  assert.equal(result.settlementNote, "auto_void_timeout");
});
