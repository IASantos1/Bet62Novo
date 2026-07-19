import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function getExtras(match: MatchResult): Record<string, any> {
  return (match as any).extras ?? (match as any).periods ?? {};
}

export function settleTennisMatchWinner(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  // homeScore/awayScore represent sets won
  const homeSets = match.homeScore;
  const awaySets = match.awayScore;

  switch (selection.selection) {
    case "home": return homeSets > awaySets ? "won" : "lost";
    case "away": return awaySets > homeSets ? "won" : "lost";
    default: return "void";
  }
}

export function settleTennisSetWinner(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();

  // e.g. "home_set1", "away_set2"
  const match_ = sel.match(/^(home|away)_set([1-5])$/);
  if (!match_) return "void";

  const side = match_[1];
  const setNum = match_[2];

  const setKey = `set${setNum}`;
  const setData = extras[setKey] ?? extras[`s${setNum}`];
  if (!setData) return "pending";

  const sHome = setData.home ?? setData.homeScore ?? setData.player1;
  const sAway = setData.away ?? setData.awayScore ?? setData.player2;
  if (sHome == null || sAway == null) return "pending";

  if (sHome === sAway) return "lost";
  if (side === "home") return sHome > sAway ? "won" : "lost";
  return sAway > sHome ? "won" : "lost";
}

export function settleTennisTotalSets(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const totalSets = match.homeScore + match.awayScore;
  const sel = selection.selection.toLowerCase();

  const match_ = sel.match(/^(over|under)_(\d+\.?\d*)$/);
  if (!match_) return "void";

  const direction = match_[1];
  const line = parseFloat(match_[2]);

  if (totalSets === line) return "void";
  if (direction === "over") return totalSets > line ? "won" : "lost";
  return totalSets < line ? "won" : "lost";
}

export function settleTennisGameHandicap(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const homeGames = extras.homeGames ?? extras.player1Games;
  const awayGames = extras.awayGames ?? extras.player2Games;
  if (homeGames == null || awayGames == null) return "pending";

  const sel = selection.selection.toLowerCase();
  const match_ = sel.match(/^(home|away)_([+-]?\d+\.?\d*)$/);
  if (!match_) return "void";

  const side = match_[1];
  const handicap = parseFloat(match_[2]);

  const adjustedHome = homeGames + (side === "home" ? handicap : 0);
  const adjustedAway = awayGames + (side === "away" ? handicap : 0);

  if (side === "home") return adjustedHome > awayGames ? "won" : "lost";
  return adjustedAway > homeGames ? "won" : "lost";
}
