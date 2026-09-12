// api-tennis.com — inbound WebSocket push for live events + point by
// point, confirmed real 2026-09-09: wss://wss.api-tennis.com/live?APIkey=...
// (optional tournament_key/match_key/player_key/timezone filters — left
// unset here since this connects once for every live match, the same
// scope REST get_livescore() already covers; the socket only exists to cut
// the latency on top of that poll, never to replace it).
//
// Unlike GOAL API's WS client (services/goalapi/websocketClient.ts), which
// deliberately treats every push as just a "something changed, go
// re-fetch over REST" signal because its exact match_update field names
// were never confirmed against a real message, api-tennis.com's push
// payload is the SAME ApiTennisMatch DTO the REST client already fully
// types (confirmed by the docs' own example, field for field) — so this
// trusts it directly as live match state instead of using it as a wakeup.
// buildTennisLiveFromApiTennis (routes/matches.ts) still starts from the
// REST get_livescore() list on every poll tick and only substitutes a
// fresher WS snapshot where one exists, so a disconnected/lagging socket
// degrades to exactly today's pure-REST behavior — never a hard dependency.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { ApiTennisMatch } from "./index.js";
// Node's global `WebSocket` client only became stable/enabled by default in
// Node 22 (experimental and off-by-default in 20/21). Production pins Node
// 20.18.0 (.nvmrc) — confirmed real 2026-09-10: PulseScore's WS client
// (same bare-global pattern this file used) threw "WebSocket is not
// defined" the first time it tried to connect there. Unlike GOAL API's WS
// (dormant while its cap is 0), this one connects on every server start
// whenever TENNIS_API_KEY is set, so it was likely actively broken in
// production. Import the class explicitly from the `ws` package (already
// a dependency, used the same way for the server side in
// routes/matches.ts) instead of relying on a runtime global that may not
// exist.
import { WebSocket as WsClient } from "ws";

let ws: WsClient | null = null;
let connected = false;
let retryDelayMs = 2_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;
let lastFrameAt = 0;
let lastError: string | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;

const CACHE_STALE_MS = 2 * 60 * 60 * 1000; // 2h — well past any real match's duration

const liveCache = new Map<string, { data: ApiTennisMatch; updatedAt: number }>();

function pruneStaleEntries(): void {
  const cutoff = Date.now() - CACHE_STALE_MS;
  for (const [key, entry] of liveCache.entries()) {
    if (entry.updatedAt < cutoff) liveCache.delete(key);
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
  if (!CONFIG.TENNIS_API_KEY || connected) return;

  let socket: WsClient;
  try {
    const url = `${CONFIG.TENNIS_API_WS_URL}?APIkey=${encodeURIComponent(CONFIG.TENNIS_API_KEY)}`;
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
    logger.info("[api-tennis-ws] connected");
  });

  socket.on("message", (data) => {
    lastFrameAt = Date.now();
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return; // non-JSON keepalive frame — ignore
    }
    const matches = Array.isArray(parsed) ? parsed : [parsed];
    const now = Date.now();
    for (const raw of matches) {
      const match = raw as Partial<ApiTennisMatch> | null;
      if (!match || match.event_key == null) continue;
      liveCache.set(String(match.event_key), { data: match as ApiTennisMatch, updatedAt: now });
    }
  });

  socket.on("close", (code) => {
    connected = false;
    ws = null;
    logger.warn({ code, retryMs: retryDelayMs }, "[api-tennis-ws] closed — reconnecting");
    scheduleReconnect();
  });

  socket.on("error", () => {
    connected = false;
    ws = null;
    // "close" always follows "error" for WebSocket — reconnect is scheduled there.
  });
}

/** Call once at server startup, gated on CONFIG.TENNIS_API_KEY being set. */
export function startApiTennisWebSocket(): void {
  if (!CONFIG.TENNIS_API_KEY || startedOnce) return;
  startedOnce = true;
  connect();
  if (!pruneTimer) pruneTimer = setInterval(pruneStaleEntries, 15 * 60_000);
}

/** Freshest known state for a live match, pushed via WebSocket —
 * undefined if the socket hasn't seen this event_key yet (match not live,
 * too new, or the socket is disconnected/catching up). Callers must fall
 * back to the REST get_livescore() entry when this returns undefined;
 * absence here is never evidence the match isn't live. */
export function getApiTennisWsMatch(eventKey: string | number): ApiTennisMatch | undefined {
  return liveCache.get(String(eventKey))?.data;
}

export function getApiTennisWsStatus(): {
  connected: boolean;
  cachedMatches: number;
  lastFrameAgeMs: number | null;
  lastError: string | null;
  cachedMatchSamples: Array<{
    eventKey: string;
    players: string;
    eventGameResult: string | null;
    ageMs: number;
  }>;
} {
  const now = Date.now();
  return {
    connected,
    cachedMatches: liveCache.size,
    lastFrameAgeMs: lastFrameAt ? now - lastFrameAt : null,
    lastError,
    // Added 2026-09-12 alongside the /apitennis-ws-status endpoint — lets a
    // caller directly compare a WS-covered match's event_game_result age
    // against a same-instant REST get_livescore poll for the SAME match,
    // to confirm the WS is actually faster rather than just assuming it
    // from cachedMatches growing (a slow-but-real event-driven push would
    // look identical to a broken one from that count alone).
    cachedMatchSamples: [...liveCache.entries()].map(([eventKey, entry]) => ({
      eventKey,
      players: `${entry.data.event_first_player ?? "?"} vs ${entry.data.event_second_player ?? "?"}`,
      eventGameResult: entry.data.event_game_result ?? null,
      ageMs: now - entry.updatedAt,
    })),
  };
}
