// Shared extraction helpers for api-tennis.com responses — maps the
// provider's raw shapes onto exactly the fields home.tsx's TennisScore
// component and the expanded match header already read from
// LiveMatchState._liveExtra (sets/currentPoints/serving/tennisStats), so no
// new frontend shape is introduced.
import type { ApiTennisMatch, ApiTennisOddsMarket } from "./index.js";

/** /get_fixtures and /get_livescore's `scores` array — one entry per set,
 * confirmed real in the provider's docs. Sorted by score_set so an
 * in-progress set (the last entry) is always last, matching the
 * `_liveExtra.sets` convention other providers already use. */
export function buildApiTennisSets(
  scores: ApiTennisMatch["scores"] | null | undefined,
): Array<[number, number]> {
  if (!scores || scores.length === 0) return [];
  return [...scores]
    .sort((a, b) => Number(a.score_set) - Number(b.score_set))
    .map((s): [number, number] => [Number(s.score_first) || 0, Number(s.score_second) || 0]);
}

/** event_game_result — confirmed real values: "0 - 0", "30 - 30", "40 - AD"
 * (deuce/advantage as literal strings, not numbers), and "-" before a game
 * has started or once the match has finished. "-" and unparseable strings
 * return undefined rather than a fabricated "0 - 0". */
export function parseApiTennisGameResult(
  result: string | null | undefined,
): [number | string, number | string] | undefined {
  if (!result || result.trim() === "-" || result.trim() === "") return undefined;
  const parts = result.split("-").map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  const toPoint = (p: string): number | string => {
    const n = Number(p);
    return Number.isFinite(n) ? n : p; // "AD"/"D" stay as strings
  };
  return [toPoint(parts[0]), toPoint(parts[1])];
}

/** event_serve — confirmed real values: "First Player" / "Second Player" /
 * null (no server recorded, e.g. before the match starts). */
export function parseApiTennisServer(serve: string | null | undefined): [boolean, boolean] | undefined {
  if (serve === "First Player") return [true, false];
  if (serve === "Second Player") return [false, true];
  return undefined;
}

/** /get_odds's per-match result is keyed by market name (e.g. "Home/Away",
 * "Set Betting") — this reads just the "Home/Away" group, which is itself
 * {Home: {bookmaker: price}, Away: {bookmaker: price}}, confirmed real.
 * Picks the first bookmaker quoting BOTH sides, same "first valid entry"
 * convention as extractGoalApi1x2Odds (services/goalapi/common.ts) — never
 * averages or fabricates a price. */
export function extractApiTennisMoneyline(
  homeAway: ApiTennisOddsMarket | undefined,
): { home: number; away: number } | null {
  const home = homeAway?.["Home"];
  const away = homeAway?.["Away"];
  if (!home || !away) return null;
  for (const bookmaker of Object.keys(home)) {
    if (!(bookmaker in away)) continue;
    const h = Number(home[bookmaker]);
    const a = Number(away[bookmaker]);
    if (Number.isFinite(h) && Number.isFinite(a)) return { home: h, away: a };
  }
  return null;
}
