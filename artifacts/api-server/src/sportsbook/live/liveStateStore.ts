import type {
  GoalApiFixture,
  GoalApiWebhookPayload,
} from "../../providers/goalApi/schema.js";

export type GoalApiFootballState = {
  fixtureId: string;
  updatedAt: number;
  payload: GoalApiFixture | GoalApiWebhookPayload;
};

const footballStateByFixtureId = new Map<string, GoalApiFootballState>();
const recentGoalApiWebhooks: Array<{
  receivedAt: number;
  eventType: string;
  fixtureId?: string;
}> = [];

function pushRecentWebhook(
  payload: GoalApiWebhookPayload,
  fixtureId?: string,
): void {
  recentGoalApiWebhooks.push({
    receivedAt: Date.now(),
    eventType: String(payload.type ?? payload.event ?? "unknown"),
    fixtureId,
  });
  if (recentGoalApiWebhooks.length > 100) {
    recentGoalApiWebhooks.splice(0, recentGoalApiWebhooks.length - 100);
  }
}

export function upsertGoalApiFootballFixture(fixture: GoalApiFixture): void {
  const fixtureId = String(fixture.id ?? "");
  if (!fixtureId) return;
  footballStateByFixtureId.set(fixtureId, {
    fixtureId,
    updatedAt: Date.now(),
    payload: fixture,
  });
}

export function recordGoalApiWebhook(payload: GoalApiWebhookPayload): void {
  const fixture =
    payload.fixture && typeof payload.fixture === "object"
      ? payload.fixture
      : null;
  const fixtureId = String(payload.fixtureId ?? fixture?.id ?? "");
  if (fixtureId) {
    footballStateByFixtureId.set(fixtureId, {
      fixtureId,
      updatedAt: Date.now(),
      payload: fixture ?? payload,
    });
  }
  pushRecentWebhook(payload, fixtureId || undefined);
}

export function getGoalApiFootballState(
  fixtureId: string | number,
): GoalApiFootballState | null {
  return footballStateByFixtureId.get(String(fixtureId)) ?? null;
}

export function getRecentGoalApiWebhooks(): Array<{
  receivedAt: number;
  eventType: string;
  fixtureId?: string;
}> {
  return [...recentGoalApiWebhooks];
}
