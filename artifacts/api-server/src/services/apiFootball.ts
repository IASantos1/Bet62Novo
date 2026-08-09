// API-Football (api-sports.io) — real match events for live football:
// goals (with scorer/assist player name), yellow/red cards, substitutions,
// and VAR reviews when one actually occurs. Added 2026-08-09 specifically to
// close a gap PulseScore can't: PulseScore carries no red-card or VAR signal
// at all (only a goal-based score-diff trigger — see football.ts's
// isFulltimeFreeze/goalScored comments in matches.ts), so a red card or VAR
// review currently never suspends betting there. Also carries team crest
// URLs directly on the fixture (teams.home/away.logo) — a more direct source
// than the existing SportsAPI Pro /search-based crest lookup
// (sportsApiTeamLookup.ts), which needs a separate request per team.
//
// Verified against a real GET /fixtures?live=all response (2026-08-09, 41
// live fixtures worldwide): fixture.id/status.short("1H"/"HT"/"2H"/...)/
// status.elapsed, league.id/name/country, teams.home/away.{id,name,logo},
// goals.home/away, events[] with {time:{elapsed,extra}, team, player:
// {id,name}, assist:{id,name}, type:("Goal"|"Card"|"subst"), detail:
// ("Normal Goal"|"Penalty"|"Own Goal"|"Yellow Card"|"Red Card"|
// "Substitution N"), comments}. No "Var"-typed event was present in that
// specific sample (VAR reviews are rare — most matches never have one, not
// evidence the API lacks the field) — extractApiFootballEvents below passes
// every event's raw `type`/`detail` through unfiltered rather than allow-
// listing known types, so a VAR event is captured the instant one is seen,
// without needing a code change to recognise it.
import { CONFIG } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { teamNamesMatch } from "./pulsescore/teamMatch.js";

export type ApiFootballEvent = {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  teamName: string;
  playerName: string | null;
  assistName: string | null;
  type: string; // "Goal" | "Card" | "subst" | "Var" | ... — passed through raw, not allow-listed
  detail: string; // "Normal Goal" | "Penalty" | "Own Goal" | "Yellow Card" | "Red Card" | "Substitution N" | ...
  comments: string | null;
};

export type ApiFootballFixture = {
  fixtureId: number;
  statusShort: string; // "1H" | "HT" | "2H" | "ET" | "P" | "FT" | ...
  elapsed: number | null;
  leagueName: string;
  leagueCountry: string;
  home: { id: number; name: string; logo: string | null };
  away: { id: number; name: string; logo: string | null };
  goalsHome: number | null;
  goalsAway: number | null;
  events: ApiFootballEvent[];
};

type RawApiFootballEvent = {
  time?: { elapsed?: number; extra?: number | null };
  team?: { id?: number; name?: string };
  player?: { id?: number; name?: string | null };
  assist?: { id?: number; name?: string | null };
  type?: string;
  detail?: string;
  comments?: string | null;
};

type RawApiFootballFixture = {
  fixture?: {
    id?: number;
    status?: { short?: string; elapsed?: number | null };
  };
  league?: { name?: string; country?: string };
  teams?: {
    home?: { id?: number; name?: string; logo?: string | null };
    away?: { id?: number; name?: string; logo?: string | null };
  };
  goals?: { home?: number | null; away?: number | null };
  events?: RawApiFootballEvent[];
};

type RawApiFootballResponse = {
  response?: RawApiFootballFixture[];
  errors?: unknown;
};

function extractEvents(raw: RawApiFootballEvent[] | undefined): ApiFootballEvent[] {
  const out: ApiFootballEvent[] = [];
  for (const ev of raw ?? []) {
    if (!ev.type || ev.team?.id === undefined || ev.time?.elapsed === undefined) continue;
    out.push({
      minute: ev.time.elapsed,
      extraMinute: ev.time.extra ?? null,
      teamId: ev.team.id,
      teamName: ev.team.name ?? "",
      playerName: ev.player?.name ?? null,
      assistName: ev.assist?.name ?? null,
      type: ev.type,
      detail: ev.detail ?? "",
      comments: ev.comments ?? null,
    });
  }
  return out;
}

