import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

/**
 * Intervalo/Final (HT/FT)
 * Selection format: "{ht_result}_{ft_result}" e.g. "home_home", "draw_away", "home_draw"
 * Valid values for each part: "home" | "draw" | "away"
 */
export function settleHtFt(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "void";

  const m = match as any;
  const htHome = m.htHomeScore ?? m.htHome ?? m.periods?.first?.home ?? m.extras?.htHome;
  const htAway = m.htAwayScore ?? m.htAway ?? m.periods?.first?.away ?? m.extras?.htAway;

  if (htHome == null || htAway == null) return "void";

  const htH = Number(htHome);
  const htA = Number(htAway);
  const ftH = match.homeScore;
  const ftA = match.awayScore;

  const htResult = htH > htA ? "home" : htA > htH ? "away" : "draw";
  const ftResult = ftH > ftA ? "home" : ftA > ftH ? "away" : "draw";

  const raw = selection.selection.toLowerCase().trim();
  // support both underscore and slash: "home_home" or "home/home"
  const parts = raw.split(/[_/]/);
  if (parts.length !== 2) return "void";

  const [expectedHt, expectedFt] = parts;
  if (!["home", "draw", "away"].includes(expectedHt) || !["home", "draw", "away"].includes(expectedFt)) {
    return "void";
  }

  return htResult === expectedHt && ftResult === expectedFt ? "won" : "lost";
}
