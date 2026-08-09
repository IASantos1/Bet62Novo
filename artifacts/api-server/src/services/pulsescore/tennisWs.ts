// Tennis live odds from PulseScore via WebSocket — CURRENTLY DORMANT.
// startPulseScoreTennisWs() below is fully wired but has zero call sites;
// nothing in this codebase invokes it. This module is kept only in case
// tennis gets the PRO plan's single concurrent WS connection back.
//
// History: originally the WS connection was dedicated to tennis
// specifically because point-by-point pricing benefits most from push
// updates. First attempt (2026-08-05) never produced a single confirmed
// frame — no "connected" frame, no live event, nothing (see git history
// commit ede487a). Reintroduced 2026-08-07 against PulseScore's own
// published connection-pattern documentation: wss://api.pulsescore.net/api/
// {bookmaker}/ws/live?key=...&sport=..., bet365 using the versioned
// /api/v3/bet365 prefix — exactly what pulseScoreWsUrl() in client.ts
// already builds, unchanged since the first attempt. That doc confirmed the
// URL shape was already right; it didn't explain why no frames had arrived
// the first time, so tennis.ts's getPulseScoreTennisLive() was written to
// only trust this source while a frame had actually arrived within
// TENNIS_WS_FRESHNESS_MS (tennisWsIsFresh below) — a bare open `connected`
// socket was not enough, so a repeat of the first attempt's silent failure
// would degrade to the REST poller instead of going dark.
//
// The PRO plan only allows one concurrent WS connection, and it was moved
// to football on 2026-08-08 (explicit user decision — football's live
// clock/score, particularly for lower-coverage matches, was what was
// actually causing complaints; see footballWs.ts's header). Tennis has
// been REST-only since, via tennis.ts's getPulseScoreTennisLive().
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

// Same "count our own usage" reasoning as the REST pollers — PulseScore has
// no usage-lookup endpoint, so track frames received (~1/s while connected)
// ourselves, resetting at UTC midnight.
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

// A real tennis match can never have a three-way (1X2) market — there's no
// draw in tennis. Seen in production (2026-08-08): a football match got
// broadcast on this tennis-subscribed socket with ev.sport itself already
// stamped "tennis" (mistagged upstream, not just missing) — which passes
// the exact-tag check below outright — and rendered on the live page with
// tennis's set-score format and two-way odds instead of 1X2. Since the tag
// can't be trusted at all in that case, this checks the market shape
// instead: any DRAW selection anywhere in the event's markets is
// impossible for real tennis and a certain sign of contamination.
export function hasDrawMarket(ev: PulseScoreEvent): boolean {
  return (ev.markets ?? []).some((m) =>
    (m.selections ?? []).some((s) => s.canonicalOutcome === "DRAW"),
  );
}

// hasDrawMarket() only catches contamination from sports that happen to
// have a draw outcome. Seen in production (2026-08-08, same day):  an MLB
// baseball match leaked through too — baseball moneylines have no draw
// either, so that check alone let it through. Excluding one bad sport at a
// time after each new leak is a losing game (football, esoccer,
// ebasketball, table tennis, now baseball — all through this one socket).
// Flip it around: confirm the league name actually looks like a tennis
// tour instead of trying to list every sport it isn't. Built from every
// real tennis league name seen in production sampling (ATP/WTA tour,
// UTR Pro, ITF's M##/W## money-tier naming, Challenger) — logs a warning
// on rejection instead of silently dropping so a genuine tour naming
// convention this misses can be added instead of guessed at.
const TENNIS_LEAGUE_PATTERN =
  /^(ATP|WTA|ITF|UTR(\s+Pro)?|Challenger|Boys?|Girls?|Wimbledon|Roland\s+Garros|French\s+Open|US\s+Open|Australian\s+Open|Grand\s+Slam|Davis\s+Cup|Billie\s+Jean\s+King\s+Cup|Laver\s+Cup|Next\s+Gen|Exhibition|M\d{2}|W\d{2})\b/i;

export function looksLikeTennisLeague(league: string | undefined): boolean {
  if (!league) return false;
  return TENNIS_LEAGUE_PATTERN.test(league.trim());
}

// Confirmed live in production (2026-08-07): the WS connection is shared/
// multiplexed per bookmaker, not actually scoped to the sport in the
// subscription URL — broadcast frames for OTHER sports (soccer/esoccer
// first, then ebasketball) arrive on this same tennis-subscribed socket
// and, without this filter, got merged straight into liveByEventId and
// served as tennis matches (wrong icon, wrong score format on the live
// page). The first version of this filter only rejected an explicitly
// WRONG sport tag (`sport && sport !== "tennis"`) — the leaked
// ebasketball events got through it because they arrive with sport
// missing/empty rather than mistagged. Now requires an exact "tennis"
// match on both frame.sport and each event's own ev.sport — anything
// without that exact tag is dropped, not just anything with a
// conflicting one. hasDrawMarket() catches the remaining case: an event
// mistagged "tennis" already at the source, which the exact-tag check
// alone can't see.
function applyFrame(frame: BroadcastFrame): void {
  lastFrameAt = Date.now();
  rollUsageDateIfNeeded();
  framesToday += 1;
  if (frame.sport !== "tennis") return;
  const seenIds = new Set<string>();
  for (const ev of frame.data ?? []) {
    if (!ev?.eventId) continue;
    if (ev.sport !== "tennis") continue;
    if (hasDrawMarket(ev)) {
      logger.warn(
        { eventId: ev.eventId, home: ev.home, away: ev.away, league: ev.league },
        "[pulsescore] tennis WS event has a draw market — dropping as mistagged non-tennis contamination",
      );
      continue;
    }
    if (!looksLikeTennisLeague(ev.league)) {
      logger.warn(
        { eventId: ev.eventId, home: ev.home, away: ev.away, league: ev.league },
        "[pulsescore] tennis WS event's league doesn't match a known tennis tour naming pattern — dropping as likely non-tennis contamination",
      );
      continue;
    }
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

  // Kept in sync with tennis.ts's TENNIS_BOOKMAKER (bet365 — briefly bwin on
  // 2026-08-09, reverted same day, see tennis.ts's header) — if this ever
  // gets reactivated, connecting to a different bookmaker than the REST
  // poller would silently produce inconsistent event IDs.
  const url = pulseScoreWsUrl("tennis", "bet365");
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

/** Call once at server startup to use tennis's WS connection. Not currently
 * called anywhere — the PRO plan's single WS connection is presently given
 * to football instead (see startPulseScoreFootballWs in footballWs.ts).
 * Safe to call even without an API key yet — it's a no-op until
 * PULSESCORE_API_KEY is set (nothing to retry-loop). */
export function startPulseScoreTennisWs(): void {
  if (startedOnce) return;
  startedOnce = true;
  connect();
}

/** Live tennis events from the last WebSocket frame (~1s old at most while
 * connected). Empty until connected or if no tennis matches are currently
 * live upstream. */
export function getTennisWsEvents(): PulseScoreEvent[] {
  return [...liveByEventId.values()];
}

/** True only if a frame has actually arrived within maxAgeMs — deliberately
 * NOT just `connected`, since a socket can sit open without ever pushing
 * real data (exactly what happened the first time this was tried). Callers
 * should fall back to REST whenever this is false. */
export function tennisWsIsFresh(maxAgeMs: number): boolean {
  return connected && lastFrameAt > 0 && Date.now() - lastFrameAt < maxAgeMs;
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
