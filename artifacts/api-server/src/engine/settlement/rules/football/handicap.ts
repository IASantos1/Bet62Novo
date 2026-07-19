import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

export function settleHandicap(input: {
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
  // Expected format: "home_-1", "away_+1", "draw_0"
  const m = raw.match(/^(home|away|draw)_([+-]?\d+)$/);
  if (!m) {
    return "void";
  }

  const side = m[1] as "home" | "away" | "draw";
  const handicap = parseInt(m[2], 10);

  const adjustedHome = match.homeScore + handicap;
  const away = match.awayScore;

  if (side === "home") {
    return adjustedHome > away ? "won" : adjustedHome === away ? "lost" : "lost";
  } else if (side === "away") {
    return away > adjustedHome ? "won" : "lost";
  } else {
    // draw
    return adjustedHome === away ? "won" : "lost";
  }
}
