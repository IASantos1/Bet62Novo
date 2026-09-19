// Live football odds sync via PropLine — added 2026-09-18 alongside
// prematchFootballOddsCache.ts as part of moving football odds off GOAL API
// (its own live-odds endpoint is deactivated — see oddsEngine.ts's header)
// onto PropLine. Mirrors the write pattern PulseScore's shadowMatchSync.ts
// runOddsComparisonPhase used: match the already-live GOAL API fixture to a
// PropLine event by team name, average its bookmakers' price for every real
// market, and write straight into routes/matches.ts's shared liveMatchState
// — the same Map routes/bets.ts reads for bet acceptance.
//
// Extended 2026-09-19 to cover every market prematchFootballOddsCache.ts
// already extracts (totals/spreads/BTTS/draw-no-bet/double-chance/HT-FT/
// correct-score/corners/cards/win-to-nil/first-team-to-score/corners
// handicap/team cards), not just moneyline + european handicap +
// goalscorers — this is now the SOLE source of live football odds/markets.
// routes/matches.ts's old drift engine (the Poisson-model setInterval that
// used to fabricate every market not yet real-priced) has been retired
// entirely per explicit instruction: live football must show ONLY real
// PropLine prices, never a synthetic placeholder. buildFootballLiveFromGoalApi
// now seeds every live match with an honest-empty baseline
// (zerofillAdvancedMarkets()/{home:0,draw:0,away:0}) instead of a synthetic
// anchor, so a market this sync hasn't priced yet simply stays at that zero/
// empty baseline rather than showing a fabricated number.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  liveMatchState,
  broadcastMatchDelta,
  zerofillAdvancedMarkets,
  type LiveMatchState,
  type AdvancedMarkets,
} from "../../routes/matches.js";
import { propline, type ProplineEvent } from "./index.js";
import {
  extractProplineH2HOdds,
  extractProplineTotalGoals,
  extractProplineAsianHandicap,
  extractProplineEuropeanHandicap,
  extractProplineBothTeamsToScore,
  extractProplineDrawNoBet,
  extractProplineDoubleChance,
  extractProplineHalfTimeFullTime,
  extractProplineCorrectScore,
  extractProplineTotalCorners,
  extractProplineTotalCards,
  extractProplineTeamCorners,
  extractProplineTeamCards,
  extractProplineCornersHandicap,
  extractProplineWinToNil,
  extractProplineFirstTeamToScore,
  extractProplineGoalscorerMatchedToRoster,
  extractProplineWinningMargin,
} from "./common.js";
import { proplineFindEventByName, proplineAllActiveSports } from "./football.js";
import {
  fetchGoalApiRosterNames,
  fetchGoalApiSquadNames,
  FOOTBALL_MARKET_KEYS,
} from "./prematchFootballOddsCache.js";

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
      markets: FOOTBALL_MARKET_KEYS,
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

    const goalApiFixtureId = state.id.replace(/^goalapi-football-/, "");
    let rosterNames = await fetchGoalApiRosterNames(goalApiFixtureId);
    if (rosterNames.length === 0) {
      rosterNames = await fetchGoalApiSquadNames(state.homeTeamId, state.awayTeamId);
    }
    const teamCorners = extractProplineTeamCorners(ev.bookmakers, ev.home_team, ev.away_team);
    const teamCards = extractProplineTeamCards(ev.bookmakers, ev.home_team, ev.away_team);
    const totalGoals = extractProplineTotalGoals(ev.bookmakers);
    const correctScore = extractProplineCorrectScore(ev.bookmakers);
    const totalCorners = extractProplineTotalCorners(ev.bookmakers);
    const totalCards = extractProplineTotalCards(ev.bookmakers);

    const marketsPatch: Partial<AdvancedMarkets> = {
      ...(totalGoals ? { totalGoals: { ...state.markets.totalGoals, ...totalGoals } } : {}),
      ...(() => {
        const asianHandicap = extractProplineAsianHandicap(ev.bookmakers, ev.home_team, ev.away_team);
        return asianHandicap ? { asianHandicap } : {};
      })(),
      ...(() => {
        const europeanHandicap = extractProplineEuropeanHandicap(ev.bookmakers, ev.home_team, ev.away_team);
        return europeanHandicap ? { europeanHandicap } : {};
      })(),
      ...(() => {
        const bothTeamsToScore = extractProplineBothTeamsToScore(ev.bookmakers);
        return bothTeamsToScore ? { bothTeamsScore: bothTeamsToScore } : {};
      })(),
      ...(() => {
        const doubleChance = extractProplineDoubleChance(ev.bookmakers, ev.home_team, ev.away_team);
        return doubleChance ? { doubleChance } : {};
      })(),
      ...(() => {
        const drawNoBet = extractProplineDrawNoBet(ev.bookmakers, ev.home_team, ev.away_team);
        return drawNoBet ? { drawNoBet } : {};
      })(),
      ...(() => {
        const htft = extractProplineHalfTimeFullTime(ev.bookmakers, ev.home_team, ev.away_team);
        return htft ? { htft } : {};
      })(),
      ...(correctScore ? { correctScore: { ...state.markets.correctScore, ...correctScore } } : {}),
      ...(totalCorners
        ? { corners: { o85: 0, u85: 0, o95: 0, u95: 0, o105: 0, u105: 0, ...state.markets.corners, ...totalCorners } }
        : {}),
      ...(totalCards
        ? { cards: { o35: 0, u35: 0, o45: 0, u45: 0, ...state.markets.cards, ...totalCards } }
        : {}),
      ...(teamCorners.home ? { homeCorners: teamCorners.home } : {}),
      ...(teamCorners.away ? { awayCorners: teamCorners.away } : {}),
      ...(teamCards.home ? { homeCards: teamCards.home } : {}),
      ...(teamCards.away ? { awayCards: teamCards.away } : {}),
      ...(() => {
        const cornersHandicap = extractProplineCornersHandicap(ev.bookmakers, ev.home_team, ev.away_team);
        return cornersHandicap ? { cornersHandicap } : {};
      })(),
      ...(() => {
        const winToNil = extractProplineWinToNil(ev.bookmakers, ev.home_team, ev.away_team);
        return winToNil ? { winToNil } : {};
      })(),
      ...(() => {
        const firstGoal = extractProplineFirstTeamToScore(ev.bookmakers, ev.home_team, ev.away_team);
        return firstGoal ? { firstGoal } : {};
      })(),
      ...(() => {
        const anytimeGoalscorer = extractProplineGoalscorerMatchedToRoster(ev.bookmakers, "anytime_goal_scorer", rosterNames);
        return anytimeGoalscorer ? { anytimeGoalscorer } : {};
      })(),
      ...(() => {
        const firstGoalscorer = extractProplineGoalscorerMatchedToRoster(ev.bookmakers, "first_goal_scorer", rosterNames);
        return firstGoalscorer ? { firstGoalscorer } : {};
      })(),
      ...(() => {
        const winningMargin = extractProplineWinningMargin(ev.bookmakers, ev.home_team, ev.away_team);
        return winningMargin ? { winningMargin } : {};
      })(),
      ...(() => {
        const twoPlusGoals = extractProplineGoalscorerMatchedToRoster(ev.bookmakers, "2plus_goals", rosterNames);
        return twoPlusGoals ? { twoPlusGoals } : {};
      })(),
      ...(() => {
        const goalOrAssist = extractProplineGoalscorerMatchedToRoster(ev.bookmakers, "goal_or_assist", rosterNames);
        return goalOrAssist ? { goalOrAssist } : {};
      })(),
      ...(() => {
        const playerAssists = extractProplineGoalscorerMatchedToRoster(ev.bookmakers, "player_assists", rosterNames);
        return playerAssists ? { playerAssists } : {};
      })(),
    };

    const updatedMarkets: AdvancedMarkets = { ...state.markets, ...marketsPatch };
    const oddsChanged = JSON.stringify(odds) !== JSON.stringify(state.odds);
    const marketsChanged = JSON.stringify(updatedMarkets) !== JSON.stringify(state.markets);
    const versionBumped = oddsChanged || marketsChanged || state._priceSource !== "propline";
    const updated: LiveMatchState = {
      ...state,
      odds,
      hasRealOdds: true,
      _priceSource: "propline",
      _proplineEventId: ev.id,
      markets: updatedMarkets,
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
