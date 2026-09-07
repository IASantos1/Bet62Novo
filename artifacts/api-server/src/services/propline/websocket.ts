// PropLine real-time push over websocket — unlocked by the account's
// Streaming plan ($79/mo, confirmed active 2026-09-07: /best-line returned
// real Hobby+ data instead of an upgrade_required error). Mirrors this
// codebase's existing PulseScore WS pattern (services/pulsescore/footballWs.ts)
// for connect/backoff/reconnect, adapted to PropLine's actual protocol:
//
//   1. A "subscription" (webhook row) must exist first — POST /v1/webhooks
//      with transport:"websocket" returns {id, secret, ...}; GET /v1/webhooks
//      lists existing ones (secret masked) so a restart can reuse the same
//      row instead of creating a new one every time.
//   2. Connect to wss://ws.prop-line.com/v1/stream, then send
//      {type:"auth", api_key, webhook_id, since_seq} — NOT a query-param or
//      header auth like every REST call.
//   3. Server replies {type:"ready", webhook_id, latest_seq, truncated}, then
//      {type:"event", seq, event_type, data} frames and periodic {type:"ping"}.
//
// This module does NOT try to apply each event's diff onto our own odds
// cache (PropLine's line_movement payload shape for an arbitrary sport
// hasn't been confirmed against a real sample yet) — it only uses the
// event as a signal to invalidate that sport's /odds cache entry
// (common.ts), so the next poll (already running every live tick) fetches
// fresh data immediately instead of waiting out the up-to-90s TTL. Safer
// first step than trusting an unconfirmed payload shape to mutate state
// directly; worth revisiting once a real line_movement sample is seen.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { propLineGet, propLinePost } from "./client.js";
import { invalidatePropLineOddsCache } from "./common.js";
import { PROPLINE_FOOTBALL_SPORT_KEYS } from "./football.js";
import { PROPLINE_BASKETBALL_SPORT_KEYS } from "./basketball.js";
import { PROPLINE_HOCKEY_SPORT_KEYS } from "./hockey.js";
import { PROPLINE_BASEBALL_SPORT_KEYS } from "./baseball.js";
import { PROPLINE_TENNIS_SPORT_KEYS } from "./tennis.js";
import { PROPLINE_VOLLEYBALL_SPORT_KEYS } from "./volleyball.js";
import { PROPLINE_MMA_SPORT_KEYS } from "./mma.js";

const WATCHED_SPORT_KEYS = [
  ...PROPLINE_FOOTBALL_SPORT_KEYS,
  ...PROPLINE_BASKETBALL_SPORT_KEYS,
  ...PROPLINE_HOCKEY_SPORT_KEYS,
  ...PROPLINE_BASEBALL_SPORT_KEYS,
  ...PROPLINE_TENNIS_SPORT_KEYS,
  ...PROPLINE_VOLLEYBALL_SPORT_KEYS,
  ...PROPLINE_MMA_SPORT_KEYS,
];

type PropLineWebhook = {
  id: number;
  transport?: "http" | "websocket";
  events: string[];
  filter_sport_key?: string | null;
  active: boolean;
};

type PropLineLineMovementEvent = {
  event_type: "line_movement" | "resolution" | "steam" | "market_suspended";
  sport_key?: string;
  event?: { id?: string | number };
  [k: string]: unknown;
};

let webhookId: number | null = null;
let socket: WebSocket | null = null;
let connected = false;
let retryDelayMs = 2_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;
let lastFrameAt = 0;
let sinceSeq = 0;

/** Finds an existing websocket subscription for our sport-key filter, or
 * creates one. Idempotent across restarts as long as the filter string
 * stays byte-identical — if the curated sport-key lists change, a NEW
 * subscription is created (old one just sits unused; PropLine's own docs
 * don't document a "find or update" primitive here, only PATCH by id,
 * which needs the id we're trying to discover in the first place). */
