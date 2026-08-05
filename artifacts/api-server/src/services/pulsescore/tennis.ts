// Tennis live odds from PulseScore, polled via REST — replaces the earlier
// WebSocket-based approach (tennisWs.ts, removed 2026-08-05). The WS
// connection's URL/auth shape (wss://.../v3/bet365/ws/live?key=...&sport=tennis)
// was never confirmed against real PulseScore data: no "connected" frame or
// live event was ever observed through it, unlike every REST endpoint in
// this integration (football, MMA, leagues), each individually verified
// against a real authenticated response before being trusted. REST is the
// same bookmaker-poll pattern already proven to work everywhere else.
//
// Shares the bet365 bookmaker with football.ts (the only bookmaker
// confirmed to carry tennis, via the real /tennis/leagues sample that
// revealed the DRAW_NO_BET market) rather than a distinct bookmaker prefix
// like basketball/hockey/baseball/volleyball use — picking an unconfirmed
// bookmaker name for tennis would repeat the exact mistake this integration
// keeps having to correct. Since bet365's PRO-plan budget is 1 req/s shared
// with football, this polls at a slightly longer interval than football's
// 1000ms to reduce (not eliminate) collision — an occasional 429 just means
// serving the last good cache for that tick, not a crash (same
// catch-and-fall-back shape as every other PulseScore fetch here).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
  type PulseScoreEvent,
  type PulseScoreMarket,
  type PulseScoreLiveEventsResponse,
} from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

const TENNIS_LIVE_TTL_MS = 1_500;

let cache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<PulseScoreEvent[]> | null = null;

let requestsToday = 0;
let usageDate = todayUtc();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollUsageDateIfNeeded(): void {
  const d = todayUtc();
  if (d !== usageDate) {
    usageDate = d;
    requestsToday = 0;
  }
}

export function getPulseScoreTennisUsage(): { requestsToday: number; date: string } {
  rollUsageDateIfNeeded();
  return { requestsToday, date: usageDate };
}

async function fetchTennisLive(): Promise<PulseScoreEvent[]> {
  rollUsageDateIfNeeded();
  requestsToday += 1;
  try {
    const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
      "/live-events?sport=tennis&limit=200",
    );
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

/** Live tennis odds from PulseScore (bet365, normalized). Empty array if
 * PULSESCORE_API_KEY isn't configured yet or the upstream call fails. */
export async function getPulseScoreTennisLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];

  const now = Date.now();
  if (cache && now - cache.fetchedAt < TENNIS_LIVE_TTL_MS) return cache.events;

  if (!inFlight) {
    inFlight = fetchTennisLive()
      .then((events) => {
        cache = { events, fetchedAt: Date.now() };
        return events;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// ── match_winner → our own odds shape ───────────────────────────────────────
// Verified against a real GET /tennis/leagues call (2026-08-05): tennis's
// match-winner market uses canonicalMarket "DRAW_NO_BET" (makes sense — no
// draw outcome in tennis), rawName is just "main". "MATCH_RESULT"/
// "match_winner" kept as fallbacks in case a different tennis market (e.g. a
// genuinely live/in-play one, not yet observed) uses them instead. This
// mapping carried over unchanged from the old WS implementation — it was
// verified against real data independently of the WS-vs-REST transport.
export type PulseScoreTennisOverride = { odds?: { home: number; away: number } };

const seenUnknownMarkets = new Set<string>();
const seenMatchWinnerPeriods = new Set<string>();

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
}

function isMatchWinnerMarket(market: PulseScoreMarket): boolean {
  const isFulltime = (market.period || "").toUpperCase() === "FULL_TIME";
  return (
    isFulltime &&
    (market.canonicalMarket === "DRAW_NO_BET" ||
      market.canonicalMarket === "MATCH_RESULT" ||
      market.canonicalMarket === "match_winner")
  );
}

/** Builds a market override from one PulseScore tennis event's match-winner
 * market. `ev` is the event whose own odds are wanted — call this directly
 * on the event you already have, not via a fuzzy name search over the whole
 * live list (that turned football's equivalent function O(n²) — see
 * football.ts's extractFootballOverride comment for the full story). */
export function extractTennisOverride(ev: PulseScoreEvent): PulseScoreTennisOverride {
  const matchWinnerMarkets = (ev.markets ?? []).filter(isMatchWinnerMarket);
  for (const m of ev.markets ?? []) {
    if (matchWinnerMarkets.includes(m)) continue;
    if (!seenUnknownMarkets.has(m.canonicalMarket)) {
      seenUnknownMarkets.add(m.canonicalMarket);
      logger.info(
        { canonicalMarket: m.canonicalMarket, rawName: m.rawName },
        "[pulsescore] unmapped tennis canonicalMarket seen — candidate to add to the override mapping",
      );
    }
  }
  // If more than one match_winner-shaped market shows up (e.g. per-set odds
  // alongside the overall match), skip rather than risk mixing them up —
  // same conservative approach as the old WS implementation.
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

/** Finds the PulseScore tennis event matching a tracked match by player name
 * (tolerant cross-provider match) and returns its market override, if any.
 * `events` should be one already-fetched getPulseScoreTennisLive() batch —
 * never call this per-match, it would blow the shared bet365 rate limit. */
export function findPulseScoreTennisOverride(
  home: string,
  away: string,
  events: PulseScoreEvent[],
): PulseScoreTennisOverride | null {
  const ev = events.find(
    (e) => teamNamesMatch(home, e.home) && teamNamesMatch(away, e.away),
  );
  if (!ev) return null;
  const override = extractTennisOverride(ev);
  return override.odds ? override : null;
}
