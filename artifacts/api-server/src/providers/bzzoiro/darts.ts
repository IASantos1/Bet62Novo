// sports.bzzoiro.com Darts API — confirmed real 2026-09-14 via the user's
// own pasted docs (base https://sports.bzzoiro.com/darts/api/v2/, same
// Sports Addon gating and Authorization: Token auth as basketball/hockey/
// tennis). Brand-new sport for BET62 — bzzoiro is its only source, there
// is no existing provider to compare against or cut over from.
//
// Real odds feed shape differs from basketball/hockey's (confirmed via the
// user's own pasted docs example, match_id 4664): bookmaker rows carry
// odds_player1/odds_player2 (not odds_home/odds_away — darts has no
// home/away, just two players), and market selections use "P1"/"P2" (not
// "HOME"/"AWAY"). Kept as its own local averaging logic rather than
// force-fitting stickSportOdds.ts's team-shaped helpers.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

const DARTS_BASE_URL = "https://sports.bzzoiro.com/darts/api/v2";

export type BzzoiroDartsPlayer = { id: number; name: string; country_code?: string; elo?: number };
export type BzzoiroDartsTournament = { id: number; name: string; category?: string };

export type BzzoiroDartsMatch = {
  id: number;
  tournament: BzzoiroDartsTournament;
  player1: BzzoiroDartsPlayer;
  player2: BzzoiroDartsPlayer;
  match_date: string;
  status: string; // scheduled | live | finished | walkover | postponed | cancelled
  round_name?: string;
  player1_sets: number | null;
  player2_sets: number | null;
  player1_legs?: number | null;
  player2_legs?: number | null;
  current_set?: number | null;
  winner_id: number | null;
  best_of_legs?: number | null;
  best_of_sets?: number | null;
};

export type BzzoiroDartsListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: BzzoiroDartsMatch[];
};

export type BzzoiroDartsOddsResponse = {
  match_id: number;
  match_date: string;
  player1_name: string;
  player2_name: string;
  bookmakers_count: number;
  source: "multi" | "consensus" | "none";
  bookmakers: Array<{
    bookmaker: string;
    bookmaker_slug: string;
    odds_player1?: number;
    movement_player1?: string | null;
    odds_player2?: number;
    movement_player2?: string | null;
    updated_at: string;
  }>;
  markets: Array<{
    market_kind: string; // "WINNER" | "OU"
    market_family: string;
    market_line: number | null;
    market_period: string;
    selections: string[]; // ["P1","P2"] for WINNER
    bookmakers: Array<{
      bookmaker: string;
      bookmaker_slug: string;
      prices: Record<string, { price: number; movement: string | null }>;
      updated_at: string;
    }>;
  }>;
};

async function dartsGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${DARTS_BASE_URL}${path}`);
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
    throw new Error(`[bzzoiro-darts] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  return (await resp.json()) as T;
}

const UPCOMING_PAGE_LIMIT = 100;
const UPCOMING_MAX_PAGES = 10;

export async function getBzzoiroDartsUpcoming(dateFrom: string, dateTo: string): Promise<BzzoiroDartsMatch[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  const out: BzzoiroDartsMatch[] = [];
  try {
    let offset = 0;
    for (let page = 0; page < UPCOMING_MAX_PAGES; page++) {
      const resp = await dartsGet<BzzoiroDartsListResponse | BzzoiroDartsMatch[]>("/matches/", {
        date_from: dateFrom,
        date_to: dateTo,
        status: "scheduled",
        limit: UPCOMING_PAGE_LIMIT,
        offset,
      });
      const results = Array.isArray(resp) ? resp : resp.results;
      out.push(...results);
      if (Array.isArray(resp) || !resp.next) break;
      offset += UPCOMING_PAGE_LIMIT;
    }
  } catch (err) {
    logger.error({ err }, "[bzzoiro-darts] getBzzoiroDartsUpcoming failed");
  }
  return out;
}

export async function getBzzoiroDartsLive(): Promise<BzzoiroDartsMatch[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  try {
    const resp = await dartsGet<BzzoiroDartsListResponse | BzzoiroDartsMatch[]>("/matches/live/");
    return Array.isArray(resp) ? resp : (resp.results ?? []);
  } catch (err) {
    logger.error({ err }, "[bzzoiro-darts] getBzzoiroDartsLive failed");
    return [];
  }
}

export async function getBzzoiroDartsOdds(matchId: number): Promise<BzzoiroDartsOddsResponse | null> {
  if (!CONFIG.BZZOIRO_API_KEY) return null;
  try {
    return await dartsGet<BzzoiroDartsOddsResponse>(`/matches/${matchId}/odds/`);
  } catch (err) {
    logger.error({ err, matchId }, "[bzzoiro-darts] getBzzoiroDartsOdds failed");
    return null;
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Moneyline from the flat bookmakers array (odds_player1/odds_player2). */
export function averageDartsMoneyline(
  resp: BzzoiroDartsOddsResponse,
): { home: number; away: number } | null {
  const home = average(resp.bookmakers.map((b) => b.odds_player1).filter((v): v is number => typeof v === "number"));
  const away = average(resp.bookmakers.map((b) => b.odds_player2).filter((v): v is number => typeof v === "number"));
  if (home === null || away === null) return null;
  return { home, away };
}

/** Total legs/180s (OU market) — real line + averaged over/under prices,
 * or null when no bookmaker quoted a total for this match. */
export function averageDartsTotal(
  resp: BzzoiroDartsOddsResponse,
): { line: number; over: number; under: number } | null {
  const market = resp.markets.find((m) => m.market_kind === "OU" && (!m.market_period || m.market_period === "FT"));
  if (!market || market.market_line === null) return null;
  const overPrices = market.bookmakers
    .map((b) => b.prices["OVER"]?.price)
    .filter((v): v is number => typeof v === "number");
  const underPrices = market.bookmakers
    .map((b) => b.prices["UNDER"]?.price)
    .filter((v): v is number => typeof v === "number");
  const over = average(overPrices);
  const under = average(underPrices);
  if (over === null || under === null) return null;
  return { line: market.market_line, over, under };
}
