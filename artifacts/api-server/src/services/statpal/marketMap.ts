/**
 * Statpal market ID / name → Settlement Engine market code mapping.
 *
 * Sources:
 *  - `/v2/soccer/odds/live/markets`  response (known IDs)
 *  - `/v2/soccer/leagues/{id}/odds/prematch` response (known names)
 *  - Settlement Engine registry codes  (footballRegistry, tennisRegistry, …)
 */

// ─── ID map ───────────────────────────────────────────────────────────────────
// Known numeric market IDs from the Statpal live-markets endpoint.

export const STATPAL_MARKET_ID_MAP: Record<number, string> = {
  // Fulltime result
  1834: "match_winner",   // "1x2"
  3610: "match_winner",   // "Fulltime Result"
  // Handicap
  1844: "handicap",       // "3-Way Handicap"
  1845: "asian_handicap", // "Asian Handicap"
  // Total goals
  1836: "over_under",     // "Over/Under"
  // Double Chance
  1839: "double_chance",  // "Double Chance"
  // BTTS
  1846: "btts",           // "Both Teams to Score"
  // Half-time result
  1837: "half_time_result", // "Half Time"
  // Correct Score
  1841: "correct_score",  // "Correct Score"
  // HT/FT
  1843: "ht_ft",          // "Half Time / Full Time"
  // Draw No Bet
  1838: "draw_no_bet",    // "Draw No Bet"
  // First Goal
  1840: "first_goal",     // "First Goal Scorer"
  // Corners
  1850: "corners",        // "Total Corners"
  // Cards
  1851: "cards",          // "Total Bookings"
};

// ─── Name map ─────────────────────────────────────────────────────────────────
// Normalised (lowercase, accent-stripped) Statpal market names.

export const STATPAL_MARKET_NAME_MAP: Record<string, string> = {
  // ── Resultado ─────────────────────────────────────────────────────────────
  "1x2": "match_winner",
  "fulltime result": "match_winner",
  "full time result": "match_winner",
  "full time": "match_winner",
  "match result": "match_winner",
  "match winner": "match_winner",
  "resultado": "match_winner",
  "resultado final": "match_winner",

  "double chance": "double_chance",
  "dupla chance": "double_chance",

  "draw no bet": "draw_no_bet",
  "empate anula aposta": "draw_no_bet",

  "half time/full time": "ht_ft",
  "half time full time": "ht_ft",
  "intervalo/final": "ht_ft",
  "intervalo final": "ht_ft",

  "correct score": "correct_score",
  "exact score": "correct_score",
  "placar exato": "correct_score",
  "placar correto": "correct_score",

  // ── Gols ──────────────────────────────────────────────────────────────────
  "over/under": "over_under",
  "over under": "over_under",
  "total goals": "over_under",
  "total de gols": "over_under",

  "asian handicap": "asian_handicap",
  "handicap asiatico": "asian_handicap",

  "asian totals": "asian_totals",
  "asian total": "asian_totals",
  "total asiatico": "asian_totals",

  "both teams to score": "btts",
  "both teams score": "btts",
  "goal/no goal": "btts",
  "gg/ng": "btts",
  "ambas marcam": "btts",
  "ambas as equipas marcam": "btts",

  "exact goals": "exact_goals",
  "gols exatos": "exact_goals",

  "odd or even": "odd_even_goals",
  "odd/even": "odd_even_goals",
  "impar/par": "odd_even_goals",

  "home team total goals": "home_goals",
  "home team goals": "home_goals",
  "gols casa": "home_goals",

  "away team total goals": "away_goals",
  "away team goals": "away_goals",
  "gols visitante": "away_goals",

  "win to nil": "win_to_nil",
  "vitoria a zero": "win_to_nil",

  "clean sheet": "clean_sheet",
  "folha limpa": "clean_sheet",

  "first goal": "first_goal",
  "first goal scorer team": "first_goal",
  "primeiro gol": "first_goal",
  "primeiro marcador": "first_goal",

  "last goal": "last_goal",
  "ultimo gol": "last_goal",

  // ── Handicap ──────────────────────────────────────────────────────────────
  "3-way handicap": "handicap",
  "3 way handicap": "handicap",
  "european handicap": "handicap",
  "handicap": "handicap",
  "handicap europeu": "handicap",

  // ── Tempos ────────────────────────────────────────────────────────────────
  "half time": "half_time_result",
  "half-time": "half_time_result",
  "first half": "half_time_result",
  "first half result": "half_time_result",
  "1st half": "half_time_result",
  "resultado 1o tempo": "half_time_result",
  "resultado 1 tempo": "half_time_result",

  "second half result": "second_half_result",
  "2nd half": "second_half_result",
  "resultado 2o tempo": "second_half_result",

  "to win both halves": "win_both_halves",
  "win both halves": "win_both_halves",
  "vencer ambos os tempos": "win_both_halves",

  // ── Escanteios ────────────────────────────────────────────────────────────
  "corners": "corners",
  "total corners": "corners",
  "corner handicap": "corners",
  "escanteios": "corners",
  "total escanteios": "corners",

  // ── Cartões ───────────────────────────────────────────────────────────────
  "cards": "cards",
  "total cards": "cards",
  "total bookings": "cards",
  "yellow cards": "cards",
  "cartoes": "cards",
  "total cartoes": "cards",

  // ── Tênis ─────────────────────────────────────────────────────────────────
  "match winner": "match_winner",
  "set winner": "set_winner",
  "total sets": "total_sets",
  "set handicap": "set_handicap",
  "game handicap": "game_handicap",
  "total games": "total_games",
};

