// PulseScore market normalizer — still not wired into any route or live
// odds path (see providers/pulsescore/README.md). PulseScore already does
// the hard semantic normalization on its own side (canonicalMarket /
// canonicalOutcome are real generic betting-market vocabulary, not
// provider-internal ids), so this layer does something narrower:
//
//   1. Strips provider-only noise (rawName human labels, moreInfo betType
//      arrays) while keeping traceability (selectionId, the market's own
//      marketId) for whatever matching/reconciliation work comes later.
//   2. Adds convenience accessors ONLY for markets with no line ambiguity
//      — exactly one HOME/DRAW/AWAY, YES/NO, or EVEN/ODD selection per
//      period, so picking "the" value is unambiguous.
//
// Deliberately NOT done here: folding OVER_UNDER / ASIAN_HANDICAP /
// HOME_OVER_UNDER / AWAY_OVER_UNDER / CORRECT_SCORE into single values.
// PulseScore emits many lines per market (confirmed real: Over/Under at
// 5.5, 5.75, AND 6.25 on the same event) where BET62's existing internal
// football market shape (routes/matches.ts's AdvancedMarkets) only has
// fixed .5-increment slots — deciding which PulseScore line fills which
// slot, and what happens to the lines that don't fit any slot, is a real
// design decision for whoever wires this into a live route, not something
// to guess here. Those markets are exposed in full (every line, every
// selection) via `markets` so that decision can be made later with all
// the real data in hand.
import type { PulseScoreEvent } from "./types.js";

export type NormalizedSelection = {
  /** PulseScore's own canonicalOutcome, reused verbatim (HOME/DRAW/AWAY/
   * OVER/UNDER/YES/NO/EVEN/ODD/HOME_DRAW/DRAW_AWAY/HOME_AWAY/OTHER). */
  outcome: string;
  odds: number;
  line?: number;
  isActive: boolean;
  /** Traceability back to the exact PulseScore selection this came from. */
  selectionId: string;
};

export type NormalizedMarketGroup = {
  /** PulseScore's own canonicalMarket, reused verbatim. */
  market: string;
  period: string;
  selections: NormalizedSelection[];
  /** PulseScore's own marketId (opaque, provider-scoped) — kept only for
   * traceability/debugging, never parsed as anything meaningful. */
  providerMarketId: string;
};

export type NormalizedFootballEvent = {
  eventId: string;
  home: string;
  away: string;
  league: string;
  startTime: string;
  /** Every market PulseScore sent, unabridged — the source of truth for
   * anything not covered by a convenience accessor below. */
  markets: NormalizedMarketGroup[];
  matchResult?: { home: number; draw: number; away: number };
  matchResult1H?: { home: number; draw: number; away: number };
  matchResult2H?: { home: number; draw: number; away: number };
  doubleChance?: { homeOrDraw: number; homeOrAway: number; drawOrAway: number };
  bothTeamsToScore?: { yes: number; no: number };
  totalGoalsOddEven?: { even: number; odd: number };
};

function findMarket(ev: PulseScoreEvent, canonicalMarket: string, period: string) {
  return ev.markets.find((m) => m.canonicalMarket === canonicalMarket && m.period === period);
}

function findOutcomeOdds(
  selections: PulseScoreEvent["markets"][number]["selections"],
  outcome: string,
): number | undefined {
  return selections.find((s) => s.canonicalOutcome === outcome)?.odds;
}

function extractMatchResult(ev: PulseScoreEvent, period: string) {
  const m = findMarket(ev, "MATCH_RESULT", period);
  if (!m) return undefined;
  const home = findOutcomeOdds(m.selections, "HOME");
  const draw = findOutcomeOdds(m.selections, "DRAW");
  const away = findOutcomeOdds(m.selections, "AWAY");
  if (home == null || draw == null || away == null) return undefined;
  return { home, draw, away };
}

export function normalizePulseScoreEvent(ev: PulseScoreEvent): NormalizedFootballEvent {
  const markets: NormalizedMarketGroup[] = ev.markets.map((m) => ({
    market: m.canonicalMarket,
    period: m.period,
    providerMarketId: m.marketId,
    selections: m.selections.map((s) => ({
      outcome: s.canonicalOutcome,
      odds: s.odds,
      line: s.line,
      isActive: s.isActive,
      selectionId: s.selectionId,
    })),
  }));

  const doubleChanceMarket = findMarket(ev, "DOUBLE_CHANCE", "FULL_TIME");
  const doubleChance = doubleChanceMarket
    ? (() => {
        const homeOrDraw = findOutcomeOdds(doubleChanceMarket.selections, "HOME_DRAW");
        const homeOrAway = findOutcomeOdds(doubleChanceMarket.selections, "HOME_AWAY");
        const drawOrAway = findOutcomeOdds(doubleChanceMarket.selections, "DRAW_AWAY");
        if (homeOrDraw == null || homeOrAway == null || drawOrAway == null) return undefined;
        return { homeOrDraw, homeOrAway, drawOrAway };
      })()
    : undefined;

  const bttsMarket = findMarket(ev, "BOTH_TEAMS_TO_SCORE", "FULL_TIME");
  const bothTeamsToScore = bttsMarket
    ? (() => {
        const yes = findOutcomeOdds(bttsMarket.selections, "YES");
        const no = findOutcomeOdds(bttsMarket.selections, "NO");
        if (yes == null || no == null) return undefined;
        return { yes, no };
      })()
    : undefined;

  const oddEvenMarket = findMarket(ev, "TOTAL_GOALS_ODD_EVEN", "FULL_TIME");
  const totalGoalsOddEven = oddEvenMarket
    ? (() => {
        const even = findOutcomeOdds(oddEvenMarket.selections, "EVEN");
        const odd = findOutcomeOdds(oddEvenMarket.selections, "ODD");
        if (even == null || odd == null) return undefined;
        return { even, odd };
      })()
    : undefined;

  return {
    eventId: ev.eventId,
    home: ev.home,
    away: ev.away,
    league: ev.league,
    startTime: ev.startTime,
    markets,
    matchResult: extractMatchResult(ev, "FULL_TIME"),
    matchResult1H: extractMatchResult(ev, "FIRST_HALF"),
    matchResult2H: extractMatchResult(ev, "SECOND_HALF"),
    doubleChance,
    bothTeamsToScore,
    totalGoalsOddEven,
  };
}
