import { CONFIG } from "../../lib/config.js";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type PaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

export type BSDEvent = {
  id: number | string;
  league_id?: number | string | null;
  season_id?: number | string | null;
  league?: string | null;
  league_name?: string | null;
  country?: string | null;
  country_name?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_team_id?: number | string | null;
  away_team_id?: number | string | null;
  event_date?: string | null;
  status?: string | null;
  current_minute?: number | string | null;
  home_score?: number | string | null;
  away_score?: number | string | null;
  ht_home_score?: number | string | null;
  ht_away_score?: number | string | null;
  venue?: string | null;
  venue_name?: string | null;
  referee?: string | null;
  referee_name?: string | null;
  round_number?: number | string | null;
  round_name?: string | null;
  group_name?: string | null;
  live_websocket?: boolean | null;
  websocket_plus?: boolean | null;
  home_badge_url?: string | null;
  away_badge_url?: string | null;
};

export type BSDOddsRow = {
  id?: number | string;
  event_id?: number | string;
  market?: string | null;
  outcome?: string | null;
  outcome_name?: string | null;
  line?: number | string | null;
  bookmaker_slug?: string | null;
  bookmaker_name?: string | null;
  decimal_odds?: number | string | null;
  previous_decimal_odds?: number | string | null;
  implied_probability?: number | string | null;
  movement?: string | null;
  is_max_quote?: boolean | null;
  updated_at?: string | null;
};

export type BSDStandingRow = {
  position?: number | string | null;
  team_id?: number | string | null;
  team_name?: string | null;
  played?: number | string | null;
  won?: number | string | null;
  drawn?: number | string | null;
  lost?: number | string | null;
  goals_for?: number | string | null;
  goals_against?: number | string | null;
  pts?: number | string | null;
  points?: number | string | null;
  form?: string | string[] | null;
  zone?: {
    key?: string | null;
    label?: string | null;
    type?: string | null;
  } | null;
};

export type BSDStandingsResponse = {
  standings?: BSDStandingRow[];
  groups?: Array<{
    name?: string | null;
    standings?: BSDStandingRow[];
    rows?: BSDStandingRow[];
  }>;
  zones?: unknown;
};

export type BSDSeason = {
  id?: number | string | null;
  name?: string | null;
  year?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | null;
  stages?: Array<Record<string, unknown>> | null;
};

export type BSDLeague = {
  id?: number | string | null;
  name?: string | null;
  country?: string | null;
  is_women?: boolean | null;
};

export type BSDTopScorerRow = {
  rank?: number | string | null;
  player_id?: number | string | null;
  player_name?: string | null;
  position?: string | null;
  team_id?: number | string | null;
  team_name?: string | null;
  value?: number | string | null;
  matches?: number | string | null;
};

export type BSDPredictionResponse = {
  id?: number | string | null;
  event?: {
    id?: number | string | null;
    home_team?: string | null;
    away_team?: string | null;
  } | null;
  markets?: {
    match_result?: {
      prob_home?: number | null;
      prob_draw?: number | null;
      prob_away?: number | null;
      predicted?: string | null;
    } | null;
    expected_goals?: {
      home?: number | null;
      away?: number | null;
    } | null;
    over_under?: {
      prob_over_15?: number | null;
      prob_over_25?: number | null;
      prob_over_35?: number | null;
    } | null;
    btts?: {
      prob_yes?: number | null;
      prob_no?: number | null;
    } | null;
    draw_no_bet?: {
      prob_home?: number | null;
      prob_away?: number | null;
    } | null;
    corners?: {
      prob_over_85?: number | null;
      prob_over_95?: number | null;
      prob_over_105?: number | null;
    } | null;
    score?: {
      most_likely?: string | null;
    } | null;
  } | null;
  recommendations?: {
    favorite?: string | null;
    favorite_prob?: number | null;
    over_25?: boolean | null;
    btts?: boolean | null;
  } | null;
  model?: {
    confidence?: number | null;
    version?: string | null;
  } | null;
};

export type BSDStatsResponse = {
  event_id?: number | string;
  stats?: {
    home?: Record<string, number | string | null>;
    away?: Record<string, number | string | null>;
    first_half?: Record<string, number | string | null>;
    second_half?: Record<string, number | string | null>;
  } | null;
  shotmap?: Array<Record<string, unknown>>;
  momentum?: Array<Record<string, unknown>>;
  average_positions?: Record<string, unknown>;
  xg_per_minute?: Array<Record<string, unknown>>;
};

