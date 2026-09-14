// sports.bzzoiro.com odds normalizer — turns a real "odds" WS frame
// (BzzoiroOddsFrame, confirmed real 2026-09-14 via a live capture on event
// 214594) into BET62's existing AdvancedMarkets shape, the same target
// buildPulseScoreMarkets (providers/pulsescore/shadowMatchSync.ts) already
// writes. Mirrors that function's own rule: a market bzzoiro doesn't carry
// this round is zeroed, never fabricated — home.tsx's existing truthy/>0
// guards already hide those rows.
//
// bzzoiro's real asian_handicap array (confirmed real, event 214594) is a
// single flat grid across every quarter-line bet365-style feeds would
// normally split into several markets — e.g. line 0 with push:"full" is
// literally draw-no-bet under a different name (a full push at 0 refunds
// the draw), and line -1/-0.5 are exactly BET62's existing 2-way
// `handicap` slots (homeMinusOne/homeMinusOneHalf). Reading those specific
// lines straight off the real captured grid, not guessed.
import { getBzzoiroEventOddsSummary, getBzzoiroOddsFeed } from "./client.js";
import type { LiveMatchState } from "../../routes/matches.js";
import type { BzzoiroOddsFrame, BzzoiroEventOddsSummary, BzzoiroOddsFeedRow } from "./types.js";

type Markets = LiveMatchState["markets"];

const OVER_UNDER_LINE_MAP: Array<{ key: string; over: keyof Markets["totalGoals"]; under: keyof Markets["totalGoals"] }> = [
  { key: "15", over: "over15", under: "under15" },
  { key: "25", over: "over25", under: "under25" },
  { key: "35", over: "over35", under: "under35" },
];

/** Real odds only — never fabricated. Every AdvancedMarkets slot bzzoiro's
 * "odds" frame doesn't carry this round stays zeroed, exactly like
 * buildPulseScoreMarkets. */
export function buildBzzoiroMarkets(frame: BzzoiroOddsFrame): { odds: { home: number; draw: number; away: number }; markets: Markets } {
  const mw = frame.odds.match_winner;
  const odds = mw ? { home: mw.home, draw: mw.draw, away: mw.away } : { home: 0, draw: 0, away: 0 };

  const totalGoals: Markets["totalGoals"] = {
    over05: 0, under05: 0, over15: 0, under15: 0, over25: 0, under25: 0,
    over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0,
    over65: 0, under65: 0,
  };
  const ou = frame.odds.over_under;
  if (ou) {
    for (const { key, over, under } of OVER_UNDER_LINE_MAP) {
      const overOdd = ou[`over_${key}`];
      const underOdd = ou[`under_${key}`];
      if (overOdd != null) totalGoals[over] = overOdd;
      if (underOdd != null) totalGoals[under] = underOdd;
    }
  }

  const bothTeamsScore: Markets["bothTeamsScore"] = frame.odds.btts
    ? { yes: frame.odds.btts.yes, no: frame.odds.btts.no }
    : { yes: 0, no: 0 };

  const ahLines = new Map<number, { home: number; away: number; push: string }>();
  for (const entry of frame.odds.asian_handicap ?? []) {
    ahLines.set(entry.line, { home: entry.home, away: entry.away, push: entry.push });
  }

  const zeroLine = ahLines.get(0);
  const drawNoBet: Markets["drawNoBet"] = zeroLine ? { home: zeroLine.home, away: zeroLine.away } : undefined;

  const minus1 = ahLines.get(-1);
  const minusHalf = ahLines.get(-0.5);
  const handicap: Markets["handicap"] = {
    homeMinusOne: minus1?.home ?? 0,
    awayPlusOne: minus1?.away ?? 0,
    homeMinusOneHalf: minusHalf?.home ?? 0,
    awayPlusOneHalf: minusHalf?.away ?? 0,
  };

  // Full-time Asian handicap headline line — same "smallest absolute line"
  // convention normalizePulseScoreEvent's asianHandicapFull already uses.
  const asianHandicap: Markets["asianHandicap"] = (() => {
    if (ahLines.size === 0) return undefined;
    const available = [...ahLines.entries()].map(([line, v]) => ({ line, home: v.home, away: v.away }));
    available.sort((a, b) => Math.abs(a.line) - Math.abs(b.line));
    return available[0];
  })();

  const markets: Markets = {
    doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore,
    totalGoals,
    handicap,
    halfTime: { home: 0, draw: 0, away: 0 },
    firstGoal: { home: 0, noGoal: 0, away: 0 },
    drawNoBet,
    asianHandicap,
  };

  return { odds, markets };
}

