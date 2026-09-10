// PulseScore provider health — REST tracking reuses the exact generic
// primitives GOAL API's health/providerHealth.ts already exports for this
// (computeRestStatus, RestHealthState). The websocket block below is
// PulseScore-shaped rather than reusing ProviderHealth's websocket type
// verbatim: that type's subscribedCount/maxMatches fields model GOAL API's
// per-match subscription cap, which PulseScore's WS doesn't have — it's one
// sport-wide firehose per connection, not per-match subscriptions. Forcing
// those two fields onto a concept that doesn't have them would be a
// fabricated number, not real data, so this uses its own honestly-shaped
// status instead (see providers/pulsescore/websocketClient.ts).
import { CONFIG } from "../../lib/config.js";
import { computeRestStatus, type ProviderConnectionStatus, type RestHealthState } from "../../health/providerHealth.js";
import { getPulseScoreWsStatus } from "./websocketClient.js";

export type PulseScoreHealth = {
  status: ProviderConnectionStatus;
  configured: boolean;
  lastMessageAt: number | null;
  websocket: {
    connected: boolean;
    lastFrameAgeMs: number | null;
    lastError: string | null;
    lastFrameEventCount: number;
  };
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
  const now = Date.now();
  const ws = getPulseScoreWsStatus();
  const wsLastMessageAt = ws.lastFrameAgeMs != null ? now - ws.lastFrameAgeMs : null;
  const lastMessageAt =
    wsLastMessageAt != null && restState.lastSuccessAt != null
      ? Math.max(wsLastMessageAt, restState.lastSuccessAt)
      : (wsLastMessageAt ?? restState.lastSuccessAt);

  return {
    status: computeRestStatus(restState, now),
    configured: Boolean(CONFIG.PULSESCORE_API_KEY),
    lastMessageAt,
    websocket: {
      connected: ws.connected,
      lastFrameAgeMs: ws.lastFrameAgeMs,
      lastError: ws.lastError,
      lastFrameEventCount: ws.lastFrameEventCount,
    },
    rest: { ...restState },
  };
}
