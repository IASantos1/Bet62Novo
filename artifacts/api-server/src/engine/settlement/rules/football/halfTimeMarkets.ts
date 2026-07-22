import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function getHtScores(match: MatchResult): { htHome: number; htAway: number } | null {
  const m = match as any;
  const htHome = m.htHomeScore ?? m.htHome ?? m.periods?.first?.home ?? m.extras?.htHome;
  const htAway = m.htAwayScore ?? m.htAway ?? m.periods?.first?.away ?? m.extras?.htAway;
  if (htHome == null || htAway == null) return null;
  return { htHome: Number(htHome), htAway: Number(htAway) };
}

/** Ambas Marcam 1º Tempo */
export function settleBttsFirstHalf(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const ht = getHtScores(match);
  if (!ht) return "void";

  const bothScored = ht.htHome >= 1 && ht.htAway >= 1;
  switch (selection.selection.toLowerCase().trim()) {
    case "yes": return bothScored ? "won" : "lost";
    case "no":  return bothScored ? "lost" : "won";
    default:    return "void";
  }
}

/** Resultado 1º Tempo */
export function settleHalfTimeResult(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const ht = getHtScores(match);
  if (!ht) return "void";

  const { htHome, htAway } = ht;
  switch (selection.selection.toLowerCase().trim()) {
    case "home": return htHome > htAway ? "won" : "lost";
    case "away": return htAway > htHome ? "won" : "lost";
    case "draw": return htHome === htAway ? "won" : "lost";
    default:     return "void";
  }
}

/** Resultado 2º Tempo (gols apenas do 2ºT) */
export function settleSecondHalfResult(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const ht = getHtScores(match);
  if (!ht) return "void";

  const sh_home = match.homeScore - ht.htHome;
  const sh_away = match.awayScore - ht.htAway;

  if (sh_home < 0 || sh_away < 0) return "void"; // data inconsistency

  switch (selection.selection.toLowerCase().trim()) {
    case "home": return sh_home > sh_away ? "won" : "lost";
    case "away": return sh_away > sh_home ? "won" : "lost";
    case "draw": return sh_home === sh_away ? "won" : "lost";
    default:     return "void";
  }
}

/** Vencer Ambos os Tempos */
export function settleWinBothHalves(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const ht = getHtScores(match);
  if (!ht) return "void";

  const sh_home = match.homeScore - ht.htHome;
  const sh_away = match.awayScore - ht.htAway;

  if (sh_home < 0 || sh_away < 0) return "void";

  const team = selection.selection.toLowerCase().trim();
  if (team === "home") {
    return (ht.htHome > ht.htAway && sh_home > sh_away) ? "won" : "lost";
  }
  if (team === "away") {
    return (ht.htAway > ht.htHome && sh_away > sh_home) ? "won" : "lost";
  }
  return "void";
}

/** Tempo com Mais Gols — first_half | second_half | tie */
export function settleHighestScoringHalf(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const ht = getHtScores(match);
  if (!ht) return "void";

  const goalsHt = ht.htHome + ht.htAway;
  const goals2h = (match.homeScore + match.awayScore) - goalsHt;

  switch (selection.selection.toLowerCase().trim()) {
    case "first_half":  return goalsHt > goals2h ? "won" : "lost";
    case "second_half": return goals2h > goalsHt ? "won" : "lost";
    case "tie":         return goalsHt === goals2h ? "won" : "lost";
    default:            return "void";
  }
}
