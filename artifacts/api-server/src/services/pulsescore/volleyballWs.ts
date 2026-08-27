// Volleyball live odds from PulseScore via WebSocket. Pinned to onexbet,
// matching volleyball.ts's VOLLEYBALL_BOOKMAKER/VOLLEYBALL_LIVE_BOOKMAKER
// (both onexbet as of 2026-08-27). Built 2026-08-15 alongside
// hockeyWs.ts for P35 (BetBY mini-tracker all-sports activation).
// Same fail-closed design as hockeyWs: if no frames ever arrive, the
// in-memory map stays empty and callers (matchBetbyEventToPulseScore)
// return the empty PulseMatchSnapshot with confidence=0, which triggers
// the downstream Guard Fallback Smart in proxy.ts that treats "no
// PulseScore match found" exactly the same way it did pre-P35 when
// volleyball simply had no WS getter entry at all.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { pulseScoreWsUrl, type PulseScoreEvent } from "./client.js";

let ws: WebSocket | null = null;
let connected = false;
let retryDelayMs = 2_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;

const liveByEventId = new Map<string, PulseScoreEvent>();
const lastSeenAt = new Map<string, number>();
let lastFrameAt = 0;

const STALE_EVENT_GRACE_MS = 20_000;

let framesToday = 0;
let usageDate = todayUtc();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollUsageDateIfNeeded(): void {
  const d = todayUtc();
  if (d !== usageDate) {
    usageDate = d;
    framesToday = 0;
  }
}

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
  rollUsageDateIfNeeded();
  framesToday += 1;
  if (frame.sport !== "volleyball") return;
  const now = Date.now();
  for (const ev of frame.data ?? []) {
    if (!ev?.eventId) continue;
    if (ev.sport !== "volleyball") continue;
    liveByEventId.set(ev.eventId, ev);
    lastSeenAt.set(ev.eventId, now);
  }
  for (const [id, seenAt] of lastSeenAt) {
    if (now - seenAt > STALE_EVENT_GRACE_MS) {
      liveByEventId.delete(id);
      lastSeenAt.delete(id);
    }
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
  if (!CONFIG.PULSESCORE_API_KEY) return;
  if (connected) return;

  const url = pulseScoreWsUrl("volleyball", "onexbet");
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
    retryDelayMs = 2_000;
    logger.info("[pulsescore] volleyball WS connected");
  });

  socket.addEventListener("message", (evt) => {
    try {
      const msg = JSON.parse(
        typeof evt.data === "string" ? evt.data : String(evt.data),
      ) as ConnectedMessage | BroadcastFrame;
      if ("type" in msg && msg.type === "connected") {
        logger.info(
          { bookmaker: msg.bookmaker, plan: msg.plan },
          "[pulsescore] volleyball WS subscribed",
        );
        return;
      }
      applyFrame(msg as BroadcastFrame);
    } catch {
      // ignore heartbeat
    }
  });

  socket.addEventListener("close", (evt) => {
    connected = false;
    ws = null;
    const code = (evt as { code?: number }).code;
    const nonRetryable = code !== undefined && [4001, 4003, 4004, 4010, 4029].includes(code);
    if (nonRetryable) {
      logger.error({ code }, "[pulsescore] volleyball WS closed (non-retryable)");
      return;
    }
    logger.warn({ code, retryMs: retryDelayMs }, "[pulsescore] volleyball WS closed — reconnecting");
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    connected = false;
    ws = null;
  });
}

export const __testing = { applyFrame, liveByEventId, lastSeenAt };

export function startPulseScoreVolleyballWs(): void {
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

export function getVolleyballWsEvents(): PulseScoreEvent[] {
  return Array.from(liveByEventId.values());
}

export function volleyballWsIsFresh(maxAgeMs: number): boolean {
  if (lastFrameAt <= 0) return false;
  return Date.now() - lastFrameAt <= maxAgeMs;
}

export function getVolleyballWsEventIfFresh(
  eventId: string,
  maxAgeMs: number,
): PulseScoreEvent | null {
  const seenAt = lastSeenAt.get(eventId);
  if (!seenAt || Date.now() - seenAt > maxAgeMs) return null;
  return liveByEventId.get(eventId) ?? null;
}

export function pulseScoreVolleyballWsStatus(): {
  connected: boolean;
  lastFrameAgeMs: number | null;
  liveCount: number;
  framesToday: number;
  date: string;
} {
  rollUsageDateIfNeeded();
  return {
    connected,
    lastFrameAgeMs: lastFrameAt > 0 ? Date.now() - lastFrameAt : null,
    liveCount: liveByEventId.size,
    framesToday,
    date: usageDate,
  };
}
