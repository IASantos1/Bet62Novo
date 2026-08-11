// Football live odds from PulseScore via WebSocket — originally the PRO
// plan's WS connection was given to tennis (point-by-point pricing benefits
// most from push updates) but football stayed on REST, which meant its
// clock/score only ever updated when our own ~1s poll happened to land (and,
// once football/tennis started sharing the bet365 REST budget via a
// per-bookmaker throttle, at best every ~2s). That's fine for well-covered
// leagues but not for lower-coverage ones — confirmed in production
// (2026-08-08, Vicenza v Catania, a Coppa Italia preliminary-round match):
// PulseScore itself only sends occasional checkpoint updates for those, and
// REST polling can't do better than whatever's already there. Moved to
// football 2026-08-08 (explicit user decision, trading tennis's WS access
// for it) — the PRO plan allowed exactly ONE concurrent WS connection for
// the whole account (confirmed via the real PulseScore docs, 2026-08-10:
// connection limits are per plan/account, not per sport — a mid-session
// guess to the contrary briefly led to also opening a basketball connection
// on 2026-08-09, which got closed under the plan's 1-connection cap and was
// reverted the next day, see basketballWs.ts's header). That constraint no
// longer applies: 2026-08-11 MAX plan upgrade (3 concurrent connections) —
// tennisWs.ts and basketballWs.ts are both started alongside this one now
// (api/index.ts), each using the same per-event-freshness design this file
// established (getFootballWsEventIfFresh below).
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
const lastSeenAt = new Map<string, number>();
let lastFrameAt = 0;

// How long an event can go unmentioned in a frame before it's dropped as
// "no longer live". Whether PulseScore's football frames are full
// snapshots or delta-only (only events that changed since the last frame)
// is unverified — see football.ts's getPulseScoreFootballLive() comment
// for the production incident (matches vanishing) this question caused.
// A grace window makes this module correct under BOTH hypotheses instead
// of betting on one: under full-snapshot semantics a live match reappears
// on every frame well within this window; under delta-only semantics a
// match with nothing new to report simply won't be mentioned for a while
// and shouldn't be treated as having ended just because of that.
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
  const now = Date.now();
  for (const ev of frame.data ?? []) {
    if (!ev?.eventId) continue;
    if (ev.sport !== "soccer") continue;
    liveByEventId.set(ev.eventId, ev);
    lastSeenAt.set(ev.eventId, now);
  }
  // Drop events not mentioned in any frame for STALE_EVENT_GRACE_MS (match
  // ended / went off live) rather than on the very first frame that omits
  // them — see STALE_EVENT_GRACE_MS above for why.
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
  if (!CONFIG.PULSESCORE_API_KEY) return; // not configured yet
  if (connected) return;

  // Pinned to "bwin" — matches football.ts's REST source (FOOTBALL_BOOKMAKER)
  // as of 2026-08-08, so this dormant WS connection observes the same
  // bookmaker's data shape it would need to trust if it were ever wired
  // back up as a live source (see football.ts's getPulseScoreFootballLive
  // header for why it isn't yet).
  const url = pulseScoreWsUrl("soccer", "bwin");
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

// Exposed only for the applyFrame unit tests in tests/pulsescore.spec.ts —
// lets them feed synthetic frames and inspect the grace-period behavior
// without opening a real WebSocket.
export const __testing = { applyFrame, liveByEventId, lastSeenAt };

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
 * real data. Callers should fall back to REST whenever this is false.
 *
 * Connection-level only — kept for status reporting (pulseScoreFootballWsStatus
 * uses the same lastFrameAt reasoning). Attempt 2 in getPulseScoreFootballLive's
 * header used exactly this check to gate trusting WS data and got burned: a
 * quiet event (no price movement, so PulseScore never re-broadcasts it) went
 * stale while OTHER events kept the connection looking healthy. Use
 * getFootballWsEventIfFresh for any per-match trust decision instead. */
export function footballWsIsFresh(maxAgeMs: number): boolean {
  return connected && lastFrameAt > 0 && Date.now() - lastFrameAt < maxAgeMs;
}

/** PER-EVENT freshness check, the fix for Attempt 2's bug (see
 * getPulseScoreFootballLive's header in football.ts): returns this event's
 * last WS-broadcast data only if THIS SPECIFIC event was seen within
 * maxAgeMs, regardless of how recently any other event was broadcast. A
 * quiet event whose own lastSeenAt has gone stale returns null here even
 * while the connection as a whole is healthy — callers fall back to REST
 * for that one match instead of serving frozen WS data. */
export function getFootballWsEventIfFresh(
  eventId: string,
  maxAgeMs: number,
): PulseScoreEvent | null {
  const seenAt = lastSeenAt.get(eventId);
  if (!seenAt || Date.now() - seenAt > maxAgeMs) return null;
  return liveByEventId.get(eventId) ?? null;
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
