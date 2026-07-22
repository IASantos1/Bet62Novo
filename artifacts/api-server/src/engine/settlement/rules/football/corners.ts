import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function getCorners(match: MatchResult) {
  const m = match as any;
  const extras = m.extras;
  return {
    total:  extras?.cornersTotal ?? m.cornersTotal ?? null,
    home:   extras?.homeCorners  ?? m.homeCorners  ?? null,
    away:   extras?.awayCorners  ?? m.awayCorners  ?? null,
  };
}

export function settleCorners(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const raw = selection.selection.toLowerCase().trim();
  const corners = getCorners(match);

  // ── Home / Away O/U: "home_over_3.5" | "away_under_2.5" ─────────────────
  const teamOuMatch = raw.match(/^(home|away)_(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (teamOuMatch) {
    const side   = teamOuMatch[1] as "home" | "away";
    const dir    = teamOuMatch[2] as "over" | "under";
    const line   = parseFloat(teamOuMatch[3]);
    const count  = side === "home" ? corners.home : corners.away;
    if (count == null) return "void";
    return dir === "over" ? (count > line ? "won" : "lost")
                          : (count < line ? "won" : "lost");
  }

  // ── Handicap: "home_handicap_-1.5" | "away_handicap_+1.5" ──────────────
  const handicapMatch = raw.match(/^(home|away)_handicap_([+-]?\d+(?:\.\d+)?)$/);
  if (handicapMatch) {
    if (corners.home == null || corners.away == null) return "void";
    const side  = handicapMatch[1] as "home" | "away";
    const line  = parseFloat(handicapMatch[2]);
    const adjHome = corners.home + line;
    if (side === "home") {
      if (adjHome > corners.away)  return "won";
      if (adjHome === corners.away) return "void";
      return "lost";
    } else {
      if (corners.away > adjHome)  return "won";
      if (corners.away === adjHome) return "void";
      return "lost";
    }
  }

  // ── Total O/U: "over_9.5" | "under_9.5" ─────────────────────────────────
  const ouMatch = raw.match(/^(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (ouMatch) {
    if (corners.total == null) return "void";
    const dir  = ouMatch[1] as "over" | "under";
    const line = parseFloat(ouMatch[2]);
    return dir === "over" ? (corners.total > line ? "won" : "lost")
                          : (corners.total < line ? "won" : "lost");
  }

  return "void";
}
