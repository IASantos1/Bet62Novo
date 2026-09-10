// PulseScore provider health — same generic REST-tracking primitives as
// GOAL API's own health/providerHealth.ts (computeRestStatus,
// RestHealthState — deliberately provider-agnostic there for exactly this
// reuse). No websocket block here: PulseScore is REST-only, confirmed
// across all 5 endpoints used so far.
import { CONFIG } from "../../lib/config.js";
import { computeRestStatus, type ProviderConnectionStatus, type RestHealthState } from "../../health/providerHealth.js";

export type PulseScoreHealth = {
  status: ProviderConnectionStatus;
  configured: boolean;
  rest: RestHealthState;
};

const restState: RestHealthState = {
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  consecutiveFailures: 0,
};

export function recordPulseScoreRestSuccess(): void {
  restState.lastSuccessAt = Date.now();
  restState.consecutiveFailures = 0;
}

export function recordPulseScoreRestFailure(err: unknown): void {
  restState.lastFailureAt = Date.now();
  restState.lastError = err instanceof Error ? err.message : String(err);
  restState.consecutiveFailures += 1;
}

export function getPulseScoreHealth(): PulseScoreHealth {
  return {
    status: computeRestStatus(restState, Date.now()),
    configured: Boolean(CONFIG.PULSESCORE_API_KEY),
    rest: { ...restState },
  };
}
