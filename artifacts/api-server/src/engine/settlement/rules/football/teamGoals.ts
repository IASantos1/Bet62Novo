import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function parseOuSelection(raw: string): { side: "over" | "under"; line: number } | null {
  const m = raw.match(/^(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { side: m[1] as "over" | "under", line: parseFloat(m[2]) };
}

/** Gols Casa — over/under para o time da casa */
export function settleHomeGoals(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null) return "void";

  const parsed = parseOuSelection(selection.selection.toLowerCase().trim());
  if (!parsed) return "void";

  const goals = match.homeScore;
  return parsed.side === "over" ? (goals > parsed.line ? "won" : "lost")
                                : (goals < parsed.line ? "won" : "lost");
}

/** Gols Visitante — over/under para o time visitante */
export function settleAwayGoals(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.awayScore == null) return "void";

  const parsed = parseOuSelection(selection.selection.toLowerCase().trim());
  if (!parsed) return "void";

  const goals = match.awayScore;
  return parsed.side === "over" ? (goals > parsed.line ? "won" : "lost")
                                : (goals < parsed.line ? "won" : "lost");
}

/**
 * Vitória a Zero — time vence E não sofre gols
 * Selection: "home" | "away"
 */
export function settleWinToNil(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const home = match.homeScore;
  const away = match.awayScore;

  switch (selection.selection.toLowerCase().trim()) {
    case "home": return (home > away && away === 0) ? "won" : "lost";
    case "away": return (away > home && home === 0) ? "won" : "lost";
    default:     return "void";
  }
}

/**
 * Folha Limpa — time não sofre gols
 * Selection: "home_yes" | "home_no" | "away_yes" | "away_no"
 * (also accepts plain "home" / "away" as "yes")
 */
export function settleCleanSheet(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const raw = selection.selection.toLowerCase().trim();

  // "home" → home clean sheet yes; "away" → away clean sheet yes
  if (raw === "home")      return match.awayScore === 0 ? "won" : "lost";
  if (raw === "away")      return match.homeScore === 0 ? "won" : "lost";
  if (raw === "home_yes")  return match.awayScore === 0 ? "won" : "lost";
  if (raw === "home_no")   return match.awayScore > 0   ? "won" : "lost";
  if (raw === "away_yes")  return match.homeScore === 0 ? "won" : "lost";
  if (raw === "away_no")   return match.homeScore > 0   ? "won" : "lost";

  return "void";
}
