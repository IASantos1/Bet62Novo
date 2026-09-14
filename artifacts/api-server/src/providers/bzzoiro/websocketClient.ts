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
import type { BzzoiroWsFrame, BzzoiroLiveDataFrame, BzzoiroOddsFrame, BzzoiroErrorFrame } from "./types.js";

let ws: WsClient | null = null;
let connected = false;
let retryDelayMs = 2_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;
let lastFrameAt = 0;
let lastError: string | null = null;
const subscribedEventIds = new Set<number>();

// Diagnostic counters added 2026-09-11 alongside the heartbeat fix — a
// healthy ping/pong cycle only proves the TCP connection is alive, it says
// nothing about whether bzzoiro is actually acknowledging our subscribe
// requests or sending real data for them. `lastFrameAt` used to be the only
// signal for "is anything happening", but a `pong` control frame does NOT
// touch it (only real `message` data frames do — see the "message" handler
// below), so a perfectly healthy heartbeat can coexist with a `lastFrameAt`
// that never advances if bzzoiro never sends a single data frame back.
// These let /api/admin/bzzoiro-status tell "connection is dead" apart from
// "connection is fine, bzzoiro just isn't sending anything for this event".
let pingsSent = 0;
let pongsReceived = 0;
const subscribedAckAt = new Map<number, number>();

let onLiveData: ((frame: BzzoiroLiveDataFrame) => void) | null = null;
// Real odds handler (2026-09-14) — bzzoiro odds are now the primary price
// source for football; see ballMatchSync.ts's registerBzzoiroOddsHandler.
let onOdds: ((frame: BzzoiroOddsFrame) => void) | null = null;

// Investigation-only (added 2026-09-13, see /bzzoiro-capabilities-probe):
// the "odds"/"action"/"event" frame types are real (confirmed in this
// file's own header) but were never captured anywhere — this deliberately
// does NOT change any existing behavior (still never read for real
// decisions), it just remembers the single latest raw frame of each type
// per event_id so a probe endpoint can show what bzzoiro is actually
// sending, ahead of the user's request to evaluate bzzoiro as a full
// replacement for GOAL API/PulseScore (odds + stats + xG + ball position).
const lastFrameByType = new Map<string, Map<number, BzzoiroWsFrame>>();
// Added 2026-09-14 alongside the odds pricing rollout: with "with real
// odds" stuck at a single match for many minutes despite lastFrameAgeMs
// staying low (frames ARE arriving), the open question is whether "odds"
// frames are simply rare among real traffic (livedata/action/ingest_debug
// dominate, entirely plausible if only a handful of the ~220 subscribed
// matches carry real bookmaker coverage right now) or whether something in
// the odds pipeline itself is silently dropping frames that do arrive.
// Counting every frame by type, regardless of event_id, answers that
// without guessing.
const frameTypeCounts = new Map<string, number>();
function captureFrame(frame: BzzoiroWsFrame): void {
  frameTypeCounts.set(frame.type, (frameTypeCounts.get(frame.type) ?? 0) + 1);
  if (!("event_id" in frame) || typeof (frame as { event_id?: unknown }).event_id !== "number") return;
  const eventId = (frame as { event_id: number }).event_id;
  if (!lastFrameByType.has(frame.type)) lastFrameByType.set(frame.type, new Map());
  lastFrameByType.get(frame.type)!.set(eventId, frame);
}

/** Latest raw frame of a given type ("odds"/"action"/"event"/...) for one
 * event_id, or undefined if none has arrived yet. Investigation-only. */
export function getBzzoiroLastFrame(frameType: string, eventId: number): BzzoiroWsFrame | undefined {
  return lastFrameByType.get(frameType)?.get(eventId);
}

/** Total frames seen by type since this process started, e.g.
 * { livedata: 4021, action: 812, odds: 3, ingest_debug: 55 }.
 * Investigation-only — see frameTypeCounts's header. */
export function getBzzoiroFrameTypeCounts(): Record<string, number> {
  return Object.fromEntries(frameTypeCounts);
}

// Added 2026-09-14: a production check right after a restart showed
// frameTypeCounts of { subscribed: 30, error: 642 } across 224
// subscriptions — i.e. almost nothing but rejected subscribes, zero
// livedata/odds/action frames at all. The existing error handler already
// logs every error frame, but only to Railway logs — nothing here ever
// remembered *what* the errors said, so there was no way to see the actual
// code/message (bad token? unknown event_id? plan/tier limit? subscribe
// rate limit from firing all 224 "subscribe" sends in one tight loop?)
// without live log access. Track counts per distinct code+message and the
// single latest raw frame so a probe can show it directly.
const errorFrameCounts = new Map<string, number>();
let lastErrorFrame: BzzoiroErrorFrame | null = null;

function recordErrorFrame(frame: BzzoiroErrorFrame): void {
  lastErrorFrame = frame;
  const key = `${frame.code ?? "?"}:${frame.message ?? "?"}`;
  errorFrameCounts.set(key, (errorFrameCounts.get(key) ?? 0) + 1);
}

/** Distinct server-sent "error" frames seen (keyed by code+message) with
 * their counts, plus the single most recent one. Investigation-only. */
