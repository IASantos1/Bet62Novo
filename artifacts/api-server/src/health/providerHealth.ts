// BET62 Fase 0 (hybrid GOAL API + PulseScore architecture, 2026-09-10) —
// formal provider health, replacing the previous ad-hoc pattern of reading
// getGoalApiWsStatus() directly wherever a caller wanted to know if the feed
// looked okay. GOAL API is the only provider wired in today; PulseScore
// fills the same ProviderHealth shape once its client exists — nothing here
// is GOAL-API-specific by design except the module-level tracker below.
import { getGoalApiWsStatus } from "../services/goalapi/websocketClient.js";

export type ProviderConnectionStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";

export type ProviderHealth = {
  status: ProviderConnectionStatus;
  /** Most recent sign of life from EITHER channel (a WS frame or a
   * successful REST call), whichever is more recent. Null if neither has
   * ever succeeded. */
  lastMessageAt: number | null;
  lastSuccessfulRequestAt: number | null;
  websocket: {
    connected: boolean;
    subscribedCount: number;
    maxMatches: number;
    lastFrameAgeMs: number | null;
    lastError: string | null;
  };
  rest: {
    lastSuccessAt: number | null;
    lastFailureAt: number | null;
    lastError: string | null;
    consecutiveFailures: number;
  };
  /** Visibility into GOAL API's push channel (POST /api/webhooks/goal-api)
   * — previously untracked, so a live scenario where webhooks never reach
   * us (misconfigured URL on GOAL API's side, wrong secret, network block)
   * looked identical to "webhooks are fine" from the admin panel: both
   * cases silently fall back to the ~10s REST poll cache with no signal
   * either way. User-reported 2026-09-11: goal/VAR events showing up with
   * a large delay — this field is what actually answers "are webhooks
   * even arriving" instead of guessing. */
  webhook: {
    lastReceivedAt: number | null;
    lastEvent: string | null;
    totalReceived: number;
    lastSignatureFailureAt: number | null;
  };
};

/** How stale the last successful REST call can be before a run of failures
 * escalates from DEGRADED to OFFLINE. REST is the poll loop's source of
 * truth (routes/matches.ts calls it every few seconds for live fixtures),
 * so this is generous relative to that cadence, not to the WS frame rate. */
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

const restState: RestHealthState = {
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  consecutiveFailures: 0,
};

export function recordGoalApiRestSuccess(): void {
  restState.lastSuccessAt = Date.now();
  restState.consecutiveFailures = 0;
}

export function recordGoalApiRestFailure(err: unknown): void {
  restState.lastFailureAt = Date.now();
  restState.lastError = err instanceof Error ? err.message : String(err);
  restState.consecutiveFailures += 1;
}

const webhookState = {
  lastReceivedAt: null as number | null,
  lastEvent: null as string | null,
  totalReceived: 0,
  lastSignatureFailureAt: null as number | null,
};

export function recordGoalApiWebhookReceived(eventType: string): void {
  webhookState.lastReceivedAt = Date.now();
  webhookState.lastEvent = eventType;
  webhookState.totalReceived += 1;
}

export function recordGoalApiWebhookSignatureFailure(): void {
  webhookState.lastSignatureFailureAt = Date.now();
}

export function getGoalApiProviderHealth(): ProviderHealth {
  const now = Date.now();
  const ws = getGoalApiWsStatus();
  const wsLastMessageAt = ws.lastFrameAgeMs != null ? now - ws.lastFrameAgeMs : null;
  const lastMessageAt =
    wsLastMessageAt != null && restState.lastSuccessAt != null
      ? Math.max(wsLastMessageAt, restState.lastSuccessAt)
      : (wsLastMessageAt ?? restState.lastSuccessAt);

  return {
    status: computeRestStatus(restState, now),
    lastMessageAt,
    lastSuccessfulRequestAt: restState.lastSuccessAt,
    websocket: {
      connected: ws.connected,
      subscribedCount: ws.subscribedCount,
      maxMatches: ws.maxMatches,
      lastFrameAgeMs: ws.lastFrameAgeMs,
      lastError: ws.lastError,
    },
    rest: {
      lastSuccessAt: restState.lastSuccessAt,
      lastFailureAt: restState.lastFailureAt,
      lastError: restState.lastError,
      consecutiveFailures: restState.consecutiveFailures,
    },
    webhook: {
      lastReceivedAt: webhookState.lastReceivedAt,
      lastEvent: webhookState.lastEvent,
      totalReceived: webhookState.totalReceived,
      lastSignatureFailureAt: webhookState.lastSignatureFailureAt,
    },
  };
}
