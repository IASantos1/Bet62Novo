import WebSocket from "ws";
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { GoalApiFixture } from "../../providers/goalApi/schema.js";
import { upsertGoalApiFootballFixture } from "../../sportsbook/live/liveStateStore.js";

const GOAL_API_WS_URL = "wss://api.goal-api.com/ws";

let socket: WebSocket | null = null;
let starting = false;
let authenticated = false;
let loggedMissingKey = false;
const desiredMatchIds = new Set<string>();
const activeMatchIds = new Set<string>();

export function getGoalApiLiveSyncStatus(): {
  connected: boolean;
  authenticated: boolean;
  starting: boolean;
  desiredSubscriptions: number;
  activeSubscriptions: number;
  desiredMatchIdsSample: string[];
  activeMatchIdsSample: string[];
} {
  return {
    connected: socket?.readyState === WebSocket.OPEN,
    authenticated,
    starting,
    desiredSubscriptions: desiredMatchIds.size,
    activeSubscriptions: activeMatchIds.size,
    desiredMatchIdsSample: [...desiredMatchIds].slice(0, 20),
    activeMatchIdsSample: [...activeMatchIds].slice(0, 20),
  };
}

function normalizeGoalApiClock(
  data: Record<string, unknown>,
): Pick<
  GoalApiFixture,
  "match_status" | "status" | "match_live" | "statistics" | "events" | "score"
> {
  const clock =
    data["clock"] && typeof data["clock"] === "object"
      ? (data["clock"] as Record<string, unknown>)
      : null;
  const homeScore =
    data["match_hometeam_score"] ??
    data["home_score"] ??
    data["homeScore"] ??
    data["score_home"];
  const awayScore =
    data["match_awayteam_score"] ??
    data["away_score"] ??
    data["awayScore"] ??
    data["score_away"];
  const goals = Array.isArray(data["goalscorer"])
    ? (data["goalscorer"] as Array<Record<string, unknown>>)
    : [];
  const cards = Array.isArray(data["cards"])
    ? (data["cards"] as Array<Record<string, unknown>>)
    : [];
  const substitutions = Array.isArray(data["substitutions"])
    ? (data["substitutions"] as Array<Record<string, unknown>>)
    : [];
  return {
    match_status: String(
      data["match_status"] ??
        clock?.["minute"] ??
        clock?.["period"] ??
        "",
    ).trim(),
    status: String(
      data["match_status"] ??
        clock?.["minute"] ??
        clock?.["period"] ??
        "",
    ).trim(),
    match_live: data["match_live"] ?? true,
    score: {
      home: homeScore as string | number | undefined,
      away: awayScore as string | number | undefined,
    },
    statistics:
      data["statistics"] && typeof data["statistics"] === "object"
        ? (data["statistics"] as Record<string, unknown>)
        : undefined,
    events: [...goals, ...cards, ...substitutions],
  };
}

function normalizeGoalApiLiveUpdate(message: Record<string, unknown>): GoalApiFixture | null {
  const data =
    message["data"] && typeof message["data"] === "object"
      ? (message["data"] as Record<string, unknown>)
      : null;
  if (!data) return null;
  const fixtureId = String(
    data["match_id"] ??
      data["fixtureId"] ??
      data["fixture_id"] ??
      "",
  ).trim();
  if (!fixtureId) return null;
  return {
    id: fixtureId,
    league_id:
      (data["league_id"] as string | number | undefined) ??
      (data["competition_id"] as string | number | undefined),
    league_name: String(
      data["league_name"] ?? data["competition_name"] ?? "",
    ).trim() || undefined,
    country_name: String(
      data["country_name"] ?? data["country"] ?? "",
    ).trim() || undefined,
    home_team_id:
      (data["home_team_id"] as string | number | undefined) ??
      (data["match_hometeam_id"] as string | number | undefined),
    away_team_id:
      (data["away_team_id"] as string | number | undefined) ??
      (data["match_awayteam_id"] as string | number | undefined),
    home_team_name: String(
      data["home_team_name"] ?? data["match_hometeam_name"] ?? "",
    ).trim() || undefined,
    away_team_name: String(
      data["away_team_name"] ?? data["match_awayteam_name"] ?? "",
    ).trim() || undefined,
    kickoffUtc: String(
      data["kickoffUtc"] ?? data["kickoff_utc"] ?? data["start_time"] ?? "",
    ).trim() || undefined,
    start_time: String(
      data["start_time"] ?? data["kickoffUtc"] ?? data["kickoff_utc"] ?? "",
    ).trim() || undefined,
    ...normalizeGoalApiClock(data),
  };
}

