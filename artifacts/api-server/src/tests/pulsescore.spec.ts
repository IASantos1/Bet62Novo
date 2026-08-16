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
  mergeFootballWsFreshness,
} = await import("../services/pulsescore/football.js");
const { extractBasketballOverride, mergeBasketballWsFreshness } = await import(
  "../services/pulsescore/basketball.js"
);
const { extractTennisPrematchExtra, mergeTennisWsFreshness } = await import(
  "../services/pulsescore/tennis.js"
);
const { extractHockeyOverride } = await import(
  "../services/pulsescore/hockey.js"
);
const { extractVolleyballOverride } = await import(
  "../services/pulsescore/volleyball.js"
);
const { __testing: footballWs, getFootballWsEventIfFresh } = await import(
  "../services/pulsescore/footballWs.js"
);
const { __testing: basketballWs, getBasketballWsEventIfFresh } = await import(
  "../services/pulsescore/basketballWs.js"
);
const { __testing: tennisWs, getTennisWsEventIfFresh } = await import(
  "../services/pulsescore/tennisWs.js"
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

test("getFootballWsEventIfFresh: returns the event when its own lastSeenAt is within maxAgeMs", () => {
  footballWs.liveByEventId.clear();
  footballWs.lastSeenAt.clear();
  footballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "evt-fresh", sport: "soccer", home: "A", away: "B" } as never],
  });
  const ev = getFootballWsEventIfFresh("evt-fresh", 4_000);
  assert.equal(ev?.eventId, "evt-fresh");
});

test("getFootballWsEventIfFresh: returns null for an event never broadcast at all", () => {
  footballWs.liveByEventId.clear();
  footballWs.lastSeenAt.clear();
  assert.equal(getFootballWsEventIfFresh("never-seen", 4_000), null);
});

test("getFootballWsEventIfFresh: PER-EVENT staleness — a quiet event goes stale even while other events keep broadcasting (Attempt 2's bug)", () => {
  footballWs.liveByEventId.clear();
  footballWs.lastSeenAt.clear();
  // evt-quiet is seen once, far in the past — simulates a match whose price
  // hasn't moved since, so a delta-only feed never re-broadcasts it.
  footballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "evt-quiet", sport: "soccer", home: "A", away: "B" } as never],
  });
  footballWs.lastSeenAt.set("evt-quiet", Date.now() - 10_000);
  // evt-busy broadcasts right now — the connection as a whole looks healthy.
  footballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [
      { eventId: "evt-quiet", sport: "soccer", home: "A", away: "B" } as never,
      { eventId: "evt-busy", sport: "soccer", home: "C", away: "D" } as never,
    ],
  });
  // applyFrame's own call above just refreshed evt-quiet's lastSeenAt too —
  // force it back to stale to isolate the per-event check being tested.
  footballWs.lastSeenAt.set("evt-quiet", Date.now() - 10_000);
  assert.equal(
    getFootballWsEventIfFresh("evt-quiet", 4_000),
    null,
    "a quiet event's own staleness must not be masked by other events broadcasting",
  );
  assert.notEqual(getFootballWsEventIfFresh("evt-busy", 4_000), null);
});

test("mergeFootballWsFreshness: overlays matchClock/score from a fresh WS event, keeps REST untouched otherwise", () => {
  footballWs.liveByEventId.clear();
  footballWs.lastSeenAt.clear();
  footballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [
      {
        eventId: "evt-live",
        sport: "soccer",
        home: "A",
        away: "B",
        matchClock: { minute: 55, second: 12, period: "2H", running: true },
        score: { home: "2", away: "1" },
      } as never,
    ],
  });
  const restEvents = [
    {
      eventId: "evt-live",
      sport: "soccer",
      home: "A",
      away: "B",
      markets: [],
      matchClock: { minute: 54, second: 40, period: "2H", running: true },
      score: { home: "2", away: "1" },
    },
    {
      eventId: "evt-no-ws",
      sport: "soccer",
      home: "C",
      away: "D",
      markets: [],
      matchClock: { minute: 10, second: 0, period: "1H", running: true },
      score: { home: "0", away: "0" },
    },
  ] as never[];
  const merged = mergeFootballWsFreshness(restEvents as never);
  assert.equal(merged[0]!.matchClock?.minute, 55, "fresh WS reading should win over REST's own clock");
  assert.equal(merged[1]!.matchClock?.minute, 10, "an event WS hasn't seen must be untouched");
});

