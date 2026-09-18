// Real-price cache for football prematch odds via PropLine — added
// 2026-09-18 as part of moving football odds off GOAL API (deactivated
// odds/live-odds, kept only for fixtures/events/stats) onto PropLine.
// GOAL API fixtures are looked up here by team name against PropLine's
// soccer events, same "progressively warm, never block the response"
// pattern the old bzzoiro/PulseScore prematch caches used.
//
// Every market key below was confirmed real 2026-09-18 via PropLine's own
// GET /sports/{sport}/events/{id}/markets (never guessed from the vendor's
// prose docs, which list markets this API doesn't actually expose under
// the names/keys they use — e.g. the docs never mention that BTTS's real
// key is `both_teams_to_score`, not `btts`; an earlier check against the
// wrong key wrongly concluded BTTS didn't exist for soccer at all).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { propline, type ProplineEvent } from "./index.js";
import {
  extractProplineH2HOdds,
  extractProplineTotalGoals,
  extractProplineAsianHandicap,
  extractProplineBothTeamsToScore,
  extractProplineDrawNoBet,
  extractProplineDoubleChance,
  extractProplineHalfTimeFullTime,
  extractProplineCorrectScore,
  extractProplineTotalCorners,
  extractProplineTotalCards,
  extractProplineTeamCorners,
  type ProplineTotalGoals,
  type ProplineTotalCorners,
  type ProplineTotalCards,
} from "./common.js";
import { proplineFindEventByName, proplineAllActiveSports } from "./football.js";

const FOOTBALL_MARKET_KEYS = [
  "h2h",
  "totals",
  "spreads",
  "both_teams_to_score",
  "draw_no_bet",
  "double_chance",
  "half_time_full_time",
  "correct_score",
  "total_corners",
  "team_corners",
  "total_cards",
];

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
    const events = await propline.getOdds(sportKey, { markets: FOOTBALL_MARKET_KEYS, oddsFormat: "decimal" });
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
  totalGoals: ProplineTotalGoals | null;
  asianHandicap: { line: number; home: number; away: number } | null;
  bothTeamsToScore: { yes: number; no: number } | null;
  drawNoBet: { home: number; away: number } | null;
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number } | null;
  htft: {
    hh: number; hd: number; ha: number;
    dh: number; dd: number; da: number;
    ah: number; ad: number; aa: number;
  } | null;
  correctScore: Record<string, number> | null;
  totalCorners: ProplineTotalCorners | null;
  totalCards: ProplineTotalCards | null;
  homeCorners: { line: number; over: number; under: number } | null;
  awayCorners: { line: number; over: number; under: number } | null;
  fetchedAt: number;
};

const cache = new Map<string, CachedFootballOdds>();
const PRICE_TTL_MS = 30 * 60 * 1000;

export function getPrematchPropLineFootballOdds(
  goalApiFixtureId: string,
): Omit<CachedFootballOdds, "fetchedAt"> | null {
  const entry = cache.get(goalApiFixtureId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PRICE_TTL_MS) return null;
  const { fetchedAt: _fetchedAt, ...rest } = entry;
  return rest;
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
    const teamCorners = extractProplineTeamCorners(ev.bookmakers, ev.home_team, ev.away_team);
    cache.set(fx.providerMatchId, {
      ...odds,
      proplineEventId: ev.id,
      totalGoals: extractProplineTotalGoals(ev.bookmakers),
      asianHandicap: extractProplineAsianHandicap(ev.bookmakers, ev.home_team, ev.away_team),
      bothTeamsToScore: extractProplineBothTeamsToScore(ev.bookmakers),
      drawNoBet: extractProplineDrawNoBet(ev.bookmakers, ev.home_team, ev.away_team),
      doubleChance: extractProplineDoubleChance(ev.bookmakers, ev.home_team, ev.away_team),
      htft: extractProplineHalfTimeFullTime(ev.bookmakers, ev.home_team, ev.away_team),
      correctScore: extractProplineCorrectScore(ev.bookmakers),
      totalCorners: extractProplineTotalCorners(ev.bookmakers),
      totalCards: extractProplineTotalCards(ev.bookmakers),
      homeCorners: teamCorners.home,
      awayCorners: teamCorners.away,
      fetchedAt: Date.now(),
    });
    priced++;
  }
  logger.info(
    { attempted: stale.length, poolSize: pool.length, matched, priced, cacheSize: cache.size },
    "[propline] prematch football sync done",
  );
}
