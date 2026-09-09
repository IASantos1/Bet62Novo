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
  /** Confirmed real on a full /fixtures/:id response pasted this session
   * (e.g. matchReferee: "Joseph Dickerson, USA") — both null far more
   * often than populated, and matchStadium hasn't been observed non-null
   * yet at all. */
  matchStadium?: string | null;
  matchReferee?: string | null;
  /** Confirmed real on /results, /results/today and /results/yesterday
   * (2026-09-09) — e.g. "Final", "Quarter-finals", or a plain matchday
   * number as a string ("5"). Null for competitions without rounds. */
  matchRound?: string | null;
};

/** One bookmaker's odds entry on /fixtures/:id/odds and /:id/live-odds —
 * confirmed real via a raw response pasted 2026-09-09, and flat: every
 * price is a top-level numeric-string field, not the nested
 * {home,draw,away}/{over,under} objects this client originally (and
 * wrongly, never checked against a real response) assumed. overUnder and
 * asianHandicap are themselves flat string->string maps keyed by market
 * line (e.g. "o+2.5"/"u+2.5", "ah0_1"/"ah-1_2"/"ah+0.5_1"), not one entry
 * per line with nested outcome fields. */
export type GoalApiOdds = {
  id: string;
  matchApiId?: string;
  fixtureId?: string;
  bookmaker?: string;
  oddDate?: string;
  odd1?: string | null;
  oddX?: string | null;
  odd2?: string | null;
  odd1x?: string | null;
  odd12?: string | null;
  oddX2?: string | null;
  btsYes?: string | null;
  btsNo?: string | null;
  asianHandicap?: Record<string, string> | null;
  overUnder?: Record<string, string> | null;
  createdAt?: string;
  updatedAt?: string;
};

/** /fixtures/:id/predictions — confirmed real 2026-09-09, wired into the
 * "Previsão" card via buildGoalApiPrediction (services/goalapi/common.ts).
 * All prob* fields are 0-100 percentage strings, not decimal odds —
 * completely different field names/units than this client originally
 * (and, at the time, harmlessly) assumed. */
export type GoalApiPrediction = {
  fixtureId: string;
  matchStatus?: string;
  probHW?: string;
  probD?: string;
  probAW?: string;
  probHWD?: string;
  probAWD?: string;
  probHWAW?: string;
  probO?: string;
  probU?: string;
  probO1?: string;
  probU1?: string;
  probO3?: string;
  probU3?: string;
  probBts?: string;
  probOts?: string;
  asianHandicap?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
};

/** /fixtures/:id/events's real item shape — confirmed via the same
 * "events" array embedded per-fixture on /fixtures/live (raw response
 * pasted 2026-09-09); the canonical Event DTO this provider reuses
 * everywhere, same pattern as its canonical Fixture DTO. This replaces an
 * earlier, wrong assumption ({minute,team,type,player,detail}) that was
 * never checked against a real response. "time" is a string ("3", "45+2"
 * for stoppage time); side is which of homeScorer/awayScorer is set (only
 * "GOAL" events have been observed so far, so other types may carry
 * different populated fields). */
