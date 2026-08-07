// Football live odds from PulseScore, polled via REST. Tennis (tennis.ts)
// shares this same bet365 bookmaker rather than the WebSocket originally
// planned for it — see tennis.ts for why.
// Same in-process cache + in-flight-dedup shape already used throughout
// matches.ts for other ~1s live polls (e.g. TENNIS_LIVE_V1_TTL).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
  pulseScoreGetWithRetry,
  type PulseScoreEvent,
  type PulseScoreMarket,
  type PulseScoreLiveEventsResponse,
} from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

const FOOTBALL_LIVE_TTL_MS = 1_000; // matches the PRO plan's 1 req/s rate limit

let cache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<PulseScoreEvent[]> | null = null;

// PulseScore has no equivalent of Statpal's /user-request-count endpoint to
// query usage from their side, so we count our own outbound calls instead —
// resets at UTC midnight, same "requests today" shape the Statpal usage
// admin card already shows.
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

export function getPulseScoreFootballUsage(): {
  requestsToday: number;
  date: string;
} {
  rollUsageDateIfNeeded();
  return { requestsToday, date: usageDate };
}

async function fetchFootballLive(): Promise<PulseScoreEvent[]> {
  rollUsageDateIfNeeded();
  requestsToday += 1;
  // Response is a paginated wrapper ({ total, page, ..., events: [...] }),
  // not a bare array as the public docs' example showed — confirmed via a
  // real authenticated call. limit=200 comfortably covers real live-soccer
  // volume (18 events observed) in a single request within the 1 req/s
  // PRO-plan rate limit. Lets errors (429s from the shared bet365 budget,
  // timeouts, ...) propagate — see getPulseScoreFootballLive's .catch()
  // for why swallowing them here was a real bug, not a safety net.
  const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
    "/live-events?sport=soccer&limit=200",
  );
  return Array.isArray(data?.events) ? data.events : [];
}

/** Live football odds from PulseScore (bet365, normalized). Empty array if
 * PULSESCORE_API_KEY isn't configured yet, or the upstream call fails on
 * the very first attempt (nothing cached yet to fall back to). */
export async function getPulseScoreFootballLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];

  const now = Date.now();
  if (cache && now - cache.fetchedAt < FOOTBALL_LIVE_TTL_MS) return cache.events;

  if (!inFlight) {
    inFlight = fetchFootballLive()
      .then((events) => {
        cache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        // This used to swallow the error and return [] unconditionally —
        // a transient 429 (bet365's shared 1 req/s budget collides with
        // tennis's REST fallback, or a background prematch page fetch)
        // silently wiped the live football feed to "0 matches" with zero
        // trace anywhere. Log it and keep serving the last good cache
        // instead — only genuinely empty right after boot (cache null).
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] football live fetch failed — serving stale cache",
        );
        return cache?.events ?? [];
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// ── canonicalMarket → our own market shape ──────────────────────────────────
// PulseScore's docs only document two canonicalMarket values by example
// (match_winner, total_goals) — there's no exhaustive list. Rather than
// guess names for the rest (correctScore, handicap, btts, ...) and risk
// silently mis-mapping odds, only these two are wired in for now; any other
// canonicalMarket seen in real traffic is logged once (see
// recordUnknownCanonicalMarket below) so the mapping can be safely extended
// from what PulseScore actually sends, not from guesswork.
export type TotalGoalsOverride = Partial<{
  over05: number; under05: number;
  over15: number; under15: number;
  over25: number; under25: number;
  over35: number; under35: number;
  over45: number; under45: number;
  over55: number; under55: number;
  over65: number; under65: number;
}>;

export type PulseScoreFootballOverride = {
  odds?: { home: number; draw: number; away: number };
  totalGoals?: TotalGoalsOverride;
};

const TOTAL_GOALS_LINE_KEYS: Record<string, { over: keyof TotalGoalsOverride; under: keyof TotalGoalsOverride }> = {
  "0.5": { over: "over05", under: "under05" },
  "1.5": { over: "over15", under: "under15" },
  "2.5": { over: "over25", under: "under25" },
  "3.5": { over: "over35", under: "under35" },
  "4.5": { over: "over45", under: "under45" },
  "5.5": { over: "over55", under: "under55" },
  "6.5": { over: "over65", under: "under65" },
};

const seenUnknownMarkets = new Set<string>();
function recordUnknownCanonicalMarket(canonicalMarket: string): void {
  if (seenUnknownMarkets.has(canonicalMarket)) return;
  seenUnknownMarkets.add(canonicalMarket);
  logger.info(
    { canonicalMarket },
    "[pulsescore] unmapped football canonicalMarket seen — candidate to add to the override mapping",
  );
}

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
}

