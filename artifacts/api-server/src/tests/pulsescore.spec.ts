import test from "node:test";
import assert from "node:assert/strict";

// config.ts reads process.env.PULSESCORE_* once at module-evaluation time,
// and as an ES module it's a singleton — when this file runs standalone
// it's the first to import it, but when run via core.spec.ts an earlier
// spec may already have imported (and thus frozen) it first. So rather
// than assume a key value, read CONFIG.PULSESCORE_API_KEY back out and
// build expectations from it — correct under either run order.
const { CONFIG } = await import("../lib/config.js");
const { bookmakerPrefix, pulseScoreRestUrl, pulseScoreWsUrl } = await import(
  "../services/pulsescore/client.js"
);
const { teamNamesMatch } = await import("../services/pulsescore/teamMatch.js");
const {
  extractFootballOverride,
  pulseScoreEventMinute,
  pulseScoreEventClockSec,
  pulseScoreEventClockFinished,
} = await import("../services/pulsescore/football.js");
const { extractBasketballOverride } = await import(
  "../services/pulsescore/basketball.js"
);
const { __testing: footballWs } = await import(
  "../services/pulsescore/footballWs.js"
);

test("bookmakerPrefix: bet365 uses the versioned v3 path", () => {
  assert.equal(bookmakerPrefix("bet365"), "v3/bet365");
});

test("bookmakerPrefix: every other bookmaker is unversioned", () => {
  assert.equal(bookmakerPrefix("pinnacle"), "pinnacle");
  assert.equal(bookmakerPrefix("fanduel"), "fanduel");
  assert.equal(bookmakerPrefix("draftkings"), "draftkings");
});

test("pulseScoreRestUrl: builds a bookmaker-scoped REST path", () => {
  assert.equal(
    pulseScoreRestUrl("/live-events?sport=soccer", "bet365"),
    "https://api.pulsescore.net/api/v3/bet365/live-events?sport=soccer",
  );
  assert.equal(
    pulseScoreRestUrl("/leagues", "fanduel"),
    "https://api.pulsescore.net/api/fanduel/leagues",
  );
});

test("pulseScoreWsUrl: swaps http(s) for ws(s) and carries key + sport", () => {
  const url = pulseScoreWsUrl("soccer");
  const expectedKey = encodeURIComponent(CONFIG.PULSESCORE_API_KEY);
  assert.equal(
    url,
    `wss://api.pulsescore.net/api/v3/bet365/ws/live?key=${expectedKey}&sport=soccer`,
  );
});

test("teamNamesMatch: exact match after slugify", () => {
  assert.equal(teamNamesMatch("Real Madrid", "real-madrid"), true);
});

test("teamNamesMatch: club-token stripping matches across FC/CF/SC variants", () => {
  assert.equal(teamNamesMatch("FC Porto", "Porto SC"), true);
});

test("teamNamesMatch: does not conflate distinct clubs sharing a city", () => {
  assert.equal(teamNamesMatch("Real Madrid", "Atletico Madrid"), false);
});

test("teamNamesMatch: near-miss spellings above the fuzzy floor match", () => {
  assert.equal(teamNamesMatch("Deportivo Cali", "Deportivo Kali"), true);
});

test("teamNamesMatch: genuine near-miss clubs stay distinct", () => {
  assert.equal(teamNamesMatch("Deportivo Cali", "Deportivo Pasto"), false);
});

test("teamNamesMatch: reorders 'Lastname, Firstname' tennis names before comparing", () => {
  assert.equal(teamNamesMatch("Ruse, Elena-Gabriela", "Elena-Gabriela Ruse"), true);
});

test("teamNamesMatch: surname-only fallback only applies when a comma signals an individual-player name", () => {
  assert.equal(teamNamesMatch("Ruse, Elena-Gabriela", "E. Ruse"), true);
  // Neither side has a comma, so club names sharing a trailing city token
  // must NOT fall back to surname-only matching.
  assert.equal(teamNamesMatch("Real Madrid", "Atletico Madrid"), false);
});

test("teamNamesMatch: empty strings never match", () => {
  assert.equal(teamNamesMatch("", "Real Madrid"), false);
  assert.equal(teamNamesMatch("Real Madrid", ""), false);
});

