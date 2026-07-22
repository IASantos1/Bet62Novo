/**
 * StatpalClient — centralised typed service for all Statpal API calls.
 *
 * Architecture:
 *   StatPal API → StatpalClient (Redis cache) → BET62 API → Frontend
 *
 * Every public method is cached via Redis (with in-memory fallback).
 * TTLs are set per endpoint category using STATPAL_TTL presets.
 *
 * Usage:
 *   import { statpal } from "../services/statpal/index.js";
 *   const live = await statpal.getFootballLive();
 */

import { statpalCache, STATPAL_TTL } from "./cache.js";

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

  /** `/v1/mlb/livescores` */
  async getMLBLivescores(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/mlb/livescores", {}, STATPAL_TTL.LIVE);
  }

  /** `/v1/mlb/daily/d-{offset}` — d-0=today, d-1=yesterday */
  async getMLBDaily(offset: number = 1): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/mlb/daily/d-${offset}`, {}, STATPAL_TTL.FIXTURES);
  }

  /** `/v1/mlb/season-schedule` */
  async getMLBSeasonSchedule(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/mlb/season-schedule", {}, STATPAL_TTL.FIXTURES);
  }

  /** `/v1/mlb/standings` */
  async getMLBStandings(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/mlb/standings", {}, STATPAL_TTL.STANDINGS);
  }

  /** `/v1/mlb/rosters/{abbr}` */
  async getMLBRosters(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/mlb/rosters/${encodeURIComponent(teamAbbr.toLowerCase())}`, {}, STATPAL_TTL.TEAM_STATS);
  }

  /** `/v1/mlb/team-stats/{abbr}` */
  async getMLBTeamStats(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/mlb/team-stats/${encodeURIComponent(teamAbbr.toLowerCase())}`, {}, STATPAL_TTL.TEAM_STATS);
  }

  /** `/v1/mlb/injuries/{abbr}` */
  async getMLBInjuries(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/mlb/injuries/${encodeURIComponent(teamAbbr.toLowerCase())}`, {}, STATPAL_TTL.TEAM_STATS);
  }

  /** `/v1/mlb/league-stats/{category}` */
  async getMLBLeagueStats(category: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/mlb/league-stats/${encodeURIComponent(category)}`, {}, STATPAL_TTL.STANDINGS);
  }

  /** `/v1/mlb/odds` */
  async getMLBOdds(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/mlb/odds", {}, STATPAL_TTL.PREMATCH);
  }

  // ── NBA (Basketball) ──────────────────────────────────────────────────────

  /** `/v1/nba/livescores` */
  async getNBALivescores(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/nba/livescores", {}, STATPAL_TTL.LIVE);
  }

  /** `/v1/nba/daily/d-{offset}` */
  async getNBADaily(offset: number = 1): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/nba/daily/d-${offset}`, {}, STATPAL_TTL.FIXTURES);
  }

  /** `/v1/nba/season-schedule` */
  async getNBASeasonSchedule(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/nba/season-schedule", {}, STATPAL_TTL.FIXTURES);
  }

  /** `/v1/nba/standings` */
  async getNBAStandings(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/nba/standings", {}, STATPAL_TTL.STANDINGS);
  }

  /** `/v1/nba/rosters/{abbr}` */
  async getNBARosters(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/nba/rosters/${encodeURIComponent(teamAbbr.toLowerCase())}`, {}, STATPAL_TTL.TEAM_STATS);
  }

  /** `/v1/nba/team-stats/{abbr}` */
  async getNBATeamStats(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/nba/team-stats/${encodeURIComponent(teamAbbr.toLowerCase())}`, {}, STATPAL_TTL.TEAM_STATS);
  }

  /** `/v1/nba/injuries/{abbr}` */
  async getNBAInjuries(teamAbbr: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/nba/injuries/${encodeURIComponent(teamAbbr.toLowerCase())}`, {}, STATPAL_TTL.TEAM_STATS);
  }

  /** `/v1/nba/odds` */
  async getNBAOdds(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/nba/odds", {}, STATPAL_TTL.PREMATCH);
  }

  // ── Volleyball ────────────────────────────────────────────────────────────

  /** `/v1/volleyball/livescores` */
  async getVolleyballLivescores(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/volleyball/livescores", {}, STATPAL_TTL.LIVE);
  }

  /** `/v1/volleyball/daily/d-{offset}` */
  async getVolleyballDaily(offset: number = 1): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/volleyball/daily/d-${offset}`, {}, STATPAL_TTL.FIXTURES);
  }

  /** `/v1/volleyball/standings/{league_id}` */
  async getVolleyballStandings(leagueId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/volleyball/standings/${encodeURIComponent(leagueId)}`, {}, STATPAL_TTL.STANDINGS);
  }

  /** `/v1/volleyball/season-schedule/{league_id}` */
  async getVolleyballSeasonSchedule(leagueId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v1/volleyball/season-schedule/${encodeURIComponent(leagueId)}`, {}, STATPAL_TTL.FIXTURES);
  }

  /** `/v1/volleyball/odds` */
  async getVolleyballOdds(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v1/volleyball/odds", {}, STATPAL_TTL.PREMATCH);
  }

  // ── Football V2 — Live ────────────────────────────────────────────────────

  /** `/v2/soccer/matches/live` — Live Stats */
  async getFootballLive(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/matches/live", {}, STATPAL_TTL.LIVE);
  }

  /** `/v2/soccer/odds/live` — Live odds */
  async getFootballOddsLive(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/odds/live", {}, STATPAL_TTL.LIVE);
  }

  /** `/v2/soccer/odds/live/markets` */
  async getFootballLiveMarkets(): Promise<StatpalLiveMarket[]> {
    const data = await this.cachedGet("/v2/soccer/odds/live/markets", {}, STATPAL_TTL.PREMATCH);
    return Array.isArray(data) ? (data as StatpalLiveMarket[]) : [];
  }

  /** `/v2/soccer/odds/live/match-states` */
  async getFootballLiveMatchStates(): Promise<StatpalLiveMatchState[]> {
    const data = await this.cachedGet("/v2/soccer/odds/live/match-states", {}, STATPAL_TTL.PREMATCH);
    return Array.isArray(data) ? (data as StatpalLiveMatchState[]) : [];
  }

  // ── Football V2 — Fixtures ────────────────────────────────────────────────

  /** `/v2/soccer/matches/daily` — Fixtures */
  async getFootballDaily(offset: number = 0): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/matches/daily", { offset }, STATPAL_TTL.FIXTURES);
  }

  /** `/v2/soccer/leagues` */
  async getFootballLeagues(): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/leagues", {}, STATPAL_TTL.STANDINGS);
  }

  /** `/v2/soccer/leagues/{id}/matches` — Fixtures per league */
  async getFootballLeagueMatches(leagueId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v2/soccer/leagues/${encodeURIComponent(leagueId)}/matches`, {}, STATPAL_TTL.FIXTURES);
  }

  /** `/v2/soccer/leagues/{id}/odds/prematch` */
  async getFootballPrematchOdds(leagueId: string): Promise<StatpalPrematchOddsResponse> {
    return this.cachedGet(
      `/v2/soccer/leagues/${encodeURIComponent(leagueId)}/odds/prematch`,
      {},
      STATPAL_TTL.PREMATCH,
    );
  }

  // ── Football V2 — Events & Live Stats ────────────────────────────────────

  /**
   * `/v2/soccer/match/{id}/statistics` — Live Stats + Events (goals, cards).
   * Called per-match; short TTL since it updates every ~30s during a game.
   */
  async getFootballMatchStats(matchId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v2/soccer/match/${encodeURIComponent(matchId)}/statistics`, {}, STATPAL_TTL.EVENTS);
  }

  /** `/v2/soccer/live-storylines` — AI narrative for a live match */
  async getFootballLiveStorylines(matchId: string): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/live-storylines", { match_id: matchId }, STATPAL_TTL.EVENTS);
  }

  // ── Football V2 — Lineups ─────────────────────────────────────────────────

  /**
   * `/v2/soccer/team-lineups` — Starting XI + bench + formation.
   * Set at kickoff; stable for the rest of the match (only subs change).
   */
  async getFootballLineups(matchId: string): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/team-lineups", { match_id: matchId }, STATPAL_TTL.LINEUPS);
  }

  /** `/v2/soccer/injuries-suspensions` — pre-match injury/suspension report */
  async getFootballInjuriesSuspensions(matchId: string): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/injuries-suspensions", { match_id: matchId }, STATPAL_TTL.LINEUPS);
  }

  // ── Football V2 — H2H ─────────────────────────────────────────────────────

  /**
   * `/v2/soccer/head-to-head` — Historical head-to-head record.
   * Fully static once populated; 1-hour TTL.
   */
  async getFootballHeadToHead(team1Id: string, team2Id: string): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/head-to-head", { team1_id: team1Id, team2_id: team2Id }, STATPAL_TTL.H2H);
  }

  // ── Football V2 — Team Stats ──────────────────────────────────────────────

  /** `/v2/soccer/teams/{id}` — Team profile + season stats */
  async getFootballTeam(teamId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v2/soccer/teams/${encodeURIComponent(teamId)}`, {}, STATPAL_TTL.TEAM_STATS);
  }

  /** `/v2/soccer/leagues/{id}/stats` — League-wide team stats */
  async getFootballLeagueStats(leagueId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v2/soccer/leagues/${encodeURIComponent(leagueId)}/stats`, {}, STATPAL_TTL.TEAM_STATS);
  }

  // ── Football V2 — Player Stats ────────────────────────────────────────────

  /** `/v2/soccer/players/{id}` — Player profile + season stats */
  async getFootballPlayer(playerId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v2/soccer/players/${encodeURIComponent(playerId)}`, {}, STATPAL_TTL.PLAYER_STATS);
  }

  /** `/v2/soccer/coaches/{id}` */
  async getFootballCoach(coachId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v2/soccer/coaches/${encodeURIComponent(coachId)}`, {}, STATPAL_TTL.PLAYER_STATS);
  }

  // ── Football V2 — Standings ───────────────────────────────────────────────

  /** `/v2/soccer/leagues/{id}/standings` — League table */
  async getFootballStandings(leagueId: string): Promise<Record<string, unknown>> {
    return this.cachedGet(`/v2/soccer/leagues/${encodeURIComponent(leagueId)}/standings`, {}, STATPAL_TTL.STANDINGS);
  }

  // ── Football V2 — Other ───────────────────────────────────────────────────

  /** `/v2/soccer/predictions` */
  async getFootballPredictions(matchId: string): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/predictions", { match_id: matchId }, STATPAL_TTL.PREMATCH);
  }

  /** `/v2/soccer/weather-forecast` */
  async getFootballWeatherForecast(matchId: string): Promise<Record<string, unknown>> {
    return this.cachedGet("/v2/soccer/weather-forecast", { match_id: matchId }, STATPAL_TTL.PREMATCH);
  }

  // ── Cache-aware fetch ─────────────────────────────────────────────────────

  /**
   * Fetch with Redis (or in-memory) caching.
   * Cache key: `statpal:{path}:{sorted-params-json}`
   */
  async cachedGet(
    path: string,
    params: Record<string, string | number | undefined> = {},
    ttlSeconds: number,
  ): Promise<any> {
    if (!this.config.apiKey) {
      throw new Error(`StatpalClient: apiKey not set (path=${path})`);
    }

    // Build a stable cache key from path + sorted params (excluding access_key)
    const paramStr = Object.entries(params)
      .filter(([, v]) => v != null && v !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const cacheKey = `statpal:${path}${paramStr ? `:${paramStr}` : ""}`;

    // Cache hit?
    const cached = await statpalCache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // corrupted entry — fall through to fetch
      }
    }

    // Cache miss — fetch from API
    const data = await this.rawGet(path, params);

    // Store in cache (don't await — fire-and-forget)
    statpalCache.set(cacheKey, JSON.stringify(data), ttlSeconds).catch(() => {});

    return data;
  }

  /** Bypass cache — direct API call. Use for one-off debug checks. */
  async rawGet(
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

  /** @deprecated Use rawGet() for uncached calls. */
  private async get(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<any> {
    return this.rawGet(path, params);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

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

/** Default singleton export. */
export const statpal = {
  get client(): StatpalClient {
    return getStatpalClient();
  },
  // ── Fixtures ──
  getFootballDaily:        (offset?: number)                  => getStatpalClient().getFootballDaily(offset),
  getFootballLeagueMatches:(leagueId: string)                 => getStatpalClient().getFootballLeagueMatches(leagueId),
  // ── Live Stats ──
  getFootballLive:         ()                                  => getStatpalClient().getFootballLive(),
  getFootballOddsLive:     ()                                  => getStatpalClient().getFootballOddsLive(),
  // ── Events + Live Stats per match ──
  getFootballMatchStats:   (matchId: string)                  => getStatpalClient().getFootballMatchStats(matchId),
  getFootballLiveStorylines:(matchId: string)                 => getStatpalClient().getFootballLiveStorylines(matchId),
  // ── Lineups ──
  getFootballLineups:      (matchId: string)                  => getStatpalClient().getFootballLineups(matchId),
  getFootballInjuries:     (matchId: string)                  => getStatpalClient().getFootballInjuriesSuspensions(matchId),
  // ── H2H ──
  getFootballH2H:          (team1Id: string, team2Id: string) => getStatpalClient().getFootballHeadToHead(team1Id, team2Id),
  // ── Team Stats ──
  getFootballTeam:         (teamId: string)                   => getStatpalClient().getFootballTeam(teamId),
  getFootballLeagueStats:  (leagueId: string)                 => getStatpalClient().getFootballLeagueStats(leagueId),
  // ── Player Stats ──
  getFootballPlayer:       (playerId: string)                 => getStatpalClient().getFootballPlayer(playerId),
  getFootballCoach:        (coachId: string)                  => getStatpalClient().getFootballCoach(coachId),
  // ── Standings ──
  getFootballStandings:    (leagueId: string)                 => getStatpalClient().getFootballStandings(leagueId),
  getFootballLeagues:      ()                                  => getStatpalClient().getFootballLeagues(),
  // ── Prematch ──
  getPrematchOdds:         (leagueId: string)                 => getStatpalClient().getFootballPrematchOdds(leagueId),
  getFootballPredictions:  (matchId: string)                  => getStatpalClient().getFootballPredictions(matchId),
  // ── Legacy passthrough ──
  getLiveMarkets:      () => getStatpalClient().getFootballLiveMarkets(),
  getLiveMatchStates:  () => getStatpalClient().getFootballLiveMatchStates(),
};

export default statpal;
