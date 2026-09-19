// PropLine — inbound WebSocket push for real-time line movement, confirmed
// real 2026-09-19 (wss://ws.prop-line.com/v1/stream, gated behind the
// Streaming Lite plan or above — this account's Streaming plan already
// includes it: 5 concurrent connections). Treated purely as a wake-up
// signal, same convention GOAL API's WS client already uses in this
// codebase: a `line_movement`/`resolution` event just means "something
// changed for this sport, go re-fetch over REST now instead of waiting for
// the next poll tick" — it never patches a price directly from the event
// payload. Two reasons: (1) the event is a single bookmaker/outcome delta,
// not the full multi-bookmaker average this app's extraction functions
// already compute correctly; (2) every REST extraction path is already
// tested and shipped — re-deriving the exact same market patch from a raw
// WS delta would duplicate that logic with a second chance to get it wrong.
//
// One unfiltered subscription (no filter_sport_key) covers every sport in
// a single connection — the account's 5-connection cap can't afford one
// per league (football alone has 6+), so this demuxes by the event's own
// `sport_key` instead. Falls back to nothing worse than today's 15s poll
// if the socket is down; never a hard dependency.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { propline } from "./index.js";
import { runPropLineLiveFootballOddsSync } from "./liveFootballOddsSync.js";
import { runPropLineLiveTennisOddsSync } from "./liveTennisOddsSync.js";
import {
  buildBasketballLiveFromPropLine,
  buildHockeyLiveFromPropLine,
  buildBaseballLiveFromPropLine,
} from "../../routes/matches.js";
// Node's global `WebSocket` only became stable/enabled by default in Node
// 22 (experimental/off in 20/21); production pins Node 20.18.0. Same real
// bug already hit and fixed for api-tennis/GOAL API/PulseScore's WS
// clients in this codebase — import the class explicitly from `ws`
// instead of relying on the runtime global.
import { WebSocket as WsClient } from "ws";

type SportGroup = "football" | "tennis" | "basketball" | "hockey" | "baseball";

function sportGroupFor(sportKey: string | undefined): SportGroup | null {
  if (!sportKey) return null;
  if (sportKey.startsWith("soccer_")) return "football";
  if (sportKey === "tennis") return "tennis";
  if (sportKey.startsWith("basketball_")) return "basketball";
  if (sportKey.startsWith("hockey_")) return "hockey";
  if (sportKey.startsWith("baseball_")) return "baseball";
  return null;
}

// Basketball/hockey/baseball have no lighter standalone odds-only sync
// (unlike football/tennis) — their PropLine builder is simultaneously the
// match-state discoverer (via /scores) and the odds patcher, so waking it
// early just means running the exact same full sync sooner, the same
// "wake up, then re-fetch over REST" pattern GOAL API's WS client already
// uses. Never throws — same defensive wrapping every trigger here needs,
// since this runs on a WS message handler with no caller to report to.
const TRIGGERS: Record<SportGroup, () => Promise<unknown>> = {
  football: () => runPropLineLiveFootballOddsSync(),
  tennis: () => runPropLineLiveTennisOddsSync(),
  basketball: () => buildBasketballLiveFromPropLine(),
  hockey: () => buildHockeyLiveFromPropLine(),
  baseball: () => buildBaseballLiveFromPropLine(),
};

// Debounced per sport group — a single live match can fire dozens of
// line_movement events per minute (327 tennis events / 90s measured in
// production verification 2026-09-19); triggering a REST resync per event
// would be a request storm. This coalesces a burst into one resync shortly
// after it starts, never more than once per DEBOUNCE_MS per sport.
const DEBOUNCE_MS = 2_000;
const pendingTriggers = new Map<SportGroup, ReturnType<typeof setTimeout>>();

function scheduleTrigger(group: SportGroup): void {
  if (pendingTriggers.has(group)) return;
  const timer = setTimeout(() => {
    pendingTriggers.delete(group);
    TRIGGERS[group]().catch((err) => {
      logger.error({ err, group }, "[propline-ws] wake-up trigger failed");
    });
  }, DEBOUNCE_MS);
  pendingTriggers.set(group, timer);
}

let ws: WsClient | null = null;
let connected = false;
let retryDelayMs = 2_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;
let lastFrameAt = 0;
let lastError: string | null = null;
let webhookId: number | null = null;
let cursor = 0;
let eventCount = 0;

/** Reuses an existing unfiltered websocket-transport webhook if one already
 * exists (avoids leaking a new webhook — hence a new row against the
 * 10-webhook quota — on every server restart), otherwise creates one. */
async function findOrCreateWebhook(): Promise<number> {
  try {
    const existing = await propline.client.listWebhooks();
    const reusable = existing.find((w) => w.transport === "websocket" && !w.filter_sport_key);
    if (reusable) return reusable.id;
  } catch (err) {
    logger.warn({ err }, "[propline-ws] listWebhooks failed — creating a new webhook");
  }
  const created = await propline.client.createWebsocketWebhook();
  return created.id;
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
  if (!CONFIG.PROPLINE_API_KEY || connected || webhookId == null) return;

  let socket: WsClient;
  try {
    socket = new WsClient(`${CONFIG.PROPLINE_WS_URL}/v1/stream`);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        type: "auth",
        api_key: CONFIG.PROPLINE_API_KEY,
        webhook_id: webhookId,
        since_seq: cursor,
      }),
    );
  });

  socket.on("message", (data) => {
    lastFrameAt = Date.now();
    let msg: { type?: string; seq?: number; event_type?: string; sport_key?: string; data?: unknown; [k: string]: unknown };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === "ready") {
      connected = true;
      retryDelayMs = 2_000;
      logger.info({ webhookId }, "[propline-ws] connected");
      return;
    }
    if (msg.type !== "event") return;
    if (typeof msg.seq === "number") cursor = msg.seq;
    eventCount++;
    const payload = msg.data as { sport_key?: string } | undefined;
    const group = sportGroupFor(payload?.sport_key);
    if (group) scheduleTrigger(group);
  });

  socket.on("close", (code) => {
    connected = false;
    ws = null;
    logger.warn({ code, retryMs: retryDelayMs }, "[propline-ws] closed — reconnecting");
    scheduleReconnect();
  });

  socket.on("error", () => {
    connected = false;
    ws = null;
    // "close" always follows "error" for WebSocket — reconnect is scheduled there.
  });
}

/** Call once at server startup, gated on CONFIG.PROPLINE_API_KEY being set. */
export async function startPropLineWebSocket(): Promise<void> {
  if (!CONFIG.PROPLINE_API_KEY || startedOnce) return;
  startedOnce = true;
  try {
    webhookId = await findOrCreateWebhook();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[propline-ws] failed to obtain a websocket webhook — staying on REST polling only");
    return;
  }
  connect();
}

export function getPropLineWsStatus(): {
  connected: boolean;
  webhookId: number | null;
  cursor: number;
  eventCount: number;
  lastFrameAgeMs: number | null;
  lastError: string | null;
} {
  return {
    connected,
    webhookId,
    cursor,
    eventCount,
    lastFrameAgeMs: lastFrameAt ? Date.now() - lastFrameAt : null,
    lastError,
  };
}
