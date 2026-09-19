// Real-price cache for tennis prematch odds via PropLine — added 2026-09-19
// as part of the tennis architecture rework: api-tennis.com is the sole
// match-state source (fixtures/live score/sets/server/H2H/rankings/
// statistics), PropLine supplies every real odds field on top of it,
// matched by player name. Same "progressively warm, never block the
// response" pattern as prematchFootballOddsCache.ts.
//
// Every market key below was confirmed real 2026-09-19 via a direct
// PropLine call (never the vendor's prose docs — see the tennis plan's
// Fase 0): double_faults/total_points/games_won/break_points_won were
// checked and found NOT priced by any bookmaker today, so they are not
// implemented — never show a market with no real price behind it.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { propline, type ProplineEvent } from "./index.js";
import {
  extractProplineH2HOdds,
  extractProplineTennisSpread,
  extractProplineTennisTotalGames,
  extractProplineTennisTotalSets,
  extractProplineTennisTotalTiebreaks,
  extractProplineTennisPlayerAces,
  normalizePersonName,
  isFuzzyPersonNameMatch,
} from "./common.js";

export const TENNIS_MARKET_KEYS = [
  "h2h",
  "spreads",
  "totals",
  "total_sets",
  "total_tiebreaks",
  "player_aces",
];

const PROPLINE_TENNIS_SPORT_KEY = "tennis";

async function fetchTennisOdds(): Promise<ProplineEvent[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  try {
    const events = await propline.getOdds(PROPLINE_TENNIS_SPORT_KEY, {
      markets: TENNIS_MARKET_KEYS,
      oddsFormat: "decimal",
    });
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

/** Finds the PropLine event for a pair of players by fuzzy person-name
 * match (never team-name matching — see common.ts's tennis extractors for
 * why) — api-tennis and PropLine can spell the same real player slightly
 * differently, same real problem football's roster-matching solves. */
export function proplineFindTennisEventByPlayers(
  pool: ProplineEvent[],
  home: string,
  away: string,
): ProplineEvent | null {
  const homeNorm = normalizePersonName(home);
  const awayNorm = normalizePersonName(away);
  for (const ev of pool) {
    const evHomeNorm = normalizePersonName(ev.home_team ?? "");
    const evAwayNorm = normalizePersonName(ev.away_team ?? "");
    const directMatch =
      (isFuzzyPersonNameMatch(evHomeNorm, homeNorm) || isFuzzyPersonNameMatch(homeNorm, evHomeNorm)) &&
      (isFuzzyPersonNameMatch(evAwayNorm, awayNorm) || isFuzzyPersonNameMatch(awayNorm, evAwayNorm));
    if (directMatch) return ev;
    const swappedMatch =
      (isFuzzyPersonNameMatch(evHomeNorm, awayNorm) || isFuzzyPersonNameMatch(awayNorm, evHomeNorm)) &&
      (isFuzzyPersonNameMatch(evAwayNorm, homeNorm) || isFuzzyPersonNameMatch(homeNorm, evAwayNorm));
    if (swappedMatch) return ev;
  }
  return null;
}

export type CachedTennisOdds = {
  home: number;
  draw: number;
  away: number;
  proplineEventId: string;
  spread: { line: number; home: number; away: number } | null;
  totalGames: { line: number; over: number; under: number } | null;
  totalSets: { line: number; over: number; under: number } | null;
  totalTiebreaks: { line: number; over: number; under: number } | null;
  homeAces: { line: number; over: number; under: number } | null;
  awayAces: { line: number; over: number; under: number } | null;
  fetchedAt: number;
};

const cache = new Map<string, CachedTennisOdds>();
const PRICE_TTL_MS = 30 * 60 * 1000;

export function getPrematchPropLineTennisOdds(
  apiTennisMatchId: string,
): Omit<CachedTennisOdds, "fetchedAt"> | null {
  const entry = cache.get(apiTennisMatchId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PRICE_TTL_MS) return null;
  const { fetchedAt: _fetchedAt, ...rest } = entry;
  return rest;
}

export type PrematchTennisFixtureRef = {
  providerMatchId: string;
  home: string;
  away: string;
};

let inFlight: Promise<void> | null = null;

/** Fire-and-forget: call once per tennis upcoming rebuild (see
 * routes/matches.ts's buildTennisUpcomingFromApiTennis). Never throws — a
 * failed PropLine fetch or an unmatched fixture just leaves it unpriced
 * until the next call. */
export function triggerPrematchPropLineTennisSync(
  fixtures: PrematchTennisFixtureRef[],
): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runSync(fixtures)
    .catch((err) => {
      logger.error({ err }, "[propline] triggerPrematchPropLineTennisSync failed");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function runSync(fixtures: PrematchTennisFixtureRef[]): Promise<void> {
  if (!CONFIG.PROPLINE_API_KEY) return;
  const now = Date.now();
  const stale = fixtures.filter((fx) => {
    const entry = cache.get(fx.providerMatchId);
    return !entry || now - entry.fetchedAt > PRICE_TTL_MS;
  });
  if (stale.length === 0) return;

  const pool = await fetchTennisOdds();
  if (pool.length === 0) return;

  let matched = 0;
  let priced = 0;
  for (const fx of stale) {
    const ev = proplineFindTennisEventByPlayers(pool, fx.home, fx.away);
    if (!ev) continue;
    matched++;
    const odds = extractProplineH2HOdds(ev.bookmakers, ev.home_team, ev.away_team, false);
    if (!odds) continue;
    const aces = extractProplineTennisPlayerAces(ev.bookmakers, ev.home_team, ev.away_team);
    cache.set(fx.providerMatchId, {
      ...odds,
      proplineEventId: ev.id,
      spread: extractProplineTennisSpread(ev.bookmakers, ev.home_team, ev.away_team),
      totalGames: extractProplineTennisTotalGames(ev.bookmakers),
      totalSets: extractProplineTennisTotalSets(ev.bookmakers),
      totalTiebreaks: extractProplineTennisTotalTiebreaks(ev.bookmakers),
      homeAces: aces.home,
      awayAces: aces.away,
      fetchedAt: Date.now(),
    });
    priced++;
  }
  logger.info(
    { attempted: stale.length, poolSize: pool.length, matched, priced, cacheSize: cache.size },
    "[propline] prematch tennis sync done",
  );
}
