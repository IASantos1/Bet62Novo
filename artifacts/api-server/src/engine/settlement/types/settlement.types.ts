export type Outcome =
  | "won"
  | "lost"
  | "void"
  | "half_won"
  | "half_lost"
  | "pending";

/** Score for a single tennis set, optionally with tiebreak game scores */
export type TennisSetScore = {
  home: number;
  away: number;
  /** Tiebreak points (only present when set ended 7-6) */
  tiebreak?: { home: number; away: number };
};

export type MatchResultExtras = {
  // ── Football: Corners ──────────────────────────────────────────────────
  cornersTotal?: number;
  homeCorners?: number;
  awayCorners?: number;
  // ── Football: Cards ───────────────────────────────────────────────────
  cardsTotal?: number;
  homeCards?: number;
  awayCards?: number;
  // ── Football: Goal events — populated from the match events feed ───────
  firstGoal?: "home" | "away" | "no_goal" | string;
  lastGoal?: "home" | "away" | string;
  // ── Football: Half-time scores (alternative path for some providers) ───
  htHome?: number;
  htAway?: number;

  // ── Tennis: Per-set scores ─────────────────────────────────────────────
  set1?: TennisSetScore;
  set2?: TennisSetScore;
  set3?: TennisSetScore;
  set4?: TennisSetScore;
  set5?: TennisSetScore;
  // ── Tennis: Aggregated games across all sets ───────────────────────────
  /** Total games won by the home player / player 1 */
  homeGames?: number;
  /** Total games won by the away player / player 2 */
  awayGames?: number;
  // ── Tennis: Service breaks ─────────────────────────────────────────────
  homeBreaks?: number;
  awayBreaks?: number;
  totalBreaks?: number;
  /** Which side broke serve first in the match */
  firstBreak?: "home" | "away";
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
