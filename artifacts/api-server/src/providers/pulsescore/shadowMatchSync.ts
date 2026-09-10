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
import { matchGoalApiFixtureToPulseScore, debugBestCandidate, type GoalApiFixtureRef } from "../../matching/footballMatchEngine.js";
import { isVirtualPulseScoreLeague } from "./filters.js";
import { normalizePulseScoreEvent, type NormalizedMarketGroup } from "./normalizer.js";
import { pulseScore } from "./client.js";
import type { PulseScoreEvent } from "./types.js";
import { liveMatchState, type LiveMatchState } from "../../routes/matches.js";

type Markets = LiveMatchState["markets"];

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

type MatchingPhaseResult = {
  attempted: number;
  matched: number;
  unmatched: number;
  avgConfidence: number | null;
  /** Diagnostic breakdown — see the header note on getUnmatchedGoalApiFootballMatches's
   * status field: most of `unmatched` is expected to be scheduled fixtures
   * that simply haven't kicked off yet (PulseScore's candidate pool is
   * live-only), so counting those as "misses" would be misleading. These
   * fields only ever describe the subset that's actually live right now. */
  liveAttempted: number;
  /** Live fixtures where even the best PulseScore candidate's team-name
   * similarity never cleared NAME_FLOOR — no kickoff/league agreement
   * could have rescued these; likely a real name-normalization gap. */
  liveNameFloorMisses: number;
  /** Live fixtures where the best candidate's name cleared NAME_FLOOR but
   * the combined confidence still fell short of MIN_REPORTABLE_CONFIDENCE
   * — plausible pairs the threshold is (for now) rejecting. */
  liveBelowThresholdMisses: number;
};

type NearMissSample = {
  matchId: number;
  goalApiFixture: string;
  bestPulseScoreEventId: string | null;
  confidence: number | null;
  nameSim: number | null;
  passedNameFloor: boolean;
  kickoffDeltaMinutes: number | null;
};

