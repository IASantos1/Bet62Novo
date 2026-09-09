// GOAL API (api.goal-api.com) — dedicated football data provider. REST auth
// is `Authorization: Bearer <key>` (not an X-API-Key header or apiKey query
// param like PropLine). Every successful response is shaped
// `{ success: true, data, pagination? }`; this client unwraps `data` and
// discards `pagination` (none of our call sites page through more than one
// screen of fixtures/odds today — add pagination support if that changes).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { kvCache } from "../cache/kvCache.js";

export type GoalApiTeamRef = { id?: string; name: string; badge?: string };

export type GoalApiFixture = {
  id: string;
  leagueId?: string;
  leagueName?: string;
  homeTeam: GoalApiTeamRef;
  awayTeam: GoalApiTeamRef;
  // The real payload has no combined "score" string — home/away are
  // separate fields, strings (e.g. "2"), null before kickoff. Confirmed
  // from a real /leagues/:id/fixtures response (2026-09-09).
  homeTeamScore?: string | null;
  awayTeamScore?: string | null;
  // The real field is matchStatus, not status — e.g. "SCHEDULED", "FINISHED",
  // "AFTER_ET" (confirmed from the same real response). matchLive ("0"/"1",
  // a string) accompanies it.
  matchStatus: string;
  matchLive?: string;
  // Formation strings (e.g. "4-2-3-1"), confirmed real on the same response —
  // populated once lineups are known, null/absent before that.
  homeTeamSystem?: string | null;
  awayTeamSystem?: string | null;
  matchDate?: string;
  matchTime?: string;
  /** ISO-8601 UTC instant — the field to use; matchDate/matchTime are
   * compatibility strings with no timezone offset attached (see config.ts's
   * comment on this provider and the doc's own kickoffUtc migration note:
   * before 2026-08-20 these carried Europe/Berlin wall-clock time instead). */
  kickoffUtc?: string;
};

export type GoalApiOddsOutcome = { home?: number; draw?: number; away?: number };

export type GoalApiOdds = {
  id: string;
  fixtureId?: string;
  bookmaker?: string;
  "1x2"?: GoalApiOddsOutcome;
  overUnder?: Record<string, { over?: number; under?: number }>;
  bothTeamsToScore?: { yes?: number; no?: number };
  doubleChance?: { homeOrDraw?: number; awayOrDraw?: number; homeOrAway?: number };
  asianHandicap?: Record<string, { home?: number; away?: number }>;
};

export type GoalApiPrediction = {
  fixtureId: string;
  homeWin?: string;
  draw?: string;
  awayWin?: string;
  bothTeamsToScore?: string;
  over25?: string;
};

export type GoalApiMatchEvent = {
  minute: number;
  team: "home" | "away";
  type: "goal" | "card" | string;
  player: string;
  detail?: string;
};

export type GoalApiSubstitution = {
  minute: number;
  team: "home" | "away";
  playerOut: string;
  playerIn: string;
};

export type GoalApiTeamStats = {
  shotsOnGoal?: number;
  shotsOffGoal?: number;
  possession?: string;
  corners?: number;
  fouls?: number;
};

export type GoalApiFixtureStatistics = {
  home: GoalApiTeamStats;
  away: GoalApiTeamStats;
};

// The /fixtures/:id/lineups response shape is documented to exist but no
// raw example has been captured yet (unlike every other GoalApi* type in
// this file) — fields here are the plausible names, read defensively in
// common.ts's buildGoalApiLineups, and the route that calls this logs the
// raw payload so the mapping can be corrected once a real example is seen.
export type GoalApiLineupPlayerEntry = {
  name?: string;
  playerName?: string;
  shortName?: string;
  number?: string | number;
  shirtNumber?: string | number;
  position?: string;
  pos?: string;
  rating?: string | number;
  // Some football APIs wrap each entry as { player: {...} } instead of
  // flattening the fields — handled defensively since the real shape here
  // is unconfirmed.
  player?: GoalApiLineupPlayerEntry;
};
export type GoalApiLineupTeam = {
  formation?: string;
  startXI?: GoalApiLineupPlayerEntry[];
  starters?: GoalApiLineupPlayerEntry[];
  substitutes?: GoalApiLineupPlayerEntry[];
  bench?: GoalApiLineupPlayerEntry[];
};
export type GoalApiLineups = {
  confirmed?: boolean;
  home?: GoalApiLineupTeam;
  away?: GoalApiLineupTeam;
};

