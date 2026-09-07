// Shared sport-agnostic PropLine fetchers — the same /odds and /scores
// shapes are used by every sport (football.ts was the first, built and
// confirmed real against soccer_brasileirao 2026-09-07; this file factors
// the common pieces out so basketball/hockey/baseball/tennis/volleyball/mma
// don't each re-duplicate the same cache/fetch logic).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { propLineGet, americanToDecimal } from "./client.js";

export type PropLineOutcome = {
  name: string;
  description: string;
  price: number; // American odds — always, confirmed real
  point: number | null;
  book_updated_at?: string | null;
  last_change_at?: string;
  last_seen_at?: string;
  payout_multiplier?: number | null;
  dfs_odds_type?: "standard" | "goblin" | "demon" | null;
};

export type PropLineMarket = {
  key: string; // "h2h" | "spreads" | "totals" | ...
  description?: string;
  team?: string | null;
  last_update: string;
  suspended_at?: string | null;
  outcomes: PropLineOutcome[];
};

export type PropLineBookmaker = {
  key: string;
  title: string;
  markets: PropLineMarket[];
};

export type PropLineEvent = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  home_team_key?: string | null;
  away_team_key?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  commence_time: string;
  live: boolean;
  last_update?: string;
  merged_from_event_ids?: string[] | null;
  bookmakers: PropLineBookmaker[] | null;
};

// GET /v1/sports/{sportKey}/scores?days_from=N — free tier. Confirmed real
// shape for both baseball_mlb (a genuine in-progress sample: real
// home_score/away_score updating live, period "Bot 3rd") and soccer_epl
// (schema present, but no in-progress sample seen — see football.ts's
// header for the live-update caveat that applies to every non-{MLB, WNBA,
// NFL, NCAAF, NBA, NHL} sport per PropLine's own docs).
export type PropLineScoreEvent = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  live: boolean;
  status: "upcoming" | "in_progress" | "final" | string;
  home_score: number | null;
  away_score: number | null;
  period: string | null;
};

const ODDS_TTL_MS = 90 * 1000;
const oddsCache = new Map<string, { events: PropLineEvent[]; fetchedAt: number }>();
const oddsInFlight = new Map<string, Promise<PropLineEvent[]>>();

/** One call per sportKey returns every event for it — upcoming AND live
 * together (see `live` per event). 90s cache: cheap per sport/league, but
 * the account's real daily quota is unconfirmed (free tier) — see
 * client.ts's propLineQuota for the live budget read-back. */
export async function getPropLineOdds(
  sportKey: string,
  markets = "h2h,spreads,totals",
): Promise<PropLineEvent[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const cacheKey = `${sportKey}:${markets}`;
  const now = Date.now();
  const cached = oddsCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < ODDS_TTL_MS) return cached.events;
  const inFlight = oddsInFlight.get(cacheKey);
  if (inFlight) return inFlight;
  const promise = propLineGet<PropLineEvent[]>(`/sports/${sportKey}/odds`, { markets })
    .then((events) => {
      oddsCache.set(cacheKey, { events: events ?? [], fetchedAt: Date.now() });
      return events ?? [];
    })
    .catch((err) => {
      logger.warn({ err, sportKey }, "[propline] odds fetch failed");
      return oddsCache.get(cacheKey)?.events ?? [];
    })
    .finally(() => {
      oddsInFlight.delete(cacheKey);
    });
  oddsInFlight.set(cacheKey, promise);
  return promise;
}

const SCORES_TTL_MS = 30 * 1000;
const scoresCache = new Map<string, { events: PropLineScoreEvent[]; fetchedAt: number }>();
const scoresInFlight = new Map<string, Promise<PropLineScoreEvent[]>>();

export async function getPropLineScores(sportKey: string): Promise<PropLineScoreEvent[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const now = Date.now();
  const cached = scoresCache.get(sportKey);
  if (cached && now - cached.fetchedAt < SCORES_TTL_MS) return cached.events;
  const inFlight = scoresInFlight.get(sportKey);
  if (inFlight) return inFlight;
  const promise = propLineGet<PropLineScoreEvent[]>(`/sports/${sportKey}/scores`, { days_from: 1 })
    .then((events) => {
      scoresCache.set(sportKey, { events: events ?? [], fetchedAt: Date.now() });
      return events ?? [];
    })
    .catch((err) => {
      logger.warn({ err, sportKey }, "[propline] scores fetch failed");
      return scoresCache.get(sportKey)?.events ?? [];
    })
    .finally(() => {
      scoresInFlight.delete(sportKey);
    });
  scoresInFlight.set(sportKey, promise);
  return promise;
}

export type PropLineResultOdds = { home: number; draw: number; away: number };

/** Extracts a real h2h (moneyline/1X2) market as decimal odds. `threeWay`
 * controls whether a "Draw" outcome is expected (football/soccer only —
 * every other sport here is 2-way, draw stays 0). Picks the sharpest
 * available book (Pinnacle first, confirmed real for soccer_brasileirao),
 * falling back to whichever real book quoted every side. Only returns a
 * result when all expected sides are present — same "never mix real with
 * fake Poisson" rule as every other provider in this codebase. */
export function extractPropLineH2HOdds(
  bookmakers: PropLineBookmaker[] | null,
  home: string,
  away: string,
  threeWay: boolean,
): PropLineResultOdds | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const preferredOrder = ["pinnacle", "bovada", "betmgm", "kalshi", "betonlineag", "lowvig", "draftkings", "fanduel"];
  const ordered = [...bookmakers].sort((a, b) => {
    const ai = preferredOrder.indexOf(a.key);
    const bi = preferredOrder.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const bm of ordered) {
    const market = bm.markets.find((m) => m.key === "h2h");
    if (!market) continue;
    let homePrice: number | null = null;
    let awayPrice: number | null = null;
    let drawPrice: number | null = null;
    for (const o of market.outcomes) {
      const name = (o.name || "").toLowerCase();
      if (name === "draw") drawPrice = o.price;
      else if (name === home.toLowerCase() || o.name === home) homePrice = o.price;
      else if (name === away.toLowerCase() || o.name === away) awayPrice = o.price;
    }
    // Team-name matching can miss on a spelling mismatch between PropLine's
    // event-level name and a book's own outcome spelling — positional
    // fallback, per PropLine's own documented outcome ordering guarantee
    // ("primeiro em casa, depois fora e, por fim, empate").
    const expectedCount = threeWay ? 3 : 2;
    if (
      (homePrice == null || awayPrice == null || (threeWay && drawPrice == null)) &&
      market.outcomes.length === expectedCount
    ) {
      const [h, a, d] = market.outcomes;
      if (h && a) {
        homePrice ??= h.price;
        awayPrice ??= a.price;
        if (threeWay && d) drawPrice ??= d.price;
      }
    }
    if (homePrice == null || awayPrice == null) continue;
    if (threeWay && drawPrice == null) continue;
    return {
      home: americanToDecimal(homePrice),
      draw: threeWay && drawPrice != null ? americanToDecimal(drawPrice) : 0,
      away: americanToDecimal(awayPrice),
    };
  }
  return null;
}
