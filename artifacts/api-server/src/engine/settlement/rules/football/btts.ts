import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

export function settleBtts(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;

  if (match.status !== "finished") {
    return "pending";
  }

  if (match.homeScore == null || match.awayScore == null) {
    return "void";
  }

  const raw = selection.selection.toLowerCase().trim();
  if (raw !== "yes" && raw !== "no") {
    return "void";
  }

  const bothScored = match.homeScore >= 1 && match.awayScore >= 1;

  if (raw === "yes") {
    return bothScored ? "won" : "lost";
  } else {
    return bothScored ? "lost" : "won";
  }
}
