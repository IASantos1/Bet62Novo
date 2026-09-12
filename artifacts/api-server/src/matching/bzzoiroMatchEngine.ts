// Pairs a GOAL API football fixture against a sports.bzzoiro.com live
// event, producing a confidence score — same shape/approach as
// footballMatchEngine.ts's PulseScore matcher, but kept as its own small
// module rather than generalizing that one: bzzoiro's candidate pool is
// always LIVE-ONLY and small (this app only ever calls it with fixtures
// that are already live on the GOAL API side too), so the name-similarity
// floor alone already carries almost all the discriminating power — the
// real live pool is a handful of matches at a time (confirmed 2026-09-11:
// GET /events/live/ returned 4 rows globally), so a league-name signal
// isn't needed for discrimination even though league_id/league_name are
// available on BzzoiroEvent.
import { nameSimilarity } from "./teamNameMatch.js";
import type { GoalApiFixtureRef } from "./footballMatchEngine.js";
import type { BzzoiroEvent } from "../providers/bzzoiro/types.js";

export type BzzoiroMatchCandidate = {
  bzzoiroEventId: number;
  confidence: number;
  signals: {
    homeNameSimilarity: number;
    awayNameSimilarity: number;
    kickoffDeltaMinutes: number | null;
  };
};

const NAME_FLOOR = 0.4;
const MIN_REPORTABLE_CONFIDENCE = 60;
const KICKOFF_FULL_CREDIT_MINUTES = 5;
const KICKOFF_ZERO_CREDIT_MINUTES = 45;

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

function scoreCandidate(fixture: GoalApiFixtureRef, ev: BzzoiroEvent): BzzoiroMatchCandidate | null {
  const homeNameSimilarity = nameSimilarity(fixture.homeTeamName, ev.home_team);
  const awayNameSimilarity = nameSimilarity(fixture.awayTeamName, ev.away_team);
  const nameSim = Math.min(homeNameSimilarity, awayNameSimilarity);
  if (nameSim < NAME_FLOOR) return null;

  const { score: kickoffScore, deltaMinutes: kickoffDeltaMinutes } = kickoffProximityScore(
    fixture.kickoffUtc,
    ev.event_date,
  );
  const kickoffComponent = kickoffScore ?? 0.5;
  const confidence = Math.round(100 * (nameSim * 0.85 + kickoffComponent * 0.15));

  return {
    bzzoiroEventId: ev.id,
    confidence,
    signals: { homeNameSimilarity, awayNameSimilarity, kickoffDeltaMinutes },
  };
}

/** Returns the best bzzoiro candidate for a live GOAL API fixture, or null
 * if nothing clears MIN_REPORTABLE_CONFIDENCE. Callers are expected to
 * only pass already-live GOAL API fixtures and bzzoiro's own live-events
 * list — both small pools by construction. */
export function matchGoalApiFixtureToBzzoiro(
  fixture: GoalApiFixtureRef,
  bzzoiroEvents: BzzoiroEvent[],
): BzzoiroMatchCandidate | null {
  let best: BzzoiroMatchCandidate | null = null;
  for (const ev of bzzoiroEvents) {
    // "inprogress" is bzzoiro's real in-progress status string (confirmed
    // 2026-09-11 via a real /events/live/ response) — NOT "live", which
    // never actually appears in that field.
    if (ev.status !== "inprogress") continue;
    if (!ev.live_websocket) continue; // no point matching a fixture we can never subscribe to
    const candidate = scoreCandidate(fixture, ev);
    if (!candidate) continue;
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }
  if (!best || best.confidence < MIN_REPORTABLE_CONFIDENCE) return null;
  return best;
}

export type BzzoiroMatchDiagnostic = {
  bzzoiroEventId: number | null;
  bzzoiroHome: string | null;
  bzzoiroAway: string | null;
  bzzoiroStatus: string | null;
  bzzoiroLiveWebsocket: boolean | null;
  confidence: number | null;
  nameSim: number | null;
  homeNameSimilarity: number | null;
  awayNameSimilarity: number | null;
  passedNameFloor: boolean;
  kickoffDeltaMinutes: number | null;
};

/** Debug-only: the single best-scoring candidate regardless of status/
 * live_websocket/NAME_FLOOR/MIN_REPORTABLE_CONFIDENCE gates — added
 * 2026-09-11 to diagnose a real live near-miss (a confirmed-live GOAL API
 * fixture with a confirmed-live same-match bzzoiro event that still wasn't
 * matching), mirroring footballMatchEngine.ts's identically-purposed
 * debugBestCandidate for PulseScore. Never used to decide an actual match. */
export function debugBestCandidateBzzoiro(
  fixture: GoalApiFixtureRef,
  bzzoiroEvents: BzzoiroEvent[],
): BzzoiroMatchDiagnostic {
  let best: (BzzoiroMatchCandidate & { nameSim: number }) | null = null;
  let bestEvent: BzzoiroEvent | null = null;
  for (const ev of bzzoiroEvents) {
    const homeNameSimilarity = nameSimilarity(fixture.homeTeamName, ev.home_team);
    const awayNameSimilarity = nameSimilarity(fixture.awayTeamName, ev.away_team);
    const nameSim = Math.min(homeNameSimilarity, awayNameSimilarity);
    const { score: kickoffScore, deltaMinutes: kickoffDeltaMinutes } = kickoffProximityScore(
      fixture.kickoffUtc,
      ev.event_date,
    );
    const kickoffComponent = kickoffScore ?? 0.5;
    const confidence = Math.round(100 * (nameSim * 0.85 + kickoffComponent * 0.15));
    const candidate = {
      bzzoiroEventId: ev.id,
      confidence,
      nameSim,
      signals: { homeNameSimilarity, awayNameSimilarity, kickoffDeltaMinutes },
    };
    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
      bestEvent = ev;
    }
  }
  if (!best || !bestEvent) {
    return {
      bzzoiroEventId: null,
      bzzoiroHome: null,
      bzzoiroAway: null,
      bzzoiroStatus: null,
      bzzoiroLiveWebsocket: null,
      confidence: null,
      nameSim: null,
      homeNameSimilarity: null,
      awayNameSimilarity: null,
      passedNameFloor: false,
      kickoffDeltaMinutes: null,
    };
  }
  return {
    bzzoiroEventId: best.bzzoiroEventId,
    bzzoiroHome: bestEvent.home_team,
    bzzoiroAway: bestEvent.away_team,
    bzzoiroStatus: bestEvent.status,
    bzzoiroLiveWebsocket: bestEvent.live_websocket,
    confidence: best.confidence,
    nameSim: Math.round(best.nameSim * 100) / 100,
    homeNameSimilarity: Math.round(best.signals.homeNameSimilarity * 100) / 100,
    awayNameSimilarity: Math.round(best.signals.awayNameSimilarity * 100) / 100,
    passedNameFloor: best.nameSim >= NAME_FLOOR,
    kickoffDeltaMinutes: best.signals.kickoffDeltaMinutes,
  };
}
