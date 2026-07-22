import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function getCards(match: MatchResult) {
  const m = match as any;
  const extras = m.extras;
  return {
    total:  extras?.cardsTotal ?? m.cardsTotal ?? null,
    home:   extras?.homeCards  ?? m.homeCards  ?? null,
    away:   extras?.awayCards  ?? m.awayCards  ?? null,
  };
}

export function settleCards(input: {
  match: MatchResult;
  selection: Selection;
}): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const raw = selection.selection.toLowerCase().trim();
  const cards = getCards(match);

  // ── Home / Away O/U: "home_over_1.5" | "away_under_2.5" ─────────────────
  const teamOuMatch = raw.match(/^(home|away)_(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (teamOuMatch) {
    const side  = teamOuMatch[1] as "home" | "away";
    const dir   = teamOuMatch[2] as "over" | "under";
    const line  = parseFloat(teamOuMatch[3]);
    const count = side === "home" ? cards.home : cards.away;
    if (count == null) return "void";
    return dir === "over" ? (count > line ? "won" : "lost")
                          : (count < line ? "won" : "lost");
  }

  // ── Handicap: "home_handicap_-1.5" | "away_handicap_+1.5" ──────────────
  const handicapMatch = raw.match(/^(home|away)_handicap_([+-]?\d+(?:\.\d+)?)$/);
  if (handicapMatch) {
    if (cards.home == null || cards.away == null) return "void";
    const side    = handicapMatch[1] as "home" | "away";
    const line    = parseFloat(handicapMatch[2]);
    const adjHome = cards.home + line;
    if (side === "home") {
      if (adjHome > cards.away)  return "won";
      if (adjHome === cards.away) return "void";
      return "lost";
    } else {
      if (cards.away > adjHome)  return "won";
      if (cards.away === adjHome) return "void";
      return "lost";
    }
  }

  // ── Total O/U: "over_3.5" | "under_3.5" ─────────────────────────────────
  const ouMatch = raw.match(/^(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (ouMatch) {
    if (cards.total == null) return "void";
    const dir  = ouMatch[1] as "over" | "under";
    const line = parseFloat(ouMatch[2]);
    return dir === "over" ? (cards.total > line ? "won" : "lost")
                          : (cards.total < line ? "won" : "lost");
  }

  return "void";
}
