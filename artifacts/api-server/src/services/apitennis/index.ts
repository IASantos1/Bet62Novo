// api-tennis.com — dedicated tennis data provider. Auth is an `APIkey` QUERY
// PARAM (not an Authorization header like GOAL API), and every operation is
// dispatched through one endpoint with a `method=` selector rather than
// separate REST paths. Every successful response is shaped
// `{ success: 1, result }` — this client unwraps `result` (NOT `data`, unlike
// GOAL API's client). Confirmed against the provider's own documentation
// pasted 2026-09-09.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { kvCache } from "../cache/kvCache.js";

/** One /get_fixtures or /get_livescore entry — the same canonical match DTO
 * for both endpoints, confirmed real in the provider's docs. pointbypoint/
 * scores/statistics are embedded inline (empty arrays until available) —
 * no separate per-match call is needed for set scores or player stats. */
export type ApiTennisMatch = {
  event_key: string;
  event_date: string;
  event_time: string;
  event_first_player: string;
  first_player_key: string;
  event_second_player: string;
  second_player_key: string;
  event_final_result: string;
  event_game_result: string;
  event_serve: string | null;
  event_winner: string | null;
  event_status: string;
  event_type_type: string;
  tournament_name: string;
  tournament_key: string;
  tournament_round: string;
  tournament_season: string;
  event_live: string;
  event_qualification?: string;
  event_first_player_logo: string | null;
  event_second_player_logo: string | null;
  pointbypoint: unknown[];
  scores: Array<{ score_first: string; score_second: string; score_set: string }>;
  statistics: Array<{
    player_key: string;
    stat_period: string;
    stat_type: string;
    stat_name: string;
    stat_value: string;
    stat_won: number | null;
    stat_total: number | null;
  }>;
};

/** /get_odds's result is keyed by match_key, each value a market-name ->
 * outcome-name -> bookmaker -> price map. Only "Home/Away" is consumed
 * today (see extractApiTennisMoneyline) — the rest (Correct Score 1st Half,
 * Set Betting, Win In Straight Sets, ...) are read verbatim if a future
 * pass wires them, never guessed. */
export type ApiTennisOddsMarket = Record<string, Record<string, string>>;
export type ApiTennisOddsResult = Record<string, Record<string, ApiTennisOddsMarket>>;

/** /get_live_odds's shape is NOT the same as /get_odds — flat live_odds[]
 * entries per event, each with its own suspended flag, confirmed real in
 * the provider's docs. */
export type ApiTennisLiveOddsEntry = {
  odd_name: string;
  suspended: "Yes" | "No" | string;
  type: string;
  value: string;
  handicap: string | null;
  upd: string;
};
export type ApiTennisLiveOddsEvent = {
  event_key: number | string;
  event_date: string;
  event_time: string;
  first_player_key: number | string;
  second_player_key: number | string;
  event_game_result: string;
  event_serve: string | null;
  event_winner: string | null;
  event_status: string;
  event_type_type: string;
  tournament_name: string;
  tournament_key: number | string;
  tournament_round: string;
  tournament_season: string;
  event_live: string;
  live_odds: ApiTennisLiveOddsEntry[];
};
export type ApiTennisLiveOddsResult = Record<string, ApiTennisLiveOddsEvent>;

export type ApiTennisH2HResult = {
  H2H: ApiTennisMatch[];
  firstPlayerResults: ApiTennisMatch[];
  secondPlayerResults: ApiTennisMatch[];
};

export type ApiTennisStanding = {
  place: string;
  player: string;
  player_key: string;
  league: string;
  movement: string;
  country: string;
  points: string;
};

export type ApiTennisPlayer = {
  player_key: string;
  player_name: string;
  player_country: string;
  player_bday: string;
  player_logo: string | null;
  stats: Array<{
    season: string;
    type: string;
    rank: string;
    titles: string;
    matches_won: string;
    matches_lost: string;
    hard_won: string;
    hard_lost: string;
    clay_won: string;
    clay_lost: string;
    grass_won: string;
    grass_lost: string;
  }>;
};

export type ApiTennisEventType = { event_type_key: string; event_type_type: string };
export type ApiTennisTournament = {
  tournament_key: string;
  tournament_name: string;
  event_type_key: string;
  event_type_type: string;
};

const API_TENNIS_TTL = {
  FIXTURES: 60,
  LIVE: 10,
  ODDS: 60,
  REFERENCE: 3600, // events/tournaments/standings/players change rarely
};

export class ApiTennisClient {
  readonly baseUrl: string;

  constructor(private readonly apiKey: string, baseUrl?: string) {
    this.baseUrl = baseUrl ?? CONFIG.TENNIS_API_BASE_URL;
  }

