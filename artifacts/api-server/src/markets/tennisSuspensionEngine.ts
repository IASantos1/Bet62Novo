// Tennis market suspension — Fase 6 of the tennis architecture rework
// (2026-09-19). Same prune-then-trigger shape as suspensionEngine.ts
// (football), fed by incidentEngine.ts's poll-to-poll incident detection
// instead of goal/red-card events. No suspension existed for tennis before
// this — confirmed via a full-repo grep (zero `isTennis` hits near
// suspension logic) — so live tennis markets were bettable through every
// break/set/match point with no pause at all.
import type { TennisIncident } from "../services/apitennis/incidentEngine.js";

// routes/bets.ts's actual bet-acceptance gate checks liveSt.marketSuspension
// keyed by the bet's own `sel.market` field — which is the BROAD tab-group
// name each MarketOddsBtn was given (bet62/home.tsx's toggleBet(match, sel,
// odd, market, label) call), NOT the finer-grained `suspKey` prop that only
// controls the button's greyed-out display. Every tennis market's `market`
// prop resolves to one of these six groups — real bug avoided here: an
// earlier draft of this list used only the granular suspKey names (e.g.
// "gameHandicap", "homeAces"), which the frontend UI does read for display,
// but none of which ever equal a real sel.market value, so the actual
// server-side block would have been a silent no-op despite the button
// showing locked.
const TENNIS_SUSP_KEYS = [
  "result",
  "handicap",
  "jogos",
  "sets",
  "especiais",
  "perset",
  // Also include every granular suspKey the frontend checks, so a viewer
  // sees the same locked state on every button, not just ones under the
  // six groups above (harmless — this is a flat Record<string, number>).
  "setHandicap",
  "gameHandicap",
  "gameHandicapSet2",
  "homePlayerGamesSet2",
  "awayPlayerGamesSet2",
  "set1Games",
  "set2Games",
  "totalGames",
  "totalSets",
  "totalTieBreaks",
  "tieBreak",
  "tieBreak1st",
  "firstSet",
  "set2",
  "set3",
  "sets",
  "setMatch",
  "highestSetTotal",
  "homeAces",
  "awayAces",
  "straightSets",
  "finalSetTieBreakOrExtra",
  "goTheDistance",
  "setsScoring",
  "winAtLeast",
  "oddEven",
] as const;

/** Flat delays, not tiered by market like football's footballSuspensionDelayMs
 * — tennis doesn't have football's goal-vs-var risk split, and every one of
 * these markets swings hard on a break/set/match point alike (unlike
 * football where a corner-count market barely reacts to a goal). Ordered by
 * how disruptive the incident is: a match point pause outlasts a plain set
 * finishing, which outlasts a break point in an ordinary game. */
const TENNIS_SUSPENSION_DELAY_MS: Partial<Record<TennisIncident["type"], number>> = {
  BREAK_POINT: 12_000,
  SET_POINT: 15_000,
  MATCH_POINT: 20_000,
  SET_WON: 15_000,
};

const REASON_BY_TYPE: Partial<Record<TennisIncident["type"], string>> = {
  BREAK_POINT: "BREAK POINT!",
  SET_POINT: "SET POINT!",
  MATCH_POINT: "MATCH POINT!",
  SET_WON: "FIM DE SET!",
};

// Most disruptive first — when a tick produces more than one triggering
// incident (e.g. a set-closing game that was also a break point), the more
// severe one decides the pause length and banner text.
const PRIORITY: TennisIncident["type"][] = ["MATCH_POINT", "SET_POINT", "SET_WON", "BREAK_POINT"];

export type TennisSuspensionInput = {
  now: number;
  existingSuspension?: Record<string, number>;
  existingReason?: string;
  incidents: TennisIncident[];
};

export type TennisSuspensionResult = {
  marketSuspension?: Record<string, number>;
  suspensionReason?: string;
};

export function computeTennisMarketSuspension(
  input: TennisSuspensionInput,
): TennisSuspensionResult {
  let marketSuspension: Record<string, number> | undefined = input.existingSuspension
    ? { ...input.existingSuspension }
    : undefined;
  if (marketSuspension) {
    const active = Object.fromEntries(
      Object.entries(marketSuspension).filter(([, ts]) => ts > input.now),
    );
    marketSuspension = Object.keys(active).length > 0 ? active : undefined;
  }
  let suspensionReason = marketSuspension ? input.existingReason : undefined;

  const triggering = PRIORITY
    .map((type) => input.incidents.find((i) => i.type === type))
    .find((i): i is TennisIncident => !!i);

  if (triggering) {
    const delay = TENNIS_SUSPENSION_DELAY_MS[triggering.type] ?? 12_000;
    marketSuspension = Object.fromEntries(TENNIS_SUSP_KEYS.map((k) => [k, input.now + delay]));
    suspensionReason = REASON_BY_TYPE[triggering.type] ?? "SUSPENSO";
  }

  return { marketSuspension, suspensionReason };
}