function toFixture(raw: RawApiFootballFixture): ApiFootballFixture | null {
  const fixtureId = raw.fixture?.id;
  const home = raw.teams?.home;
  const away = raw.teams?.away;
  if (fixtureId === undefined || !home?.name || !away?.name) return null;
  return {
    fixtureId,
    statusShort: raw.fixture?.status?.short ?? "",
    elapsed: raw.fixture?.status?.elapsed ?? null,
    leagueName: raw.league?.name ?? "",
    leagueCountry: raw.league?.country ?? "",
    home: { id: home.id ?? 0, name: home.name, logo: home.logo ?? null },
    away: { id: away.id ?? 0, name: away.name, logo: away.logo ?? null },
    goalsHome: raw.goals?.home ?? null,
    goalsAway: raw.goals?.away ?? null,
    events: extractEvents(raw.events),
  };
}

const LIVE_TTL_MS = 12_000;
let cache: { fixtures: ApiFootballFixture[]; fetchedAt: number } | null = null;
let inFlight: Promise<ApiFootballFixture[]> | null = null;

let requestsToday = 0;
let usageDate = todayUtc();
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
function rollUsageDateIfNeeded(): void {
  const d = todayUtc();
  if (d !== usageDate) {
    usageDate = d;
    requestsToday = 0;
  }
}

export function getApiFootballUsage(): { requestsToday: number; date: string } {
  rollUsageDateIfNeeded();
  return { requestsToday, date: usageDate };
}

