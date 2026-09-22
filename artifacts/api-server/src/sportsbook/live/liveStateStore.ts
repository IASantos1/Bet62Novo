import type {
  GoalApiFixture,
  GoalApiWebhookPayload,
} from "../../providers/goalApi/schema.js";

export type GoalApiFootballState = {
  fixtureId: string;
  updatedAt: number;
  source: "rest" | "webhook" | "websocket";
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

function mergeGoalApiPayload(
  current: GoalApiFixture | GoalApiWebhookPayload | undefined,
  incoming: GoalApiFixture | GoalApiWebhookPayload,
  source: GoalApiFootballState["source"],
): GoalApiFixture | GoalApiWebhookPayload {
  if (!current || typeof current !== "object") return incoming;
  const currentRecord = current as Record<string, unknown>;
  const incomingRecord = incoming as Record<string, unknown>;
  const mergedBase =
    source === "rest"
      ? { ...incomingRecord, ...currentRecord }
      : { ...currentRecord, ...incomingRecord };
  const currentScore =
    currentRecord["score"] && typeof currentRecord["score"] === "object"
      ? (currentRecord["score"] as Record<string, unknown>)
      : null;
  const incomingScore =
    incomingRecord["score"] && typeof incomingRecord["score"] === "object"
      ? (incomingRecord["score"] as Record<string, unknown>)
      : null;
  if (currentScore || incomingScore) {
    mergedBase["score"] =
      source === "rest"
        ? { ...(incomingScore ?? {}), ...(currentScore ?? {}) }
        : { ...(currentScore ?? {}), ...(incomingScore ?? {}) };
  }
  return mergedBase as GoalApiFixture | GoalApiWebhookPayload;
}

export function upsertGoalApiFootballFixture(
  fixture: GoalApiFixture,
  source: GoalApiFootballState["source"] = "rest",
): void {
  const fixtureId = String(fixture.id ?? "");
  if (!fixtureId) return;
  const current = footballStateByFixtureId.get(fixtureId);
  footballStateByFixtureId.set(fixtureId, {
    fixtureId,
    updatedAt: Date.now(),
    source,
    payload: mergeGoalApiPayload(current?.payload, fixture, source),
  });
}

export function recordGoalApiWebhook(payload: GoalApiWebhookPayload): void {
  const fixture =
    payload.fixture && typeof payload.fixture === "object"
      ? payload.fixture
      : null;
  const fixtureId = String(payload.fixtureId ?? fixture?.id ?? "");
  if (fixtureId) {
    const current = footballStateByFixtureId.get(fixtureId);
    footballStateByFixtureId.set(fixtureId, {
      fixtureId,
      updatedAt: Date.now(),
      source: "webhook",
      payload: mergeGoalApiPayload(current?.payload, fixture ?? payload, "webhook"),
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

export function listGoalApiFootballStates(): GoalApiFootballState[] {
  return [...footballStateByFixtureId.values()];
}
