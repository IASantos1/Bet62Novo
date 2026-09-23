import { CONFIG } from "../../lib/config.js";

type SportMonksEnvelope<T> = {
  data?: T;
  pagination?: {
    count?: number;
    per_page?: number;
    current_page?: number;
    next_page?: number | string | null;
    next_cursor?: string | null;
    has_more?: boolean;
  };
  subscription?: unknown;
  rate_limit?: unknown;
  timezone?: string;
};

export type SportMonksParticipant = {
  id?: number | string;
  name?: string;
  image_path?: string | null;
  meta?: { location?: string | null; winner?: boolean | null } | null;
  location?: string | null;
};

export type SportMonksScore = {
  id?: number | string;
  fixture_id?: number | string;
  participant_id?: number | string;
  type_id?: number | string;
  score?: {
    goals?: number | string | null;
    participant?: string | null;
    description?: string | null;
    goal?: number | string | null;
  } | null;
  description?: string | null;
  goals?: number | string | null;
};

export type SportMonksEvent = {
  id?: number | string;
  fixture_id?: number | string;
  period_id?: number | string;
  participant_id?: number | string;
  type_id?: number | string;
  minute?: number | string | null;
  extra_minute?: number | string | null;
  player_id?: number | string | null;
  related_player_id?: number | string | null;
  player_name?: string | null;
  related_player_name?: string | null;
  result?: string | null;
  addition?: string | null;
  sort_order?: number | string | null;
  name?: string | null;
};

export type SportMonksStatistic = {
  id?: number | string;
  fixture_id?: number | string;
  participant_id?: number | string;
  type_id?: number | string;
  data?: {
    value?: number | string | null;
    total?: number | string | null;
    percentage?: number | string | null;
  } | null;
  value?: number | string | null;
  type?: {
    id?: number | string;
    name?: string | null;
    code?: string | null;
    developer_name?: string | null;
  } | null;
};

export type SportMonksLineupEntry = {
  id?: number | string;
  fixture_id?: number | string;
  team_id?: number | string;
  participant_id?: number | string;
  player_id?: number | string;
  formation_field?: string | number | null;
  jersey_number?: string | number | null;
  position_id?: number | string | null;
  type_id?: number | string | null;
  player_name?: string | null;
  captain?: boolean | null;
  player?: {
    id?: number | string;
    display_name?: string | null;
    common_name?: string | null;
    firstname?: string | null;
    lastname?: string | null;
  } | null;
  details?: Array<{
    type?: { name?: string | null; developer_name?: string | null } | null;
    value?: string | number | null;
  }> | null;
};

export type SportMonksBallCoordinate = {
  id?: number | string;
  fixture_id?: number | string;
  period_id?: number | string;
  timer?: string | null;
  x?: string | number | null;
  y?: string | number | null;
};

export type SportMonksFixture = {
  id: number | string;
  sport_id?: number | string;
  league_id?: number | string;
  season_id?: number | string;
  stage_id?: number | string;
  round_id?: number | string;
  state_id?: number | string;
  venue_id?: number | string;
  name?: string | null;
  starting_at?: string | null;
  starting_at_timestamp?: number | string | null;
  result_info?: string | null;
  leg?: string | null;
  length?: number | string | null;
  has_odds?: boolean | null;
  has_premium_odds?: boolean | null;
  state?: {
    id?: number | string;
    name?: string | null;
    short_name?: string | null;
    state?: string | null;
    developer_name?: string | null;
  } | null;
  league?: {
    id?: number | string;
    name?: string | null;
    short_code?: string | null;
    country?: { id?: number | string; name?: string | null } | null;
  } | null;
  participants?: SportMonksParticipant[] | null;
  scores?: SportMonksScore[] | null;
  events?: SportMonksEvent[] | null;
  statistics?: SportMonksStatistic[] | null;
  lineups?: SportMonksLineupEntry[] | null;
  venue?: {
    id?: number | string;
    name?: string | null;
    city_name?: string | null;
  } | null;
  periods?: Array<{
    id?: number | string;
    type?: string | null;
    started?: boolean | null;
    ended?: boolean | null;
    counts_from?: number | string | null;
    ticking?: boolean | null;
    sort_order?: number | string | null;
    time_added?: number | string | null;
    period_length?: number | string | null;
    minutes?: number | string | null;
    seconds?: number | string | null;
  }> | null;
  ballcoordinates?: SportMonksBallCoordinate[] | null;
  ballCoordinates?: SportMonksBallCoordinate[] | null;
  referee?: {
    id?: number | string;
    name?: string | null;
    common_name?: string | null;
    display_name?: string | null;
  } | null;
};

