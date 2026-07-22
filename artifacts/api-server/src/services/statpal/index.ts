/**
 * StatpalClient — centralised typed service for all Statpal API calls.
 *
 * Usage:
 *   import { statpal } from "../services/statpal/index.js";
 *   const live = await statpal.getFootballOddsLive();
 *
 * The singleton uses STATPAL_API_KEY and STATPAL_BASE_URL from the environment
 * (same vars already consumed by matches.ts). Every method throws on non-2xx
 * HTTP responses — callers should try/catch.
 */

export type StatpalConfig = {
  apiKey: string;
  baseUrl?: string;
};

// ─── Raw response shapes ───────────────────────────────────────────────────

export type StatpalOdd = { name: string; value: string };

export type StatpalBookmaker = {
  id: string;
  name: string;
  timestamp?: string;
  stop?: string;
  odd: StatpalOdd | StatpalOdd[];
};

export type StatpalMarket = {
  id: string;
  name: string;
  stop?: string;
  bookmaker: StatpalBookmaker | StatpalBookmaker[];
};

export type StatpalPrematchMatch = {
  main_id: string;
  fallback_id_1?: string;
  fallback_id_2?: string;
  fallback_id_3?: string;
  date: string;
  time: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  odds: StatpalMarket | StatpalMarket[];
};

export type StatpalPrematchOddsResponse = {
  prematch_odds?: {
    updated?: string;
    updated_ts?: number;
    league?: {
      id: string;
      name: string;
      country: string;
      match: StatpalPrematchMatch | StatpalPrematchMatch[];
    };
  };
};

export type StatpalLiveMarket = { id: number; name: string };
export type StatpalLiveMatchState = { id: number; name: string };

// ─── Client ───────────────────────────────────────────────────────────────

export class StatpalClient {
  private readonly baseUrl: string;

  constructor(private readonly config: StatpalConfig) {
    this.baseUrl = (config.baseUrl ?? "https://statpal.io/api").replace(
      /\/+$/,
      "",
    );
  }

  /** Build a full URL with access_key and optional extra params. */
  buildUrl(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);
    url.searchParams.set("access_key", this.config.apiKey);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value == null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /** Standard Statpal request headers. */
  headers(): Record<string, string> {
    return { Accept: "application/json" };
  }

  /**
   * Normalise a raw Statpal array-or-single-item field to an array.
   * Equivalent to the existing `statpalList()` helper in matches.ts.
   */
  list<T>(raw: T | T[] | null | undefined): T[] {
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  // ── MLB (Baseball) ────────────────────────────────────────────────────────

  /** `/v1/mlb/livescores` — real-time scores with inning-by-inning, hits, errors, outs, starting pitchers */
  async getMLBLivescores(): Promise<Record<string, unknown>> {
    return this.get("/v1/mlb/livescores");
  }

  /** `/v1/mlb/daily/d-{offset}` — d-0=today, d-1=yesterday, d-2=two days ago */
  async getMLBDaily(offset: number = 1): Promise<Record<string, unknown>> {
    return this.get(`/v1/mlb/daily/d-${offset}`);
  }

  /** `/v1/mlb/season-schedule` — full 2025 season schedule (upcoming + completed) */
  async getMLBSeasonSchedule(): Promise<Record<string, unknown>> {
    return this.get("/v1/mlb/season-schedule");
  }

  /** `/v1/mlb/standings` — standings by division and league (AL East/Central/West, NL …) */
  async getMLBStandings(): Promise<Record<string, unknown>> {
    return this.get("/v1/mlb/standings");
  }

  /** `/v1/mlb/rosters/{abbr}` — active roster with player bio and base64 team image */
  async getMLBRosters(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/mlb/rosters/${encodeURIComponent(teamAbbr.toLowerCase())}`);
  }

  /** `/v1/mlb/team-stats/{abbr}` — batting / pitching / fielding stats per player */
  async getMLBTeamStats(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/mlb/team-stats/${encodeURIComponent(teamAbbr.toLowerCase())}`);
  }