test("mergeFootballWsFreshness: a WS reading OLDER than REST's own must NOT regress the clock/score (production bug, 2026-08-09)", () => {
  footballWs.liveByEventId.clear();
  footballWs.lastSeenAt.clear();
  // WS's last broadcast for this event is genuinely older than what REST
  // already fetched — realistic when WS only re-broadcasts on change and
  // REST keeps polling every ~1s regardless.
  footballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [
      {
        eventId: "evt-stale-ws",
        sport: "soccer",
        home: "A",
        away: "B",
        matchClock: { minute: 60, second: 0, period: "2H", running: true },
        score: { home: "1", away: "0" },
      } as never,
    ],
  });
  const restEvents = [
    {
      eventId: "evt-stale-ws",
      sport: "soccer",
      home: "A",
      away: "B",
      markets: [],
      matchClock: { minute: 61, second: 30, period: "2H", running: true },
      score: { home: "2", away: "0" },
    },
  ] as never[];
  const merged = mergeFootballWsFreshness(restEvents as never);
  assert.equal(merged[0]!.matchClock?.minute, 61, "clock must not tick backward");
  assert.equal(merged[0]!.matchClock?.second, 30);
  assert.equal(merged[0]!.score?.home, "2", "score must not regress either");
});

test("mergeFootballWsFreshness: mismatched periods (mid-transition) are not compared — REST wins", () => {
  footballWs.liveByEventId.clear();
  footballWs.lastSeenAt.clear();
  footballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [
      {
        eventId: "evt-transition",
        sport: "soccer",
        home: "A",
        away: "B",
        matchClock: { minute: 45, second: 0, period: "1H", running: true },
      } as never,
    ],
  });
  const restEvents = [
    {
      eventId: "evt-transition",
      sport: "soccer",
      home: "A",
      away: "B",
      markets: [],
      matchClock: { minute: 46, second: 5, period: "2H", running: true },
    },
  ] as never[];
  const merged = mergeFootballWsFreshness(restEvents as never);
  assert.equal(merged[0]!.matchClock?.period, "2H", "REST's more advanced period must not be overwritten by a WS reading still in the prior half");
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

test("extractBasketballOverride: FULL_TIME Money Line stays unaffected by FIRST_HALF/FIRST_QUARTER duplicates (bwin)", () => {
  const ev = makeBasketballEvent([
    makeMoneylineMarket("FULL_TIME", 1.5, 2.6),
    makeMoneylineMarket("FIRST_HALF", 1.4, 2.9),
    makeMoneylineMarket("FIRST_QUARTER", 1.45, 2.5),
  ]);
  const override = extractBasketballOverride(ev);
  assert.equal(override.odds?.home, 1.5);
  assert.equal(override.odds?.away, 2.6);
});

// 2026-08-15: FIRST_QUARTER, THIRD_QUARTER and FIRST_HALF are now extracted
// into their own q1/q3/firstHalf blocks (confirmed real periods, same
// 2026-08-09 bwin sample as FULL_TIME above) — the "duplicates" from the
// test above aren't just discarded anymore, each period gets its own slot.
test("extractBasketballOverride: extracts FIRST_QUARTER and FIRST_HALF Money Line into q1/firstHalf", () => {
  const ev = makeBasketballEvent([
    makeMoneylineMarket("FULL_TIME", 1.5, 2.6),
    makeMoneylineMarket("FIRST_QUARTER", 1.45, 2.5),
    makeMoneylineMarket("FIRST_HALF", 1.4, 2.9),
  ]);
  const override = extractBasketballOverride(ev);
  assert.equal(override.q1?.odds?.home, 1.45);
  assert.equal(override.q1?.odds?.away, 2.5);
  assert.equal(override.firstHalf?.odds?.home, 1.4);
  assert.equal(override.firstHalf?.odds?.away, 2.9);
  assert.equal(override.q3, undefined, "no THIRD_QUARTER market was provided");
});

