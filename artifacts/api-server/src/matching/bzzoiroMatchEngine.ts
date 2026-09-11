// Pairs a GOAL API football fixture against a sports.bzzoiro.com live
// event, producing a confidence score — same shape/approach as
// footballMatchEngine.ts's PulseScore matcher, but kept as its own small
// module rather than generalizing that one: bzzoiro's candidate pool is
// always LIVE-ONLY and small (this app only ever calls it with fixtures
// that are already live on the GOAL API side too), so the name-similarity
// floor alone already carries almost all the discriminating power — no
// league-name signal is used here (bzzoiro's league field isn't fetched by
// this integration at all, see client.ts).
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
    if (ev.status !== "live") continue;
    const candidate = scoreCandidate(fixture, ev);
    if (!candidate) continue;
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }
  if (!best || best.confidence < MIN_REPORTABLE_CONFIDENCE) return null;
  return best;
}
