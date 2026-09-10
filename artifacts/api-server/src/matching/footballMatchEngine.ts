// Pairs a GOAL API football fixture against PulseScore events, producing a
// confidence score instead of a binary yes/no — per the user's spec
// (levels 1-5: ID mapping, team IDs, normalized team names, kickoff
// proximity, league match). Only levels 3-5 are implemented: neither
// provider exposes a cross-referenceable id today (GOAL API's team ids
// and PulseScore's eventId/leagueId are both provider-internal, with no
// shared external id system observed between them), so levels 1-2 have
// nothing to match against yet — this is structured so they can be added
// later (e.g. if a manual id crosswalk is ever built) without changing
// how levels 3-5 work.
//
// IMPORTANT CAVEAT: the thresholds/weights below are NOT calibrated
// against real paired examples — no GOAL API fixture and PulseScore event
// for the same real-world match have been compared side by side yet (no
// credentials/network access to either provider from this sandbox, and
// none supplied). They're deliberately conservative generic-matching
// defaults. Treat every confidence number as provisional until checked
// against real overlapping fixtures, and re-tune NAME_FLOOR/weights then.
//
// Still fully unwired: nothing calls this from any live route or
// settlement path. It only returns candidate matches for a caller to use
// — it never decides anything on its own.
import { nameSimilarity } from "./teamNameMatch.js";
import { isVirtualPulseScoreLeague } from "../providers/pulsescore/filters.js";
import type { PulseScoreEvent } from "../providers/pulsescore/types.js";

export type GoalApiFixtureRef = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueName?: string | null;
  kickoffUtc?: string | null;
};

export type FootballMatchCandidate = {
  pulseScoreEventId: string;
  /** 0-100, see the calibration caveat above. */
  confidence: number;
  signals: {
    homeNameSimilarity: number;
    awayNameSimilarity: number;
    kickoffDeltaMinutes: number | null;
    leagueSimilarity: number | null;
  };
};

/** Below this, home/away name similarity alone rules out the pair —
 * kickoff or league agreement can never rescue a name mismatch this
 * weak, since plenty of unrelated fixtures share a kickoff slot or a
 * loosely-similar league name. */
const NAME_FLOOR = 0.55;
/** Confidence below this is not returned at all — better to report "no
 * match found" than a low-confidence guess a caller might act on. */
const MIN_REPORTABLE_CONFIDENCE = 60;
const KICKOFF_FULL_CREDIT_MINUTES = 3;
const KICKOFF_ZERO_CREDIT_MINUTES = 30;

function kickoffProximityScore(aIso?: string | null, bIso?: string | null): { score: number | null; deltaMinutes: number | null } {
  if (!aIso || !bIso) return { score: null, deltaMinutes: null };
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { score: null, deltaMinutes: null };
  const deltaMinutes = Math.abs(a - b) / 60_000;
  if (deltaMinutes <= KICKOFF_FULL_CREDIT_MINUTES) return { score: 1, deltaMinutes };
  if (deltaMinutes >= KICKOFF_ZERO_CREDIT_MINUTES) return { score: 0, deltaMinutes };
  const score = 1 - (deltaMinutes - KICKOFF_FULL_CREDIT_MINUTES) / (KICKOFF_ZERO_CREDIT_MINUTES - KICKOFF_FULL_CREDIT_MINUTES);
  return { score, deltaMinutes };
}

/** Always scores the pair, even below NAME_FLOOR — the filtering happens
 * in the two callers below (one strict, one diagnostic-only). Carries
 * `nameSim` alongside the public candidate shape so a caller can tell
 * whether NAME_FLOOR was the reason a pair was rejected. */
function scoreCandidateRaw(fixture: GoalApiFixtureRef, ev: PulseScoreEvent): FootballMatchCandidate & { nameSim: number } {
  const homeNameSimilarity = nameSimilarity(fixture.homeTeamName, ev.home);
  const awayNameSimilarity = nameSimilarity(fixture.awayTeamName, ev.away);
  const nameSim = Math.min(homeNameSimilarity, awayNameSimilarity);

  const { score: kickoffScore, deltaMinutes: kickoffDeltaMinutes } = kickoffProximityScore(
    fixture.kickoffUtc,
    ev.startTime,
  );
  const leagueSimilarity = fixture.leagueName && ev.league ? nameSimilarity(fixture.leagueName, ev.league) : null;

  // Missing signals (no kickoff time on either side, or no league name)
  // are treated as neutral — neither a bonus nor a penalty — since we
  // simply don't know, rather than assuming disagreement.
  const kickoffComponent = kickoffScore ?? 0.5;
  const leagueComponent = leagueSimilarity ?? 0.5;
  const confidence = Math.round(100 * (nameSim * 0.7 + kickoffComponent * 0.2 + leagueComponent * 0.1));

  return {
    pulseScoreEventId: ev.eventId,
    confidence,
    nameSim,
    signals: {
      homeNameSimilarity,
      awayNameSimilarity,
      kickoffDeltaMinutes,
      leagueSimilarity,
    },
  };
}

