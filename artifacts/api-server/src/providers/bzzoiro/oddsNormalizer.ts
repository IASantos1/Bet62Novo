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
import type { LiveMatchState } from "../../routes/matches.js";
import type { BzzoiroOddsFrame } from "./types.js";

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
