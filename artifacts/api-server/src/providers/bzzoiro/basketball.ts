// sports.bzzoiro.com Basketball API — confirmed real 2026-09-14 via the
// user's own pasted docs (base https://sports.bzzoiro.com/basketball/api/v2/,
// same `Authorization: Token <key>` auth as football, gated behind the
// $5/mo Sports Addon — a 402 addon_required response means the addon isn't
// active on this account's token yet, not a code bug). No WebSocket exists
// for this sport (only football and tennis have one — see
// websocketClient.ts's own header) — live coverage here is REST polling of
// GET /events/live/, exactly the same server-side cadence (~10-30s) the
// football REST live list already documents.
//
// This replaces PropLine as BET62's basketball source per the user's
// explicit instruction to move every sport bzzoiro offers onto bzzoiro —
// PropLine has zero fallback if disabled, so both are wired as candidates
// through the existing chooseUpcomingProvider/chooseLiveProvider quality
// gate (see matches.ts) rather than an immediate hard cut, mirroring how
// bzzoiro's native football discovery was validated before GOAL API/
// PulseScore were switched off.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

const BASKETBALL_BASE_URL = "https://sports.bzzoiro.com/basketball/api/v2";

export type BzzoiroBasketballTeam = { id: number; name: string; short_name?: string };
export type BzzoiroBasketballLeague = { id: number; name: string };

export type BzzoiroBasketballGame = {
  id: number;
  league: BzzoiroBasketballLeague;
  home_team: BzzoiroBasketballTeam;
  away_team: BzzoiroBasketballTeam;
  event_date: string;
  status: string; // "scheduled" | "live" | "finished" | "postponed" | "cancelled"
  home_score: number | null;
  away_score: number | null;
};

export type BzzoiroBasketballListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: BzzoiroBasketballGame[];
};

// Real per-bookmaker odds feed shape, confirmed via the user's own pasted
// docs example (event_id 7108) — shared shape across every bzzoiro
// "stick sport" (basketball/hockey/darts): a flat moneyline/1x2 summary per
// bookmaker, plus a `markets` array (AH/OU/WINNER, ...) grouped by
// kind/line/period.
export type BzzoiroStickSportBookmakerRow = {
  bookmaker: string;
  bookmaker_slug: string;
  odds_home?: number;
  movement_home?: "SHORTENING" | "DRIFTING" | "STABLE" | null;
  odds_draw?: number;
  movement_draw?: "SHORTENING" | "DRIFTING" | "STABLE" | null;
  odds_away?: number;
  movement_away?: "SHORTENING" | "DRIFTING" | "STABLE" | null;
  updated_at: string;
};

export type BzzoiroStickSportMarketRow = {
  market_kind: string; // "WINNER" | "1X2" | "AH" | "OU" | ...
  market_family: string;
  market_line: number | null;
  market_period: string; // "FT" or a period code
  selections: string[];
  bookmakers: Array<{
    bookmaker: string;
    bookmaker_slug: string;
    prices: Record<string, { price: number; movement: string | null }>;
    updated_at: string;
  }>;
};

export type BzzoiroStickSportOddsResponse = {
  event_id: number;
  event_date: string;
  home_team_name: string;
  away_team_name: string;
  bookmakers_count: number;
  source: "multi" | "consensus" | "none";
  bookmakers: BzzoiroStickSportBookmakerRow[];
  markets: BzzoiroStickSportMarketRow[];
};

async function basketballGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${BASKETBALL_BASE_URL}${path}`);
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
    throw new Error(
      `[bzzoiro-basketball] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`,
    );
  }
  return (await resp.json()) as T;
}

const UPCOMING_PAGE_LIMIT = 100;
const UPCOMING_MAX_PAGES = 10;

/** GET /basketball/api/v2/events/?date_from=&date_to=&status=upcoming —
 * follows the DRF `next` cursor across pages, same pattern already proven
 * for football's getBzzoiroUpcomingEvents(). */
export async function getBzzoiroBasketballUpcoming(
  dateFrom: string,
  dateTo: string,
): Promise<BzzoiroBasketballGame[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  const out: BzzoiroBasketballGame[] = [];
  try {
    let offset = 0;
    for (let page = 0; page < UPCOMING_MAX_PAGES; page++) {
      const resp = await basketballGet<BzzoiroBasketballListResponse>("/events/", {
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
    logger.error({ err }, "[bzzoiro-basketball] getBzzoiroBasketballUpcoming failed");
  }
  return out;
}

export async function getBzzoiroBasketballLive(): Promise<BzzoiroBasketballGame[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  try {
    const resp = await basketballGet<BzzoiroBasketballListResponse>("/events/live/");
    return resp.results ?? [];
  } catch (err) {
    logger.error({ err }, "[bzzoiro-basketball] getBzzoiroBasketballLive failed");
    return [];
  }
}

export async function getBzzoiroBasketballOdds(
  eventId: number,
): Promise<BzzoiroStickSportOddsResponse | null> {
  if (!CONFIG.BZZOIRO_API_KEY) return null;
  try {
    return await basketballGet<BzzoiroStickSportOddsResponse>(`/events/${eventId}/odds/`);
  } catch (err) {
    logger.error({ err, eventId }, "[bzzoiro-basketball] getBzzoiroBasketballOdds failed");
    return null;
  }
}
