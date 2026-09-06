// Bet365Soft football (soccer) — leagues, per-league prematch listing, and
// full per-event market detail. Every shape below is confirmed against a
// REAL response fetched through /api/debug-bet365soft during this
// integration (2026-09-06) — this provider's own docs got the /sports
// envelope wrong, so nothing here is trusted from the docs alone.
//
// KNOWN GAP: Brazil's top flight ("Campeonato Brasileiro Série A") is not
// in the /leagues response and no match for it was found via /search
// either (checked with "Brasileirao" and with "Flamengo"/"Palmeiras" —
// both clubs only show up playing Libertadores, never their domestic
// Série A fixtures). Confirmed real, not a naming issue — this may be a
// trial-key restriction (unconfirmed) rather than a permanent gap.
//
// /api/v2/upcoming (the documented date-range listing endpoint) returns
// {success:false,error:"Api data is empty"} even for date ranges that
// provably contain real matches (confirmed via /search and /prematch on
// the same dates) — broken or trial-restricted. Use /prematch (per-league)
// instead, which works correctly.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { bet365SoftGet } from "./client.js";

export const BET365SOFT_SPORT_ID_FOOTBALL = 1;

export type Bet365SoftLeague = {
  id: number;
  cid: number;
  country: string;
  name: string;
  icon?: string;
};

type Bet365SoftLeaguesResponse = {
  success: true;
  sportId: number;
  leagues: Bet365SoftLeague[];
};

export type Bet365SoftMarketOutcome = {
  id: number;
  name: string;
  status: string; // "Show" confirmed real; no other value observed yet
  rate: number; // decimal odds, confirmed real (no American-odds conversion needed)
};

export type Bet365SoftMarketGroup = {
  id: string; // bid as a string, e.g. "1" = Result, "2" = Handicap, "19" = BTTS
  name: string;
  markets: Bet365SoftMarketOutcome[];
};

export type Bet365SoftEvent = {
  eventId: number;
  appId: string;
  gameId: string;
  sportId: number;
  sportName: string;
  leagueId: number;
  leagueName: string;
  leagueIcon?: string;
  country: string;
  vs: string;
  home: string;
  away: string;
  venue?: string;
  homeIcon?: string;
  awayIcon?: string;
  homeScore: string; // "" pre-match, confirmed real
  awayScore: string;
  eventStart: number; // unix seconds
  odds: Bet365SoftMarketGroup[];
};

type Bet365SoftPrematchResponse = {
  success: true;
  leagueId: number;
  leagueName: string;
  events: Bet365SoftEvent[];
};

type Bet365SoftPrematchEventResponse = {
  success: true;
  lastUpdate: number;
  event: Omit<Bet365SoftEvent, "odds">;
  group: Array<{ id: number; name: string }>; // sub-period groupings (1st half, corners, players' stats, ...) — not yet consumed
  odds: Bet365SoftMarketGroup[];
};

// ── Leagues ──────────────────────────────────────────────────────────────
const LEAGUES_TTL_MS = 6 * 60 * 60 * 1000;
let leaguesCache: { leagues: Bet365SoftLeague[]; fetchedAt: number } | null = null;
let leaguesInFlight: Promise<Bet365SoftLeague[]> | null = null;

export async function getBet365SoftFootballLeagues(): Promise<Bet365SoftLeague[]> {
  if (!CONFIG.ENABLE_BET365SOFT) return [];
  if (!CONFIG.BET365SOFT_API_KEY) return [];
  const now = Date.now();
  if (leaguesCache && now - leaguesCache.fetchedAt < LEAGUES_TTL_MS) return leaguesCache.leagues;
  if (leaguesInFlight) return leaguesInFlight;
  leaguesInFlight = bet365SoftGet<Bet365SoftLeaguesResponse>("/api/v2/leagues", {
    sid: BET365SOFT_SPORT_ID_FOOTBALL,
  })
    .then((resp) => {
      const leagues = resp.leagues ?? [];
      leaguesCache = { leagues, fetchedAt: Date.now() };
      return leagues;
    })
    .catch((err) => {
      logger.warn({ err }, "[bet365soft] football leagues fetch failed");
      return leaguesCache?.leagues ?? [];
    })
    .finally(() => {
      leaguesInFlight = null;
    });
  return leaguesInFlight;
}

