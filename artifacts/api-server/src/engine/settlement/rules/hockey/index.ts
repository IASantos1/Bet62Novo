import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function getExtras(match: MatchResult): Record<string, any> {
  return (match as any).extras ?? (match as any).periods ?? {};
}

export function settleHockeyMoneyline(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const home = match.homeScore;
  const away = match.awayScore;

  switch (selection.selection) {
    case "home": return home > away ? "won" : "lost";
    case "away": return away > home ? "won" : "lost";
    case "draw": return home === away ? "won" : "lost";
    default: return "void";
  }
}

export function settleHockeyPuckLine(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const home = match.homeScore;
  const away = match.awayScore;
  const sel = selection.selection.toLowerCase();

  // e.g. "home_-1.5" or "away_+1.5"
  const match_ = sel.match(/^(home|away)_([+-]?\d+\.?\d*)$/);
  if (!match_) {
    // legacy: "home" means home -1.5, "away" means away -1.5
    if (sel === "home") return (home - 1.5) > away ? "won" : "lost";
    if (sel === "away") return (away - 1.5) > home ? "won" : "lost";
    return "void";
  }

  const side = match_[1];
  const handicap = parseFloat(match_[2]);

  const adjustedHome = home + (side === "home" ? handicap : 0);
  const adjustedAway = away + (side === "away" ? handicap : 0);

  if (side === "home") return adjustedHome > away ? "won" : "lost";
  return adjustedAway > home ? "won" : "lost";
}

export function settleHockeyTotalGoals(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const total = match.homeScore + match.awayScore;
  const sel = selection.selection.toLowerCase();

  const match_ = sel.match(/^(over|under)_(\d+\.?\d*)$/);
  if (!match_) return "void";

  const direction = match_[1];
  const line = parseFloat(match_[2]);

  if (total === line) return "void";
  if (direction === "over") return total > line ? "won" : "lost";
  return total < line ? "won" : "lost";
}

export function settleHockeyPeriodWinner(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();

  // e.g. "home_p1", "away_p2", or "draw_p3"
  const match_ = sel.match(/^(home|away|draw)_p([123])$/);
  if (!match_) return "void";

  const side = match_[1];
  const periodNum = match_[2];

  const periodKey = `p${periodNum}`;
  const period = extras[periodKey] ?? extras[`period${periodNum}`];
  if (!period) return "pending";

  const pHome = period.home ?? period.homeScore;
  const pAway = period.away ?? period.awayScore;
  if (pHome == null || pAway == null) return "pending";

  if (side === "draw") return pHome === pAway ? "won" : "lost";
  if (pHome === pAway) return "lost";
  if (side === "home") return pHome > pAway ? "won" : "lost";
  return pAway > pHome ? "won" : "lost";
}