async function ensureWebhookSubscription(): Promise<number | null> {
  const filterSportKey = WATCHED_SPORT_KEYS.join(",");
  try {
    const existing = await propLineGet<PropLineWebhook[]>("/webhooks");
    const match = existing.find(
      (w) => w.transport === "websocket" && w.active && w.filter_sport_key === filterSportKey,
    );
    if (match) return match.id;
  } catch (err) {
    logger.warn({ err }, "[propline] failed to list existing webhooks — will try creating one");
  }
  try {
    const created = await propLinePost<{ id: number }>("/webhooks", {
      transport: "websocket",
      events: ["line_movement", "market_suspended", "resolution"],
      filter_sport_key: filterSportKey,
      batch_max: 50,
    });
    logger.info({ id: created.id }, "[propline] created websocket subscription");
    return created.id;
  } catch (err) {
    logger.error({ err }, "[propline] failed to create websocket subscription");
    return null;
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

function handleEvent(msg: { type: string; seq?: number; event_type?: string; data?: PropLineLineMovementEvent }): void {
  lastFrameAt = Date.now();
  if (typeof msg.seq === "number") sinceSeq = msg.seq;
  if (msg.type !== "event") return;
  const sportKey = msg.data?.sport_key;
  if (sportKey && WATCHED_SPORT_KEYS.includes(sportKey)) {
    invalidatePropLineOddsCache(sportKey);
  }
}

function connect(): void {
  if (!CONFIG.ENABLE_PROPLINE) return;
  if (!CONFIG.PROPLINE_API_KEY) return;
  if (connected) return;
  if (webhookId == null) {
    ensureWebhookSubscription().then((id) => {
      if (id == null) {
        scheduleReconnect();
        return;
      }
      webhookId = id;
      connect();
    });
    return;
  }

  let ws: WebSocket;
  try {
    ws = new WebSocket("wss://ws.prop-line.com/v1/stream");
  } catch {
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.addEventListener("open", () => {
    ws.send(
      JSON.stringify({
        type: "auth",
        api_key: CONFIG.PROPLINE_API_KEY,
        webhook_id: webhookId,
        since_seq: sinceSeq,
      }),
    );
  });

  ws.addEventListener("message", (evt) => {
    try {
      const msg = JSON.parse(typeof evt.data === "string" ? evt.data : String(evt.data));
      if (msg.type === "ready") {
        connected = true;
        retryDelayMs = 2_000;
        lastFrameAt = Date.now();
        if (msg.truncated) {
          // Events since our cursor already expired — our REST polling is
          // the source of truth anyway, so there's nothing to resync here
          // beyond letting normal polling continue.
          logger.warn({ webhookId }, "[propline] websocket resumed with truncated backlog");
        }
        logger.info({ webhookId, latestSeq: msg.latest_seq }, "[propline] websocket connected");
        return;
      }
      if (msg.type === "event" || msg.type === "batch") {
        if (msg.type === "batch" && Array.isArray(msg.events)) {
          for (const e of msg.events) handleEvent({ type: "event", seq: e.delivery_id, ...e });
        } else {
          handleEvent(msg);
        }
        return;
      }
      // "ping" or anything else — just counts as a liveness signal.
      lastFrameAt = Date.now();
    } catch {
      // non-JSON — ignore
    }
  });

  ws.addEventListener("close", (evt) => {
    connected = false;
    socket = null;
    const code = (evt as { code?: number }).code;
    // 4401/4403/4404/4429 are documented as non-retryable (bad key, tier/
    // paused, subscription doesn't exist, connection cap).
    const nonRetryable = code !== undefined && [4401, 4403, 4404, 4429].includes(code);
    if (nonRetryable) {
      logger.error({ code }, "[propline] websocket closed (non-retryable)");
      return;
    }
    logger.warn({ code, retryMs: retryDelayMs }, "[propline] websocket closed — reconnecting");
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    connected = false;
    socket = null;
  });
}

/** Call once at server startup. Safe even without a key/flag yet. */
export function startPropLineWebSocket(): void {
  if (!CONFIG.ENABLE_PROPLINE) return;
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

export function propLineWebSocketStatus(): {
  connected: boolean;
  webhookId: number | null;
  lastFrameAgeMs: number | null;
  sinceSeq: number;
} {
  return {
    connected,
    webhookId,
    lastFrameAgeMs: lastFrameAt > 0 ? Date.now() - lastFrameAt : null,
    sinceSeq,
  };
}