export function getBzzoiroErrorSummary(): {
  lastErrorFrame: BzzoiroErrorFrame | null;
  counts: Record<string, number>;
} {
  return { lastErrorFrame, counts: Object.fromEntries(errorFrameCounts) };
}

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
// Real second zombie variant confirmed 2026-09-14, once bzzoiro odds pricing
// went live on ~220 simultaneous subscriptions: ping/pong stayed perfectly
// healthy (proving the TCP/WS transport was alive) while zero real data
// frames — livedata, odds, anything — arrived for 4+ minutes straight,
// repeating within minutes of a fresh reconnect that itself worked
// immediately (a standalone test subscribing to ONE match got real frames
// in 463ms). This means ping/pong is answered by something in front of
// bzzoiro's actual application layer (a proxy/LB) that doesn't notice the
// backend has stopped pushing — the original heartbeat above only catches
// the transport dying, not the app-level stream going silent while the
// transport stays up. Treating prolonged silence on `lastFrameAt` as its
// own zombie signal, alongside the existing pong-timeout one, catches this
// too — real data should arrive roughly every ~5s per subscribed match, so
// 3x the heartbeat interval is generous margin, never a false trigger on a
// legitimate brief lull.
const STALE_DATA_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 3;
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
    if (
      subscribedEventIds.size > 0 &&
      lastFrameAt > 0 &&
      Date.now() - lastFrameAt > STALE_DATA_THRESHOLD_MS
    ) {
      logger.warn(
        { subscribedCount: subscribedEventIds.size, lastFrameAgeMs: Date.now() - lastFrameAt },
        "[bzzoiro-ws] ping/pong healthy but no real data frame in too long — terminating stale connection",
      );
      socket.terminate();
      return;
    }
    awaitingPong = true;
    pingsSent++;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);
}

// Real bug fixed 2026-09-12 (root cause of _ballPosition never populating
// for ANY subscribed match, confirmed via a standalone reproduction outside
// this app): the wire field is `action`, not `type` — sending `{"type":
// "subscribe", ...}` got back `{"type":"error","code":"bad_action",
// "message":"Unknown action: None"}` every single time, silently, since
// nothing here ever inspected the response. `{"action": "subscribe", ...}`
// gets back a real "subscribed" ack plus real "livedata" frames
// immediately. Incoming frames still use "type" (confirmed unchanged) —
// this asymmetry is a bzzoiro protocol quirk, not a mistake on our side.
function sendSubscribeFrames(): void {
  if (!ws || !connected) return;
  for (const eventId of subscribedEventIds) {
    ws.send(JSON.stringify({ action: "subscribe", event_id: eventId }));
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
    pongsReceived++;
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
    captureFrame(msg);
    if (msg.type === "livedata" && onLiveData) {
      onLiveData(msg as BzzoiroLiveDataFrame);
    }
    if (msg.type === "odds" && onOdds) {
      onOdds(msg as BzzoiroOddsFrame);
    }
    if (msg.type === "subscribed" && "event_id" in msg) {
      subscribedAckAt.set((msg as { event_id: number }).event_id, Date.now());
    }
    if (msg.type === "error") {
      // Never silently swallow this — a rejected subscribe (bad token,
      // plan/tier limit, unknown event_id, ...) would otherwise look
      // identical to "connection fine, bzzoiro just isn't sending data".
      logger.warn({ msg }, "[bzzoiro-ws] server sent an error frame");
      recordErrorFrame(msg as BzzoiroErrorFrame);
    }
    // unsubscribed/event/action/odds/ingest_debug frames are all real
    // (confirmed via the user's capture) but unused here — this
    // integration only ever needs real ball position.
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
export function startBzzoiroWebSocket(
  onLiveDataCallback?: (frame: BzzoiroLiveDataFrame) => void,
  onOddsCallback?: (frame: BzzoiroOddsFrame) => void,
): void {
  onLiveData = onLiveDataCallback ?? null;
  onOdds = onOddsCallback ?? null;
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
    ws.send(JSON.stringify({ action: "subscribe", event_id: eventId }));
  }
}

export function unsubscribeBzzoiroEvent(eventId: number): void {
  if (!subscribedEventIds.has(eventId)) return;
  subscribedEventIds.delete(eventId);
  if (ws && connected) {
    ws.send(JSON.stringify({ action: "unsubscribe", event_id: eventId }));
  }
}

export function getBzzoiroWsStatus(): {
  connected: boolean;
  lastFrameAgeMs: number | null;
  lastError: string | null;
  subscribedCount: number;
  pingsSent: number;
  pongsReceived: number;
  frameTypeCounts: Record<string, number>;
  serverErrors: { lastErrorFrame: BzzoiroErrorFrame | null; counts: Record<string, number> };
} {
  return {
    connected,
    lastFrameAgeMs: lastFrameAt ? Date.now() - lastFrameAt : null,
    lastError,
    subscribedCount: subscribedEventIds.size,
    pingsSent,
    pongsReceived,
    frameTypeCounts: getBzzoiroFrameTypeCounts(),
    serverErrors: getBzzoiroErrorSummary(),
  };
}

/** Age of the last "subscribed" ack this specific event_id received, or
 * null if it never got one. Distinguishes "bzzoiro rejected/ignored our
 * subscribe" from "subscribed fine, just no livedata frames yet" — see the
 * comment on subscribedAckAt above for why pongsReceived alone can't tell
 * these apart. */
export function getBzzoiroSubscribedAckAgeMs(eventId: number): number | null {
  const at = subscribedAckAt.get(eventId);
  return at ? Date.now() - at : null;
}
