// PulseScore Fase 1 — shadow matching against real live football data. Per
// the approved plan: this ONLY records which PulseScore event corresponds
// to which GOAL-API-sourced canonical match (a match_provider_mapping row,
// confidence from the real matching engine) — it never touches
// routes/matches.ts's live odds, routes/bets.ts, or anything a bettor sees.
// The point is producing real evidence (match rate, confidence
// distribution, visible in the structured log line each run) before any
// future decision about odds comparison or an eventual source cutover.
//
// Scoped to LIVE football only for this first pass: PulseScore's pre-match
// /soccer/events has ~3450 events across ~690 pages at the limit=5 tested
// by the user — paginating all of that without knowing the provider's real
// max page size isn't reasonable yet. /live-events has ~30 total, a much
// smaller and more tractable pool, and live matches are the higher-value
// target anyway (the harder, more valuable problem for a live book). Pre-
// match matching is a natural follow-up once live-matching is validated.
import { logger } from "../../lib/logger.js";
import {
  attachProviderMapping,
  getUnmatchedGoalApiFootballMatches,
} from "../../lib/canonicalMatchCatalog.js";
import { matchGoalApiFixtureToPulseScore, type GoalApiFixtureRef } from "../../matching/footballMatchEngine.js";
import { isVirtualPulseScoreLeague } from "./filters.js";
import { pulseScore } from "./client.js";
import type { PulseScoreEvent } from "./types.js";

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

/** Exported for direct testability (bypasses the in-flight guard below,
 * same reason canonicalMatchCatalog.ts exports ensureCanonicalMatch
 * alongside its own throttled wrapper). */
export async function runOnce(): Promise<void> {
  const unmatched = await getUnmatchedGoalApiFootballMatches(PROVIDER);
  if (unmatched.length === 0) {
    logger.debug("[pulsescore-shadow-match] no unmatched GOAL API football matches — skipping fetch");
    return;
  }

  const candidates = await fetchLivePulseScoreCandidates();
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
    "[pulsescore-shadow-match] sync round complete",
  );
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