// Real bet365-normalized data (verified 2026-08-05) does NOT use the docs'
// documented "match_winner"/"total_goals" canonicalMarket values at all — a
// fulltime 1X2 market showed up as canonicalMarket "OTHER" with
// rawName "Fulltime Result", and goal totals as canonicalMarket
// "OVER_UNDER". Identify by rawName (case-insensitive) rather than trusting
// canonicalMarket alone, per PulseScore's own documented fallback guidance.
const MATCH_WINNER_RAW_NAMES = new Set([
  "fulltime result",
  "full time result",
  "match result",
  "1x2",
]);

function isMatchWinnerMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  if (market.canonicalMarket === "MATCH_RESULT") return true;
  return MATCH_WINNER_RAW_NAMES.has((market.rawName || "").toLowerCase());
}

function isTotalGoalsMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return market.canonicalMarket === "OVER_UNDER";
}

/** Builds a market override from one PulseScore event's fulltime match-
 * winner and total-goals markets. Returns an empty object (not null) when
 * the event has neither recognised yet — callers should only apply the
 * fields that are actually present. */
export function extractFootballOverride(ev: PulseScoreEvent): PulseScoreFootballOverride {
  const out: PulseScoreFootballOverride = {};
  for (const market of ev.markets ?? []) {
    if (isMatchWinnerMarket(market)) {
      let home: number | null = null;
      let draw: number | null = null;
      let away: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
        else if (sel.canonicalOutcome === "DRAW") draw = val;
        else if (teamNamesMatch(sel.rawName, ev.home)) home = val;
        else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
      }
      if (home !== null && draw !== null && away !== null) {
        out.odds = { home, draw, away };
      }
    } else if (isTotalGoalsMarket(market)) {
      // `line` lives per-selection here (not per-market as the docs
      // implied) — group selections by line, since one event can carry
      // several O/U lines as separate market entries or within one.
      const byLine = new Map<string, { over: number | null; under: number | null }>();
      for (const sel of market.selections ?? []) {
        if (!sel.isActive || sel.line === undefined) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const key = String(sel.line);
        const entry = byLine.get(key) ?? { over: null, under: null };
        if (sel.canonicalOutcome === "OVER") entry.over = val;
        else if (sel.canonicalOutcome === "UNDER") entry.under = val;
        byLine.set(key, entry);
      }
      for (const [line, { over, under }] of byLine) {
        const lineKeys = TOTAL_GOALS_LINE_KEYS[line];
        if (!lineKeys || over === null || under === null) continue;
        out.totalGoals = {
          ...out.totalGoals,
          [lineKeys.over]: over,
          [lineKeys.under]: under,
        };
      }
    } else {
      recordUnknownCanonicalMarket(market.canonicalMarket);
    }
  }
  return out;
}

/** Finds the PulseScore live event matching a tracked match by team name
 * (tolerant cross-provider match, same approach as the existing Statpal ↔
 * SportScore matcher) and returns its market override, if any. `events`
 * should be one already-fetched getPulseScoreFootballLive() batch — never
 * call this per-match, it would blow the 1 req/s PRO rate limit. */
export function findPulseScoreFootballOverride(
  home: string,
  away: string,
  events: PulseScoreEvent[],
): PulseScoreFootballOverride | null {
  const ev = events.find(
    (e) => teamNamesMatch(home, e.home) && teamNamesMatch(away, e.away),
  );
  if (!ev) return null;
  const override = extractFootballOverride(ev);
  return override.odds || override.totalGoals ? override : null;
}

/** Real match score, read from the {home,away} object (not the docs'
 * assumed "H-A" string) — verified against a real live call 2026-08-05. */
