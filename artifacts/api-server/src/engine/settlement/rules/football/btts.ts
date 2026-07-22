import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

export function settleBtts(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;

  if (match.homeScore == null || match.awayScore == null) {
    return match.status === "finished" ? "void" : "pending";
  }

  const raw = selection.selection.toLowerCase().trim();
  // Accept "yes"/"no" and the compact "bts-yes"/"bts-no" keys
  const normalizedRaw = raw === "bts-yes" ? "yes" : raw === "bts-no" ? "no" : raw;
  if (normalizedRaw !== "yes" && normalizedRaw !== "no") {
    return "void";
  }

  const bothScored = match.homeScore >= 1 && match.awayScore >= 1;

  if (match.status === "live") {
    // In-play early settlement:
    // "yes" → won immediately once both teams have scored (irreversible)
    // "no"  → lost immediately once both teams have scored (irreversible)
    // Otherwise stay pending — we can only confirm "no" at full-time
    if (bothScored) {
      return normalizedRaw === "yes" ? "won" : "lost";
    }
    return "pending";
  }

  if (match.status !== "finished") {
    return "pending";
  }

  if (normalizedRaw === "yes") {
    return bothScored ? "won" : "lost";
  } else {
    return bothScored ? "lost" : "won";
  }
}