  /** `/v1/mlb/injuries/{abbr}` — injury and suspension report for a team */
  async getMLBInjuries(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/mlb/injuries/${encodeURIComponent(teamAbbr.toLowerCase())}`);
  }

  /**
   * `/v1/mlb/league-stats/{category}` — league-wide player leaderboards.
   *
   * Known categories:
   *   `mlb_player_batting`, `mlb_player_pitching`, `mlb_player_fielding`,
   *   `mlb_team_batting`, `mlb_team_pitching`
   */
  async getMLBLeagueStats(category: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/mlb/league-stats/${encodeURIComponent(category)}`);
  }

  // ── MLB odds ──────────────────────────────────────────────────────────────

  /** `/v1/mlb/odds` — upcoming MLB games with 3Way Result bookmaker odds (H/D/A) */
  async getMLBOdds(): Promise<Record<string, unknown>> {
    return this.get("/v1/mlb/odds");
  }

  // ── NBA (Basketball) ──────────────────────────────────────────────────────

  /** `/v1/nba/livescores` — real-time quarter-by-quarter scores with OT support */
  async getNBALivescores(): Promise<Record<string, unknown>> {
    return this.get("/v1/nba/livescores");
  }

  /** `/v1/nba/daily/d-{offset}` — d-0=today, d-1=yesterday */
  async getNBADaily(offset: number = 1): Promise<Record<string, unknown>> {
    return this.get(`/v1/nba/daily/d-${offset}`);
  }

  /** `/v1/nba/season-schedule` — full-season schedule (upcoming + completed) with q1–q4 scores */
  async getNBASeasonSchedule(): Promise<Record<string, unknown>> {
    return this.get("/v1/nba/season-schedule");
  }

  /** `/v1/nba/standings` — standings by conference and division (W/L, pct, streak, last 10) */
  async getNBAStandings(): Promise<Record<string, unknown>> {
    return this.get("/v1/nba/standings");
  }

  /**
   * `/v1/nba/rosters/{abbr}` — active roster with player bio and base64 team logo.
   * Abbreviations are 2-3 letters (e.g. `"mem"`, `"lal"`, `"bos"`).
   */
  async getNBARosters(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/nba/rosters/${encodeURIComponent(teamAbbr.toLowerCase())}`);
  }

  /**
   * `/v1/nba/team-stats/{abbr}` — per-player stats broken into categories:
   * Game (pts/reb/ast/stl/blk), Shooting (FG%/3P%/FT%).
   */
  async getNBATeamStats(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/nba/team-stats/${encodeURIComponent(teamAbbr.toLowerCase())}`);
  }

  /** `/v1/nba/injuries/{abbr}` — injury and suspension report for a team */
  async getNBAInjuries(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/nba/injuries/${encodeURIComponent(teamAbbr.toLowerCase())}`);
  }

  /**
   * `/v1/nba/odds` — upcoming NBA games with 3Way Result bookmaker odds.
   * Market id "1500" = 3Way Result (Home / Draw / Away decimal prices).
   */
  async getNBAOdds(): Promise<Record<string, unknown>> {
    return this.get("/v1/nba/odds");
  }

  // ── Volleyball ────────────────────────────────────────────────────────────

  /** `/v1/volleyball/livescores` — live set-by-set scores (s1–s5) across all active leagues */
  async getVolleyballLivescores(): Promise<Record<string, unknown>> {
    return this.get("/v1/volleyball/livescores");
  }

  /** `/v1/volleyball/daily/d-{offset}` — d-0=today, d-1=yesterday */
  async getVolleyballDaily(offset: number = 1): Promise<Record<string, unknown>> {
    return this.get(`/v1/volleyball/daily/d-${offset}`);
  }

  /**
   * `/v1/volleyball/standings/{league_id}` — table by pos, W/L, pts, recent form.
   * Use a Statpal league id (e.g. `"4390"` for France Ligue A).
   */
  async getVolleyballStandings(leagueId: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/volleyball/standings/${encodeURIComponent(leagueId)}`);
  }

  /**
   * `/v1/volleyball/season-schedule/{league_id}` — full season organised by week;
   * each week has an array of matches with s1–s5 set scores.
   */
  async getVolleyballSeasonSchedule(leagueId: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/volleyball/season-schedule/${encodeURIComponent(leagueId)}`);
  }

  /**
   * `/v1/volleyball/odds` — upcoming matches with Home/Away moneyline + O/U set
   * totals (line 3.5, 4, …) across all available leagues.
   */
  async getVolleyballOdds(): Promise<Record<string, unknown>> {
    return this.get("/v1/volleyball/odds");
  }

  // ── Football V2 ───────────────────────────────────────────────────────────

  async getFootballLive(): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/matches/live");
  }

  async getFootballOddsLive(): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/odds/live");
  }

  async getFootballDaily(
    offset: number = 0,
  ): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/matches/daily", { offset });
  }

  /** `/v2/soccer/leagues/{id}/odds/prematch` */
  async getFootballPrematchOdds(
    leagueId: string,
  ): Promise<StatpalPrematchOddsResponse> {
    return this.get(
      `/v2/soccer/leagues/${encodeURIComponent(leagueId)}/odds/prematch`,
    );
  }

  /** `/v2/soccer/odds/live/markets` — list of available live market IDs/names */
  async getFootballLiveMarkets(): Promise<StatpalLiveMarket[]> {
    const data = await this.get("/v2/soccer/odds/live/markets");
    return Array.isArray(data) ? (data as StatpalLiveMarket[]) : [];
  }

  /** `/v2/soccer/odds/live/match-states` — list of in-play state IDs/names */
  async getFootballLiveMatchStates(): Promise<StatpalLiveMatchState[]> {
    const data = await this.get("/v2/soccer/odds/live/match-states");
    return Array.isArray(data) ? (data as StatpalLiveMatchState[]) : [];
  }

  /** `/v2/soccer/leagues` */
  async getFootballLeagues(): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/leagues");
  }

  /** `/v2/soccer/leagues/{id}/standings` */
  async getFootballStandings(
    leagueId: string,
  ): Promise<Record<string, unknown>> {
    return this.get(
      `/v2/soccer/leagues/${encodeURIComponent(leagueId)}/standings`,
    );
  }

  /** `/v2/soccer/leagues/{id}/matches` */
  async getFootballLeagueMatches(
    leagueId: string,
  ): Promise<Record<string, unknown>> {
    return this.get(
      `/v2/soccer/leagues/${encodeURIComponent(leagueId)}/matches`,
    );
  }

  /** `/v2/soccer/leagues/{id}/stats` */
  async getFootballLeagueStats(
    leagueId: string,
  ): Promise<Record<string, unknown>> {
    return this.get(
      `/v2/soccer/leagues/${encodeURIComponent(leagueId)}/stats`,
    );
  }

  /** `/v2/soccer/teams/{id}` */
  async getFootballTeam(teamId: string): Promise<Record<string, unknown>> {
    return this.get(`/v2/soccer/teams/${encodeURIComponent(teamId)}`);
  }

  /** `/v2/soccer/players/{id}` */
  async getFootballPlayer(
    playerId: string,
  ): Promise<Record<string, unknown>> {
    return this.get(`/v2/soccer/players/${encodeURIComponent(playerId)}`);
  }

  /** `/v2/soccer/coaches/{id}` */
  async getFootballCoach(coachId: string): Promise<Record<string, unknown>> {
    return this.get(`/v2/soccer/coaches/${encodeURIComponent(coachId)}`);
  }

  /** `/v2/soccer/head-to-head` */
  async getFootballHeadToHead(
    team1Id: string,
    team2Id: string,
  ): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/head-to-head", {
      team1_id: team1Id,
      team2_id: team2Id,
    });
  }

  /** `/v2/soccer/injuries-suspensions` — requires match_id param */
  async getFootballInjuriesSuspensions(
    matchId: string,
  ): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/injuries-suspensions", {
      match_id: matchId,
    });
  }

  /** `/v2/soccer/weather-forecast` — requires match_id param */
  async getFootballWeatherForecast(
    matchId: string,
  ): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/weather-forecast", { match_id: matchId });
  }

  /** `/v2/soccer/predictions` — requires match_id param */
  async getFootballPredictions(
    matchId: string,
  ): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/predictions", { match_id: matchId });
  }

  /** `/v2/soccer/live-storylines` — requires match_id param */
  async getFootballLiveStorylines(
    matchId: string,
  ): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/live-storylines", { match_id: matchId });
  }

  /** `/v2/soccer/team-lineups` — requires match_id param */
  async getFootballTeamLineups(
    matchId: string,
  ): Promise<Record<string, unknown>> {
    return this.get("/v2/soccer/team-lineups", { match_id: matchId });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async get(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<any> {
    if (!this.config.apiKey) {
      throw new Error(`StatpalClient: apiKey not set (path=${path})`);
    }
    const url = this.buildUrl(path, params);
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: this.headers(),
    });
    if (!resp.ok) {
      throw new Error(`StatpalClient HTTP ${resp.status} for ${path}`);
    }
    return resp.json();
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
// Lazily initialised so the module can be imported before env-vars are set.

let _instance: StatpalClient | null = null;

export function getStatpalClient(): StatpalClient {
  if (!_instance) {
    _instance = new StatpalClient({
      apiKey: process.env["STATPAL_API_KEY"] ?? "",
      baseUrl: process.env["STATPAL_BASE_URL"] ?? "https://statpal.io/api",
    });
  }
  return _instance;
}

/** Default singleton export — prefer named `getStatpalClient()` in tests. */
export const statpal = {
  get client(): StatpalClient {
    return getStatpalClient();
  },
  /** Convenience passthrough for the most common call. */
  getPrematchOdds: (leagueId: string) =>
    getStatpalClient().getFootballPrematchOdds(leagueId),
  getLiveMarkets: () => getStatpalClient().getFootballLiveMarkets(),
  getLiveMatchStates: () => getStatpalClient().getFootballLiveMatchStates(),
};

export default statpal;
