// PulseScore Fase 1 — shadow matching + odds comparison against real live
// football data. Per the approved plan, and its natural follow-up: this
// ONLY records which PulseScore event corresponds to which GOAL-API-sourced
// canonical match, and logs how PulseScore's live 1X2 compares to what's
// currently live — it never touches routes/matches.ts's live odds,
// routes/bets.ts, or anything a bettor sees. Same "capture as an internal
// benchmark, never surface" convention LiveMatchState already uses for
// GOAL API's own O/U2.5+BTTS reference odds (_providerReferenceOdds) and
// api-tennis's live odds reference (_apiTennisLiveOddsRef) — this is that
// same pattern, just logged instead of stored on the match state, since
// nothing downstream needs to read it yet.
//
// Scoped to LIVE football only for this first pass: PulseScore's pre-match
// /soccer/events has ~3450 events across ~690 pages at the limit=5 tested
// by the user — paginating all of that without knowing the provider's real
// max page size isn't reasonable yet. /live-events has ~30 total, a much
// smaller and more tractable pool, and live matches are the higher-value
// target anyway (the harder, more valuable problem for a live book). Pre-
// match matching and odds comparison are a natural follow-up once the live
// version of both is validated.
import { logger } from "../../lib/logger.js";
import {
  attachProviderMapping,
  getMatchedLiveFootballFixtures,
  getUnmatchedGoalApiFootballMatches,
  type MatchedLiveFootballFixture,
  type UnmatchedGoalApiMatch,
} from "../../lib/canonicalMatchCatalog.js";
import { matchGoalApiFixtureToPulseScore, type GoalApiFixtureRef } from "../../matching/footballMatchEngine.js";
import { isVirtualPulseScoreLeague } from "./filters.js";
import { normalizePulseScoreEvent } from "./normalizer.js";
import { pulseScore } from "./client.js";
import type { PulseScoreEvent } from "./types.js";
import { liveMatchState } from "../../routes/matches.js";

const PROVIDER = "pulsescore";
const PROVIDER_SPORT = "football";
/** Safety cap on pagination — PulseScore's real max page size for
 * live-events isn't confirmed, so this bounds worst-case request count
 * regardless of what limit the provider actually honors. */
const MAX_PAGES = 10;

async function fetchLivePulseScoreCandidates(): Promise<PulseScoreEvent[]> {
  const candidates: PulseScoreEvent[] = [];
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const resp = await pulseScore.getLiveEvents({ page, limit: 50, sport: "soccer" });
    for (const ev of resp.events) {
      if (isVirtualPulseScoreLeague(ev.league)) continue;
      candidates.push(ev);
    }
    if (!resp.hasNextPage) break;
  }
  return candidates;
}

async function runMatchingPhase(unmatched: UnmatchedGoalApiMatch[], candidates: PulseScoreEvent[]): Promise<void> {
  let matched = 0;
  let totalConfidence = 0;

  for (const goalApiMatch of unmatched) {
    const fixture: GoalApiFixtureRef = {
      id: goalApiMatch.providerMatchId,
      homeTeamName: goalApiMatch.home,
      awayTeamName: goalApiMatch.away,
      leagueName: goalApiMatch.leagueName,
      kickoffUtc: goalApiMatch.kickoffUtc ? goalApiMatch.kickoffUtc.toISOString() : null,
    };
    const candidate = matchGoalApiFixtureToPulseScore(fixture, candidates);
    if (!candidate) continue;

    const pulseScoreEvent = candidates.find((ev) => ev.eventId === candidate.pulseScoreEventId);
    if (!pulseScoreEvent) continue; // shouldn't happen — defensive only

    try {
      await attachProviderMapping({
        matchId: goalApiMatch.matchId,
        provider: PROVIDER,
        providerSport: PROVIDER_SPORT,
        providerMatchId: candidate.pulseScoreEventId,
        home: pulseScoreEvent.home,
        away: pulseScoreEvent.away,
        confidence: candidate.confidence,
      });
      matched++;
      totalConfidence += candidate.confidence;
    } catch (err) {
      logger.error(
        { err, matchId: goalApiMatch.matchId, pulseScoreEventId: candidate.pulseScoreEventId },
        "[pulsescore-shadow-match] attachProviderMapping failed",
      );
    }
  }

  logger.info(
    {
      attempted: unmatched.length,
      candidatePoolSize: candidates.length,
      matched,
      unmatched: unmatched.length - matched,
      avgConfidence: matched > 0 ? Math.round(totalConfidence / matched) : null,
    },
    "[pulsescore-shadow-match] matching round complete",
  );
}

