import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

/** Gols Exatos — selection: "0" | "1" | "2" | "3" | "4" | "5+" */
export function settleExactGoals(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const total = match.homeScore + match.awayScore;
  const raw = selection.selection.toLowerCase().trim();

  if (raw === "5+") return total >= 5 ? "won" : "lost";

  const exact = parseInt(raw, 10);
  if (!Number.isFinite(exact) || exact < 0) return "void";

  return total === exact ? "won" : "lost";
}

/** Ímpar/Par — selection: "odd" | "even" */
export function settleOddEvenGoals(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const total = match.homeScore + match.awayScore;
  switch (selection.selection.toLowerCase().trim()) {
    case "odd":  return total % 2 !== 0 ? "won" : "lost";
    case "even": return total % 2 === 0 ? "won" : "lost";
    default:     return "void";
  }
}

/**
 * Total Asiático — quarter-line over/under on total goals
 * Selection: "over_2.25" | "under_2.75" etc.
 * Uses the same half-win/half-lose split logic as Asian Handicap.
 */
export function settleAsianTotals(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const raw = selection.selection.toLowerCase().trim();
  const m = raw.match(/^(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (!m) return "void";

  const side  = m[1] as "over" | "under";
  const line  = parseFloat(m[2]);
  const total = match.homeScore + match.awayScore;

  function resolveHalf(l: number): "won" | "lost" | "void" {
    if (side === "over")  return total > l ? "won" : total === l ? "void" : "lost";
    /* under */           return total < l ? "won" : total === l ? "void" : "lost";
  }

  const decimal = Math.abs(line) % 1;
  const isQuarter = decimal === 0.25 || decimal === 0.75;

  if (!isQuarter) return resolveHalf(line);

  // Quarter lines split into two half-lines
  let lineA: number, lineB: number;
  if (decimal === 0.25) {
    lineA = Math.floor(line);        // e.g. 2.25 → 2
    lineB = lineA + 0.5;             // e.g. 2.25 → 2.5
  } else {
    lineA = Math.floor(line) + 0.5;  // e.g. 2.75 → 2.5
    lineB = Math.floor(line) + 1;    // e.g. 2.75 → 3
  }

  const rA = resolveHalf(lineA);
  const rB = resolveHalf(lineB);

  if (rA === "won"  && rB === "won")  return "won";
  if (rA === "lost" && rB === "lost") return "lost";
  if (rA === "void" && rB === "void") return "void";

  if ((rA === "won" && rB === "void") || (rA === "void" && rB === "won"))   return "half_won";
  if ((rA === "lost" && rB === "void") || (rA === "void" && rB === "lost")) return "half_lost";
  if ((rA === "won" && rB === "lost") || (rA === "lost" && rB === "won"))   return "half_won";

  return "void";
}