function scoreCandidate(fixture: GoalApiFixtureRef, ev: PulseScoreEvent): FootballMatchCandidate | null {
  const raw = scoreCandidateRaw(fixture, ev);
  if (raw.nameSim < NAME_FLOOR) return null;
  return raw;
}

/** Returns the best PulseScore candidate for a GOAL API fixture, or null
 * if nothing clears MIN_REPORTABLE_CONFIDENCE. Virtual/simulated
 * PulseScore leagues are excluded up front — they can never correspond
 * to a real GOAL API fixture (see providers/pulsescore/filters.ts). */
export function matchGoalApiFixtureToPulseScore(
  fixture: GoalApiFixtureRef,
  pulseScoreEvents: PulseScoreEvent[],
): FootballMatchCandidate | null {
  let best: FootballMatchCandidate | null = null;
  for (const ev of pulseScoreEvents) {
    if (isVirtualPulseScoreLeague(ev.league)) continue;
    const candidate = scoreCandidate(fixture, ev);
    if (!candidate) continue;
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }
  if (!best || best.confidence < MIN_REPORTABLE_CONFIDENCE) return null;
  return best;
}

export type MatchDiagnostic = {
  pulseScoreEventId: string | null;
  /** The actual team names on the best candidate's side — the whole point
   * of this diagnostic is answering "is this really a different match, or
   * is it a name-formatting gap in nameSimilarity", which needs both raw
   * strings side by side, not just a similarity number. */
  pulseScoreHome: string | null;
  pulseScoreAway: string | null;
  confidence: number | null;
  nameSim: number | null;
  /** Per-side breakdown — nameSim is the min of these two, so seeing which
   * side actually dragged it down (vs both being moderately off) matters
   * for deciding what to fix in nameSimilarity/normalizeTeamName. */
  homeNameSimilarity: number | null;
  awayNameSimilarity: number | null;
  /** false means NAME_FLOOR alone ruled out every candidate — no amount of
   * kickoff/league agreement could have rescued the pair. true + a low
   * confidence means the name was plausible but kickoff/league (or just
   * MIN_REPORTABLE_CONFIDENCE itself) pulled the score down. */
  passedNameFloor: boolean;
  kickoffDeltaMinutes: number | null;
};

/** Debug-only: the single best-scoring candidate regardless of whether it
 * clears NAME_FLOOR/MIN_REPORTABLE_CONFIDENCE — never used to decide an
 * actual match, only to explain why matchGoalApiFixtureToPulseScore found
 * nothing for a real live fixture (see shadowMatchSync's diagnostic log). */
export function debugBestCandidate(fixture: GoalApiFixtureRef, pulseScoreEvents: PulseScoreEvent[]): MatchDiagnostic {
  let best: (FootballMatchCandidate & { nameSim: number }) | null = null;
  let bestEvent: PulseScoreEvent | null = null;
  for (const ev of pulseScoreEvents) {
    if (isVirtualPulseScoreLeague(ev.league)) continue;
    const raw = scoreCandidateRaw(fixture, ev);
    if (!best || raw.confidence > best.confidence) {
      best = raw;
      bestEvent = ev;
    }
  }
  if (!best) {
    return {
      pulseScoreEventId: null,
      pulseScoreHome: null,
      pulseScoreAway: null,
      confidence: null,
      nameSim: null,
      homeNameSimilarity: null,
      awayNameSimilarity: null,
      passedNameFloor: false,
      kickoffDeltaMinutes: null,
    };
  }
  return {
    pulseScoreEventId: best.pulseScoreEventId,
    pulseScoreHome: bestEvent?.home ?? null,
    pulseScoreAway: bestEvent?.away ?? null,
    confidence: best.confidence,
    nameSim: Math.round(best.nameSim * 100) / 100,
    homeNameSimilarity: Math.round(best.signals.homeNameSimilarity * 100) / 100,
    awayNameSimilarity: Math.round(best.signals.awayNameSimilarity * 100) / 100,
    passedNameFloor: best.nameSim >= NAME_FLOOR,
    kickoffDeltaMinutes: best.signals.kickoffDeltaMinutes,
  };
}
