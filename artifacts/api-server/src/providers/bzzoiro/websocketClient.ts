// sports.bzzoiro.com live football WebSocket — confirmed real 2026-09-11:
// the user connected with their own token and subscribed to a real live
// match (Rodez AF vs Grenoble Foot 38, event_id 580519), receiving real
// `subscribed`/`event`/`livedata`/`action`/`odds` frames matching the docs
// exactly. Auth is a `?token=` query param (confirmed working — REST uses
// an `Authorization: Token` header instead, a different scheme, same
// inconsistency this app has already seen between GOAL API/PulseScore/
// api-tennis each using their own auth style).
//
// Real root cause fixed 2026-09-14, found in the user's own pasted docs
// ("Connect to live WebSockets"): "Up to 10 concurrent subscriptions per
// socket." This module used to hold ONE socket and subscribe every live
// football match to it (~224 at the time) — bzzoiro accepted the first 10
// and error-framed the other 214, every single reconnect. Production
// showed exactly { subscribed: 30, error: 642 } across 3 observed
// reconnects: 3×10=30, 3×214=642, an exact match, not a guess. This file
// now maintains a POOL of sockets ("shards"), each capped at
// MAX_SUBSCRIPTIONS_PER_SOCKET, so no single connection ever exceeds
// bzzoiro's real documented limit. Only `livedata` frames feed
// LiveMatchState._ballPosition and `odds` frames feed real pricing —
// `action` frames (per-play, ~100ms, "full" tier only) are still
// deliberately ignored (near-duplicate firing observed in the original
// real capture; `livedata` already carries the same coordinates in a
// cleaner, de-duplicated shape).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
// Node's global `WebSocket` only stabilized in Node 22; production pins an
// older Node (see providers/pulsescore/websocketClient.ts's own note on
// this exact gap) — import the `ws` package's class explicitly instead of
// relying on a runtime global that may not exist.
import { WebSocket as WsClient } from "ws";
import type { BzzoiroWsFrame, BzzoiroLiveDataFrame, BzzoiroOddsFrame, BzzoiroErrorFrame, BzzoiroSubscribedFrame } from "./types.js";

// Confirmed real 2026-09-14 via bzzoiro's own "Connect to live WebSockets"
// docs: "Up to 10 concurrent subscriptions per socket." This is the actual
// root cause of the 642 error frames seen in production — see this file's
// header.
const MAX_SUBSCRIPTIONS_PER_SOCKET = 10;

type Shard = {
  id: number;
  ws: WsClient | null;
  connected: boolean;
  retryDelayMs: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  subscribedEventIds: Set<number>;
  lastFrameAt: number;
  lastError: string | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  awaitingPong: boolean;
  pingsSent: number;
  pongsReceived: number;
};

const shards: Shard[] = [];
// Which shard currently owns each event_id — needed so
// unsubscribeBzzoiroEvent (and a future resubscribe) can find the right
// socket without scanning every shard.
const eventIdToShard = new Map<number, Shard>();
let nextShardId = 0;
let startedOnce = false;

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
// sending. Global (not per-shard): event_ids are unique across the whole
// pool.
const lastFrameByType = new Map<string, Map<number, BzzoiroWsFrame>>();
// Added 2026-09-14 alongside the odds pricing rollout, before the 10-per-
// socket limit was found: counts every frame by type regardless of shard,
// to tell "odds frames are rare" apart from "the odds pipeline drops
// frames silently". Still useful post-fix as a general health signal.
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

// Global (not per-shard) error tracking — added 2026-09-14 when production
// first showed { subscribed: 30, error: 642 }, before the 10-per-socket
// limit was traced from the docs. Kept post-fix as a general early-warning
// signal for any other rejected subscribe (unknown event_id, expired
// token, ...).
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
// frames — livedata, odds, anything — arrived for 4+ minutes straight. At
// the time this looked like an app-level zombie; the real cause (10-per-
// socket limit blowing up a single shared connection) is fixed above, but
// prolonged silence on a shard that legitimately has subscriptions is
// still worth treating as its own zombie signal alongside the pong-timeout
// one — real data should arrive roughly every ~5s per subscribed match, so
// 3x the heartbeat interval is generous margin, never a false trigger on a
// legitimate brief lull.
const STALE_DATA_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 3;

function stopHeartbeat(shard: Shard): void {
  if (shard.heartbeatTimer) {
    clearInterval(shard.heartbeatTimer);
    shard.heartbeatTimer = null;
  }
}

