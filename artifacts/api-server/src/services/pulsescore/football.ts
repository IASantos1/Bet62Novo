// Football live odds from PulseScore, polled via REST (the WebSocket's one
// PRO-plan connection is dedicated to tennis instead — see tennisWs.ts).
// Same in-process cache + in-flight-dedup shape already used throughout
// matches.ts for other ~1s live polls (e.g. TENNIS_LIVE_V1_TTL).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
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
  try {
    // Response is a paginated wrapper ({ total, page, ..., events: [...] }),
    // not a bare array as the public docs' example showed — confirmed via a
    // real authenticated call. limit=200 comfortably covers real live-soccer
    // volume (18 events observed) in a single request within the 1 req/s
    // PRO-plan rate limit.
    const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
      "/live-events?sport=soccer&limit=200",
    );
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

/** Live football odds from PulseScore (bet365, normalized). Empty array if
 * PULSESCORE_API_KEY isn't configured yet or the upstream call fails. */
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
function extractFootballOverride(ev: PulseScoreEvent): PulseScoreFootballOverride {
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
 * minutes); not documented anywhere, so treat as best-effort. */
export function pulseScoreEventMinute(ev: PulseScoreEvent): number {
  const tm = Number(ev.moreInfo?.TM);
  return Number.isFinite(tm) && tm >= 0 ? Math.trunc(tm) : 0;
}