async function runMatchingPhase(
  unmatched: UnmatchedGoalApiMatch[],
  candidates: PulseScoreEvent[],
): Promise<MatchingPhaseResult> {
  let matched = 0;
  let totalConfidence = 0;
  let liveAttempted = 0;
  let liveNameFloorMisses = 0;
  let liveBelowThresholdMisses = 0;
  const nearMissSamples: NearMissSample[] = [];

  for (const goalApiMatch of unmatched) {
    const fixture: GoalApiFixtureRef = {
      id: goalApiMatch.providerMatchId,
      homeTeamName: goalApiMatch.home,
      awayTeamName: goalApiMatch.away,
      leagueName: goalApiMatch.leagueName,
      kickoffUtc: goalApiMatch.kickoffUtc ? goalApiMatch.kickoffUtc.toISOString() : null,
    };
    const candidate = matchGoalApiFixtureToPulseScore(fixture, candidates);

    if (!candidate) {
      // Only diagnose LIVE fixtures — a scheduled one correctly has
      // nothing to match yet against PulseScore's live-only candidate pool.
      if (goalApiMatch.status === "live") {
        liveAttempted++;
        const diag = debugBestCandidate(fixture, candidates);
        if (diag.passedNameFloor) liveBelowThresholdMisses++;
        else liveNameFloorMisses++;
        nearMissSamples.push({
          matchId: goalApiMatch.matchId,
          goalApiFixture: `${goalApiMatch.home} vs ${goalApiMatch.away}`,
          bestPulseScoreEventId: diag.pulseScoreEventId,
          confidence: diag.confidence,
          nameSim: diag.nameSim,
          passedNameFloor: diag.passedNameFloor,
          kickoffDeltaMinutes: diag.kickoffDeltaMinutes,
        });
      }
      continue;
    }

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

  const result: MatchingPhaseResult = {
    attempted: unmatched.length,
    matched,
    unmatched: unmatched.length - matched,
    avgConfidence: matched > 0 ? Math.round(totalConfidence / matched) : null,
    liveAttempted,
    liveNameFloorMisses,
    liveBelowThresholdMisses,
  };
  logger.info(
    { ...result, candidatePoolSize: candidates.length },
    "[pulsescore-shadow-match] matching round complete",
  );
  if (nearMissSamples.length > 0) {
    nearMissSamples.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
    logger.info(
      { samples: nearMissSamples.slice(0, 8), totalLiveMisses: nearMissSamples.length },
      "[pulsescore-shadow-match] closest near-misses among live, still-unmatched fixtures (diagnostic only)",
    );
  }
  return result;
}

function pctDelta(candidate: number, reference: number): number | null {
  if (!(reference > 0)) return null;
  return Math.round(((candidate - reference) / reference) * 1000) / 10;
}

/** BET62's totalGoals only tracks fixed .5-increment lines (see
 * routes/matches.ts's AdvancedMarkets) — this is the wiring-time decision
 * the normalizer's header comment deliberately deferred: PulseScore emits
 * many lines per market (confirmed real: 5.5, 5.75, AND 6.25 on the same
 * fixture), so only the lines BET62 already has a slot for are compared;
 * anything else is neither fabricated nor forced into the wrong slot. */
const OVER_UNDER_LINES: Array<{
  line: number;
  bet62Over: keyof Markets["totalGoals"];
  bet62Under: keyof Markets["totalGoals"];
}> = [
  { line: 0.5, bet62Over: "over05", bet62Under: "under05" },
  { line: 1.5, bet62Over: "over15", bet62Under: "under15" },
  { line: 2.5, bet62Over: "over25", bet62Under: "under25" },
  { line: 3.5, bet62Over: "over35", bet62Under: "under35" },
  { line: 4.5, bet62Over: "over45", bet62Under: "under45" },
  { line: 5.5, bet62Over: "over55", bet62Under: "under55" },
  { line: 6.5, bet62Over: "over65", bet62Under: "under65" },
];

function extractPulseScoreOverUnderByLine(
  markets: NormalizedMarketGroup[],
): Map<number, { over?: number; under?: number }> {
  const group = markets.find((m) => m.market === "OVER_UNDER" && m.period === "FULL_TIME");
  const byLine = new Map<number, { over?: number; under?: number }>();
  if (!group) return byLine;
  for (const sel of group.selections) {
    if (sel.line == null || (sel.outcome !== "OVER" && sel.outcome !== "UNDER")) continue;
    const entry = byLine.get(sel.line) ?? {};
    if (sel.outcome === "OVER") entry.over = sel.odds;
    else entry.under = sel.odds;
    byLine.set(sel.line, entry);
  }
  return byLine;
}

/** Compares PulseScore's live markets against what's currently live in
 * LiveMatchState (routes/matches.ts) — the exact prices a bettor sees
 * right now — for every fixture already matched to a PulseScore event.
 * Read-only on LiveMatchState: nothing here writes back to it or to any
 * route. Builds the comparison incrementally from whichever markets are
 * actually present on both sides; only logs a fixture if at least one
 * market pair was genuinely compared, never a line/market either side is
 * missing. */
type OddsComparisonPhaseResult = {
  compared: number;
  totalMatched: number;
};

async function runOddsComparisonPhase(
  matchedFixtures: MatchedLiveFootballFixture[],
  candidates: PulseScoreEvent[],
): Promise<OddsComparisonPhaseResult> {
  let compared = 0;

  for (const fixture of matchedFixtures) {
    const liveState = liveMatchState.get(`goalapi-football-${fixture.goalApiProviderMatchId}`);
    if (!liveState) continue; // no longer live on the GOAL API side this round

    const pulseScoreEvent = candidates.find((ev) => ev.eventId === fixture.otherProviderMatchId);
    if (!pulseScoreEvent) continue; // no longer in PulseScore's live pool this round

    const normalized = normalizePulseScoreEvent(pulseScoreEvent);
    const bet62Markets = liveState.markets;

    const result: Record<string, unknown> = {};

    if (normalized.matchResult) {
      const ps = normalized.matchResult;
      const bet62 = liveState.odds;
      result.matchResult1X2 = {
        bet62,
        pulseScore: ps,
        deltaPct: { home: pctDelta(ps.home, bet62.home), draw: pctDelta(ps.draw, bet62.draw), away: pctDelta(ps.away, bet62.away) },
      };
    }

    if (normalized.bothTeamsToScore && bet62Markets.bothTeamsScore) {
      const ps = normalized.bothTeamsToScore;
      const bet62 = bet62Markets.bothTeamsScore;
      result.bothTeamsToScore = {
        bet62,
        pulseScore: ps,
        deltaPct: { yes: pctDelta(ps.yes, bet62.yes), no: pctDelta(ps.no, bet62.no) },
      };
    }

    if (normalized.doubleChance && bet62Markets.doubleChance) {
      const ps = normalized.doubleChance;
      const bet62 = bet62Markets.doubleChance;
      // Same concept, different field name on BET62's side: awayOrDraw
      // (bet62) === drawOrAway (PulseScore normalizer's naming).
      result.doubleChance = {
        bet62,
        pulseScore: ps,
        deltaPct: {
          homeOrDraw: pctDelta(ps.homeOrDraw, bet62.homeOrDraw),
          drawOrAway: pctDelta(ps.drawOrAway, bet62.awayOrDraw),
          homeOrAway: pctDelta(ps.homeOrAway, bet62.homeOrAway),
        },
      };
    }

    const psOverUnder = extractPulseScoreOverUnderByLine(normalized.markets);
    if (psOverUnder.size > 0) {
      const totalGoalsComparisons: Array<{
        line: number;
        bet62: { over: number; under: number };
        pulseScore: { over: number; under: number };
        deltaPct: { over: number | null; under: number | null };
      }> = [];
      for (const { line, bet62Over, bet62Under } of OVER_UNDER_LINES) {
        const ps = psOverUnder.get(line);
        if (!ps || ps.over == null || ps.under == null) continue;
        const bet62Over_ = bet62Markets.totalGoals[bet62Over];
        const bet62Under_ = bet62Markets.totalGoals[bet62Under];
        if (bet62Over_ == null || bet62Under_ == null) continue;
        totalGoalsComparisons.push({
          line,
          bet62: { over: bet62Over_, under: bet62Under_ },
          pulseScore: { over: ps.over, under: ps.under },
          deltaPct: { over: pctDelta(ps.over, bet62Over_), under: pctDelta(ps.under, bet62Under_) },
        });
      }
      if (totalGoalsComparisons.length > 0) result.totalGoals = totalGoalsComparisons;
    }

    if (Object.keys(result).length === 0) continue; // nothing comparable on both sides this round

    compared++;
    logger.info(
      { matchId: fixture.matchId, matchConfidence: fixture.otherProviderConfidence, ...result },
      "[pulsescore-shadow-odds] live market comparison",
    );
  }

  const result: OddsComparisonPhaseResult = { compared, totalMatched: matchedFixtures.length };
  logger.debug(result, "[pulsescore-shadow-odds] comparison round complete");
  return result;
}

export type ShadowSyncStatus = {
  lastRunAt: number | null;
  lastRunOk: boolean;
  lastError: string | null;
  matching: MatchingPhaseResult | null;
  oddsComparison: OddsComparisonPhaseResult | null;
};

let lastStatus: ShadowSyncStatus = {
  lastRunAt: null,
  lastRunOk: true,
  lastError: null,
  matching: null,
  oddsComparison: null,
};

/** Read-only snapshot of the most recent round — what the admin status
 * endpoint (GET /api/admin/pulsescore-status) reports. */
export function getPulseScoreShadowSyncStatus(): ShadowSyncStatus {
  return lastStatus;
}

/** Exported for direct testability (bypasses the in-flight guard below,
 * same reason canonicalMatchCatalog.ts exports ensureCanonicalMatch
 * alongside its own throttled wrapper). */
export async function runOnce(): Promise<void> {
  try {
    const [unmatched, matchedFixtures] = await Promise.all([
      getUnmatchedGoalApiFootballMatches(PROVIDER),
      getMatchedLiveFootballFixtures(PROVIDER),
    ]);
    if (unmatched.length === 0 && matchedFixtures.length === 0) {
      logger.debug("[pulsescore-shadow] nothing to match or compare — skipping fetch");
      lastStatus = { lastRunAt: Date.now(), lastRunOk: true, lastError: null, matching: null, oddsComparison: null };
      return;
    }

    const candidates = await fetchLivePulseScoreCandidates();

    const matching = unmatched.length > 0 ? await runMatchingPhase(unmatched, candidates) : null;
    const oddsComparison =
      matchedFixtures.length > 0 ? await runOddsComparisonPhase(matchedFixtures, candidates) : null;

    lastStatus = { lastRunAt: Date.now(), lastRunOk: true, lastError: null, matching, oddsComparison };
  } catch (err) {
    lastStatus = {
      lastRunAt: Date.now(),
      lastRunOk: false,
      lastError: err instanceof Error ? err.message : String(err),
      matching: null,
      oddsComparison: null,
    };
    throw err;
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
