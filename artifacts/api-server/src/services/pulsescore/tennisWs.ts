// Tennis live odds from PulseScore via WebSocket — chosen over REST for
// tennis specifically because point-by-point pricing benefits most from
// push updates, and the PRO plan only allows one concurrent WS connection
// (so it's this sport or football, not both; football uses REST instead,
// see football.ts). Mirrors the reconnect-with-backoff shape already used
// for the SportsAPI Pro V1 WebSocket clients in routes/matches.ts.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { pulseScoreWsUrl, type PulseScoreEvent } from "./client.js";

let ws: WebSocket | null = null;
let connected = false;
let retryDelayMs = 5_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;

const liveByEventId = new Map<string, PulseScoreEvent>();
let lastFrameAt = 0;

type ConnectedMessage = {
  type: "connected";
  bookmaker: string;
  sport: string;
  plan: string;
  validSports: string[];
};
type BroadcastFrame = {
  sport: string;
  timestamp: number;
  count: number;
  data: PulseScoreEvent[];
};

function applyFrame(frame: BroadcastFrame): void {
  lastFrameAt = Date.now();
  const seenIds = new Set<string>();
  for (const ev of frame.data ?? []) {
    if (!ev?.eventId) continue;
    liveByEventId.set(ev.eventId, ev);
    seenIds.add(ev.eventId);
  }
  // Drop events no longer present in the feed (match ended / went off live).
  for (const id of liveByEventId.keys()) {
    if (!seenIds.has(id)) liveByEventId.delete(id);
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
  if (!CONFIG.PULSESCORE_API_KEY) return; // not configured yet
  if (connected) return;

  const url = pulseScoreWsUrl("tennis");
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.addEventListener("open", () => {
    connected = true;
    retryDelayMs = 5_000; // reset backoff on success
    logger.info("[pulsescore] tennis WS connected");
  });

  socket.addEventListener("message", (evt) => {
    try {
      const msg = JSON.parse(
        typeof evt.data === "string" ? evt.data : String(evt.data),
      ) as ConnectedMessage | BroadcastFrame;
      if ("type" in msg && msg.type === "connected") {
        logger.info(
          { bookmaker: msg.bookmaker, plan: msg.plan },
          "[pulsescore] tennis WS subscribed",
        );
        return;
      }
      applyFrame(msg as BroadcastFrame);
    } catch {
      // non-JSON heartbeat — ignore
    }
  });

  socket.addEventListener("close", (evt) => {
    connected = false;
    ws = null;
    // 4001/4003/4004/4010/4029 are documented as non-retryable (bad key,
    // plan too low, invalid sport, expired subscription, connection cap) —
    // retrying those in a loop would just hammer PulseScore for nothing.
    const code = (evt as { code?: number }).code;
    const nonRetryable = code !== undefined && [4001, 4003, 4004, 4010, 4029].includes(code);
    if (nonRetryable) {
      logger.error({ code }, "[pulsescore] tennis WS closed (non-retryable)");
      return;
    }
    logger.warn({ code, retryMs: retryDelayMs }, "[pulsescore] tennis WS closed — reconnecting");
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    connected = false;
    ws = null;
  });
}

/** Call once at server startup. Safe to call even without an API key yet —
 * it's a no-op until PULSESCORE_API_KEY is set (nothing to retry-loop). */
export function startPulseScoreTennisWs(): void {
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

/** Live tennis odds from PulseScore (bet365, normalized), from the last
 * WebSocket frame (~1s old at most while connected). Empty until connected
 * or if no tennis matches are currently live upstream. */
export function getPulseScoreTennisLive(): PulseScoreEvent[] {
  return [...liveByEventId.values()];
}

export function pulseScoreTennisWsStatus(): {
  connected: boolean;
  lastFrameAgeMs: number | null;
  liveCount: number;
} {
  return {
    connected,
    lastFrameAgeMs: lastFrameAt > 0 ? Date.now() - lastFrameAt : null,
    liveCount: liveByEventId.size,
  };
}