function pctDelta(candidate: number, reference: number): number | null {
  if (!(reference > 0)) return null;
  return Math.round(((candidate - reference) / reference) * 1000) / 10;
}

/** Compares PulseScore's live 1X2 against what's currently live in
 * LiveMatchState (routes/matches.ts) — the exact price a bettor sees right
 * now — for every fixture already matched to a PulseScore event. Read-only
 * on LiveMatchState: nothing here writes back to it or to any route. */
async function runOddsComparisonPhase(
  matchedFixtures: MatchedLiveFootballFixture[],
  candidates: PulseScoreEvent[],
): Promise<void> {
  let compared = 0;

  for (const fixture of matchedFixtures) {
    const liveState = liveMatchState.get(`goalapi-football-${fixture.goalApiProviderMatchId}`);
    if (!liveState) continue; // no longer live on the GOAL API side this round

    const pulseScoreEvent = candidates.find((ev) => ev.eventId === fixture.otherProviderMatchId);
    if (!pulseScoreEvent) continue; // no longer in PulseScore's live pool this round

    const normalized = normalizePulseScoreEvent(pulseScoreEvent);
    if (!normalized.matchResult) continue; // PulseScore has no FULL_TIME 1X2 market right now

    const bet62Odds = liveState.odds;
    const pulseScoreOdds = normalized.matchResult;
    compared++;
    logger.info(
      {
        matchId: fixture.matchId,
        matchConfidence: fixture.otherProviderConfidence,
        bet62Odds,
        pulseScoreOdds,
        deltaPct: {
          home: pctDelta(pulseScoreOdds.home, bet62Odds.home),
          draw: pctDelta(pulseScoreOdds.draw, bet62Odds.draw),
          away: pctDelta(pulseScoreOdds.away, bet62Odds.away),
        },
      },
      "[pulsescore-shadow-odds] live 1X2 comparison",
    );
  }

  logger.debug(
    { compared, totalMatched: matchedFixtures.length },
    "[pulsescore-shadow-odds] comparison round complete",
  );
}

/** Exported for direct testability (bypasses the in-flight guard below,
 * same reason canonicalMatchCatalog.ts exports ensureCanonicalMatch
 * alongside its own throttled wrapper). */
export async function runOnce(): Promise<void> {
  const [unmatched, matchedFixtures] = await Promise.all([
    getUnmatchedGoalApiFootballMatches(PROVIDER),
    getMatchedLiveFootballFixtures(PROVIDER),
  ]);
  if (unmatched.length === 0 && matchedFixtures.length === 0) {
    logger.debug("[pulsescore-shadow] nothing to match or compare — skipping fetch");
    return;
  }

  const candidates = await fetchLivePulseScoreCandidates();

  if (unmatched.length > 0) {
    await runMatchingPhase(unmatched, candidates);
  }
  if (matchedFixtures.length > 0) {
    await runOddsComparisonPhase(matchedFixtures, candidates);
  }
}

let syncInFlight: Promise<void> | null = null;

/** Fire-and-forget — call on a timer (see api/index.ts). Only an in-flight
 * guard here, not a time-based throttle too: this is called from exactly
 * one setInterval, so the caller already fixes the cadence; the guard just
 * stops the next tick from overlapping a still-running round. */
export function runPulseScoreShadowMatchSync(): void {
  if (syncInFlight) return;
  syncInFlight = runOnce()
    .catch((err) => logger.error({ err }, "[pulsescore-shadow-match] sync failed"))
    .finally(() => {
      syncInFlight = null;
    });
}
