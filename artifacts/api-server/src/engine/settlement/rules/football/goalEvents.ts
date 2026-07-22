import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function getFirstGoal(match: MatchResult): string | null {
  const m = match as any;
  return m.extras?.firstGoal ?? m.firstGoal ?? null;
}

function getLastGoal(match: MatchResult): string | null {
  const m = match as any;
  return m.extras?.lastGoal ?? m.lastGoal ?? null;
}

/**
 * Primeiro Gol — qual time marcou primeiro
 * Selection: "home" | "away" | "no_goal"
 */
export function settleFirstGoal(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const firstGoal = getFirstGoal(match);
  if (firstGoal == null) {
    // If FT scores are 0-0, no goal was scored
    if (match.homeScore === 0 && match.awayScore === 0) {
      return selection.selection.toLowerCase().trim() === "no_goal" ? "won" : "lost";
    }
    return "void"; // data missing
  }

  const raw = selection.selection.toLowerCase().trim();
  const normalized = firstGoal.toLowerCase().trim();

  if (raw === normalized) return "won";
  return "lost";
}

/**
 * Último Gol — qual time marcou por último
 * Selection: "home" | "away"
 * If the match ended 0-0 → void (no goal to be last)
 */
export function settleLastGoal(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  if (match.homeScore === 0 && match.awayScore === 0) return "void";

  const lastGoal = getLastGoal(match);
  if (lastGoal == null) return "void"; // data missing

  const raw = selection.selection.toLowerCase().trim();
  const normalized = lastGoal.toLowerCase().trim();

  if (raw === normalized) return "won";
  return "lost";
}

/**
 * Placar Exato
 * Selection format: "2-1" | "0-0" | "3-2" (home-away)
 */
export function settleCorrectScore(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const raw = selection.selection.toLowerCase().trim();
  // Support "2-1", "2:1", "2_1"
  const parts = raw.split(/[-:_]/);
  if (parts.length !== 2) return "void";

  const expectedHome = parseInt(parts[0], 10);
  const expectedAway = parseInt(parts[1], 10);

  if (!Number.isFinite(expectedHome) || !Number.isFinite(expectedAway)) return "void";

  return match.homeScore === expectedHome && match.awayScore === expectedAway
    ? "won"
    : "lost";
}