export function pulseScoreEventScore(
  ev: PulseScoreEvent,
): { home: number; away: number } | null {
  const h = Number(ev.score?.home);
  const a = Number(ev.score?.away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { home: h, away: a };
}

/** Live clock in minutes, read from the raw bet365 moreInfo.TM field — no
 * normalized "minute" field exists in this API. Confirmed against real live
 * matches (TM values of 92/68/45/90/71 line up with plausible real match
 * minutes); not documented anywhere, so treat as best-effort.
 *
 * bet365 sends stoppage time as "45+2"/"90+3" — plain Number() on that is
 * NaN, which silently froze the clock at 0 for whichever matches happened
 * to be in injury time (reported as "some clocks not working", since it's
 * only whichever matches are mid-stoppage-time at any given moment). Only
 * the base minute is taken; the "+N" part isn't surfaced separately since
 * the frontend clock just needs a monotonically increasing number. */
export function pulseScoreEventMinute(ev: PulseScoreEvent): number {
  const raw = ev.moreInfo?.TM;
  if (raw == null) return 0;
  const m = /^(\d+)/.exec(String(raw).trim());
  if (!m) return 0;
  const tm = Number(m[1]);
  return Number.isFinite(tm) && tm >= 0 ? tm : 0;
}

// ── Prematch (leagues catalog) ──────────────────────────────────────────────
// Verified against a real authenticated GET /api/v3/bet365/leagues call
// (2026-08-06) — this is the FOOTBALL leagues endpoint despite the bare path
// (no "football"/"soccer" segment in the URL, unlike tennis's /tennis/leagues
// or MMA's /mma/leagues) — confirmed by the Swagger description itself
// ("Veja todas as ligas de futebol") and every league/event in the real
// sample carrying sport:"soccer". Same paginated-leagues-with-nested-events
// envelope already confirmed for tennis/MMA (total/page/limit/totalPages/
// hasNextPage/leagues[]). league is "Country||League" (e.g. "Australia||
// Australia Queensland Premier League 3") — same format already handled by
// the live builder's countryForLeagueName/footballLeagueAllowedStrict, reused
// as-is here rather than writing a second parser.
//
// Events carry `startTime` (ISO) and `live` (bool) that the live-events
// PulseScoreEvent shape doesn't — extending it here rather than duplicating
// the whole type, so extractFootballOverride/the catalog filters all work on
// this unchanged. live:true events embedded in this catalog always showed
// markets:[] in the real sample (only /live-events carries live odds,
// already used above) — this endpoint is prematch-only in practice.
export type PulseScorePrematchEvent = PulseScoreEvent & {
  startTime: string;
  live: boolean;
};

type PulseScoreLeague = {
  name: string;
  sport: string;
  events: PulseScorePrematchEvent[];
  league: string;
  moreInfo?: {
    type?: string;
    live?: number;
    tournament?: string;
    leagueName?: string;
    updatedAtUTC?: number;
  };
  oddsSig?: string;
};

type PulseScoreLeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  leagues: PulseScoreLeague[];
};

// Prematch doesn't need second-level freshness like the live poller — a
// multi-minute cache keeps this well clear of bet365's shared 1 req/s budget.
const FOOTBALL_UPCOMING_TTL_MS = 5 * 60_000;
let upcomingCache: { events: PulseScorePrematchEvent[]; fetchedAt: number } | null = null;
let upcomingInFlight: Promise<PulseScorePrematchEvent[]> | null = null;

async function fetchAllFootballLeagues(): Promise<PulseScoreLeague[]> {
  const leagues: PulseScoreLeague[] = [];
  let page = 1;
  // Real sample: total 289 leagues at limit=30 (the documented max) -> ~10
  // pages. This shares bet365's rate budget with the live pollers (football
  // live 1 req/s + tennis live ~0.67 req/s on their own already), so pacing
  // this at 1.1s apart — as first written — meant it alone consumed nearly
  // an entire extra req/s for ~16s every FOOTBALL_UPCOMING_TTL_MS, on top of
  // that already-committed live traffic: exactly the kind of burst that
  // starves the live pollers into 429s/timeouts, which buildLivePayload()
  // then has no choice but to paper over with sportWithFallback's stale
  // snapshot — i.e. odds/score look frozen. Paced far slower here instead:
  // this fetch only runs once per FOOTBALL_UPCOMING_TTL_MS in the
  // background and nothing user-facing waits on it (served from its own
  // cache), so taking longer wall-clock time to finish costs nothing.
  for (let i = 0; i < 15; i++) {
    const data = await pulseScoreGetWithRetry<PulseScoreLeaguesResponse>(
      `/leagues?page=${page}&limit=30`,
    );
    if (!data) break; // out of retries — keep whatever was already collected
    if (Array.isArray(data.leagues)) leagues.push(...data.leagues);
    if (!data.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return leagues;
}

async function fetchFootballUpcoming(): Promise<PulseScorePrematchEvent[]> {
  try {
    const leagues = await fetchAllFootballLeagues();
    // live:true entries here never carry markets (see comment above) —
    // getPulseScoreFootballLive() already covers those; keep this prematch-only.
    return leagues.flatMap((l) => l.events ?? []).filter((ev) => !ev.live);
  } catch {
    return [];
  }
}

/** Upcoming football fixtures from PulseScore (bet365), each carrying its
 * MATCH_RESULT prematch odds when bet365 has priced it yet. Empty array if
 * PULSESCORE_API_KEY isn't configured or the upstream call fails. */
export async function getPulseScoreFootballUpcoming(): Promise<PulseScorePrematchEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < FOOTBALL_UPCOMING_TTL_MS)
    return upcomingCache.events;
  if (!upcomingInFlight) {
    upcomingInFlight = fetchFootballUpcoming()
      .then((events) => {
        upcomingCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}
