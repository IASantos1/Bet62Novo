import type { MatchResult, Selection, Outcome, TennisSetScore } from "../../types/settlement.types.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function getExtras(match: MatchResult): Record<string, any> {
  return (match as any).extras ?? (match as any).periods ?? {};
}

/**
 * Read a set's score from extras.
 * Accepts keys: set1…set5, s1…s5.
 * Each entry may store scores as { home, away } or { homeScore, awayScore }
 * or { player1, player2 }.
 */
function getSet(extras: Record<string, any>, setNum: number | string): TennisSetScore | null {
  const raw = extras[`set${setNum}`] ?? extras[`s${setNum}`];
  if (!raw) return null;
  const h = raw.home ?? raw.homeScore ?? raw.player1;
  const a = raw.away ?? raw.awayScore ?? raw.player2;
  if (h == null || a == null) return null;
  const result: TennisSetScore = { home: Number(h), away: Number(a) };
  if (raw.tiebreak ?? raw.tb) {
    const tb = raw.tiebreak ?? raw.tb;
    const tbH = tb.home ?? tb.player1;
    const tbA = tb.away ?? tb.player2;
    if (tbH != null && tbA != null) result.tiebreak = { home: Number(tbH), away: Number(tbA) };
  }
  return result;
}

/**
 * Sum games across all played sets.
 * Returns null if any set in the expected range is missing data.
 */
function sumAllGames(
  extras: Record<string, any>,
  totalSets: number
): { home: number; away: number } | null {
  let home = 0;
  let away = 0;
  for (let i = 1; i <= totalSets; i++) {
    const s = getSet(extras, i);
    if (!s) return null;
    home += s.home;
    away += s.away;
  }
  return { home, away };
}

function resolvedGames(
  match: MatchResult,
  extras: Record<string, any>
): { home: number; away: number } | null {
  const hg = extras.homeGames ?? extras.player1Games;
  const ag = extras.awayGames ?? extras.player2Games;
  if (hg != null && ag != null) return { home: Number(hg), away: Number(ag) };
  const totalSets = (match.homeScore ?? 0) + (match.awayScore ?? 0);
  if (totalSets === 0) return null;
  return sumAllGames(extras, totalSets);
}

// ─── 1. Match Winner ─────────────────────────────────────────────────────────
// selection: "home" | "away"

export function settleTennisMatchWinner(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const home = match.homeScore;
  const away = match.awayScore;
  const sel = selection.selection.toLowerCase();

  switch (sel) {
    case "home": return home > away ? "won" : "lost";
    case "away": return away > home ? "won" : "lost";
    default: return "void";
  }
}

// ─── 2. Exact Sets ───────────────────────────────────────────────────────────
// selection: "2-0" | "2-1" | "1-2" | "0-2"  (homesets-awaysets)

export function settleExactSets(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const parts = selection.selection.split(/[-:]/).map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return "void";
  const [selHome, selAway] = parts;

  return match.homeScore === selHome && match.awayScore === selAway ? "won" : "lost";
}

// ─── 3. Set Handicap ─────────────────────────────────────────────────────────
// selection: "home_-1.5" | "away_+1.5"

export function settleSetHandicap(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(home|away)_([+-]?\d+\.?\d*)$/);
  if (!m) return "void";

  const side = m[1];
  const hcp = parseFloat(m[2]);

  if (side === "home") {
    const adjusted = match.homeScore + hcp;
    if (adjusted === match.awayScore) return "void";
    return adjusted > match.awayScore ? "won" : "lost";
  }
  const adjusted = match.awayScore + hcp;
  if (adjusted === match.homeScore) return "void";
  return adjusted > match.homeScore ? "won" : "lost";
}

// ─── 4. Set Winner ───────────────────────────────────────────────────────────
// selection: "home_set1" | "away_set2"

export function settleTennisSetWinner(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(home|away)_set([1-5])$/);
  if (!m) return "void";

  const side = m[1];
  const setNum = m[2];
  const s = getSet(extras, setNum);
  if (!s) return "pending";
  if (s.home === s.away) return "lost"; // sets can't tie, but guard anyway
  return side === "home" ? (s.home > s.away ? "won" : "lost") : (s.away > s.home ? "won" : "lost");
}

