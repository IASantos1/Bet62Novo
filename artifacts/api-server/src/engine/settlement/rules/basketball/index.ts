import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function getExtras(match: MatchResult): Record<string, any> {
  return (match as any).extras ?? (match as any).periods ?? {};
}

export function settleBasketballMoneyline(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const home = match.homeScore;
  const away = match.awayScore;

  switch (selection.selection) {
    case "home": return home > away ? "won" : "lost";
    case "away": return away > home ? "won" : "lost";
    default: return "void";
  }
}

export function settleBasketballSpread(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const home = match.homeScore;
  const away = match.awayScore;
  const sel = selection.selection.toLowerCase();

  // e.g. "home_-5.5" or "away_+3.5"
  const match_ = sel.match(/^(home|away)_([+-]?\d+\.?\d*)$/);
  if (!match_) return "void";

  const side = match_[1];
  const handicap = parseFloat(match_[2]);

  const adjustedHome = home + (side === "home" ? handicap : 0);
  const adjustedAway = away + (side === "away" ? handicap : 0);

  if (side === "home") return adjustedHome > away ? "won" : "lost";
  return adjustedAway > home ? "won" : "lost";
}

export function settleBasketballTotalPoints(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const total = match.homeScore + match.awayScore;
  const sel = selection.selection.toLowerCase();

  // e.g. "over_210.5" or "under_210.5"
  const match_ = sel.match(/^(over|under)_(\d+\.?\d*)$/);
  if (!match_) return "void";

  const direction = match_[1];
  const line = parseFloat(match_[2]);

  if (total === line) return "void";
  if (direction === "over") return total > line ? "won" : "lost";
  return total < line ? "won" : "lost";
}

export function settleBasketballQuarterWinner(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();

  // e.g. "home_q1" or "away_q3"
  const match_ = sel.match(/^(home|away)_q([1-4])$/);
  if (!match_) return "void";

  const side = match_[1];
  const quarter = match_[2];

  const periodKey = `q${quarter}`;
  const period = extras[periodKey] ?? extras[`quarter${quarter}`] ?? extras[`period${quarter}`];
  if (!period) return "pending";

  const pHome = period.home ?? period.homeScore;
  const pAway = period.away ?? period.awayScore;
  if (pHome == null || pAway == null) return "pending";

  if (pHome === pAway) return "lost";
  if (side === "home") return pHome > pAway ? "won" : "lost";
  return pAway > pHome ? "won" : "lost";
}
