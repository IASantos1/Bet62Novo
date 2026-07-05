import { MatchResult, Selection, Outcome } from "../types/settlement.types";

export function settleFootball(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;

  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const home = match.homeScore;
  const away = match.awayScore;

  if (selection.market === "match_winner") {
    if (selection.selection === "home") return home > away ? "won" : "lost";
    if (selection.selection === "away") return away > home ? "won" : "lost";
    if (selection.selection === "draw") return home === away ? "won" : "lost";
  }

  return "pending";
}
