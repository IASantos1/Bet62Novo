// Odds validation layer — the "Motor de Odds" requested alongside the
// Data Collector and Live Match Engine. GOAL API's own docs confirm live
// odds refresh only every ~2 minutes regardless of channel, so this isn't
// a poller (that already happens naturally: buildFootballLiveFromGoalApi's
// getFixtureLiveOdds call is cached for GOAL_API_ODDS_POLL_MS via kvCache,
// see services/goalapi/index.ts) — it's a sanity check applied to whatever
// odds that call returns before they're trusted as the new displayed
// price.
export type ThreeWayOdds = { home: number; draw: number; away: number };

/** True if `candidate` is a safe update to apply over `previous`. A big
 * swing right after a goal or red card is expected and should always be
 * accepted (skipVariationCheck) — the risk this guards against is a swing
 * with no supporting event, which usually means bad/stale data from the
 * provider rather than a real market move. Always accepts when there's no
 * previous value to compare against (first real price for this fixture). */
export function shouldAcceptOddsUpdate(
  previous: ThreeWayOdds | null,
  candidate: ThreeWayOdds,
  maxDeltaPct: number,
  skipVariationCheck: boolean,
): boolean {
  if (!previous || skipVariationCheck) return true;
  const pctChange = (a: number, b: number): number => {
    if (a <= 0) return 0;
    return (Math.abs(b - a) / a) * 100;
  };
  const maxChange = Math.max(
    pctChange(previous.home, candidate.home),
    pctChange(previous.draw, candidate.draw),
    pctChange(previous.away, candidate.away),
  );
  return maxChange <= maxDeltaPct;
}