test("extractBasketballOverride: extracts THIRD_QUARTER Handicap and Totals into q3", () => {
  const ev = makeBasketballEvent([
    makeHandicapMarket("THIRD_QUARTER", -2.5, 1.9, 1.9),
    {
      canonicalMarket: "OVER_UNDER",
      rawName: "Totals",
      period: "THIRD_QUARTER",
      line: 42.5,
      isActive: true,
      marketId: "test:q3-totals",
      selections: [
        { canonicalOutcome: "OVER", rawName: "Over 42.5", odds: 1.87, isActive: true },
        { canonicalOutcome: "UNDER", rawName: "Under 42.5", odds: 1.87, isActive: true },
      ],
    },
  ]);
  const override = extractBasketballOverride(ev);
  assert.equal(override.q3?.spread?.line, -2.5);
  assert.equal(override.q3?.total?.line, 42.5);
  assert.equal(override.q3?.total?.over, 1.87);
});

// SECOND_QUARTER/FOURTH_QUARTER were never confirmed in a real sample (see
// this file's own header) — an event carrying one must not have it silently
// mapped into q1/q3/firstHalf by accident (would misattribute a real market
// to the wrong period, a settlement-correctness risk).
test("extractBasketballOverride: does not misattribute an unconfirmed SECOND_QUARTER market to q1/q3", () => {
  const ev = makeBasketballEvent([makeMoneylineMarket("SECOND_QUARTER", 1.6, 2.3)]);
  const override = extractBasketballOverride(ev);
  assert.equal(override.q1, undefined);
  assert.equal(override.q3, undefined);
  assert.equal(override.firstHalf, undefined);
  assert.equal(override.odds, undefined);
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

// ── Basketball WS (dedicated per-sport connection, mirrors footballWs) ────
test("basketballWs applyFrame: keeps an event missing from a single subsequent frame (grace period)", () => {
  basketballWs.liveByEventId.clear();
  basketballWs.lastSeenAt.clear();
  basketballWs.applyFrame({
    sport: "basketball",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "bball-1", sport: "basketball" } as never],
  });
  assert.equal(basketballWs.liveByEventId.has("bball-1"), true);

  basketballWs.applyFrame({ sport: "basketball", timestamp: Date.now(), count: 0, data: [] });
  assert.equal(
    basketballWs.liveByEventId.has("bball-1"),
    true,
    "an event absent from one frame should survive the grace period",
  );
});

test("basketballWs applyFrame: ignores frames/events tagged for a different sport", () => {
  basketballWs.liveByEventId.clear();
  basketballWs.lastSeenAt.clear();
  basketballWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "bball-2", sport: "soccer" } as never],
  });
  assert.equal(basketballWs.liveByEventId.size, 0);
});

test("getBasketballWsEventIfFresh: PER-EVENT staleness — a quiet event goes stale even while other events keep broadcasting", () => {
  basketballWs.liveByEventId.clear();
  basketballWs.lastSeenAt.clear();
  basketballWs.applyFrame({
    sport: "basketball",
    timestamp: Date.now(),
    count: 1,
    data: [
      { eventId: "bball-quiet", sport: "basketball", home: "A", away: "B" } as never,
      { eventId: "bball-busy", sport: "basketball", home: "C", away: "D" } as never,
    ],
  });
  basketballWs.lastSeenAt.set("bball-quiet", Date.now() - 10_000);
  assert.equal(getBasketballWsEventIfFresh("bball-quiet", 4_000), null);
  assert.notEqual(getBasketballWsEventIfFresh("bball-busy", 4_000), null);
});

