import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { proplineCache, PROPLINE_TTL } from "./cache.js";

export type ProplineConfig = {
  apiKey: string;
  baseUrl?: string;
  version?: string;
  defaultBookmakers?: string[];
};

export type ProplineSport = {
  key: string;
  title: string;
  active: boolean;
  group?: string;
  description?: string;
  has_outrights?: boolean;
};

export type ProplineEvent = {
  id: string;
  sport_key: string;
  sport_title?: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  live?: boolean;
  completed?: boolean;
  last_update?: string;
  scores?: Array<{ name: string; score: string }>;
  sport_nice?: string;
  bookmakers?: ProplineBookmaker[];
};

export type ProplineOutcome = {
  name: string;
  price: number;
  point?: number;
  description?: string;
  player_id?: string | null;
  payout_multiplier?: number | null;
  dfs_odds_type?: "standard" | "goblin" | "demon" | null;
  line_gap?: number | null;
  liquidity?: number | null;
  book_outcome_id?: string | null;
  link?: string | null;
  app_link?: string | null;
  recorded_at?: string;
  book_updated_at?: string | null;
  last_change_at?: string;
  book_version?: number | null;
};

export type ProplineMarket = {
  key: string;
  last_update?: string;
  outcomes: ProplineOutcome[];
};

export type ProplineBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: ProplineMarket[];
  book_event_id?: string | null;
  link?: string | null;
  app_link?: string | null;
};

export type ProplineOddsResponse = ProplineEvent[];

export type ProplineScore = {
  id: string;
  sport_key: string;
  sport_title?: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  completed?: boolean;
  last_update?: string;
  scores?: Array<{ name: string; score: string }>;
};

export type ProplineResultSettledStat = {
  player_name?: string;
  player_id?: string;
  stat_key: string;
  stat_value: number | string;
  note?: string;
};

export type ProplineResult = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  completed: boolean;
  home_score?: number;
  away_score?: number;
  winner?: string;
  last_update?: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<
        ProplineOutcome & {
          settled_stat?: ProplineResultSettledStat;
          settled?: boolean;
          settled_outcome?: "over" | "under" | "home" | "away" | "draw" | "push" | string;
        }
      >;
    }>;
  }>;
};

export type ProplineBestLinePrice = {
  bookmaker_key: string;
  bookmaker_title: string;
  outcome_name: string;
  price: number;
  point?: number;
  description?: string;
  link?: string | null;
  app_link?: string | null;
  player_id?: string | null;
  liquidity?: number | null;
  payout_multiplier?: number | null;
  dfs_odds_type?: "standard" | "goblin" | "demon" | null;
};

export type ProplineBestLine = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  best: Record<string, ProplineBestLinePrice>;
};

export type ProplineEV = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  fair_lines?: Array<{
    market: string;
    outcome: string;
    point?: number;
    fair_price: number;
    best_price: number;
    expected_value: number;
    bookmaker_key: string;
  }>;
};

export type ProplineFreshnessBook = {
  bookmaker_key: string;
  oldest_data_seconds: number | null;
  newest_data_seconds: number | null;
  event_count: number;
};

export type ProplineFreshness = {
  sport_key: string;
  as_of: string;
  books: ProplineFreshnessBook[];
};

export type ProplineMovement = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  movements: Array<{
    bookmaker_key: string;
    market_key: string;
    outcome_name: string;
    point?: number;
    prev_price: number | null;
    new_price: number | null;
    changed_at: string;
  }>;
};

export type ProplinePlayerTrend = {
  player_name: string;
  player_id?: string;
  sport_key: string;
  stat_key: string;
  line_points: number[];
  hit_rates: Record<number, number>;
  avg: number;
  median: number;
  last_n_games: number;
  game_samples: number;
};

export type ProplineUsageHeaders = {
  dailyLimit?: number;
  dailyUsed?: number;
  dailyRemaining?: number;
  dailyReset?: number;
  rateLimitLimit?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
};

export class ProplineClient {
  readonly baseUrl: string;
  readonly version: string;
  readonly defaultBookmakers: string[];

  private usage: ProplineUsageHeaders = {};

  constructor(private readonly config: ProplineConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.prop-line.com").replace(/\/+$/, "");
    this.version = config.version ?? "v1";
    this.defaultBookmakers = config.defaultBookmakers ?? [];
  }

  apiBase(): string {
    return `${this.baseUrl}/${this.version}`;
  }

  buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined | string[]>,
  ): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.apiBase()}${cleanPath}`);
    if (this.config.apiKey) {
      url.searchParams.set("apiKey", this.config.apiKey);
    }
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value == null || value === "") continue;
      if (Array.isArray(value)) {
        const filtered = value.filter((v) => v != null && v !== "");
        if (filtered.length) url.searchParams.set(key, filtered.join(","));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.config.apiKey) {
      h["X-API-Key"] = this.config.apiKey;
    }
    return h;
  }

  getUsageSnapshot(): ProplineUsageHeaders {
    return { ...this.usage };
  }

  private updateUsageFromResponse(resp: Response) {
    const asNum = (s: string | null): number | undefined => {
      if (!s) return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    };
    this.usage = {
      dailyLimit: asNum(resp.headers.get("X-Daily-Limit")),
      dailyUsed: asNum(resp.headers.get("X-Daily-Used")),
      dailyRemaining: asNum(resp.headers.get("X-Daily-Remaining")),
      dailyReset: asNum(resp.headers.get("X-Daily-Reset")),
      rateLimitLimit: asNum(resp.headers.get("RateLimit-Limit")),
      rateLimitRemaining: asNum(resp.headers.get("RateLimit-Remaining")),
      rateLimitReset: asNum(resp.headers.get("RateLimit-Reset")),
    };
  }

  async rawGet<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined | string[]>,
    timeoutMs: number = 8_000,
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: this.headers(),
    });
    this.updateUsageFromResponse(resp);
    if (!resp.ok) {
      let body: string;
      try {
        body = await resp.text();
      } catch {
        body = "";
      }
      throw new Error(
        `[propline] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`,
      );
    }
    return (await resp.json()) as T;
  }

  async rawGetWithRetry<T = unknown>(
    path: string,
    opts?: {
      params?: Record<string, string | number | boolean | undefined | string[]>;
      timeoutMs?: number;
      retries?: number;
      retryDelayMs?: number;
    },
  ): Promise<T | null> {
    const retries = opts?.retries ?? 3;
    const baseDelay = opts?.retryDelayMs ?? 1500;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.rawGet<T>(path, opts?.params, opts?.timeoutMs);
      } catch (err: any) {
        if (attempt === retries) {
          logger.warn({ err, path }, "[propline] giving up after retries");
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, baseDelay * (attempt + 1)));
      }
    }
    return null;
  }

  private stableCacheKey(
    path: string,
    params: Record<string, string | number | boolean | undefined | string[]> = {},
  ): string {
    const paramStr = Object.entries(params)
      .filter(([, v]) => {
        if (Array.isArray(v)) return v.filter((x) => x != null && x !== "").length > 0;
        return v != null && v !== "";
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const vstr = Array.isArray(v)
          ? (v.filter((x) => x != null && x !== "") as string[]).join(",")
          : String(v);
        return `${k}=${vstr}`;
      })
      .join("&");
    return `propline:${path}${paramStr ? `:${paramStr}` : ""}`;
  }

  async cachedGet<T = unknown>(
    path: string,
    params: Record<string, string | number | boolean | undefined | string[]> = {},
    ttlSeconds: number,
  ): Promise<T> {
    if (!this.config.apiKey) {
      throw new Error(`ProplineClient: apiKey not set (path=${path})`);
    }
    const cacheKey = this.stableCacheKey(path, params);
    const cached = await proplineCache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        /* fall through */
      }
    }
    const data = await this.rawGet<T>(path, params);
    proplineCache.set(cacheKey, JSON.stringify(data), ttlSeconds).catch(() => {});
    return data;
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  /** GET /sports */
  getSports(): Promise<ProplineSport[]> {
    return this.cachedGet<ProplineSport[]>("/sports", {}, PROPLINE_TTL.STANDINGS);
  }

  /** GET /sports/{sport_key}/events */
  getEvents(sportKey: string): Promise<ProplineEvent[]> {
    return this.cachedGet<ProplineEvent[]>(
      `/sports/${encodeURIComponent(sportKey)}/events`,
      {},
      PROPLINE_TTL.FIXTURES,
    );
  }

  /** GET /sports/{sport_key}/events/{event_id}/markets */
  getEventMarkets(sportKey: string, eventId: string): Promise<string[]> {
    return this.cachedGet<string[]>(
      `/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(eventId)}/markets`,
      {},
      PROPLINE_TTL.FIXTURES,
    );
  }

  // ── Odds ───────────────────────────────────────────────────────────────────

  /** GET /sports/{sport_key}/odds — game-line bulk (h2h, spreads, totals etc.) */
  getOdds(
    sportKey: string,
    opts?: {
      markets?: string[];
      bookmakers?: string[];
      regions?: string[];
      dateFormat?: "iso" | "unix";
      oddsFormat?: "american" | "decimal";
      includeLinks?: boolean;
      includeBookIds?: boolean;
      commenceTimeFrom?: string;
      commenceTimeTo?: string;
    },
  ): Promise<ProplineOddsResponse> {
    return this.cachedGet<ProplineOddsResponse>(
      `/sports/${encodeURIComponent(sportKey)}/odds`,
      {
        markets: opts?.markets,
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        regions: opts?.regions,
        dateFormat: opts?.dateFormat,
        oddsFormat: opts?.oddsFormat,
        includeLinks: opts?.includeLinks,
        includeBookIds: opts?.includeBookIds,
        commenceTimeFrom: opts?.commenceTimeFrom,
        commenceTimeTo: opts?.commenceTimeTo,
      },
      PROPLINE_TTL.LIVE,
    );
  }

  /** GET /sports/{sport_key}/events/{event_id}/odds — player props + all markets per event */
  getEventOdds(
    sportKey: string,
    eventId: string,
    opts?: {
      markets?: string[];
      bookmakers?: string[];
      regions?: string[];
      oddsFormat?: "american" | "decimal";
      includeLinks?: boolean;
      includeBookIds?: boolean;
    },
  ): Promise<ProplineEvent> {
    return this.cachedGet<ProplineEvent>(
      `/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(eventId)}/odds`,
      {
        markets: opts?.markets,
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        regions: opts?.regions,
        oddsFormat: opts?.oddsFormat,
        includeLinks: opts?.includeLinks,
        includeBookIds: opts?.includeBookIds,
      },
      PROPLINE_TTL.LIVE,
    );
  }

  // ── History / Closing / Movement ───────────────────────────────────────────

  /** GET /sports/{sport_key}/odds/history — snapshots de linha no tempo */
  getOddsHistory(
    sportKey: string,
    opts?: {
      markets?: string[];
      bookmakers?: string[];
      oddsFormat?: "american" | "decimal";
      includeLinks?: boolean;
      includeBookIds?: boolean;
      date?: string;
    },
  ): Promise<any> {
    return this.cachedGet<any>(
      `/sports/${encodeURIComponent(sportKey)}/odds/history`,
      {
        markets: opts?.markets,
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        oddsFormat: opts?.oddsFormat,
        includeLinks: opts?.includeLinks,
        includeBookIds: opts?.includeBookIds,
        date: opts?.date,
      },
      PROPLINE_TTL.HISTORY,
    );
  }

  /** GET /sports/{sport_key}/odds/closing — linhas de fechamento / CLV */
  getOddsClosing(
    sportKey: string,
    opts?: {
      markets?: string[];
      bookmakers?: string[];
      oddsFormat?: "american" | "decimal";
      includeLinks?: boolean;
      includeBookIds?: boolean;
      date?: string;
    },
  ): Promise<any> {
    return this.cachedGet<any>(
      `/sports/${encodeURIComponent(sportKey)}/odds/closing`,
      {
        markets: opts?.markets,
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        oddsFormat: opts?.oddsFormat,
        includeLinks: opts?.includeLinks,
        includeBookIds: opts?.includeBookIds,
        date: opts?.date,
      },
      PROPLINE_TTL.CLOSING,
    );
  }

  /** GET /sports/{sport_key}/odds/movement — últimas movimentações detectadas */
  getOddsMovement(
    sportKey: string,
    opts?: { markets?: string[]; bookmakers?: string[] },
  ): Promise<ProplineMovement[]> {
    return this.cachedGet<ProplineMovement[]>(
      `/sports/${encodeURIComponent(sportKey)}/odds/movement`,
      {
        markets: opts?.markets,
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
      },
      PROPLINE_TTL.LIVE,
    );
  }

  // ── Best Line / EV ─────────────────────────────────────────────────────────

  /** GET /sports/{sport_key}/odds/best-line — melhor preço por seleção */
  getBestLine(
    sportKey: string,
    opts?: {
      markets?: string[];
      bookmakers?: string[];
      includeLinks?: boolean;
    },
  ): Promise<ProplineBestLine[]> {
    return this.cachedGet<ProplineBestLine[]>(
      `/sports/${encodeURIComponent(sportKey)}/odds/best-line`,
      {
        markets: opts?.markets,
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        includeLinks: opts?.includeLinks,
      },
      PROPLINE_TTL.BEST_LINE,
    );
  }

  /** GET /sports/{sport_key}/odds/ev — cálculo +EV vs fair-line no-vig */
  getEV(
    sportKey: string,
    opts?: { markets?: string[]; bookmakers?: string[]; juice?: number },
  ): Promise<ProplineEV[]> {
    return this.cachedGet<ProplineEV[]>(
      `/sports/${encodeURIComponent(sportKey)}/odds/ev`,
      {
        markets: opts?.markets,
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        juice: opts?.juice,
      },
      PROPLINE_TTL.EV,
    );
  }

  // ── Results / Scores ───────────────────────────────────────────────────────

  /** GET /sports/{sport_key}/scores — placar live + finalizados (~90s refresh) */
  getScores(
    sportKey: string,
    opts?: { daysFrom?: number; dateFormat?: "iso" | "unix" },
  ): Promise<ProplineScore[]> {
    return this.cachedGet<ProplineScore[]>(
      `/sports/${encodeURIComponent(sportKey)}/scores`,
      {
        daysFrom: opts?.daysFrom,
        dateFormat: opts?.dateFormat,
      },
      PROPLINE_TTL.LIVE,
    );
  }

  /** GET /sports/{sport_key}/results — resultado final + resolução de props com stat real */
  getResults(
    sportKey: string,
    opts?: {
      markets?: string[];
      bookmakers?: string[];
      daysFrom?: number;
      dateFormat?: "iso" | "unix";
    },
  ): Promise<ProplineResult[]> {
    return this.cachedGet<ProplineResult[]>(
      `/sports/${encodeURIComponent(sportKey)}/results`,
      {
        markets: opts?.markets,
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        daysFrom: opts?.daysFrom,
        dateFormat: opts?.dateFormat,
      },
      PROPLINE_TTL.RESULTS,
    );
  }

  // ── Stats / Players / DFS ──────────────────────────────────────────────────

  /** GET /v1/freshness — quanto tempo atrás cada book foi atualizado por esporte */
  getFreshness(sportKey?: string): Promise<ProplineFreshness[]> {
    const params: Record<string, any> = {};
    if (sportKey) params.sport = sportKey;
    return this.cachedGet<ProplineFreshness[]>("/freshness", params, PROPLINE_TTL.FRESHNESS);
  }

  /** GET /v1/players/{name}/trends — hit rate histórica + média do jogador */
  getPlayerTrends(name: string): Promise<ProplinePlayerTrend[]> {
    return this.cachedGet<ProplinePlayerTrend[]>(
      `/players/${encodeURIComponent(name)}/trends`,
      {},
      PROPLINE_TTL.PLAYER_TRENDS,
    );
  }

  /** GET /v1/dfs/payouts — PrizePicks payout schedule + breakeven por leg */
  getDfsPayouts(legWinProb?: number): Promise<any> {
    return this.cachedGet<any>(
      "/dfs/payouts",
      { leg_win_prob: legWinProb },
      PROPLINE_TTL.STANDINGS,
    );
  }

  // ── Period / Futures (discovery) ───────────────────────────────────────────

  /** GET /sports/{sport_key}/odds/periods — markets de período (1H, 1st 5 innings etc.) */
  getPeriodMarkets(
    sportKey: string,
    opts?: { bookmakers?: string[]; markets?: string[] },
  ): Promise<any> {
    return this.cachedGet<any>(
      `/sports/${encodeURIComponent(sportKey)}/odds/periods`,
      {
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        markets: opts?.markets,
      },
      PROPLINE_TTL.PREMATCH,
    );
  }

  /** GET /sports/{sport_key}/odds/futures — mercados outright/futuros */
  getFutures(sportKey: string, opts?: { bookmakers?: string[]; markets?: string[] }): Promise<any> {
    return this.cachedGet<any>(
      `/sports/${encodeURIComponent(sportKey)}/odds/futures`,
      {
        bookmakers: opts?.bookmakers ?? this.defaultBookmakers,
        markets: opts?.markets,
      },
      PROPLINE_TTL.PREMATCH,
    );
  }

  // ── MLB / NHL especiais ────────────────────────────────────────────────────

  /** GET /v1/sports/baseball_mlb/odds/grand-salami — MLB Grand Salami (total de runs do dia) */
  getMLBGrandSalami(opts?: { bookmakers?: string[] }): Promise<any> {
    return this.cachedGet<any>(
      "/sports/baseball_mlb/odds/grand-salami",
      { bookmakers: opts?.bookmakers ?? this.defaultBookmakers },
      PROPLINE_TTL.PREMATCH,
    );
  }

  /** GET /v1/sports/hockey_nhl/odds/daily-goals-total — NHL Daily Total Goals */
  getNHLDailyGoalsTotal(opts?: { bookmakers?: string[] }): Promise<any> {
    return this.cachedGet<any>(
      "/sports/hockey_nhl/odds/daily-goals-total",
      { bookmakers: opts?.bookmakers ?? this.defaultBookmakers },
      PROPLINE_TTL.PREMATCH,
    );
  }

  // ── Admin helpers ──────────────────────────────────────────────────────────

  /** Health probe — apenas acerta /sports e retorna o usage */
  async probe(): Promise<{
    ok: boolean;
    usage: ProplineUsageHeaders;
    sportCount?: number;
    error?: string;
  }> {
    try {
      const sports = await this.getSports();
      return { ok: true, usage: this.getUsageSnapshot(), sportCount: sports.length };
    } catch (err: any) {
      return { ok: false, usage: this.getUsageSnapshot(), error: String(err?.message ?? err) };
    }
  }
}

let _instance: ProplineClient | null = null;

export function getProplineClient(): ProplineClient {
  if (!_instance) {
    _instance = new ProplineClient({
      apiKey: CONFIG.PROPLINE_API_KEY,
      baseUrl: CONFIG.PROPLINE_BASE_URL,
      version: CONFIG.PROPLINE_API_VERSION,
      defaultBookmakers: CONFIG.PROPLINE_DEFAULT_BOOKMAKERS,
    });
  }
  return _instance;
}

export const propline = {
  get client(): ProplineClient {
    return getProplineClient();
  },
  getSports: () => getProplineClient().getSports(),
  getEvents: (sportKey: string) => getProplineClient().getEvents(sportKey),
  getEventMarkets: (sportKey: string, eventId: string) =>
    getProplineClient().getEventMarkets(sportKey, eventId),
  getOdds: (sportKey: string, opts?: Parameters<ProplineClient["getOdds"]>[1]) =>
    getProplineClient().getOdds(sportKey, opts),
  getEventOdds: (
    sportKey: string,
    eventId: string,
    opts?: Parameters<ProplineClient["getEventOdds"]>[2],
  ) => getProplineClient().getEventOdds(sportKey, eventId, opts),
  getOddsHistory: (
    sportKey: string,
    opts?: Parameters<ProplineClient["getOddsHistory"]>[1],
  ) => getProplineClient().getOddsHistory(sportKey, opts),
  getOddsClosing: (
    sportKey: string,
    opts?: Parameters<ProplineClient["getOddsClosing"]>[1],
  ) => getProplineClient().getOddsClosing(sportKey, opts),
  getOddsMovement: (
    sportKey: string,
    opts?: Parameters<ProplineClient["getOddsMovement"]>[1],
  ) => getProplineClient().getOddsMovement(sportKey, opts),
  getBestLine: (
    sportKey: string,
    opts?: Parameters<ProplineClient["getBestLine"]>[1],
  ) => getProplineClient().getBestLine(sportKey, opts),
  getEV: (sportKey: string, opts?: Parameters<ProplineClient["getEV"]>[1]) =>
    getProplineClient().getEV(sportKey, opts),
  getScores: (sportKey: string, opts?: Parameters<ProplineClient["getScores"]>[1]) =>
    getProplineClient().getScores(sportKey, opts),
  getResults: (sportKey: string, opts?: Parameters<ProplineClient["getResults"]>[1]) =>
    getProplineClient().getResults(sportKey, opts),
  getFreshness: (sportKey?: string) => getProplineClient().getFreshness(sportKey),
  getPlayerTrends: (name: string) => getProplineClient().getPlayerTrends(name),
  getDfsPayouts: (legWinProb?: number) => getProplineClient().getDfsPayouts(legWinProb),
  getPeriodMarkets: (
    sportKey: string,
    opts?: Parameters<ProplineClient["getPeriodMarkets"]>[1],
  ) => getProplineClient().getPeriodMarkets(sportKey, opts),
  getFutures: (sportKey: string, opts?: Parameters<ProplineClient["getFutures"]>[1]) =>
    getProplineClient().getFutures(sportKey, opts),
  getMLBGrandSalami: (opts?: Parameters<ProplineClient["getMLBGrandSalami"]>[0]) =>
    getProplineClient().getMLBGrandSalami(opts),
  getNHLDailyGoalsTotal: (opts?: Parameters<ProplineClient["getNHLDailyGoalsTotal"]>[0]) =>
    getProplineClient().getNHLDailyGoalsTotal(opts),
  probe: () => getProplineClient().probe(),
  usage: () => getProplineClient().getUsageSnapshot(),
  raw: <T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined | string[]>,
    timeoutMs?: number,
  ) => getProplineClient().rawGet<T>(path, params, timeoutMs),
};

export default propline;
