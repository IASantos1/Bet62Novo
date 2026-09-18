// Live football moneyline sync via PropLine — added 2026-09-18 alongside
// prematchFootballOddsCache.ts as part of moving football odds off GOAL API
// (its own live-odds endpoint is deactivated — see oddsEngine.ts's header)
// onto PropLine. Mirrors the write pattern PulseScore's shadowMatchSync.ts
// runOddsComparisonPhase used: match the already-live GOAL API fixture to a
// PropLine event by team name, average its bookmakers' h2h price, and write
// straight into routes/matches.ts's shared liveMatchState — the same Map
// routes/bets.ts reads for bet acceptance.
//
// europeanHandicap/anytimeGoalscorer/firstGoalscorer (added 2026-09-18,
// same day as prematchFootballOddsCache.ts's real-market build-out) are
// deliberately the ONLY extra markets this file writes beyond the
// moneyline — routes/matches.ts's live drift engine (the due()-scheduled
// oscillators, a few hundred lines into buildFootballLiveFromGoalApi's
// polling logic) reads and rewrites state.markets.totalGoals/handicap/
// htft/correctScore/corners/cards/etc on its own schedule as part of the
// synthetic Poisson model every live match gets seeded with; writing a
// real PropLine price into any of those same fields here would just get
// silently overwritten by the very next drift tick — the exact "market
// wiped every ~1-2s" bug already found and fixed once for `odds` itself
// (via hasRealOdds/_priceSource). europeanHandicap/anytimeGoalscorer/
// firstGoalscorer are brand new fields the drift engine has never heard of
// and never touches, so they're safe to set here directly. Wiring the
// rest of the real markets (totals/BTTS/handicap/htft/etc) into live too
// needs the drift engine taught to leave real-priced fields alone first —
// out of scope for this pass.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { liveMatchState, broadcastMatchDelta, type LiveMatchState } from "../../routes/matches.js";
import { propline, type ProplineEvent } from "./index.js";
import {
  extractProplineH2HOdds,
  extractProplineEuropeanHandicap,
  extractProplineGoalscorerMatchedToRoster,
} from "./common.js";
import { proplineFindEventByName, proplineAllActiveSports } from "./football.js";
import { fetchGoalApiRosterNames, fetchGoalApiSquadNames } from "./prematchFootballOddsCache.js";

/** proplineAllActiveSports() (not CONFIG.PROPLINE_ENABLED_SPORTS directly) —
 * see prematchFootballOddsCache.ts's own comment on this same function for
 * the real bug this avoids (an unset PROPLINE_ENABLED_SPORTS env var meant
 * zero soccer keys here, so live football odds were never fetched either). */
function configuredSoccerSportKeys(): string[] {
  return [...new Set(proplineAllActiveSports().filter((k) => k.startsWith("soccer_")))];
}

/** Fetches one soccer_* league's odds directly via the PropLine client —
 * see prematchFootballOddsCache.ts's fetchSoccerLeagueOdds for the real bug
 * this avoids (football.ts's proplineFetchAllUpcomingOdds round-trips the
 * key through resolveProplineSportKey, which silently rejects an
 * already-canonical soccer_* key whenever PROPLINE_ENABLED_SPORTS is
 * unset — the same failure mode basketball.ts/hockey.ts never hit because
 * they always call propline.getOdds() directly). */
async function fetchSoccerLeagueOdds(sportKey: string): Promise<ProplineEvent[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  try {
    const events = await propline.getOdds(sportKey, {
      markets: ["h2h", "european_handicap", "anytime_goal_scorer", "first_goal_scorer"],
      oddsFormat: "decimal",
    });
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
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
    pool.push(...(await fetchSoccerLeagueOdds(key)));
  }
  if (pool.length === 0) return;

  let priced = 0;
  for (const state of liveFootball) {
    const ev = proplineFindEventByName(pool, { home: state.home, away: state.away });
    if (!ev) continue;
    const odds = extractProplineH2HOdds(ev.bookmakers, ev.home_team, ev.away_team, true);
    if (!odds) continue;

    const europeanHandicap = extractProplineEuropeanHandicap(ev.bookmakers, ev.home_team, ev.away_team);
    const goalApiFixtureId = state.id.replace(/^goalapi-football-/, "");
    let rosterNames = await fetchGoalApiRosterNames(goalApiFixtureId);
    if (rosterNames.length === 0) {
      rosterNames = await fetchGoalApiSquadNames(state.homeTeamId, state.awayTeamId);
    }
    const anytimeGoalscorer = extractProplineGoalscorerMatchedToRoster(ev.bookmakers, "anytime_goal_scorer", rosterNames);
    const firstGoalscorer = extractProplineGoalscorerMatchedToRoster(ev.bookmakers, "first_goal_scorer", rosterNames);

    const oddsChanged = JSON.stringify(odds) !== JSON.stringify(state.odds);
    const marketsChanged =
      JSON.stringify(europeanHandicap) !== JSON.stringify(state.markets.europeanHandicap ?? null) ||
      JSON.stringify(anytimeGoalscorer) !== JSON.stringify(state.markets.anytimeGoalscorer ?? null) ||
      JSON.stringify(firstGoalscorer) !== JSON.stringify(state.markets.firstGoalscorer ?? null);
    const versionBumped = oddsChanged || marketsChanged || state._priceSource !== "propline";
    const updated: LiveMatchState = {
      ...state,
      odds,
      hasRealOdds: true,
      _priceSource: "propline",
      _proplineEventId: ev.id,
      markets: {
        ...state.markets,
        ...(europeanHandicap ? { europeanHandicap } : {}),
        ...(anytimeGoalscorer ? { anytimeGoalscorer } : {}),
        ...(firstGoalscorer ? { firstGoalscorer } : {}),
      },
      marketVersion: versionBumped ? (state.marketVersion ?? 0) + 1 : state.marketVersion,
    };
    liveMatchState.set(state.id, updated);
    if (oddsChanged || marketsChanged) {
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
