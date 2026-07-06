import {
  MatchResult,
  Selection,
  Outcome,
} from "../../types/settlement.types";

export function settleFootballResult(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;

  if (match.status !== "finished") {
    return "pending";
  }

  if (match.homeScore == null || match.awayScore == null) {
    return "pending";
  }

  const home = match.homeScore;
  const away = match.awayScore;

  switch (selection.market) {
    case "match_winner":
      switch (selection.selection) {
        case "home":
          return home > away ? "won" : "lost";

        case "away":
          return away > home ? "won" : "lost";

        case "draw":
          return home === away ? "won" : "lost";

        default:
          return "pending";
      }

    default:
      return "pending";
  }
}