// ─── Resolver ─────────────────────────────────────────────────────────────────

function normalizeMarketText(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a Statpal market to a Settlement Engine market code.
 *
 * Resolution order:
 *  1. Exact ID lookup
 *  2. Exact normalised-name lookup
 *  3. Fuzzy partial-name patterns (e.g. "Over/Under 2.5" → "over_under")
 *
 * Returns `null` when no mapping is found.
 */
export function resolveStatpalMarket(
  id: number | string | undefined,
  name: string | undefined,
): string | null {
  if (id != null) {
    const byId = STATPAL_MARKET_ID_MAP[Number(id)];
    if (byId) return byId;
  }
  if (!name) return null;

  const norm = normalizeMarketText(name);
  const byName = STATPAL_MARKET_NAME_MAP[norm];
  if (byName) return byName;

  // Fuzzy fallbacks — order matters (most specific first)
  if (norm.includes("asian handicap")) return "asian_handicap";
  if (norm.includes("asian total") || norm.includes("total asiatico")) return "asian_totals";
  if (norm.includes("double chance") || norm.includes("dupla chance")) return "double_chance";
  if (norm.includes("both teams") || norm.includes("ambas marcam")) return "btts";
  if (norm.includes("over/under") || norm.includes("over under") || norm.includes("total goals")) return "over_under";
  if (norm.includes("correct score") || norm.includes("placar exato")) return "correct_score";
  if (norm.includes("half time") || norm.includes("1st half") || norm.includes("primeiro tempo")) return "half_time_result";
  if (norm.includes("second half") || norm.includes("2nd half")) return "second_half_result";
  if (norm.includes("handicap")) return "handicap";
  if (norm.includes("corner") || norm.includes("escanteio")) return "corners";
  if (norm.includes("card") || norm.includes("cartao") || norm.includes("booking")) return "cards";
  if (norm.includes("1x2") || norm.includes("fulltime")) return "match_winner";

  return null;
}

/**
 * Extract the Over/Under line value from a market name like "Over/Under 2.5"
 * or "Total Goals 1.5". Returns `null` if no number is found.
 */
export function extractOuLine(marketName: string): number | null {
  const m = normalizeMarketText(marketName).match(/(\d+\.?\d*)/);
  if (!m) return null;
  const v = parseFloat(m[1]!);
  return Number.isFinite(v) ? v : null;
}