// /leagues/:id/top-scorers — confirmed real (2026-09-09): goals/assists/
// penaltyGoals arrive as numeric strings, same convention as fixture scores.
export type GoalApiTopScorer = {
  playerPlace: string;
  playerName: string;
  teamName: string;
  goals: string;
  assists: string;
  penaltyGoals: string;
};

const GOAL_API_TTL = {
  FIXTURES: 60,
  LIVE: 10,
  ODDS: 120,
  PREDICTIONS: 300,
  STATISTICS: 30,
};

export class GoalApiClient {
  readonly baseUrl: string;

  constructor(private readonly apiKey: string, baseUrl?: string) {
    this.baseUrl = (baseUrl ?? CONFIG.GOAL_API_BASE_URL).replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async rawGet<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
    timeoutMs = 8_000,
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: this.headers(),
    });
    if (!resp.ok) {
      let body = "";
      try {
        body = await resp.text();
      } catch {
        /* ignore */
      }
      throw new Error(`[goal-api] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`);
    }
    const json = (await resp.json()) as { success: boolean; data: T; message?: string };
    if (!json.success) {
      throw new Error(`[goal-api] success:false on ${path}${json.message ? ` — ${json.message}` : ""}`);
    }
    return json.data;
  }

  private async cachedGet<T>(
    path: string,
    params: Record<string, string | number | undefined> | undefined,
    ttlSeconds: number,
  ): Promise<T> {
    const cacheKey = `goalapi:${path}:${JSON.stringify(params ?? {})}`;
    const cached = await kvCache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        /* fall through */
      }
    }
    const data = await this.rawGet<T>(path, params);
    kvCache.set(cacheKey, JSON.stringify(data), ttlSeconds).catch(() => {});
    return data;
  }

  // ── Fixtures ───────────────────────────────────────────────────────────────

  getFixtures(params?: { leagueId?: string; date?: string }): Promise<GoalApiFixture[]> {
    return this.cachedGet<GoalApiFixture[]>("/fixtures", params, GOAL_API_TTL.FIXTURES);
  }

  getLiveFixtures(): Promise<GoalApiFixture[]> {
    // Not cached beyond a very short TTL — this is the live feed.
    return this.cachedGet<GoalApiFixture[]>("/fixtures/live", undefined, GOAL_API_TTL.LIVE);
  }

  getFixturesByDate(date: string): Promise<GoalApiFixture[]> {
    return this.cachedGet<GoalApiFixture[]>(`/fixtures/date/${encodeURIComponent(date)}`, undefined, GOAL_API_TTL.FIXTURES);
  }

  getFixtureById(id: string): Promise<GoalApiFixture> {
    return this.cachedGet<GoalApiFixture>(`/fixtures/${encodeURIComponent(id)}`, undefined, GOAL_API_TTL.LIVE);
  }

  getFixtureEvents(id: string): Promise<GoalApiMatchEvent[]> {
    return this.cachedGet<GoalApiMatchEvent[]>(`/fixtures/${encodeURIComponent(id)}/events`, undefined, GOAL_API_TTL.LIVE);
  }

  getFixtureStatistics(id: string): Promise<GoalApiFixtureStatistics> {
    return this.cachedGet<GoalApiFixtureStatistics>(
      `/fixtures/${encodeURIComponent(id)}/statistics`,
      undefined,
      GOAL_API_TTL.STATISTICS,
    );
  }

  getFixtureSubstitutions(id: string): Promise<GoalApiSubstitution[]> {
    return this.cachedGet<GoalApiSubstitution[]>(
      `/fixtures/${encodeURIComponent(id)}/substitutions`,
      undefined,
      GOAL_API_TTL.LIVE,
    );
  }

  getFixtureLineups(id: string): Promise<GoalApiLineups> {
    return this.cachedGet<GoalApiLineups>(`/fixtures/${encodeURIComponent(id)}/lineups`, undefined, GOAL_API_TTL.LIVE);
  }

  getLeagueTopScorers(leagueId: string): Promise<GoalApiTopScorer[]> {
    return this.cachedGet<GoalApiTopScorer[]>(
      `/leagues/${encodeURIComponent(leagueId)}/top-scorers`,
      undefined,
      GOAL_API_TTL.PREDICTIONS,
    );
  }

  // ── Odds ───────────────────────────────────────────────────────────────────

  getFixtureOdds(id: string): Promise<GoalApiOdds[]> {
    return this.cachedGet<GoalApiOdds[]>(`/fixtures/${encodeURIComponent(id)}/odds`, undefined, GOAL_API_TTL.ODDS);
  }

  /** Live odds — the provider's own docs confirm these refresh only every
   * ~2 minutes even over the WebSocket, so there is no benefit to a shorter
   * cache TTL or a faster poll cadence than CONFIG.GOAL_API_ODDS_POLL_MS. */
  getFixtureLiveOdds(id: string): Promise<GoalApiOdds[]> {
    return this.cachedGet<GoalApiOdds[]>(`/fixtures/${encodeURIComponent(id)}/live-odds`, undefined, GOAL_API_TTL.ODDS);
  }

  getLeagueFixtures(leagueId: string): Promise<GoalApiFixture[]> {
    return this.cachedGet<GoalApiFixture[]>(`/leagues/${encodeURIComponent(leagueId)}/fixtures`, undefined, GOAL_API_TTL.FIXTURES);
  }

  // ── Predictions ──────────────────────────────────────────────────────────

  getFixturePrediction(id: string): Promise<GoalApiPrediction> {
    return this.cachedGet<GoalApiPrediction>(`/fixtures/${encodeURIComponent(id)}/predictions`, undefined, GOAL_API_TTL.PREDICTIONS);
  }

  // ── WebSocket connection token ───────────────────────────────────────────

  /** POST /ws/token — exchanges the API key for a short-lived (60s),
   * single-use connection token so the real API key never appears in a
   * WebSocket URL (browsers can't set custom headers on the WS handshake).
   * Not cached — reusing a cached token would just hand back one already
   * consumed or expired. */
  async requestWsToken(): Promise<{ token: string; expiresIn: number }> {
    const url = this.buildUrl("/ws/token");
    const resp = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: this.headers(),
    });
    if (!resp.ok) {
      throw new Error(`[goal-api] HTTP ${resp.status} on POST /ws/token`);
    }
    const json = (await resp.json()) as { success: boolean; data: { token: string; expiresIn: number } };
    if (!json.success) throw new Error("[goal-api] success:false on POST /ws/token");
    return json.data;
  }
}