// Real event samples (2026-08-08) showed "Goal Line (H-A)" markets pricing
// the exact same numeric line as "Match Goals" with different odds (e.g.
// Match Goals Over 2.5 @1.8333 vs Goal Line (0-2) Over 2.5 @1.95 on the same
// live event) — extractFootballOverride must always prefer "Match Goals",
// never let "Goal Line" silently win by array order.
// `line` sits on the MARKET object, not the selections — matches bwin's real
// shape (confirmed by scanning an entire real doc sample, 3293 market blocks
// across football and basketball: zero selections carried their own `line`).
// An earlier version of this helper put `line` on each selection instead,
// which is bet365's shape, not bwin's — that mismatch let a real production
// bug ship: extractFootballOverride's Total Goals extraction read sel.line
// first, which is always undefined for bwin, so it silently never populated
// real odds despite this test suite passing.
function makeOverUnderMarket(rawName: string, line: number, overOdds: number, underOdds: number) {
  return {
    canonicalMarket: "OVER_UNDER",
    rawName,
    period: "FULL_TIME",
    isActive: true,
    marketId: `test:${rawName}`,
    line,
    selections: [
      { canonicalOutcome: "OVER", rawName: "Over", odds: overOdds, isActive: true },
      { canonicalOutcome: "UNDER", rawName: "Under", odds: underOdds, isActive: true },
    ],
  };
}

function makeFootballEvent(markets: unknown[]) {
  return {
    eventId: "test-1",
    sport: "soccer",
    league: "Test League",
    home: "Home FC",
    away: "Away FC",
    score: { home: "0", away: "0" },
    markets,
  } as Parameters<typeof extractFootballOverride>[0];
}

test("extractFootballOverride: 'Match Goals' wins over a same-line 'Goal Line' market regardless of array order", () => {
  const matchGoals = makeOverUnderMarket("Match Goals", 2.5, 1.8333, 1.8333);
  const goalLine = makeOverUnderMarket("Goal Line (0-2)", 2.5, 1.95, 1.85);

  const overrideA = extractFootballOverride(makeFootballEvent([matchGoals, goalLine]));
  assert.equal(overrideA.totalGoals?.over25, 1.8333);
  assert.equal(overrideA.totalGoals?.under25, 1.8333);

  const overrideB = extractFootballOverride(makeFootballEvent([goalLine, matchGoals]));
  assert.equal(overrideB.totalGoals?.over25, 1.8333);
  assert.equal(overrideB.totalGoals?.under25, 1.8333);
});

test("extractFootballOverride: 'Alternative Match Goals' still contributes lines Match Goals doesn't cover", () => {
  const matchGoals = makeOverUnderMarket("Match Goals", 2.5, 1.8333, 1.8333);
  const altGoals = makeOverUnderMarket("Alternative Match Goals", 3.5, 6, 1.125);

  const override = extractFootballOverride(makeFootballEvent([matchGoals, altGoals]));
  assert.equal(override.totalGoals?.over25, 1.8333);
  assert.equal(override.totalGoals?.over35, 6);
  assert.equal(override.totalGoals?.under35, 1.125);
});

// bwin's normalized matchClock (confirmed real, 2026-08-08:
// {minute:92, second:42, period:"2H", running:true}) should be preferred
// over bet365's raw moreInfo.TM/TS whenever an event carries both.
test("pulseScoreEventMinute/ClockSec: prefer matchClock over raw bet365 moreInfo.TM/TS", () => {
  const withMatchClock = makeFootballEvent([]);
  (withMatchClock as any).matchClock = { minute: 92, second: 42, period: "2H", running: true };
  (withMatchClock as any).moreInfo = { TM: "45", TS: "10" }; // should be ignored
  assert.equal(pulseScoreEventMinute(withMatchClock), 92);
  assert.equal(pulseScoreEventClockSec(withMatchClock), 92 * 60 + 42);

  const bet365Only = makeFootballEvent([]);
  (bet365Only as any).moreInfo = { TM: "68", TS: "5" };
  assert.equal(pulseScoreEventMinute(bet365Only), 68);
  assert.equal(pulseScoreEventClockSec(bet365Only), 68 * 60 + 5);
});

test("pulseScoreEventClockFinished: true only for bwin's matchClock.period === 'Finished'", () => {
  const finished = makeFootballEvent([]);
  (finished as any).matchClock = { minute: 95, second: 24, period: "Finished", running: false };
  assert.equal(pulseScoreEventClockFinished(finished), true);

  const stillLive = makeFootballEvent([]);
  (stillLive as any).matchClock = { minute: 93, second: 54, period: "2H", running: true };
  assert.equal(pulseScoreEventClockFinished(stillLive), false);

  // bet365 events carry no matchClock at all — never mistaken as finished.
  const bet365Only = makeFootballEvent([]);
  assert.equal(pulseScoreEventClockFinished(bet365Only), false);
});