async function fetchLiveFixturesUncached(): Promise<ApiFootballFixture[]> {
  rollUsageDateIfNeeded();
  requestsToday += 1;
  const resp = await fetch(`${CONFIG.API_FOOTBALL_BASE_URL}/fixtures?live=all`, {
    headers: { "x-apisports-key": CONFIG.API_FOOTBALL_KEY },
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) {
    throw new Error(`[api-football] ${resp.status} on /fixtures?live=all`);
  }
  const data = (await resp.json()) as RawApiFootballResponse;
  const fixtures: ApiFootballFixture[] = [];
  for (const raw of data.response ?? []) {
    const f = toFixture(raw);
    if (f) fixtures.push(f);
  }
  return fixtures;
}

/** All live football fixtures from API-Football, REST-polled, cached for
 * LIVE_TTL_MS. A single request covers every live match worldwide — see
 * this file's header. Empty array if API_FOOTBALL_KEY isn't configured, or
 * the upstream call fails on the very first attempt (nothing cached yet to
 * fall back to). */
export async function getApiFootballLiveFixtures(): Promise<ApiFootballFixture[]> {
  if (!CONFIG.API_FOOTBALL_KEY) return [];
  const now = Date.now();
  if (cache && now - cache.fetchedAt < LIVE_TTL_MS) return cache.fixtures;
  if (!inFlight) {
    inFlight = fetchLiveFixturesUncached()
      .then((fixtures) => {
        cache = { fixtures, fetchedAt: Date.now() };
        return fixtures;
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[api-football] live fetch failed — serving stale cache",
        );
        return cache?.fixtures ?? [];
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Finds the API-Football fixture matching a tracked match by team name
 * (tolerant cross-provider match, same helper used throughout the PulseScore
 * integration). `fixtures` should be one already-fetched
 * getApiFootballLiveFixtures() batch — never call this per-match against a
 * fresh fetch, it would multiply request count. */
export function findApiFootballFixture(
  home: string,
  away: string,
  fixtures: ApiFootballFixture[],
): ApiFootballFixture | null {
  return (
    fixtures.find(
      (f) => teamNamesMatch(home, f.home.name) && teamNamesMatch(away, f.away.name),
    ) ?? null
  );
}

const RED_CARD_DETAIL = "red card";
/** True if this fixture has a Card event whose detail is a red card
 * (including "Second Yellow card", which API-Football itself already
 * expands to an effective red — matched by substring, not exact equality,
 * so that variant is included without needing to enumerate every wording
 * API-Football might use for it). Used to trigger the same suspension a
 * goal does — PulseScore has no red-card signal of its own (see this file's
 * header). */
export function fixtureHasRedCard(fixture: ApiFootballFixture): boolean {
  return fixture.events.some(
    (ev) => ev.type === "Card" && ev.detail.toLowerCase().includes(RED_CARD_DETAIL),
  );
}

/** True if this fixture has ANY event whose type looks like a VAR review
 * ("Var", "VAR", ...) — matched case-insensitively against the raw `type`
 * API-Football sends, not allow-listed to one exact known spelling, since no
 * real VAR-typed event has been seen yet to confirm the exact casing (see
 * this file's header). */
export function fixtureHasVarReview(fixture: ApiFootballFixture): boolean {
  return fixture.events.some((ev) => ev.type.toLowerCase() === "var");
}

/** Most recent goal-scorer name for this fixture, if any — used to enrich
 * the "GOLO!" suspension banner with who actually scored instead of just the
 * team name PulseScore already provides. Returns the LAST goal event by
 * array order (API-Football lists events chronologically), since that's the
 * one relevant to a just-detected score change. */
export function latestGoalScorer(fixture: ApiFootballFixture): string | null {
  for (let i = fixture.events.length - 1; i >= 0; i--) {
    const ev = fixture.events[i]!;
    if (ev.type === "Goal") return ev.playerName;
  }
  return null;
}

// ── Live match statistics (shots, possession, corners, fouls, ...) ────────
// GET /fixtures/statistics?fixture={id} — unlike /fixtures?live=all, this is
// PER FIXTURE, not one request for every live match, so it's called on
// demand (getApiFootballStatistics below) only for matches actually being
// tracked in buildFootballLiveFromPulseScore, each with its own cache/TTL,
// to stay well inside the 150k/day budget even with many concurrent live
// matches: a 30s TTL against N concurrent matches is N requests per 30s,
// e.g. 30 concurrent matches all day is ~86k/day, not 30 req/s.
//
// NOT yet verified against a real live response the way /fixtures?live=all
// was earlier this session — API-Football's own public docs describe a
// stable, long-standing shape (response: one entry per team, each with
// team.{id,name} and a statistics: [{type, value}] array — type strings like
// "Shots on Goal"/"Shots off Goal"/"Total Shots"/"Blocked Shots"/"Fouls"/
// "Corner Kicks"/"Offsides"/"Ball Possession"/"Yellow Cards"/"Red Cards"/
// "Goalkeeper Saves"/"Total passes"/"Passes accurate"/"Passes %", value
// either a number or a "NN%" string), built against that rather than a
// captured sample — extractStatValue below is defensive about both possible
// value shapes and STAT_TYPE_MAP is matched case-insensitively so an
// unexpected casing/wording variant degrades to "field absent", not a crash.
// Confirm against a real live match once this ships (2026-08-09 follow-up).
export type ApiFootballTeamStats = {
  shotsTotal: number | null;
  shotsOnTarget: number | null;
  possessionPct: number | null;
  corners: number | null;
  fouls: number | null;
  offsides: number | null;
  yellowCards: number | null;
  redCards: number | null;
  // Every raw {type: value} pair as sent, case-preserved — lets a caller
  // reach a stat category not promoted to its own field above without
  // needing a code change here first (same "don't allow-list" reasoning as
  // events/VAR elsewhere in this file).
  raw: Record<string, string | number | null>;
};

export type ApiFootballFixtureStatistics = {
  fixtureId: number;
  home: ApiFootballTeamStats | null;
  away: ApiFootballTeamStats | null;
};

type RawStatEntry = { type?: string; value?: string | number | null };
type RawTeamStatsBlock = {
  team?: { id?: number; name?: string };
  statistics?: RawStatEntry[];
};
type RawStatisticsResponse = { response?: RawTeamStatsBlock[] };

function parseStatNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.replace("%", "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const STAT_TYPE_MAP: Record<string, keyof Omit<ApiFootballTeamStats, "raw">> = {
  "total shots": "shotsTotal",
  "shots on goal": "shotsOnTarget",
  "ball possession": "possessionPct",
  "corner kicks": "corners",
  fouls: "fouls",
  offsides: "offsides",
  "yellow cards": "yellowCards",
  "red cards": "redCards",
};

/** Exported for testing against a realistic raw {team, statistics: [{type,
 * value}]} block shape — see this section's header for why the exact shape
 * isn't verified against a real live response yet. */
export function extractTeamStats(block: RawTeamStatsBlock | undefined): ApiFootballTeamStats | null {
  if (!block?.statistics) return null;
  const out: ApiFootballTeamStats = {
    shotsTotal: null,
    shotsOnTarget: null,
    possessionPct: null,
    corners: null,
    fouls: null,
    offsides: null,
    yellowCards: null,
    redCards: null,
    raw: {},
  };
  for (const entry of block.statistics) {
    if (!entry.type) continue;
    out.raw[entry.type] = entry.value ?? null;
    const key = STAT_TYPE_MAP[entry.type.toLowerCase()];
    if (key) out[key] = parseStatNumber(entry.value);
  }
  return out;
}

const STATS_TTL_MS = 30_000;
const STATS_CACHE_MAX_AGE_MS = 10 * 60_000;
const statsCache = new Map<number, { stats: ApiFootballFixtureStatistics; fetchedAt: number }>();
const statsInFlight = new Map<number, Promise<ApiFootballFixtureStatistics | null>>();

// statsCache is keyed by fixtureId and nothing ever removes an entry once a
// match finishes and stops being fetched — left unchecked this grows for as
// long as the process runs. Swept opportunistically on every fetch (cheap:
// a handful of live matches at once, not thousands) rather than a separate
// timer.
function pruneStatsCache(): void {
  const cutoff = Date.now() - STATS_CACHE_MAX_AGE_MS;
  for (const [id, entry] of statsCache) {
    if (entry.fetchedAt < cutoff) statsCache.delete(id);
  }
}

async function fetchFixtureStatisticsUncached(
  fixtureId: number,
): Promise<ApiFootballFixtureStatistics> {
  rollUsageDateIfNeeded();
  requestsToday += 1;
  const resp = await fetch(
    `${CONFIG.API_FOOTBALL_BASE_URL}/fixtures/statistics?fixture=${fixtureId}`,
    {
      headers: { "x-apisports-key": CONFIG.API_FOOTBALL_KEY },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!resp.ok) {
    throw new Error(`[api-football] ${resp.status} on /fixtures/statistics?fixture=${fixtureId}`);
  }
  const data = (await resp.json()) as RawStatisticsResponse;
  const blocks = data.response ?? [];
  return {
    fixtureId,
    home: extractTeamStats(blocks[0]),
    away: extractTeamStats(blocks[1]),
  };
}

/** Live statistics (shots, possession, corners, fouls, ...) for one fixture,
 * REST-polled and cached per-fixture for STATS_TTL_MS — see this section's
 * header for why this is per-fixture rather than the single-request-for-
 * everything shape /fixtures?live=all uses. Null if API_FOOTBALL_KEY isn't
 * configured, or the upstream call fails on the very first attempt for this
 * fixture (nothing cached yet to fall back to). */
export async function getApiFootballFixtureStatistics(
  fixtureId: number,
): Promise<ApiFootballFixtureStatistics | null> {
  if (!CONFIG.API_FOOTBALL_KEY) return null;
  pruneStatsCache();
  const now = Date.now();
  const cached = statsCache.get(fixtureId);
  if (cached && now - cached.fetchedAt < STATS_TTL_MS) return cached.stats;
  const pending = statsInFlight.get(fixtureId);
  if (pending) return pending;
  const promise = fetchFixtureStatisticsUncached(fixtureId)
    .then((stats) => {
      statsCache.set(fixtureId, { stats, fetchedAt: Date.now() });
      return stats;
    })
    .catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), fixtureId },
        "[api-football] statistics fetch failed — serving stale cache if any",
      );
      return statsCache.get(fixtureId)?.stats ?? null;
    })
    .finally(() => {
      statsInFlight.delete(fixtureId);
    });
  statsInFlight.set(fixtureId, promise);
  return promise;
}