export type SportMonksStanding = Record<string, unknown>;
export type SportMonksPrediction = Record<string, unknown>;
export type SportMonksPlayer = Record<string, unknown>;
export type SportMonksTopScorer = Record<string, unknown>;
export type SportMonksLeague = {
  id?: number | string;
  name?: string | null;
  currentseason?: {
    id?: number | string;
    name?: string | null;
    is_current?: boolean | null;
  } | null;
  currentSeason?: {
    id?: number | string;
    name?: string | null;
    is_current?: boolean | null;
  } | null;
};

export type SportMonksOddsMarket = {
  id?: number | string;
  legacy_id?: number | string;
  name?: string | null;
  developer_name?: string | null;
  has_winning_calculations?: boolean | null;
};

export type SportMonksBookmaker = {
  id?: number | string;
  legacy_id?: number | string;
  name?: string | null;
};

export type SportMonksOdd = {
  id?: number | string;
  external_id?: number | string;
  fixture_id?: number | string;
  market_id?: number | string;
  bookmaker_id?: number | string;
  label?: string | null;
  value?: string | number | null;
  name?: string | null;
  market_description?: string | null;
  probability?: string | number | null;
  dp3?: string | number | null;
  fractional?: string | null;
  american?: string | number | null;
  winning?: boolean | null;
  suspended?: boolean | null;
  stopped?: boolean | null;
  total?: string | number | null;
  handicap?: string | number | null;
  original_label?: string | null;
  participants?: string | null;
  latest_bookmaker_update?: string | null;
  market?: SportMonksOddsMarket | null;
  bookmaker?: SportMonksBookmaker | null;
  fixture?: SportMonksFixture | null;
};

type CacheEntry<T> = { expiresAt: number; value: T };

const responseCache = new Map<string, CacheEntry<unknown>>();

function requireToken(): string {
  const token = CONFIG.SPORTMONKS_API_TOKEN.trim();
  if (!token) {
    throw Object.assign(new Error("SPORTMONKS_API_TOKEN não configurado"), { status: 503 });
  }
  return token;
}

export function sportMonksEnabled(): boolean {
  return CONFIG.SPORTMONKS_API_TOKEN.trim().length > 0;
}

function sportMonksFallbackDate(daysFromTodayUtc: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromTodayUtc);
  return d.toISOString().slice(0, 10);
}

function sportMonksStateText(fixture: SportMonksFixture): string {
  return String(
    fixture.state?.short_name ??
      fixture.state?.developer_name ??
      fixture.state?.state ??
      fixture.state?.name ??
      "",
  )
    .trim()
    .toLowerCase();
}

function sportMonksIsUpcomingState(fixture: SportMonksFixture): boolean {
  const state = sportMonksStateText(fixture);
  return /not_started|ns|upcoming|scheduled/.test(state);
}

function sportMonksIsFinishedState(fixture: SportMonksFixture): boolean {
  const state = sportMonksStateText(fixture);
  return /finished|full.?time|after_extra_time|after_penalties|ended|closed|ft/.test(
    state,
  );
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const base = CONFIG.SPORTMONKS_BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("api_token", requireToken());
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function sportMonksFetch<T>(
  path: string,
  args: {
    query?: Record<string, string | number | boolean | undefined>;
    ttlMs?: number;
  } = {},
): Promise<T> {
  const url = buildUrl(path, args.query);
  const ttlMs = args.ttlMs ?? 0;
  const now = Date.now();
  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > now) return cached.value as T;

  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await resp.json().catch(() => ({}))) as SportMonksEnvelope<T> & {
    message?: string;
    error?: string;
  };
  if (!resp.ok) {
    const message =
      payload.message ||
      payload.error ||
      `SportMonks respondeu ${resp.status} em ${path}`;
    throw Object.assign(new Error(message), { status: resp.status });
  }
  const value = (payload.data ?? ([] as unknown)) as T;
  if (ttlMs > 0) {
    responseCache.set(url, { value, expiresAt: now + ttlMs });
  }
  return value;
}

