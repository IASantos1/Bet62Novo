export type Outcome =
  | "won"
  | "lost"
  | "void"
  | "half_won"
  | "half_lost"
  | "pending";

export type MatchResult = {
  matchId: string;
  sport: "football" | "basketball" | "tennis" | "baseball" | "hockey" | "volleyball" | string;
  homeScore?: number;
  awayScore?: number;
  status: "live" | "finished" | "postponed" | "cancelled" | "abandoned" | string;
  periods?: any;
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
