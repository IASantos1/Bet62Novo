// sports.bzzoiro.com live football WebSocket — confirmed real 2026-09-11:
// the user connected with their own token and subscribed to a real live
// match (Rodez AF vs Grenoble Foot 38, event_id 580519), receiving real
// `subscribed`/`event`/`livedata`/`action`/`odds` frames matching the docs
// exactly. Auth is a `?token=` query param (confirmed working — REST uses
// an `Authorization: Token` header instead, a different scheme, same
// inconsistency this app has already seen between GOAL API/PulseScore/
// api-tennis each using their own auth style).
//
// One persistent connection multiplexes every subscribed match (the docs'
// per-channel subscribe/unsubscribe model), rather than one socket per
// match — mirrors this file's own REST client design (minimal, single
// purpose: feed real ball position into LiveMatchState._ballPosition,
// nothing else). Only `livedata` frames are consumed (real coordinates +
// situation, available on every subscribed match regardless of the
// `websocket_plus`/"full" flag) — `action` frames (per-play, ~100ms,
// "full" tier only) are deliberately ignored for now: the real capture
// showed near-duplicate `action` frames firing 3-4x for the same play,
// and `livedata` already carries the same coordinates in a cleaner,
// de-duplicated shape designed for exactly this "where's the ball right
// now" use case.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
// Node's global `WebSocket` only stabilized in Node 22; production pins an
// older Node (see providers/pulsescore/websocketClient.ts's own note on
// this exact gap) — import the `ws` package's class explicitly instead of
// relying on a runtime global that may not exist.
import { WebSocket as WsClient } from "ws";
import type { BzzoiroWsFrame, BzzoiroLiveDataFrame } from "./types.js";

let ws: WsClient | null = null;
let connected = false;
let retryDelayMs = 2_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;
let lastFrameAt = 0;
let lastError: string | null = null;
const subscribedEventIds = new Set<number>();

let onLiveData: ((frame: BzzoiroLiveDataFrame) => void) | null = null;

// Real bug fixed 2026-09-11 (user-reported: _ballPosition never populates
// for any subscribed live match). Confirmed via /api/admin/bzzoiro-status:
// `connected: true` with `lastFrameAgeMs` past 5 minutes across 5
// concurrently-subscribed live matches, despite the docs saying `livedata`
// lands roughly every 5s per match — a classic zombie WebSocket: the TCP
// connection died silently (network blip, idle proxy timeout, ...) but
// neither "close" nor "error" ever fired, so `connected` stayed true and
// scheduleReconnect() never ran. A standard ping/pong heartbeat is the
// only way to detect this class of failure — the `ws` library auto-replies
// to a server-sent ping, but does nothing to notice the *absence* of any
// traffic on its own.
const HEARTBEAT_INTERVAL_MS = 30_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let awaitingPong = false;

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat(socket: WsClient): void {
  stopHeartbeat();
  awaitingPong = false;
  heartbeatTimer = setInterval(() => {
    if (awaitingPong) {
      logger.warn("[bzzoiro-ws] no response to heartbeat ping — terminating stale connection");
      socket.terminate(); // forces "close", which schedules a real reconnect
      return;
    }
    awaitingPong = true;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);
}

function sendSubscribeFrames(): void {
  if (!ws || !connected) return;
  for (const eventId of subscribedEventIds) {
    ws.send(JSON.stringify({ type: "subscribe", event_id: eventId }));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, 60_000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  if (!CONFIG.BZZOIRO_API_KEY || connected) return;

  let socket: WsClient;
  try {
    const url = `${CONFIG.BZZOIRO_WS_URL}?token=${encodeURIComponent(CONFIG.BZZOIRO_API_KEY)}`;
    socket = new WsClient(url);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.on("open", () => {
    connected = true;
    retryDelayMs = 2_000;
    logger.info("[bzzoiro-ws] connected");
    // Re-subscribe to every match this process cares about — needed after
    // any reconnect, since the server has no memory of a dropped socket's
    // prior subscriptions.
    sendSubscribeFrames();
    startHeartbeat(socket);
  });

  socket.on("pong", () => {
    awaitingPong = false;
  });

  socket.on("message", (data) => {
    lastFrameAt = Date.now();
    awaitingPong = false; // any real traffic is proof of life, not just a pong
    let msg: BzzoiroWsFrame;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // non-JSON keepalive — ignore
    }
    if (msg.type === "livedata" && onLiveData) {
      onLiveData(msg as BzzoiroLiveDataFrame);
    }
    // subscribed/unsubscribed/event/action/odds/ingest_debug/error frames
    // are all real (confirmed via the user's capture) but unused here —
    // this integration only ever needs real ball position.
  });

  socket.on("close", (code) => {
    connected = false;
    ws = null;
    stopHeartbeat();
    logger.warn({ code, retryMs: retryDelayMs }, "[bzzoiro-ws] closed — reconnecting");
    scheduleReconnect();
  });

  socket.on("error", (err) => {
    connected = false;
    ws = null;
    stopHeartbeat();
    lastError = err instanceof Error ? err.message : String(err);
    // "close" always follows "error" for WebSocket — reconnect scheduled there.
  });
}

/** Call once at server startup, gated on CONFIG.BZZOIRO_API_KEY being set.
 * onLiveDataCallback receives every real `livedata` frame for any
 * currently-subscribed match. */
export function startBzzoiroWebSocket(onLiveDataCallback?: (frame: BzzoiroLiveDataFrame) => void): void {
  onLiveData = onLiveDataCallback ?? null;
  if (!CONFIG.BZZOIRO_API_KEY) return;
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

/** Idempotent — safe to call every matching cycle for a fixture already
 * subscribed. */
export function subscribeBzzoiroEvent(eventId: number): void {
  if (subscribedEventIds.has(eventId)) return;
  subscribedEventIds.add(eventId);
  if (ws && connected) {
    ws.send(JSON.stringify({ type: "subscribe", event_id: eventId }));
  }
}

export function unsubscribeBzzoiroEvent(eventId: number): void {
  if (!subscribedEventIds.has(eventId)) return;
  subscribedEventIds.delete(eventId);
  if (ws && connected) {
    ws.send(JSON.stringify({ type: "unsubscribe", event_id: eventId }));
  }
}

export function getBzzoiroWsStatus(): {
  connected: boolean;
  lastFrameAgeMs: number | null;
  lastError: string | null;
  subscribedCount: number;
} {
  return {
    connected,
    lastFrameAgeMs: lastFrameAt ? Date.now() - lastFrameAt : null,
    lastError,
    subscribedCount: subscribedEventIds.size,
  };
}