async function sportMonksFetchEnvelope<T>(
  path: string,
  args: {
    query?: Record<string, string | number | boolean | undefined>;
    ttlMs?: number;
  } = {},
): Promise<SportMonksEnvelope<T>> {
  const url = buildUrl(path, args.query);
  const ttlMs = args.ttlMs ?? 0;
  const now = Date.now();
  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.value as SportMonksEnvelope<T>;
  }

  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await resp.json().catch(() => ({}))) as SportMonksEnvelope<T> & {
    message?: string;
    error?: string;
  };
  if (!resp.ok) {
    const message =
      payload.message ||
      payload.error ||
      `SportMonks respondeu ${resp.status} em ${path}`;
    throw Object.assign(new Error(message), { status: resp.status });
  }
  if (ttlMs > 0) {
    responseCache.set(url, { value: payload, expiresAt: now + ttlMs });
  }
  return payload;
}

function sportMonksArray<T>(data: T[] | T | undefined): T[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

async function sportMonksFetchAllPages<T>(
  path: string,
  args: {
    query?: Record<string, string | number | boolean | undefined>;
    ttlMs?: number;
    maxPages?: number;
  } = {},
): Promise<T[]> {
  const maxPages = Math.max(1, args.maxPages ?? 8);
  const rows: T[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await sportMonksFetchEnvelope<T[] | T>(path, {
      query: {
        per_page: 50,
        page,
        ...(args.query ?? {}),
      },
      ttlMs: args.ttlMs,
    });

    rows.push(...sportMonksArray(payload.data));

    if (!payload.pagination?.has_more) break;
  }

  return rows;
}

export async function getSportMonksLivescores(include?: string): Promise<SportMonksFixture[]> {
  return sportMonksFetchAllPages<SportMonksFixture>("/football/livescores", {
    query: include ? { include } : undefined,
    ttlMs: 5_000,
    maxPages: 4,
  });
}

export async function getSportMonksInplayLivescores(include?: string): Promise<SportMonksFixture[]> {
  const data = await sportMonksFetch<SportMonksFixture[] | SportMonksFixture>(
    "/football/livescores/inplay",
    {
      query: include ? { include } : undefined,
      ttlMs: 5_000,
    },
  );
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length > 0) return rows;

  const livescores = await getSportMonksLivescores(include).catch(
    () => [] as SportMonksFixture[],
  );
  const liveRows = livescores.filter(
    (fixture) =>
      !sportMonksIsUpcomingState(fixture) &&
      !sportMonksIsFinishedState(fixture),
  );
  if (liveRows.length > 0) return liveRows;

  const fallback = await getSportMonksFixturesBetween({
    startDate: sportMonksFallbackDate(-1),
    endDate: sportMonksFallbackDate(1),
    include,
  }).catch(() => [] as SportMonksFixture[]);

  return fallback.filter(
    (fixture) =>
      !sportMonksIsUpcomingState(fixture) &&
      !sportMonksIsFinishedState(fixture),
  );
}

export async function getSportMonksFixturesBetween(args: {
  startDate: string;
  endDate: string;
  include?: string;
}): Promise<SportMonksFixture[]> {
  return sportMonksFetchAllPages<SportMonksFixture>(
    `/football/fixtures/between/${args.startDate}/${args.endDate}`,
    {
      query: args.include ? { include: args.include } : undefined,
      ttlMs: 120_000,
      maxPages: 8,
    },
  );
}

