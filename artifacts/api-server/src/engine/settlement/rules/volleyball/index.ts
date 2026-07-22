import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

function getExtras(match: MatchResult): Record<string, any> {
  return (match as any).extras ?? (match as any).periods ?? {};
}

/** Sets won by each side */
function getSets(match: MatchResult): { home: number; away: number } {
  return {
    home: match.homeScore ?? 0,
    away: match.awayScore ?? 0,
  };
}

/** Points in a specific set from extras */
function getSetPoints(match: MatchResult, setNum: number): { home: number; away: number } | null {
  const extras = getExtras(match);
  const volley = extras.volleyball ?? extras;

  // Try extras.volleyball.sets array first (preferred format)
  const sets: Array<[number, number]> | undefined = volley.sets ?? extras.sets;
  if (Array.isArray(sets) && sets.length >= setNum) {
    const s = sets[setNum - 1];
    if (Array.isArray(s) && s.length === 2) return { home: s[0] as number, away: s[1] as number };
  }

  // Fallback: period keys (period1, period2…) or set1, set2…
  for (const key of [`period${setNum}`, `set${setNum}`, `s${setNum}`]) {
    const raw = volley[key] ?? extras[key];
    if (!raw) continue;
    if (typeof raw === "object" && "home" in raw && "away" in raw) {
      return { home: Number(raw.home), away: Number(raw.away) };
    }
    if (Array.isArray(raw) && raw.length === 2) return { home: Number(raw[0]), away: Number(raw[1]) };
  }

  return null;
}

// ── Match Winner ──────────────────────────────────────────────────────────────
export function settleVolleyballMatchWinner(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const { home, away } = getSets(match);
  switch (selection.selection.toLowerCase()) {
    case "home": return home > away ? "won" : "lost";
    case "away": return away > home ? "won" : "lost";
    default: return "void";
  }
}

// ── Total Sets Over/Under ─────────────────────────────────────────────────────
export function settleVolleyballTotalSets(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const totalSets = match.homeScore + match.awayScore;
  const sel = selection.selection.toLowerCase();

  const m = sel.match(/^(over|under)_([\d.]+)$/);
  if (!m) return "void";

  const direction = m[1]!;
  const line = parseFloat(m[2]!);

  if (totalSets === line) return "void";
  return direction === "over" ? (totalSets > line ? "won" : "lost") : (totalSets < line ? "won" : "lost");
}

// ── Set Winner ────────────────────────────────────────────────────────────────
// selection: "home_set1" | "away_set2" | ...
export function settleVolleyballSetWinner(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const sel = selection.selection.toLowerCase();
  const m = sel.match(/^(home|away)_set([1-5])$/);
  if (!m) return "void";

  const side = m[1]!;
  const setNum = parseInt(m[2]!);

  const pts = getSetPoints(match, setNum);
  if (!pts) return "pending";

  if (pts.home === pts.away) return "void"; // shouldn't happen in volleyball
  return side === "home" ? (pts.home > pts.away ? "won" : "lost") : (pts.away > pts.home ? "won" : "lost");
}

// ── Set Handicap ──────────────────────────────────────────────────────────────
// selection: "home_-1.5" | "away_+1.5" | "home_1.5" (handicap on sets won)
export function settleVolleyballSetHandicap(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";
  if (match.homeScore == null || match.awayScore == null) return "pending";

  const sel = selection.selection.toLowerCase().replace(/\s/g, "");
  const m = sel.match(/^(home|away)_([+-]?[\d.]+)$/);
  if (!m) return "void";

  const side = m[1]! as "home" | "away";
  const handicap = parseFloat(m[2]!);
  const { home, away } = getSets(match);

  const adjustedDiff = side === "home"
    ? (home + handicap) - away
    : (away + handicap) - home;

  if (adjustedDiff === 0) return "void";
  return adjustedDiff > 0 ? "won" : "lost";
}

// ── Points in Set Over/Under ──────────────────────────────────────────────────
// selection: "over_44.5_set1" | "under_44.5_set2"
export function settleVolleyballSetPoints(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const sel = selection.selection.toLowerCase().replace(/\s/g, "");
  const m = sel.match(/^(over|under)_([\d.]+)_set([1-5])$/);
  if (!m) return "void";

  const direction = m[1]!;
  const line = parseFloat(m[2]!);
  const setNum = parseInt(m[3]!);

  const pts = getSetPoints(match, setNum);
  if (!pts) return "pending";

  const total = pts.home + pts.away;
  if (total === line) return "void";
  return direction === "over" ? (total > line ? "won" : "lost") : (total < line ? "won" : "lost");
}

// ── Total Points Match Over/Under ─────────────────────────────────────────────
// selection: "over_154.5" | "under_154.5"
export function settleVolleyballTotalPoints(input: { match: MatchResult; selection: Selection }): Outcome {
  const { match, selection } = input;
  if (match.status !== "finished") return "pending";

  const sel = selection.selection.toLowerCase().replace(/\s/g, "");
  const m = sel.match(/^(over|under)_([\d.]+)$/);
  if (!m) return "void";

  const direction = m[1]!;
  const line = parseFloat(m[2]!);

  // Sum points from all sets
  let totalPoints = 0;
  let hasSets = false;
  for (let i = 1; i <= 5; i++) {
    const pts = getSetPoints(match, i);
    if (!pts) break;
    totalPoints += pts.home + pts.away;
    hasSets = true;
  }

  if (!hasSets) return "void";
  if (totalPoints === line) return "void";
  return direction === "over" ? (totalPoints > line ? "won" : "lost") : (totalPoints < line ? "won" : "lost");
}
