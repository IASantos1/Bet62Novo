// Statyx football (soccer) — fixtures, team directory, and the normalized
// player-prop odds board. Every shape below comes from REAL sampled
// responses fetched through /api/debug-statyx during this integration
// (2026-09-06), not guessed from the docs (which only list endpoint paths
// and query params, no field-level response shapes) — see each type's own
// comment for exactly which sample confirmed it.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { statyxGet, statyxGetWithRetry } from "./client.js";

// Confirmed real (GET /v1/football/fixtures?limit=1 and ?date=2026-09-06):
// status_group 1 = "Not started", 5 = "Postponed". No live-in-progress or
// finished sample was available yet (every fixture checked so far, across
// several real queries, was either not-started or postponed) — the other
// numeric values are NOT confirmed. Treat status_group values other than
// 1/5 defensively: presence of a non-null score is the one thing we DO
// trust to mean "underway or finished", not the status_group number itself.
export const STATYX_STATUS_GROUP_NOT_STARTED = 1;
export const STATYX_STATUS_GROUP_POSTPONED = 5;

export type StatyxFootballVenue = {
  name: string;
  city: string;
  capacity: number;
};

export type StatyxFootballFixture = {
  game_id: number;
  competition_id: number;
  competition_display_name: string;
  season_num: number;
  stage_name: string | null;
  round_num: number | null;
  round_name: string | null;
  game_date: string;
  start_time: string;
  status_group: number;
  status_text: string;
  short_status_text: string;
  game_time: string | null;
  home_competitor_id: number;
  home_score: number | null;
  away_competitor_id: number;
  away_score: number | null;
  winner: number;
  venue: StatyxFootballVenue | null;
};

// Confirmed real (GET /v1/football/teams?limit=3): no logo/crest field at
// all — "Clubs with colors and main competition" per the docs means
// literally just colors, nothing else visual. main_competition_id was null
// even on a real sample, so it can't be trusted to filter teams by
// competition (confirmed separately: ?competition_id=35 returned 0 rows
// for a competition we know is real and has fixtures) — the only reliable
// way to resolve a competitor_id to a name is the full team list, cached
// client-side, not a per-competition or per-id filter.
export type StatyxFootballTeam = {
  team_id: number;
  country_id: number;
  name: string;
  short_name: string | null;
  symbolic_name: string | null;
  name_for_url: string;
  type: number;
  popularity_rank: number;
  main_competition_id: number | null;
  color: string | null;
  away_color: string | null;
};

// Confirmed real (GET /v1/odds/soccer/board?limit=3) — one row per (game,
// player, market, line), NOT one row per player. `game_id` here is a
// DIFFERENT id space than StatyxFootballFixture.game_id — a composite
// string ("soccer:AwayTeam@HomeTeam-YYYYMMDD"), not the fixture's numeric
// id. home_team_id/away_team_id are frequently null for soccer (unlike
// MLB, where they were always populated) — team-name + commence_time is
// the only reliable join key back to a fixture, not team_id. Odds are
// AMERICAN format, as STRINGS (e.g. "-108", "1150"), not the decimal
// numbers the rest of this codebase uses everywhere else.
export type StatyxOddsBoardBook = {
  book: string;
  line: number;
  eventLink: string;
  overPrice: number | null;
  underPrice: number | null;
};

export type StatyxOddsBoardRow = {
  row_key: string;
  game_id: string;
  home_team: string;
  home_team_id: number | null;
  away_team: string;
  away_team_id: number | null;
  player_team: string | null;
  player_team_id: number | null;
  commence_time: string;
  player_name: string;
  player_id: number | null;
  market: string;
  raw_market: string;
  line: string;
  line_type: "alt" | "ou" | string;
  best_over_price: string | null;
  best_under_price: string | null;
  best_over_book: string | null;
  best_under_book: string | null;
  best_book_event_link: string | null;
  has_alt_ladder: boolean;
  books: StatyxOddsBoardBook[];
  alt_lines: unknown[];
  books_at_exact_line: string[];
  fetched_at: string;
};

type StatyxListResponse<T> = { data: T[]; meta?: Record<string, unknown> };

/** American odds (e.g. -108, +150) → decimal odds (e.g. 1.93, 2.50) — every
 * other provider in this codebase already speaks decimal, and every
 * frontend OddsButton/settlement path assumes decimal. Statyx's own board
 * sends both line and price as STRINGS; callers pass the parsed number in. */