test("mergeBasketballWsFreshness: overlays matchClock/score from a fresh WS event, keeps REST untouched otherwise", () => {
  basketballWs.liveByEventId.clear();
  basketballWs.lastSeenAt.clear();
  basketballWs.applyFrame({
    sport: "basketball",
    timestamp: Date.now(),
    count: 1,
    data: [
      {
        eventId: "bball-live",
        sport: "basketball",
        home: "A",
        away: "B",
        matchClock: { period: "Q3" },
        score: { home: "60", away: "58" },
      } as never,
    ],
  });
  const restEvents = [
    {
      eventId: "bball-live",
      sport: "basketball",
      home: "A",
      away: "B",
      markets: [],
      matchClock: { period: "Q2" },
      score: { home: "55", away: "50" },
    },
    {
      eventId: "bball-no-ws",
      sport: "basketball",
      home: "C",
      away: "D",
      markets: [],
      matchClock: { period: "Q1" },
      score: { home: "10", away: "8" },
    },
  ] as never[];
  const merged = mergeBasketballWsFreshness(restEvents as never);
  assert.equal(merged[0]!.score?.home, "60", "fresh WS reading should win over REST's own score");
  assert.equal(merged[1]!.score?.home, "10", "an event WS hasn't seen must be untouched");
});

test("mergeBasketballWsFreshness: a WS reading OLDER than REST's own must NOT regress the period/score", () => {
  basketballWs.liveByEventId.clear();
  basketballWs.lastSeenAt.clear();
  basketballWs.applyFrame({
    sport: "basketball",
    timestamp: Date.now(),
    count: 1,
    data: [
      {
        eventId: "bball-stale-ws",
        sport: "basketball",
        home: "A",
        away: "B",
        matchClock: { period: "Q2" },
        score: { home: "40", away: "35" },
      } as never,
    ],
  });
  const restEvents = [
    {
      eventId: "bball-stale-ws",
      sport: "basketball",
      home: "A",
      away: "B",
      markets: [],
      matchClock: { period: "Q3" },
      score: { home: "55", away: "50" },
    },
  ] as never[];
  const merged = mergeBasketballWsFreshness(restEvents as never);
  assert.equal(merged[0]!.matchClock?.period, "Q3", "period must not go backward");
  assert.equal(merged[0]!.score?.home, "55", "score must not regress either");
});

test("tennisWs applyFrame: keeps an event missing from a single subsequent frame (grace period)", () => {
  tennisWs.liveByEventId.clear();
  tennisWs.lastSeenAt.clear();
  tennisWs.applyFrame({
    sport: "tennis",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "tn-1", sport: "tennis", league: "ATP Tour" } as never],
  });
  assert.equal(tennisWs.liveByEventId.has("tn-1"), true);
});

test("tennisWs applyFrame: ignores frames/events tagged for a different sport", () => {
  tennisWs.liveByEventId.clear();
  tennisWs.lastSeenAt.clear();
  tennisWs.applyFrame({
    sport: "soccer",
    timestamp: Date.now(),
    count: 1,
    data: [{ eventId: "tn-2", sport: "soccer" } as never],
  });
  assert.equal(tennisWs.liveByEventId.size, 0);
});

test("getTennisWsEventIfFresh: PER-EVENT staleness — a quiet event goes stale even while other events keep broadcasting", () => {
  tennisWs.liveByEventId.clear();
  tennisWs.lastSeenAt.clear();
  tennisWs.applyFrame({
    sport: "tennis",
    timestamp: Date.now(),
    count: 1,
    data: [
      { eventId: "tn-quiet", sport: "tennis", home: "A", away: "B", league: "ATP Tour" } as never,
      { eventId: "tn-busy", sport: "tennis", home: "C", away: "D", league: "ATP Tour" } as never,
    ],
  });
  tennisWs.lastSeenAt.set("tn-quiet", Date.now() - 10_000);
  assert.equal(getTennisWsEventIfFresh("tn-quiet", 4_000), null);
  assert.notEqual(getTennisWsEventIfFresh("tn-busy", 4_000), null);
});

