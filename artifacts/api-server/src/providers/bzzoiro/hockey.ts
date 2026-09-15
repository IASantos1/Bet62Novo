// sports.bzzoiro.com Hockey API — confirmed real 2026-09-14 via the user's
// own pasted docs (base https://sports.bzzoiro.com/hockey/api/v2/, same
// Sports Addon gating and Authorization: Token auth as basketball — see
// basketball.ts's own header for the shared rationale/context). Resource
// name here is `/matches/`, not `/events/` (bzzoiro's own naming differs
// per sport — confirmed from the real endpoint list, not assumed).
// No WebSocket for hockey (only football and tennis have one) — REST
// polling of GET /matches/live/ only.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { BzzoiroStickSportOddsResponse } from "./basketball.js";

const HOCKEY_BASE_URL = "https://sports.bzzoiro.com/hockey/api/v2";

export type BzzoiroHockeyTeam = { id: number; name: string; short_name?: string; elo_rating?: number };
export type BzzoiroHockeyLeague = { id: number; name: string; country?: string };

export type BzzoiroHockeyMatch = {
  id: number;
  league: BzzoiroHockeyLeague;
  home_team: BzzoiroHockeyTeam;
  away_team: BzzoiroHockeyTeam;
  match_date: string;
  status: string; // "scheduled" | "live" | "finished" | "awarded" | "postponed" | "cancelled"
  home_score: number | null;
  away_score: number | null;
  is_overtime?: boolean;
  is_shootout?: boolean;
  // Only present on GET /matches/{id}/ (live detail) per the real docs —
  // the plain list/live-list rows don't carry these.
  periods_score?: string;
  current_period?: number;
  current_minute?: number;
};

export type BzzoiroHockeyListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: BzzoiroHockeyMatch[];
};

async function hockeyGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${HOCKEY_BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Token ${CONFIG.BZZOIRO_API_KEY}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`[bzzoiro-hockey] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  return (await resp.json()) as T;
}

const UPCOMING_PAGE_LIMIT = 100;
const UPCOMING_MAX_PAGES = 10;

export async function getBzzoiroHockeyUpcoming(dateFrom: string, dateTo: string): Promise<BzzoiroHockeyMatch[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  const out: BzzoiroHockeyMatch[] = [];
  try {
    let offset = 0;
    for (let page = 0; page < UPCOMING_MAX_PAGES; page++) {
      const resp = await hockeyGet<BzzoiroHockeyListResponse>("/matches/", {
        date_from: dateFrom,
        date_to: dateTo,
        limit: UPCOMING_PAGE_LIMIT,
        offset,
      });
      out.push(...resp.results);
      if (!resp.next) break;
      offset += UPCOMING_PAGE_LIMIT;
    }
  } catch (err) {
    logger.error({ err }, "[bzzoiro-hockey] getBzzoiroHockeyUpcoming failed");
  }
  return out;
}

export async function getBzzoiroHockeyLive(): Promise<BzzoiroHockeyMatch[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  try {
    const resp = await hockeyGet<BzzoiroHockeyListResponse>("/matches/live/");
    return resp.results ?? [];
  } catch (err) {
    logger.error({ err }, "[bzzoiro-hockey] getBzzoiroHockeyLive failed");
    return [];
  }
}

/** Live-list rows don't carry current_period/current_minute per the real
 * docs example — only GET /matches/{id}/ does. Fetched per-match, one call
 * per currently-live hockey game (typically single digits at once), same
 * cost pattern the football live builder already accepts for per-fixture
 * detail calls. */
export async function getBzzoiroHockeyMatchDetail(matchId: number): Promise<BzzoiroHockeyMatch | null> {
  if (!CONFIG.BZZOIRO_API_KEY) return null;
  try {
    return await hockeyGet<BzzoiroHockeyMatch>(`/matches/${matchId}/`);
  } catch (err) {
    logger.error({ err, matchId }, "[bzzoiro-hockey] getBzzoiroHockeyMatchDetail failed");
    return null;
  }
}

export async function getBzzoiroHockeyOdds(matchId: number): Promise<BzzoiroStickSportOddsResponse | null> {
  if (!CONFIG.BZZOIRO_API_KEY) return null;
  try {
    return await hockeyGet<BzzoiroStickSportOddsResponse>(`/matches/${matchId}/odds/`);
  } catch (err) {
    logger.error({ err, matchId }, "[bzzoiro-hockey] getBzzoiroHockeyOdds failed");
    return null;
  }
}