// Added 2026-09-14, after the user's own pasted bzzoiro docs and a real
// production probe confirmed GET /events/{id}/odds/ (the 11-key summary)
// and GET /api/v2/odds/?market=... (the only path to
// asian_handicap/double_chance/draw_no_bet/total_corners) both work for
// real events — prematch AND, per a real capture on a since-finished
// match (event 602518), the same shape after the match ends
// ("no further updates scheduled"). Unlike buildBzzoiroMarkets above (one
// already-received WS frame, synchronous), this is REST: fetch, then
// normalize. Split into a pure data→markets function plus a thin fetching
// wrapper so the pure part can be unit-tested against the exact real JSON
// this session captured, with no network or mocking needed.
//
// This account has Football Unlimited (confirmed real 2026-09-14: the
// market feed returns a full grid of real per-bookmaker rows — 1xBet,
// Bet365, Unibet, Pinnacle, Marathon, ... — not one "consensus" row per
// outcome). Averaging decimal_odds across every bookmaker row for the
// same outcome+line is BET62's chosen price — the consensus-equivalent a
// free-tier key would already return as a single row.
function averageDecimalOdds(rows: BzzoiroOddsFeedRow[]): number | undefined {
  if (rows.length === 0) return undefined;
  return rows.reduce((sum, r) => sum + r.decimal_odds, 0) / rows.length;
}