export type GoalApiMatchEvent = {
  id?: string;
  fixtureId?: string;
  time: string;
  /** Numeric form of "time" — confirmed present on /fixtures/:id/events's
   * dedicated-endpoint response (2026-09-09) but not observed on the
   * embedded "events" array under /fixtures/live, so read defensively. */
  timeNum?: number;
  type: string;
  homeScorer?: string | null;
  homeScorerId?: string | null;
  homeAssist?: string | null;
  homeAssistId?: string | null;
  awayScorer?: string | null;
  awayScorerId?: string | null;
  awayAssist?: string | null;
  awayAssistId?: string | null;
  score?: string;
  info?: string | null;
  scoreInfoTime?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type GoalApiSubstitution = {
  minute: number;
  team: "home" | "away";
  playerOut: string;
  playerIn: string;
};

/** One row of /fixtures/:id/statistics's match.fullTime/firstHalf/
 * secondHalf arrays — confirmed real 2026-09-09: a generic, provider-
 * labelled {type,home,away} triple (home/away are numeric or "NN%"
 * strings), not the fixed named fields ({shotsOnGoal,possession,corners,
 * fouls}) this client originally assumed without ever checking a real
 * response. */
export type GoalApiMatchStatRow = { type: string; home: string; away: string };

export type GoalApiFixtureStatistics = {
  match: {
    fullTime: GoalApiMatchStatRow[];
    firstHalf?: GoalApiMatchStatRow[];
    secondHalf?: GoalApiMatchStatRow[];
  };
  hasStatistics?: boolean;
};

/** One row of /fixtures/:id/lineups's home/away.startingLineups/
 * substitutes/coach arrays — the same flat entry is also embedded
 * directly on /fixtures/:id's own "lineups" array. Confirmed real
 * 2026-09-09 for "type":"coach"; starting/substitute player entries
 * weren't populated in the confirmed sample (an unstarted fixture) but
 * are assumed to share this exact flat shape with type
 * "starting"/"substitute" and populated lineupNumber/lineupPosition —
 * consistent with every other GOAL API resource in this file reusing one
 * canonical DTO across its embedded and dedicated-endpoint forms. */
export type GoalApiLineupEntry = {
  id?: string;
  fixtureId?: string;
  playerId?: string | null;
  playerKey?: string | null;
  lineupPlayer: string;
  lineupNumber?: string | number | null;
  lineupPosition?: string | null;
  team: "home" | "away";
  type: string;
  createdAt?: string;
  updatedAt?: string;
};
export type GoalApiLineupTeam = {
  startingLineups: GoalApiLineupEntry[];
  substitutes: GoalApiLineupEntry[];
  coach: GoalApiLineupEntry[];
  missingPlayers?: GoalApiLineupEntry[];
};
export type GoalApiLineups = {
  home: GoalApiLineupTeam;
  away: GoalApiLineupTeam;
  homeFormation?: string | null;
  awayFormation?: string | null;
  hasLineups?: boolean;
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

/** One row of /standings/:leagueId (and /standings/:leagueId/team/:teamId,
 * /standings/:leagueId/home, /standings/:leagueId/away) — confirmed real
 * 2026-09-09. All numeric fields are strings, same convention as every
 * other GOAL API resource in this file. overallLeague-, homeLeague- and
 * awayLeague-prefixed fields are pre-computed splits; leagueRound carries a
 * group/conference/division name when the league has one (e.g. MLS's
 * "Eastern Conference"/"Western Conference"), in which case the same
 * position repeats once per group in the flat array. */
export type GoalApiStanding = {
  id?: string;
  leagueId?: string;
  teamId: string;
  teamName: string;
  leagueRound?: string | null;
  stageName?: string | null;
  season?: string | null;
  overallPromotion?: string | null;
  overallLeaguePosition: string;
  overallLeaguePlayed: string;
  overallLeagueW: string;
  overallLeagueD: string;
  overallLeagueL: string;
  overallLeagueGF: string;
  overallLeagueGA: string;
  overallLeaguePTS: string;
  homeLeaguePosition?: string;
  homeLeaguePlayed?: string;
  homeLeagueW?: string;
  homeLeagueD?: string;
  homeLeagueL?: string;
  homeLeagueGF?: string;
  homeLeagueGA?: string;
  homeLeaguePTS?: string;
  awayLeaguePosition?: string;
  awayLeaguePlayed?: string;
  awayLeagueW?: string;
  awayLeagueD?: string;
  awayLeagueL?: string;
  awayLeagueGF?: string;
  awayLeagueGA?: string;
  awayLeaguePTS?: string;
  team?: { id: string; name: string; badge?: string | null; country?: string };
  league?: { id: string; name: string; season?: string | null };
};

/** /standings/:leagueId/zones — confirmed real 2026-09-09. Each zone array
 * holds the same GoalApiStanding rows as the main endpoint, just bucketed;
 * summary is a redundant per-zone team count. */
export type GoalApiStandingZones = {
  leagueId: string;
  zones: {
    promotion: GoalApiStanding[];
    europeanQualification: GoalApiStanding[];
    safe: GoalApiStanding[];
    relegationPlayoff: GoalApiStanding[];
    relegation: GoalApiStanding[];
  };
  summary?: {
    totalTeams: number;
    promotionZone: number;
    europeanZone: number;
    safeZone: number;
    relegationPlayoffZone: number;
    relegationZone: number;
  };
};

/** /players/:id — confirmed real 2026-09-09. Most stat fields (goals,
 * assists, cards, etc.) are numeric strings when populated but null for
 * most players — the provider only tracks per-player stats for a subset
 * of competitions. "country" (nationality) is null far more often than
 * populated in practice. */
export type GoalApiPlayer = {
  id: string;
  apiId?: string;
  name: string;
  image?: string | null;
  number?: string | null;
  country?: string | null;
  type?: string | null;
  age?: string | null;
  birthdate?: string | null;
  teamId?: string | null;
  isActive?: boolean;
  injured?: string | null;
  isCaptain?: boolean;
  team?: { id: string; name: string; badge?: string | null; country?: string };
};

/** /players/:id/statistics — confirmed real 2026-09-09. "basic" duplicates
 * fields already on GoalApiPlayer but substitutes the string "N/A" for
 * missing values instead of null, so buildGoalApiPlayerProfile reads
 * identity/team fields from GoalApiPlayer instead and only uses this for
 * "performance". recentMatches has never been observed non-empty in a
 * real response — its item shape is unconfirmed. */
export type GoalApiPlayerStatistics = {
  basic?: Record<string, unknown>;
  performance?: {
    matchPlayed?: number;
    minutes?: number;
    rating?: string;
    goals?: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
    substituteOut?: number;
    substitutesOnBench?: number;
    minutesPerMatch?: number | null;
  };
  attacking?: Record<string, unknown>;
  defending?: Record<string, unknown>;
  passing?: Record<string, unknown>;
  duels?: Record<string, unknown>;
  goalkeeper?: unknown;
  recentMatches?: unknown[];
};

/** One entry of /teams/:id/results's recentFixtures — result/score are
 * already resolved server-side (score is literal "home-away", result is
 * W/D/L from the queried team's perspective); confirmed real via a raw
 * response pasted 2026-09-09. */
export type GoalApiTeamResultFixture = {
  id: string;
  date?: string;
  opponent: string;
  opponentBadge?: string | null;
  score: string;
  isHome: boolean;
  result: "W" | "D" | "L";
  league?: string;
};

/** /teams/:id/results's actual "data" shape — a single aggregate object,
 * NOT a flat fixture array (that was this client's original, wrong,
 * assumption). overall/home/away are W/D/L + goals aggregates; only
 * recentFixtures is consumed today. */
export type GoalApiTeamResults = {
  overall?: unknown;
  home?: unknown;
  away?: unknown;
  form?: string;
  recentFixtures: GoalApiTeamResultFixture[];
  totalMatches?: number;
  season?: string;
};

/** /results/stats's actual "data" shape — confirmed real 2026-09-09.
 * Aggregate trends the provider computes server-side over its own result
 * set (not date-scoped by this client). scoreDistribution is a
 * huge string-keyed map ("2-1": 85, ...) not consumed here — only the
 * headline percentages/counts the UI actually renders. */
export type GoalApiResultsStats = {
  totalMatches: number;
  totalGoals: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  averageGoals: number;
  averageHomeGoals: number;
  averageAwayGoals: number;
  bttsCount?: number;
  bttsPercentage?: number;
  over25Count?: number;
  over25Percentage?: number;
  over35Count?: number;
  over35Percentage?: number;
  cleanSheets?: { home: number; away: number };
  homeWinPercentage?: number;
  awayWinPercentage?: number;
  drawPercentage?: number;
  mostGoalsInMatch?: number;
  highestScoringMatch?: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    score: string;
    date: string;
  } | null;
  mostCommonScore?: { score: string; count: number; percentage: number } | null;
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

  /** /standings/:leagueId — confirmed real 2026-09-09: one flat array, one
   * row per team, with separate overall/home/away splits already computed
   * server-side (overallLeague-, homeLeague- and awayLeague-prefixed
   * fields, all numeric strings). A league with conferences/groups (e.g.
   * MLS) repeats each
   * position once per group — "leagueRound" carries the group name
   * ("Eastern Conference"/"Western Conference") to split on. */
  getLeagueStandings(leagueId: string): Promise<GoalApiStanding[]> {
    return this.cachedGet<GoalApiStanding[]>(`/standings/${encodeURIComponent(leagueId)}`, undefined, GOAL_API_TTL.FIXTURES);
  }

  /** /standings/:leagueId/zones — confirmed real 2026-09-09: the same
   * canonical standing row (see GoalApiStanding) bucketed into
   * promotion/europeanQualification/safe/relegationPlayoff/relegation
   * arrays. A league without a real promotion/relegation structure (e.g.
   * MLS, a closed franchise league) puts every team in "safe" — this is a
   * real, meaningful result from the provider, not a failure. */
  getLeagueStandingsZones(leagueId: string): Promise<GoalApiStandingZones> {
    return this.cachedGet<GoalApiStandingZones>(`/standings/${encodeURIComponent(leagueId)}/zones`, undefined, GOAL_API_TTL.FIXTURES);
  }

  /** /teams/:id/upcoming — same canonical fixture DTO confirmed real across
   * /fixtures, /leagues/:id/fixtures and /teams/:id/fixtures, pre-filtered
   * to that team's future matches. */
  getTeamUpcoming(teamId: string): Promise<GoalApiFixture[]> {
    return this.cachedGet<GoalApiFixture[]>(`/teams/${encodeURIComponent(teamId)}/upcoming`, undefined, GOAL_API_TTL.FIXTURES);
  }

  /** /teams/:id/results — confirmed real (raw response pasted 2026-09-09).
   * "data" is a single aggregate object ({overall,home,away,form,
   * recentFixtures,totalMatches,season}), NOT a flat fixture array — an
   * earlier pass of this client wrongly assumed the latter before a fuller
   * raw response surfaced the real shape. Only recentFixtures is consumed
   * (see buildGoalApiForm). */
  getTeamResults(teamId: string): Promise<GoalApiTeamResults> {
    return this.cachedGet<GoalApiTeamResults>(`/teams/${encodeURIComponent(teamId)}/results`, undefined, GOAL_API_TTL.FIXTURES);
  }

  // ── Results ──────────────────────────────────────────────────────────────

  /** /results/today and /results/yesterday — confirmed real 2026-09-09.
   * The envelope carries {success, date, data, count, source}; cachedGet
   * keeps only `data` (a flat array of the same canonical fixture DTO used
   * elsewhere across this client), which is all the results feed needs. */
  getResultsToday(): Promise<GoalApiFixture[]> {
    return this.cachedGet<GoalApiFixture[]>("/results/today", undefined, GOAL_API_TTL.FIXTURES);
  }

  getResultsYesterday(): Promise<GoalApiFixture[]> {
    return this.cachedGet<GoalApiFixture[]>("/results/yesterday", undefined, GOAL_API_TTL.FIXTURES);
  }

  /** /results/stats — confirmed real 2026-09-09. Aggregate trends, not
   * scoped to a specific date by this client. */
  getResultsStats(): Promise<GoalApiResultsStats> {
    return this.cachedGet<GoalApiResultsStats>("/results/stats", undefined, GOAL_API_TTL.PREDICTIONS);
  }

  /** /results/league/:leagueId — confirmed real 2026-09-09. Same envelope
   * shape as /results ({success, leagueId, data, pagination}); lets the
   * Resultados panel show finished matches from just the league being
   * viewed instead of every competition worldwide. */
  getResultsByLeague(leagueId: string): Promise<GoalApiFixture[]> {
    return this.cachedGet<GoalApiFixture[]>(`/results/league/${encodeURIComponent(leagueId)}`, undefined, GOAL_API_TTL.FIXTURES);
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

  // ── Players ──────────────────────────────────────────────────────────────

  /** /players/:id — confirmed real 2026-09-09. Backs the Player Profile
   * modal (previously SportMonks, removed and left as a hardcoded 404
   * stub — this is the real replacement). */
  getPlayerById(id: string): Promise<GoalApiPlayer> {
    return this.cachedGet<GoalApiPlayer>(`/players/${encodeURIComponent(id)}`, undefined, GOAL_API_TTL.FIXTURES);
  }

  /** /players/:id/statistics — confirmed real 2026-09-09. "recentMatches"
   * has never been observed non-empty in a real response, so
   * buildGoalApiPlayerProfile doesn't attempt to map it yet. */
  getPlayerStatistics(id: string): Promise<GoalApiPlayerStatistics> {
    return this.cachedGet<GoalApiPlayerStatistics>(`/players/${encodeURIComponent(id)}/statistics`, undefined, GOAL_API_TTL.STATISTICS);
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
  getLeagueStandings: (leagueId: string) => getGoalApiClient().getLeagueStandings(leagueId),
  getLeagueStandingsZones: (leagueId: string) => getGoalApiClient().getLeagueStandingsZones(leagueId),
  getTeamUpcoming: (teamId: string) => getGoalApiClient().getTeamUpcoming(teamId),
  getTeamResults: (teamId: string) => getGoalApiClient().getTeamResults(teamId),
  getResultsToday: () => getGoalApiClient().getResultsToday(),
  getResultsYesterday: () => getGoalApiClient().getResultsYesterday(),
  getResultsStats: () => getGoalApiClient().getResultsStats(),
  getResultsByLeague: (leagueId: string) => getGoalApiClient().getResultsByLeague(leagueId),
  getFixtureOdds: (id: string) => getGoalApiClient().getFixtureOdds(id),
  getFixtureLiveOdds: (id: string) => getGoalApiClient().getFixtureLiveOdds(id),
  getLeagueFixtures: (leagueId: string) => getGoalApiClient().getLeagueFixtures(leagueId),
  getFixturePrediction: (id: string) => getGoalApiClient().getFixturePrediction(id),
  getPlayerById: (id: string) => getGoalApiClient().getPlayerById(id),
  getPlayerStatistics: (id: string) => getGoalApiClient().getPlayerStatistics(id),
  requestWsToken: () => getGoalApiClient().requestWsToken(),
};
