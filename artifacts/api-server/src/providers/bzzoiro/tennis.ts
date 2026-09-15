// sports.bzzoiro.com Tennis API — confirmed real 2026-09-14 via the user's
// own pasted docs (base https://sports.bzzoiro.com/tennis/api/v2/, same
// Sports Addon gating and Authorization: Token auth as basketball/hockey —
// see basketball.ts's own header for the shared rationale).
//
// IMPORTANT gap, flagged rather than guessed: bzzoiro's docs mention a
// tennis WebSocket channel (the shared multi-sport legacy channel at
// wss://sports.bzzoiro.com/ws/live/, subscribing with {"sport":"tennis"})
// but the user never pasted its actual frame reference — only football's
// frame shapes were captured in full. The real REST /matches/live/ example
// captured here also carries no in-play point/game/server field, only
// sets won and status — unlike api-tennis.com's already-shipped WebSocket,
// which pushes real point-by-point, current game score and server. Until
// a real tennis WS frame capture (or a /matches/{id}/point-by-point/ REST
// poll) is verified, this client is REST-only and live coverage here is
// shallower than the existing api-tennis.com integration. Wired as an
// ADDITIONAL candidate (never a hard cut of api-tennis.com) so the
// existing chooseLiveProvider quality gate — which favors real clock/point
// data — keeps picking whichever source is actually richer per match.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

const TENNIS_BASE_URL = "https://sports.bzzoiro.com/tennis/api/v2";

export type BzzoiroTennisPlayer = { id: number; name: string; country_code?: string };
export type BzzoiroTennisTournament = { id: number; name: string; surface?: string };

export type BzzoiroTennisMatch = {
  id: number;
  tournament: BzzoiroTennisTournament;
  player1: BzzoiroTennisPlayer;
  player2: BzzoiroTennisPlayer;
  match_date: string;
  status: string; // scheduled | live | interrupted | finished | walkover | retired | postponed | cancelled
  round_name?: string;
  player1_sets: number | null;
  player2_sets: number | null;
  sets_detail?: string;
  winner_id: number | null;
  odds_player1?: number;
  odds_player2?: number;
};

export type BzzoiroTennisListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: BzzoiroTennisMatch[];
};

export type BzzoiroTennisOdds = { match_id: number; odds_player1: number; odds_player2: number };

const BZZOIRO_TENNIS_LIVE_STATUSES = new Set(["live", "interrupted"]);
const BZZOIRO_TENNIS_TERMINAL_STATUSES = new Set(["finished", "walkover", "retired", "cancelled"]);

async function tennisGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${TENNIS_BASE_URL}${path}`);
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
    throw new Error(`[bzzoiro-tennis] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  return (await resp.json()) as T;
}

const UPCOMING_PAGE_LIMIT = 100;
const UPCOMING_MAX_PAGES = 10;

export async function getBzzoiroTennisUpcoming(dateFrom: string, dateTo: string): Promise<BzzoiroTennisMatch[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  const out: BzzoiroTennisMatch[] = [];
  try {
    let offset = 0;
    for (let page = 0; page < UPCOMING_MAX_PAGES; page++) {
      const resp = await tennisGet<BzzoiroTennisListResponse>("/matches/", {
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
    logger.error({ err }, "[bzzoiro-tennis] getBzzoiroTennisUpcoming failed");
  }
  return out;
}

export async function getBzzoiroTennisLive(): Promise<BzzoiroTennisMatch[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  try {
    const resp = await tennisGet<BzzoiroTennisListResponse>("/matches/live/");
    return resp.results ?? [];
  } catch (err) {
    logger.error({ err }, "[bzzoiro-tennis] getBzzoiroTennisLive failed");
    return [];
  }
}

export async function getBzzoiroTennisOdds(matchId: number): Promise<BzzoiroTennisOdds | null> {
  if (!CONFIG.BZZOIRO_API_KEY) return null;
  try {
    return await tennisGet<BzzoiroTennisOdds>(`/matches/${matchId}/odds/`);
  } catch (err) {
    logger.error({ err, matchId }, "[bzzoiro-tennis] getBzzoiroTennisOdds failed");
    return null;
  }
}

/** "6-4, 3-6, 7-5" -> [[6,4],[3,6],[7,5]]. Real sets_detail format confirmed
 * via the user's own pasted docs example. */
export function parseBzzoiroTennisSets(setsDetail: string | undefined): Array<[number, number]> {
  if (!setsDetail) return [];
  const sets: Array<[number, number]> = [];
  for (const part of setsDetail.split(",")) {
    const m = part.trim().match(/^(\d+)-(\d+)$/);
    if (m) sets.push([Number(m[1]), Number(m[2])]);
  }
  return sets;
}

export function isBzzoiroTennisLiveStatus(status: string): boolean {
  return BZZOIRO_TENNIS_LIVE_STATUSES.has(status.toLowerCase());
}

export function isBzzoiroTennisTerminalStatus(status: string): boolean {
  return BZZOIRO_TENNIS_TERMINAL_STATUSES.has(status.toLowerCase());
}
