import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

// Parse "over_2.5", "under_1.5", "o25", "u25", "over 2.5", etc.
function parseOverUnderSelection(raw: string): { side: "over" | "under"; line: number } | null {
  // Compact format: "o25", "u15", "o25", "u250"
  const compact = raw.match(/^([ou])([\d]+(?:[\d.]+)?)$/);
  if (compact) {
    const side = compact[1] === "o" ? "over" : "under";
    // Insert decimal: "25" → 2.5, "15" → 1.5, "250" → 2.50 (unusual but safe)
    const digits = compact[2]!;
    const line = digits.length >= 2 && !digits.includes(".")
      ? parseFloat(digits.slice(0, -1) + "." + digits.slice(-1))
      : parseFloat(digits);
    return Number.isFinite(line) ? { side, line } : null;
  }
  // Verbose format: "over_2.5", "under 1.5", "over2.5"
  const verbose = raw.match(/^(over|under)[_\s]?(\d+(?:\.\d+)?)$/);
  if (verbose) {
    const side = verbose[1] as "over" | "under";
    const line = parseFloat(verbose[2]!);
    return Number.isFinite(line) ? { side, line } : null;
  }
  return null;
}

export function settleOverUnder(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;

  if (match.homeScore == null || match.awayScore == null) {
    return match.status === "finished" ? "void" : "pending";
  }

  const raw = selection.selection.toLowerCase().trim();
  const parsed = parseOverUnderSelection(raw);
  if (!parsed) {
    return "void";
  }

  const { side, line } = parsed;

  const SUPPORTED_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  if (!SUPPORTED_LINES.includes(line)) {
    return "void";
  }

  const totalGoals = match.homeScore + match.awayScore;

  if (match.status === "live") {
    // In-play early settlement:
    // Over: won immediately once the threshold is crossed (irreversible)
    // Under: lost immediately once exceeded (irreversible); won only at full-time
    if (side === "over") {
      return totalGoals > line ? "won" : "pending";
    } else {
      return totalGoals > line ? "lost" : "pending";
    }
  }

  if (match.status !== "finished") {
    return "pending";
  }

  if (side === "over") {
    return totalGoals > line ? "won" : "lost";
  } else {
    return totalGoals < line ? "won" : "lost";
  }
}