function sendSocketMessage(payload: Record<string, unknown>): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function flushGoalApiSubscriptions(): void {
  if (!authenticated) return;
  for (const matchId of desiredMatchIds) {
    if (activeMatchIds.has(matchId)) continue;
    sendSocketMessage({
      type: "subscribe",
      resource: "match",
      matchId,
    });
  }
  for (const matchId of activeMatchIds) {
    if (desiredMatchIds.has(matchId)) continue;
    sendSocketMessage({
      type: "unsubscribe",
      resource: "match",
      matchId,
    });
  }
}

function handleGoalApiMessage(raw: WebSocket.RawData): void {
  const text =
    typeof raw === "string"
      ? raw
      : Buffer.isBuffer(raw)
        ? raw.toString("utf8")
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString("utf8")
          : Buffer.from(raw).toString("utf8");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err, text: text.slice(0, 300) }, "[goal-api] ws invalid json");
    return;
  }
  const type = String(parsed["type"] ?? "").trim();
  if (type === "auth_success") {
    authenticated = true;
    flushGoalApiSubscriptions();
    logger.info("[goal-api] live websocket authenticated");
    return;
  }
  if (type === "match_update") {
    const fixture = normalizeGoalApiLiveUpdate(parsed);
    if (fixture) upsertGoalApiFootballFixture(fixture, "websocket");
    return;
  }
  if (type === "subscribe_response" || type === "unsubscribe_response") {
    const success = parsed["success"] !== false;
    const data =
      parsed["data"] && typeof parsed["data"] === "object"
        ? (parsed["data"] as Record<string, unknown>)
        : null;
    const matchId = String(
      parsed["matchId"] ??
        data?.["matchId"] ??
        "",
    ).trim();
    if (success && matchId) {
      if (type === "subscribe_response") activeMatchIds.add(matchId);
      else activeMatchIds.delete(matchId);
    }
    return;
  }
  if (type === "error") {
    logger.warn({ payload: parsed }, "[goal-api] ws error");
  }
}

export function syncGoalApiLiveSubscriptions(
  fixtureIds: Array<string | number>,
): void {
  desiredMatchIds.clear();
  for (const fixtureId of fixtureIds) {
    const id = String(fixtureId ?? "").trim();
    if (!id) continue;
    desiredMatchIds.add(id);
  }
  flushGoalApiSubscriptions();
}

export async function startGoalApiLiveSync(): Promise<void> {
  if (!CONFIG.GOAL_API_KEY.trim()) {
    if (!loggedMissingKey) {
      logger.warn(
        "[goal-api] GOAL_API_KEY not set — live websocket stays inert until configured",
      );
      loggedMissingKey = true;
    }
    return;
  }
  if (socket || starting) return;
  starting = true;
  try {
    const ws = new WebSocket(GOAL_API_WS_URL, {
      headers: {
        Authorization: `Bearer ${CONFIG.GOAL_API_KEY}`,
      },
    });
    socket = ws;
    ws.on("open", () => {
      authenticated = false;
      ws.send(JSON.stringify({
        type: "auth",
        apiKey: CONFIG.GOAL_API_KEY,
      }));
    });
    ws.on("message", (raw) => {
      handleGoalApiMessage(raw);
    });
    ws.on("close", (code, reason) => {
      logger.warn(
        { code, reason: reason.toString() },
        "[goal-api] live websocket closed — will retry on next tick",
      );
      socket = null;
      authenticated = false;
      activeMatchIds.clear();
    });
    ws.on("error", (err) => {
      logger.warn({ err }, "[goal-api] live websocket error");
    });
    logger.info("[goal-api] live websocket starting");
  } catch (err) {
    logger.error({ err }, "[goal-api] live websocket failed to start");
  } finally {
    starting = false;
  }
}
