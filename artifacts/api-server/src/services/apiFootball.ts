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