function startHeartbeat(shard: Shard): void {
  stopHeartbeat(shard);
  shard.awaitingPong = false;
  shard.heartbeatTimer = setInterval(() => {
    const socket = shard.ws;
    if (!socket) return;
    if (shard.awaitingPong) {
      logger.warn({ shardId: shard.id }, "[bzzoiro-ws] no response to heartbeat ping — terminating stale connection");
      socket.terminate(); // forces "close", which schedules a real reconnect
      return;
    }
    if (
      shard.subscribedEventIds.size > 0 &&
      shard.lastFrameAt > 0 &&
      Date.now() - shard.lastFrameAt > STALE_DATA_THRESHOLD_MS
    ) {
      logger.warn(
        { shardId: shard.id, subscribedCount: shard.subscribedEventIds.size, lastFrameAgeMs: Date.now() - shard.lastFrameAt },
        "[bzzoiro-ws] ping/pong healthy but no real data frame in too long — terminating stale connection",
      );
      socket.terminate();
      return;
    }
    shard.awaitingPong = true;
    shard.pingsSent++;
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
function sendSubscribeFrames(shard: Shard): void {
  if (!shard.ws || !shard.connected) return;
  for (const eventId of shard.subscribedEventIds) {
    shard.ws.send(JSON.stringify({ action: "subscribe", event_id: eventId }));
  }
}

function scheduleReconnect(shard: Shard): void {
  if (shard.reconnectTimer) return;
  const delay = shard.retryDelayMs;
  shard.retryDelayMs = Math.min(shard.retryDelayMs * 2, 60_000);
  shard.reconnectTimer = setTimeout(() => {
    shard.reconnectTimer = null;
    connectShard(shard);
  }, delay);
}

function connectShard(shard: Shard): void {
  if (!CONFIG.BZZOIRO_API_KEY || shard.connected) return;

  let socket: WsClient;
  try {
    const url = `${CONFIG.BZZOIRO_WS_URL}?token=${encodeURIComponent(CONFIG.BZZOIRO_API_KEY)}`;
    socket = new WsClient(url);
  } catch (err) {
    shard.lastError = err instanceof Error ? err.message : String(err);
    scheduleReconnect(shard);
    return;
  }
  shard.ws = socket;

  socket.on("open", () => {
    shard.connected = true;
    shard.retryDelayMs = 2_000;
    logger.info({ shardId: shard.id }, "[bzzoiro-ws] connected");
    // Re-subscribe to every match this shard owns — needed after any
    // reconnect, since the server has no memory of a dropped socket's
    // prior subscriptions.
    sendSubscribeFrames(shard);
    startHeartbeat(shard);
  });

  socket.on("pong", () => {
    shard.awaitingPong = false;
    shard.pongsReceived++;
  });

  socket.on("message", (data) => {
    shard.lastFrameAt = Date.now();
    shard.awaitingPong = false; // any real traffic is proof of life, not just a pong
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
      const sub = msg as BzzoiroSubscribedFrame;
      subscribedAckAt.set(sub.event_id, Date.now());
      // Real bug found 2026-09-14, straight from the user's own pasted
      // docs: bzzoiro sends this snapshot's `odds` field on every single
      // subscribe, but a real "odds" delta frame is only re-sent when a
      // price actually changes — and "the underlying prices are re-read
      // on a cadence measured in tens of minutes, not seconds". For any
      // match already priced before this process subscribed, this
      // snapshot may be the ONLY odds data this shard sees for a long
      // while. Feed it through the exact same path a real "odds" frame
      // takes (captureFrame + onOdds) rather than discarding it.
      if (sub.odds && onOdds) {
        const syntheticOddsFrame: BzzoiroOddsFrame = {
          type: "odds",
          event_id: sub.event_id,
          odds: sub.odds,
          updated_at: null,
          next_update_at: null,
          update_reason: "subscribed-snapshot",
        };
        captureFrame(syntheticOddsFrame);
        onOdds(syntheticOddsFrame);
      }
      // Same reasoning as the odds snapshot above, added 2026-09-14
      // alongside bzzoiro becoming BET62's own football discovery source
      // (not just an odds/ball-position add-on): a natively-discovered
      // match has no GOAL API poll to source its initial score/minute
      // from, so this embedded snapshot — "same shape as the event frame"
      // per the docs — is the only way to get a real score before the
      // next real "event" delta frame (sent only on a state change) lands.
      if (sub.event) {
        captureFrame(sub.event);
      }
    }
    if (msg.type === "error") {
      // Never silently swallow this — a rejected subscribe (bad token,
      // plan/tier limit, unknown event_id, ...) would otherwise look
      // identical to "connection fine, bzzoiro just isn't sending data".
      logger.warn({ shardId: shard.id, msg }, "[bzzoiro-ws] server sent an error frame");
      recordErrorFrame(msg as BzzoiroErrorFrame);
    }
    // unsubscribed/event/action/ingest_debug frames are all real (confirmed
    // via the user's capture) but unused here.
  });

  socket.on("close", (code) => {
    shard.connected = false;
    shard.ws = null;
    stopHeartbeat(shard);
    logger.warn({ shardId: shard.id, code, retryMs: shard.retryDelayMs }, "[bzzoiro-ws] closed — reconnecting");
    scheduleReconnect(shard);
  });

  socket.on("error", (err) => {
    shard.connected = false;
    shard.ws = null;
    stopHeartbeat(shard);
    shard.lastError = err instanceof Error ? err.message : String(err);
    // "close" always follows "error" for WebSocket — reconnect scheduled there.
  });
}

function createShard(): Shard {
  const shard: Shard = {
    id: nextShardId++,
    ws: null,
    connected: false,
    retryDelayMs: 2_000,
    reconnectTimer: null,
    subscribedEventIds: new Set(),
    lastFrameAt: 0,
    lastError: null,
    heartbeatTimer: null,
    awaitingPong: false,
    pingsSent: 0,
    pongsReceived: 0,
  };
  shards.push(shard);
  connectShard(shard);
  return shard;
}

// Tears down and forgets a shard that has dropped to zero subscriptions —
// otherwise a long-uptime process would accumulate one open, otherwise-idle
// socket per past churn event and never reduce its connection count.
// removeAllListeners() first so this intentional close doesn't also fire
// the "close" handler's scheduleReconnect() on a shard we're discarding.
function closeShard(shard: Shard): void {
  stopHeartbeat(shard);
  if (shard.reconnectTimer) {
    clearTimeout(shard.reconnectTimer);
    shard.reconnectTimer = null;
  }
  if (shard.ws) {
    shard.ws.removeAllListeners();
    shard.ws.terminate();
    shard.ws = null;
  }
  shard.connected = false;
  const idx = shards.indexOf(shard);
  if (idx !== -1) shards.splice(idx, 1);
}

/** Call once at server startup, gated on CONFIG.BZZOIRO_API_KEY being set.
 * onLiveDataCallback receives every real `livedata` frame for any
 * currently-subscribed match; onOddsCallback every real `odds` frame.
 * Shards are created lazily by subscribeBzzoiroEvent — there is nothing to
 * connect yet with zero subscriptions. */
export function startBzzoiroWebSocket(
  onLiveDataCallback?: (frame: BzzoiroLiveDataFrame) => void,
  onOddsCallback?: (frame: BzzoiroOddsFrame) => void,
): void {
  onLiveData = onLiveDataCallback ?? null;
  onOdds = onOddsCallback ?? null;
  if (!CONFIG.BZZOIRO_API_KEY) return;
  if (startedOnce) return;
  startedOnce = true;
}

/** Idempotent — safe to call every matching cycle for a fixture already
 * subscribed. Places the event on the first shard with a free slot (there
 * are at most MAX_SUBSCRIPTIONS_PER_SOCKET per shard, per bzzoiro's own
 * documented limit), opening a new shard/socket only when every existing
 * one is full. */
export function subscribeBzzoiroEvent(eventId: number): void {
  if (!CONFIG.BZZOIRO_API_KEY) return;
  if (eventIdToShard.has(eventId)) return;
  let shard = shards.find((s) => s.subscribedEventIds.size < MAX_SUBSCRIPTIONS_PER_SOCKET);
  if (!shard) shard = createShard();
  shard.subscribedEventIds.add(eventId);
  eventIdToShard.set(eventId, shard);
  if (shard.connected && shard.ws) {
    shard.ws.send(JSON.stringify({ action: "subscribe", event_id: eventId }));
  }
}

export function unsubscribeBzzoiroEvent(eventId: number): void {
  const shard = eventIdToShard.get(eventId);
  if (!shard) return;
  shard.subscribedEventIds.delete(eventId);
  eventIdToShard.delete(eventId);
  if (shard.connected && shard.ws) {
    shard.ws.send(JSON.stringify({ action: "unsubscribe", event_id: eventId }));
  }
  if (shard.subscribedEventIds.size === 0) {
    closeShard(shard);
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
  shardCount: number;
} {
  const mostRecentFrameAt = shards.reduce((max, s) => Math.max(max, s.lastFrameAt), 0);
  return {
    connected: shards.some((s) => s.connected),
    lastFrameAgeMs: mostRecentFrameAt ? Date.now() - mostRecentFrameAt : null,
    lastError: shards.map((s) => s.lastError).filter((e): e is string => e != null).pop() ?? null,
    subscribedCount: eventIdToShard.size,
    pingsSent: shards.reduce((sum, s) => sum + s.pingsSent, 0),
    pongsReceived: shards.reduce((sum, s) => sum + s.pongsReceived, 0),
    frameTypeCounts: getBzzoiroFrameTypeCounts(),
    serverErrors: getBzzoiroErrorSummary(),
    shardCount: shards.length,
  };
}

// Global (not per-shard) — event_ids are unique across the whole pool.
const subscribedAckAt = new Map<number, number>();

/** Age of the last "subscribed" ack this specific event_id received, or
 * null if it never got one. Distinguishes "bzzoiro rejected/ignored our
 * subscribe" from "subscribed fine, just no livedata frames yet" — see the
 * comment on subscribedAckAt above for why pongsReceived alone can't tell
 * these apart. */
export function getBzzoiroSubscribedAckAgeMs(eventId: number): number | null {
  const at = subscribedAckAt.get(eventId);
  return at ? Date.now() - at : null;
}
