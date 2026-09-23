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
  stage?: string | null;
  stage_name?: string | null;
  round_number?: number | string | null;
  round_name?: string | null;
  round_label?: string | null;
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
  push?: string | null;
  bookmaker_slug?: string | null;
  bookmaker_name?: string | null;
  bookmaker_count?: number | string | null;
  decimal_odds?: number | string | null;
  previous_decimal_odds?: number | string | null;
  opening_decimal_odds?: number | string | null;
  opening_at?: string | null;
  implied_probability?: number | string | null;
  movement?: string | null;
  is_max_quote?: boolean | null;
  updated_at?: string | null;
};

export type BSDEventOddsSummary = {
  event_id?: number | string | null;
  odds?: {
    home_win?: number | string | null;
    draw?: number | string | null;
    away_win?: number | string | null;
    over_15_goals?: number | string | null;
    over_25_goals?: number | string | null;
    over_35_goals?: number | string | null;
    under_15_goals?: number | string | null;
    under_25_goals?: number | string | null;
    under_35_goals?: number | string | null;
    btts_yes?: number | string | null;
    btts_no?: number | string | null;
  } | null;
  last_update_at?: string | null;
  next_update_at?: string | null;
  update_interval_seconds?: number | string | null;
  update_reason?: string | null;
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
  zones?:
    | Array<{
        key?: string | null;
        label?: string | null;
        type?: string | null;
        from?: number | string | null;
        to?: number | string | null;
      }>
    | Record<
        string,
        Array<{
          key?: string | null;
          label?: string | null;
          type?: string | null;
          from?: number | string | null;
          to?: number | string | null;
        }>
      >
    | null;
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
  active?: boolean | null;
  is_active?: boolean | null;
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

export type BSDVenue = {
  id?: number | string | null;
  name?: string | null;
  city?: string | null;
  country_code?: string | null;
  country?: string | null;
  capacity?: number | string | null;
  surface?: string | null;
  team_id?: number | string | null;
  team_name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  host_country_code?: string | null;
  hosts_final?: boolean | null;
  hosts_opening?: boolean | null;
  hosts_third_place?: boolean | null;
  round?: number | string | null;
};

export type BSDManager = {
  id?: number | string | null;
  name?: string | null;
  short_name?: string | null;
  nationality?: string | null;
  nationality_code?: string | null;
  team_id?: number | string | null;
  team_name?: string | null;
  preferred_formation?: string | null;
  tactical_profile?: string | null;
  team_style?: string | null;
  matches?: number | string | null;
  wins?: number | string | null;
  draws?: number | string | null;
  losses?: number | string | null;
  ppm?: number | string | null;
};

export type BSDReferee = {
  id?: number | string | null;
  name?: string | null;
  country?: string | null;
  country_code?: string | null;
  matches?: number | string | null;
  yellow_cards_per_match?: number | string | null;
  red_cards_per_match?: number | string | null;
  fouls_per_match?: number | string | null;
  penalties_per_match?: number | string | null;
};

export type BSDTeam = {
  id?: number | string | null;
  name?: string | null;
  short_name?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  country?: string | null;
  league_id?: number | string | null;
  season_id?: number | string | null;
  venue_id?: number | string | null;
  venue_name?: string | null;
  coach_name?: string | null;
  manager_name?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  is_women?: boolean | null;
};

export type BSDTeamSquadRow = Record<string, unknown>;
export type BSDTransferRow = Record<string, unknown>;
export type BSDTransferLedgerRow = Record<string, unknown>;
export type BSDTransferRouteRow = Record<string, unknown>;
export type BSDWorldCupSquadRow = Record<string, unknown>;
export type BSDManagerCareerRow = Record<string, unknown>;
export type BSDManagerMatchRow = Record<string, unknown>;
export type BSDVenueCompetitionRow = Record<string, unknown>;
export type BSDBookmaker = {
  slug?: string | null;
  name?: string | null;
};
export type BSDPolymarketResponse = Record<string, unknown>;

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

export type BSDPlayer = {
  id?: number | string | null;
  name?: string | null;
  short_name?: string | null;
  position?: string | null;
  nationality?: string | null;
  nationality_code?: string | null;
  country_name?: string | null;
  birth_date?: string | null;
  date_of_birth?: string | null;
  height?: number | string | null;
  weight?: number | string | null;
  preferred_foot?: string | null;
  shirt_number?: number | string | null;
  market_value?: number | string | null;
  team_id?: number | string | null;
  team_name?: string | null;
  current_team?: {
    id?: number | string | null;
    name?: string | null;
  } | null;
  contract_until?: string | null;
};

export type BSDPlayerStatRow = Record<string, unknown>;
export type BSDCareerRow = Record<string, unknown>;
export type BSDNationalTeamRow = Record<string, unknown>;

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

  const baseUrl = CONFIG.BZZOIRO_BASE_URL.endsWith("/")
    ? CONFIG.BZZOIRO_BASE_URL
    : `${CONFIG.BZZOIRO_BASE_URL}/`;
  const relativePath = path.replace(/^\/+/, "");
  const url = new URL(relativePath, baseUrl);
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
  const payload = await bsdFetch<
    PaginatedResponse<BSDEvent> | BSDEvent[] | { count?: number; events?: BSDEvent[] }
  >("/events/live/", {
    query: {
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.seasonId != null ? { season_id: args.seasonId } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
    },
    ttlMs: 10_000,
  });
  if (Array.isArray(payload)) return payload;
  if ("results" in payload && Array.isArray(payload.results)) return payload.results;
  if ("events" in payload && Array.isArray(payload.events)) return payload.events;
  return [];
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

export async function getBsdEventOddsSummary(
  eventId: string | number,
): Promise<BSDEventOddsSummary | null> {
  return bsdFetch<BSDEventOddsSummary>(
    `/events/${encodeURIComponent(String(eventId))}/odds/`,
    {
      ttlMs: 20_000,
    },
  ).catch(() => null);
}

export async function getBsdOddsFeed(args?: {
  eventId?: string | number;
  leagueId?: string | number;
  seasonId?: string | number;
  teamId?: string | number;
  market?: string;
  outcome?: string;
  bookmakerSlug?: string;
  isMaxQuote?: boolean;
  movement?: string;
  minDecimalOdds?: number;
  maxDecimalOdds?: number;
  updatedAfter?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDOddsRow>> {
  return bsdFetch<PaginatedResponse<BSDOddsRow>>("/odds/", {
    query: {
      ...(args?.eventId != null ? { event_id: args.eventId } : {}),
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.seasonId != null ? { season_id: args.seasonId } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
      ...(args?.market ? { market: args.market } : {}),
      ...(args?.outcome ? { outcome: args.outcome } : {}),
      ...(args?.bookmakerSlug ? { bookmaker_slug: args.bookmakerSlug } : {}),
      ...(args?.isMaxQuote != null ? { is_max_quote: args.isMaxQuote } : {}),
      ...(args?.movement ? { movement: args.movement } : {}),
      ...(args?.minDecimalOdds != null ? { min_decimal_odds: args.minDecimalOdds } : {}),
      ...(args?.maxDecimalOdds != null ? { max_decimal_odds: args.maxDecimalOdds } : {}),
      ...(args?.updatedAfter ? { updated_after: args.updatedAfter } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 3 * 60_000,
  });
}

export async function getBsdBestOdds(args?: {
  market?: string;
  leagueId?: string | number;
  seasonId?: string | number;
  teamId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDOddsRow>> {
  return bsdFetch<PaginatedResponse<BSDOddsRow>>("/odds/best/", {
    query: {
      ...(args?.market ? { market: args.market } : {}),
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.seasonId != null ? { season_id: args.seasonId } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
      ...(args?.dateFrom ? { date_from: args.dateFrom } : {}),
      ...(args?.dateTo ? { date_to: args.dateTo } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 5 * 60_000,
  });
}

export async function getBsdBookmakers(): Promise<BSDBookmaker[]> {
  const payload = await bsdFetch<PaginatedResponse<BSDBookmaker> | BSDBookmaker[]>("/bookmakers/", {
    ttlMs: 60 * 60_000,
  }).catch(() => ({ results: [] as BSDBookmaker[] }));
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdLeagueSeason(
  leagueId: string | number,
): Promise<BSDSeason | null> {
  return bsdFetch<BSDSeason>(`/leagues/${encodeURIComponent(String(leagueId))}/season/`, {
    ttlMs: 30 * 60_000,
  }).catch(() => null);
}

export async function getBsdLeagues(args?: {
  country?: string;
  isWomen?: boolean;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDLeague>> {
  return bsdFetch<PaginatedResponse<BSDLeague>>("/leagues/", {
    query: {
      ...(args?.country ? { country: args.country } : {}),
      ...(args?.isWomen != null ? { is_women: args.isWomen } : {}),
      ...(args?.includeInactive != null
        ? { include_inactive: args.includeInactive }
        : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 5 * 60_000,
  }).catch(() => ({ results: [] as BSDLeague[] }));
}

export async function getBsdLeagueSeasons(
  leagueId: string | number,
): Promise<BSDSeason[]> {
  const payload = await bsdFetch<PaginatedResponse<BSDSeason> | BSDSeason[]>(
    `/leagues/${encodeURIComponent(String(leagueId))}/seasons/`,
    {
      ttlMs: 60 * 60_000,
    },
  ).catch(() => ({ results: [] as BSDSeason[] }));
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
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
  teamId?: string | number;
  limit?: number;
}): Promise<BSDTopScorerRow[]> {
  const payload = await bsdFetch<PaginatedResponse<BSDTopScorerRow>>(
    `/leagues/${encodeURIComponent(String(args.leagueId))}/top/scorers/`,
    {
      query: {
        ...(args.seasonId != null ? { season_id: args.seasonId } : {}),
        ...(args.teamId != null ? { team_id: args.teamId } : {}),
        limit: args.limit ?? 20,
        offset: 0,
      },
      ttlMs: 10 * 60_000,
    },
  ).catch(() => ({ results: [] as BSDTopScorerRow[] }));
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdLeagueTopStat(args: {
  leagueId: string | number;
  stat: "scorers" | "assists" | "yellowcards" | "redcards" | "fouls";
  seasonId?: string | number;
  teamId?: string | number;
  limit?: number;
}): Promise<BSDTopScorerRow[]> {
  const payload = await bsdFetch<PaginatedResponse<BSDTopScorerRow>>(
    `/leagues/${encodeURIComponent(String(args.leagueId))}/top/${encodeURIComponent(
      String(args.stat),
    )}/`,
    {
      query: {
        ...(args.seasonId != null ? { season_id: args.seasonId } : {}),
        ...(args.teamId != null ? { team_id: args.teamId } : {}),
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

export async function getBsdLeagueVenues(args: {
  leagueId: string | number;
  seasonId?: string | number;
  hostCountryCode?: string;
  hostsFinal?: boolean;
  hostsOpening?: boolean;
  hostsThirdPlace?: boolean;
  round?: string | number;
}): Promise<BSDVenue[]> {
  const path =
    args.seasonId != null && `${args.seasonId}`.trim() !== ""
      ? `/leagues/${encodeURIComponent(String(args.leagueId))}/seasons/${encodeURIComponent(
          String(args.seasonId),
        )}/venues/`
      : `/leagues/${encodeURIComponent(String(args.leagueId))}/venues/`;
  const payload = await bsdFetch<PaginatedResponse<BSDVenue> | BSDVenue[]>(path, {
    query:
      args.seasonId != null && `${args.seasonId}`.trim() !== ""
        ? {
            ...(args.hostCountryCode
              ? { host_country_code: args.hostCountryCode }
              : {}),
            ...(args.hostsFinal != null ? { hosts_final: args.hostsFinal } : {}),
            ...(args.hostsOpening != null
              ? { hosts_opening: args.hostsOpening }
              : {}),
            ...(args.hostsThirdPlace != null
              ? { hosts_third_place: args.hostsThirdPlace }
              : {}),
            ...(args.round != null ? { round: args.round } : {}),
          }
        : args.seasonId != null
          ? { season_id: args.seasonId }
          : undefined,
    ttlMs: 30 * 60_000,
  }).catch(() => ({ results: [] as BSDVenue[] }));
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdTeams(args?: {
  countryCode?: string;
  leagueId?: string | number;
  seasonId?: string | number;
  inCompetition?: boolean;
  isWomen?: boolean;
  name?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDTeam>> {
  return bsdFetch<PaginatedResponse<BSDTeam>>("/teams/", {
    query: {
      ...(args?.countryCode ? { country_code: args.countryCode } : {}),
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.seasonId != null ? { season_id: args.seasonId } : {}),
      ...(args?.inCompetition != null
        ? { in_competition: args.inCompetition }
        : {}),
      ...(args?.isWomen != null ? { is_women: args.isWomen } : {}),
      ...(args?.name ? { name: args.name } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 10 * 60_000,
  }).catch(() => ({ results: [] as BSDTeam[] }));
}

export async function getBsdTeamById(
  teamId: string | number,
): Promise<BSDTeam | null> {
  return bsdFetch<BSDTeam>(`/teams/${encodeURIComponent(String(teamId))}/`, {
    ttlMs: 30 * 60_000,
  }).catch(() => null);
}

export async function getBsdTeamSquad(
  teamId: string | number,
): Promise<BSDTeamSquadRow[]> {
  return fetchAllPages<BSDTeamSquadRow>(`/teams/${encodeURIComponent(String(teamId))}/squad/`, {
    query: { limit: 100, offset: 0 },
    ttlMs: 10 * 60_000,
    maxPages: 3,
  }).catch(() => []);
}

export async function getBsdTeamFixtures(args: {
  teamId: string | number;
  dateFrom?: string;
  dateTo?: string;
  leagueId?: string | number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDEvent>> {
  return bsdFetch<PaginatedResponse<BSDEvent>>(
    `/teams/${encodeURIComponent(String(args.teamId))}/fixtures/`,
    {
      query: {
        ...(args.dateFrom ? { date_from: args.dateFrom } : {}),
        ...(args.dateTo ? { date_to: args.dateTo } : {}),
        ...(args.leagueId != null ? { league_id: args.leagueId } : {}),
        ...(args.status ? { status: args.status } : {}),
        limit: args.limit ?? 50,
        offset: args.offset ?? 0,
      },
      ttlMs: 10 * 60_000,
    },
  ).catch(() => ({ results: [] as BSDEvent[] }));
}

export async function getBsdPlayers(args?: {
  name?: string;
  teamId?: string | number;
  nationalTeamId?: string | number;
  nationalityCode?: string;
  position?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDPlayer>> {
  return bsdFetch<PaginatedResponse<BSDPlayer>>("/players/", {
    query: {
      ...(args?.name ? { name: args.name } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
      ...(args?.nationalTeamId != null
        ? { national_team_id: args.nationalTeamId }
        : {}),
      ...(args?.nationalityCode
        ? { nationality_code: args.nationalityCode }
        : {}),
      ...(args?.position ? { position: args.position } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 10 * 60_000,
  }).catch(() => ({ results: [] as BSDPlayer[] }));
}

export async function getBsdTransfers(args?: {
  leagueId?: string | number;
  playerId?: string | number;
  teamId?: string | number;
  fromTeamId?: string | number;
  toTeamId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  minFee?: string | number;
  hasFee?: boolean;
  ordering?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDTransferRow>> {
  return bsdFetch<PaginatedResponse<BSDTransferRow>>("/transfers/", {
    query: {
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.playerId != null ? { player_id: args.playerId } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
      ...(args?.fromTeamId != null ? { from_team_id: args.fromTeamId } : {}),
      ...(args?.toTeamId != null ? { to_team_id: args.toTeamId } : {}),
      ...(args?.dateFrom ? { date_from: args.dateFrom } : {}),
      ...(args?.dateTo ? { date_to: args.dateTo } : {}),
      ...(args?.minFee != null ? { min_fee: args.minFee } : {}),
      ...(args?.hasFee != null ? { has_fee: args.hasFee } : {}),
      ...(args?.ordering ? { ordering: args.ordering } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 10 * 60_000,
  }).catch(() => ({ results: [] as BSDTransferRow[] }));
}

export async function getBsdTransfersLedger(args: {
  teamId?: string | number;
  leagueId?: string | number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<BSDTransferLedgerRow[]> {
  const payload = await bsdFetch<PaginatedResponse<BSDTransferLedgerRow> | BSDTransferLedgerRow[]>(
    "/transfers/ledger/",
    {
      query: {
        ...(args.teamId != null ? { team_id: args.teamId } : {}),
        ...(args.leagueId != null ? { league_id: args.leagueId } : {}),
        ...(args.dateFrom ? { date_from: args.dateFrom } : {}),
        ...(args.dateTo ? { date_to: args.dateTo } : {}),
      },
      ttlMs: 30 * 60_000,
    },
  ).catch(() => ({ results: [] as BSDTransferLedgerRow[] }));
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdTransfersRoutes(args: {
  teamId?: string | number;
  leagueId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  minMoves?: number;
  limit?: number;
}): Promise<BSDTransferRouteRow[]> {
  const payload = await bsdFetch<PaginatedResponse<BSDTransferRouteRow>>(
    "/transfers/routes/",
    {
      query: {
        ...(args.teamId != null ? { team_id: args.teamId } : {}),
        ...(args.leagueId != null ? { league_id: args.leagueId } : {}),
        ...(args.dateFrom ? { date_from: args.dateFrom } : {}),
        ...(args.dateTo ? { date_to: args.dateTo } : {}),
        ...(args.minMoves != null ? { min_moves: args.minMoves } : {}),
        limit: args.limit ?? 50,
        offset: 0,
      },
      ttlMs: 30 * 60_000,
    },
  ).catch(() => ({ results: [] as BSDTransferRouteRow[] }));
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdWorldCupSquads(args?: {
  team?: string | number;
  group?: string;
  status?: string;
  hasPlayer?: boolean;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDWorldCupSquadRow>> {
  return bsdFetch<PaginatedResponse<BSDWorldCupSquadRow>>("/worldcup/squads/", {
    query: {
      ...(args?.team != null ? { team: args.team } : {}),
      ...(args?.group ? { group: args.group } : {}),
      ...(args?.status ? { status: args.status } : {}),
      ...(args?.hasPlayer != null ? { has_player: args.hasPlayer } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 30 * 60_000,
  }).catch(() => ({ results: [] as BSDWorldCupSquadRow[] }));
}

export async function getBsdWorldCupSquadByTeam(
  teamId: string | number,
): Promise<BSDWorldCupSquadRow | null> {
  return bsdFetch<BSDWorldCupSquadRow>(
    `/worldcup/squads/${encodeURIComponent(String(teamId))}/`,
    {
      ttlMs: 30 * 60_000,
    },
  ).catch(() => null);
}

export async function getBsdEntitySocial(args: {
  entity: "teams" | "players" | "events" | "managers";
  id: string | number;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<Array<Record<string, unknown>>> {
  const payload = await bsdFetch<
    PaginatedResponse<Record<string, unknown>> | Array<Record<string, unknown>>
  >(`/${args.entity}/${encodeURIComponent(String(args.id))}/social/`, {
    query: {
      ...(args.type ? { type: args.type } : {}),
      limit: args.limit ?? 20,
      offset: args.offset ?? 0,
    },
    ttlMs: 10 * 60_000,
  }).catch(() => ({ results: [] as Array<Record<string, unknown>> }));
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdManagers(args?: {
  name?: string;
  teamId?: string | number;
  leagueId?: string | number;
  nationalityCode?: string;
  tacticalProfile?: string;
  teamStyle?: string;
  minMatches?: number;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDManager>> {
  return bsdFetch<PaginatedResponse<BSDManager>>("/managers/", {
    query: {
      ...(args?.name ? { name: args.name } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.nationalityCode ? { nationality_code: args.nationalityCode } : {}),
      ...(args?.tacticalProfile ? { tactical_profile: args.tacticalProfile } : {}),
      ...(args?.teamStyle ? { team_style: args.teamStyle } : {}),
      ...(args?.minMatches != null ? { min_matches: args.minMatches } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 10 * 60_000,
  }).catch(() => ({ results: [] as BSDManager[] }));
}

export async function getBsdManagerById(
  managerId: string | number,
): Promise<BSDManager | null> {
  return bsdFetch<BSDManager>(`/managers/${encodeURIComponent(String(managerId))}/`, {
    ttlMs: 30 * 60_000,
  }).catch(() => null);
}

export async function getBsdManagerCareer(args: {
  managerId: string | number;
  window?: number;
}): Promise<BSDManagerCareerRow[]> {
  const payload = await bsdFetch<
    PaginatedResponse<BSDManagerCareerRow> | BSDManagerCareerRow[]
  >(`/managers/${encodeURIComponent(String(args.managerId))}/career/`, {
    query: args.window != null ? { window: args.window } : undefined,
    ttlMs: 30 * 60_000,
  }).catch(() => ({ results: [] as BSDManagerCareerRow[] }));
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdManagerMatches(args: {
  managerId: string | number;
  dateFrom?: string;
  dateTo?: string;
  leagueId?: string | number;
  teamId?: string | number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDEvent>> {
  return bsdFetch<PaginatedResponse<BSDEvent>>(
    `/managers/${encodeURIComponent(String(args.managerId))}/matches/`,
    {
      query: {
        ...(args.dateFrom ? { date_from: args.dateFrom } : {}),
        ...(args.dateTo ? { date_to: args.dateTo } : {}),
        ...(args.leagueId != null ? { league_id: args.leagueId } : {}),
        ...(args.teamId != null ? { team_id: args.teamId } : {}),
        ...(args.status ? { status: args.status } : {}),
        limit: args.limit ?? 50,
        offset: args.offset ?? 0,
      },
      ttlMs: 10 * 60_000,
    },
  ).catch(() => ({ results: [] as BSDEvent[] }));
}

export async function getBsdReferees(args?: {
  name?: string;
  countryCode?: string;
  leagueId?: string | number;
  minMatches?: number;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDReferee>> {
  return bsdFetch<PaginatedResponse<BSDReferee>>("/referees/", {
    query: {
      ...(args?.name ? { name: args.name } : {}),
      ...(args?.countryCode ? { country_code: args.countryCode } : {}),
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.minMatches != null ? { min_matches: args.minMatches } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 10 * 60_000,
  }).catch(() => ({ results: [] as BSDReferee[] }));
}

export async function getBsdRefereeById(
  refereeId: string | number,
): Promise<BSDReferee | null> {
  return bsdFetch<BSDReferee>(`/referees/${encodeURIComponent(String(refereeId))}/`, {
    ttlMs: 30 * 60_000,
  }).catch(() => null);
}

export async function getBsdRefereeMatches(args: {
  refereeId: string | number;
  dateFrom?: string;
  dateTo?: string;
  leagueId?: string | number;
  seasonId?: string | number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDEvent>> {
  return bsdFetch<PaginatedResponse<BSDEvent>>(
    `/referees/${encodeURIComponent(String(args.refereeId))}/matches/`,
    {
      query: {
        ...(args.dateFrom ? { date_from: args.dateFrom } : {}),
        ...(args.dateTo ? { date_to: args.dateTo } : {}),
        ...(args.leagueId != null ? { league_id: args.leagueId } : {}),
        ...(args.seasonId != null ? { season_id: args.seasonId } : {}),
        ...(args.status ? { status: args.status } : {}),
        limit: args.limit ?? 50,
        offset: args.offset ?? 0,
      },
      ttlMs: 10 * 60_000,
    },
  ).catch(() => ({ results: [] as BSDEvent[] }));
}

export async function getBsdVenues(args?: {
  name?: string;
  countryCode?: string;
  city?: string;
  minCapacity?: number;
  teamId?: string | number;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDVenue>> {
  return bsdFetch<PaginatedResponse<BSDVenue>>("/venues/", {
    query: {
      ...(args?.name ? { name: args.name } : {}),
      ...(args?.countryCode ? { country_code: args.countryCode } : {}),
      ...(args?.city ? { city: args.city } : {}),
      ...(args?.minCapacity != null ? { min_capacity: args.minCapacity } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 10 * 60_000,
  }).catch(() => ({ results: [] as BSDVenue[] }));
}

export async function getBsdVenueById(
  venueId: string | number,
): Promise<BSDVenue | null> {
  return bsdFetch<BSDVenue>(`/venues/${encodeURIComponent(String(venueId))}/`, {
    ttlMs: 30 * 60_000,
  }).catch(() => null);
}

export async function getBsdVenueCompetitions(
  venueId: string | number,
): Promise<BSDVenueCompetitionRow[]> {
  const payload = await bsdFetch<
    PaginatedResponse<BSDVenueCompetitionRow> | BSDVenueCompetitionRow[]
  >(`/venues/${encodeURIComponent(String(venueId))}/competitions/`, {
    ttlMs: 30 * 60_000,
  }).catch(() => ({ results: [] as BSDVenueCompetitionRow[] }));
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function getBsdPlayerById(
  playerId: string | number,
): Promise<BSDPlayer | null> {
  return bsdFetch<BSDPlayer>(`/players/${encodeURIComponent(String(playerId))}/`, {
    ttlMs: 24 * 60 * 60_000,
  }).catch(() => null);
}

export async function getBsdPlayerStats(args: {
  playerId: string | number;
  seasonId?: string | number;
  teamId?: string | number;
  leagueId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<BSDPlayerStatRow[]> {
  return fetchAllPages<BSDPlayerStatRow>(`/players/${encodeURIComponent(String(args.playerId))}/stats/`, {
    query: {
      ...(args.seasonId != null ? { season_id: args.seasonId } : {}),
      ...(args.teamId != null ? { team_id: args.teamId } : {}),
      ...(args.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args.dateFrom ? { date_from: args.dateFrom } : {}),
      ...(args.dateTo ? { date_to: args.dateTo } : {}),
      limit: args.limit ?? 100,
      offset: 0,
    },
    ttlMs: 10 * 60_000,
    maxPages: 5,
  }).catch(() => []);
}

export async function getBsdPlayerTransfers(
  playerId: string | number,
): Promise<BSDTransferRow[]> {
  return fetchAllPages<BSDTransferRow>(`/players/${encodeURIComponent(String(playerId))}/transfers/`, {
    query: { limit: 100, offset: 0 },
    ttlMs: 24 * 60 * 60_000,
    maxPages: 3,
  }).catch(() => []);
}

export async function getBsdPlayerCareer(
  playerId: string | number,
): Promise<BSDCareerRow[]> {
  return fetchAllPages<BSDCareerRow>(`/players/${encodeURIComponent(String(playerId))}/career/`, {
    query: { limit: 100, offset: 0 },
    ttlMs: 24 * 60 * 60_000,
    maxPages: 3,
  }).catch(() => []);
}

export async function getBsdPlayerNationalTeam(
  playerId: string | number,
): Promise<BSDNationalTeamRow | null> {
  return bsdFetch<BSDNationalTeamRow>(
    `/players/${encodeURIComponent(String(playerId))}/national-team/`,
    { ttlMs: 24 * 60 * 60_000 },
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

export async function getBsdEventPolymarket(
  eventId: string | number,
): Promise<BSDPolymarketResponse | null> {
  return bsdFetch<BSDPolymarketResponse>(
    `/events/${encodeURIComponent(String(eventId))}/polymarket/`,
    {
      ttlMs: 60_000,
    },
  ).catch(() => null);
}

export async function getBsdPredictions(args?: {
  status?: string;
  leagueId?: string | number;
  seasonId?: string | number;
  teamId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  minConfidence?: number;
  recommended?: boolean;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<BSDPredictionResponse>> {
  return bsdFetch<PaginatedResponse<BSDPredictionResponse>>("/predictions/", {
    query: {
      ...(args?.status ? { status: args.status } : {}),
      ...(args?.leagueId != null ? { league_id: args.leagueId } : {}),
      ...(args?.seasonId != null ? { season_id: args.seasonId } : {}),
      ...(args?.teamId != null ? { team_id: args.teamId } : {}),
      ...(args?.dateFrom ? { date_from: args.dateFrom } : {}),
      ...(args?.dateTo ? { date_to: args.dateTo } : {}),
      ...(args?.minConfidence != null ? { min_confidence: args.minConfidence } : {}),
      ...(args?.recommended != null ? { recommended: args.recommended } : {}),
      limit: args?.limit ?? 50,
      offset: args?.offset ?? 0,
    },
    ttlMs: 2 * 60_000,
  }).catch(() => ({ results: [] as BSDPredictionResponse[] }));
}

export async function getBsdPredictionById(
  predictionId: string | number,
): Promise<BSDPredictionResponse | null> {
  return bsdFetch<BSDPredictionResponse>(
    `/predictions/${encodeURIComponent(String(predictionId))}/`,
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
