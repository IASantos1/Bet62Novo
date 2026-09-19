// Live tennis odds sync via PropLine — added 2026-09-19 as part of the
// tennis architecture rework. api-tennis.com stays the sole match-state
// source (score/sets/server/statistics) and already supplies real
// moneyline/set-betting/game-handicap/total-games prices via its own
// get_live_odds (confirmed real 2026-09-11) — this file adds the markets
// api-tennis does NOT price at all: total sets, total tiebreaks, and
// per-player aces (confirmed real PropLine keys, see the tennis plan's
// Fase 0). Deliberately does NOT touch moneyline/gameHandicap/totalGames —
// two real providers pricing the same field would just flicker between two
// different (both real) numbers depending on which sync last ran, with no
// actual benefit over api-tennis's already-working values for those.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  liveMatchState,
  broadcastMatchDelta,
  type LiveMatchState,
} from "../../routes/matches.js";
import { propline, type ProplineEvent } from "./index.js";
import {
  extractProplineTennisTotalSets,
  extractProplineTennisTotalTiebreaks,
  extractProplineTennisPlayerAces,
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

    const totalSets = extractProplineTennisTotalSets(ev.bookmakers);
    const totalTiebreaks = extractProplineTennisTotalTiebreaks(ev.bookmakers);
    const aces = extractProplineTennisPlayerAces(ev.bookmakers, ev.home_team, ev.away_team);
    if (!totalSets && !totalTiebreaks && !aces.home && !aces.away) continue;

    const tennisExtra = { ...state.markets.tennisExtra };
    if (totalSets) tennisExtra.totalSets = totalSets;
    if (totalTiebreaks) tennisExtra.totalTieBreaks = totalTiebreaks;
    if (aces.home) tennisExtra.homeAces = aces.home;
    if (aces.away) tennisExtra.awayAces = aces.away;

    const updatedMarkets = { ...state.markets, tennisExtra };
    const marketsChanged = JSON.stringify(updatedMarkets) !== JSON.stringify(state.markets);
    if (!marketsChanged) continue;
    const updated: LiveMatchState = {
      ...state,
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
