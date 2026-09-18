// Real-price cache for football prematch moneyline (1X2) via PropLine —
// added 2026-09-18 as part of moving football odds off GOAL API (deactivated
// odds/live-odds, kept only for fixtures/events/stats) onto PropLine.
// GOAL API fixtures are looked up here by team name against PropLine's
// soccer events, same "progressively warm, never block the response"
// pattern the old bzzoiro/PulseScore prematch caches used. Markets beyond
// the moneyline (totals/BTTS/double chance — PropLine's `bookmakers` array
// already carries these per event) are a deliberate fast-follow, not built
// here — same "real fixture discovery only for now" honest-gap pattern the
// original bzzoiro prematch cache shipped with.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { propline, type ProplineEvent } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";
import { proplineFindEventByName, proplineAllActiveSports } from "./football.js";

/** Fetches one soccer_* league's odds directly via the PropLine client —
 * NOT via football.ts's proplineFetchAllUpcomingOdds, which round-trips
 * the key through resolveProplineSportKey. Real bug found 2026-09-18:
 * resolveProplineSportKey only trusts an already-canonical key (like
 * "soccer_epl") as-is when it's literally listed in
 * CONFIG.PROPLINE_ENABLED_SPORTS — with that env var unset (empty array,
 * the common case), every soccer_* key failed to resolve and
 * proplineFetchAllUpcomingOdds silently returned [] for every league,
 * every time, so the odds pool was always empty and nothing was ever
 * priced regardless of GOAL_API_KEY/PROPLINE_API_KEY being correct and
 * real matches genuinely existing. basketball.ts/hockey.ts never hit this
 * because they always called propline.getOdds() directly with their own
 * hardcoded sport keys — same fix applied here. */
async function fetchSoccerLeagueOdds(sportKey: string): Promise<ProplineEvent[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  try {
    const events = await propline.getOdds(sportKey, { markets: ["h2h"], oddsFormat: "decimal" });
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

type CachedFootballOdds = {
  home: number;
  draw: number;
  away: number;
  proplineEventId: string;
  fetchedAt: number;
};

const cache = new Map<string, CachedFootballOdds>();
const PRICE_TTL_MS = 30 * 60 * 1000;

export function getPrematchPropLineFootballOdds(
  goalApiFixtureId: string,
): { home: number; draw: number; away: number; proplineEventId: string } | null {
  const entry = cache.get(goalApiFixtureId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PRICE_TTL_MS) return null;
  return { home: entry.home, draw: entry.draw, away: entry.away, proplineEventId: entry.proplineEventId };
}

/** Debug-only snapshot for GET /api/admin/propline-football-status — added
 * 2026-09-18 while chasing a real production report of empty football
 * pré-jogo/ao vivo despite confirmed-valid keys and confirmed real team-name
 * matches. Lets us see the actual live cache state instead of guessing from
 * log timing. */
export function getPropLineFootballCacheDebug(): {
  size: number;
  entries: Array<{ goalApiFixtureId: string; odds: { home: number; draw: number; away: number }; proplineEventId: string; ageMs: number }>;
} {
  const now = Date.now();
  return {
    size: cache.size,
    entries: [...cache.entries()].map(([id, e]) => ({
      goalApiFixtureId: id,
      odds: { home: e.home, draw: e.draw, away: e.away },
      proplineEventId: e.proplineEventId,
      ageMs: now - e.fetchedAt,
    })),
  };
}

export type PrematchFootballFixtureRef = { providerMatchId: string; home: string; away: string };

/** Every soccer_* sport key currently active — PropLine has no single "all
 * soccer" key, only one per league (see football.ts's PROPLINE_SOCCER_LEAGUES),
 * so this pools every active one before matching by team name.
 * proplineAllActiveSports() (not CONFIG.PROPLINE_ENABLED_SPORTS directly)
 * on purpose — bug found 2026-09-18: reading the raw env-parsed array meant
 * an operator who never explicitly set PROPLINE_ENABLED_SPORTS with soccer_
 * entries got an empty list here, so football was NEVER priced regardless
 * of GOAL_API_KEY/PROPLINE_API_KEY being correct — every football fixture
 * silently stayed invisible (the same "empty football" failure mode this
 * whole migration was meant to fix). proplineAllActiveSports() falls back
 * to a real default league list (soccer_epl, soccer_spain_la_liga, ...)
 * when the env var is unset, same as every other PropLine sport already
 * does. */
function configuredSoccerSportKeys(): string[] {
  return [...new Set(proplineAllActiveSports().filter((k) => k.startsWith("soccer_")))];
}

let inFlight: Promise<void> | null = null;

/** Fire-and-forget: call once per football upcoming rebuild (see
 * routes/matches.ts's buildFootballUpcomingFromGoalApi). Never throws — a
 * failed PropLine fetch or an unmatched fixture just leaves it unpriced
 * until the next call. */
export function triggerPrematchPropLineFootballSync(
  fixtures: PrematchFootballFixtureRef[],
): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runSync(fixtures)
    .catch((err) => {
      logger.error({ err }, "[propline] triggerPrematchPropLineFootballSync failed");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function runSync(fixtures: PrematchFootballFixtureRef[]): Promise<void> {
  if (!CONFIG.PROPLINE_API_KEY) return;
  const now = Date.now();
  const stale = fixtures.filter((fx) => {
    const entry = cache.get(fx.providerMatchId);
    return !entry || now - entry.fetchedAt > PRICE_TTL_MS;
  });
  if (stale.length === 0) return;

  const sportKeys = configuredSoccerSportKeys();
  if (sportKeys.length === 0) return;

  const pool: ProplineEvent[] = [];
  for (const key of sportKeys) {
    const events = await fetchSoccerLeagueOdds(key);
    pool.push(...events);
  }
  if (pool.length === 0) return;

  let matched = 0;
  let priced = 0;
  for (const fx of stale) {
    const ev = proplineFindEventByName(pool, { home: fx.home, away: fx.away });
    if (!ev) continue;
    matched++;
    const odds = extractProplineH2HOdds(ev.bookmakers, ev.home_team, ev.away_team, true);
    if (!odds) continue;
    cache.set(fx.providerMatchId, { ...odds, proplineEventId: ev.id, fetchedAt: Date.now() });
    priced++;
  }
  logger.info(
    { attempted: stale.length, poolSize: pool.length, matched, priced, cacheSize: cache.size },
    "[propline] prematch football sync done",
  );
}
