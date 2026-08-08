// Football live odds from PulseScore via WebSocket — the PRO plan's single
// concurrent WS connection was originally given to tennis (point-by-point
// pricing benefits most from push updates) but football stayed on REST,
// which meant its clock/score only ever updated when our own ~1s poll
// happened to land (and, once football/tennis started sharing the bet365
// REST budget via a per-bookmaker throttle, at best every ~2s). That's fine
// for well-covered leagues but not for lower-coverage ones — confirmed in
// production (2026-08-08, Vicenza v Catania, a Coppa Italia preliminary-
// round match): PulseScore itself only sends occasional checkpoint updates
// for those, and REST polling can't do better than whatever's already
// there. Moved to football 2026-08-08 (explicit user decision, trading
// tennis's WS access for it — the plan only allows one) since football is
// the sport actually driving live-clock complaints.
//
// Mirrors tennisWs.ts's structure exactly (see that file's history/comments
// for why: WS was tried once before and abandoned when no frame ever
// arrived — getPulseScoreFootballLive() below only trusts this source while
// a frame has actually arrived recently, same reasoning as tennis had).
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

// Same reasoning as tennisWs.ts's applyFrame: the WS connection has proven
// to broadcast frames for OTHER sports on this same subscribed socket, not
// just the one subscribed to — requires an exact "soccer" match on both
// frame.sport and each event's own ev.sport, same as the REST path's
// existing `ev.sport !== "soccer"` check in buildFootballLiveFromPulseScore.
// Unlike tennis, no extra market-shape heuristic is added here — football's
// builder already applies a strict league-catalog allowlist
// (isAllowedFootballLeague/footballLeagueAllowedStrict) downstream on every
// event regardless of whether it came from WS or REST, which tennis's
// builder didn't have an equivalent of before its own leaks were found.
function applyFrame(frame: BroadcastFrame): void {
  lastFrameAt = Date.now();
  rollUsageDateIfNeeded();
  framesToday += 1;
  if (frame.sport !== "soccer") return;
  const seenIds = new Set<string>();
  for (const ev of frame.data ?? []) {
    if (!ev?.eventId) continue;
    if (ev.sport !== "soccer") continue;
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

  const url = pulseScoreWsUrl("soccer");
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
    logger.info("[pulsescore] football WS connected");
  });

  socket.addEventListener("message", (evt) => {
    try {
      const msg = JSON.parse(
        typeof evt.data === "string" ? evt.data : String(evt.data),
      ) as ConnectedMessage | BroadcastFrame;
      if ("type" in msg && msg.type === "connected") {
        logger.info(
          { bookmaker: msg.bookmaker, plan: msg.plan },
          "[pulsescore] football WS subscribed",
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
      logger.error({ code }, "[pulsescore] football WS closed (non-retryable)");
      return;
    }
    logger.warn({ code, retryMs: retryDelayMs }, "[pulsescore] football WS closed — reconnecting");
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    connected = false;
    ws = null;
  });
}

/** Call once at server startup. Safe to call even without an API key yet —
 * it's a no-op until PULSESCORE_API_KEY is set (nothing to retry-loop). */
export function startPulseScoreFootballWs(): void {
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

/** Live football events from the last WebSocket frame (~1s old at most
 * while connected). Empty until connected or if no football matches are
 * currently live upstream. */
export function getFootballWsEvents(): PulseScoreEvent[] {
  return [...liveByEventId.values()];
}

/** True only if a frame has actually arrived within maxAgeMs — deliberately
 * NOT just `connected`, since a socket can sit open without ever pushing
 * real data. Callers should fall back to REST whenever this is false. */
export function footballWsIsFresh(maxAgeMs: number): boolean {
  return connected && lastFrameAt > 0 && Date.now() - lastFrameAt < maxAgeMs;
}

export function pulseScoreFootballWsStatus(): {
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
