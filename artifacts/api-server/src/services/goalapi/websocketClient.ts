// GOAL API Data Collector — outbound WebSocket client with reconnect-with-
// backoff, ported from the same pattern this codebase already validated in
// production for PulseScore/PropLine (both since deleted along with those
// providers; see git history for services/pulsescore/footballWs.ts and
// services/propline/websocket.ts — this mirrors their connect/backoff/
// non-retryable-close-code structure).
//
// Deliberately does NOT trust match_update payloads as the state of
// record: the exact field names per event aren't confirmed against a real
// message (only one example shape is documented), so every update just
// tells the caller "something changed for this fixture" via a callback —
// the caller (api/index.ts, wiring this to routes/matches.ts's
// applyGoalApiWebhookEvent) re-derives real state from the same REST path
// the webhook receiver and poll loop already use. One source of truth for
// state, three ways to get woken up early.
//
// Capacity-gated by CONFIG.GOAL_API_MAX_WS_MATCHES, which mirrors the
// account's plan tier (FREE=0, BASIC=5, PRO=20, ENTERPRISE=1000 concurrent
// match subscriptions per the provider's docs). startGoalApiWebSocket is a
// no-op while the cap is 0 — there's nothing a connection with zero
// subscription capacity could ever do — so this stays entirely inert on
// the FREE plan and activates automatically the moment the cap is raised,
// with no code change.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { goalApi } from "./index.js";
// Node's global `WebSocket` client only became stable/enabled by default in
// Node 22 (experimental and off-by-default in 20/21). Production pins Node
// 20.18.0 (.nvmrc) — confirmed real 2026-09-10: PulseScore's WS client
// (same bare-global pattern this file used) threw "WebSocket is not
// defined" the first time it tried to connect there. This client is
// currently inert (CONFIG.GOAL_API_MAX_WS_MATCHES defaults to 0) so it
// hadn't been caught yet, but would hit the identical error the moment
// that cap is raised above 0. Import the class explicitly from the `ws`
// package (already a dependency, used the same way for the server side in
// routes/matches.ts) instead of relying on a runtime global that may not
// exist.
import { WebSocket as WsClient } from "ws";

let ws: WsClient | null = null;
let connected = false;
let retryDelayMs = 2_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;
let lastFrameAt = 0;
let lastError: string | null = null;

const subscribedIds = new Set<string>();
let onUpdate: ((fixtureId: string) => void) | null = null;

type GoalApiWsMessage =
  | { type: "auth_success"; [k: string]: unknown }
  | { type: "subscribe_response" | "unsubscribe_response"; success: boolean; [k: string]: unknown }
  | { type: "match_update"; data: { match_id?: string; matchId?: string; [k: string]: unknown } }
  | { type: "error"; error: { code: string; message: string; category: string } }
  | { type: "pong" };

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, 60_000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

async function connect(): Promise<void> {
  if (!CONFIG.GOAL_API_KEY || CONFIG.GOAL_API_MAX_WS_MATCHES <= 0 || connected) return;

  let token: string;
  try {
    const tokenResp = await goalApi.requestWsToken();
    token = tokenResp.token;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "[goal-api-ws] token request failed — will retry");
    scheduleReconnect();
    return;
  }

  let socket: WsClient;
  try {
    socket = new WsClient(`${CONFIG.GOAL_API_WS_URL}?wsToken=${encodeURIComponent(token)}`);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.on("open", () => {
    socket.send(JSON.stringify({ type: "auth", token }));
  });

  socket.on("message", (data) => {
    lastFrameAt = Date.now();
    let msg: GoalApiWsMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // non-JSON keepalive — ignore
    }
    if (msg.type === "auth_success") {
      connected = true;
      retryDelayMs = 2_000; // reset backoff only once auth actually succeeds
      logger.info("[goal-api-ws] connected and authenticated");
      // Re-subscribe to whatever the caller wanted before this (re)connect.
      for (const id of subscribedIds) {
        socket.send(JSON.stringify({ type: "subscribe", resource: "match", matchId: id }));
      }
      return;
    }
    if (msg.type === "error") {
      lastError = `${msg.error.code}: ${msg.error.message}`;
      logger.warn({ error: msg.error }, "[goal-api-ws] server error message");
      if (msg.error.category === "authentication") {
        connected = false;
        try {
          socket.close();
        } catch {
          /* already closing */
        }
      }
      return;
    }
    if (msg.type === "match_update") {
      const fixtureId = msg.data.match_id ?? msg.data.matchId;
      if (typeof fixtureId === "string" && onUpdate) onUpdate(fixtureId);
    }
  });

  socket.on("close", (code) => {
    connected = false;
    ws = null;
    // 4001/4003/4004/4010/4029 followed the same non-retryable convention
    // in every WS client this codebase has built so far (bad key, plan too
    // low, invalid resource, expired subscription, connection cap) — GOAL
    // API's own docs don't enumerate close codes, so this is kept as a
    // defensive no-op safety net rather than a confirmed mapping: if it
    // never matches, reconnect-with-backoff still runs exactly as if this
    // check weren't here.
    const nonRetryable = [4001, 4003, 4004, 4010, 4029].includes(code);
    if (nonRetryable) {
      lastError = `closed with non-retryable code ${code}`;
      logger.error({ code }, "[goal-api-ws] closed (non-retryable) — not reconnecting");
      return;
    }
    logger.warn({ code, retryMs: retryDelayMs }, "[goal-api-ws] closed — reconnecting");
    scheduleReconnect();
  });

  socket.on("error", () => {
    connected = false;
    ws = null;
  });
}

/** Call once at server startup, gated on CONFIG.GOAL_API_KEY being set. */
export function startGoalApiWebSocket(onUpdateCallback: (fixtureId: string) => void): void {
  onUpdate = onUpdateCallback;
  if (!CONFIG.GOAL_API_KEY || CONFIG.GOAL_API_MAX_WS_MATCHES <= 0) return;
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

/** Reconciles the WebSocket's subscriptions with the fixture ids the
 * caller currently wants live-updated, respecting
 * CONFIG.GOAL_API_MAX_WS_MATCHES — additions beyond the cap are silently
 * skipped (no error, no crash) since the REST poll loop already covers
 * every live fixture regardless of WS coverage; the socket is purely a
 * latency optimization for whichever matches fit under the cap. */
export function syncGoalApiSubscriptions(desiredIds: string[]): void {
  if (!connected || !ws) return;
  const desired = new Set(desiredIds);
  for (const id of subscribedIds) {
    if (!desired.has(id)) {
      ws.send(JSON.stringify({ type: "unsubscribe", resource: "match", matchId: id }));
      subscribedIds.delete(id);
    }
  }
  for (const id of desired) {
    if (subscribedIds.size >= CONFIG.GOAL_API_MAX_WS_MATCHES) break;
    if (subscribedIds.has(id)) continue;
    ws.send(JSON.stringify({ type: "subscribe", resource: "match", matchId: id }));
    subscribedIds.add(id);
  }
}

export function getGoalApiWsStatus(): {
  connected: boolean;
  subscribedCount: number;
  maxMatches: number;
  lastFrameAgeMs: number | null;
  lastError: string | null;
} {
  return {
    connected,
    subscribedCount: subscribedIds.size,
    maxMatches: CONFIG.GOAL_API_MAX_WS_MATCHES,
    lastFrameAgeMs: lastFrameAt ? Date.now() - lastFrameAt : null,
    lastError,
  };
}