test("mergeTennisWsFreshness: overlays moreInfo.SS from a fresh WS event, keeps REST untouched otherwise", () => {
  tennisWs.liveByEventId.clear();
  tennisWs.lastSeenAt.clear();
  tennisWs.applyFrame({
    sport: "tennis",
    timestamp: Date.now(),
    count: 1,
    data: [
      {
        eventId: "tn-live",
        sport: "tennis",
        home: "A",
        away: "B",
        league: "ATP Tour",
        moreInfo: { SS: "6-4,3-2" },
      } as never,
    ],
  });
  const restEvents = [
    {
      eventId: "tn-live",
      sport: "tennis",
      home: "A",
      away: "B",
      markets: [],
      moreInfo: { SS: "6-4,2-2" },
    },
    {
      eventId: "tn-no-ws",
      sport: "tennis",
      home: "C",
      away: "D",
      markets: [],
      moreInfo: { SS: "1-0" },
    },
  ] as never[];
  const merged = mergeTennisWsFreshness(restEvents as never);
  assert.equal(merged[0]!.moreInfo?.["SS"], "6-4,3-2", "fresh WS reading should win over REST's own set score");
  assert.equal(merged[1]!.moreInfo?.["SS"], "1-0", "an event WS hasn't seen must be untouched");
});