// ── Prematch listing (per league — /upcoming is broken, see header) ───────
const PREMATCH_TTL_MS = 2 * 60 * 1000;
const prematchCache = new Map<number, { events: Bet365SoftEvent[]; fetchedAt: number }>();
const prematchInFlight = new Map<number, Promise<Bet365SoftEvent[]>>();

export async function getBet365SoftFootballPrematch(leagueId: number): Promise<Bet365SoftEvent[]> {
  if (!CONFIG.ENABLE_BET365SOFT) return [];
  if (!CONFIG.BET365SOFT_API_KEY) return [];
  const now = Date.now();
  const cached = prematchCache.get(leagueId);
  if (cached && now - cached.fetchedAt < PREMATCH_TTL_MS) return cached.events;
  const inFlight = prematchInFlight.get(leagueId);
  if (inFlight) return inFlight;
  const promise = bet365SoftGet<Bet365SoftPrematchResponse>("/api/v2/prematch", {
    sid: BET365SOFT_SPORT_ID_FOOTBALL,
    lid: leagueId,
  })
    .then((resp) => {
      const events = resp.events ?? [];
      prematchCache.set(leagueId, { events, fetchedAt: Date.now() });
      return events;
    })
    .catch((err) => {
      logger.warn({ err, leagueId }, "[bet365soft] football prematch fetch failed");
      return prematchCache.get(leagueId)?.events ?? [];
    })
    .finally(() => {
      prematchInFlight.delete(leagueId);
    });
  prematchInFlight.set(leagueId, promise);
  return promise;
}

// ── Full per-event market detail ────────────────────────────────────────
const EVENT_DETAIL_TTL_MS = 60 * 1000;
const eventDetailCache = new Map<number, { data: Bet365SoftPrematchEventResponse; fetchedAt: number }>();

export async function getBet365SoftFootballEventDetail(
  eventId: number,
): Promise<Bet365SoftPrematchEventResponse | null> {
  if (!CONFIG.ENABLE_BET365SOFT) return null;
  if (!CONFIG.BET365SOFT_API_KEY) return null;
  const now = Date.now();
  const cached = eventDetailCache.get(eventId);
  if (cached && now - cached.fetchedAt < EVENT_DETAIL_TTL_MS) return cached.data;
  try {
    const resp = await bet365SoftGet<Bet365SoftPrematchEventResponse>("/api/v2/prematchEvent", {
      id: eventId,
    });
    eventDetailCache.set(eventId, { data: resp, fetchedAt: Date.now() });
    return resp;
  } catch (err) {
    logger.warn({ err, eventId }, "[bet365soft] football event detail fetch failed");
    return cached?.data ?? null;
  }
}

export type Bet365SoftResultOdds = { home: number; draw: number; away: number };

/** Extracts the 1X2 (bid=1, name="Result") market. `markets[].id` is
 * positional across every real sample seen so far (1=home, 2=draw,
 * 3=away) — NOT a global outcome id — so this keys off that id, not the
 * name string (name is the team's own name, which varies per match). */
export function extractResultOdds(odds: Bet365SoftMarketGroup[]): Bet365SoftResultOdds | null {
  const group = odds.find((g) => g.name === "Result");
  if (!group) return null;
  const home = group.markets.find((m) => m.id === 1)?.rate;
  const draw = group.markets.find((m) => m.id === 2)?.rate;
  const away = group.markets.find((m) => m.id === 3)?.rate;
  if (home == null || draw == null || away == null) return null;
  return { home, draw, away };
}