let _client: GoalApiClient | null = null;

export function getGoalApiClient(): GoalApiClient {
  if (!_client) {
    if (!CONFIG.GOAL_API_KEY) {
      logger.debug("[goal-api] GOAL_API_KEY not configured — client created but every call will fail");
    }
    _client = new GoalApiClient(CONFIG.GOAL_API_KEY);
  }
  return _client;
}

export const goalApi = {
  getFixtures: (params?: Parameters<GoalApiClient["getFixtures"]>[0]) => getGoalApiClient().getFixtures(params),
  getLiveFixtures: () => getGoalApiClient().getLiveFixtures(),
  getFixturesByDate: (date: string) => getGoalApiClient().getFixturesByDate(date),
  getFixtureById: (id: string) => getGoalApiClient().getFixtureById(id),
  getFixtureEvents: (id: string) => getGoalApiClient().getFixtureEvents(id),
  getFixtureStatistics: (id: string) => getGoalApiClient().getFixtureStatistics(id),
  getFixtureSubstitutions: (id: string) => getGoalApiClient().getFixtureSubstitutions(id),
  getFixtureLineups: (id: string) => getGoalApiClient().getFixtureLineups(id),
  getLeagueTopScorers: (leagueId: string) => getGoalApiClient().getLeagueTopScorers(leagueId),
  getFixtureOdds: (id: string) => getGoalApiClient().getFixtureOdds(id),
  getFixtureLiveOdds: (id: string) => getGoalApiClient().getFixtureLiveOdds(id),
  getLeagueFixtures: (leagueId: string) => getGoalApiClient().getLeagueFixtures(leagueId),
  getFixturePrediction: (id: string) => getGoalApiClient().getFixturePrediction(id),
  requestWsToken: () => getGoalApiClient().requestWsToken(),
};
