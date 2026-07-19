import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function resolveHalfLine(homeScore: number, awayScore: number, side: "home" | "away", line: number): "won" | "lost" | "void" {
  // line is applied to home score
  const adjustedHome = homeScore + line;

  if (side === "home") {
    if (adjustedHome > awayScore) return "won";
    if (adjustedHome === awayScore) return "void";
    return "lost";
  } else {
    // away
    if (awayScore > adjustedHome) return "won";
    if (awayScore === adjustedHome) return "void";
    return "lost";
  }
}

export function settleAsianHandicap(input: {
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
  // Expected format: "home_-0.5", "away_+1.5", "home_-0.75"
  const m = raw.match(/^(home|away)_([+-]?\d+(?:\.\d+)?)$/);
  if (!m) {
    return "void";
  }

  const side = m[1] as "home" | "away";
  const line = parseFloat(m[2]);

  const home = match.homeScore;
  const away = match.awayScore;

  // Quarter lines: ±0.25, ±0.75 — split bet into two half lines
  const decimal = Math.abs(line) % 1;
  const isQuarterLine = decimal === 0.25 || decimal === 0.75;

  if (isQuarterLine) {
    let lineA: number;
    let lineB: number;

    if (decimal === 0.25) {
      // ±0.25 splits into 0 and ±0.5
      lineA = line < 0 ? Math.ceil(line) : Math.floor(line);        // e.g. -0.25 -> 0
      lineB = line < 0 ? lineA - 0.5 : lineA + 0.5;                 // e.g. -0.25 -> -0.5
    } else {
      // ±0.75 splits into ±0.5 and ±1.0
      lineA = line < 0 ? Math.ceil(line) - 0.5 : Math.floor(line) + 0.5; // e.g. -0.75 -> -0.5
      lineB = line < 0 ? Math.ceil(line) - 1 : Math.floor(line) + 1;     // e.g. -0.75 -> -1.0
    }

    const resultA = resolveHalfLine(home, away, side, lineA);
    const resultB = resolveHalfLine(home, away, side, lineB);

    if (resultA === "won" && resultB === "won") return "won";
    if (resultA === "lost" && resultB === "lost") return "lost";
    if (resultA === "void" && resultB === "void") return "void";

    // Half win: one won, one void OR one won, one lost
    if ((resultA === "won" && resultB === "void") || (resultA === "void" && resultB === "won")) {
      return "half_won";
    }
    if ((resultA === "lost" && resultB === "void") || (resultA === "void" && resultB === "lost")) {
      return "half_lost";
    }
    if ((resultA === "won" && resultB === "lost") || (resultA === "lost" && resultB === "won")) {
      return "half_won";
    }

    return "void";
  }

  // Full or half lines (0, ±0.5, ±1.0, ±1.5, etc.)
  return resolveHalfLine(home, away, side, line);
}
