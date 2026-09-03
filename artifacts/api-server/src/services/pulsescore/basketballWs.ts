// Basketball live odds from PulseScore via WebSocket — a PER-EVENT overlay
// on top of basketball.ts's REST poller, mirroring football.ts's fixed
// design (see getPulseScoreFootballLive's header there for the two prior
// all-or-nothing WS attempts that got reverted and why per-event freshness
// fixes both). Reactivated 2026-08-11 — see api/index.ts, called at boot
// alongside football/tennis's connections now that the MAX plan (3
// concurrent connections) removes the single-connection constraint this
// file's own history describes below.
//
// Built 2026-08-09 under the belief (from an earlier, wrong assumption) that
// the PRO plan grants one concurrent WS connection PER SPORT. The real
// PulseScore docs (confirmed 2026-08-10, pasted in full by the user) settle
// this definitively: connection limits are per PLAN, for the WHOLE ACCOUNT,
// not per sport — BASIC/STARTER get 0 (REST only), PRO gets exactly 1
// simultaneous connection, MAX gets 3. A second connection beyond the
// plan's limit gets closed with code 4029 ("Limite de conexões atingido"),
// documented as non-retryable. On a PRO plan, this module and footballWs.ts
// can never both hold a connection at once — only one sport gets WS at a
// time; every other sport is REST-only by design, not a workaround. Getting
// basketball (or any second sport) onto WS alongside football requires
// upgrading to the MAX plan (3 connections, €149/mês vs PRO's €79/mês) —
// a cost decision, not something fixable in code. Kept dormant (not wired
// into api/index.ts) until that upgrade happened 2026-08-11 — see above.
//
// Motivation for building it in the first place: basketball's REST live poll (basketball.ts, BASKETBALL_LIVE_TTL_MS)
// shares the "bwin" bookmaker's 1 req/s budget with football's own REST live
// poll (also bwin) — confirmed in production (2026-08-09) via a real bwin
// /live-events?sport=basketball sample that took 7 retries to land a 200
// while football's poll was also active, and via user reports of basketball
// moneyline odds appearing frozen (score updates, odds don't) — consistent
// with the underlying event object itself going stale under REST contention
// rather than a bug in the extraction logic (extractBasketballOverride was
// re-verified against that same real bwin live sample and reads the
// MATCH_RESULT/FULL_TIME market correctly). Alternate bookmakers were ruled
// out first: bet365 has no matchClock field at all for basketball and tags
// its moneyline market canonicalMarket=OTHER with untagged (non-HOME/AWAY)
// selections — incompatible, not just untested. unibetau is already at its
// own ceiling serving volleyball's live poll. A basketball-only WS
// connection sidesteps the whole REST budget fight instead of trying to
// divide it further.
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

// Same reasoning as footballWs.ts: unverified whether bwin's basketball
// frames are full snapshots or delta-only, so a grace window is correct
// under either hypothesis instead of betting on one.
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

// Same contamination guard as football/tennisWs.ts — this connection has
// never been observed leaking other sports yet, but neither had football's
// until it did in production, so the exact-tag check is applied from day
// one rather than added reactively after a real leak.
function applyFrame(frame: BroadcastFrame): void {
  lastFrameAt = Date.now();
  rollUsageDateIfNeeded();
  framesToday += 1;
  if (frame.sport !== "basketball") return;
  const now = Date.now();
  for (const ev of frame.data ?? []) {
    if (!ev?.eventId) continue;
    if (ev.sport !== "basketball") continue;
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
  if (!CONFIG.ENABLE_PULSESCORE) return;
  if (!CONFIG.PULSESCORE_API_KEY) return; // not configured yet
  if (connected) return;

  // Kept in sync with basketball.ts's REST source (BASKETBALL_BOOKMAKER) —
  // onexbet as of 2026-08-27, bwin before that (the bookmaker originally
  // confirmed to carry the matchClock.period + MATCH_RESULT market shape
  // this codebase's extraction logic depends on for basketball).
  const url = pulseScoreWsUrl("basketball", "onexbet");
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
    retryDelayMs = 2_000; // reset backoff on success
    logger.info("[pulsescore] basketball WS connected");
  });

  socket.addEventListener("message", (evt) => {
    try {
      const msg = JSON.parse(
        typeof evt.data === "string" ? evt.data : String(evt.data),
      ) as ConnectedMessage | BroadcastFrame;
      if ("type" in msg && msg.type === "connected") {
        logger.info(
          { bookmaker: msg.bookmaker, plan: msg.plan },
          "[pulsescore] basketball WS subscribed",
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
      logger.error({ code }, "[pulsescore] basketball WS closed (non-retryable)");
      return;
    }
    logger.warn({ code, retryMs: retryDelayMs }, "[pulsescore] basketball WS closed — reconnecting");
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    connected = false;
    ws = null;
  });
}

// Exposed only for unit tests (mirrors footballWs.ts's __testing) — lets
// them feed synthetic frames and inspect the grace-period behavior without
// opening a real WebSocket.
export const __testing = { applyFrame, liveByEventId, lastSeenAt };

/** Call once at server startup. Safe to call even without an API key yet —
 * it's a no-op until PULSESCORE_API_KEY is set (nothing to retry-loop). */
export function startPulseScoreBasketballWs(): void {
  if (!CONFIG.ENABLE_PULSESCORE) return;
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

/** PER-EVENT freshness check — see footballWs.ts's own version for the
 * production bug (Attempt 2) this design fixes. Returns this event's last
 * WS-broadcast data only if THIS SPECIFIC event was seen within maxAgeMs. */
export function getBasketballWsEvents(): PulseScoreEvent[] {
  return Array.from(liveByEventId.values());
}

export function basketballWsIsFresh(maxAgeMs: number): boolean {
  if (lastFrameAt <= 0) return false;
  return Date.now() - lastFrameAt <= maxAgeMs;
}

export function getBasketballWsEventIfFresh(
  eventId: string,
  maxAgeMs: number,
): PulseScoreEvent | null {
  const seenAt = lastSeenAt.get(eventId);
  if (!seenAt || Date.now() - seenAt > maxAgeMs) return null;
  return liveByEventId.get(eventId) ?? null;
}

export function pulseScoreBasketballWsStatus(): {
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
