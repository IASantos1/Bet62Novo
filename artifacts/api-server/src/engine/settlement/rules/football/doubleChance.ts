import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

/** Dupla Chance — home_draw | away_draw | home_away */
export function settleDoubleChance(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const home = match.homeScore;
  const away = match.awayScore;
  const homeWin = home > away;
  const awayWin = away > home;
  const draw = home === away;

  switch (selection.selection.toLowerCase().trim()) {
    case "home_draw":   return homeWin || draw ? "won" : "lost";
    case "away_draw":   return awayWin || draw ? "won" : "lost";
    case "home_away":   return homeWin || awayWin ? "won" : "lost";
    default:            return "void";
  }
}

/** Draw No Bet — stake refunded on draw (void), otherwise win/lose on team */
export function settleDrawNoBet(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const home = match.homeScore;
  const away = match.awayScore;

  if (home === away) return "void"; // draw → refund

  switch (selection.selection.toLowerCase().trim()) {
    case "home": return home > away ? "won" : "lost";
    case "away": return away > home ? "won" : "lost";
    default:     return "void";
  }
}
