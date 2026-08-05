// Tennis live odds from PulseScore via WebSocket — chosen over REST for
// tennis specifically because point-by-point pricing benefits most from
// push updates, and the PRO plan only allows one concurrent WS connection
// (so it's this sport or football, not both; football uses REST instead,
// see football.ts). Mirrors the reconnect-with-backoff shape already used
// for the SportsAPI Pro V1 WebSocket clients in routes/matches.ts.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { pulseScoreWsUrl, type PulseScoreEvent } from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

let ws: WebSocket | null = null;
let connected = false;
let retryDelayMs = 5_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let startedOnce = false;

const liveByEventId = new Map<string, PulseScoreEvent>();
let lastFrameAt = 0;

// Same "count our own usage" reasoning as football.ts — PulseScore has no
// usage-lookup endpoint, so track frames received (~1 per second while
// connected) ourselves, resetting at UTC midnight.
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

// ── match_winner → our own odds shape ───────────────────────────────────────
// Same reasoning as football.ts: the docs only document match_winner and
// total_goals by example, and total_goals is soccer-specific (goals) — there's
// no tennis example at all, so only the moneyline (match_winner, 2 selections,
// no draw) is mapped here. Anything else seen in real WS frames is logged
// once instead of guessed at, same self-discovery approach as football.ts.
export type PulseScoreTennisOverride = { odds?: { home: number; away: number } };

const seenUnknownMarkets = new Set<string>();
const seenMatchWinnerPeriods = new Set<string>();

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
}

function extractTennisOverride(ev: PulseScoreEvent): PulseScoreTennisOverride {
  // "match_winner" was never observed in a real call (verified against
  // bet365/football, 2026-08-05) — real data used canonicalMarket
  // "MATCH_RESULT" or "OTHER" with rawName "Fulltime Result" instead. Not
  // verified for tennis specifically, so keep both as candidates.
  const isFulltime = (period: string) => (period || "").toUpperCase() === "FULL_TIME";
  const matchWinnerMarkets = (ev.markets ?? []).filter(
    (m) =>
      isFulltime(m.period) &&
      (m.canonicalMarket === "MATCH_RESULT" || m.canonicalMarket === "match_winner"),
  );
  for (const m of (ev.markets ?? [])) {
    if (matchWinnerMarkets.includes(m)) continue;
    if (!seenUnknownMarkets.has(m.canonicalMarket)) {
      seenUnknownMarkets.add(m.canonicalMarket);
      logger.info(
        { canonicalMarket: m.canonicalMarket, rawName: m.rawName },
        "[pulsescore] unmapped tennis canonicalMarket seen — candidate to add to the override mapping",
      );
    }
  }
  // No tennis example in the docs for how `period` is labelled on the
  // moneyline (soccer uses "fulltime") — if more than one match_winner
  // market shows up (e.g. one for the match, one per set), we can't safely
  // tell which is which yet, so skip rather than risk showing set odds as
  // match odds. Log the period values seen so this can be resolved from
  // real data instead of a guess.
  if (matchWinnerMarkets.length !== 1) {
    for (const m of matchWinnerMarkets) {
      const key = m.period || "(no period)";
      if (!seenMatchWinnerPeriods.has(key)) {
        seenMatchWinnerPeriods.add(key);
        logger.info(
          { period: m.period, count: matchWinnerMarkets.length },
          "[pulsescore] tennis match_winner period seen — multiple candidates, needs disambiguation",
        );
      }
    }
    return {};
  }
  const market = matchWinnerMarkets[0]!;
  let home: number | null = null;
  let away: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") home = val;
    else if (sel.canonicalOutcome === "AWAY") away = val;
    else if (teamNamesMatch(sel.rawName, ev.home)) home = val;
    else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
  }
  return home !== null && away !== null ? { odds: { home, away } } : {};
}

/** Finds the PulseScore tennis event matching a tracked match by player
 * name (tolerant cross-provider match) and returns its market override, if
 * any. Reads from the WS-pushed cache directly — no network call. */
export function findPulseScoreTennisOverride(
  home: string,
  away: string,
): PulseScoreTennisOverride | null {
  const ev = [...liveByEventId.values()].find(
    (e) => teamNamesMatch(home, e.home) && teamNamesMatch(away, e.away),
  );
  if (!ev) return null;
  const override = extractTennisOverride(ev);
  return override.odds ? override : null;
}

export function pulseScoreTennisWsStatus(): {
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
