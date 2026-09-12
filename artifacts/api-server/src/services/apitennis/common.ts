// Shared extraction helpers for api-tennis.com responses — maps the
// provider's raw shapes onto exactly the fields home.tsx's TennisScore
// component and the expanded match header already read from
// LiveMatchState._liveExtra (sets/currentPoints/serving/tennisStats), so no
// new frontend shape is introduced.
import type { ApiTennisMatch, ApiTennisOddsMarket, ApiTennisH2HResult, ApiTennisPlayer, ApiTennisLiveOddsEntry } from "./index.js";

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
export type BuiltApiTennisConfrontosMeeting = {
  date: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  league: string;
  country?: string;
};

/** Maps /get_H2H's `H2H` array (past meetings between these two exact
 * players) onto the shape routes/matches.ts's existing ConfrontosResult
 * expects — GOAL API never had an H2H endpoint, so this is the first real
 * H2H implementation in the app, not a port of an existing one. A meeting's
 * "First Player"/"Second Player" side is matched by exact name against
 * `homeName`/`awayName` (the same event_first_player/event_second_player
 * strings this app's own tennis builders already use as `home`/`away`) so
 * score1/score2 always align to THIS match's home/away, not whichever side
 * happened to be "first" in a given historical meeting. Tennis has no
 * draws — draws is always 0. */
export function buildApiTennisConfrontos(
  h2h: ApiTennisH2HResult | null | undefined,
  homeName: string,
  awayName: string,
): { homeWins: number; awayWins: number; draws: number; recentMeetings: BuiltApiTennisConfrontosMeeting[] } {
  let homeWins = 0;
  let awayWins = 0;
  const recentMeetings: BuiltApiTennisConfrontosMeeting[] = [];
  for (const m of h2h?.H2H ?? []) {
    const isHomeFirst = m.event_first_player === homeName;
    const isAwayFirst = m.event_first_player === awayName;
    if (!isHomeFirst && !isAwayFirst) continue;
    if (m.event_winner) {
      const winnerIsHome = isHomeFirst ? m.event_winner === "First Player" : m.event_winner === "Second Player";
      if (winnerIsHome) homeWins++;
      else awayWins++;
    }
    const [rawA, rawB] = (m.event_final_result ?? "").split("-").map((s) => Number(s.trim()));
    const score1 = isHomeFirst ? rawA : rawB;
    const score2 = isHomeFirst ? rawB : rawA;
    recentMeetings.push({
      date: m.event_date,
      team1: homeName,
      team2: awayName,
      score1: Number.isFinite(score1) ? score1! : 0,
      score2: Number.isFinite(score2) ? score2! : 0,
      league: m.tournament_name,
    });
  }
  return { homeWins, awayWins, draws: 0, recentMeetings };
}

/** player_bday — confirmed real format "DD.MM.YYYY" — to ISO "YYYY-MM-DD".
 * PlayerProfileModal.tsx's ageFromBirthDate does `new Date(dateOfBirth)`,
 * which silently misparses "DD.MM.YYYY" (read as invalid or month/day
 * swapped), so this conversion is required, not cosmetic. */
export function convertApiTennisBirthDate(bday: string | null | undefined): string | null {
  if (!bday) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(bday.trim());
  if (!m) return null;
  const [, day, month, year] = m;
  return `${year}-${month}-${day}`;
}

export type BuiltApiTennisPlayerProfile = {
  id: string;
  name: string;
  imageUrl: string | null;
  nationality: string | null;
  nationalityFlagUrl: string | null;
  position: string | null;
  height: number | null;
  weight: number | null;
  dateOfBirth: string | null;
  team: string | null;
  teamLogoUrl: string | null;
  competition: string | null;
  seasonStats: {
    appearances: null;
    goals: null;
    assists: null;
    yellowCards: null;
    redCards: null;
    minutesPlayed: null;
  };
  recentMatches: [];
  tennisStats: {
    season: string;
    rank: string | null;
    titles: number | null;
    matchesWon: number | null;
    matchesLost: number | null;
  } | null;
};

/** Maps /get_players onto the Player Profile modal's shape. Football-only
 * fields (goals/cards/appearances) have no tennis equivalent — left null
 * rather than guessed, same convention as buildGoalApiPlayerProfile leaving
 * height/weight/competition null. tennisStats carries the most recent
 * season entry from the real `stats[]` array instead, for a sport-specific
 * branch in the modal to render. */
