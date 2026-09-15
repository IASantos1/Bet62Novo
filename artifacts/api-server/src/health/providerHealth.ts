export type ProviderConnectionStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";

export type ProviderHealth = {
  status: ProviderConnectionStatus;
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
  webhook: {
    lastReceivedAt: number | null;
    lastEvent: string | null;
    totalReceived: number;
    lastSignatureFailureAt: number | null;
  };
};

export function getGoalApiProviderHealth(): ProviderHealth {
  return {
    status: "OFFLINE",
    lastMessageAt: null,
    lastSuccessfulRequestAt: null,
    websocket: {
      connected: false,
      subscribedCount: 0,
      maxMatches: 0,
      lastFrameAgeMs: null,
      lastError: "DESCONTINUADO — GOAL API removido; use BZZOIRO",
    },
    rest: {
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: "DESCONTINUADO — GOAL API removido; use BZZOIRO",
      consecutiveFailures: 0,
    },
    webhook: {
      lastReceivedAt: null,
      lastEvent: null,
      totalReceived: 0,
      lastSignatureFailureAt: null,
    },
  };
}

export function recordGoalApiRestSuccess(): void {}
export function recordGoalApiRestFailure(_err: unknown): void {}
export function recordGoalApiWebhookReceived(_eventType: string): void {}
export function recordGoalApiWebhookSignatureFailure(): void {}
