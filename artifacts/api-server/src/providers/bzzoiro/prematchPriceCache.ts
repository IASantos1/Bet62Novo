// Real-price cache for bzzoiro football prematch fixtures — fixes a real
// production bug found 2026-09-15: buildFootballUpcomingFromBzzoiro()
// ships every fixture with hasRealOdds:false/odds all-zero (documented gap,
// "no bulk prematch odds endpoint"), and the actual /api/matches/upcoming
// route (refreshUpcomingTop → router.get("/upcoming")) filters OUT any
// match with hasRealOdds:false AND every odds field at 0 — so with GOAL API
// now disabled, football's real prematch listing on the site was silently
// empty. GET /events/{id}/odds/ (getBzzoiroEventOddsSummary) is a single,
// cheap per-fixture call (unlike the 5-call fetchBzzoiroMarketsFromRest
// used for full markets) — priced here as a background sweep, a few
// fixtures per rebuild tick, same "progressively warm, never block the
// response" spirit as the deleted PulseScore prematch pricing this
// replaces.
import { getBzzoiroEventOddsSummary } from "./client.js";
import { logger } from "../../lib/logger.js";

type CachedPrice = { home: number; draw: number; away: number; fetchedAt: number };

const priceCache = new Map<number, CachedPrice>();
const PRICE_TTL_MS = 30 * 60 * 1000;
// Real bug found 2026-09-15, straight from production: this used to fire
// up to 20 requests at once via Promise.all, which blows straight through
// bzzoiro's own documented limit ("10 requests/s per IP") — most of those
// 20 came back 429, were swallowed by the per-fixture try/catch below, and
// the cache never actually warmed up. Fixed to run sequentially with a
// fixed delay between requests instead of firing a batch. Priced
// sequentially in the background (this never blocks a request), so the
// per-sweep cap can be generous — 60 fixtures/sweep at ~150ms apart is
// ~9s of background work, well under the 10 req/s ceiling with headroom
// for whatever else in this process is hitting bzzoiro's REST API at the
// same time.
const MAX_PRICED_PER_SWEEP = 60;
const REQUEST_SPACING_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getCachedBzzoiroPrematchPrice(eventId: number): { home: number; draw: number; away: number } | null {
  const entry = priceCache.get(eventId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PRICE_TTL_MS) return null;
  return { home: entry.home, draw: entry.draw, away: entry.away };
}

/** Fire-and-forget: prices up to MAX_PRICED_PER_SWEEP fixtures per call
 * that are missing or stale in the cache, one request at a time with
 * REQUEST_SPACING_MS between them. Never throws — a failed fetch for one
 * fixture just leaves it unpriced until the next sweep. */
export async function primeBzzoiroPrematchPrices(eventIds: number[]): Promise<void> {
  const now = Date.now();
  const stale = eventIds.filter((id) => {
    const entry = priceCache.get(id);
    return !entry || now - entry.fetchedAt > PRICE_TTL_MS;
  });
  const toPrice = stale.slice(0, MAX_PRICED_PER_SWEEP);
  let priced = 0;
  for (const id of toPrice) {
    try {
      const summary = await getBzzoiroEventOddsSummary(id);
      const { home_win, draw, away_win } = summary.odds;
      if (typeof home_win === "number" && typeof draw === "number" && typeof away_win === "number") {
        priceCache.set(id, { home: home_win, draw, away: away_win, fetchedAt: Date.now() });
        priced++;
      }
    } catch (err) {
      logger.error({ err, eventId: id }, "[bzzoiro] primeBzzoiroPrematchPrices failed for one fixture");
    }
    await sleep(REQUEST_SPACING_MS);
  }
  if (toPrice.length > 0) {
    logger.info(
      { attempted: toPrice.length, priced, cacheSize: priceCache.size },
      "[bzzoiro] primeBzzoiroPrematchPrices sweep done",
    );
  }
}
