// Live football moneyline sync via PropLine — added 2026-09-18 alongside
// prematchFootballOddsCache.ts as part of moving football odds off GOAL API
// (its own live-odds endpoint is deactivated — see oddsEngine.ts's header)
// onto PropLine. Mirrors the write pattern PulseScore's shadowMatchSync.ts
// runOddsComparisonPhase used: match the already-live GOAL API fixture to a
// PropLine event by team name, average its bookmakers' h2h price, and write
// straight into routes/matches.ts's shared liveMatchState — the same Map
// routes/bets.ts reads for bet acceptance. Markets beyond the moneyline stay
// zerofilled here (same fast-follow scope as prematchFootballOddsCache.ts).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { liveMatchState, broadcastMatchDelta, type LiveMatchState } from "../../routes/matches.js";
import type { ProplineEvent } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";
import { proplineFetchAllUpcomingOdds, proplineFindEventByName } from "./football.js";

function configuredSoccerSportKeys(): string[] {
  return [...new Set(CONFIG.PROPLINE_ENABLED_SPORTS.filter((k) => k.startsWith("soccer_")))];
}

let inFlight: Promise<void> | null = null;

/** Fire-and-forget — call on a timer (see api/index.ts). Only an in-flight
 * guard here, not a time-based throttle: this is meant to run every few
 * seconds while there are live football matches. */
export function runPropLineLiveFootballOddsSync(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runSync()
    .catch((err) => {
      logger.error({ err }, "[propline] runPropLineLiveFootballOddsSync failed");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function runSync(): Promise<void> {
  if (!CONFIG.PROPLINE_API_KEY) return;
  const liveFootball = [...liveMatchState.values()].filter((s) => s.sport === "football");
  if (liveFootball.length === 0) return;

  const sportKeys = configuredSoccerSportKeys();
  if (sportKeys.length === 0) return;

  const pool: ProplineEvent[] = [];
  for (const key of sportKeys) {
    pool.push(...(await proplineFetchAllUpcomingOdds(key)));
  }
  if (pool.length === 0) return;

  let priced = 0;
  for (const state of liveFootball) {
    const ev = proplineFindEventByName(pool, { home: state.home, away: state.away });
    if (!ev) continue;
    const odds = extractProplineH2HOdds(ev.bookmakers, ev.home_team, ev.away_team, true);
    if (!odds) continue;

    const oddsChanged = JSON.stringify(odds) !== JSON.stringify(state.odds);
    const versionBumped = oddsChanged || state._priceSource !== "propline";
    const updated: LiveMatchState = {
      ...state,
      odds,
      hasRealOdds: true,
      _priceSource: "propline",
      _proplineEventId: ev.id,
      marketVersion: versionBumped ? (state.marketVersion ?? 0) + 1 : state.marketVersion,
    };
    liveMatchState.set(state.id, updated);
    if (oddsChanged) {
      broadcastMatchDelta(state.id, {
        odds: updated.odds,
        markets: updated.markets,
        marketVersion: updated.marketVersion,
      });
    }
    priced++;
  }
  logger.info(
    { liveFootball: liveFootball.length, poolSize: pool.length, priced },
    "[propline] live football odds sync done",
  );
}
