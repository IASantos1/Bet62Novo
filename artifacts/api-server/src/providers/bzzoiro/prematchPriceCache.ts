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
const MAX_PRICED_PER_SWEEP = 20;

export function getCachedBzzoiroPrematchPrice(eventId: number): { home: number; draw: number; away: number } | null {
  const entry = priceCache.get(eventId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PRICE_TTL_MS) return null;
  return { home: entry.home, draw: entry.draw, away: entry.away };
}

/** Fire-and-forget: prices up to MAX_PRICED_PER_SWEEP fixtures per call
 * that are missing or stale in the cache. Never throws — a failed fetch
 * for one fixture just leaves it unpriced until the next sweep. */
export async function primeBzzoiroPrematchPrices(eventIds: number[]): Promise<void> {
  const now = Date.now();
  const stale = eventIds.filter((id) => {
    const entry = priceCache.get(id);
    return !entry || now - entry.fetchedAt > PRICE_TTL_MS;
  });
  const toPrice = stale.slice(0, MAX_PRICED_PER_SWEEP);
  await Promise.all(
    toPrice.map(async (id) => {
      try {
        const summary = await getBzzoiroEventOddsSummary(id);
        const { home_win, draw, away_win } = summary.odds;
        if (typeof home_win === "number" && typeof draw === "number" && typeof away_win === "number") {
          priceCache.set(id, { home: home_win, draw, away: away_win, fetchedAt: Date.now() });
        }
      } catch (err) {
        logger.error({ err, eventId: id }, "[bzzoiro] primeBzzoiroPrematchPrices failed for one fixture");
      }
    }),
  );
}