// bwin names this market "Total Goals" (bet365 calls the same
// canonicalMarket/period combo "Match Goals") — confirmed against a real
// bwin /live-events?sport=soccer sample (2026-08-08).
test("extractFootballOverride: recognizes bwin's 'Total Goals' market name", () => {
  const totalGoals = makeOverUnderMarket("Total Goals", 2.5, 1.9, 1.9);
  const override = extractFootballOverride(makeFootballEvent([totalGoals]));
  assert.equal(override.totalGoals?.over25, 1.9);
  assert.equal(override.totalGoals?.under25, 1.9);
});

// bwin-only canonicalMarket "FIRST_TEAM_TO_SCORE" — confirmed against real
// live and prematch samples (2026-08-08). Maps onto the existing
// AdvancedMarkets.firstGoal field.
test("extractFootballOverride: recognizes bwin's FIRST_TEAM_TO_SCORE market", () => {
  const firstTeamToScore = {
    canonicalMarket: "FIRST_TEAM_TO_SCORE",
    rawName: "First Team to Score",
    period: "FULL_TIME",
    isActive: true,
    marketId: "test:ftts",
    selections: [
      { canonicalOutcome: "HOME", rawName: "Home FC", odds: 1.55, isActive: true },
      { canonicalOutcome: "NEITHER", rawName: "No goal", odds: 12, isActive: true },
      { canonicalOutcome: "AWAY", rawName: "Away FC", odds: 2.65, isActive: true },
    ],
  };
  const override = extractFootballOverride(makeFootballEvent([firstTeamToScore]));
  assert.equal(override.firstGoal?.home, 1.55);
  assert.equal(override.firstGoal?.noGoal, 12);
  assert.equal(override.firstGoal?.away, 2.65);
});

// bwin's selections carry no moreInfo at all (confirmed: zero occurrences
// across a full real API doc sample, 2026-08-08) — double chance has to be
// read off rawName instead of bet365's moreInfo.N2 code.
test("extractFootballOverride: double chance falls back to rawName parsing when moreInfo.N2 is absent (bwin)", () => {
  const doubleChance = {
    canonicalMarket: "DOUBLE_CHANCE",
    rawName: "Double Chance",
    period: "FULL_TIME",
    isActive: true,
    marketId: "test:dc",
    selections: [
      { canonicalOutcome: "OTHER", rawName: "Home FC or X", odds: 1.2, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "X or Away FC", odds: 3.5, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "Home FC or Away FC", odds: 1.05, isActive: true },
    ],
  };
  const override = extractFootballOverride(makeFootballEvent([doubleChance]));
  assert.equal(override.doubleChance?.homeOrDraw, 1.2);
  assert.equal(override.doubleChance?.awayOrDraw, 3.5);
  assert.equal(override.doubleChance?.homeOrAway, 1.05);
});

test("footballWs applyFrame: keeps an event missing from a single subsequent frame (grace period)", () => {
  footballWs.liveByEventId.clear();
  footballWs.lastSeenAt.clear();
  footballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "evt-1", sport: "soccer" } as never],
  });
  assert.equal(footballWs.liveByEventId.has("evt-1"), true);

  // A frame that doesn't mention evt-1 (as a delta-only feed would send for
  // an unchanged match) must not immediately purge it.
  footballWs.applyFrame({ sport: "soccer", timestamp: Date.now(), count: 0, data: [] });
  assert.equal(
    footballWs.liveByEventId.has("evt-1"),
    true,
    "an event absent from one frame should survive the grace period",
  );
});

test("footballWs applyFrame: ignores frames/events tagged for a different sport", () => {
  footballWs.liveByEventId.clear();
  footballWs.lastSeenAt.clear();
  footballWs.applyFrame({
    sport: "tennis",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "evt-2", sport: "tennis" } as never],
  });
  assert.equal(footballWs.liveByEventId.size, 0);

  footballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "evt-3", sport: "basketball" } as never],
  });
  assert.equal(footballWs.liveByEventId.size, 0);
});

