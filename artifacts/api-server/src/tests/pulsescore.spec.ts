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
const { extractTennisPrematchExtra } = await import(
  "../services/pulsescore/tennis.js"
);
const { extractHockeyOverride } = await import(
  "../services/pulsescore/hockey.js"
);
const { extractVolleyballOverride } = await import(
  "../services/pulsescore/volleyball.js"
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

// bwin's tennis market selections often abbreviate the given name to a
// single or double initial while the tracked event's own home/away carries
// the full name plus a "(CTRY)" suffix — confirmed against real
// /tennis/leagues and /tennis/events samples (2026-08-09). No comma
// involved, so this needs its own fallback distinct from the one above.
test("teamNamesMatch: initial+surname fallback matches bwin's abbreviated tennis selection names", () => {
  assert.equal(teamNamesMatch("J. Schwaerzler", "Joel Schwaerzler (AUT)"), true);
  // Double-initial abbreviation ("O.J.") must still resolve to the same
  // surname/first-initial as the full "Oscar Jose".
  assert.equal(teamNamesMatch("O.J. Gutierrez", "Oscar Jose Gutierrez (ESP)"), true);
  // Two different players who happen to share a surname must NOT collapse
  // together just because one side looks abbreviated.
  assert.equal(teamNamesMatch("J. Schwaerzler", "Andrea Guerrieri (ITA)"), false);
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

// bwin-only: canonicalMarket "OTHER", rawName "Anytime Goalscorer" — one
// selection per real player plus a "No goalscorer" row. Confirmed against a
// real live sample (2026-08-08). The "No goalscorer" row must be excluded
// (it's not a player), and each surviving row's `player` string must be
// exactly what a "pg:{player}" selection key would carry, since
// settlement.ts matches that against Statpal's own goal-incident names.
test("extractFootballOverride: extracts bwin's Anytime Goalscorer market, excluding the 'No goalscorer' row", () => {
  const goalscorer = {
    canonicalMarket: "OTHER",
    rawName: "Anytime Goalscorer",
    period: "FULL_TIME",
    isActive: true,
    marketId: "test:anytime-scorer",
    selections: [
      { canonicalOutcome: "OTHER", rawName: "Jan Kliment", odds: 2.65, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "Vaclav Sejk", odds: 5.5, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "No goalscorer", odds: 9.5, isActive: true },
    ],
  };
  const override = extractFootballOverride(makeFootballEvent([goalscorer]));
  assert.deepEqual(override.anytimeGoalscorer, [
    { player: "Jan Kliment", odds: 2.65 },
    { player: "Vaclav Sejk", odds: 5.5 },
  ]);
});

function makeTennisPrematchEvent(markets: unknown[]) {
  return {
    eventId: "test-tennis-1",
    sport: "tennis",
    league: "ATP Challenger Test",
    home: "Joel Schwaerzler (AUT)",
    away: "Andrea Guerrieri (ITA)",
    startTime: "2026-08-09T11:15:00.000Z",
    live: false,
    markets,
  } as Parameters<typeof extractTennisPrematchExtra>[0];
}

// bwin's Set 1 Winner (confirmed against a real /tennis/leagues sample,
// 2026-08-09) reuses canonicalMarket "MATCH_RESULT" — same as the overall
// match winner — differentiated only by period "FIRST_SET", and its
// selections carry canonicalOutcome "OTHER" with the player name in
// rawName instead of HOME/AWAY. Before this fix, extractTennisPrematchExtra
// looked for a dedicated "SET_WINNER" canonicalMarket (bet365's shape) and
// only read HOME/AWAY outcomes — both wrong for bwin, so out.firstSet would
// silently never populate.
test("extractTennisPrematchExtra: extracts bwin's Set 1 Winner (MATCH_RESULT + FIRST_SET, OTHER outcomes)", () => {
  const setWinner = {
    canonicalMarket: "MATCH_RESULT",
    rawName: "Set 1 Winner",
    period: "FIRST_SET",
    isActive: true,
    marketId: "test:set1winner",
    selections: [
      { canonicalOutcome: "OTHER", rawName: "J. Schwaerzler", odds: 1.72, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "A. Guerrieri", odds: 1.95, isActive: true },
    ],
  };
  const extra = extractTennisPrematchExtra(makeTennisPrematchEvent([setWinner]));
  assert.deepEqual(extra.firstSet, { home: 1.72, away: 1.95 });
});

// bwin puts `line` on the TOTAL_GAMES market, never the selection (same
// class of bug already fixed for football/basketball's totals markets) —
// each alternate line is its own separate market object.
test("extractTennisPrematchExtra: reads Total Games line from the market, not the selection (bwin)", () => {
  const totalGames = {
    canonicalMarket: "TOTAL_GAMES",
    rawName: "Total games: Match",
    period: "FULL_TIME",
    line: 22.5,
    isActive: true,
    marketId: "test:total-games",
    selections: [
      { canonicalOutcome: "OVER", rawName: "Over 22.5", odds: 1.9, isActive: true },
      { canonicalOutcome: "UNDER", rawName: "Under 22.5", odds: 1.78, isActive: true },
    ],
  };
  const extra = extractTennisPrematchExtra(makeTennisPrematchEvent([totalGames]));
  assert.equal(extra.totalGames?.line, 22.5);
  assert.equal(extra.totalGames?.over, 1.9);
  assert.equal(extra.totalGames?.under, 1.78);
});

test("teamNamesMatch: nickname-suffix fallback matches bwin's short hockey team names", () => {
  assert.equal(teamNamesMatch("Panthers", "Florida Panthers"), true);
  assert.equal(teamNamesMatch("Hurricanes", "Carolina Hurricanes"), true);
  // Same-length token sets must NOT fall back to this — "Real Madrid" isn't
  // a nickname-abbreviated form of "Atletico Madrid", they're different
  // clubs that happen to share a trailing city token.
  assert.equal(teamNamesMatch("Real Madrid", "Atletico Madrid"), false);
});

function makeHockeyEvent(home: string, away: string, markets: unknown[]) {
  return {
    eventId: "test-hockey-1",
    sport: "ice_hockey",
    league: "Test League",
    home,
    away,
    markets,
  } as Parameters<typeof extractHockeyOverride>[0];
}

// bwin's hockey moneyline is a "3-Way - Result After Regular Time" market
// (canonicalMarket "OTHER", not "MATCH_RESULT") whose selections sometimes
// carry only the short team nickname with canonicalOutcome "OTHER" instead
// of HOME/AWAY (confirmed against a real NHL /ice-hockey/leagues sample,
// 2026-08-09: "Panthers"/"Hurricanes" selections vs event home/away
// "Florida Panthers"/"Carolina Hurricanes") — needs teamNamesMatch's
// nickname-suffix fallback to resolve.
test("extractHockeyOverride: extracts the 3-Way Result market, resolving nickname-only selections via teamNamesMatch", () => {
  const threeWay = {
    canonicalMarket: "OTHER",
    rawName: "3-Way - Result After Regular Time",
    period: "FULL_TIME",
    isActive: true,
    marketId: "test:3way",
    selections: [
      { canonicalOutcome: "OTHER", rawName: "Panthers", odds: 2.54, isActive: true },
      { canonicalOutcome: "DRAW", rawName: "X", odds: 4, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "Hurricanes", odds: 2.3, isActive: true },
    ],
  };
  const override = extractHockeyOverride(
    makeHockeyEvent("Florida Panthers", "Carolina Hurricanes", [threeWay]),
  );
  assert.deepEqual(override.odds, { home: 2.54, draw: 4, away: 2.3 });
});

// bwin's hockey Handicap (canonicalMarket "ASIAN_HANDICAP") puts `line` on
// the market, not the selection, and lists alternate lines as separate
// market objects — same shape already confirmed for basketball. Verified
// against a real Australian Ice Hockey League event (2026-08-09) that
// carried both +1.5 and -1.5 as separate FULL_TIME markets.
test("extractHockeyOverride: picks the most-even-odds Handicap line from multiple alternates (bwin)", () => {
  const handicapA = {
    canonicalMarket: "ASIAN_HANDICAP",
    rawName: "Handicap (regular time)",
    period: "FULL_TIME",
    line: 1.5,
    isActive: true,
    marketId: "test:handicap-a",
    selections: [
      { canonicalOutcome: "HOME", rawName: "Home +1.5", odds: 1.5, isActive: true },
      { canonicalOutcome: "AWAY", rawName: "Away -1.5", odds: 2.35, isActive: true },
    ],
  };
  const handicapB = {
    canonicalMarket: "ASIAN_HANDICAP",
    rawName: "Handicap (regular time)",
    period: "FULL_TIME",
    line: -1.5,
    isActive: true,
    marketId: "test:handicap-b",
    selections: [
      { canonicalOutcome: "HOME", rawName: "Home -1.5", odds: 3.1, isActive: true },
      { canonicalOutcome: "AWAY", rawName: "Away +1.5", odds: 1.3, isActive: true },
    ],
  };
  const override = extractHockeyOverride(
    makeHockeyEvent("Perth Thunder", "Melbourne Mustangs", [handicapA, handicapB]),
  );
  // |1.5 - 2.35| = 0.85 vs |3.1 - 1.3| = 1.8 -> handicapA is more even.
  assert.deepEqual(override.spread, { line: 1.5, home: 1.5, away: 2.35 });
});

// bwin's hockey Totals (canonicalMarket "OVER_UNDER") puts `line` on the
// market, never the selection — same class of bug already fixed for
// football/basketball/tennis's totals markets.
test("extractHockeyOverride: reads Totals line from the market, not the selection (bwin)", () => {
  const totals = {
    canonicalMarket: "OVER_UNDER",
    rawName: "Totals (regular time)",
    period: "FULL_TIME",
    line: 8.5,
    isActive: true,
    marketId: "test:totals",
    selections: [
      { canonicalOutcome: "OVER", rawName: "Over 8.5", odds: 1.8, isActive: true },
      { canonicalOutcome: "UNDER", rawName: "Under 8.5", odds: 1.87, isActive: true },
    ],
  };
  const override = extractHockeyOverride(
    makeHockeyEvent("Perth Thunder", "Melbourne Mustangs", [totals]),
  );
  assert.equal(override.total?.line, 8.5);
  assert.equal(override.total?.over, 1.8);
  assert.equal(override.total?.under, 1.87);
});

function makeVolleyballEvent(markets: unknown[]) {
  return {
    eventId: "5:1102893",
    sport: "volleyball",
    league: "Test League",
    home: "Thailand",
    away: "Vietnam",
    markets,
  } as Parameters<typeof extractVolleyballOverride>[0];
}

// bwin's volleyball Match Result and Set 1 Winner are both clean:
// canonicalMarket "MATCH_RESULT" with explicit HOME/AWAY, no draw possible —
// confirmed against a real /volleyball/leagues sample (2026-08-09).
test("extractVolleyballOverride: extracts Match Result and Set 1 Winner (bwin)", () => {
  const matchResult = {
    canonicalMarket: "MATCH_RESULT",
    rawName: "Match Result",
    period: "FULL_TIME",
    isActive: true,
    marketId: "test:match-result",
    selections: [
      { canonicalOutcome: "HOME", rawName: "Thailand", odds: 1.062, isActive: true },
      { canonicalOutcome: "AWAY", rawName: "Vietnam", odds: 8.75, isActive: true },
    ],
  };
  const set1 = {
    canonicalMarket: "MATCH_RESULT",
    rawName: "Set 1 Winner",
    period: "FIRST_SET",
    isActive: true,
    marketId: "test:set1",
    selections: [
      { canonicalOutcome: "HOME", rawName: "Thailand", odds: 1.21, isActive: true },
      { canonicalOutcome: "AWAY", rawName: "Vietnam", odds: 4.1, isActive: true },
    ],
  };
  const override = extractVolleyballOverride(makeVolleyballEvent([matchResult, set1]));
  assert.deepEqual(override.odds, { home: 1.062, away: 8.75 });
  assert.deepEqual(override.set1, { home: 1.21, away: 4.1 });
});

// bwin's Total Points puts `line` on the market, never the selection (same
// class of bug already fixed for the other sports), and lists multiple
// alternate lines as separate market objects — all must be collected, not
// just the first one, since AdvancedMarkets.volleyballExtra.pointsLines is
// an array.
test("extractVolleyballOverride: collects every Total Points alternate line (bwin)", () => {
  const makeTotal = (line: number, over: number, under: number) => ({
    canonicalMarket: "OVER_UNDER",
    rawName: "Total Points",
    period: "FULL_TIME",
    line,
    isActive: true,
    marketId: `test:total-${line}`,
    selections: [
      { canonicalOutcome: "OVER", rawName: `Over ${line}`, odds: over, isActive: true },
      { canonicalOutcome: "UNDER", rawName: `Under ${line}`, odds: under, isActive: true },
    ],
  });
  const override = extractVolleyballOverride(
    makeVolleyballEvent([
      makeTotal(139.5, 1.83, 1.87),
      makeTotal(140.5, 1.87, 1.83),
      makeTotal(141.5, 1.9, 1.8),
    ]),
  );
  assert.deepEqual(override.pointsLines, [
    { line: 139.5, over: 1.83, under: 1.87 },
    { line: 140.5, over: 1.87, under: 1.83 },
    { line: 141.5, over: 1.9, under: 1.8 },
  ]);
});

// bwin's Correct Score selections are labelled "3:0"/"3:1"/.../"0:3" — must
// map onto the existing volleyballExtra.exactScore shape's s30/s31/s32/s03/
// s13/s23 keys.
test("extractVolleyballOverride: maps Correct Score selections to exactScore keys (bwin)", () => {
  const correctScore = {
    canonicalMarket: "CORRECT_SCORE",
    rawName: "Correct Score",
    period: "FULL_TIME",
    isActive: true,
    marketId: "test:correct-score",
    selections: [
      { canonicalOutcome: "OTHER", rawName: "3:0", odds: 1.75, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "3:1", odds: 3.2, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "3:2", odds: 7.25, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "2:3", odds: 16, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "1:3", odds: 18.5, isActive: true },
      { canonicalOutcome: "OTHER", rawName: "0:3", odds: 31, isActive: true },
    ],
  };
  const override = extractVolleyballOverride(makeVolleyballEvent([correctScore]));
  assert.deepEqual(override.exactScore, {
    s30: 1.75,
    s31: 3.2,
    s32: 7.25,
    s03: 31,
    s13: 18.5,
    s23: 16,
  });
});