function groupByOutcomeAndLine(rows: BzzoiroOddsFeedRow[]): Map<string, BzzoiroOddsFeedRow[]> {
  const map = new Map<string, BzzoiroOddsFeedRow[]>();
  for (const row of rows) {
    const key = `${row.outcome}:${row.line ?? ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

/** Pure normalizer — real REST responses in, AdvancedMarkets out. Returns
 * null when bzzoiro hasn't priced this match yet (summary's match_winner
 * legs are null — real and expected for a fixture more than a day out on
 * a competition no bookmaker we read is covering, confirmed via a real
 * probe on event 10136), mirroring the WS live path's "all 3 legs must be
 * real" gate in ballMatchSync.ts. */
export function buildBzzoiroMarketsFromRestData(
  summary: BzzoiroEventOddsSummary,
  doubleChanceRows: BzzoiroOddsFeedRow[],
  drawNoBetRows: BzzoiroOddsFeedRow[],
  asianHandicapRows: BzzoiroOddsFeedRow[],
  cornersRows: BzzoiroOddsFeedRow[],
): { odds: { home: number; draw: number; away: number }; markets: Markets } | null {
  const { home_win, draw, away_win } = summary.odds;
  if (home_win == null || draw == null || away_win == null) return null;
  const odds = { home: home_win, draw, away: away_win };

  const totalGoals: Markets["totalGoals"] = {
    over05: 0, under05: 0, over15: 0, under15: 0, over25: 0, under25: 0,
    over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0,
    over65: 0, under65: 0,
  };
  const s = summary.odds;
  if (s.over_15_goals != null) totalGoals.over15 = s.over_15_goals;
  if (s.under_15_goals != null) totalGoals.under15 = s.under_15_goals;
  if (s.over_25_goals != null) totalGoals.over25 = s.over_25_goals;
  if (s.under_25_goals != null) totalGoals.under25 = s.under_25_goals;
  if (s.over_35_goals != null) totalGoals.over35 = s.over_35_goals;
  if (s.under_35_goals != null) totalGoals.under35 = s.under_35_goals;

  const bothTeamsScore: Markets["bothTeamsScore"] =
    s.btts_yes != null && s.btts_no != null ? { yes: s.btts_yes, no: s.btts_no } : { yes: 0, no: 0 };

  const dcByKey = groupByOutcomeAndLine(doubleChanceRows);
  const doubleChance: Markets["doubleChance"] = {
    homeOrDraw: averageDecimalOdds(dcByKey.get("1X:") ?? []) ?? 0,
    awayOrDraw: averageDecimalOdds(dcByKey.get("X2:") ?? []) ?? 0,
    homeOrAway: averageDecimalOdds(dcByKey.get("12:") ?? []) ?? 0,
  };

  const dnbByKey = groupByOutcomeAndLine(drawNoBetRows);
  const dnbHome = averageDecimalOdds(dnbByKey.get("HOME:") ?? []);
  const dnbAway = averageDecimalOdds(dnbByKey.get("AWAY:") ?? []);
  const drawNoBet: Markets["drawNoBet"] = dnbHome != null && dnbAway != null ? { home: dnbHome, away: dnbAway } : undefined;

  // Headline Asian handicap line — same "smallest absolute line" convention
  // buildBzzoiroMarkets (WS path, above) and normalizePulseScoreEvent's
  // asianHandicapFull already use.
  const ahByKey = groupByOutcomeAndLine(asianHandicapRows);
  const ahLines = [...new Set(asianHandicapRows.map((r) => r.line).filter((l): l is number => l != null))];
  let asianHandicap: Markets["asianHandicap"];
  if (ahLines.length > 0) {
    const headlineLine = ahLines.sort((a, b) => Math.abs(a) - Math.abs(b))[0];
    const home = averageDecimalOdds(ahByKey.get(`HOME:${headlineLine}`) ?? []);
    const away = averageDecimalOdds(ahByKey.get(`AWAY:${headlineLine}`) ?? []);
    if (home != null && away != null) asianHandicap = { line: headlineLine, home, away };
  }

  // AdvancedMarkets.corners only has fixed 8.5/9.5/10.5 slots — bzzoiro's
  // real feed also quotes 7.5 and 11.5 (confirmed real, event 602518) but
  // there's nowhere in BET62's shape to put them yet.
  const cByKey = groupByOutcomeAndLine(cornersRows);
  const o85 = averageDecimalOdds(cByKey.get("over:8.5") ?? []);
  const u85 = averageDecimalOdds(cByKey.get("under:8.5") ?? []);
  const o95 = averageDecimalOdds(cByKey.get("over:9.5") ?? []);
  const u95 = averageDecimalOdds(cByKey.get("under:9.5") ?? []);
  const o105 = averageDecimalOdds(cByKey.get("over:10.5") ?? []);
  const u105 = averageDecimalOdds(cByKey.get("under:10.5") ?? []);
  const corners: Markets["corners"] =
    o85 != null && u85 != null && o95 != null && u95 != null && o105 != null && u105 != null
      ? { o85, u85, o95, u95, o105, u105 }
      : undefined;

  const markets: Markets = {
    doubleChance,
    bothTeamsScore,
    totalGoals,
    // Not sourced from bzzoiro's REST feed — asianHandicap above is the
    // real headline line; these fixed 2-way slots stay zeroed rather than
    // guessing which of the many real quarter-lines maps onto them.
    handicap: { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
    halfTime: { home: 0, draw: 0, away: 0 },
    firstGoal: { home: 0, noGoal: 0, away: 0 },
    drawNoBet,
    asianHandicap,
    corners,
  };

  return { odds, markets };
}

/** Fetches every REST endpoint buildBzzoiroMarketsFromRestData needs for
 * one event and normalizes them in one call. */
export async function fetchBzzoiroMarketsFromRest(
  eventId: number,
): Promise<{ odds: { home: number; draw: number; away: number }; markets: Markets } | null> {
  const [summary, doubleChanceRows, drawNoBetRows, asianHandicapRows, cornersRows] = await Promise.all([
    getBzzoiroEventOddsSummary(eventId),
    getBzzoiroOddsFeed(eventId, "double_chance"),
    getBzzoiroOddsFeed(eventId, "draw_no_bet"),
    getBzzoiroOddsFeed(eventId, "asian_handicap"),
    getBzzoiroOddsFeed(eventId, "total_corners"),
  ]);
  return buildBzzoiroMarketsFromRestData(summary, doubleChanceRows, drawNoBetRows, asianHandicapRows, cornersRows);
}