// ── Basketball (bwin) ────────────────────────────────────────────────────
// Real bwin GET /basketball/leagues sample (2026-08-09): every event carries
// its Money Line / Handicap / Totals markets THREE times (FULL_TIME,
// FIRST_HALF, FIRST_QUARTER — all sharing the same canonicalMarket), and
// Handicap alone often carries several alternate FULL_TIME lines too. Both
// are exercised below since the old code's "skip if more than one market of
// this type" guard would have made extraction silently no-op on real bwin
// data.
function makeBasketballEvent(markets: unknown[]) {
  return {
    eventId: "bball-test-1",
    sport: "basketball",
    league: "Test League",
    home: "Home BC",
    away: "Away BC",
    markets,
  } as Parameters<typeof extractBasketballOverride>[0];
}

function makeMoneylineMarket(period: string, homeOdds: number, awayOdds: number) {
  return {
    canonicalMarket: "MATCH_RESULT",
    rawName: "Money Line",
    period,
    isActive: true,
    marketId: `test:ml:${period}`,
    selections: [
      { canonicalOutcome: "HOME", rawName: "Home BC", odds: homeOdds, isActive: true },
      { canonicalOutcome: "AWAY", rawName: "Away BC", odds: awayOdds, isActive: true },
    ],
  };
}

test("extractBasketballOverride: ignores FIRST_HALF/FIRST_QUARTER Money Line duplicates (bwin)", () => {
  const ev = makeBasketballEvent([
    makeMoneylineMarket("FULL_TIME", 1.5, 2.6),
    makeMoneylineMarket("FIRST_HALF", 1.4, 2.9),
    makeMoneylineMarket("FIRST_QUARTER", 1.45, 2.5),
  ]);
  const override = extractBasketballOverride(ev);
  assert.equal(override.odds?.home, 1.5);
  assert.equal(override.odds?.away, 2.6);
});

// bwin: canonicalMarket "EUROPEAN_HANDICAP" (not bet365's "ASIAN_HANDICAP"),
// line on the market object, and several alternate FULL_TIME lines per event
// — confirmed against a real sample (2026-08-09): one match carried
// Handicap at -8.5 (1.65/2.05), -9.5 (1.72/1.95), -10.5 (1.85/1.83), -11.5
// (1.95/1.72), -12.5 (2.1/1.62) all at once. -10.5 is the "main" line (odds
// closest to even).
function makeHandicapMarket(period: string, line: number, homeOdds: number, awayOdds: number) {
  return {
    canonicalMarket: "EUROPEAN_HANDICAP",
    rawName: "Handicap",
    period,
    line,
    isActive: true,
    marketId: `test:hcp:${line}`,
    selections: [
      { canonicalOutcome: "HOME", rawName: `Home BC ${line}`, odds: homeOdds, isActive: true },
      { canonicalOutcome: "AWAY", rawName: `Away BC ${-line}`, odds: awayOdds, isActive: true },
    ],
  };
}

test("extractBasketballOverride: recognizes bwin's EUROPEAN_HANDICAP and picks the most-even alternate line", () => {
  const ev = makeBasketballEvent([
    makeHandicapMarket("FULL_TIME", -8.5, 1.65, 2.05),
    makeHandicapMarket("FULL_TIME", -9.5, 1.72, 1.95),
    makeHandicapMarket("FULL_TIME", -10.5, 1.85, 1.83),
    makeHandicapMarket("FULL_TIME", -11.5, 1.95, 1.72),
    makeHandicapMarket("FULL_TIME", -12.5, 2.1, 1.62),
    makeHandicapMarket("FIRST_HALF", -4.5, 1.75, 1.91),
  ]);
  const override = extractBasketballOverride(ev);
  assert.equal(override.spread?.line, -10.5);
  assert.equal(override.spread?.home, 1.85);
  assert.equal(override.spread?.away, 1.83);
});

test("extractBasketballOverride: reads Totals line from the market, not the selection (bwin)", () => {
  const totals = {
    canonicalMarket: "OVER_UNDER",
    rawName: "Totals",
    period: "FULL_TIME",
    line: 170.5,
    isActive: true,
    marketId: "test:totals",
    selections: [
      { canonicalOutcome: "OVER", rawName: "Over 170.5", odds: 1.85, isActive: true },
      { canonicalOutcome: "UNDER", rawName: "Under 170.5", odds: 1.83, isActive: true },
    ],
  };
  const override = extractBasketballOverride(makeBasketballEvent([totals]));
  assert.equal(override.total?.line, 170.5);
  assert.equal(override.total?.over, 1.85);
  assert.equal(override.total?.under, 1.83);
});