export async function getSportMonksFixtureById(args: {
  fixtureId: string | number;
  include?: string;
}): Promise<SportMonksFixture | null> {
  const data = await sportMonksFetch<SportMonksFixture>(
    `/football/fixtures/${encodeURIComponent(String(args.fixtureId))}`,
    {
      query: args.include ? { include: args.include } : undefined,
      ttlMs: 10_000,
    },
  );
  return data ?? null;
}

export async function getSportMonksFixturesByTeamRange(args: {
  teamId: string | number;
  startDate: string;
  endDate: string;
  include?: string;
}): Promise<SportMonksFixture[]> {
  return sportMonksFetchAllPages<SportMonksFixture>(
    `/football/fixtures/between/${args.startDate}/${args.endDate}/${encodeURIComponent(String(args.teamId))}`,
    {
      query: args.include ? { include: args.include } : undefined,
      ttlMs: 120_000,
      maxPages: 4,
    },
  );
}

export async function getSportMonksLiveStandingsByLeague(
  leagueId: string | number,
  include?: string,
): Promise<SportMonksStanding[]> {
  const data = await sportMonksFetch<SportMonksStanding[] | SportMonksStanding>(
    `/football/standings/live/leagues/${encodeURIComponent(String(leagueId))}`,
    {
      query: include ? { include } : undefined,
      ttlMs: 15_000,
    },
  );
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getSportMonksStandingsBySeason(
  seasonId: string | number,
  include?: string,
): Promise<SportMonksStanding[]> {
  const data = await sportMonksFetch<SportMonksStanding[] | SportMonksStanding>(
    `/football/standings/seasons/${encodeURIComponent(String(seasonId))}`,
    {
      query: include ? { include } : undefined,
      ttlMs: 60_000,
    },
  );
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getSportMonksLeagueById(args: {
  leagueId: string | number;
  include?: string;
}): Promise<SportMonksLeague | null> {
  const data = await sportMonksFetch<SportMonksLeague>(
    `/football/leagues/${encodeURIComponent(String(args.leagueId))}`,
    {
      query: args.include ? { include: args.include } : undefined,
      ttlMs: 300_000,
    },
  );
  return data ?? null;
}

export async function getSportMonksPlayerById(playerId: string | number): Promise<SportMonksPlayer | null> {
  const data = await sportMonksFetch<SportMonksPlayer>(
    `/football/players/${encodeURIComponent(String(playerId))}`,
    { ttlMs: 60_000 },
  );
  return data ?? null;
}

export async function getSportMonksPredictionsByFixtureId(
  fixtureId: string | number,
): Promise<SportMonksPrediction[]> {
  const data = await sportMonksFetch<SportMonksPrediction[] | SportMonksPrediction>(
    `/football/predictions/probabilities/fixtures/${encodeURIComponent(String(fixtureId))}`,
    { ttlMs: 30_000 },
  );
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getSportMonksTopScorersBySeason(
  seasonId: string | number,
  include?: string,
): Promise<SportMonksTopScorer[]> {
  const data = await sportMonksFetch<SportMonksTopScorer[] | SportMonksTopScorer>(
    `/football/topscorers/seasons/${encodeURIComponent(String(seasonId))}`,
    {
      query: include ? { include } : undefined,
      ttlMs: 300_000,
    },
  );
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getSportMonksPrematchOddsByFixtureId(args: {
  fixtureId: string | number;
  include?: string;
}): Promise<SportMonksOdd[]> {
  const data = await sportMonksFetch<SportMonksOdd[] | SportMonksOdd>(
    `/football/odds/pre-match/fixtures/${encodeURIComponent(String(args.fixtureId))}`,
    {
      query: args.include ? { include: args.include } : undefined,
      ttlMs: 20_000,
    },
  );
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getSportMonksInplayOddsByFixtureId(args: {
  fixtureId: string | number;
  include?: string;
}): Promise<SportMonksOdd[]> {
  const data = await sportMonksFetch<SportMonksOdd[] | SportMonksOdd>(
    `/football/odds/inplay/fixtures/${encodeURIComponent(String(args.fixtureId))}`,
    {
      query: args.include ? { include: args.include } : undefined,
      ttlMs: 5_000,
    },
  );
  return Array.isArray(data) ? data : data ? [data] : [];
}
