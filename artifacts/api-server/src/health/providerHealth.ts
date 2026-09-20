// Generic provider-health primitives, shared by any REST-polled provider
// that wants a HEALTHY/DEGRADED/OFFLINE read on its own polling loop (see
// providers/pulsescore/health.ts for a consumer).

export type ProviderConnectionStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";

/** How stale the last successful REST call can be before a run of failures
 * escalates from DEGRADED to OFFLINE. */
const REST_OFFLINE_THRESHOLD_MS = 2 * 60_000;

export type RestHealthState = {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
};

/** Pure and testable: given the REST tracker's current state and "now",
 * decide the provider's REST status. HEALTHY needs a successful call with
 * no failures since; a failure right after a long healthy stretch is
 * DEGRADED, not OFFLINE, until either it recovers or the outage persists
 * past REST_OFFLINE_THRESHOLD_MS with no successful call in between. */
export function computeRestStatus(state: RestHealthState, now: number): ProviderConnectionStatus {
  if (state.consecutiveFailures === 0) {
    return state.lastSuccessAt != null ? "HEALTHY" : "OFFLINE";
  }
  const sinceLastSuccessMs = state.lastSuccessAt != null ? now - state.lastSuccessAt : Infinity;
  return sinceLastSuccessMs > REST_OFFLINE_THRESHOLD_MS ? "OFFLINE" : "DEGRADED";
}