test("mergeTennisWsFreshness: a WS reading OLDER than REST's own must NOT regress the set score", () => {
  tennisWs.liveByEventId.clear();
  tennisWs.lastSeenAt.clear();
  tennisWs.applyFrame({
    sport: "tennis",
    timestamp: Date.now(),
    count: 1,
    data: [
      {
        eventId: "tn-stale-ws",
        sport: "tennis",
        home: "A",
        away: "B",
        league: "ATP Tour",
        moreInfo: { SS: "6-4" },
      } as never,
    ],
  });
  const restEvents = [
    {
      eventId: "tn-stale-ws",
      sport: "tennis",
      home: "A",
      away: "B",
      markets: [],
      moreInfo: { SS: "6-4,6-2" },
    },
  ] as never[];
  const merged = mergeTennisWsFreshness(restEvents as never);
  assert.equal(merged[0]!.moreInfo?.["SS"], "6-4,6-2", "set score must not regress");
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

// Regression/diagnostic (2026-08-16): isFirstGoalscorerMarket/
// isLastGoalscorerMarket's bwin rawName check ("first goalscorer" /
// "last goalscorer") was never confirmed against a real bwin sample, unlike
// every other bwin check in this file. If bwin's real label differs (this
// test simulates that with a plausible near-miss name), the market must NOT
// be silently misattributed to the wrong field, must not throw, and the
// diagnostic logger (recordUnknownGoalscorerRawName) must not crash on it —
// it should just leave out.firstGoalscorer/lastGoalscorer/anytimeGoalscorer
// all unset, exactly reproducing the "Mercado de Jogador não aparece"
// symptom this test exists to pin down.
test("extractFootballOverride: an unconfirmed goalscorer-shaped rawName is safely ignored, not misattributed", () => {
  const nearMiss = {
    canonicalMarket: "OTHER",
    rawName: "First Team Goalscorer",
    period: "FULL_TIME",
    isActive: true,
    marketId: "test:near-miss-scorer",
    selections: [
      { canonicalOutcome: "OTHER", rawName: "Jan Kliment", odds: 3.1, isActive: true },
    ],
  };
  const override = extractFootballOverride(makeFootballEvent([nearMiss]));
  assert.equal(override.firstGoalscorer, undefined);
  assert.equal(override.lastGoalscorer, undefined);
  assert.equal(override.anytimeGoalscorer, undefined);
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

// Real side-by-side PulseScore/bwin vs API-Football live-feed comparison
// (2026-08-09) — bwin keeps a national club-type prefix API-Football's own
// name drops.
test("teamNamesMatch: club-token stripping covers non-Western club-type prefixes (CA/FK/SK/CS/UC/SS/GKS)", () => {
  assert.equal(teamNamesMatch("CA Atlanta", "Atlanta"), true);
  assert.equal(teamNamesMatch("FK Borac Banja Luka", "Borac Banja Luka"), true);
  assert.equal(teamNamesMatch("SK Sigma Olomouc", "Sigma Olomouc"), true);
  assert.equal(teamNamesMatch("CS Dock Sud", "Dock Sud"), true);
  assert.equal(teamNamesMatch("UC Sampdoria", "Sampdoria"), true);
  assert.equal(teamNamesMatch("SS Arezzo", "Arezzo"), true);
});

// Same real comparison — the OPPOSITE truncation direction from the
// nickname-suffix test above: API-Football drops a trailing city/qualifier
// word that bwin keeps, so the shorter name's tokens are a LEADING (not
// trailing) match of the longer one.
test("teamNamesMatch: leading-token fallback matches when API-Football drops a trailing city/qualifier word", () => {
  assert.equal(teamNamesMatch("FK Vojvodina Novi Sad", "Vojvodina"), true);
  assert.equal(teamNamesMatch("SK Artis Brno", "Artis"), true);
  assert.equal(teamNamesMatch("CA San Lorenzo de Almagro", "San Lorenzo"), true);
});

// The leading-token fallback's one real danger: a reserve/youth side shares
// its parent club's full name as a literal prefix. Must stay two distinct,
// separately bettable sides, never collapsed together.
test("teamNamesMatch: leading-token fallback does not conflate a club with its reserve/youth side", () => {
  assert.equal(teamNamesMatch("Real Madrid", "Real Madrid Castilla"), false);
  assert.equal(teamNamesMatch("Barcelona", "Barcelona B"), false);
  assert.equal(teamNamesMatch("Ajax", "Ajax U21"), false);
});

// Regression (audit, 2026-08-10): the TRAILING/nickname fallback
// (Panthers vs Florida Panthers, above) had no reserve-side guard at all,
// unlike its leading-token sibling just tested above. "Jong Ajax" reaches
// THIS branch, not the leading one — "Jong" is a leading word on the
// LONGER name, but the match happens on the shared trailing token
// ("ajax" = "ajax"), so the leading-only guard never saw it.
// teamNamesMatch("Ajax", "Jong Ajax") previously returned true.
test("teamNamesMatch: trailing/nickname fallback does not conflate a club with its reserve/youth side", () => {
  assert.equal(teamNamesMatch("Ajax", "Jong Ajax"), false);
  assert.equal(teamNamesMatch("Panthers", "Youth Panthers"), false);
  // Still matches real nickname-suffix cases with no reserve marker
  assert.equal(teamNamesMatch("Panthers", "Florida Panthers"), true);
});

// Regression (audit, 2026-08-10): the initial+surname fallback applied to
// a whole "/"-joined doubles pair only ever compared the FIRST player's
// initial against the LAST player's surname, silently ignoring the other
// half of the pair — two different pairs sharing one player's surname plus
// the other's initial were treated as identical.
test("teamNamesMatch: doubles pairs require BOTH players to match, not just the outer initial+surname", () => {
  assert.equal(
    teamNamesMatch("J. Anderson/M. Jones", "J. Smith/M. Jones"),
    false,
  );
  assert.equal(
    teamNamesMatch("J. Anderson/M. Jones", "J. Anderson/M. Jones"),
    true,
  );
  // Provider order isn't guaranteed — must match cross-paired too.
  assert.equal(
    teamNamesMatch("J. Anderson/M. Jones", "M. Jones/J. Anderson"),
    true,
  );
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
