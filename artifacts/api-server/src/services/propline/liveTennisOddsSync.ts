// Live tennis odds sync via PropLine — added 2026-09-19 as part of the
// tennis architecture rework. api-tennis.com stays the sole match-state
// source (score/sets/server/statistics). Originally this file only added
// the markets api-tennis does NOT price at all (total sets, total
// tiebreaks, per-player aces) and deliberately left moneyline/gameHandicap/
// totalGames to api-tennis's own get_live_odds, reasoning that two real
// providers pricing the same field would just flicker between two
// different (both real) numbers with no benefit.
//
// Revised 2026-09-19 (user-reported: tennis score/odds not updating within
// the required 1-2s, explicit "no polling, pure websocket" instruction).
// api-tennis's get_live_odds is a plain REST call cached 10s
// (API_TENNIS_TTL.LIVE in services/apitennis/index.ts) — every tick of the
// sub-second broadcast loop was still reading up to 10-second-stale odds
// underneath it, and api-tennis has no WebSocket for odds at all (only for
// match/score state). PropLine's real WebSocket (websocketClient.ts)
// already wakes this exact sync on every real odds change, debounced to at
// most 2s — the only actually-real-time (non-polling) odds path tennis
// has. So moneyline/gameHandicap/totalGames now come from here too,
// overwriting api-tennis's REST value once PropLine has priced the match;
// api-tennis's get_live_odds remains only as the fallback baseline for the
// brief window before PropLine's WS has fired for a given match (set in
// buildTennisLiveFromApiTennis), never the live source of truth once this
// sync has run.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  liveMatchState,
  broadcastMatchDelta,
  type LiveMatchState,
} from "../../routes/matches.js";
import { propline, type ProplineEvent } from "./index.js";
import {
  extractProplineH2HOdds,
  extractProplineTennisSpread,
  extractProplineTennisTotalGames,
  extractProplineTennisTotalSets,
  extractProplineTennisTotalTiebreaks,
  extractProplineTennisPlayerAces,
  filterFreshBookmakers,
} from "./common.js";
import { TENNIS_MARKET_KEYS, proplineFindTennisEventByPlayers } from "./prematchTennisOddsCache.js";

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

let inFlight: Promise<void> | null = null;

/** Fire-and-forget — call on a timer (see api/index.ts). Only an in-flight
 * guard here, same pattern as runPropLineLiveFootballOddsSync. */
export function runPropLineLiveTennisOddsSync(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runSync()
    .catch((err) => {
      logger.error({ err }, "[propline] runPropLineLiveTennisOddsSync failed");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function runSync(): Promise<void> {
  if (!CONFIG.PROPLINE_API_KEY) return;
  const liveTennis = [...liveMatchState.values()].filter((s) => s.sport === "tennis");
  if (liveTennis.length === 0) return;

  const pool = await fetchTennisOdds();
  if (pool.length === 0) return;

  let priced = 0;
  for (const state of liveTennis) {
    if (!state.markets.tennisExtra) continue; // builder always sets this for tennis; skip if somehow absent
    const ev = proplineFindTennisEventByPlayers(pool, state.home, state.away);
    if (!ev) continue;

    // Same real staleness fix as liveFootballOddsSync.ts (2026-09-19).
    const freshBookmakers = filterFreshBookmakers(ev.bookmakers);
    const moneyline = extractProplineH2HOdds(freshBookmakers, ev.home_team, ev.away_team, false);
    const gameHandicap = extractProplineTennisSpread(freshBookmakers, ev.home_team, ev.away_team);
    const totalGames = extractProplineTennisTotalGames(freshBookmakers);
    const totalSets = extractProplineTennisTotalSets(freshBookmakers);
    const totalTiebreaks = extractProplineTennisTotalTiebreaks(freshBookmakers);
    const aces = extractProplineTennisPlayerAces(freshBookmakers, ev.home_team, ev.away_team);
    if (!moneyline && !gameHandicap && !totalGames && !totalSets && !totalTiebreaks && !aces.home && !aces.away) {
      continue;
    }

    const tennisExtra = { ...state.markets.tennisExtra };
    if (gameHandicap) tennisExtra.gameHandicap = gameHandicap;
    if (totalGames) tennisExtra.totalGames = totalGames;
    if (totalSets) tennisExtra.totalSets = totalSets;
    if (totalTiebreaks) tennisExtra.totalTieBreaks = totalTiebreaks;
    if (aces.home) tennisExtra.homeAces = aces.home;
    if (aces.away) tennisExtra.awayAces = aces.away;

    const updatedMarkets = { ...state.markets, tennisExtra };
    const updatedOdds = moneyline ? { home: moneyline.home, draw: 0, away: moneyline.away } : state.odds;
    const oddsChanged = JSON.stringify(updatedOdds) !== JSON.stringify(state.odds);
    const marketsChanged = JSON.stringify(updatedMarkets) !== JSON.stringify(state.markets);
    if (!oddsChanged && !marketsChanged) continue;
    const updated: LiveMatchState = {
      ...state,
      odds: updatedOdds,
      hasRealOdds: state.hasRealOdds || Boolean(moneyline),
      markets: updatedMarkets,
      marketVersion: (state.marketVersion ?? 0) + 1,
    };
    liveMatchState.set(state.id, updated);
    broadcastMatchDelta(state.id, {
      odds: updated.odds,
      markets: updated.markets,
      marketVersion: updated.marketVersion,
    });
    priced++;
  }
  logger.info(
    { liveTennis: liveTennis.length, poolSize: pool.length, priced },
    "[propline] live tennis odds sync done",
  );
}