export type BSDLineupsResponse = {
  home?: Array<Record<string, unknown>>;
  away?: Array<Record<string, unknown>>;
  bench_home?: Array<Record<string, unknown>>;
  bench_away?: Array<Record<string, unknown>>;
  formation_home?: string | null;
  formation_away?: string | null;
  confirmed?: boolean | null;
  predicted?: boolean | null;
};

export type BSDBestXiResponse = {
  formation?: string | null;
  players?: Array<Record<string, unknown>>;
  lineup?: Array<Record<string, unknown>>;
};

export type BSDIncidentsResponse = Array<Record<string, unknown>> | {
  incidents?: Array<Record<string, unknown>>;
};

export type BSDH2HResponse = {
  recent_meetings?: Array<Record<string, unknown>>;
  home_wins?: number | null;
  away_wins?: number | null;
  draws?: number | null;
  home_form?: Array<Record<string, unknown>>;
  away_form?: Array<Record<string, unknown>>;
  win_rates?: {
    home?: number | null;
    draw?: number | null;
    away?: number | null;
  } | null;
};

const responseCache = new Map<string, CacheEntry<unknown>>();

function requireToken(): string {
  const token = CONFIG.BZZOIRO_API_TOKEN.trim();
  if (!token) {
    throw Object.assign(new Error("BZZOIRO_API_TOKEN não configurado"), {
      status: 503,
    });
  }
  return token;
}

export function bsdEnabled(): boolean {
  return CONFIG.BZZOIRO_API_TOKEN.trim().length > 0;
}

function cacheKey(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && `${value}` !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return `${path}?${entries.map(([key, value]) => `${key}=${String(value)}`).join("&")}`;
}

async function bsdFetch<T>(
  path: string,
  args?: {
    query?: Record<string, string | number | boolean | undefined>;
    ttlMs?: number;
    auth?: boolean;
  },
): Promise<T> {
  const ttlMs = args?.ttlMs ?? 5_000;
  const key = cacheKey(path, args?.query);
  const cached = responseCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = new URL(path, CONFIG.BZZOIRO_BASE_URL);
  for (const [name, value] of Object.entries(args?.query ?? {})) {
    if (value === undefined || value === null || `${value}` === "") continue;
    url.searchParams.set(name, String(value));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (args?.auth !== false) {
    headers["Authorization"] = `Token ${requireToken()}`;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`BSD request failed: ${response.status} ${response.statusText} ${text}`),
      { status: response.status },
    );
  }
  const data = (await response.json()) as T;
  responseCache.set(key, { value: data, expiresAt: Date.now() + ttlMs });
  return data;
}

async function fetchAllPages<T>(
  path: string,
  args?: {
    query?: Record<string, string | number | boolean | undefined>;
    ttlMs?: number;
    maxPages?: number;
  },
): Promise<T[]> {
  const maxPages = args?.maxPages ?? 10;
  const limit = Number(args?.query?.["limit"] ?? 100);
  let offset = Number(args?.query?.["offset"] ?? 0);
  let page = 0;
  const out: T[] = [];

  while (page < maxPages) {
    const payload = await bsdFetch<PaginatedResponse<T>>(path, {
      query: {
        ...(args?.query ?? {}),
        limit,
        offset,
      },
      ttlMs: args?.ttlMs,
    });
    const rows = Array.isArray(payload.results) ? payload.results : [];
    out.push(...rows);
    if (rows.length < limit || !payload.next) break;
    offset += limit;
    page += 1;
  }

  return out;
}