// ─── 5. Correct Set Score ────────────────────────────────────────────────────
// selection: "6-3_set1" | "7-5_set2"  (or just "6-3" with meta.set = 1)

export function settleCorrectSetScore(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(\d+)[-:](\d+)(?:_set([1-5]))?$/);
  if (!m) return "void";

  const selHome = Number(m[1]);
  const selAway = Number(m[2]);
  const setNum = m[3] ?? String(selection.meta?.set ?? 1);

  const s = getSet(extras, setNum);
  if (!s) return "pending";
  return s.home === selHome && s.away === selAway ? "won" : "lost";
}

// ─── 6. Total Sets O/U ───────────────────────────────────────────────────────
// selection: "over_2.5" | "under_2.5"

export function settleTennisTotalSets(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const totalSets = match.homeScore + match.awayScore;
  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(over|under)_(\d+\.?\d*)$/);
  if (!m) return "void";

  const direction = m[1];
  const line = parseFloat(m[2]);

  if (totalSets === line) return "void";
  return direction === "over" ? totalSets > line ? "won" : "lost" : totalSets < line ? "won" : "lost";
}

// ─── 7. Set Total Games O/U ──────────────────────────────────────────────────
// selection: "over_11_set1" | "under_9_set2"

export function settleSetTotalGames(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(over|under)_(\d+\.?\d*)_set([1-5])$/);
  if (!m) return "void";

  const direction = m[1];
  const line = parseFloat(m[2]);
  const setNum = m[3];

  const s = getSet(extras, setNum);
  if (!s) return "pending";

  const total = s.home + s.away;
  if (total === line) return "void";
  return direction === "over" ? total > line ? "won" : "lost" : total < line ? "won" : "lost";
}

// ─── 8. Total Games O/U ──────────────────────────────────────────────────────
// selection: "over_19.5" | "under_19.5"

export function settleTotalGames(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const games = resolvedGames(match, extras);
  if (!games) return "pending";

  const total = games.home + games.away;
  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(over|under)_(\d+\.?\d*)$/);
  if (!m) return "void";

  const direction = m[1];
  const line = parseFloat(m[2]);

  if (total === line) return "void";
  return direction === "over" ? total > line ? "won" : "lost" : total < line ? "won" : "lost";
}

// ─── 9. Game Handicap ────────────────────────────────────────────────────────
// selection: "home_-0.5" | "away_+4.5"  (applied to total games)

export function settleTennisGameHandicap(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const games = resolvedGames(match, extras);
  if (!games) return "pending";

  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(home|away)_([+-]?\d+\.?\d*)$/);
  if (!m) return "void";

  const side = m[1];
  const hcp = parseFloat(m[2]);

  if (side === "home") {
    const adjusted = games.home + hcp;
    if (adjusted === games.away) return "void";
    return adjusted > games.away ? "won" : "lost";
  }
  const adjusted = games.away + hcp;
  if (adjusted === games.home) return "void";
  return adjusted > games.home ? "won" : "lost";
}

// ─── 10. Player Games O/U ───────────────────────────────────────────────────
// selection: "home_over_5.5" | "away_under_3.5"

export function settlePlayerGames(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(home|away)_(over|under)_(\d+\.?\d*)$/);
  if (!m) return "void";

  const side = m[1];
  const direction = m[2];
  const line = parseFloat(m[3]);

  const games = resolvedGames(match, extras);
  if (!games) return "pending";

  const playerGames = side === "home" ? games.home : games.away;
  if (playerGames === line) return "void";
  return direction === "over" ? playerGames > line ? "won" : "lost" : playerGames < line ? "won" : "lost";
}

// ─── 11. Odd/Even Total Games ───────────────────────────────────────────────
// selection: "odd" | "even"

export function settleOddEvenGames(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const games = resolvedGames(match, extras);
  if (!games) return "pending";

  const total = games.home + games.away;
  const sel = selection.selection.toLowerCase();
  const isOdd = total % 2 !== 0;

  if (sel === "odd") return isOdd ? "won" : "lost";
  if (sel === "even") return isOdd ? "lost" : "won";
  return "void";
}

