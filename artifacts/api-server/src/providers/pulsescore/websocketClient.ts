// PulseScore inbound WebSocket push — confirmed real via the official docs
// the user pasted 2026-09-10 (before that, only REST responses had been
// captured). The account's PRO plan includes 1 concurrent WebSocket
// connection per bookmaker; this connects to the 1xBet ("onexbet") endpoint
// specifically, matching every REST path this integration already uses.
//
// Deliberately conservative, mirroring services/goalapi/websocketClient.ts's
// model rather than api-tennis's: the docs' own broadcast-frame example
// shows a DIFFERENT schema than the REST API uses for the exact same kind of
// data — selections are `{name, decimal}` here vs REST's
// `{canonicalOutcome, rawName, odds, rawOdds, selectionId, isActive}`, and
// `score` is a joined string ("1-0") here vs REST's `{home, away}` object.
// Unlike REST (validated against 5 real captured payloads), there's no real
// captured WS frame yet — only the docs' illustrative example, which could
// be incomplete or stale. So this treats every broadcast frame as JUST a
// wake-up signal (which eventIds are currently live) and never reads
// selections/score/markets from it — callers re-derive real state from the
// already-validated REST path, same as GOAL API's WS client does. Revisit
// once a real frame has been captured and compared field-for-field.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

let ws: WebSocket | null = null;
let connected = false;
let retryDelayMs = 2_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;
let lastFrameAt = 0;
let lastError: string | null = null;
let lastFrameEventCount = 0;

type PulseScoreWsMessage =
  | { type: "connected"; bookmaker: string; sport: string; plan: string; validSports: string[] }
  | { sport: string; timestamp: number; count: number; data: Array<{ eventId?: string; [k: string]: unknown }> };

/** Close codes confirmed real from the docs (not a guess, unlike GOAL API's
 * WS client's defensive-but-unconfirmed list): 4001 auth failed, 4003 plan
 * too low, 4004 invalid sport for this bookmaker, 4010 subscription
 * expired, 4029 connection limit reached — none of these will ever
 * succeed on retry. 4011 (plan downgrade) and 4012 (session replaced by a
 * newer connection) are explicitly documented as retryable. */
const NON_RETRYABLE_CLOSE_CODES = new Set([4001, 4003, 4004, 4010, 4029]);

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
  if (!CONFIG.PULSESCORE_API_KEY || connected) return;

  let socket: WebSocket;
  try {
    const url = `${CONFIG.PULSESCORE_WS_URL}?key=${encodeURIComponent(CONFIG.PULSESCORE_API_KEY)}&sport=soccer`;
    socket = new WebSocket(url);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.addEventListener("open", () => {
    connected = true;
    retryDelayMs = 2_000;
    logger.info("[pulsescore-ws] connected");
  });

  socket.addEventListener("message", (evt) => {
    lastFrameAt = Date.now();
    let msg: PulseScoreWsMessage;
    try {
      msg = JSON.parse(typeof evt.data === "string" ? evt.data : String(evt.data));
    } catch {
      return; // non-JSON keepalive — ignore
    }
    if ("type" in msg && msg.type === "connected") {
      logger.info({ bookmaker: msg.bookmaker, sport: msg.sport, plan: msg.plan }, "[pulsescore-ws] subscription confirmed");
      return;
    }
    if ("data" in msg && Array.isArray(msg.data)) {
      const eventIds = msg.data.map((ev) => ev.eventId).filter((id): id is string => typeof id === "string");
      lastFrameEventCount = eventIds.length;
      if (onFrame) onFrame(eventIds);
    }
  });

  socket.addEventListener("close", (evt) => {
    connected = false;
    ws = null;
    const code = (evt as { code?: number }).code;
    if (code != null && NON_RETRYABLE_CLOSE_CODES.has(code)) {
      lastError = `closed with non-retryable code ${code}`;
      logger.error({ code }, "[pulsescore-ws] closed (non-retryable) — not reconnecting");
      return;
    }
    logger.warn({ code, retryMs: retryDelayMs }, "[pulsescore-ws] closed — reconnecting");
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    connected = false;
    ws = null;
    // "close" always follows "error" for WebSocket — reconnect is scheduled there.
  });
}

let onFrame: ((eventIds: string[]) => void) | null = null;

/** Call once at server startup, gated on CONFIG.PULSESCORE_API_KEY being
 * set. onFrameCallback receives the list of PulseScore eventIds seen in
 * each broadcast frame (~1/sec) — a wake-up signal only, never odds/score
 * data (see file header). */
export function startPulseScoreWebSocket(onFrameCallback?: (eventIds: string[]) => void): void {
  onFrame = onFrameCallback ?? null;
  if (!CONFIG.PULSESCORE_API_KEY) return;
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

export function getPulseScoreWsStatus(): {
  connected: boolean;
  lastFrameAgeMs: number | null;
  lastError: string | null;
  lastFrameEventCount: number;
} {
  return {
    connected,
    lastFrameAgeMs: lastFrameAt ? Date.now() - lastFrameAt : null,
    lastError,
    lastFrameEventCount,
  };
}
