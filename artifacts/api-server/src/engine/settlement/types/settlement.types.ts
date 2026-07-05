export type Outcome =
  | "won"
  | "lost"
  | "void"
  | "half_won"
  | "half_lost"
  | "pending";

export type MatchResult = {
  matchId: string;
  sport: "football" | "basketball" | "tennis" | "baseball" | "hockey";
  homeScore?: number;
  awayScore?: number;
  status: "live" | "finished" | "postponed";
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
  match: MatchResult;
  selection: Selection;
  ruleVersion: string;
};