export async function getBsdLiveEvents(args?: {
  leagueId?: string | number;
  seasonId?: string | number;
  teamId?: string | number;
}): Promise<BSDEvent[]> {
  const payload = await bsdFetch<PaginatedResponse<BSDEvent> | BSDEvent[]>("/events/live/", {
    query: {
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.seasonId != null ? { season_id: args.seasonId } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
    },
    ttlMs: 10_000,
  });
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdEvents(args?: {
  status?: string;
  leagueId?: string | number;
  seasonId?: string | number;
  teamId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDEvent>> {
  return bsdFetch<PaginatedResponse<BSDEvent>>("/events/", {
    query: {
      ...(args?.status ? { status: args.status } : {}),
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.seasonId != null ? { season_id: args.seasonId } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
      ...(args?.dateFrom ? { date_from: args.dateFrom } : {}),
      ...(args?.dateTo ? { date_to: args.dateTo } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 15_000,
  });
}

export async function getBsdEventById(eventId: string | number): Promise<BSDEvent> {
  return bsdFetch<BSDEvent>(`/events/${encodeURIComponent(String(eventId))}/`, {
    ttlMs: 10_000,
  });
}

export async function getBsdOddsForEvent(eventId: string | number): Promise<BSDOddsRow[]> {
  return fetchAllPages<BSDOddsRow>("/odds/", {
    query: {
      event_id: String(eventId),
      limit: 200,
      offset: 0,
    },
    ttlMs: 20_000,
    maxPages: 3,
  });
}

export async function getBsdLeagueSeason(
  leagueId: string | number,
): Promise<BSDSeason | null> {
  return bsdFetch<BSDSeason>(`/leagues/${encodeURIComponent(String(leagueId))}/season/`, {
    ttlMs: 30 * 60_000,
  }).catch(() => null);
}

export async function getBsdLeagueById(
  leagueId: string | number,
): Promise<BSDLeague | null> {
  return bsdFetch<BSDLeague>(`/leagues/${encodeURIComponent(String(leagueId))}/`, {
    ttlMs: 24 * 60 * 60_000,
  }).catch(() => null);
}

export async function getBsdLeagueStandings(args: {
  leagueId: string | number;
  seasonId?: string | number;
}): Promise<BSDStandingsResponse | null> {
  return bsdFetch<BSDStandingsResponse>(
    `/leagues/${encodeURIComponent(String(args.leagueId))}/standings/`,
    {
      query: args.seasonId != null ? { season_id: args.seasonId } : undefined,
      ttlMs: 10 * 60_000,
    },
  ).catch(() => null);
}

export async function getBsdLeagueTopScorers(args: {
  leagueId: string | number;
  seasonId?: string | number;
  limit?: number;
}): Promise<BSDTopScorerRow[]> {
  const payload = await bsdFetch<PaginatedResponse<BSDTopScorerRow>>(
    `/leagues/${encodeURIComponent(String(args.leagueId))}/top/scorers/`,
    {
      query: {
        ...(args.seasonId != null ? { season_id: args.seasonId } : {}),
        limit: args.limit ?? 20,
        offset: 0,
      },
      ttlMs: 10 * 60_000,
    },
  ).catch(() => ({ results: [] as BSDTopScorerRow[] }));
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdLeagueBestXi(args: {
  leagueId: string | number;
  seasonId: string | number;
  roundNumber?: string | number;
}): Promise<BSDBestXiResponse | null> {
  const suffix =
    args.roundNumber != null && `${args.roundNumber}`.trim() !== ""
      ? `/${encodeURIComponent(String(args.roundNumber))}/`
      : "/";
  return bsdFetch<BSDBestXiResponse>(
    `/leagues/${encodeURIComponent(String(args.leagueId))}/bestxi/${encodeURIComponent(
      String(args.seasonId),
    )}${suffix}`,
    {
      ttlMs: 30 * 60_000,
    },
  ).catch(() => null);
}

export async function getBsdEventPrediction(
  eventId: string | number,
): Promise<BSDPredictionResponse | null> {
  return bsdFetch<BSDPredictionResponse>(
    `/events/${encodeURIComponent(String(eventId))}/prediction/`,
    {
      ttlMs: 2 * 60_000,
    },
  ).catch(() => null);
}

export async function getBsdEventStats(
  eventId: string | number,
): Promise<BSDStatsResponse | null> {
  return bsdFetch<BSDStatsResponse>(
    `/events/${encodeURIComponent(String(eventId))}/stats/`,
    {
      ttlMs: 15_000,
    },
  ).catch(() => null);
}

export async function getBsdEventLineups(
  eventId: string | number,
): Promise<BSDLineupsResponse | null> {
  return bsdFetch<BSDLineupsResponse>(
    `/events/${encodeURIComponent(String(eventId))}/lineups/`,
    {
      ttlMs: 60_000,
    },
  ).catch(() => null);
}

export async function getBsdEventIncidents(
  eventId: string | number,
): Promise<Array<Record<string, unknown>>> {
  const payload = await bsdFetch<BSDIncidentsResponse>(
    `/events/${encodeURIComponent(String(eventId))}/incidents/`,
    {
      ttlMs: 10_000,
    },
  ).catch(() => []);
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.incidents) ? payload.incidents : [];
}

export async function getBsdEventH2H(
  eventId: string | number,
): Promise<BSDH2HResponse | null> {
  return bsdFetch<BSDH2HResponse>(`/events/${encodeURIComponent(String(eventId))}/h2h/`, {
    ttlMs: 10 * 60_000,
  }).catch(() => null);
}