// ─── 12. Tie-break ──────────────────────────────────────────────────────────
// selection: "yes" | "no"              → did any tiebreak occur in the match?
// selection: "home_set1" | "away_set2" → who won the tiebreak in that set?

export function settleTiebreak(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();

  // yes / no — any tiebreak in the whole match
  if (sel === "yes" || sel === "no") {
    const totalSets = (match.homeScore ?? 0) + (match.awayScore ?? 0);
    let hasTiebreak = false;
    for (let i = 1; i <= Math.max(totalSets, 5); i++) {
      const s = getSet(extras, i);
      if (!s) break;
      if (s.tiebreak) { hasTiebreak = true; break; }
      // 7-6 without explicit tiebreak data also signals a tiebreak
      if ((s.home === 7 && s.away === 6) || (s.home === 6 && s.away === 7)) {
        hasTiebreak = true;
        break;
      }
    }
    return sel === "yes" ? (hasTiebreak ? "won" : "lost") : (hasTiebreak ? "lost" : "won");
  }

  // home_set1 / away_set2 — who won the tiebreak in a specific set
  const m = sel.match(/^(home|away)_set([1-5])$/);
  if (!m) return "void";

  const side = m[1];
  const setNum = m[2];
  const s = getSet(extras, setNum);
  if (!s) return "pending";

  if (s.tiebreak) {
    const tbH = s.tiebreak.home;
    const tbA = s.tiebreak.away;
    return side === "home" ? (tbH > tbA ? "won" : "lost") : (tbA > tbH ? "won" : "lost");
  }
  // Derive winner from set score (7-6 → set winner = tiebreak winner)
  if (!((s.home === 7 && s.away === 6) || (s.home === 6 && s.away === 7))) {
    return "void"; // this set had no tiebreak
  }
  return side === "home" ? (s.home > s.away ? "won" : "lost") : (s.away > s.home ? "won" : "lost");
}

// ─── 13. First Break of Serve ───────────────────────────────────────────────
// selection: "home" | "away"  (who broke serve first)

export function settleFirstBreak(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const firstBreak = extras.firstBreak;
  if (firstBreak == null) return "pending";

  const sel = selection.selection.toLowerCase();
  if (sel === "home") return firstBreak === "home" ? "won" : "lost";
  if (sel === "away") return firstBreak === "away" ? "won" : "lost";
  return "void";
}

// ─── 14. Number of Breaks O/U ───────────────────────────────────────────────
// selection: "over_7.5" | "under_5.5"

export function settleNumberOfBreaks(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  let totalBreaks: number | null = extras.totalBreaks ?? null;
  if (totalBreaks == null) {
    const hb = extras.homeBreaks;
    const ab = extras.awayBreaks;
    if (hb != null && ab != null) totalBreaks = Number(hb) + Number(ab);
  }
  if (totalBreaks == null) return "pending";

  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(over|under)_(\d+\.?\d*)$/);
  if (!m) return "void";

  const direction = m[1];
  const line = parseFloat(m[2]);

  if (totalBreaks === line) return "void";
  return direction === "over" ? totalBreaks > line ? "won" : "lost" : totalBreaks < line ? "won" : "lost";
}

// ─── 15. Race to X Games ────────────────────────────────────────────────────
// selection: "home_4_set1" | "away_4_set2"  (first player to reach X games in a set)

export function settleRaceToGames(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const extras = getExtras(match);
  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(home|away)_(\d+)_set([1-5])$/);
  if (!m) return "void";

  const side = m[1];
  const target = Number(m[2]);
  const setNum = m[3];

  const s = getSet(extras, setNum);
  if (!s) return "pending";

  // A player wins the race if they reached the target games and the opponent
  // didn't get there before (i.e. the player's score ≥ target and opponent's < target
  // at the final point of that set, or they won the set by reaching target first).
  if (side === "home") {
    if (s.home >= target && s.away < target) return "won";
    if (s.away >= target && s.home < target) return "lost";
    // Both reached target (deuce-like scenario) — void
    return "void";
  }
  if (s.away >= target && s.home < target) return "won";
  if (s.home >= target && s.away < target) return "lost";
  return "void";
}