  private buildUrl(method: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl);
    url.searchParams.set("method", method);
    url.searchParams.set("APIkey", this.apiKey);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async rawGet<T>(
    method: string,
    params?: Record<string, string | number | undefined>,
    timeoutMs = 8_000,
  ): Promise<T> {
    const url = this.buildUrl(method, params);
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) {
      let body = "";
      try {
        body = await resp.text();
      } catch {
        /* ignore */
      }
      throw new Error(`[api-tennis] HTTP ${resp.status} on ${method}${body ? ` — ${body.slice(0, 300)}` : ""}`);
    }
    const json = (await resp.json()) as { success: number; result: T; error?: string };
    if (!json.success) {
      throw new Error(`[api-tennis] success:0 on ${method}${json.error ? ` — ${json.error}` : ""}`);
    }
    return json.result;
  }

  private async cachedGet<T>(
    method: string,
    params: Record<string, string | number | undefined> | undefined,
    ttlSeconds: number,
  ): Promise<T> {
    const cacheKey = `apitennis:${method}:${JSON.stringify(params ?? {})}`;
    const cached = await kvCache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        /* fall through */
      }
    }
    const data = await this.rawGet<T>(method, params);
    kvCache.set(cacheKey, JSON.stringify(data), ttlSeconds).catch(() => {});
    return data;
  }

  getEvents(): Promise<ApiTennisEventType[]> {
    return this.cachedGet<ApiTennisEventType[]>("get_events", undefined, API_TENNIS_TTL.REFERENCE);
  }

  getTournaments(): Promise<ApiTennisTournament[]> {
    return this.cachedGet<ApiTennisTournament[]>("get_tournaments", undefined, API_TENNIS_TTL.REFERENCE);
  }

  getFixtures(params: {
    date_start: string;
    date_stop: string;
    event_type_key?: string;
    tournament_key?: string;
    tournament_season?: string;
    match_key?: string;
    player_key?: string;
    timezone?: string;
  }): Promise<ApiTennisMatch[]> {
    return this.cachedGet<ApiTennisMatch[]>("get_fixtures", params, API_TENNIS_TTL.FIXTURES);
  }

  getLivescore(params?: {
    event_type_key?: string;
    tournament_key?: string;
    match_key?: string;
    player_key?: string;
    timezone?: string;
  }): Promise<ApiTennisMatch[]> {
    return this.cachedGet<ApiTennisMatch[]>("get_livescore", params, API_TENNIS_TTL.LIVE);
  }

  getH2H(firstPlayerKey: string, secondPlayerKey: string): Promise<ApiTennisH2HResult> {
    return this.cachedGet<ApiTennisH2HResult>(
      "get_H2H",
      { first_player_key: firstPlayerKey, second_player_key: secondPlayerKey },
      API_TENNIS_TTL.FIXTURES,
    );
  }

  getStandings(eventType: "ATP" | "WTA"): Promise<ApiTennisStanding[]> {
    return this.cachedGet<ApiTennisStanding[]>("get_standings", { event_type: eventType }, API_TENNIS_TTL.REFERENCE);
  }

  getPlayers(params?: { player_key?: string; tournament_key?: string }): Promise<ApiTennisPlayer[]> {
    return this.cachedGet<ApiTennisPlayer[]>("get_players", params, API_TENNIS_TTL.REFERENCE);
  }

  getOdds(params: {
    date_start?: string;
    date_stop?: string;
    event_type_key?: string;
    tournament_key?: string;
    match_key?: string;
  }): Promise<ApiTennisOddsResult> {
    return this.cachedGet<ApiTennisOddsResult>("get_odds", params, API_TENNIS_TTL.ODDS);
  }

  getLiveOdds(params?: {
    event_type_key?: string;
    tournament_key?: string;
    match_key?: string;
    player_key?: string;
    timezone?: string;
  }): Promise<ApiTennisLiveOddsResult> {
    return this.cachedGet<ApiTennisLiveOddsResult>("get_live_odds", params, API_TENNIS_TTL.LIVE);
  }
}

let _client: ApiTennisClient | null = null;

export function getApiTennisClient(): ApiTennisClient {
  if (!_client) {
    if (!CONFIG.TENNIS_API_KEY) {
      logger.debug("[api-tennis] TENNIS_API_KEY not configured — client created but every call will fail");
    }
    _client = new ApiTennisClient(CONFIG.TENNIS_API_KEY);
  }
  return _client;
}

export const apiTennis = {
  getEvents: () => getApiTennisClient().getEvents(),
  getTournaments: () => getApiTennisClient().getTournaments(),
  getFixtures: (params: Parameters<ApiTennisClient["getFixtures"]>[0]) => getApiTennisClient().getFixtures(params),
  getLivescore: (params?: Parameters<ApiTennisClient["getLivescore"]>[0]) => getApiTennisClient().getLivescore(params),
  getH2H: (firstPlayerKey: string, secondPlayerKey: string) => getApiTennisClient().getH2H(firstPlayerKey, secondPlayerKey),
  getStandings: (eventType: "ATP" | "WTA") => getApiTennisClient().getStandings(eventType),
  getPlayers: (params?: Parameters<ApiTennisClient["getPlayers"]>[0]) => getApiTennisClient().getPlayers(params),
  getOdds: (params: Parameters<ApiTennisClient["getOdds"]>[0]) => getApiTennisClient().getOdds(params),
  getLiveOdds: (params?: Parameters<ApiTennisClient["getLiveOdds"]>[0]) => getApiTennisClient().getLiveOdds(params),
};
