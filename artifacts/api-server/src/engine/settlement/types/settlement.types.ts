export type Outcome =
  | "won"
  | "lost"
  | "void"
  | "half_won"
  | "half_lost"
  | "pending";

export type MatchResultExtras = {
  /** Corners */
  cornersTotal?: number;
  homeCorners?: number;
  awayCorners?: number;
  /** Cards */
  cardsTotal?: number;
  homeCards?: number;
  awayCards?: number;
  /** Goal events — populated from the match events feed */
  firstGoal?: "home" | "away" | "no_goal" | string;
  lastGoal?: "home" | "away" | string;
  /** Half-time scores (alternative path for providers that put them in extras) */
  htHome?: number;
  htAway?: number;
};

export type MatchResult = {
  matchId: string;
  sport: "football" | "basketball" | "tennis" | "baseball" | "hockey" | "volleyball" | string;
  homeScore?: number;
  awayScore?: number;
  /** Half-time scores — set by settlement adapters when available */
  htHomeScore?: number;
  htAwayScore?: number;
  status: "live" | "finished" | "postponed" | "cancelled" | "abandoned" | string;
  periods?: any;
  extras?: MatchResultExtras;
};

export type Selection = {
  market: string;
  selection: string;
  odds: number;
  meta?: any;
};

export type SettlementInput = {
  betId: number;
  betMatchId?: string;
  match?: MatchResult | null;
  selection: Selection;
  ruleVersion: string;
};