export function buildApiTennisPlayerProfile(player: ApiTennisPlayer): BuiltApiTennisPlayerProfile {
  const latest = [...(player.stats ?? [])].sort((a, b) => Number(b.season) - Number(a.season))[0];
  const toNum = (s: string | undefined): number | null => {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: player.player_key,
    name: player.player_name,
    imageUrl: player.player_logo ?? null,
    nationality: player.player_country ?? null,
    nationalityFlagUrl: null,
    position: null,
    height: null,
    weight: null,
    dateOfBirth: convertApiTennisBirthDate(player.player_bday),
    team: null,
    teamLogoUrl: null,
    competition: null,
    seasonStats: {
      appearances: null,
      goals: null,
      assists: null,
      yellowCards: null,
      redCards: null,
      minutesPlayed: null,
    },
    recentMatches: [],
    tennisStats: latest
      ? {
          season: latest.season,
          rank: latest.rank || null,
          titles: toNum(latest.titles),
          matchesWon: toNum(latest.matches_won),
          matchesLost: toNum(latest.matches_lost),
        }
      : null,
  };
}

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

/** Real markets extracted from GET /get_live_odds's flat live_odds[] rows —
 * confirmed real 2026-09-11 against a live match (Zverev vs Khachanov).
 * Only maps odd_name/type combinations this app already has a rendered
 * slot for (computeTennisExtras' synthetic fields in routes/matches.ts):
 * moneyline ("To Win"), set 1-3 winner, total games (match + set 1), and
 * the match games handicap. Several other real markets this same response
 * carries (Total Sets, tie-breaks, correct-score groups, Match Result +
 * Total Games combos, ...) have no existing frontend market to patch and
 * are deliberately left out — wiring those needs new UI/settlement work,
 * not just a parser, and is out of scope here.
 *
 * A suspended row (the bookmaker has paused that specific line, e.g. right
 * after a break point) is treated as "no real value this tick" rather than
 * shown frozen — same principle as GOAL API's suspension engine — so the
 * caller's existing synthetic fallback covers it until the line reopens. */
export type ApiTennisRealLiveMarkets = {
  moneyline?: { home: number; away: number };
  set1?: { home: number; away: number };
  set2?: { home: number; away: number };
  set3?: { home: number; away: number };
  /** Every non-suspended (line, over, under) triple found for "Total Games
   * in Match" — the caller picks/merges into its own fixed line ladder. */
  totalGamesLines?: Array<{ line: number; over: number; under: number }>;
  set1GamesLines?: Array<{ line: number; over: number; under: number }>;
  /** "Match Handicap" — a GAMES handicap for the whole match (confirmed
   * real: e.g. line -5.5/+5.5, far too large to be a sets handicap), not
   * to be confused with computeTennisExtras' sets-based `setHandicap`
   * (line 1.5, "wins in straight sets"), which this feed has no direct
   * equivalent for. */
  gameHandicap?: { line: number; home: number; away: number };
};

function findLiveOddValue(
  rows: ApiTennisLiveOddsEntry[],
  oddName: string,
  type: string,
): number | null {
  const row = rows.find((r) => r.odd_name === oddName && r.type === type && r.suspended !== "Yes");
  if (!row) return null;
  const v = Number(row.value);
  return Number.isFinite(v) && v > 1 ? v : null;
}

function findLiveOddPair(
  rows: ApiTennisLiveOddsEntry[],
  oddName: string,
): { home: number; away: number } | null {
  const home = findLiveOddValue(rows, oddName, "Home");
  const away = findLiveOddValue(rows, oddName, "Away");
  if (home == null || away == null) return null;
  return { home, away };
}

/** Every non-suspended Over/Under pair sharing the same `handicap` (the
 * line) under one odd_name — e.g. "Total Games in Match" quotes several
 * lines (35.5, 56.5, ...) at once, same multi-line pattern this codebase's
 * football over/under aggregators already follow. */