export function americanToDecimalOdds(american: number): number | null {
  if (!Number.isFinite(american) || american === 0) return null;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function parseStatyxNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ── Fixtures ─────────────────────────────────────────────────────────────
const FIXTURES_TTL_MS = 2 * 60 * 1000;
const fixturesCache = new Map<string, { fixtures: StatyxFootballFixture[]; fetchedAt: number }>();
const fixturesInFlight = new Map<string, Promise<StatyxFootballFixture[]>>();

export async function getStatyxFootballFixtures(params: {
  competition_id?: number;
  team_id?: number;
  date?: string; // YYYY-MM-DD
  status_group?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<StatyxFootballFixture[]> {
  if (!CONFIG.ENABLE_STATYX) return [];
  if (!CONFIG.STATYX_API_KEY) return [];
  const cacheKey = JSON.stringify(params);
  const now = Date.now();
  const cached = fixturesCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < FIXTURES_TTL_MS) return cached.fixtures;
  const inFlight = fixturesInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = statyxGetWithRetry<StatyxListResponse<StatyxFootballFixture>>(
    "/football/fixtures",
    {
      competition_id: params.competition_id,
      team_id: params.team_id,
      date: params.date,
      status_group: params.status_group,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
  )
    .then((resp) => {
      const fixtures = resp?.data ?? [];
      fixturesCache.set(cacheKey, { fixtures, fetchedAt: Date.now() });
      return fixtures;
    })
    .catch((err) => {
      logger.warn({ err, params }, "[statyx] football fixtures fetch failed");
      return fixturesCache.get(cacheKey)?.fixtures ?? [];
    })
    .finally(() => {
      fixturesInFlight.delete(cacheKey);
    });
  fixturesInFlight.set(cacheKey, promise);
  return promise;
}

// ── Teams (full-catalog cache — no per-id or reliable per-competition
// lookup exists, see StatyxFootballTeam's own comment) ─────────────────────
const TEAMS_TTL_MS = 6 * 60 * 60 * 1000; // team rosters/colors change rarely
const TEAMS_PAGE_SIZE = 500;
const TEAMS_MAX_PAGES = 40; // 40 * 500 = 20,000 teams — generous ceiling, not a real expectation
let teamsCache: { byId: Map<number, StatyxFootballTeam>; fetchedAt: number } | null = null;
let teamsInFlight: Promise<Map<number, StatyxFootballTeam>> | null = null;

async function fetchAllStatyxFootballTeams(): Promise<Map<number, StatyxFootballTeam>> {
  const byId = new Map<number, StatyxFootballTeam>();
  for (let page = 0; page < TEAMS_MAX_PAGES; page++) {
    const resp = await statyxGetWithRetry<StatyxListResponse<StatyxFootballTeam>>(
      "/football/teams",
      { limit: TEAMS_PAGE_SIZE, offset: page * TEAMS_PAGE_SIZE },
      { retries: 1 },
    );
    const rows = resp?.data ?? [];
    for (const t of rows) byId.set(t.team_id, t);
    if (rows.length < TEAMS_PAGE_SIZE) break;
  }
  return byId;
}

/** Full team_id → team lookup, refreshed every TEAMS_TTL_MS. This is a
 * genuinely large fetch (see TEAMS_MAX_PAGES) — only ever awaited by
 * callers that actually need to resolve a competitor_id to a name (the
 * fixtures endpoint never includes team names inline), and shared/cached
 * so it only actually runs once per TTL window regardless of how many
 * fixtures need names resolved. */
export async function getStatyxFootballTeamsById(): Promise<Map<number, StatyxFootballTeam>> {
  if (!CONFIG.ENABLE_STATYX) return new Map();
  if (!CONFIG.STATYX_API_KEY) return new Map();
  const now = Date.now();
  if (teamsCache && now - teamsCache.fetchedAt < TEAMS_TTL_MS) return teamsCache.byId;
  if (teamsInFlight) return teamsInFlight;
  teamsInFlight = fetchAllStatyxFootballTeams()
    .then((byId) => {
      teamsCache = { byId, fetchedAt: Date.now() };
      return byId;
    })
    .catch((err) => {
      logger.warn({ err }, "[statyx] football teams fetch failed");
      return teamsCache?.byId ?? new Map();
    })
    .finally(() => {
      teamsInFlight = null;
    });
  return teamsInFlight;
}

// ── Odds board (player props) ───────────────────────────────────────────
const ODDS_BOARD_TTL_MS = 60 * 1000;
let oddsBoardCache: { rows: StatyxOddsBoardRow[]; fetchedAt: number } | null = null;
let oddsBoardInFlight: Promise<StatyxOddsBoardRow[]> | null = null;

async function fetchStatyxSoccerOddsBoard(): Promise<StatyxOddsBoardRow[]> {
  const rows: StatyxOddsBoardRow[] = [];
  const limit = 500;
  // Best-effort pagination — /v1/odds/sports reported 2192 rows for soccer
  // at last check (2026-09-06); capped well above that so a real-world
  // growth in row count doesn't silently truncate the board.
  for (let offset = 0; offset < 10_000; offset += limit) {
    const resp = await statyxGetWithRetry<StatyxListResponse<StatyxOddsBoardRow>>(
      "/odds/soccer/board",
      { limit, offset },
      { retries: 1 },
    );
    const page = resp?.data ?? [];
    rows.push(...page);
    if (page.length < limit) break;
  }
  return rows;
}

/** All current soccer player-prop rows, cached ~1min (this is a
 * comparatively expensive multi-page fetch — see fetchStatyxSoccerOddsBoard
 * — so every caller within the TTL window shares one fetch). */
export async function getStatyxSoccerOddsBoard(): Promise<StatyxOddsBoardRow[]> {
  if (!CONFIG.ENABLE_STATYX) return [];
  if (!CONFIG.STATYX_API_KEY) return [];
  const now = Date.now();
  if (oddsBoardCache && now - oddsBoardCache.fetchedAt < ODDS_BOARD_TTL_MS) return oddsBoardCache.rows;
  if (oddsBoardInFlight) return oddsBoardInFlight;
  oddsBoardInFlight = fetchStatyxSoccerOddsBoard()
    .then((rows) => {
      oddsBoardCache = { rows, fetchedAt: Date.now() };
      return rows;
    })
    .catch((err) => {
      logger.warn({ err }, "[statyx] soccer odds board fetch failed");
      return oddsBoardCache?.rows ?? [];
    })
    .finally(() => {
      oddsBoardInFlight = null;
    });
  return oddsBoardInFlight;
}

export type PlayerPropSelection = {
  player: string;
  playerId: number | null;
  market: string; // Statyx's own market key, e.g. "goals", "assists", "shots_on_target"
  line: number;
  side: "over" | "under";
  odd: number; // decimal
  book: string;
};

export type PlayerPropGame = {
  statyxGameId: string; // Statyx's own composite game_id — NOT a fixture id
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  commenceTimeISO: string;
  props: PlayerPropSelection[];
};

/** Groups the flat odds-board rows into one entry per game with all of
 * that game's player-prop selections attached — the shape the frontend's
 * new player-props section actually renders. Each row's best_over/
 * best_under price+book becomes up to 2 selections (one per side that
 * actually has a price this tick — most rows only have one side quoted,
 * confirmed real). Rows with neither side priced, or a line that fails to
 * parse, are dropped rather than shown as a broken "?" selection. */
export function groupPlayerPropsByGame(rows: StatyxOddsBoardRow[]): Map<string, PlayerPropGame> {
  const games = new Map<string, PlayerPropGame>();
  for (const row of rows) {
    const line = parseStatyxNumber(row.line);
    if (line === null) continue;
    let game = games.get(row.game_id);
    if (!game) {
      game = {
        statyxGameId: row.game_id,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        homeTeamId: row.home_team_id,
        awayTeamId: row.away_team_id,
        commenceTimeISO: row.commence_time,
        props: [],
      };
      games.set(row.game_id, game);
    }
    const overAmerican = parseStatyxNumber(row.best_over_price);
    if (overAmerican !== null && row.best_over_book) {
      const decimal = americanToDecimalOdds(overAmerican);
      if (decimal !== null) {
        game.props.push({
          player: row.player_name,
          playerId: row.player_id,
          market: row.market,
          line,
          side: "over",
          odd: decimal,
          book: row.best_over_book,
        });
      }
    }
    const underAmerican = parseStatyxNumber(row.best_under_price);
    if (underAmerican !== null && row.best_under_book) {
      const decimal = americanToDecimalOdds(underAmerican);
      if (decimal !== null) {
        game.props.push({
          player: row.player_name,
          playerId: row.player_id,
          market: row.market,
          line,
          side: "under",
          odd: decimal,
          book: row.best_under_book,
        });
      }
    }
  }
  return games;
}
