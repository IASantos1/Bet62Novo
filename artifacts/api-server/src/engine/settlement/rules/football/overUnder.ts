import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

export function settleOverUnder(input: {
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
  // Expected format: "over_2.5" or "under_1.5"
  const match2 = raw.match(/^(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (!match2) {
    return "void";
  }

  const side = match2[1] as "over" | "under";
  const line = parseFloat(match2[2]);

  const SUPPORTED_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  if (!SUPPORTED_LINES.includes(line)) {
    return "void";
  }

  const totalGoals = match.homeScore + match.awayScore;

  if (side === "over") {
    return totalGoals > line ? "won" : "lost";
  } else {
    return totalGoals < line ? "won" : "lost";
  }
}