function findLiveOverUnderLines(
  rows: ApiTennisLiveOddsEntry[],
  oddName: string,
): Array<{ line: number; over: number; under: number }> {
  const overByLine = new Map<number, number>();
  const underByLine = new Map<number, number>();
  for (const r of rows) {
    if (r.odd_name !== oddName || r.suspended === "Yes") continue;
    const line = Number(r.handicap);
    const value = Number(r.value);
    if (!Number.isFinite(line) || !Number.isFinite(value) || value <= 1) continue;
    if (r.type === "Over") overByLine.set(line, value);
    else if (r.type === "Under") underByLine.set(line, value);
  }
  const out: Array<{ line: number; over: number; under: number }> = [];
  for (const [line, over] of overByLine) {
    const under = underByLine.get(line);
    if (under != null) out.push({ line, over, under });
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Maps /get_fixtures and /get_livescore's `statistics[]` array (real per
 * confirmed docs — aces, double faults, % of first-serve points won,
 * break points, etc., keyed by player_key/stat_period/stat_type/stat_name)
 * onto the same {title, rows: [{name, home, away}]} shape the football
 * side's buildGoalApiMatchStats already produces for the shared
 * "Estatísticas" tab — real bug fixed 2026-09-12 (user-reported: that tab
 * was always empty for tennis matches, since nothing ever built this
 * shape from api-tennis.com's real statistics field even though the docs
 * confirm it's populated once available). Only stat_period === "match"
 * rows are used — this widget shows whole-match totals, not a per-set
 * breakdown (api-tennis.com's docs don't show a per-set stat_period value
 * in any real example, so grouping by anything else would be guessing). */
export function buildApiTennisMatchStats(
  statistics: ApiTennisMatch["statistics"] | null | undefined,
  homePlayerKey: string,
  awayPlayerKey: string,
): Array<{ title: string; rows: Array<{ name: string; home: string; away: string }> }> {
  if (!statistics || statistics.length === 0) return [];
  const groups = new Map<string, Map<string, { home: string; away: string }>>();
  for (const s of statistics) {
    if (s.stat_period !== "match") continue;
    if (!groups.has(s.stat_type)) groups.set(s.stat_type, new Map());
    const rows = groups.get(s.stat_type)!;
    if (!rows.has(s.stat_name)) rows.set(s.stat_name, { home: "-", away: "-" });
    const row = rows.get(s.stat_name)!;
    if (String(s.player_key) === String(homePlayerKey)) row.home = s.stat_value;
    else if (String(s.player_key) === String(awayPlayerKey)) row.away = s.stat_value;
  }
  return [...groups.entries()]
    .map(([title, rows]) => ({
      title,
      rows: [...rows.entries()].map(([name, v]) => ({ name, ...v })),
    }))
    .filter((g) => g.rows.some((r) => r.home !== "-" || r.away !== "-"));
}

export function extractApiTennisLiveMarkets(
  rows: ApiTennisLiveOddsEntry[] | null | undefined,
): ApiTennisRealLiveMarkets {
  if (!rows || rows.length === 0) return {};

  const out: ApiTennisRealLiveMarkets = {};

  const moneyline = findLiveOddPair(rows, "To Win");
  if (moneyline) out.moneyline = moneyline;

  const set1 = findLiveOddPair(rows, "Set 1 Winner");
  if (set1) out.set1 = set1;
  const set2 = findLiveOddPair(rows, "Set 2 Winner");
  if (set2) out.set2 = set2;
  const set3 = findLiveOddPair(rows, "Set 3 Winner");
  if (set3) out.set3 = set3;

  const totalGamesLines = findLiveOverUnderLines(rows, "Total Games in Match");
  if (totalGamesLines.length > 0) out.totalGamesLines = totalGamesLines;
  const set1GamesLines = findLiveOverUnderLines(rows, "Total Games in Set 1");
  if (set1GamesLines.length > 0) out.set1GamesLines = set1GamesLines;

  const handicapHome = rows.find(
    (r) => r.odd_name === "Match Handicap" && r.type === "Home" && r.suspended !== "Yes",
  );
  const handicapAway = rows.find(
    (r) => r.odd_name === "Match Handicap" && r.type === "Away" && r.suspended !== "Yes",
  );
  if (handicapHome && handicapAway) {
    const line = Number(handicapHome.handicap);
    const home = Number(handicapHome.value);
    const away = Number(handicapAway.value);
    if (Number.isFinite(line) && Number.isFinite(home) && home > 1 && Number.isFinite(away) && away > 1) {
      out.gameHandicap = { line, home, away };
    }
  }

  return out;
}
